
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

async function seedUsers() {
    console.log('Seeding users...');

    // 1. Create Admin
    const adminUser = {
        username: 'admin',
        full_name: 'System Admin',
        role: 'admin',
        is_online: false,
        status: 'active'
    };

    const { data: existingAdmin } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'admin')
        .single();

    if (!existingAdmin) {
        const { error } = await supabase.from('users').insert([adminUser]);
        if (error) console.error('Error creating admin:', error);
        else console.log('Admin user created: admin');
    } else {
        console.log('Admin user already exists');
    }

    // 2. Create Regular User
    const regularUser = {
        username: 'user1',
        full_name: 'Test User',
        role: 'user',
        is_online: false,
        status: 'active'
    };

    const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'user1')
        .single();

    if (!existingUser) {
        const { error } = await supabase.from('users').insert([regularUser]);
        if (error) console.error('Error creating user:', error);
        else console.log('Regular user created: user1');
    } else {
        console.log('Regular user already exists');
    }
}

seedUsers();
