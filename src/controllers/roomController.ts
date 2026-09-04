import { Request, Response } from 'express';
import {
    AccessToken,
    RoomServiceClient,
    TrackType,
    ParticipantInfo,
} from 'livekit-server-sdk';
import { config } from '../config';
import { supabase } from '../supabaseClient';

const roomService = new RoomServiceClient(config.livekit.wsUrl, config.livekit.apiKey, config.livekit.apiSecret);

import { createLiveKitToken } from '../utils/livekit';

// ==========================================
// PRIVATE 1-1 VOICE STATE
// ==========================================
// In-memory record of which rooms are currently in 1-1 mode, and which
// non-admin/non-target participants had their canSubscribe flipped off.
// Kept per-room so /stop can restore exactly what /start touched, and so
// /reapply can isolate new joiners while the mode is active.
//
// Process-local: on backend restart this is lost, but whatever LK stored
// server-side persists until we push another updateParticipant. Admin can
// call /stop from the UI to force-restore.
type PrivateVoiceState = {
    admin: string;
    target: string;
    // Identities whose canSubscribe was flipped to false by /start (or /reapply).
    isolated: Set<string>;
    // Preserved canPublish per isolated identity so /stop doesn't accidentally
    // regrant publish to someone who had been separately mute-all'd earlier.
    publishBefore: Map<string, boolean>;
};

const activePrivateVoiceByRoom = new Map<string, PrivateVoiceState>();

/**
 * Skip these participants from 1-1 isolation regardless of admin/target
 * status:
 *  - LK Egress recorders (permission.recorder === true, or hidden === true)
 *  - Custom recorder identities we spawn (admin-monitor-*)
 *  - Any LK Egress-style default identity (EG_*)
 * Keeps the continuous room recording capturing admin + target audio during
 * private mode.
 */
const isRecorder = (p: ParticipantInfo): boolean => {
    if (p.permission?.recorder === true) return true;
    if (p.permission?.hidden === true) return true;
    const id = p.identity || '';
    if (id.startsWith('admin-monitor-')) return true;
    if (id.startsWith('EG_')) return true;
    return false;
};

// Apply `canSubscribe: false` to a single participant, remembering their
// current canPublish so `/stop` restores precisely.
const isolateOne = async (
    roomName: string,
    p: ParticipantInfo,
    state: PrivateVoiceState,
): Promise<boolean> => {
    if (state.isolated.has(p.identity)) return false;
    const canPublish = p.permission?.canPublish ?? true;
    try {
        await roomService.updateParticipant(roomName, p.identity, undefined, {
            canPublish,
            canSubscribe: false,
            canPublishData: true,
        });
        state.isolated.add(p.identity);
        state.publishBefore.set(p.identity, canPublish);
        return true;
    } catch (err) {
        console.error(`[PrivateVoice] Failed to isolate ${p.identity}:`, err);
        return false;
    }
};

// Restore an isolated participant's canSubscribe = true while preserving
// original canPublish. Best-effort: on failure we still clean up state so a
// stuck LK call can't wedge subsequent /stop calls forever.
const restoreOne = async (
    roomName: string,
    identity: string,
    state: PrivateVoiceState,
): Promise<boolean> => {
    const canPublish = state.publishBefore.get(identity) ?? true;
    try {
        await roomService.updateParticipant(roomName, identity, undefined, {
            canPublish,
            canSubscribe: true,
            canPublishData: true,
        });
        return true;
    } catch (err) {
        console.error(`[PrivateVoice] Failed to restore ${identity}:`, err);
        return false;
    } finally {
        state.isolated.delete(identity);
        state.publishBefore.delete(identity);
    }
};

export const generateToken = async (req: Request, res: Response) => {
    const { roomName, username } = req.body;

    if (!roomName || !username) {
        return res.status(400).json({ error: 'Room name and Username are required' });
    }

    try {
        const token = await createLiveKitToken(username, roomName);
        return res.json({ token });
    } catch (err) {
        console.error('Token generation error:', err);
        return res.status(500).json({ error: 'Failed to generate token' });
    }
};

