-- Migration 027: Add EPUB to source_type check constraint
-- Updates the check constraint to allow 'epub' as a valid source type
-- Created: 2025-10-03

-- Drop the old constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_type_check;

-- Add new constraint with epub included
ALTER TABLE documents ADD CONSTRAINT documents_source_type_check
  CHECK (source_type IN (
    'pdf',
    'epub',
    'youtube',
    'web_url',
    'markdown_asis',
    'markdown_clean',
    'txt',
    'paste'
  ));
