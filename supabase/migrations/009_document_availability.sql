-- Add progressive availability tracking to documents table
ALTER TABLE documents 
  ADD COLUMN markdown_available BOOLEAN DEFAULT false,
  ADD COLUMN embeddings_available BOOLEAN DEFAULT false,
  ADD COLUMN processing_stage TEXT; -- 'download', 'extract', 'save_markdown', 'embed', 'complete'

-- Index for filtering by processing status
CREATE INDEX idx_documents_processing_stage ON documents(processing_stage);