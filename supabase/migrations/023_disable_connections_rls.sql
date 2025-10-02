-- Disable RLS on connections table for personal app
-- Per docs/SUPABASE_AUTH_RULES.md: "No RLS policies needed" for single-user app

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view their own connections" ON connections;
DROP POLICY IF EXISTS "Users can create connections for their chunks" ON connections;
DROP POLICY IF EXISTS "Users can validate their own connections" ON connections;

-- Disable RLS entirely
ALTER TABLE connections DISABLE ROW LEVEL SECURITY;
