-- Migration 019: Remove chunk-level timestamp columns
-- Purpose: Clean up deprecated timestamp fields from chunks table
-- Reason: Timestamps moved to document-level storage (documents.source_metadata)
-- Date: 2025-01-30

-- Drop views that depend on chunks.timestamps column
DROP VIEW IF EXISTS chunks_with_video_timestamps CASCADE;
DROP VIEW IF EXISTS chunks_with_metadata CASCADE;
DROP VIEW IF EXISTS chunks_with_quality CASCADE;

-- Remove timestamps column from chunks (deprecated - now in documents.source_metadata)
ALTER TABLE chunks
  DROP COLUMN IF EXISTS timestamps;

-- Add comment explaining the architecture
COMMENT ON TABLE chunks IS
  'Semantic chunks for all document types.
   NOTE: YouTube timestamps are stored in documents.source_metadata, NOT here.
   This table remains generic across all document formats.';

-- Verify chunks.position_context is for fuzzy matching ONLY
COMMENT ON COLUMN chunks.position_context IS
  'Fuzzy matching metadata ONLY: {confidence: float, method: string, originalSnippet: string}.
   NOT for timestamps - those are in documents.source_metadata for YouTube videos.';

-- Migration verification
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'chunks'
    AND column_name = 'timestamps'
  ) INTO column_exists;

  IF column_exists THEN
    RAISE EXCEPTION 'Migration 019 failed: timestamps column still exists in chunks table';
  ELSE
    RAISE NOTICE 'Migration 019 completed successfully: timestamps column removed from chunks';
  END IF;
END $$;
