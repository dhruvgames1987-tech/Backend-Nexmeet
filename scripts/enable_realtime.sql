-- Enable Realtime for the users table
-- This allows the mobile app to receive real-time updates when user status changes

-- First, enable realtime publication for the users table
ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- Alternatively, if the above doesn't work, you can enable it via the Supabase dashboard:
-- 1. Go to Database > Replication
-- 2. Find the 'users' table
-- 3. Enable replication for the table

-- Note: Make sure RLS policies allow the user to SELECT their own row
-- The current policy "Allow ALL for everyone" should work for development
