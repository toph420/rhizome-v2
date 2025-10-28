-- Phase 2B: Text Formatting Enhancement
-- Add text formatting metadata to chunks for rich markdown export

-- Add formatting JSONB field
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS formatting JSONB;

-- Add index for querying by formatting properties
CREATE INDEX IF NOT EXISTS idx_chunks_formatting
  ON chunks USING gin(formatting)
  WHERE formatting IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN chunks.formatting IS 'Text formatting metadata from Docling: {bold, italic, underline, strikethrough, script}. Script values: baseline, sub (subscript), super (superscript). Used for rich markdown export.';

-- Example formatting structure:
-- {
--   "bold": true,
--   "italic": false,
--   "underline": false,
--   "strikethrough": false,
--   "script": "baseline" | "sub" | "super"
-- }
