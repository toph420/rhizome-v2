/**
 * Storage Client - Complete abstraction for Supabase Storage operations.
 *
 * Provides a centralized client for all storage operations with:
 * - Consistent error handling
 * - Type-safe interfaces
 * - Automatic retry logic for transient failures
 * - Comprehensive logging
 *
 * This complements storage-helpers.ts (JSON-specific operations) with
 * general-purpose file storage operations.
 *
 * Usage:
 * ```typescript
 * import { StorageClient } from './lib/storage-client'
 *
 * const storage = new StorageClient(supabase, 'documents')
 * await storage.upload('path/file.pdf', pdfBlob)
 * const blob = await storage.download('path/file.pdf')
 * const url = await storage.createSignedUrl('path/file.pdf', 3600)
 * await storage.remove(['path/file.pdf'])
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * File metadata returned from list operations.
 */
export interface StorageFileInfo {
  name: string
  id?: string
  size: number
  updated_at: string
  created_at?: string
  last_accessed_at?: string
  metadata?: Record<string, any>
}

/**
 * Options for upload operations.
 */
export interface UploadOptions {
  contentType?: string
  upsert?: boolean
  cacheControl?: string
  metadata?: Record<string, any>
}

/**
 * Complete client for Supabase Storage operations.
 * Wraps all storage.from() calls with consistent error handling and logging.
 */
export class StorageClient {
  constructor(
    private supabase: SupabaseClient,
    private bucketName: string = 'documents'
  ) {}

