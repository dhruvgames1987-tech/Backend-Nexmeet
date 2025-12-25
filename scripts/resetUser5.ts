import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://lpubsocrzqkuxqlqjfkm.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdWJzb2NyenFrdXhxbHFqZmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI1MTQzMDIsImV4cCI6MjA0ODA5MDMwMn0.lTKgKWj-xtLZnrxJRFM0nVhJeWzfM3zMZW6NaW-9LIM'
);

async function resetUser5() {
    // First check the current status
    const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('username, status, is_online')
        .eq('username', 'user5')
        .single();

    console.log('Current user5 status:', user);

    // Reset the status to allow login
    const { data, error } = await supabase
        .from('users')
        .update({
            status: 'active',
            is_online: false
        })
        .eq('username', 'user5');

    if (error) {
        console.error('Error resetting user5:', error);
    } else {
        console.log('✅ user5 has been reset successfully! You can now login.');
    }

    // Verify the update
    const { data: updatedUser } = await supabase
        .from('users')
        .select('username, status, is_online')
        .eq('username', 'user5')
        .single();

    console.log('Updated user5 status:', updatedUser);
}

resetUser5();
