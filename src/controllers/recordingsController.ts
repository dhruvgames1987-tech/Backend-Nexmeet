import { Request, Response } from 'express';
import { EgressClient } from 'livekit-server-sdk';
import { config } from '../config';
import { supabase } from '../supabaseClient';
import fs from 'fs';
import path from 'path';

// Define file type inline to work with or without @types/multer
interface UploadedFile {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
}

// Use type alias with Omit to avoid conflict with Express's built-in file type
type MulterRequest = Omit<Request, 'file'> & {
    file?: UploadedFile;
};

const egressClient = new EgressClient(
    config.livekit.wsUrl,
    config.livekit.apiKey,
    config.livekit.apiSecret
);

// Ensure recordings directory exists
const ensureRecordingsDir = () => {
    const recordingsPath = config.recordings.storagePath;
    if (!fs.existsSync(recordingsPath)) {
        fs.mkdirSync(recordingsPath, { recursive: true });
    }
    // Create subdirectories for different types
    const sessionDir = path.join(recordingsPath, 'sessions');
    const clipsDir = path.join(recordingsPath, 'clips');
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });
};

// Initialize directory on module load
ensureRecordingsDir();

/**
 * Upload a user audio clip (from mobile app client-side recording)
 */
export const uploadUserClip = async (req: MulterRequest, res: Response) => {
    const { username, roomName, duration } = req.body;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'Audio file is required' });
    }

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        // Get user ID from username
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

        if (userError || !userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + config.recordings.retentionDays);

        const timestamp = Date.now();
        const ext = path.extname(file.originalname) || '.m4a';
        const filename = `clip_${username}_${timestamp}${ext}`;
        const filePath = path.join(config.recordings.storagePath, 'clips', filename);

        // Move file to clips directory
        fs.renameSync(file.path, filePath);

        // Get file size
        const stats = fs.statSync(filePath);

        // Save to database
        const { data, error } = await supabase
            .from('recordings')
            .insert({
                room_name: roomName || 'unknown',
                file_url: `/recordings/clips/${filename}`,
                status: 'completed',
                recording_type: 'user_clip',
                user_id: userData.id,
                created_by: username,
                duration: parseInt(duration) || 0,
                file_size: stats.size,
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (error) throw error;

        return res.json({
            message: 'User clip uploaded successfully',
            recording: data
        });
    } catch (err) {
        console.error('Upload user clip error:', err);
        return res.status(500).json({ error: 'Failed to upload user clip' });
    }
};

/**
 * Get recordings for a specific user (their own clips)
 */
export const getUserRecordings = async (req: Request, res: Response) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        // Get user ID
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

        if (userError || !userData) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { data, error } = await supabase
            .from('recordings')
            .select('*')
            .eq('user_id', userData.id)
            .eq('recording_type', 'user_clip')
            .eq('status', 'completed')
            .order('started_at', { ascending: false });

        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Get user recordings error:', err);
        return res.status(500).json({ error: 'Failed to fetch user recordings' });
    }
};

/**
 * Get all session recordings (Admin only)
 * Supports optional filters: roomName, createdBy
 */
