-- Migration 039: Fix Markdown Path Alignment
-- Corrects markdown_path to match actual storage pattern
--
-- Issue: Migration 031 incorrectly set markdown_path to 'documents/{id}/content.md'
-- Reality: Markdown is stored at '{userId}/{documentId}/content.md' = '{storage_path}/content.md'
-- Impact: Broke Obsidian sync and annotation export features

-- Fix markdown_path for all existing documents
-- Pattern: storage_path is 'userId/documentId', so markdown is at 'userId/documentId/content.md'
UPDATE documents
SET markdown_path = storage_path || '/content.md'
WHERE markdown_available = true
  AND storage_path IS NOT NULL
  AND (markdown_path IS NULL OR markdown_path != storage_path || '/content.md');

-- Update documentation comment to reflect correct pattern
COMMENT ON COLUMN documents.markdown_path IS 'Full path to markdown file in Supabase Storage (pattern: {storage_path}/content.md = {userId}/{documentId}/content.md)';
COMMENT ON COLUMN documents.storage_path IS 'Document folder path in Supabase Storage (pattern: {userId}/{documentId})';
