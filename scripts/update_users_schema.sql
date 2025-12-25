-- Add device_name and device_lock columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS device_name TEXT,
ADD COLUMN IF NOT EXISTS device_lock BOOLEAN DEFAULT TRUE;

-- Update existing users to have device_lock enabled by default
UPDATE users SET device_lock = TRUE WHERE device_lock IS NULL;
