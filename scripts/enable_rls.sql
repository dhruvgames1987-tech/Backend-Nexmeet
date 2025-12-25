
-- Enable RLS for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

    FOR UPDATE
    USING (true);

-- Policy to allow DELETE for everyone (anon and authenticated) - FOR DEVELOPMENT ONLY
CREATE POLICY "Allow DELETE for everyone" ON users
    FOR DELETE
    USING (true);
