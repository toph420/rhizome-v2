import type { DoclingChunk, DoclingStructure } from '../lib/docling-extractor.js'

/**
 * Cached Docling extraction result stored in database.
 * Replaces temporary storage in background_jobs.metadata.
 *
 * Lifecycle: Created once per document, survives job deletion.
 * Invalidation: Markdown hash mismatch triggers cache invalidation.
 */
export interface CachedChunksRow {
  id: string
  document_id: string
  extraction_mode: 'pdf' | 'epub'
  markdown_hash: string
  docling_version: string | null
  chunks: DoclingChunk[]  // Full structural metadata preserved
  structure: DoclingStructure
  created_at: string
  updated_at: string
}

/**
 * Input for creating/updating cached chunks.
 * Used by processors after Docling extraction.
 */
export interface CachedChunksInput {
  document_id: string
  extraction_mode: 'pdf' | 'epub'
  markdown_hash: string
  docling_version?: string
  chunks: DoclingChunk[]
  structure: DoclingStructure
}

/**
 * Result from loading cached chunks.
 * Null if cache doesn't exist or hash mismatch.
 */
export interface CachedChunksResult {
  chunks: DoclingChunk[]
  structure: DoclingStructure
  extraction_mode: 'pdf' | 'epub'
  created_at: string
}
