-- Add position_context for fuzzy matching metadata
-- Enables precise chunk positioning for YouTube transcripts with confidence scores

ALTER TABLE chunks
  ADD COLUMN position_context JSONB,
  ADD COLUMN word_count INTEGER;

-- Create GIN index on position_context for efficient JSONB queries
CREATE INDEX idx_chunks_position_context ON chunks USING GIN (position_context);

-- Create functional indexes for confidence-based queries
CREATE INDEX idx_chunks_position_confidence ON chunks(((position_context->>'confidence')::float))
  WHERE position_context IS NOT NULL;

-- Create index for method-based filtering
CREATE INDEX idx_chunks_position_method ON chunks((position_context->>'method'))
  WHERE position_context IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN chunks.position_context IS 
  'Fuzzy matching metadata: {confidence: float, method: "exact"|"fuzzy"|"approximate", context_before: string, context_after: string}';

COMMENT ON COLUMN chunks.word_count IS 
  'Word count of chunk content (whitespace-split)';