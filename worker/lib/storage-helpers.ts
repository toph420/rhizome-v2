/**
 * Storage Helper Functions for Storage-First Portability System.
 *
 * Provides standardized operations for saving/reading JSON data to/from Supabase Storage.
 * All functions follow non-fatal error handling: log warnings but don't throw (processing continues).
 *
 * See: docs/prps/storage-first-portability.md
 * Pattern reference: worker/lib/cached-chunks.ts
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Save JSON data to Supabase Storage.
 * CRITICAL: Wraps data in Blob to preserve JSON formatting.
 *
 * Error handling: Non-fatal (logs warning, doesn't throw).
 *
 * @param supabase - Supabase client (service role)
 * @param path - Storage path (e.g., "userId/documentId/chunks.json")
 * @param data - JSON-serializable data
 * @param options - Optional configuration
 *
 * @example
 * ```typescript
 * await saveToStorage(supabase, "user-id/doc-id/chunks.json", {
 *   version: "1.0",
 *   chunks: [...]
 * })
 * ```
 */
export async function saveToStorage(
  supabase: SupabaseClient,
  path: string,
  data: unknown,
  options?: { upsert?: boolean }
): Promise<void> {
  try {
    // Wrap in Blob to preserve JSON formatting
    const jsonBlob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    })

    const { error } = await supabase.storage
      .from('documents')
      .upload(path, jsonBlob, {
        contentType: 'application/json',
        upsert: options?.upsert ?? true  // Default: overwrite existing
      })

    if (error) {
      console.warn(`[StorageHelpers] Failed to save to Storage: ${path}`, error.message)
      return // Non-fatal: processing continues
    }

    console.log(`[StorageHelpers] ✓ Saved to Storage: ${path}`)

  } catch (error) {
    console.warn(`[StorageHelpers] Exception saving to Storage: ${path}`, error)
    // Non-fatal: continue processing
  }
}

/**
 * Read JSON data from Supabase Storage.
 * Uses signed URLs with 1-hour expiry for secure access.
 *
 * @param supabase - Supabase client (service role)
 * @param path - Storage path (e.g., "userId/documentId/chunks.json")
 * @returns Parsed JSON data
 *
 * @example
 * ```typescript
 * const chunksData = await readFromStorage<ChunksExport>(
 *   supabase,
 *   "user-id/doc-id/chunks.json"
 * )
 * console.log(`Loaded ${chunksData.chunks.length} chunks`)
 * ```
 */
export async function readFromStorage<T = unknown>(
  supabase: SupabaseClient,
  path: string
): Promise<T> {
  // Create signed URL with 1-hour expiry
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 3600)  // 3600 seconds = 1 hour

  if (urlError || !signedUrlData?.signedUrl) {
    throw new Error(`Failed to create signed URL for ${path}: ${urlError?.message || 'No URL returned'}`)
  }

  // Fetch and parse JSON
  const response = await fetch(signedUrlData.signedUrl)
  if (!response.ok) {
    throw new Error(`Storage read failed for ${path}: ${response.statusText}`)
  }

  const data = await response.json()
  console.log(`[StorageHelpers] ✓ Read from Storage: ${path}`)

  return data as T
}

/**
 * Generate SHA256 hash of content for consistency validation.
 * Used for cache invalidation and change detection.
 *
 * @param content - Content to hash (usually markdown string)
 * @returns Hex-encoded SHA256 hash (64 characters)
 *
 * @example
 * ```typescript
 * const hash1 = hashContent(markdown)
 * const hash2 = hashContent(markdown)
 * console.log(hash1 === hash2)  // true
 * console.log(hash1.length)     // 64
 * ```
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * List all files in a Storage directory.
 * Returns file metadata (name, size, updated_at).
 *
 * @param supabase - Supabase client (service role)
 * @param path - Storage directory path (e.g., "userId/documentId")
 * @returns Array of file information objects
 *
 * @example
 * ```typescript
 * const files = await listStorageFiles(supabase, "user-id/doc-id")
 * console.log(`Found ${files.length} files`)
 * files.forEach(f => console.log(`- ${f.name} (${f.size} bytes)`))
 * ```
 */
export async function listStorageFiles(
  supabase: SupabaseClient,
  path: string
): Promise<Array<{ name: string; size: number; updated_at: string }>> {
  const { data, error } = await supabase.storage
    .from('documents')
    .list(path)

  if (error) {
    throw new Error(`Storage list failed for ${path}: ${error.message}`)
  }

  // Return with proper typing
  return (data || []).map(file => ({
    name: file.name,
    size: file.metadata?.size || 0,
    updated_at: file.updated_at || new Date().toISOString()
  }))
}
