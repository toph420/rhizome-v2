-- Migration 036: Fix Chunk Unique Constraint for Reprocessing
-- Allow multiple chunk_index values during reprocessing (is_current = false)
-- Only enforce uniqueness for current chunks

-- Drop the old unique constraint that blocks reprocessing
ALTER TABLE chunks
DROP CONSTRAINT IF EXISTS chunks_document_chunk_idx_unique;

-- Create a partial unique index that only applies to current chunks
-- This allows old chunks (is_current = false) and new chunks (is_current = false)
-- to coexist during reprocessing with the same chunk_index values
CREATE UNIQUE INDEX chunks_document_chunk_idx_current_unique
ON chunks (document_id, chunk_index)
WHERE is_current = true;

-- Add comment for documentation
COMMENT ON INDEX chunks_document_chunk_idx_current_unique IS
'Ensures chunk_index uniqueness only for current chunks, allowing transaction-safe reprocessing';
