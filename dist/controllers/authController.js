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
exports.login = void 0;
const supabaseClient_1 = require("../supabaseClient");
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, deviceId } = req.body;
    if (!username || !deviceId) {
        return res.status(400).json({ error: 'Username and Device ID are required' });
    }
    try {
        // 1. Fetch user
        const { data: user, error } = yield supabaseClient_1.supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.status === 'disabled') {
            return res.status(403).json({ error: 'Account is disabled' });
        }
        // 2. Device Locking Logic
        if (!user.device_id) {
            // First time login, lock to this device
            const { error: updateError } = yield supabaseClient_1.supabase
                .from('users')
                .update({ device_id: deviceId, is_online: true })
                .eq('id', user.id);
            if (updateError) {
                return res.status(500).json({ error: 'Failed to lock device' });
            }
        }
        else if (user.device_id !== deviceId) {
            // Device mismatch
            return res.status(403).json({ error: 'Device mismatch. Login from authorized device only.' });
        }
        else {
            // Update online status
            yield supabaseClient_1.supabase.from('users').update({ is_online: true }).eq('id', user.id);
        }
        // 3. Success
        return res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name
            }
        });
    }
    catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.login = login;
