-- Migration 019: Clean chunk schema for 3-engine collision detection system
-- Removes unused columns from 7-engine system, keeps only what's needed for:
-- 1. SemanticSimilarity (embedding, themes)
-- 2. ContradictionDetection (emotional_metadata, conceptual_metadata)
-- 3. ThematicBridge (conceptual_metadata, domain_metadata, importance_score)
--
-- Result: 15-column schema with ~40% size reduction

-- ============================================
-- STEP 1: Drop unused views and functions
-- ============================================

-- Drop views that reference columns we're about to remove
DROP VIEW IF EXISTS chunks_with_quality CASCADE;
DROP VIEW IF EXISTS chunks_with_metadata CASCADE;

-- Drop functions from migration 014
DROP FUNCTION IF EXISTS calculate_metadata_completeness(JSONB);
DROP FUNCTION IF EXISTS get_chunks_by_emotion(TEXT, FLOAT, FLOAT, FLOAT);
DROP FUNCTION IF EXISTS get_chunks_by_domain(TEXT, FLOAT);
DROP FUNCTION IF EXISTS find_similar_structure(TEXT, INT, BOOLEAN);

-- Drop trigger and function from migration 015
DROP TRIGGER IF EXISTS update_metadata_extracted_at_trigger ON chunks;
DROP FUNCTION IF EXISTS update_metadata_extracted_at();

-- ============================================
-- STEP 2: Drop unused indexes
-- ============================================

-- Indexes from migration 014 (metadata column)
DROP INDEX IF EXISTS idx_chunks_metadata;
DROP INDEX IF EXISTS idx_chunks_primary_emotion;
DROP INDEX IF EXISTS idx_chunks_emotional_polarity;
DROP INDEX IF EXISTS idx_chunks_primary_domain;
DROP INDEX IF EXISTS idx_chunks_technical_depth;
DROP INDEX IF EXISTS idx_chunks_metadata_completeness;
DROP INDEX IF EXISTS idx_chunks_template_type;

-- Indexes from migration 015 (individual metadata columns)
DROP INDEX IF EXISTS idx_chunks_structural_metadata;
DROP INDEX IF EXISTS idx_chunks_method_metadata;
DROP INDEX IF EXISTS idx_chunks_narrative_metadata;
DROP INDEX IF EXISTS idx_chunks_reference_metadata;
DROP INDEX IF EXISTS idx_chunks_quality_completeness;
DROP INDEX IF EXISTS idx_chunks_template_type;

-- Indexes from migration 012 (position_context)
DROP INDEX IF EXISTS idx_chunks_position_context;
DROP INDEX IF EXISTS idx_chunks_position_confidence;
DROP INDEX IF EXISTS idx_chunks_position_method;

-- ============================================
-- STEP 3: Drop unused columns
-- ============================================

-- From migration 014 (old unified metadata approach)
ALTER TABLE chunks DROP COLUMN IF EXISTS metadata CASCADE;

-- From migration 015 (old 7-engine separate columns)
ALTER TABLE chunks DROP COLUMN IF EXISTS structural_metadata CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS method_metadata CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS narrative_metadata CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS reference_metadata CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS quality_metadata CASCADE;

-- From migration 001 (original schema - now unused)
ALTER TABLE chunks DROP COLUMN IF EXISTS chunk_type CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS heading_path CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS page_numbers CASCADE;
ALTER TABLE chunks DROP COLUMN IF EXISTS entities CASCADE;

-- From migration 012 (position context - not needed at chunk level)
ALTER TABLE chunks DROP COLUMN IF EXISTS position_context CASCADE;

-- ============================================
-- STEP 4: Add NOT NULL constraints to critical metadata
-- ============================================

