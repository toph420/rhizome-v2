-- Migration: 045_add_local_pipeline_columns.sql
-- Purpose: Add structural metadata and quality tracking for local pipeline
-- Related: Local Processing Pipeline v1 - Phase 1 Task 1

-- Add columns to chunks table for structural metadata
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS page_start INTEGER,
ADD COLUMN IF NOT EXISTS page_end INTEGER,
ADD COLUMN IF NOT EXISTS heading_level INTEGER,
ADD COLUMN IF NOT EXISTS section_marker TEXT,
ADD COLUMN IF NOT EXISTS bboxes JSONB,
ADD COLUMN IF NOT EXISTS position_confidence TEXT CHECK (position_confidence IN ('exact', 'high', 'medium', 'synthetic')),
ADD COLUMN IF NOT EXISTS position_method TEXT,
ADD COLUMN IF NOT EXISTS position_validated BOOLEAN DEFAULT false;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chunks_pages ON chunks(document_id, page_start, page_end);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON chunks(document_id, section_marker);
CREATE INDEX IF NOT EXISTS idx_chunks_confidence ON chunks(position_confidence);

-- Add comments for documentation
COMMENT ON COLUMN chunks.page_start IS 'Starting page number from PDF (for citations)';
COMMENT ON COLUMN chunks.page_end IS 'Ending page number from PDF (for citations)';
COMMENT ON COLUMN chunks.heading_level IS 'TOC hierarchy depth (1 = top level)';
COMMENT ON COLUMN chunks.section_marker IS 'For EPUB citations (e.g., chapter_003)';
COMMENT ON COLUMN chunks.bboxes IS 'PDF coordinates for highlighting [{page, l, t, r, b}]';
COMMENT ON COLUMN chunks.position_confidence IS 'Quality of chunk position matching';
COMMENT ON COLUMN chunks.position_method IS 'Which matching layer succeeded (exact_match, embedding_match, etc)';
COMMENT ON COLUMN chunks.position_validated IS 'User manually validated position';
