-- Migration: Remove unused charspan field
--
-- Context: Charspan was planned for 99% accurate annotation positioning by narrowing
-- search windows in docling.md. However, the feature was never implemented due to
-- coordinate system complexity (charspan points to docling.md, but chunk offsets
-- point to content.md - different files with different text).
--
-- Current annotation positioning uses fuzzy matching with 90-95% accuracy without
-- charspan, making this field dead code that wastes storage and creates confusion.
--
-- Impact: Removes ~20-30 bytes per chunk + GiST index overhead. No functional loss.

-- Drop the unused GiST index (never queried)
DROP INDEX IF EXISTS idx_chunks_charspan;

-- Remove charspan column from chunks table
ALTER TABLE chunks DROP COLUMN IF EXISTS charspan;

-- Note: cached_chunks.chunks is JSONB (schemaless), so old charspan values
-- in existing cached data will simply be ignored after this migration.
-- No explicit JSONB cleanup needed.
