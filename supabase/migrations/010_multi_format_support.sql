-- Migration 010: Multi-Format Document Processing Support
-- Adds support for YouTube, web articles, markdown files, and pasted content

-- Add new columns to documents table
ALTER TABLE documents 
  ADD COLUMN source_url TEXT,
  ADD COLUMN processing_requested BOOLEAN DEFAULT true;

-- Add timestamp support to chunks table
ALTER TABLE chunks
  ADD COLUMN timestamps JSONB;

-- Add indexes for performance
CREATE INDEX idx_documents_source_url ON documents(source_url) 
  WHERE source_url IS NOT NULL;
CREATE INDEX idx_chunks_timestamps ON chunks USING GIN (timestamps) 
  WHERE timestamps IS NOT NULL;

-- Update source_type constraint to include new types
ALTER TABLE documents 
  DROP CONSTRAINT IF EXISTS documents_source_type_check;

ALTER TABLE documents
  ADD CONSTRAINT documents_source_type_check 
  CHECK (source_type IN (
    'pdf', 
    'markdown_asis', 
    'markdown_clean', 
    'txt', 
    'youtube', 
    'web_url', 
    'paste'
  ));

-- Add documentation comments
COMMENT ON COLUMN documents.source_url IS 
  'Source URL for YouTube videos or web articles. Null for uploaded files.';
COMMENT ON COLUMN documents.processing_requested IS 
  'For markdown files: true = AI cleanup, false = save as-is';
COMMENT ON COLUMN chunks.timestamps IS 
  'JSONB array of timestamp objects with time, context_before, context_after fields for YouTube videos';