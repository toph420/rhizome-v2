-- Migration 031: Document Paths for Storage and Obsidian Integration
-- Add markdown_path and obsidian_path columns to documents table
-- Purpose: Track storage paths for markdown files and Obsidian vault integration

-- Add markdown_path column (path to content.md in Supabase Storage)
ALTER TABLE documents
ADD COLUMN markdown_path TEXT;

-- Add obsidian_path column (relative path in Obsidian vault)
ALTER TABLE documents
ADD COLUMN obsidian_path TEXT;

-- Create index for fast lookups by markdown_path
CREATE INDEX idx_documents_markdown_path ON documents(markdown_path)
WHERE markdown_path IS NOT NULL;

-- Create index for fast lookups by obsidian_pathwork
CREATE INDEX idx_documents_obsidian_path ON documents(obsidian_path)
WHERE obsidian_path IS NOT NULL;

-- Populate markdown_path for existing documents
-- Pattern: documents/{document_id}/content.md
UPDATE documents
SET markdown_path = 'documents/' || id || '/content.md'
WHERE markdown_available = true
AND markdown_path IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN documents.markdown_path IS 'Path to processed markdown file in Supabase Storage (e.g., documents/{id}/content.md)';
COMMENT ON COLUMN documents.obsidian_path IS 'Relative path in Obsidian vault for bidirectional sync (e.g., Rhizome/{title}.md)';
