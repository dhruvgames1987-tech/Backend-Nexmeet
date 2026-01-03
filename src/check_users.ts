
import { supabase } from './supabaseClient';

async function checkOnlineUsers() {
    console.log('🔍 Checking online users in database...');

    const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_online', true);

    if (error) {
        console.error('❌ Error fetching users:', error.message);
        return;
    }

    if (!users || users.length === 0) {
        console.log('✅ No users are currently marked as online.');
    } else {
        console.log(`⚠️  Found ${users.length} users marked as 'online':`);
        console.table(users.map(u => ({
            id: u.id,
            username: u.username,
            role: u.role,
            device_id: u.device_id,
            last_seen: u.last_seen, // assuming there is a last_seen or similar, checking schema would be better but this is a guess
            current_room: u.current_room_id
        })));

        console.log('\n--- Diagnosis ---');
        console.log('If these users are not actually connected, they are "stale".');
        console.log('This happens if the server was restarted or app crashed without sending a logout signal.');
    }
}

checkOnlineUsers();
