-- Migration 030: Multi-chunk annotation support
-- Purpose: Enable annotations to span multiple chunks for connection graphs
-- Date: 2025-10-04

-- ============================================
-- COMPONENTS: Add Multi-Chunk Support
-- ============================================

-- Add chunk_ids array to source components
-- Uses UUID array for flexibility with ECS pattern
ALTER TABLE components
  ADD COLUMN IF NOT EXISTS chunk_ids UUID[];

-- Backfill existing data (single chunk to array)
UPDATE components
SET chunk_ids = ARRAY[(data->>'chunk_id')::UUID]
WHERE component_type = 'source'
  AND chunk_ids IS NULL
  AND data->>'chunk_id' IS NOT NULL;

-- Create GIN index for efficient array queries
CREATE INDEX IF NOT EXISTS idx_components_chunk_ids
  ON components USING GIN (chunk_ids)
  WHERE component_type = 'source';

-- ============================================
-- CONNECTION GRAPH HELPER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION find_annotation_connections(chunk_ids UUID[])
RETURNS TABLE (
  id UUID,
  source_chunk_id UUID,
  target_chunk_id UUID,
  strength FLOAT,
  connection_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.source_chunk_id,
    c.target_chunk_id,
    c.strength,
    c.connection_type
  FROM connections c
  WHERE c.source_chunk_id = ANY(chunk_ids)
     OR c.target_chunk_id = ANY(chunk_ids);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN components.chunk_ids IS 'Array of chunk UUIDs for multi-chunk annotations (source component only)';
COMMENT ON FUNCTION find_annotation_connections IS 'Find all connections for annotation spanning multiple chunks';

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
  chunk_ids_exists BOOLEAN;
  index_exists BOOLEAN;
  backfill_count INTEGER;
BEGIN
  -- Check column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'chunk_ids'
  ) INTO chunk_ids_exists;

  -- Check index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'components' AND indexname = 'idx_components_chunk_ids'
  ) INTO index_exists;

  -- Check backfill count
  SELECT COUNT(*) INTO backfill_count
  FROM components
  WHERE component_type = 'source' AND chunk_ids IS NOT NULL;

  IF chunk_ids_exists AND index_exists THEN
    RAISE NOTICE 'Migration 030 completed successfully. Backfilled % source components.', backfill_count;
  ELSE
    RAISE WARNING 'Migration 030 incomplete: column=%, index=%', chunk_ids_exists, index_exists;
  END IF;
END $$;
