import { Request, Response } from 'express';
import { EgressClient, EncodedFileOutput, EncodedFileType, DirectFileOutput } from 'livekit-server-sdk';
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
 * Start recording an entire room session (Admin only)
 * Uses LiveKit Egress for server-side composite recording
 */
export const startSessionRecording = async (req: Request, res: Response) => {
    const { roomName, username } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + config.recordings.retentionDays);

        const timestamp = Date.now();
        const filename = `session_${roomName}_${timestamp}.ogg`;

        // Egress saves to this path inside the egress container.
        // This path should be a Docker volume shared with the backend container
        // so it maps to /app/recordings/sessions/<filename> on the backend
        const egressFilePath = `/recordings/sessions/${filename}`;

        // Start room composite egress (records all audio in room)
        const egressInfo = await egressClient.startRoomCompositeEgress(
            roomName,
            { file: { fileType: EncodedFileType.OGG, filepath: egressFilePath } },
            {
                audioOnly: true,
            }
        );

        // The URL that the backend will serve this file at
        const fileUrl = `/recordings/sessions/${filename}`;

        // Save to database - include the expected file_url immediately
        const { data, error } = await supabase
            .from('recordings')
            .insert({
                room_name: roomName,
                egress_id: egressInfo.egressId,
                file_url: fileUrl,
                status: 'recording',
                recording_type: 'admin_session',
                created_by: username,
                started_at: new Date().toISOString(),
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (error) throw error;

        console.log(`Recording started: egress=${egressInfo.egressId}, file=${egressFilePath}`);

        return res.json({
            message: 'Session recording started',
            egressId: egressInfo.egressId,
            recording: data
        });
    } catch (err) {
        console.error('Start session recording error:', err);
        return res.status(500).json({ error: 'Failed to start session recording' });
    }
};

/**
 * Stop a session recording
 */
export const stopSessionRecording = async (req: Request, res: Response) => {
    const { egressId } = req.body;

    if (!egressId) {
        return res.status(400).json({ error: 'Egress ID is required' });
    }

    try {
        const egressInfo = await egressClient.stopEgress(egressId);

        // First, get the recording to calculate duration and file info
        const { data: existingRecording } = await supabase
            .from('recordings')
            .select('started_at, room_name, file_url')
            .eq('egress_id', egressId)
            .single();

        const endedAt = new Date();
        let duration = 0;

        if (existingRecording?.started_at) {
            const startedAt = new Date(existingRecording.started_at);
            duration = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
        }

        // Try to get the file URL from the egress response
        let fileUrl = existingRecording?.file_url || null;
        try {
            // The egress info contains file results after stopping
            const fileResults = (egressInfo as any)?.fileResults || (egressInfo as any)?.file?.filename;
            if (fileResults) {
                const egressFilename = typeof fileResults === 'string'
                    ? path.basename(fileResults)
                    : path.basename(fileResults[0]?.filename || '');
                if (egressFilename) {
                    fileUrl = `/recordings/sessions/${egressFilename}`;
                }
            }
        } catch (e) {
            console.log('Could not extract filename from egress info, using pre-saved URL');
        }

        // Update database with duration and file URL
        await supabase
            .from('recordings')
            .update({
                status: 'completed',
                ended_at: endedAt.toISOString(),
                duration: duration,
                file_url: fileUrl,
            })
            .eq('egress_id', egressId);

        console.log(`Recording stopped: egress=${egressId}, duration=${duration}s, file_url=${fileUrl}`);

        return res.json({ message: 'Session recording stopped', duration, fileUrl, egressInfo });
    } catch (err) {
        console.error('Stop session recording error:', err);
        return res.status(500).json({ error: 'Failed to stop session recording' });
    }
};

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
 */
export const getSessionRecordings = async (req: Request, res: Response) => {
    const { roomName } = req.query;

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

        const { data, error } = await query;

        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Get session recordings error:', err);
        return res.status(500).json({ error: 'Failed to fetch session recordings' });
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
 * Legacy: Start recording (keeping for backwards compatibility)
 */
export const startRecording = startSessionRecording;

/**
 * Legacy: Stop recording (keeping for backwards compatibility)
 */
export const stopRecording = stopSessionRecording;

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
