-- Fix match_chunks function to only return current chunks
-- Critical bug: was returning ALL chunks including old reprocessing versions
-- This caused collision detection to process 2x chunks (old + new)

CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  exclude_document_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  themes jsonb,
  summary text
)
LANGUAGE SQL STABLE
AS $$
  SELECT
    chunks.id,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) as similarity,
    chunks.document_id,
    chunks.themes,
    chunks.summary
  FROM chunks
  WHERE
    chunks.is_current = true  -- ✅ CRITICAL FIX: Only search current chunks
    AND 1 - (chunks.embedding <=> query_embedding) > match_threshold
    AND (exclude_document_id IS NULL OR chunks.document_id != exclude_document_id)
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;
