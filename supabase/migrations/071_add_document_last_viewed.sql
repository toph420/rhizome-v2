-- Add last_viewed timestamp column to documents table
-- This allows tracking when users last opened each document in the reader

-- Add the column (nullable, so existing rows don't break)
ALTER TABLE documents ADD COLUMN last_viewed TIMESTAMPTZ;

-- Create index for efficient "recently viewed" queries
-- Sorted by last_viewed descending, with NULLs last (never viewed documents)
CREATE INDEX idx_documents_last_viewed ON documents(user_id, last_viewed DESC NULLS LAST);

-- Add comment for documentation
COMMENT ON COLUMN documents.last_viewed IS 'Timestamp when user last opened this document in the reader';
