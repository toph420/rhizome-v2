-- Migration: Add chunk-level connection detection tracking
-- Created: 2025-10-24
-- Purpose: Enable selective, user-driven connection detection at chunk level

-- Add detection tracking columns to chunks
ALTER TABLE chunks
  ADD COLUMN connections_detected BOOLEAN DEFAULT false,
  ADD COLUMN connections_detected_at TIMESTAMPTZ,
  ADD COLUMN detection_skipped_reason TEXT; -- 'user_choice', 'error', 'manual_skip'

-- Index for efficient filtering queries (only index undetected chunks)
CREATE INDEX idx_chunks_detection_status
  ON chunks(document_id, connections_detected)
  WHERE connections_detected = false;

-- Index for document-level stats (used by RPC)
CREATE INDEX idx_chunks_detected_at
  ON chunks(connections_detected_at)
  WHERE connections_detected_at IS NOT NULL;

-- Migration strategy: Fresh start (no existing data to migrate)
-- New chunks will default to connections_detected = false

-- RPC function: Get detection stats for a document
CREATE OR REPLACE FUNCTION get_chunk_detection_stats(doc_id UUID)
RETURNS TABLE (
  total_chunks BIGINT,
  detected_chunks BIGINT,
  undetected_chunks BIGINT,
  detection_rate NUMERIC,
  avg_connections_per_chunk NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_chunks,
    COUNT(*) FILTER (WHERE connections_detected = true)::BIGINT as detected_chunks,
    COUNT(*) FILTER (WHERE connections_detected = false)::BIGINT as undetected_chunks,
    ROUND(
      COUNT(*) FILTER (WHERE connections_detected = true)::NUMERIC / NULLIF(COUNT(*)::NUMERIC, 0) * 100,
      2
    ) as detection_rate,
    COALESCE(
      (SELECT AVG(conn_count) FROM (
        SELECT COUNT(*) as conn_count
        FROM connections
        WHERE source_chunk_id IN (SELECT id FROM chunks WHERE document_id = doc_id)
        GROUP BY source_chunk_id
      ) subq),
      0
    ) as avg_connections_per_chunk
  FROM chunks
  WHERE document_id = doc_id AND is_current = true;
END;
$$ LANGUAGE plpgsql;

-- RPC function: Get undetected chunk IDs for a document
CREATE OR REPLACE FUNCTION get_undetected_chunk_ids(doc_id UUID)
RETURNS TABLE (chunk_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT id
  FROM chunks
  WHERE document_id = doc_id
    AND is_current = true
    AND connections_detected = false
  ORDER BY chunk_index;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN chunks.connections_detected IS 'Whether connection detection has been run for this chunk';
COMMENT ON COLUMN chunks.connections_detected_at IS 'Timestamp when connections were detected';
COMMENT ON COLUMN chunks.detection_skipped_reason IS 'Why detection was skipped: user_choice, error, or manual_skip';
