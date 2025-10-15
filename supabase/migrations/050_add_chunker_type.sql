-- Migration 050: Add chunker_type support for Chonkie integration
-- Created: 2025-10-15
-- Purpose: Track which chunker was used for each chunk and enable user preferences

-- Add chunker_type column to chunks table
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS chunker_type TEXT NOT NULL DEFAULT 'hybrid'
CHECK (chunker_type IN (
  'hybrid',     -- Old HybridChunker (deprecated, for backward compatibility)
  'token',      -- Chonkie TokenChunker
  'sentence',   -- Chonkie SentenceChunker
  'recursive',  -- Chonkie RecursiveChunker (recommended default)
  'semantic',   -- Chonkie SemanticChunker
  'late',       -- Chonkie LateChunker
  'code',       -- Chonkie CodeChunker
  'neural',     -- Chonkie NeuralChunker
  'slumber',    -- Chonkie SlumberChunker
  'table'       -- Chonkie TableChunker
));

-- Add token_count column for Chonkie chunks
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS token_count INTEGER;

-- Add metadata transfer quality columns
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS metadata_overlap_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata_confidence TEXT DEFAULT 'high'
CHECK (metadata_confidence IN ('high', 'medium', 'low')),
ADD COLUMN IF NOT EXISTS metadata_interpolated BOOLEAN DEFAULT false;

-- Add chunker selection to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS chunker_type TEXT DEFAULT 'recursive'
CHECK (chunker_type IN (
  'hybrid', 'token', 'sentence', 'recursive', 'semantic',
  'late', 'code', 'neural', 'slumber', 'table'
));

-- Add default chunker preference to user_preferences
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS default_chunker_type TEXT DEFAULT 'recursive'
CHECK (default_chunker_type IN (
  'hybrid', 'token', 'sentence', 'recursive', 'semantic',
  'late', 'code', 'neural', 'slumber', 'table'
));

-- Add indexes for querying by chunker type
CREATE INDEX IF NOT EXISTS idx_chunks_chunker_type ON chunks(chunker_type);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_chunker ON chunks(document_id, chunker_type);
CREATE INDEX IF NOT EXISTS idx_documents_chunker_type ON documents(chunker_type);

-- Add indexes for metadata transfer quality
CREATE INDEX IF NOT EXISTS idx_chunks_metadata_confidence ON chunks(metadata_confidence);
CREATE INDEX IF NOT EXISTS idx_chunks_interpolated ON chunks(metadata_interpolated) WHERE metadata_interpolated = true;

-- Add comments
COMMENT ON COLUMN chunks.token_count IS 'Token count from Chonkie chunker (respects chunk_size limit)';
COMMENT ON COLUMN chunks.chunker_type IS 'Chonkie chunker strategy used (recursive default)';
COMMENT ON COLUMN chunks.metadata_overlap_count IS 'Number of Docling chunks that overlapped (0 = interpolated)';
COMMENT ON COLUMN chunks.metadata_confidence IS 'Confidence in metadata transfer (high/medium/low based on overlaps)';
COMMENT ON COLUMN chunks.metadata_interpolated IS 'True if metadata was interpolated from neighbors (no overlaps)';
COMMENT ON COLUMN documents.chunker_type IS 'Chonkie chunker strategy selected by user';
COMMENT ON COLUMN user_preferences.default_chunker_type IS 'User default Chonkie chunker preference';
