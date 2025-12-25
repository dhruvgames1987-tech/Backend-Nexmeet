const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://lpubsocrzqkuxqlqjfkm.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdWJzb2NyenFrdXhxbHFqZmttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMjUxNDMwMiwiZXhwIjoyMDQ4MDkwMzAyfQ.DqFKlXRoYy-FZzHAUO0PqcCvTCxm5cEhOoJHXb-OMGs' // service_role key
);

async function forceResetUser5() {
    try {
        console.log('Checking user5...');
        const { data: before, error: err1 } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'user5')
            .single();

        console.log('Before:', before);

        console.log('\nResetting user5 to active...');
        const { data, error } = await supabase
            .from('users')
            .update({
                status: 'active',
                is_online: false
            })
            .eq('username', 'user5')
            .select();

        if (error) {
            console.error('Error:', error);
        } else {
            console.log('✅ Success! user5 reset:', data);
        }

        // Wait a bit then check again
        await new Promise(resolve => setTimeout(resolve, 1000));

        const { data: after } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'user5')
            .single();

        console.log('\nAfter:', after);
        console.log('\n✅ user5 is now ready to login!');
    } catch (e) {
        console.error('Error:', e.message);
    }
}

forceResetUser5();
