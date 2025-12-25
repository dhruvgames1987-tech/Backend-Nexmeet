import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDeviceLock() {
    console.log('Checking device lock status for user3...');
    const { data, error } = await supabase
        .from('users')
        .select('username, device_lock, device_id, device_name')
        .eq('username', 'user3');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('User Data:', data);
    }
}

checkDeviceLock();
