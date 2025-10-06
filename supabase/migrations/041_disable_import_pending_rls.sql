-- Disable RLS on import_pending for development
-- (Migration 003 was created before import_pending table existed)

ALTER TABLE import_pending DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE import_pending IS 'RLS ready - enable with: ALTER TABLE import_pending ENABLE ROW LEVEL SECURITY';
