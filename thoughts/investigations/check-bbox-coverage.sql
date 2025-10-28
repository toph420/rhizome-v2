-- Bbox Coverage Diagnostic Queries
-- Run these to understand bbox/page coverage in your documents
-- Date: 2025-10-27

-- ============================================================================
-- Query 1: Page Coverage Analysis
-- Shows which documents have page_start/page_end data
-- ============================================================================

SELECT
  d.id as document_id,
  d.title,
  d.source_type,
  COUNT(c.id) as total_chunks,
  COUNT(c.page_start) as chunks_with_page_start,
  COUNT(c.page_end) as chunks_with_page_end,
  ROUND(COUNT(c.page_start)::numeric / NULLIF(COUNT(c.id), 0) * 100, 1) as page_coverage_pct,
  d.created_at
FROM documents d
LEFT JOIN chunks c ON c.document_id = d.id
WHERE d.processing_status = 'completed'
GROUP BY d.id, d.title, d.source_type, d.created_at
ORDER BY d.created_at DESC
LIMIT 20;

-- ============================================================================
-- Query 2: Bbox Coverage Analysis
-- Shows which documents have bbox data in chunks
-- ============================================================================

WITH bbox_stats AS (
  SELECT
    c.document_id,
    c.id as chunk_id,
    c.bboxes,
    CASE
      WHEN c.bboxes IS NULL THEN 0
      WHEN jsonb_array_length(c.bboxes) = 0 THEN 0
      ELSE jsonb_array_length(c.bboxes)
    END as bbox_count
  FROM chunks c
)
SELECT
  d.id as document_id,
  d.title,
  d.source_type,
  COUNT(bs.chunk_id) as total_chunks,
  COUNT(CASE WHEN bs.bbox_count > 0 THEN 1 END) as chunks_with_bboxes,
  ROUND(
    COUNT(CASE WHEN bs.bbox_count > 0 THEN 1 END)::numeric /
    NULLIF(COUNT(bs.chunk_id), 0) * 100,
    1
  ) as bbox_coverage_pct,
  SUM(bs.bbox_count) as total_bboxes,
  d.created_at
FROM documents d
LEFT JOIN bbox_stats bs ON bs.document_id = d.id
WHERE d.processing_status = 'completed'
GROUP BY d.id, d.title, d.source_type, d.created_at
ORDER BY d.created_at DESC
LIMIT 20;

-- ============================================================================
-- Query 3: Detailed Chunk Analysis for Specific Document
-- Replace <document_id> with actual UUID
-- ============================================================================

-- SELECT
--   chunk_index,
--   page_start,
--   page_end,
--   CASE
--     WHEN bboxes IS NULL THEN 0
--     ELSE jsonb_array_length(bboxes)
--   END as bbox_count,
--   LEFT(content, 100) as content_preview,
--   heading_path
-- FROM chunks
-- WHERE document_id = '<document_id>'
-- ORDER BY chunk_index
-- LIMIT 50;

-- ============================================================================
-- Query 4: Annotation Sync Quality
-- Check how many annotations have valid markdown offsets
-- ============================================================================

SELECT
  d.id as document_id,
  d.title,
  COUNT(e.id) as total_annotations,
  COUNT(CASE WHEN
    (e.component_data->>'Position')::jsonb->>'startOffset' != '0'
    OR
    (e.component_data->>'Position')::jsonb->>'endOffset' != '0'
  THEN 1 END) as annotations_with_offsets,
  ROUND(
    COUNT(CASE WHEN
      (e.component_data->>'Position')::jsonb->>'startOffset' != '0'
      OR
      (e.component_data->>'Position')::jsonb->>'endOffset' != '0'
    THEN 1 END)::numeric /
    NULLIF(COUNT(e.id), 0) * 100,
    1
  ) as offset_coverage_pct
FROM documents d
LEFT JOIN entities e ON
  e.user_id = d.user_id AND
  e.component_data ? 'Position' AND
  (e.component_data->>'Position')::jsonb->>'documentId' = d.id::text
WHERE d.processing_status = 'completed'
GROUP BY d.id, d.title
HAVING COUNT(e.id) > 0
ORDER BY d.created_at DESC
LIMIT 20;

-- ============================================================================
-- Query 5: Chunker Strategy Analysis
-- Shows which chunker strategies produce better bbox coverage
-- ============================================================================

SELECT
  c.chunker_type,
  COUNT(DISTINCT c.document_id) as documents_using_strategy,
  COUNT(c.id) as total_chunks,
  COUNT(c.page_start) as chunks_with_pages,
  ROUND(COUNT(c.page_start)::numeric / NULLIF(COUNT(c.id), 0) * 100, 1) as page_coverage_pct,
  COUNT(CASE WHEN
    c.bboxes IS NOT NULL AND
    jsonb_array_length(c.bboxes) > 0
  THEN 1 END) as chunks_with_bboxes,
  ROUND(
    COUNT(CASE WHEN
      c.bboxes IS NOT NULL AND
      jsonb_array_length(c.bboxes) > 0
    THEN 1 END)::numeric /
    NULLIF(COUNT(c.id), 0) * 100,
    1
  ) as bbox_coverage_pct
FROM chunks c
GROUP BY c.chunker_type
ORDER BY bbox_coverage_pct DESC;

-- ============================================================================
-- Expected Results:
-- ============================================================================
--
-- If page_coverage_pct = 0%:
--   → Provenance metadata not being tracked at all
--   → Check Docling configuration and LOCAL mode
--
-- If page_coverage_pct > 50% but bbox_coverage_pct = 0%:
--   → Pages tracked but bboxes not preserved
--   → Document quality issue (scanned PDFs) OR chunking strategy
--
-- If both > 50%:
--   → System working as expected!
--   → Phase 2.3 (bbox-based precision) can be implemented
--
-- ============================================================================
