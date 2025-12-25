import { Request, Response } from 'express';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../config';
import { supabase } from '../supabaseClient';

const roomService = new RoomServiceClient(config.livekit.wsUrl, config.livekit.apiKey, config.livekit.apiSecret);

import { createLiveKitToken } from '../utils/livekit';

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
    const { roomName } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        const participants = await roomService.listParticipants(roomName);
        console.log(`Muting ${participants.length} participants in room: ${roomName}`);

        for (const p of participants) {
            try {
                // Update participant permissions to disallow publishing audio
                await roomService.updateParticipant(roomName, p.identity, undefined, {
                    canPublish: false,
                    canSubscribe: true,
                    canPublishData: true,
                });
                console.log(`Muted participant ${p.identity} via permissions`);

                // Also mute any currently active tracks
                for (const track of p.tracks) {
                    if (track.type === 1) { // 1 = AUDIO
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
    const { roomName } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    try {
        const participants = await roomService.listParticipants(roomName);
        console.log(`Unmuting ${participants.length} participants in room: ${roomName}`);

        for (const p of participants) {
            try {
                // Update participant permissions to allow publishing audio
                await roomService.updateParticipant(roomName, p.identity, undefined, {
                    canPublish: true,
                    canSubscribe: true,
                    canPublishData: true,
                });
                console.log(`Unmuted participant ${p.identity} via permissions`);

                // Also unmute any currently muted tracks
                for (const track of p.tracks) {
                    if (track.type === 1) { // 1 = AUDIO
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