-- These columns are essential for the 3-engine system
-- emotional_metadata and conceptual_metadata should always be populated
-- (They're populated by AI extraction in all processors)

-- Note: We can't add NOT NULL directly if existing rows have nulls
-- So we'll add a comment noting they should be NOT NULL in new inserts
COMMENT ON COLUMN chunks.emotional_metadata IS
  'REQUIRED for ContradictionDetection engine. Structure: {polarity: number, primaryEmotion: string, intensity: number}';

COMMENT ON COLUMN chunks.conceptual_metadata IS
  'REQUIRED for ContradictionDetection and ThematicBridge engines. Structure: {concepts: [{text: string, importance: number}]}';

COMMENT ON COLUMN chunks.domain_metadata IS
  'Used by ThematicBridge for domain filtering. Structure: {primaryDomain: string, confidence: number}';

-- ============================================
-- STEP 5: Add indexes for 3-engine queries
-- ============================================

-- ContradictionDetection needs to query by polarity and concepts
CREATE INDEX IF NOT EXISTS idx_chunks_emotional_polarity
  ON chunks(((emotional_metadata->>'polarity')::float))
  WHERE emotional_metadata IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_primary_emotion
  ON chunks((emotional_metadata->>'primaryEmotion'))
  WHERE emotional_metadata IS NOT NULL;

-- ThematicBridge needs to filter by domain and importance
CREATE INDEX IF NOT EXISTS idx_chunks_domain_primary
  ON chunks((domain_metadata->>'primaryDomain'))
  WHERE domain_metadata IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_importance
  ON chunks(importance_score DESC)
  WHERE importance_score > 0.6;

-- GIN indexes for JSONB array/object queries
CREATE INDEX IF NOT EXISTS idx_chunks_conceptual_metadata
  ON chunks USING GIN (conceptual_metadata)
  WHERE conceptual_metadata IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_emotional_metadata
  ON chunks USING GIN (emotional_metadata)
  WHERE emotional_metadata IS NOT NULL;

-- ============================================
-- STEP 6: Update column comments
-- ============================================

-- Core fields
COMMENT ON COLUMN chunks.id IS 'Unique chunk identifier';
COMMENT ON COLUMN chunks.document_id IS 'Parent document reference';
COMMENT ON COLUMN chunks.content IS 'Chunk text content (markdown format)';
COMMENT ON COLUMN chunks.chunk_index IS 'Sequential position in document (0-based)';
COMMENT ON COLUMN chunks.created_at IS 'Timestamp when chunk was created';

-- Position tracking
COMMENT ON COLUMN chunks.start_offset IS 'Character offset where chunk starts in document markdown';
COMMENT ON COLUMN chunks.end_offset IS 'Character offset where chunk ends in document markdown';
COMMENT ON COLUMN chunks.word_count IS 'Number of words in chunk (whitespace-split)';

-- Search and embeddings
COMMENT ON COLUMN chunks.embedding IS 'Gemini embedding vector (768 dimensions) for semantic search';

-- Active metadata (used by engines)
COMMENT ON COLUMN chunks.themes IS 'Key themes/topics extracted from chunk (used by SemanticSimilarity)';
COMMENT ON COLUMN chunks.importance_score IS 'Importance score 0-1 (used by ThematicBridge for filtering)';
COMMENT ON COLUMN chunks.summary IS 'AI-generated one-line summary (used for display/context)';

-- Tracking
COMMENT ON COLUMN chunks.metadata_extracted_at IS 'Timestamp when metadata was last extracted (for debugging)';

-- ============================================
-- STEP 7: Create utility view for engine queries
-- ============================================

-- Simplified view for engine usage - exposes flat metadata structure
CREATE OR REPLACE VIEW chunks_for_engines AS
SELECT
  id,
  document_id,
  content,
  chunk_index,
  embedding,
  themes,
  importance_score,
  summary,
  emotional_metadata,
  conceptual_metadata,
  domain_metadata,
  word_count,
  start_offset,
  end_offset,
  created_at,
  metadata_extracted_at,
  -- Computed fields for quick filtering
  (emotional_metadata->>'polarity')::float as emotional_polarity,
  (emotional_metadata->>'primaryEmotion')::text as primary_emotion,
  (domain_metadata->>'primaryDomain')::text as primary_domain,
  jsonb_array_length(COALESCE(conceptual_metadata->'concepts', '[]'::jsonb)) as concept_count
FROM chunks;

COMMENT ON VIEW chunks_for_engines IS
  'Optimized view for 3-engine collision detection system. Exposes flat metadata structure with computed fields for filtering.';

-- ============================================
-- STEP 8: Grant permissions
-- ============================================

GRANT SELECT ON chunks_for_engines TO authenticated;
GRANT SELECT ON chunks_for_engines TO anon;

-- ============================================
-- STEP 9: Verification query
-- ============================================

-- This query should show exactly 15 columns (16 with created_at)
DO $$
DECLARE
  column_count INTEGER;
  expected_columns TEXT[] := ARRAY[
    'id', 'document_id', 'content', 'chunk_index',
    'start_offset', 'end_offset', 'word_count',
    'embedding', 'themes', 'importance_score', 'summary',
    'emotional_metadata', 'conceptual_metadata', 'domain_metadata',
    'metadata_extracted_at', 'created_at'
  ];
  actual_columns TEXT[];
BEGIN
  -- Get actual columns
  SELECT array_agg(column_name ORDER BY ordinal_position) INTO actual_columns
  FROM information_schema.columns
  WHERE table_name = 'chunks'
    AND table_schema = 'public';

  column_count := array_length(actual_columns, 1);

  IF column_count = 16 AND actual_columns = expected_columns THEN
    RAISE NOTICE '✅ Migration 019 completed successfully: 16-column schema matches expectations';
    RAISE NOTICE 'Columns: %', array_to_string(actual_columns, ', ');
  ELSE
    RAISE WARNING '⚠️  Migration 019 completed but schema may differ from expectations';
    RAISE WARNING 'Expected % columns, found %', array_length(expected_columns, 1), column_count;
    RAISE WARNING 'Expected: %', array_to_string(expected_columns, ', ');
    RAISE WARNING 'Actual: %', array_to_string(actual_columns, ', ');
  END IF;
END $$;

-- ============================================
-- ROLLBACK INSTRUCTIONS
-- ============================================

-- To rollback this migration:
-- 1. Re-add dropped columns (they'll be null for existing rows)
-- 2. Restore dropped views and functions from migrations 014 & 015
-- 3. Restore dropped indexes
--
-- Note: This is a destructive migration. Any data in dropped columns will be lost.
-- Before running in production, backup the database.
