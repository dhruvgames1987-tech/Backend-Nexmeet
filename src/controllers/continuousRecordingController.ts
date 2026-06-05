import { Request, Response } from 'express';
import { EgressClient, EncodedFileType } from 'livekit-server-sdk';
import { config } from '../config';
import { supabase } from '../supabaseClient';
import { sliceAudioClip } from '../utils/audioSlicer';
import { enqueueJob } from '../utils/jobQueue';
import fs from 'fs';
import path from 'path';

/**
 * Continuous room recording + per-clip slicing.
 *
 * One room-composite Egress runs for the whole room session, so push-to-talk is
 * instant (the client never waits on a recording to start). Each press records
 * a timestamp window; the moment the mic is released, that window is enqueued as
 * its OWN background job that slices it out of the (still-running) continuous
 * recording and inserts a clip row. So clips appear within seconds of release —
 * we do NOT wait for the whole session to end.
 *
 * Slicing a past window out of a live, still-growing OGG works because OGG is
 * page-streamed: the bytes for an already-spoken window are flushed to disk
 * shortly after. Each job waits a short flush delay, then ffmpeg stream-copies
 * the range. Jobs retry (via the queue) if the file/range isn't ready yet.
 *
 * Media-time alignment: clip offsets are computed against the Egress media t0
 * (EgressInfo.startedAt), captured asynchronously once the Egress goes ACTIVE.
 */

const egressClient = new EgressClient(
    config.livekit.wsUrl,
    config.livekit.apiKey,
    config.livekit.apiSecret,
);

const SESSIONS_DIR = 'sessions';
const CLIPS_DIR = 'clips';

// Padding on each side of a clip so packet-boundary trimming never clips speech.
const CLIP_PAD_SEC = 0.4;
// How long to let Egress flush a window's bytes to disk before slicing it.
const FLUSH_DELAY_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ClipWindow {
    username: string;
    startEpochMs: number;
    endEpochMs: number;
    recordingType: 'user_clip' | 'admin_session';
}

// One continuous recording per room, shared by everyone in it.
interface RoomRecording {
    egressId: string;
    recordingId: string | null;
    roomName: string;
    sourcePath: string;             // absolute backend path to the continuous .ogg
    requestEpochMs: number;         // fallback media t0 if Egress startedAt missing
    mediaStartEpochMs: number | null; // authoritative media t0 (from Egress)
    participants: Set<string>;
    stopping: boolean;
}

const activeByRoom = new Map<string, RoomRecording>();
const startingByRoom = new Map<string, Promise<RoomRecording | null>>();

/**
 * Poll the Egress until it is ACTIVE and capture its media start time (the
 * reference for converting press timestamps into file offsets). Runs in the
 * background; clip jobs read rec.mediaStartEpochMs once it's set.
 */
const captureMediaStart = async (rec: RoomRecording): Promise<void> => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !rec.stopping && rec.mediaStartEpochMs === null) {
        try {
            const list = await egressClient.listEgress(rec.roomName);
            const info = list.find((e) => e.egressId === rec.egressId);
            const startedAtNs = (info as any)?.startedAt;
            if (startedAtNs) {
                const ms = Number(startedAtNs) / 1_000_000;
                if (Number.isFinite(ms) && ms > 0) {
                    rec.mediaStartEpochMs = ms;
                    return;
                }
            }
        } catch {
            // transient — keep polling
        }
        await sleep(500);
    }
};

/**
 * Get the live recording for a room, starting one if needed. Deduplicated so
 * concurrent joins for the same room share a single Egress.
 */