export const muteAllParticipants = async (req: Request, res: Response) => {
    const { roomName, adminUsername } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        const participants = await roomService.listParticipants(roomName);
        console.log(`Muting ${participants.length} participants in room: ${roomName} (skipping admin: ${adminUsername})`);

        for (const p of participants) {
            // Skip admin so their mic keeps working
            if (adminUsername && p.identity === adminUsername) {
                console.log(`Skipping admin: ${p.identity}`);
                continue;
            }
            try {
                // Update participant permissions to disallow publishing audio
                await roomService.updateParticipant(roomName, p.identity, undefined, {
                    canPublish: false,
                    canSubscribe: true,
                    canPublishData: true,
                });
                console.log(`Muted participant ${p.identity} via permissions`);

                // Also mute any currently active audio tracks.
                // TrackType.AUDIO === 0 in livekit-server-sdk 1.2.7
                // (see proto/livekit_models.d.ts). The earlier `track.type === 1`
                // check was matching VIDEO, so this loop was previously a
                // silent no-op on audio.
                for (const track of p.tracks) {
                    if (track.type === TrackType.AUDIO) {
                        try {
                            await roomService.mutePublishedTrack(roomName, p.identity, track.sid, true);
                        } catch (trackErr) {
                            console.error(`Failed to mute track ${track.sid}:`, trackErr);
                        }
                    }
                }
            } catch (participantErr) {
                console.error(`Failed to mute participant ${p.identity}:`, participantErr);
            }
        }

        return res.json({ message: 'All participants muted', count: participants.length });
    } catch (err) {
        console.error('Mute all error:', err);
        return res.status(500).json({ error: 'Failed to mute all participants', details: (err as Error).message });
    }
};

export const unmuteAllParticipants = async (req: Request, res: Response) => {
    const { roomName, adminUsername } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        const participants = await roomService.listParticipants(roomName);
        console.log(`Unmuting ${participants.length} participants in room: ${roomName} (skipping admin: ${adminUsername})`);

        for (const p of participants) {
            // Skip admin
            if (adminUsername && p.identity === adminUsername) {
                console.log(`Skipping admin: ${p.identity}`);
                continue;
            }
            try {
                // Update participant permissions to allow publishing audio
                await roomService.updateParticipant(roomName, p.identity, undefined, {
                    canPublish: true,
                    canSubscribe: true,
                    canPublishData: true,
                });
                console.log(`Unmuted participant ${p.identity} via permissions`);

                // Also unmute any currently muted audio tracks (same enum fix).
                for (const track of p.tracks) {
                    if (track.type === TrackType.AUDIO) {
                        try {
                            await roomService.mutePublishedTrack(roomName, p.identity, track.sid, false);
                        } catch (trackErr) {
                            console.error(`Failed to unmute track ${track.sid}:`, trackErr);
                        }
                    }
                }
            } catch (participantErr) {
                console.error(`Failed to unmute participant ${p.identity}:`, participantErr);
            }
        }

        return res.json({ message: 'All participants unmuted', count: participants.length });
    } catch (err) {
        console.error('Unmute all error:', err);
        return res.status(500).json({ error: 'Failed to unmute all participants', details: (err as Error).message });
    }
};

export const logoutAllParticipants = async (req: Request, res: Response) => {
    const { roomName } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        // Clean up any active 1-1 state for this room before nuking participants.
        // Bookkeeping only — participants + their permissions vanish in the next
        // step anyway, but we keep the in-memory map tidy.
        activePrivateVoiceByRoom.delete(roomName);

        // 1. Remove from LiveKit
        const participants = await roomService.listParticipants(roomName);
        console.log(`Logging out ${participants.length} participants from room: ${roomName}`);

        for (const p of participants) {
            await roomService.removeParticipant(roomName, p.identity);
        }

        // 2. Get the room ID from database
        const { data: roomData, error: roomError } = await supabase
            .from('rooms')
            .select('id')
            .eq('name', roomName)
            .single();

        if (roomData && !roomError) {
            // 3. Update all non-admin users in this room to force_logout
            const { error: updateError } = await supabase
                .from('users')
                .update({ status: 'force_logout', is_online: false })
                .eq('current_room_id', roomData.id)
                .neq('role', 'admin');

            if (updateError) {
                console.error('Error updating user status:', updateError);
            } else {
                console.log(`Updated database status for users in room ${roomName}`);
            }
        }

        return res.json({ message: 'All participants logged out', count: participants.length });
    } catch (err) {
        console.error('Logout all error:', err);
        return res.status(500).json({ error: 'Failed to logout all participants' });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    const { roomName, identity } = req.body;

    if (!roomName || !identity) {
        return res.status(400).json({ error: 'Room name and Identity are required' });
    }

    try {
        await roomService.removeParticipant(roomName, identity);
        return res.json({ message: `User ${identity} logged out` });
    } catch (err) {
        console.error('Logout user error:', err);
        return res.status(500).json({ error: 'Failed to logout user' });
    }
};

/**
 * Start private 1-1 voice between admin and a target user.
 *
 * Isolation mechanism: participant-level `canSubscribe: false` on every OTHER
 * participant (not admin, not target, not a recorder/hidden bot). Applies to
 * every current AND future track flowing to those participants, so a new
 * mic track published mid-session (admin toggles mic, target PTT) is
 * automatically filtered. Pure SFU ACL — no media renegotiation, no impact
 * on the publish path or audio quality.
 *
 * Idempotent-ish: switching target while active is supported (restores the
 * prior isolation first, then applies the new one).
 */
