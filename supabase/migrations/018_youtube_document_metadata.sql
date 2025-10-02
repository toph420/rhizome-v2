-- Migration 018: YouTube Document Metadata
-- Purpose: Store YouTube timestamps at document level, not chunk level
-- Date: 2025-01-29
--
-- Architecture Decision:
-- YouTube timestamps are DOCUMENT metadata (when/where content occurs in video)
-- NOT chunk metadata (semantic meaning of chunk content)
-- This keeps chunks table clean and allows PDFs/text/web to remain YouTube-agnostic

-- Add source_metadata column to documents table (if not exists)
-- This will store YouTube-specific data like videoId, timestamps, duration
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_documents_source_metadata
  ON documents USING GIN (source_metadata);

-- Create functional index for source type queries
CREATE INDEX IF NOT EXISTS idx_documents_source_type
  ON documents(source_type)
  WHERE source_type IS NOT NULL;

-- Create functional index for YouTube video IDs
CREATE INDEX IF NOT EXISTS idx_documents_youtube_video_id
  ON documents((source_metadata->>'videoId'))
  WHERE source_metadata->>'videoId' IS NOT NULL;

-- Add comment documenting the expected structure
COMMENT ON COLUMN documents.source_metadata IS
  'Source-specific metadata stored as JSONB.

  For YouTube videos (source_type = ''youtube''):
  {
    "videoId": "abc123",
    "videoUrl": "https://youtube.com/watch?v=abc123",
    "duration": 3600,
    "isTranscript": true,
    "timestamps": [
      {
        "start_seconds": 0,
        "end_seconds": 575,
        "text": "Introduction to the topic..."
      },
      {
        "start_seconds": 575,
        "end_seconds": 1847,
        "text": "Main content discussing..."
      }
    ]
  }

  For pasted YouTube transcripts (source_type = ''youtube_transcript''):
  {
    "isTranscript": true,
    "timestamps": [
      {
        "start_seconds": 0,
        "end_seconds": 30,
        "text": "Welcome to this tutorial..."
      }
    ]
  }

  For other source types: format-specific metadata as needed';

-- Create helper function to check if document has YouTube timestamps
CREATE OR REPLACE FUNCTION has_youtube_timestamps(doc_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_timestamps BOOLEAN;
BEGIN
  SELECT
    source_metadata->>'isTranscript' = 'true'
    AND source_metadata->'timestamps' IS NOT NULL
  INTO has_timestamps
  FROM documents
  WHERE id = doc_id;

  RETURN COALESCE(has_timestamps, false);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create function to get video timestamp for a chunk based on character offset
-- This enables "Watch at 9:35" links in the frontend
CREATE OR REPLACE FUNCTION get_chunk_video_timestamp(chunk_id UUID)
RETURNS TABLE(
  seconds INTEGER,
  video_url TEXT,
  has_video_link BOOLEAN
) AS $$
DECLARE
  chunk_start_offset INTEGER;
  doc_source_type TEXT;
  doc_source_metadata JSONB;
  video_id TEXT;
  char_count INTEGER;
  segment JSONB;
BEGIN
  -- Get chunk offset and document metadata
  SELECT
    c.start_offset,
    d.source_type,
    d.source_metadata
  INTO
    chunk_start_offset,
    doc_source_type,
    doc_source_metadata
  FROM chunks c
  JOIN documents d ON c.document_id = d.id
  WHERE c.id = chunk_id;

  -- Return null if not a YouTube document
  IF doc_source_type NOT IN ('youtube', 'youtube_transcript') THEN
    RETURN;
  END IF;

  -- Return null if no timestamps
  IF doc_source_metadata->>'isTranscript' != 'true'
     OR doc_source_metadata->'timestamps' IS NULL THEN
    RETURN;
  END IF;

  -- Find which timestamp segment contains this chunk's start_offset
  char_count := 0;
  FOR segment IN SELECT * FROM jsonb_array_elements(doc_source_metadata->'timestamps')
  LOOP
    DECLARE
      segment_text TEXT := segment->>'text';
      segment_length INTEGER := LENGTH(segment_text);
      start_sec INTEGER := (segment->>'start_seconds')::INTEGER;
    BEGIN
      -- Check if chunk offset falls within this segment
      IF chunk_start_offset >= char_count
         AND chunk_start_offset < char_count + segment_length THEN

        video_id := doc_source_metadata->>'videoId';

        -- Return with video URL if we have a videoId
        IF video_id IS NOT NULL THEN
          RETURN QUERY SELECT
            start_sec,
            'https://youtube.com/watch?v=' || video_id || '&t=' || start_sec || 's',
            true;
        ELSE
          -- Pasted transcript: no video link, just timestamp
          RETURN QUERY SELECT
            start_sec,
            NULL::TEXT,
            false;
        END IF;

        RETURN;
      END IF;

      char_count := char_count + segment_length;
    END;
  END LOOP;

  -- No matching segment found
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create view for chunks with video timestamps (helper for queries)
CREATE OR REPLACE VIEW chunks_with_video_timestamps AS
SELECT
  c.*,
  vt.seconds as video_timestamp_seconds,
  vt.video_url as video_timestamp_url,
  vt.has_video_link as has_video_link
FROM chunks c
LEFT JOIN LATERAL get_chunk_video_timestamp(c.id) vt ON true;

-- Grant appropriate permissions
GRANT SELECT ON chunks_with_video_timestamps TO authenticated;
GRANT SELECT ON chunks_with_video_timestamps TO anon;

-- Migration verification
DO $$
DECLARE
  column_exists BOOLEAN;
  index_count INTEGER;
BEGIN
  -- Check if source_metadata column exists
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'documents'
    AND column_name = 'source_metadata'
  ) INTO column_exists;

  -- Check if indexes were created
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'documents'
  AND indexname IN (
    'idx_documents_source_metadata',
    'idx_documents_source_type',
    'idx_documents_youtube_video_id'
  );

  IF column_exists AND index_count = 3 THEN
    RAISE NOTICE 'Migration 018 completed successfully';
  ELSE
    RAISE EXCEPTION 'Migration 018 failed: column_exists=%, index_count=%', column_exists, index_count;
  END IF;
END $$;
