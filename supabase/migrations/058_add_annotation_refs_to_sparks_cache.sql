-- Migration 058: Add annotation_refs to sparks_cache
--
-- Purpose: Store linked annotation IDs in cache for faster queries
-- This allows us to show linked annotations when reopening a spark for editing

-- Add annotation_refs column
ALTER TABLE sparks_cache
ADD COLUMN IF NOT EXISTS annotation_refs TEXT[] DEFAULT '{}';

COMMENT ON COLUMN sparks_cache.annotation_refs IS 'Array of annotation entity IDs linked to this spark';

-- Add index for querying by annotation references
CREATE INDEX IF NOT EXISTS idx_sparks_cache_annotation_refs
  ON sparks_cache USING gin(annotation_refs);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 058 complete: annotation_refs added to sparks_cache';
END $$;