export const getSessionRecordings = async (req: Request, res: Response) => {
    const { roomName, createdBy } = req.query;

    try {
        let query = supabase
            .from('recordings')
            .select('*')
            .eq('recording_type', 'admin_session')
            .eq('status', 'completed')
            .order('started_at', { ascending: false });

        if (roomName) {
            query = query.eq('room_name', roomName);
        }

        if (createdBy) {
            query = query.eq('created_by', createdBy);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Get session recordings error:', err);
        return res.status(500).json({ error: 'Failed to fetch session recordings' });
    }
};

/**
 * Get all recordings for a specific user (their own clips + their session recordings)
 * This is used by the mobile app so each user only sees their own recordings
 */
export const getMyRecordings = async (req: Request, res: Response) => {
    const { username, roomName } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        let query = supabase
            .from('recordings')
            .select('*')
            .eq('created_by', username)
            .in('status', ['completed', 'recording'])
            // Hide the continuous parent recording — users only see sliced clips.
            .neq('recording_type', 'continuous_session')
            .order('started_at', { ascending: false });

        if (roomName) {
            query = query.eq('room_name', roomName);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Get my recordings error:', err);
        return res.status(500).json({ error: 'Failed to fetch recordings' });
    }
};

/**
 * Get all recordings (for backwards compatibility)
 */
export const getRecordings = async (req: Request, res: Response) => {
    const { roomName, type } = req.query;

    try {
        let query = supabase
            .from('recordings')
            .select('*')
            .eq('status', 'completed')
            // Hide the continuous parent recording — only sliced clips are listed.
            .neq('recording_type', 'continuous_session')
            .order('started_at', { ascending: false });

        if (roomName) {
            query = query.eq('room_name', roomName);
        }

        if (type) {
            query = query.eq('recording_type', type);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Get recordings error:', err);
        return res.status(500).json({ error: 'Failed to fetch recordings' });
    }
};

/**
 * Webhook handler for LiveKit egress events
 */
export const egressWebhook = async (req: Request, res: Response) => {
    const { event, egressInfo } = req.body;

    console.log('Egress webhook received:', event);

    if (event === 'egress_ended') {
        // Extract filename from egress info
        const fileUrl = egressInfo?.fileResults?.[0]?.filename || '';
        const duration = Math.floor((egressInfo?.endedAt - egressInfo?.startedAt) / 1000000000);

        // Update recording with final file URL and duration
        await supabase
            .from('recordings')
            .update({
                status: 'completed',
                file_url: `/recordings/sessions/${path.basename(fileUrl)}`,
                duration: duration,
                ended_at: new Date().toISOString()
            })
            .eq('egress_id', egressInfo.egressId);
    }

    return res.json({ received: true });
};

/**
 * Cleanup orphan recordings that are stuck in 'recording' status
 * This handles cases where the mobile app crashes or loses connectivity
 * Runs on startup and every 30 minutes
 */
export const cleanupOrphanRecordings = async () => {
    try {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: staleRecordings } = await supabase
            .from('recordings')
            .select('id, egress_id, started_at, room_name, created_by')
            .eq('status', 'recording')
            .lt('started_at', thirtyMinutesAgo);

        if (!staleRecordings || staleRecordings.length === 0) {
            return;
        }

        console.log(`[Cleanup] Found ${staleRecordings.length} stale recording(s) older than 30 minutes`);

        for (const rec of staleRecordings) {
            try {
                // Try to stop the egress gracefully
                await egressClient.stopEgress(rec.egress_id);
                console.log(`[Cleanup] Stopped stale egress: ${rec.egress_id} (room=${rec.room_name}, by=${rec.created_by})`);

                const endedAt = new Date();
                const startedAt = new Date(rec.started_at);
                const duration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

                await supabase
                    .from('recordings')
                    .update({
                        status: 'completed',
                        ended_at: endedAt.toISOString(),
                        duration: duration,
                    })
                    .eq('id', rec.id);
            } catch (stopErr) {
                // Egress already ended or doesn't exist — mark as failed
                console.log(`[Cleanup] Egress ${rec.egress_id} not found, marking as failed`);
                await supabase
                    .from('recordings')
                    .update({
                        status: 'failed',
                        ended_at: new Date().toISOString(),
                    })
                    .eq('id', rec.id);
            }
        }

        console.log(`[Cleanup] Finished processing ${staleRecordings.length} stale recording(s)`);
    } catch (err) {
        console.error('[Cleanup] Error during orphan recording cleanup:', err);
    }
};

// Run cleanup on module load (backend startup)
cleanupOrphanRecordings();

// Run cleanup every 30 minutes
setInterval(cleanupOrphanRecordings, 30 * 60 * 1000);

/**
 * Hard-delete a recording: unlink the file on disk AND remove the DB row.
 *
 * Auth:
 *   - Anyone can delete a recording they created (`row.created_by === username`).
 *   - `admin_session` recordings are considered admin-owned; if the caller is
 *     the admin who created them (matches `created_by`) they can delete.
 *   - Otherwise 403. Users cannot delete other users' clips.
 *
 * Body: { username: string }
 * Route param: :id — the Supabase `recordings.id` (uuid).
 */
export const deleteRecording = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { username } = req.body || {};

    if (!id) return res.status(400).json({ error: 'recording id is required' });
    if (!username) return res.status(400).json({ error: 'username is required' });

    try {
        // 1. Fetch row
        const { data: row, error: fetchErr } = await supabase
            .from('recordings')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!row) return res.status(404).json({ error: 'recording not found' });

        // 2. Ownership check. `created_by` is the identity that owns the row;
        //    a user can only delete their own clips, and an admin can only
        //    delete admin_session rows they themselves created.
        if (row.created_by !== username) {
            console.warn(
                `[deleteRecording] 403 for id=${id}: created_by=${row.created_by} != username=${username}`,
            );
            return res.status(403).json({ error: 'not the owner of this recording' });
        }

        // 3. Resolve on-disk path from stored file_url. `file_url` is stored
        //    as `/recordings/<subdir>/<filename>`; storagePath already points
        //    at the parent directory (e.g. `/app/recordings`), so strip the
        //    `/recordings` prefix and join.
        //    Fallback: if the URL is absolute (starts with http), we can't
        //    delete the file (was uploaded to external storage), but we still
        //    drop the DB row.
        let unlinked = false;
        let unlinkPath: string | null = null;
        if (row.file_url && typeof row.file_url === 'string' && !row.file_url.startsWith('http')) {
            // Strip a leading `/recordings/` if present; join to storagePath.
            const rel = row.file_url.replace(/^\/?recordings\//, '');
            unlinkPath = path.join(config.recordings.storagePath, rel);
            try {
                await fs.promises.unlink(unlinkPath);
                unlinked = true;
                console.log(`[deleteRecording] unlinked ${unlinkPath}`);
            } catch (fsErr: any) {
                // ENOENT = file already gone; treat as success. Anything else
                // we log but still proceed with the DB delete so the row
                // doesn't linger as an unusable ghost.
                if (fsErr?.code === 'ENOENT') {
                    console.log(`[deleteRecording] file already gone: ${unlinkPath}`);
                } else {
                    console.error(`[deleteRecording] unlink failed for ${unlinkPath}:`, fsErr);
                }
            }
        }

        // 4. Delete the DB row.
        const { error: delErr } = await supabase.from('recordings').delete().eq('id', id);
        if (delErr) throw delErr;

        return res.json({
            ok: true,
            id,
            unlinked,
            path: unlinkPath,
        });
    } catch (err) {
        console.error('[deleteRecording] error:', err);
        return res
            .status(500)
            .json({ error: 'Failed to delete recording', details: (err as Error).message });
    }
};
