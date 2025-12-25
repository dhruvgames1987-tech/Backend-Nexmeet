
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

async function debugLogout() {
    console.log('Attempting logout update for user2...');

    const { data, error } = await supabase
        .from('users')
        .update({
            is_online: false,
            status: 'force_logout',
            current_room_id: null
        })
        .eq('username', 'user2')
        .select();

    if (error) {
        console.error('Logout Update Error:', error);
    } else {
        console.log('Logout Update Success:', data);
    }
}

debugLogout();
