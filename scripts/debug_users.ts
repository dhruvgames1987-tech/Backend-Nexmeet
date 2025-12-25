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

async function debugUsers() {
    console.log('Checking users table...');

    const { data: users, error } = await supabase
        .from('users')
        .select('id, username, is_online, status, device_name');

    if (error) {
        console.error('Error fetching users:', error);
        return;
    }

    console.table(users);
}

debugUsers();
