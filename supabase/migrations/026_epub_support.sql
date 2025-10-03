-- Migration 026: EPUB Support and Universal Document Metadata
-- Adds EPUB-specific fields that also apply to PDFs and other formats
-- Created: 2025-10-03

-- Add universal metadata fields for all document types
-- These fields apply to EPUBs, PDFs, and any format with embedded metadata
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS isbn TEXT,
  ADD COLUMN IF NOT EXISTS publisher TEXT,
  ADD COLUMN IF NOT EXISTS publication_date DATE,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add index for ISBN lookups (useful for deduplication and library management)
CREATE INDEX IF NOT EXISTS idx_documents_isbn
  ON documents(isbn)
  WHERE isbn IS NOT NULL;

-- Add index for publisher (useful for filtering technical books, academic papers)
CREATE INDEX IF NOT EXISTS idx_documents_publisher
  ON documents(publisher)
  WHERE publisher IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN documents.isbn IS 'ISBN from EPUB/PDF metadata (10 or 13 digit)';
COMMENT ON COLUMN documents.publisher IS 'Publisher from EPUB/PDF metadata (e.g., O''Reilly, Springer)';
COMMENT ON COLUMN documents.publication_date IS 'Publication date from EPUB/PDF metadata';
COMMENT ON COLUMN documents.language IS 'Language code from document metadata (ISO 639-1, e.g., en, es, fr)';
COMMENT ON COLUMN documents.description IS 'Book/document description from metadata';
