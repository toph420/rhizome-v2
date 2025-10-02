-- Fix documents that completed processing but have incorrect availability flags
-- This addresses the P0 bug where documents are processed but never appear in reader

-- Update all documents that show as completed but have flags set to false
-- Only affects pre-existing documents (before this migration)
UPDATE documents 
SET 
  markdown_available = true,
  embeddings_available = true,
  updated_at = NOW()
WHERE 
  processing_status = 'completed'
  AND (markdown_available = false OR embeddings_available = false)
  AND created_at < NOW();  -- Only fix pre-existing documents

-- Add comments for documentation and future reference
COMMENT ON COLUMN documents.markdown_available IS 
  'Indicates if markdown content is available in storage at {user_id}/{document_id}/content.md';
  
COMMENT ON COLUMN documents.embeddings_available IS 
  'Indicates if chunk embeddings have been generated and saved to chunks table';

-- Log the migration result
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Fixed % documents with incorrect availability flags', updated_count;
END $$;