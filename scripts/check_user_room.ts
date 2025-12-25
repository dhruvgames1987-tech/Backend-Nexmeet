import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wcrkufjrqpqxicswfdmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjcmt1ZmpycXBxeGljc3dmZG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzE2NjMsImV4cCI6MjA3OTMwNzY2M30.escxedCBUTSI-ZGXmW3mkokPL_rVQh8KAgUs02p6PRg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkUser(username: string) {
    console.log(`\n========================================`);
    console.log(`Checking user: ${username}`);
    console.log(`========================================\n`);

    // Fetch user data
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (userError) {
        console.error('❌ Error fetching user:', userError);
        return;
    }

    if (!user) {
        console.log('❌ User not found');
        return;
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Full Name: ${user.full_name || 'N/A'}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Online: ${user.is_online ? 'Yes' : 'No'}`);
    console.log(`   Current Room ID: ${user.current_room_id || 'NULL ⚠️'}`);
    console.log(`   Device Lock: ${user.device_lock ? 'Enabled' : 'Disabled'}`);

    // Fetch room info if assigned
    if (user.current_room_id) {
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', user.current_room_id)
            .single();

        if (roomError) {
            console.error('❌ Error fetching room:', roomError);
        } else if (room) {
            console.log(`\n📍 Assigned Room:`);
            console.log(`   Room ID: ${room.id}`);
            console.log(`   Room Name: ${room.name}`);
            console.log(`   Active: ${room.is_active ? 'Yes' : 'No'}`);
        } else {
            console.log(`\n⚠️  Room ID ${user.current_room_id} not found in database!`);
        }
    } else {
        console.log(`\n⚠️  User has NO room assigned (current_room_id is NULL)`);
        console.log(`   This user will join "General Assembly" by default on login`);
    }

    // Fetch all available rooms
    const { data: rooms, error: roomsError } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('id');

    if (!roomsError && rooms) {
        console.log(`\n📋 Available Active Rooms:`);
        rooms.forEach(r => {
            console.log(`   ${r.id}: ${r.name} ${r.id === user.current_room_id ? '← CURRENT' : ''}`);
        });
    }

    console.log(`\n========================================\n`);
}

// Check user3
checkUser('user3').catch(console.error);
