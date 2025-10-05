-- Migration 037: Fix Chunk Cascade Delete
-- Problem: Foreign key constraint prevents deletion of old chunks after reprocessing
-- Solution: Add ON DELETE SET NULL to allow chunk deletion while preserving annotations
--
-- Context:
-- - After document reprocessing, old chunks (is_current = false) remain
-- - 5 orphaned chunks blocked by 15 position components
-- - Annotations work correctly, just database bloat
-- - With cascade, chunk deletion preserves annotation data (text, offsets)

-- Drop existing constraint without cascade behavior
ALTER TABLE components
DROP CONSTRAINT IF EXISTS components_chunk_id_fkey;

-- Add constraint with ON DELETE SET NULL
-- This allows chunk deletion without losing annotation data
ALTER TABLE components
ADD CONSTRAINT components_chunk_id_fkey
FOREIGN KEY (chunk_id)
REFERENCES chunks(id)
ON DELETE SET NULL;

-- Add comment explaining the rationale
COMMENT ON CONSTRAINT components_chunk_id_fkey ON components IS
'ON DELETE SET NULL preserves annotations when chunks are deleted. After reprocessing, old chunks can be cleaned up while maintaining annotation data (text, offsets, context).';

-- Clean up existing orphaned chunks now that constraint allows it
-- This removes the 5 orphaned chunks that were blocking deletion
DELETE FROM chunks
WHERE is_current = false
  AND EXISTS (
    SELECT 1 FROM chunks c2
    WHERE c2.document_id = chunks.document_id
      AND c2.is_current = true
  );
