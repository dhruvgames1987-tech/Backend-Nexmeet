
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetDeviceLock() {
    console.log('Resetting device locks...');

    // Reset for admin
    const { error: adminError } = await supabase
        .from('users')
        .update({ device_id: null })
        .eq('username', 'admin');

    if (adminError) console.error('Error resetting admin:', adminError);
    else console.log('Reset device lock for: admin');

    // Reset for user1
    const { error: userError } = await supabase
        .from('users')
        .update({ device_id: null })
        .eq('username', 'user1');

    if (userError) console.error('Error resetting user1:', userError);
    else console.log('Reset device lock for: user1');
}

resetDeviceLock();
