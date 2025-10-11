-- Migration 042: Allow JSON files for annotation exports
-- Adds application/json to allowed MIME types for .annotations.json files
-- Created: 2025-10-05

-- Update the documents bucket to allow JSON uploads (for annotation exports)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/epub+zip',
  'text/markdown',
  'application/zip',
  'application/json',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]::text[]
WHERE id = 'documents';
