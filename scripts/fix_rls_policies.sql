-- Enable RLS for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow ALL for everyone" ON users;
DROP POLICY IF EXISTS "Allow DELETE for everyone" ON users;

-- Create a permissive policy for ALL operations (SELECT, INSERT, UPDATE, DELETE)
-- This is for development purposes. In production, you should restrict this.
CREATE POLICY "Allow ALL for everyone" ON users
    FOR ALL
    USING (true)
    WITH CHECK (true);
