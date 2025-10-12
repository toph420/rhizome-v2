import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import type { CachedChunksInput, CachedChunksResult } from '../types/cached-chunks.js'
import type { DoclingChunk, DoclingStructure } from './docling-extractor.js'

/**
 * Generate SHA256 hash of markdown for cache validation.
 * Used to detect when source document has changed.
 *
 * @param markdown - Source markdown content
 * @returns Hex-encoded SHA256 hash
 */
export function hashMarkdown(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

/**
 * Save Docling extraction results to cache.
 * Upserts on document_id (UNIQUE constraint).
 * Non-fatal: Logs warning if save fails but doesn't throw.
 *
 * @param supabase - Supabase client (service role)
 * @param input - Cached chunks data
 */
export async function saveCachedChunks(
  supabase: ReturnType<typeof createClient>,
  input: CachedChunksInput
): Promise<void> {
  try {
    const { error } = await supabase
      .from('cached_chunks')
      .upsert({
        document_id: input.document_id,
        extraction_mode: input.extraction_mode,
        markdown_hash: input.markdown_hash,
        docling_version: input.docling_version || null,
        chunks: input.chunks as any,
        structure: input.structure as any,
        updated_at: new Date().toISOString()
      } as any, {
        onConflict: 'document_id'
      })

    if (error) {
      console.warn(`[CachedChunks] Failed to save cache for ${input.document_id}:`, error.message)
      return // Non-fatal: processing continues even if cache save fails
    }

    console.log(`[CachedChunks] ✓ Saved ${input.chunks.length} chunks for document ${input.document_id}`)
    console.log(`[CachedChunks]   Mode: ${input.extraction_mode}, Hash: ${input.markdown_hash.slice(0, 8)}...`)

  } catch (error) {
    console.warn(`[CachedChunks] Exception saving cache:`, error)
    // Non-fatal: continue processing
  }
}

/**
 * Load cached chunks for document.
 * Validates markdown hash to ensure cache is current.
 * Returns null if cache doesn't exist or hash mismatch.
 *
 * @param supabase - Supabase client (service role)
 * @param documentId - Document UUID
 * @param currentMarkdownHash - Hash of current markdown for validation
 * @returns Cached chunks or null if invalid/missing
 */
export async function loadCachedChunks(
  supabase: ReturnType<typeof createClient>,
  documentId: string,
  currentMarkdownHash: string
): Promise<CachedChunksResult | null> {
  try {
    const { data, error } = await supabase
      .from('cached_chunks')
      .select('*')
      .eq('document_id', documentId)
      .single()

    if (error || !data) {
      console.log(`[CachedChunks] No cache found for document ${documentId}`)
      return null
    }

    const cacheData = data as any

    // Validate markdown hasn't changed
    if (cacheData.markdown_hash !== currentMarkdownHash) {
      console.warn(`[CachedChunks] ⚠️  Cache invalid (markdown changed) for document ${documentId}`)
      console.warn(`[CachedChunks]   Cached: ${cacheData.markdown_hash.slice(0, 8)}... | Current: ${currentMarkdownHash.slice(0, 8)}...`)
      return null
    }

    console.log(`[CachedChunks] ✓ Loaded ${cacheData.chunks.length} cached chunks for document ${documentId}`)
    console.log(`[CachedChunks]   Mode: ${cacheData.extraction_mode}, Created: ${cacheData.created_at}`)

    return {
      chunks: cacheData.chunks as DoclingChunk[],
      structure: cacheData.structure as DoclingStructure,
      extraction_mode: cacheData.extraction_mode,
      created_at: cacheData.created_at
    }

  } catch (error) {
    console.error(`[CachedChunks] Exception loading cache:`, error)
    return null
  }
}

/**
 * Load cached chunks without hash validation.
 * Used during reprocessing when we know markdown has changed and we'll use bulletproof matching.
 *
 * @param supabase - Supabase client (service role)
 * @param documentId - Document UUID
 * @returns Cached chunks or null if not found
 */
export async function loadCachedChunksRaw(
  supabase: ReturnType<typeof createClient>,
  documentId: string
): Promise<CachedChunksResult | null> {
  try {
    const { data, error } = await supabase
      .from('cached_chunks')
      .select('*')
      .eq('document_id', documentId)
      .single()

    if (error || !data) {
      console.log(`[CachedChunks] No cache found for document ${documentId}`)
      return null
    }

    const cacheData = data as any

    console.log(`[CachedChunks] ✓ Loaded ${cacheData.chunks.length} cached chunks (no hash validation)`)
    console.log(`[CachedChunks]   Mode: ${cacheData.extraction_mode}, Created: ${cacheData.created_at}`)

    return {
      chunks: cacheData.chunks as DoclingChunk[],
      structure: cacheData.structure as DoclingStructure,
      extraction_mode: cacheData.extraction_mode,
      created_at: cacheData.created_at
    }

  } catch (error) {
    console.error(`[CachedChunks] Exception loading cache:`, error)
    return null
  }
}

/**
 * Delete cached chunks for document.
 * Used for manual cache invalidation or cleanup.
 *
 * @param supabase - Supabase client (service role)
 * @param documentId - Document UUID
 */
export async function deleteCachedChunks(
  supabase: ReturnType<typeof createClient>,
  documentId: string
): Promise<void> {
  const { error } = await supabase
    .from('cached_chunks')
    .delete()
    .eq('document_id', documentId)

  if (error) {
    console.warn(`[CachedChunks] Failed to delete cache for ${documentId}:`, error.message)
  } else {
    console.log(`[CachedChunks] ✓ Deleted cache for document ${documentId}`)
  }
}