const ensureRoomRecording = (roomName: string, username: string): Promise<RoomRecording | null> => {
    const existing = activeByRoom.get(roomName);
    if (existing && !existing.stopping) return Promise.resolve(existing);

    const inflight = startingByRoom.get(roomName);
    if (inflight) return inflight;

    const startPromise = (async (): Promise<RoomRecording | null> => {
        const timestamp = Date.now();
        const filename = `continuous_${roomName}_${timestamp}.ogg`;
        const egressFilePath = `/recordings/${SESSIONS_DIR}/${filename}`;

        const egressInfo = await egressClient.startRoomCompositeEgress(
            roomName,
            { file: { fileType: EncodedFileType.OGG, filepath: egressFilePath } },
            { audioOnly: true },
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + config.recordings.retentionDays);

        // Persist a parent row so orphan-cleanup can stop this Egress on restart.
        // Excluded from user-facing listings (recording_type 'continuous_session').
        let recordingId: string | null = null;
        try {
            const { data } = await supabase
                .from('recordings')
                .insert({
                    room_name: roomName,
                    egress_id: egressInfo.egressId,
                    file_url: `/recordings/${SESSIONS_DIR}/${filename}`,
                    status: 'recording',
                    recording_type: 'continuous_session',
                    created_by: username,
                    started_at: new Date().toISOString(),
                    expires_at: expiresAt.toISOString(),
                })
                .select()
                .single();
            recordingId = data?.id ?? null;
        } catch (e) {
            console.warn('[ContinuousRecording] could not persist parent row:', e);
        }

        const rec: RoomRecording = {
            egressId: egressInfo.egressId!,
            recordingId,
            roomName,
            sourcePath: path.join(config.recordings.storagePath, SESSIONS_DIR, filename),
            requestEpochMs: timestamp,
            mediaStartEpochMs: null,
            participants: new Set<string>(),
            stopping: false,
        };
        activeByRoom.set(roomName, rec);
        void captureMediaStart(rec);
        console.log(`[ContinuousRecording] started room=${roomName} egress=${rec.egressId} file=${filename}`);
        return rec;
    })()
        .catch((err) => {
            console.error('[ContinuousRecording] ensureRoomRecording error:', err);
            return null;
        })
        .finally(() => {
            startingByRoom.delete(roomName);
        });

    startingByRoom.set(roomName, startPromise);
    return startPromise;
};

/**
 * Start (or join) the continuous recording for a room. Called once per client
 * on connect. Idempotent per user.
 */
export const startContinuousRecording = async (req: Request, res: Response) => {
    const { roomName, username } = req.body;
    if (!roomName || !username) {
        return res.status(400).json({ error: 'roomName and username are required' });
    }

    try {
        const rec = await ensureRoomRecording(roomName, username);
        if (!rec) {
            return res.status(500).json({ error: 'Failed to start continuous recording' });
        }
        rec.participants.add(username);
        return res.json({
            message: 'Continuous recording active',
            recordingId: rec.recordingId,
            egressId: rec.egressId,
        });
    } catch (err) {
        console.error('[ContinuousRecording] start error:', err);
        return res.status(500).json({ error: 'Failed to start continuous recording' });
    }
};

/**
 * Mark a finished push-to-talk window. Enqueues a background job that slices
 * just this window into a clip — so it lands within seconds of release, while
 * the room keeps recording. Returns immediately.
 */
export const markClip = async (req: Request, res: Response) => {
    const { roomName, username, startEpochMs, endEpochMs, recordingType } = req.body;
    if (!roomName || !username || !startEpochMs || !endEpochMs) {
        return res.status(400).json({ error: 'roomName, username, startEpochMs and endEpochMs are required' });
    }

    const rec = activeByRoom.get(roomName);
    if (!rec) {
        return res.json({ ok: false, reason: 'no active recording' });
    }
    if (Number(endEpochMs) <= Number(startEpochMs)) {
        return res.json({ ok: false, reason: 'empty clip' });
    }

    const clip: ClipWindow = {
        username,
        startEpochMs: Number(startEpochMs),
        endEpochMs: Number(endEpochMs),
        recordingType: recordingType === 'admin_session' ? 'admin_session' : 'user_clip',
    };

    enqueueJob(`slice-clip:${username}:${clip.startEpochMs}`, () => sliceOneClip(rec, clip));
    return res.json({ ok: true });
};

