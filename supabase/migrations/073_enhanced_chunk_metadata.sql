-- Add enhanced metadata fields from Docling (Phase 2A)
-- Created: 2025-10-27
-- Purpose: Extract charspan, content_layer, and other rich metadata for improved annotation sync

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS charspan INT8RANGE,         -- Character offset range in cleaned markdown
ADD COLUMN IF NOT EXISTS content_layer TEXT,         -- BODY, FURNITURE, BACKGROUND, INVISIBLE, NOTES
ADD COLUMN IF NOT EXISTS content_label TEXT,         -- PARAGRAPH, CODE, FORMULA, LIST_ITEM, CAPTION, etc.
ADD COLUMN IF NOT EXISTS section_level INTEGER,      -- 1-100 heading level
ADD COLUMN IF NOT EXISTS list_enumerated BOOLEAN,    -- True for numbered lists
ADD COLUMN IF NOT EXISTS list_marker TEXT,           -- "1.", "•", "a)", etc.
ADD COLUMN IF NOT EXISTS code_language TEXT,         -- Programming language
ADD COLUMN IF NOT EXISTS hyperlink TEXT;             -- URL or file path

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_chunks_content_layer
  ON chunks(content_layer)
  WHERE content_layer IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_content_label
  ON chunks(content_label)
  WHERE content_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_charspan
  ON chunks USING gist(charspan)
  WHERE charspan IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN chunks.charspan IS 'Character offset range in cleaned markdown (before Chonkie chunking) - enables 99%+ annotation accuracy';
COMMENT ON COLUMN chunks.content_layer IS 'Document layer: BODY (main content), FURNITURE (headers/footers), BACKGROUND, INVISIBLE, NOTES';
COMMENT ON COLUMN chunks.content_label IS 'Content type: PARAGRAPH, CODE, FORMULA, LIST_ITEM, CAPTION, etc.';
COMMENT ON COLUMN chunks.section_level IS 'Explicit section level (1-100) from Docling structure';
COMMENT ON COLUMN chunks.list_enumerated IS 'Whether list is enumerated (numbered) - useful for list detection';
COMMENT ON COLUMN chunks.list_marker IS 'List marker character/string - "1.", "•", "a)", etc.';
COMMENT ON COLUMN chunks.code_language IS 'Programming language for code blocks - enables syntax highlighting';
COMMENT ON COLUMN chunks.hyperlink IS 'Hyperlink URL or file path - preserved from source document';
