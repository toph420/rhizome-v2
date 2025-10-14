-- Migration: Add RPC function to count connections for a document
-- This avoids URL length issues when querying connections with many chunk IDs
-- Date: 2025-10-14

CREATE OR REPLACE FUNCTION count_connections_for_document(doc_id UUID)
RETURNS TABLE (
  total_connections BIGINT,
  validated_connections BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_connections,
    COUNT(*) FILTER (WHERE c.user_validated = true)::BIGINT as validated_connections
  FROM connections c
  INNER JOIN chunks ch ON c.source_chunk_id = ch.id
  WHERE ch.document_id = doc_id;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION count_connections_for_document IS
'Efficiently counts total and validated connections for a document by joining through chunks table. Avoids URL length issues from .in() queries with many chunk IDs.';
