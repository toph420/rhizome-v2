-- Migration 057: Spark recovery fields and sparks_cache updates
--
-- Changes:
-- 1. Add recovery fields to components table (if not exist)
-- 2. Update sparks_cache table with selections column
-- 3. Add indexes for recovery queries

-- 1. Ensure recovery fields exist on components table
-- (These may already exist from annotation recovery - idempotent)
DO $$
BEGIN
  -- Add recovery_method if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'recovery_method'
  ) THEN
    ALTER TABLE components ADD COLUMN recovery_method TEXT;

    ALTER TABLE components
    ADD CONSTRAINT components_recovery_method_check
    CHECK (recovery_method IS NULL OR recovery_method IN ('exact', 'context', 'chunk_bounded', 'trigram', 'semantic', 'selections', 'orphaned', 'manual', 'lost'));

    COMMENT ON COLUMN components.recovery_method IS 'Recovery method: exact, context, chunk_bounded, trigram, semantic, selections, orphaned, manual, lost';
  END IF;

  -- Add recovery_confidence if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'recovery_confidence'
  ) THEN
    ALTER TABLE components ADD COLUMN recovery_confidence FLOAT;

    ALTER TABLE components
    ADD CONSTRAINT components_recovery_confidence_check
    CHECK (recovery_confidence IS NULL OR (recovery_confidence >= 0.0 AND recovery_confidence <= 1.0));

    COMMENT ON COLUMN components.recovery_confidence IS 'Recovery confidence (0.0-1.0). >0.85=auto-recovered, 0.70-0.85=needs review, <0.70=lost';
  END IF;

  -- Add needs_review if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'components' AND column_name = 'needs_review'
  ) THEN
    ALTER TABLE components ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;

    COMMENT ON COLUMN components.needs_review IS 'True if entity needs manual review after recovery';
  END IF;
END $$;

-- 2. Update sparks_cache table with selections column
ALTER TABLE sparks_cache
ADD COLUMN IF NOT EXISTS selections JSONB DEFAULT '[]';

COMMENT ON COLUMN sparks_cache.selections IS 'Array of SparkSelection objects (text, chunkId, offsets, textContext)';

-- 3. Add indexes for recovery queries
CREATE INDEX IF NOT EXISTS idx_components_needs_review
  ON components(needs_review)
  WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS idx_components_recovery_method
  ON components(recovery_method)
  WHERE recovery_method IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_components_recovery_confidence
  ON components(recovery_confidence)
  WHERE recovery_confidence IS NOT NULL;

-- 4. Add index on sparks_cache for selections queries
CREATE INDEX IF NOT EXISTS idx_sparks_cache_selections
  ON sparks_cache USING gin(selections);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 057 complete: Spark recovery fields added';
END $$;
