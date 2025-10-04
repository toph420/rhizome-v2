-- Migration 028: Allow image uploads for cover images
-- Updates the documents bucket to accept image MIME types
-- Created: 2025-10-03

-- Update the documents bucket to allow image uploads
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/epub+zip',
  'text/markdown',
  'application/zip',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]::text[]
WHERE id = 'documents';
