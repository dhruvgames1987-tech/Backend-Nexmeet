import { Request, Response } from 'express';
import { supabase } from '../supabaseClient';
import { createLiveKitToken } from '../utils/livekit';

export const login = async (req: Request, res: Response) => {
    try {
        const { username, password, deviceId, deviceName } = req.body;

        // 1. Check if user exists
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 2. Validate password
        // Note: In production, you should use bcrypt or similar for hashed passwords
        if (user.password !== password) {
            console.log('Password mismatch for user:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 3. Device Lock Check
        console.log('Device Lock Check:', {
            username,
            deviceLockEnabled: user.device_lock,
            storedDeviceId: user.device_id,
            incomingDeviceId: deviceId,
            match: user.device_id === deviceId
        });

        // If device lock is enabled
        if (user.device_lock) {
            // If there's a stored device ID, it must match the incoming one
            if (user.device_id && user.device_id !== deviceId) {
                console.log('Device lock violation: Different device attempting login');
                return res.status(403).json({
                    error: 'Device Locked. You cannot log in from a new device.',
                    details: 'This account is locked to a specific device. Contact admin to unlock.'
                });
            }
            // If no device ID is stored yet, this is the first login with lock enabled
            // We'll store this device ID below
        }

        // 4. Update User Status & Device Info
        const updates: any = {
            status: 'active',
            is_online: true,
            device_name: deviceName || user.device_name || 'Unknown'
        };

        // Always update device_id if it's different or not set
        if (user.device_id !== deviceId) {
            updates.device_id = deviceId;
            console.log('Updating device_id to:', deviceId);
        }

        await supabase
            .from('users')
            .update(updates)
            .eq('id', user.id);

        // 5. Generate Token based on user's assigned room
        let roomName = 'General Assembly'; // Default fallback if no room assigned

        if (user.current_room_id) {
            const { data: room, error: roomError } = await supabase
                .from('rooms')
                .select('name')
                .eq('id', user.current_room_id)
                .single();

            if (room && !roomError) {
                roomName = room.name;
                console.log(`User ${username} joining room: ${roomName} (ID: ${user.current_room_id})`);
            } else {
                console.log(`Room not found for user ${username}, using default room`);
            }
        } else {
            console.log(`No room assigned to user ${username}, using default room`);
        }

        const token = await createLiveKitToken(username, roomName);

        // 6. Return Response
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                current_room_id: user.current_room_id,
                device_lock: user.device_lock
            },
            roomName
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const { username, currentPassword, newPassword } = req.body;

        if (!username || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Username, current password, and new password are required' });
        }

        // 1. Fetch the user to verify current password
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (fetchError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 2. Validate current password
        if (user.password !== currentPassword) {
            console.log('Current password mismatch for user:', username);
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // 3. Update to new password
        // In a real app, hash the password here!
        const { error } = await supabase
            .from('users')
            .update({ password: newPassword }) // Storing plain text as per current setup (NOT RECOMMENDED for production)
            .eq('username', username);

        if (error) {
            throw error;
        }

        console.log('Password updated successfully for user:', username);
        res.json({ message: 'Password updated successfully' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
};

export const logout = async (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const { error } = await supabase
            .from('users')
            .update({
                is_online: false,
                // NOTE: Do NOT clear current_room_id here - it's the user's permanent room assignment!
                // Only update their online status
            })
            .eq('username', username);

        if (error) {
            throw error;
        }

        res.json({ message: 'Logged out successfully' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

export const getOnlineUsers = async (req: Request, res: Response) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username, full_name, status, is_online, device_id, role, current_room_id')
            .eq('is_online', true)
            .order('username', { ascending: true });

        if (error) {
            throw error;
        }

        res.json({ users: users || [] });

    } catch (error) {
        console.error('Get online users error:', error);
        res.status(500).json({ error: 'Failed to fetch online users' });
    }
};
