-- Disable RLS on sparks_cache for development
-- This is a personal tool, RLS is not needed

-- Drop existing policies first
DROP POLICY IF EXISTS "Users view own sparks cache" ON sparks_cache;
DROP POLICY IF EXISTS "Users insert own sparks cache" ON sparks_cache;
DROP POLICY IF EXISTS "Users update own sparks cache" ON sparks_cache;
DROP POLICY IF EXISTS "Users delete own sparks cache" ON sparks_cache;

-- Disable RLS
ALTER TABLE sparks_cache DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE sparks_cache IS
  'CACHE ONLY - NOT SOURCE OF TRUTH.

  Source: {userId}/sparks/{sparkId}/content.json in Storage
  Purpose: Fast timeline/search queries only
  Rebuild: DELETE + re-insert from Storage JSON
  Data loss: Zero (fully rebuildable)

  RLS ready - enable with: ALTER TABLE sparks_cache ENABLE ROW LEVEL SECURITY
  This table can be dropped and rebuilt at any time.';