/**
 * Slice one clip window out of the continuous recording and insert its row.
 * Throws on a not-ready file/range so the job queue retries it.
 */
const sliceOneClip = async (rec: RoomRecording, clip: ClipWindow): Promise<void> => {
    // Let Egress flush this window's bytes to disk.
    const remaining = FLUSH_DELAY_MS - (Date.now() - clip.endEpochMs);
    if (remaining > 0) await sleep(remaining);

    // Resolve media t0 (wait briefly if the ACTIVE capture hasn't completed).
    let mediaStart = rec.mediaStartEpochMs;
    if (mediaStart === null) {
        const dl = Date.now() + 5000;
        while (rec.mediaStartEpochMs === null && Date.now() < dl) await sleep(500);
        mediaStart = rec.mediaStartEpochMs ?? rec.requestEpochMs;
    }

    if (!fs.existsSync(rec.sourcePath) || fs.statSync(rec.sourcePath).size === 0) {
        throw new Error(`source recording not ready: ${rec.sourcePath}`);
    }

    const startSec = Math.max(0, (clip.startEpochMs - mediaStart) / 1000 - CLIP_PAD_SEC);
    const endSec = (clip.endEpochMs - mediaStart) / 1000 + CLIP_PAD_SEC;
    const durationSec = Math.max(0.2, endSec - startSec);

    const clipName = `clip_${clip.username}_${clip.startEpochMs}.ogg`;
    const clipPath = path.join(config.recordings.storagePath, CLIPS_DIR, clipName);

    await sliceAudioClip(rec.sourcePath, clipPath, startSec, durationSec);

    const stats = fs.existsSync(clipPath) ? fs.statSync(clipPath) : null;
    if (!stats || stats.size === 0) {
        throw new Error(`slice produced empty clip for ${clip.username}`);
    }

    const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('username', clip.username)
        .single();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.recordings.retentionDays);

    await supabase.from('recordings').insert({
        room_name: rec.roomName,
        file_url: `/recordings/${CLIPS_DIR}/${clipName}`,
        status: 'completed',
        recording_type: clip.recordingType,
        user_id: userData?.id ?? null,
        created_by: clip.username,
        duration: Math.round((clip.endEpochMs - clip.startEpochMs) / 1000),
        file_size: stats.size,
        started_at: new Date(clip.startEpochMs).toISOString(),
        ended_at: new Date(clip.endEpochMs).toISOString(),
        expires_at: expiresAt.toISOString(),
    });

    console.log(
        `[ContinuousRecording] sliced ${clipName} [${startSec.toFixed(2)}s +${durationSec.toFixed(2)}s]`,
    );
};

/**
 * A client left. When the room empties, stop the Egress (in the background) and
 * complete the parent row. Per-clip jobs were already enqueued on each release.
 */
export const stopContinuousRecording = async (req: Request, res: Response) => {
    const { roomName, username } = req.body;
    if (!roomName) {
        return res.status(400).json({ error: 'roomName is required' });
    }

    const rec = activeByRoom.get(roomName);
    if (!rec) {
        return res.json({ message: 'No active continuous recording' });
    }

    if (username) rec.participants.delete(username);

    if (rec.participants.size > 0) {
        return res.json({ message: 'Continuous recording kept alive', remaining: rec.participants.size });
    }

    rec.stopping = true;
    activeByRoom.delete(roomName);
    res.json({ message: 'Continuous recording stopping' });

    enqueueJob(`stop-recording:${roomName}`, async () => {
        try {
            await egressClient.stopEgress(rec.egressId);
        } catch (err) {
            console.warn(`[ContinuousRecording] stopEgress failed for ${rec.egressId}:`, err);
        }
        if (rec.recordingId) {
            await supabase
                .from('recordings')
                .update({ status: 'completed', ended_at: new Date().toISOString() })
                .eq('id', rec.recordingId);
        }
        console.log(`[ContinuousRecording] room=${rec.roomName} stopped`);
    });
};
