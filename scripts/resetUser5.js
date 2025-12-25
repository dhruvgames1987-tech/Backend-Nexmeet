const axios = require('axios');

async function resetUser5() {
    const API_URL = 'http://localhost:4000';

    try {
        // First, let's check if we can logout user5 (which sets is_online to false)
        console.log('Resetting user5 status...');
        const response = await axios.post(`${API_URL}/logout`, {
            username: 'user5'
        });
        console.log('Logout response:', response.data);

        console.log('✅ user5 has been reset! You can now login again.');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

resetUser5();
