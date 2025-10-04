-- ============================================
-- Migration 029: Prevent Duplicate Chunks & Add Result Caching
-- ============================================
-- Problem 1: Worker retries can insert duplicate chunks with same chunk_index
-- Problem 2: Worker re-runs expensive AI processing on every retry
-- Solution: Unique constraint + result caching in background_jobs

-- Step 1: Clean existing duplicates (keep oldest by created_at)
DELETE FROM chunks c1
USING chunks c2
WHERE c1.document_id = c2.document_id
  AND c1.chunk_index = c2.chunk_index
  AND c1.created_at > c2.created_at;

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE chunks
ADD CONSTRAINT chunks_document_chunk_idx_unique
UNIQUE (document_id, chunk_index);

-- Step 3: Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_chunks_document_index
ON chunks(document_id, chunk_index);

-- Step 4: Add metadata column to background_jobs for caching AI results
ALTER TABLE background_jobs
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Step 5: Add output_data column for job results (if not exists)
ALTER TABLE background_jobs
ADD COLUMN IF NOT EXISTS output_data JSONB DEFAULT '{}';

-- Verify constraint
COMMENT ON CONSTRAINT chunks_document_chunk_idx_unique ON chunks IS
  'Prevents duplicate chunks with same chunk_index per document. Required for worker retry safety.';

COMMENT ON COLUMN background_jobs.metadata IS
  'Cache for expensive AI processing results. Enables idempotent retries without re-processing.';