export const startPrivateVoice = async (req: Request, res: Response) => {
    const { roomName, adminUsername, targetUsername } = req.body;

    if (!roomName || !adminUsername || !targetUsername) {
        return res.status(400).json({ error: 'roomName, adminUsername, and targetUsername are required' });
    }

    try {
        console.log(`[PrivateVoice] Start: admin=${adminUsername} <-> target=${targetUsername} room=${roomName}`);

        // Handle "admin switches target" — restore prior isolation first so
        // the old target regains subscribe for everyone.
        const existing = activePrivateVoiceByRoom.get(roomName);
        if (existing) {
            console.log(`[PrivateVoice] Existing state found (target=${existing.target}); restoring before switching`);
            for (const id of Array.from(existing.isolated)) {
                await restoreOne(roomName, id, existing);
            }
            activePrivateVoiceByRoom.delete(roomName);
        }

        const participants = await roomService.listParticipants(roomName);

        const state: PrivateVoiceState = {
            admin: adminUsername,
            target: targetUsername,
            isolated: new Set<string>(),
            publishBefore: new Map<string, boolean>(),
        };

        let isolatedCount = 0;
        for (const p of participants) {
            if (p.identity === adminUsername || p.identity === targetUsername) continue;
            if (isRecorder(p)) {
                console.log(`[PrivateVoice] Skipping recorder/hidden: ${p.identity}`);
                continue;
            }
            const ok = await isolateOne(roomName, p, state);
            if (ok) {
                isolatedCount++;
                console.log(`[PrivateVoice] Isolated ${p.identity} (canSubscribe=false)`);
            }
        }

        activePrivateVoiceByRoom.set(roomName, state);

        return res.json({
            message: 'Private voice started',
            admin: adminUsername,
            target: targetUsername,
            isolatedParticipants: isolatedCount,
        });
    } catch (err) {
        console.error('[PrivateVoice] Start error:', err);
        return res.status(500).json({ error: 'Failed to start private voice', details: (err as Error).message });
    }
};

/**
 * Stop private 1-1 voice — restore `canSubscribe: true` on every participant
 * that was isolated. Preserves their original `canPublish` so we don't
 * accidentally unmute someone who had been mute-all'd separately.
 */
export const stopPrivateVoice = async (req: Request, res: Response) => {
    const { roomName } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'roomName is required' });
    }

    try {
        const state = activePrivateVoiceByRoom.get(roomName);
        if (!state) {
            console.log(`[PrivateVoice] Stop: no active state for room=${roomName}`);
            return res.json({ message: 'No active private voice', restoredParticipants: 0 });
        }

        console.log(`[PrivateVoice] Stop: restoring ${state.isolated.size} participant(s) in room=${roomName}`);

        let restoredCount = 0;
        for (const id of Array.from(state.isolated)) {
            const ok = await restoreOne(roomName, id, state);
            if (ok) restoredCount++;
        }

        activePrivateVoiceByRoom.delete(roomName);

        return res.json({
            message: 'Private voice stopped, broadcast restored',
            restoredParticipants: restoredCount,
        });
    } catch (err) {
        console.error('[PrivateVoice] Stop error:', err);
        return res.status(500).json({ error: 'Failed to stop private voice', details: (err as Error).message });
    }
};

/**
 * Idempotent: called by the admin client whenever a new participant joins
 * a room that has active 1-1 mode. Applies `canSubscribe: false` to any
 * newcomer that isn't admin/target/recorder. No-op if the room has no
 * active state.
 *
 * Safe to hammer — reads current state, only touches identities not already
 * isolated. Cost is one `listParticipants` per call.
 */
export const reapplyPrivateVoice = async (req: Request, res: Response) => {
    const { roomName } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'roomName is required' });
    }

    const state = activePrivateVoiceByRoom.get(roomName);
    if (!state) {
        return res.json({ message: 'No active private voice', addedIsolations: 0 });
    }

    try {
        const participants = await roomService.listParticipants(roomName);

        let added = 0;
        for (const p of participants) {
            if (p.identity === state.admin || p.identity === state.target) continue;
            if (state.isolated.has(p.identity)) continue;
            if (isRecorder(p)) continue;

            const ok = await isolateOne(roomName, p, state);
            if (ok) {
                added++;
                console.log(`[PrivateVoice] Reapply: isolated newcomer ${p.identity}`);
            }
        }

        return res.json({
            message: 'Reapply complete',
            admin: state.admin,
            target: state.target,
            addedIsolations: added,
            totalIsolated: state.isolated.size,
        });
    } catch (err) {
        console.error('[PrivateVoice] Reapply error:', err);
        return res.status(500).json({ error: 'Failed to reapply private voice', details: (err as Error).message });
    }
};

// Suppress unused-import warning for AccessToken re-export path (kept for
// legacy callers that may still import it from this module).
export { AccessToken };
