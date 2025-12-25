-- Add password column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password TEXT;

-- Optional: Set a default password for existing users if needed (e.g., '123456')
-- UPDATE users SET password = 'password123' WHERE password IS NULL;
