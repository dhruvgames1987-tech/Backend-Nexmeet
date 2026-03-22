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

/**
 * Start private 1-1 voice between admin and a target user.
 * Uses LiveKit's updateSubscriptions() to unsubscribe all other participants
 * from both the admin's and target user's audio tracks.
 * Other participants cannot hear the private conversation.
 */
export const startPrivateVoice = async (req: Request, res: Response) => {
    const { roomName, adminUsername, targetUsername } = req.body;

    if (!roomName || !adminUsername || !targetUsername) {
        return res.status(400).json({ error: 'roomName, adminUsername, and targetUsername are required' });
    }

    try {
        const participants = await roomService.listParticipants(roomName);
        console.log(`[PrivateVoice] Starting private 1-1: admin=${adminUsername} <-> user=${targetUsername} in room=${roomName}`);

        // Collect audio track SIDs for admin and target user
        const adminTrackSids: string[] = [];
        const targetTrackSids: string[] = [];

        for (const p of participants) {
            if (p.identity === adminUsername) {
                for (const track of p.tracks) {
                    if (track.type === 1) { // 1 = AUDIO
                        adminTrackSids.push(track.sid);
                    }
                }
            } else if (p.identity === targetUsername) {
                for (const track of p.tracks) {
                    if (track.type === 1) {
                        targetTrackSids.push(track.sid);
                    }
                }
            }
        }

        console.log(`[PrivateVoice] Admin tracks: ${adminTrackSids.length}, Target tracks: ${targetTrackSids.length}`);

        // For every OTHER participant (not admin, not target):
        // Unsubscribe them from admin's and target's audio tracks
        let isolatedCount = 0;
        for (const p of participants) {
            if (p.identity === adminUsername || p.identity === targetUsername) {
                continue; // Skip admin and target — they should hear each other
            }

            try {
                // Unsubscribe this participant from admin's audio tracks
                if (adminTrackSids.length > 0) {
                    await roomService.updateSubscriptions(roomName, p.identity, adminTrackSids, false);
                }
                // Unsubscribe this participant from target user's audio tracks
                if (targetTrackSids.length > 0) {
                    await roomService.updateSubscriptions(roomName, p.identity, targetTrackSids, false);
                }
                isolatedCount++;
                console.log(`[PrivateVoice] Isolated participant: ${p.identity}`);
            } catch (subErr) {
                console.error(`[PrivateVoice] Failed to isolate ${p.identity}:`, subErr);
            }
        }

        return res.json({
            message: 'Private voice started',
            admin: adminUsername,
            target: targetUsername,
            isolatedParticipants: isolatedCount,
            adminTracks: adminTrackSids.length,
            targetTracks: targetTrackSids.length,
        });
    } catch (err) {
        console.error('[PrivateVoice] Start error:', err);
        return res.status(500).json({ error: 'Failed to start private voice', details: (err as Error).message });
    }
};

/**
 * Stop private 1-1 voice — re-subscribe ALL participants to ALL audio tracks.
 * This restores normal broadcast mode.
 */
export const stopPrivateVoice = async (req: Request, res: Response) => {
    const { roomName, adminUsername } = req.body;

    if (!roomName) {
        return res.status(400).json({ error: 'roomName is required' });
    }

    try {
        const participants = await roomService.listParticipants(roomName);
        console.log(`[PrivateVoice] Stopping private voice in room=${roomName}`);

        // Collect ALL audio track SIDs in the room
        const allAudioTrackSids: string[] = [];
        for (const p of participants) {
            for (const track of p.tracks) {
                if (track.type === 1) { // AUDIO
                    allAudioTrackSids.push(track.sid);
                }
            }
        }

        console.log(`[PrivateVoice] Re-subscribing all participants to ${allAudioTrackSids.length} audio tracks`);

        // Re-subscribe every participant to all audio tracks
        let restoredCount = 0;
        for (const p of participants) {
            try {
                if (allAudioTrackSids.length > 0) {
                    await roomService.updateSubscriptions(roomName, p.identity, allAudioTrackSids, true);
                }
                restoredCount++;
            } catch (subErr) {
                console.error(`[PrivateVoice] Failed to restore ${p.identity}:`, subErr);
            }
        }

        return res.json({
            message: 'Private voice stopped, broadcast restored',
            restoredParticipants: restoredCount,
        });
    } catch (err) {
        console.error('[PrivateVoice] Stop error:', err);
        return res.status(500).json({ error: 'Failed to stop private voice', details: (err as Error).message });
    }
};
