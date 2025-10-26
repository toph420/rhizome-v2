-- Migration 043: Disable RLS on user_settings
-- For dev mode with hardcoded dev-user-123
-- Will be re-enabled when real auth is implemented

ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
