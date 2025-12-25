const axios = require('axios');

// Direct database query using Supabase REST API
async function resetUser5ViaSupabase() {
    const SUPABASE_URL = 'https://lpubsocrzqkuxqlqjfkm.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwdWJzb2NyenFrdXhxbHFqZmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI1MTQzMDIsImV4cCI6MjA0ODA5MDMwMn0.lTKgKWj-xtLZnrxJRFM0nVhJeWzfM3zMZW6NaW-9LIM';

    try {
        // First check current status
        console.log('Checking user5 current status...');
        const checkResponse = await axios.get(
            `${SUPABASE_URL}/rest/v1/users?username=eq.user5`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            }
        );
        console.log('Current status:', checkResponse.data[0]);

        // Update to reset the status
        console.log('Resetting user5 status and online state...');
        const updateResponse = await axios.patch(
            `${SUPABASE_URL}/rest/v1/users?username=eq.user5`,
            {
                status: 'active',
                is_online: false
            },
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            }
        );
        console.log('Update response:', updateResponse.data);
        console.log('✅ user5 has been reset! Status is now "active" and is_online is false. You can login now.');
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

resetUser5ViaSupabase();
