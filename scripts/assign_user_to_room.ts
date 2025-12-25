import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wcrkufjrqpqxicswfdmp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indjcmt1ZmpycXBxeGljc3dmZG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzE2NjMsImV4cCI6MjA3OTMwNzY2M30.escxedCBUTSI-ZGXmW3mkokPL_rVQh8KAgUs02p6PRg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function assignUserToRoom(username: string, roomId: number) {
    console.log(`Assigning ${username} to room ID ${roomId}...`);

    const { data, error } = await supabase
        .from('users')
        .update({ current_room_id: roomId })
        .eq('username', username)
        .select();

    if (error) {
        console.error('❌ Error:', error);
    } else {
        console.log('✅ Success! User updated:', data);
    }
}

// Assign user3 to Room 1 (ID: 2)
assignUserToRoom('user3', 2).catch(console.error);
