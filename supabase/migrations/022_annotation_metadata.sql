-- Migration 022: Enhanced metadata for annotation system (Phase 1)
-- Purpose: Add page labels and citation fields for academic annotations
-- Date: 2025-10-01

-- ============================================
-- DOCUMENTS: Add Citation Fields
-- ============================================

-- Add specific citation fields (source_url already exists)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS isbn TEXT,
  ADD COLUMN IF NOT EXISTS doi TEXT;

-- Add indexes for citation lookups
CREATE INDEX IF NOT EXISTS idx_documents_author ON documents(author) WHERE author IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_publication_date ON documents(publication_date) WHERE publication_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_isbn ON documents(isbn) WHERE isbn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_doi ON documents(doi) WHERE doi IS NOT NULL;

-- ============================================
-- CHUNKS: Add Page Information
-- ============================================

-- Add page label fields for annotations
-- Note: page_numbers was removed in migration 019
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS page_start INTEGER,
  ADD COLUMN IF NOT EXISTS page_end INTEGER,
  ADD COLUMN IF NOT EXISTS page_label TEXT;

-- Index for page-based queries
CREATE INDEX IF NOT EXISTS idx_chunks_page_range ON chunks(document_id, page_start, page_end)
  WHERE page_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_page_label ON chunks(document_id, page_label)
  WHERE page_label IS NOT NULL;

-- ============================================
-- COMPONENTS: Add Indexes for Annotations
-- ============================================

-- Fast lookup by document (for annotation queries)
CREATE INDEX IF NOT EXISTS idx_components_document ON components(
  (data->>'document_id')
) WHERE component_type IN ('Position', 'ChunkRef');

-- Fast lookup by page label (for page-based annotation queries)
CREATE INDEX IF NOT EXISTS idx_components_page_label ON components(
  (data->>'pageLabel')
) WHERE component_type = 'Position' AND (data->>'pageLabel') IS NOT NULL;

-- Fast lookup by chunk reference (for chunk-based annotation queries)
CREATE INDEX IF NOT EXISTS idx_components_chunk_ref ON components(
  (data->>'chunk_id')
) WHERE component_type = 'ChunkRef';

-- ============================================
-- HELPER FUNCTION: Estimate Page from Offset
-- ============================================

CREATE OR REPLACE FUNCTION estimate_page_from_offset(
  doc_id UUID,
  char_offset INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  total_chars INTEGER;
  total_pages INTEGER;
  estimated_page INTEGER;
BEGIN
  -- Get total character count and page count from document
  SELECT
    word_count * 5, -- Rough estimate: 5 chars per word
    page_count
  INTO total_chars, total_pages
  FROM documents
  WHERE id = doc_id;

  -- Return NULL if we don't have the data
  IF total_pages IS NULL OR total_pages = 0 OR total_chars IS NULL OR total_chars = 0 THEN
    RETURN NULL;
  END IF;

  -- Linear estimation (assumes uniform distribution)
  estimated_page := CEIL((char_offset::FLOAT / total_chars) * total_pages);

  -- Clamp to valid range
  IF estimated_page < 1 THEN
    estimated_page := 1;
  ELSIF estimated_page > total_pages THEN
    estimated_page := total_pages;
  END IF;

  RETURN estimated_page;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN documents.publication_date IS 'Original publication date for citation purposes';
COMMENT ON COLUMN documents.isbn IS 'ISBN for books (10 or 13 digit)';
COMMENT ON COLUMN documents.doi IS 'Digital Object Identifier for academic papers';

COMMENT ON COLUMN chunks.page_start IS 'Starting page number in original document (optional)';
COMMENT ON COLUMN chunks.page_end IS 'Ending page number in original document (optional)';
COMMENT ON COLUMN chunks.page_label IS 'Page label as it appears in document (e.g., "iv", "42", "A-3")';

COMMENT ON FUNCTION estimate_page_from_offset IS 'Estimates page number from character offset (linear approximation)';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
  doc_columns INTEGER;
  chunk_columns INTEGER;
  component_indexes INTEGER;
BEGIN
  -- Check documents columns
  SELECT COUNT(*) INTO doc_columns
  FROM information_schema.columns
  WHERE table_name = 'documents'
  AND column_name IN ('publication_date', 'isbn', 'doi');

  -- Check chunks columns
  SELECT COUNT(*) INTO chunk_columns
  FROM information_schema.columns
  WHERE table_name = 'chunks'
  AND column_name IN ('page_start', 'page_end', 'page_label');

  -- Check component indexes
  SELECT COUNT(*) INTO component_indexes
  FROM pg_indexes
  WHERE tablename = 'components'
  AND indexname IN ('idx_components_document', 'idx_components_page_label', 'idx_components_chunk_ref');

  IF doc_columns = 3 AND chunk_columns = 3 AND component_indexes = 3 THEN
    RAISE NOTICE 'Migration 022 completed successfully';
  ELSE
    RAISE WARNING 'Migration 022 incomplete: docs=%, chunks=%, indexes=%', doc_columns, chunk_columns, component_indexes;
  END IF;
END $$;
