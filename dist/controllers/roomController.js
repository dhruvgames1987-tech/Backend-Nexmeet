"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutUser = exports.logoutAllParticipants = exports.unmuteAllParticipants = exports.muteAllParticipants = exports.generateToken = void 0;
const livekit_server_sdk_1 = require("livekit-server-sdk");
const config_1 = require("../config");
const supabaseClient_1 = require("../supabaseClient");
const roomService = new livekit_server_sdk_1.RoomServiceClient(config_1.config.livekit.wsUrl, config_1.config.livekit.apiKey, config_1.config.livekit.apiSecret);
const livekit_1 = require("../utils/livekit");
const generateToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomName, username } = req.body;
    if (!roomName || !username) {
        return res.status(400).json({ error: 'Room name and Username are required' });
    }
    try {
        const token = yield (0, livekit_1.createLiveKitToken)(username, roomName);
        return res.json({ token });
    }
    catch (err) {
        console.error('Token generation error:', err);
        return res.status(500).json({ error: 'Failed to generate token' });
    }
});
exports.generateToken = generateToken;
const muteAllParticipants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomName } = req.body;
    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }
    try {
        const participants = yield roomService.listParticipants(roomName);
        console.log(`Muting ${participants.length} participants in room: ${roomName}`);
        for (const p of participants) {
            try {
                // Update participant permissions to disallow publishing audio
                yield roomService.updateParticipant(roomName, p.identity, undefined, {
                    canPublish: false,
                    canSubscribe: true,
                    canPublishData: true,
                });
                console.log(`Muted participant ${p.identity} via permissions`);
                // Also mute any currently active tracks
                for (const track of p.tracks) {
                    if (track.type === 1) { // 1 = AUDIO
                        try {
                            yield roomService.mutePublishedTrack(roomName, p.identity, track.sid, true);
                        }
                        catch (trackErr) {
                            console.error(`Failed to mute track ${track.sid}:`, trackErr);
                        }
                    }
                }
            }
            catch (participantErr) {
                console.error(`Failed to mute participant ${p.identity}:`, participantErr);
            }
        }
        return res.json({ message: 'All participants muted', count: participants.length });
    }
    catch (err) {
        console.error('Mute all error:', err);
        return res.status(500).json({ error: 'Failed to mute all participants', details: err.message });
    }
});
exports.muteAllParticipants = muteAllParticipants;
const unmuteAllParticipants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomName } = req.body;
    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }
    try {
        const participants = yield roomService.listParticipants(roomName);
        console.log(`Unmuting ${participants.length} participants in room: ${roomName}`);
        for (const p of participants) {
            try {
                // Update participant permissions to allow publishing audio
                yield roomService.updateParticipant(roomName, p.identity, undefined, {
                    canPublish: true,
                    canSubscribe: true,
                    canPublishData: true,
                });
                console.log(`Unmuted participant ${p.identity} via permissions`);
                // Also unmute any currently muted tracks
                for (const track of p.tracks) {
                    if (track.type === 1) { // 1 = AUDIO
                        try {
                            yield roomService.mutePublishedTrack(roomName, p.identity, track.sid, false);
                        }
                        catch (trackErr) {
                            console.error(`Failed to unmute track ${track.sid}:`, trackErr);
                        }
                    }
                }
            }
            catch (participantErr) {
                console.error(`Failed to unmute participant ${p.identity}:`, participantErr);
            }
        }
        return res.json({ message: 'All participants unmuted', count: participants.length });
    }
    catch (err) {
        console.error('Unmute all error:', err);
        return res.status(500).json({ error: 'Failed to unmute all participants', details: err.message });
    }
});
exports.unmuteAllParticipants = unmuteAllParticipants;
const logoutAllParticipants = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomName } = req.body;
    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }
    try {
        // 1. Remove from LiveKit
        const participants = yield roomService.listParticipants(roomName);
        console.log(`Logging out ${participants.length} participants from room: ${roomName}`);
        for (const p of participants) {
            yield roomService.removeParticipant(roomName, p.identity);
        }
        // 2. Get the room ID from database
        const { data: roomData, error: roomError } = yield supabaseClient_1.supabase
            .from('rooms')
            .select('id')
            .eq('name', roomName)
            .single();
        if (roomData && !roomError) {
            // 3. Update all non-admin users in this room to force_logout
            const { error: updateError } = yield supabaseClient_1.supabase
                .from('users')
                .update({ status: 'force_logout', is_online: false })
                .eq('current_room_id', roomData.id)
                .neq('role', 'admin');
            if (updateError) {
                console.error('Error updating user status:', updateError);
            }
            else {
                console.log(`Updated database status for users in room ${roomName}`);
            }
        }
        return res.json({ message: 'All participants logged out', count: participants.length });
    }
    catch (err) {
        console.error('Logout all error:', err);
        return res.status(500).json({ error: 'Failed to logout all participants' });
    }
});
exports.logoutAllParticipants = logoutAllParticipants;
const logoutUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { roomName, identity } = req.body;
    if (!roomName || !identity) {
        return res.status(400).json({ error: 'Room name and Identity are required' });
    }
    try {
        yield roomService.removeParticipant(roomName, identity);
        return res.json({ message: `User ${identity} logged out` });
    }
    catch (err) {
        console.error('Logout user error:', err);
        return res.status(500).json({ error: 'Failed to logout user' });
    }
});
exports.logoutUser = logoutUser;
