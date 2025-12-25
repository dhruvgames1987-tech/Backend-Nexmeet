import { Request, Response } from 'express';
import { EgressClient, EncodedFileOutput, EncodedFileType } from 'livekit-server-sdk';
import { config } from '../config';
import { supabase } from '../supabaseClient';

const egressClient = new EgressClient(
    config.livekit.wsUrl,
    config.livekit.apiKey,
    config.livekit.apiSecret
);

// Start recording a room
export const startRecording = async (req: Request, res: Response) => {
    const { roomName, username } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        // Configure output - saves to S3 or local storage
        const fileOutput: EncodedFileOutput = {
            fileType: EncodedFileType.MP4,
            filepath: `recordings/${roomName}/${Date.now()}.mp4`,
            // For S3:
            // s3: {
            //     accessKey: process.env.S3_ACCESS_KEY,
            //     secret: process.env.S3_SECRET,
            //     bucket: process.env.S3_BUCKET,
            //     region: process.env.S3_REGION,
            // }
        };

        // Start room composite egress (records all audio/video in room)
        const egressInfo = await egressClient.startRoomCompositeEgress(
            roomName,
            { file: fileOutput },
            {
                audioOnly: true, // For walkie-talkie, we only need audio
            }
        );

        // Save to database
        const { data, error } = await supabase
            .from('recordings')
            .insert({
                room_name: roomName,
                egress_id: egressInfo.egressId,
                status: 'recording',
                created_by: username
            })
            .select()
            .single();

        if (error) throw error;

        return res.json({
            message: 'Recording started',
            egressId: egressInfo.egressId,
            recording: data
        });
    } catch (err) {
        console.error('Start recording error:', err);
        return res.status(500).json({ error: 'Failed to start recording' });
    }
};

// Stop a recording
export const stopRecording = async (req: Request, res: Response) => {
    const { egressId } = req.body;

    if (!egressId) {
        return res.status(400).json({ error: 'Egress ID is required' });
    }

    try {
        const egressInfo = await egressClient.stopEgress(egressId);

        // Update database
        await supabase
            .from('recordings')
            .update({
                status: 'completed',
                ended_at: new Date().toISOString(),
                // file_url would be updated via webhook when file is ready
            })
            .eq('egress_id', egressId);

        return res.json({ message: 'Recording stopped', egressInfo });
    } catch (err) {
        console.error('Stop recording error:', err);
        return res.status(500).json({ error: 'Failed to stop recording' });
    }
};

// Get all recordings (optionally filter by room)
export const getRecordings = async (req: Request, res: Response) => {
    const { roomName } = req.query;

    try {
        let query = supabase
            .from('recordings')
            .select('*')
            .eq('status', 'completed')
            .order('started_at', { ascending: false });

        if (roomName) {
            query = query.eq('room_name', roomName);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Get recordings error:', err);
        return res.status(500).json({ error: 'Failed to fetch recordings' });
    }
};

// Webhook handler for LiveKit egress events
export const egressWebhook = async (req: Request, res: Response) => {
    // LiveKit sends webhook when egress completes
    const { event, egressInfo } = req.body;

    console.log('Egress webhook received:', event);

    if (event === 'egress_ended') {
        // Update recording with final file URL
        const fileUrl = egressInfo?.fileResults?.[0]?.location || '';
        const duration = Math.floor((egressInfo?.updatedAt - egressInfo?.startedAt) / 1000000000);

        await supabase
            .from('recordings')
            .update({
                status: 'completed',
                file_url: fileUrl,
                duration: duration,
                ended_at: new Date().toISOString()
            })
            .eq('egress_id', egressInfo.egressId);
    }

    return res.json({ received: true });
};
