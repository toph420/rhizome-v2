-- =====================================================
-- Migration: 072_chunk_enrichment_skip.sql
-- Purpose: Add enrichment skip tracking (mirrors connection detection pattern)
-- =====================================================

-- Add enrichment tracking columns
ALTER TABLE chunks
  ADD COLUMN enrichments_detected BOOLEAN DEFAULT false,
  ADD COLUMN enrichments_detected_at TIMESTAMPTZ,
  ADD COLUMN enrichment_skipped_reason TEXT;

COMMENT ON COLUMN chunks.enrichments_detected IS 'Whether metadata enrichment has been performed';
COMMENT ON COLUMN chunks.enrichments_detected_at IS 'Timestamp when enrichment completed';
COMMENT ON COLUMN chunks.enrichment_skipped_reason IS 'Reason enrichment was skipped: user_choice, error, manual_skip';

-- Partial index for finding unenriched chunks (efficient filtering)
CREATE INDEX idx_chunks_enrichments_detected
  ON chunks(document_id, enrichments_detected)
  WHERE enrichments_detected = false;

-- Index for enrichment timestamps
CREATE INDEX idx_chunks_enrichments_detected_at
  ON chunks(enrichments_detected_at)
  WHERE enrichments_detected_at IS NOT NULL;

-- Index for skip reasons (analytics)
CREATE INDEX idx_chunks_enrichment_skipped
  ON chunks(enrichment_skipped_reason)
  WHERE enrichment_skipped_reason IS NOT NULL;

-- =====================================================
-- RPC Function: Get enrichment statistics for a document
-- =====================================================
CREATE OR REPLACE FUNCTION get_chunk_enrichment_stats(doc_id UUID)
RETURNS TABLE(
  total_chunks BIGINT,
  enriched_chunks BIGINT,
  skipped_chunks BIGINT,
  pending_chunks BIGINT,
  error_chunks BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_chunks,
    COUNT(*) FILTER (WHERE enrichments_detected = true)::BIGINT as enriched_chunks,
    COUNT(*) FILTER (WHERE enrichment_skipped_reason = 'user_choice')::BIGINT as skipped_chunks,
    COUNT(*) FILTER (WHERE enrichments_detected = false
                      AND enrichment_skipped_reason IS NULL)::BIGINT as pending_chunks,
    COUNT(*) FILTER (WHERE enrichment_skipped_reason = 'error')::BIGINT as error_chunks
  FROM chunks
  WHERE document_id = doc_id
    AND is_current = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_chunk_enrichment_stats IS 'Returns enrichment statistics for a document';

-- =====================================================
-- RPC Function: Get unenriched chunk IDs for batch processing
-- =====================================================
CREATE OR REPLACE FUNCTION get_unenriched_chunk_ids(doc_id UUID)
RETURNS TABLE(chunk_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT id
  FROM chunks
  WHERE document_id = doc_id
    AND is_current = true
    AND enrichments_detected = false
    AND enrichment_skipped_reason IS NULL
  ORDER BY chunk_index;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unenriched_chunk_ids IS 'Returns list of chunk IDs pending enrichment';

-- =====================================================
-- Backfill: Mark existing enriched chunks
-- =====================================================
-- All existing chunks with metadata should be marked as enriched
UPDATE chunks
SET
  enrichments_detected = true,
  enrichments_detected_at = metadata_extracted_at
WHERE metadata_extracted_at IS NOT NULL
  AND enrichments_detected = false;

-- Chunks without metadata are pending (no skip reason)
-- (No update needed - default false is correct)
