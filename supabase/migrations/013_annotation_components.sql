-- Migration: 013_annotation_components.sql
-- Purpose: Optimize annotation queries and document component schema
-- Created: 2025-09-28
-- Task Reference: T-020 from docs/tasks/document-reader-annotation-system-tasks-17-24.md

-- ============================================================================
-- SCHEMA DOCUMENTATION
-- ============================================================================

-- Document valid component types for the ECS system
COMMENT ON COLUMN components.component_type IS 
  'Valid component types:
   - annotation: User highlights and notes (text selections with optional notes)
   - flashcard: Study cards with question/answer pairs  
   - study: FSRS scheduling data for spaced repetition
   - source: Links to chunks and documents (references to source material)
   - position: Fuzzy matching position data with confidence scores (0.3-1.0 range)
   
   See src/types/annotations.ts for TypeScript interfaces and data schemas.';

COMMENT ON COLUMN components.data IS
  'JSONB component data with application-level validation.
   Schema varies by component_type:
   - annotation: { text, note?, color, range, textContext }
   - position: { chunkId, startOffset, endOffset, confidence, method, textContext }
   - source: { chunk_id, document_id }
   - flashcard: { question, answer, deck_id? }
   - study: { due_date, ease_factor, interval, repetitions }
   
   All validation performed at application layer.
   See src/types/annotations.ts for complete type definitions.';

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Partial index for annotation queries (WHERE component_type = 'annotation')
-- Improves performance for getAnnotations(documentId) queries
-- This is the primary query pattern when loading document annotations
CREATE INDEX IF NOT EXISTS idx_components_annotation_type 
  ON components(component_type) 
  WHERE component_type = 'annotation';

-- Partial index for position queries (WHERE component_type = 'position')  
-- Used for fuzzy matching restoration queries when re-processing documents
-- Helps quickly find position components for confidence checks
CREATE INDEX IF NOT EXISTS idx_components_position_type 
  ON components(component_type) 
  WHERE component_type = 'position';

-- Composite index for document-level annotation queries
-- Optimizes: SELECT * FROM components WHERE document_id = ? AND component_type IN ('annotation', 'position')
-- This is the primary query pattern for loading all annotations in the reader
CREATE INDEX IF NOT EXISTS idx_components_document_annotation 
  ON components(document_id, component_type) 
  WHERE component_type IN ('annotation', 'position');

-- ============================================================================
-- PERFORMANCE ANALYSIS QUERIES (for verification after migration)
-- ============================================================================

-- Query plan verification (run manually after migration):
-- EXPLAIN ANALYZE SELECT * FROM components 
-- WHERE document_id = 'test-doc' AND component_type = 'annotation';
-- Expected result: Index Scan using idx_components_document_annotation
-- Cost should be significantly lower than Seq Scan

-- Index usage statistics (monitor in production):
-- SELECT 
--   schemaname, tablename, indexname, 
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read,
--   idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_components%'
-- ORDER BY idx_scan DESC;

-- Index size monitoring:
-- SELECT 
--   indexname,
--   pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
-- FROM pg_indexes
-- WHERE tablename = 'components'
-- AND indexname LIKE 'idx_components%';

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_components_annotation_type;
-- DROP INDEX IF EXISTS idx_components_position_type;
-- DROP INDEX IF EXISTS idx_components_document_annotation;
-- COMMENT ON COLUMN components.component_type IS NULL;
-- COMMENT ON COLUMN components.data IS NULL;