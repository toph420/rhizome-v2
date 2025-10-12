-- =====================================================================
-- Migration 046: Cached Chunks Table
-- =====================================================================
-- Purpose: Persistent cache for Docling extraction results
-- Replaces: Temporary storage in background_jobs.metadata
-- Benefits: Document-level persistence, simple queries, zero reprocessing cost
-- Related: Local Processing Pipeline (Phase 2-4)
-- =====================================================================

-- Create cached_chunks table
CREATE TABLE IF NOT EXISTS cached_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  -- Extraction metadata
  extraction_mode TEXT NOT NULL CHECK (extraction_mode IN ('pdf', 'epub')),
  markdown_hash TEXT NOT NULL,
  docling_version TEXT,

  -- Cached data (JSONB for full DoclingChunk structure)
  chunks JSONB NOT NULL,
  structure JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one cache per document
  UNIQUE(document_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_cached_chunks_document ON cached_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_cached_chunks_mode ON cached_chunks(extraction_mode);
CREATE INDEX IF NOT EXISTS idx_cached_chunks_created ON cached_chunks(created_at);

-- Add updated_at trigger (reuses existing function)
CREATE TRIGGER update_cached_chunks_updated_at
  BEFORE UPDATE ON cached_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE cached_chunks IS 'Persistent cache for Docling extraction results. Replaces job.metadata cache. Enables zero-cost reprocessing with bulletproof matching.';
COMMENT ON COLUMN cached_chunks.document_id IS 'Document this cache belongs to (one cache per document)';
COMMENT ON COLUMN cached_chunks.extraction_mode IS 'Document type: pdf or epub (different Docling processing paths)';
COMMENT ON COLUMN cached_chunks.markdown_hash IS 'SHA256 hash of source markdown to detect changes and invalidate stale cache';
COMMENT ON COLUMN cached_chunks.docling_version IS 'Docling library version for compatibility tracking (optional)';
COMMENT ON COLUMN cached_chunks.chunks IS 'Array of DoclingChunk objects with structural metadata (pages, headings, bboxes)';
COMMENT ON COLUMN cached_chunks.structure IS 'DoclingStructure object with headings array and total_pages';
COMMENT ON COLUMN cached_chunks.created_at IS 'When cache was first created (initial extraction)';
COMMENT ON COLUMN cached_chunks.updated_at IS 'When cache was last updated (reprocessing)';

-- Disable RLS for service role operations (single-user personal tool)
ALTER TABLE cached_chunks DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cached_chunks IS 'RLS disabled - service role has full access. Enable with: ALTER TABLE cached_chunks ENABLE ROW LEVEL SECURITY';
