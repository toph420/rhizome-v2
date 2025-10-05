-- Migration 032: Chunk Versioning for Transaction-Safe Rollback
-- Add is_current column to chunks table for safe reprocessing
-- Purpose: Enable rollback during annotation recovery if fuzzy matching fails

-- Add is_current column (defaults to true for existing chunks)
ALTER TABLE chunks
ADD COLUMN is_current BOOLEAN NOT NULL DEFAULT true;

-- Create partial index for current chunks (most queries use this)
CREATE INDEX idx_chunks_document_current ON chunks(document_id, is_current)
WHERE is_current = true;

-- Create index for cleanup queries (finding old chunks to delete)
CREATE INDEX idx_chunks_document_not_current ON chunks(document_id)
WHERE is_current = false;

-- Add comment for documentation
COMMENT ON COLUMN chunks.is_current IS 'Indicates if this is the current version of the chunk. Used for transaction-safe rollback during reprocessing. Only one version per chunk_index should have is_current=true.';

-- Migration pattern for reprocessing:
-- 1. Set old chunks: is_current = false (don't delete yet!)
-- 2. Create new chunks: is_current = false
-- 3. Recover annotations
-- 4. IF success: Set new chunks is_current = true, delete old chunks
-- 5. IF failure: Restore old chunks (set is_current = true), delete new chunks
