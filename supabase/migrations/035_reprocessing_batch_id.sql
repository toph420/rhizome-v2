-- Migration 035: Add reprocessing_batch column for transaction-safe reprocessing
--
-- Problem: When reprocessing fails and we need to rollback, we can't distinguish
-- between old chunks (is_current: false) and new chunks (is_current: false).
-- This causes the rollback to incorrectly restore BOTH old and new chunks.
--
-- Solution: Tag new chunks with a reprocessing_batch timestamp so we can:
-- 1. Delete only new chunks on rollback (WHERE reprocessing_batch = 'timestamp')
-- 2. Restore only old chunks (WHERE reprocessing_batch IS NULL)
--
-- Usage:
-- const batch = new Date().toISOString()
-- INSERT INTO chunks (..., reprocessing_batch) VALUES (..., batch)
--
-- On success: UPDATE chunks SET is_current = true WHERE reprocessing_batch = batch
-- On failure: DELETE FROM chunks WHERE reprocessing_batch = batch

-- Add reprocessing_batch column to track batches of reprocessed chunks
ALTER TABLE chunks
ADD COLUMN reprocessing_batch TEXT DEFAULT NULL;

-- Index for fast rollback operations
CREATE INDEX idx_chunks_reprocessing_batch
ON chunks (reprocessing_batch)
WHERE reprocessing_batch IS NOT NULL;

-- Index for fast "find old chunks to restore" queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_chunks_document_current
ON chunks (document_id, is_current);

COMMENT ON COLUMN chunks.reprocessing_batch IS
'ISO timestamp identifying a batch of reprocessed chunks. Used for transaction-safe rollback. NULL for original chunks.';
