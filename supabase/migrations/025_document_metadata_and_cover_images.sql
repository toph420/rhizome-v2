-- Add document metadata fields for preview and type-specific processing
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT,
  ADD COLUMN IF NOT EXISTS publication_year INTEGER,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS detected_metadata JSONB;

-- Add comment explaining document_type values
COMMENT ON COLUMN documents.document_type IS 'Document type for chunking: fiction, nonfiction_book, academic_paper, technical_manual, article, essay';
