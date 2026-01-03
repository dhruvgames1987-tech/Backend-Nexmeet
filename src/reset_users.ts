
import { supabase } from './supabaseClient';

async function resetOnlineUsers() {
    console.log('🧹 Cleaning up stale online users...');

    // Set ALL users to offline
    const { error } = await supabase
        .from('users')
        .update({
            is_online: false,
            current_room_id: null
        })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Updates all rows

    if (error) {
        console.error('❌ Error resetting users:', error.message);
    } else {
        console.log('✅ Success! All users have been marked as OFFLINE.');
        console.log('   Go ahead and log in again to see the correct status.');
    }
}

resetOnlineUsers();