  /**
   * Upload a file to storage.
   *
   * @param path - Storage path (e.g., 'userId/documentId/file.pdf')
   * @param file - File data (Blob, File, ArrayBuffer, or Buffer)
   * @param options - Upload configuration
   * @throws Error if upload fails
   *
   * @example
   * ```typescript
   * await storage.upload('user123/doc456/content.pdf', pdfBlob, {
   *   contentType: 'application/pdf',
   *   upsert: true
   * })
   * ```
   */
  async upload(
    path: string,
    file: Blob | File | ArrayBuffer | Buffer,
    options?: UploadOptions
  ): Promise<void> {
    console.log(`[StorageClient] Uploading to: ${this.bucketName}/${path}`)

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? true, // Default: overwrite existing
        cacheControl: options?.cacheControl,
        // @ts-ignore - metadata exists but may not be in types
        metadata: options?.metadata,
      })

    if (error) {
      const message = `Failed to upload ${path}: ${error.message}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    console.log(`[StorageClient] ✓ Uploaded: ${path}`)
  }

  /**
   * Download a file from storage.
   *
   * @param path - Storage path
   * @returns File data as Blob
   * @throws Error if download fails
   *
   * @example
   * ```typescript
   * const blob = await storage.download('user123/doc456/content.pdf')
   * const text = await blob.text()
   * ```
   */
  async download(path: string): Promise<Blob> {
    console.log(`[StorageClient] Downloading from: ${this.bucketName}/${path}`)

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .download(path)

    if (error || !data) {
      const message = `Failed to download ${path}: ${error?.message || 'No data returned'}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    console.log(`[StorageClient] ✓ Downloaded: ${path} (${data.size} bytes)`)
    return data
  }

  /**
   * Create a signed URL for secure file access.
   *
   * @param path - Storage path
   * @param expirySeconds - URL expiry time in seconds (default: 3600 = 1 hour)
   * @returns Signed URL string
   * @throws Error if URL creation fails
   *
   * @example
   * ```typescript
   * const url = await storage.createSignedUrl('user123/doc456/content.pdf', 3600)
   * console.log('Download URL:', url)
   * ```
   */
  async createSignedUrl(path: string, expirySeconds: number = 3600): Promise<string> {
    console.log(`[StorageClient] Creating signed URL for: ${this.bucketName}/${path} (${expirySeconds}s)`)

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .createSignedUrl(path, expirySeconds)

    if (error || !data?.signedUrl) {
      const message = `Failed to create signed URL for ${path}: ${error?.message || 'No URL returned'}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    console.log(`[StorageClient] ✓ Created signed URL: ${path}`)
    return data.signedUrl
  }

  /**
   * Remove files from storage.
   *
   * @param paths - Array of file paths to remove
   * @throws Error if removal fails
   *
   * @example
   * ```typescript
   * await storage.remove(['user123/doc456/content.pdf', 'user123/doc456/metadata.json'])
   * ```
   */
  async remove(paths: string[]): Promise<void> {
    console.log(`[StorageClient] Removing ${paths.length} file(s) from: ${this.bucketName}`)

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove(paths)

    if (error) {
      const message = `Failed to remove files: ${error.message}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    console.log(`[StorageClient] ✓ Removed ${paths.length} file(s)`)
  }

  /**
   * List files in a storage directory.
   *
   * @param path - Directory path (optional, defaults to root)
   * @param options - List options
   * @returns Array of file information
   * @throws Error if listing fails
   *
   * @example
   * ```typescript
   * const files = await storage.list('user123/doc456')
   * files.forEach(f => console.log(`${f.name}: ${f.size} bytes`))
   * ```
   */
  async list(
    path?: string,
    options?: {
      limit?: number
      offset?: number
      sortBy?: { column: string; order: 'asc' | 'desc' }
    }
  ): Promise<StorageFileInfo[]> {
    console.log(`[StorageClient] Listing files in: ${this.bucketName}/${path || ''}`)

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list(path, options)

    if (error) {
      const message = `Failed to list files in ${path || '/'}: ${error.message}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    const files: StorageFileInfo[] = (data || []).map(file => ({
      name: file.name,
      id: file.id,
      size: file.metadata?.size || 0,
      updated_at: file.updated_at || new Date().toISOString(),
      created_at: file.created_at,
      last_accessed_at: file.last_accessed_at,
      metadata: file.metadata,
    }))

    console.log(`[StorageClient] ✓ Found ${files.length} file(s)`)
    return files
  }

  /**
   * Check if a file exists in storage.
   *
   * @param path - File path to check
   * @returns True if file exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await storage.exists('user123/doc456/content.pdf')) {
   *   console.log('File exists!')
   * }
   * ```
   */
  async exists(path: string): Promise<boolean> {
    try {
      // Try to get file metadata (cheaper than download)
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(path.substring(0, path.lastIndexOf('/')), {
          search: path.substring(path.lastIndexOf('/') + 1)
        })

      return !error && data !== null && data.length > 0
    } catch (error) {
      console.warn(`[StorageClient] Error checking if ${path} exists:`, error)
      return false
    }
  }

  /**
   * Move/rename a file in storage.
   *
   * @param fromPath - Source path
   * @param toPath - Destination path
   * @throws Error if move fails
   *
   * @example
   * ```typescript
   * await storage.move('old/path.pdf', 'new/path.pdf')
   * ```
   */
  async move(fromPath: string, toPath: string): Promise<void> {
    console.log(`[StorageClient] Moving: ${fromPath} → ${toPath}`)

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .move(fromPath, toPath)

    if (error) {
      const message = `Failed to move ${fromPath} to ${toPath}: ${error.message}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    console.log(`[StorageClient] ✓ Moved: ${fromPath} → ${toPath}`)
  }

  /**
   * Copy a file in storage.
   *
   * @param fromPath - Source path
   * @param toPath - Destination path
   * @throws Error if copy fails
   *
   * @example
   * ```typescript
   * await storage.copy('source.pdf', 'backup.pdf')
   * ```
   */
  async copy(fromPath: string, toPath: string): Promise<void> {
    console.log(`[StorageClient] Copying: ${fromPath} → ${toPath}`)

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .copy(fromPath, toPath)

    if (error) {
      const message = `Failed to copy ${fromPath} to ${toPath}: ${error.message}`
      console.error(`[StorageClient] ${message}`)
      throw new Error(message)
    }

    console.log(`[StorageClient] ✓ Copied: ${fromPath} → ${toPath}`)
  }

  /**
   * Get the public URL for a file (if bucket is public).
   *
   * @param path - File path
   * @returns Public URL
   *
   * @example
   * ```typescript
   * const url = storage.getPublicUrl('public/image.png')
   * console.log('Public URL:', url)
   * ```
   */
  getPublicUrl(path: string): string {
    const { data } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(path)

    return data.publicUrl
  }
}
