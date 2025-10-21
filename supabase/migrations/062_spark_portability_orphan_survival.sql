-- Migration 062: Spark portability and orphan survival
-- Sparks should survive document/chunk deletion with SET NULL
--
-- Philosophy: Sparks are USER-LEVEL entities (like tweets/notes),
-- not DOCUMENT-LEVEL entities (like annotations). They can reference
-- documents/chunks but aren't owned by them.
--
-- Changes:
-- 1. Fix components.document_id FK to use SET NULL (survives deletion)
-- 2. components.chunk_id already has SET NULL (no change needed)
-- 3. sparks_cache already has SET NULL for both (no change needed)

-- Fix cascade deletion for components.document_id
ALTER TABLE components
DROP CONSTRAINT IF EXISTS components_document_id_fkey;

ALTER TABLE components
ADD CONSTRAINT components_document_id_fkey
FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT components_document_id_fkey ON components IS
  'SET NULL allows sparks to survive document deletion (orphaned state).
   Spark entities remain queryable with document_id=NULL for re-linking.
   This enables sparks to be user-level entities that can outlive documents.';

-- Verification queries (run manually to check):
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'components'::regclass AND conname LIKE '%document_id%';
--
-- Expected: FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
