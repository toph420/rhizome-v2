-- Migration 024: Annotation System Performance Indexes
-- Purpose: Optimized indexes for annotation queries and multi-chunk support
-- Date: 2025-10-02
-- Task: T-001 from annotation-system task breakdown

-- ============================================
-- POSITION COMPONENT: Composite Index for Range Queries
-- ============================================

-- Fast lookup by document + offset range for annotations
-- This enables efficient queries like "get all annotations in document X between offsets Y and Z"
CREATE INDEX IF NOT EXISTS idx_components_position_range ON components(
  (data->>'documentId'),
  ((data->>'startOffset')::INTEGER),
  ((data->>'endOffset')::INTEGER)
) WHERE component_type = 'Position';

-- Additional index for just document + start offset (common query pattern)
CREATE INDEX IF NOT EXISTS idx_components_position_start ON components(
  (data->>'documentId'),
  ((data->>'startOffset')::INTEGER)
) WHERE component_type = 'Position';

-- ============================================
-- CHUNKREF COMPONENT: GIN Index for Array Queries
-- ============================================

-- Note: Current schema uses single chunkId, but task requires multi-chunk support
-- This migration prepares for chunkIds array in ChunkRef component
-- The GIN index will work when chunkIds is added as a JSONB array

-- GIN index for array containment queries (when chunkIds array is added)
-- Example query: WHERE data->'chunkIds' ? 'chunk-123'
CREATE INDEX IF NOT EXISTS idx_components_chunkref_array ON components
USING GIN ((data->'chunkIds'))
WHERE component_type = 'ChunkRef';

-- Standard index for backward compatibility with single chunkId
CREATE INDEX IF NOT EXISTS idx_components_chunkref_single ON components(
  (data->>'chunkId')
) WHERE component_type = 'ChunkRef';

-- ============================================
-- VISUAL COMPONENT: Fast Color/Type Queries
-- ============================================

-- Index for filtering by highlight color
CREATE INDEX IF NOT EXISTS idx_components_visual_color ON components(
  (data->>'color')
) WHERE component_type = 'Visual';

-- Index for filtering by visual type
CREATE INDEX IF NOT EXISTS idx_components_visual_type ON components(
  (data->>'type')
) WHERE component_type = 'Visual';

-- ============================================
-- ENTITY LOOKUPS: Composite Indexes
-- ============================================

-- Fast entity queries by user + component type
CREATE INDEX IF NOT EXISTS idx_components_user_type ON components(
  entity_id,
  component_type
);

-- Fast entity queries with document filter
CREATE INDEX IF NOT EXISTS idx_components_entity_document ON components(
  entity_id,
  document_id
) WHERE document_id IS NOT NULL;

-- ============================================
-- HELPER FUNCTION: Find Annotations by Offset Range
-- ============================================

CREATE OR REPLACE FUNCTION find_annotations_in_range(
  doc_id TEXT,
  start_offset INTEGER,
  end_offset INTEGER
)
RETURNS TABLE(
  entity_id UUID,
  start_pos INTEGER,
  end_pos INTEGER,
  original_text TEXT,
  color TEXT,
  note TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    pos.entity_id,
    (pos.data->>'startOffset')::INTEGER AS start_pos,
    (pos.data->>'endOffset')::INTEGER AS end_pos,
    pos.data->>'originalText' AS original_text,
    vis.data->>'color' AS color,
    cont.data->>'note' AS note
  FROM components pos
  INNER JOIN components vis ON vis.entity_id = pos.entity_id AND vis.component_type = 'Visual'
  LEFT JOIN components cont ON cont.entity_id = pos.entity_id AND cont.component_type = 'Content'
  WHERE pos.component_type = 'Position'
    AND pos.data->>'documentId' = doc_id
    AND (
      -- Annotation overlaps with range
      ((pos.data->>'startOffset')::INTEGER < end_offset)
      AND ((pos.data->>'endOffset')::INTEGER > start_offset)
    )
  ORDER BY start_pos;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON INDEX idx_components_position_range IS 'Composite index for efficient annotation range queries';
COMMENT ON INDEX idx_components_chunkref_array IS 'GIN index for multi-chunk annotation queries (chunkIds array)';
COMMENT ON INDEX idx_components_visual_color IS 'Index for filtering annotations by highlight color';
COMMENT ON FUNCTION find_annotations_in_range IS 'Finds all annotations overlapping a given offset range';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
  position_indexes INTEGER;
  chunkref_indexes INTEGER;
  visual_indexes INTEGER;
  function_exists BOOLEAN;
BEGIN
  -- Check Position indexes
  SELECT COUNT(*) INTO position_indexes
  FROM pg_indexes
  WHERE tablename = 'components'
  AND indexname IN ('idx_components_position_range', 'idx_components_position_start');

  -- Check ChunkRef indexes
  SELECT COUNT(*) INTO chunkref_indexes
  FROM pg_indexes
  WHERE tablename = 'components'
  AND indexname IN ('idx_components_chunkref_array', 'idx_components_chunkref_single');

  -- Check Visual indexes
  SELECT COUNT(*) INTO visual_indexes
  FROM pg_indexes
  WHERE tablename = 'components'
  AND indexname IN ('idx_components_visual_color', 'idx_components_visual_type');

  -- Check function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'find_annotations_in_range'
  ) INTO function_exists;

  IF position_indexes = 2 AND chunkref_indexes = 2 AND visual_indexes = 2 AND function_exists THEN
    RAISE NOTICE '✅ Migration 024 completed successfully';
    RAISE NOTICE '  - Position indexes: %', position_indexes;
    RAISE NOTICE '  - ChunkRef indexes: %', chunkref_indexes;
    RAISE NOTICE '  - Visual indexes: %', visual_indexes;
    RAISE NOTICE '  - Helper function: created';
  ELSE
    RAISE WARNING '❌ Migration 024 incomplete: position=%, chunkref=%, visual=%, function=%',
      position_indexes, chunkref_indexes, visual_indexes, function_exists;
  END IF;
END $$;
