
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUser() {
    console.log('Checking status for user2...');
    const { data, error } = await supabase
        .from('users')
        .select('id, username, is_online, status, last_login')
        .eq('username', 'user2');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('User Data:', data);
    }
}

checkUser();
