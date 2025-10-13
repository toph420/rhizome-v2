-- Migration 047: Extend chunks table with Docling structural metadata
-- Phase 3 of Docling Optimization v1
-- These fields enhance citations, filtering, and embeddings quality

-- Add heading hierarchy (most important for context)
-- Example: ['Chapter 3', 'Results', 'Discussion']
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS heading_path TEXT[];

-- Add heading level (depth in heading tree)
-- Example: 1 = top-level chapter, 2 = section, 3 = subsection
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS heading_level INTEGER;

-- Add section marker (for EPUBs)
-- Example: 'chapter_003', 'part_02_section_05'
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS section_marker TEXT;

-- Create indexes for efficient querying

-- GIN index for heading hierarchy queries
-- Supports queries like: WHERE heading_path @> ARRAY['Chapter 1']
CREATE INDEX IF NOT EXISTS idx_chunks_heading_path
  ON chunks USING GIN (heading_path);

-- B-tree index for heading level filtering
-- Supports queries like: WHERE heading_level = 1 (top-level headings only)
CREATE INDEX IF NOT EXISTS idx_chunks_heading_level
  ON chunks (document_id, heading_level)
  WHERE heading_level IS NOT NULL;

-- B-tree index for EPUB section navigation
-- Supports queries like: WHERE section_marker = 'chapter_003'
CREATE INDEX IF NOT EXISTS idx_chunks_section
  ON chunks (document_id, section_marker)
  WHERE section_marker IS NOT NULL;

-- Add column documentation
COMMENT ON COLUMN chunks.heading_path IS
  'Heading hierarchy from Docling (e.g., ["Chapter 3", "Results", "Discussion"]). Used for metadata-enhanced embeddings and citations.';

COMMENT ON COLUMN chunks.heading_level IS
  'Depth in heading tree (1 = top-level, 2 = section, 3 = subsection). Used for filtering by document structure.';

COMMENT ON COLUMN chunks.section_marker IS
  'Section identifier for EPUBs (e.g., "chapter_003", "part_02_section_05"). Used for EPUB navigation and citations.';
