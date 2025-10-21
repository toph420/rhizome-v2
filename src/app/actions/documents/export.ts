'use server'

import { getAuthContext, createBackgroundJob, validateDocumentOwnership, withErrorHandling } from './utils'
import type { ExportResult, ExportOptions } from './types'

/**
 * Export documents to downloadable ZIP bundles with optional connections and annotations.
 *
 * Creates a background job that generates a ZIP file containing:
 * - Source files (PDF, EPUB, etc.)
 * - Processed markdown (content.md)
 * - Chunks with metadata (chunks.json)
 * - Document metadata (metadata.json)
 * - File manifest (manifest.json)
 * - Optional: connections.json (if includeConnections=true)
 * - Optional: annotations.json (if includeAnnotations=true)
 *
 * Export Formats:
 * - storage: Keep files in Storage folder structure (no ZIP, just organize)
 * - zip: Generate downloadable ZIP bundle (default)
 *
 * Background Job:
 * - Type: 'export_documents'
 * - Reads all files from Storage for each document
 * - Creates ZIP with document folders
 * - Saves ZIP to Storage under exports/ folder
 * - Returns signed URL for 24-hour download
 *
 * @param documentIds - Array of document IDs to export (single or batch)
 * @param options - Export options (connections, annotations, format)
 * @returns Result with job ID for tracking
 */
export async function exportDocuments(
  documentIds: string[],
  options: ExportOptions = {}
): Promise<ExportResult> {
  return withErrorHandling(async () => {
    const { user, supabase } = await getAuthContext()

    console.log(`[exportDocuments] Starting export for ${documentIds.length} documents`)
    console.log(`[exportDocuments] Options:`, options)

    // Validate documentIds (non-empty array)
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      throw new Error('At least one document ID required')
    }

    // Validate all document IDs are strings
    const invalidIds = documentIds.filter(id => !id || typeof id !== 'string')
    if (invalidIds.length > 0) {
      throw new Error('All document IDs must be valid strings')
    }

    // Verify all documents exist and belong to user
    const docs = await validateDocumentOwnership(supabase, user.id, documentIds)

    // Check if all requested documents were found
    if (docs.length !== documentIds.length) {
      const foundIds = new Set(docs.map(d => d.id))
      const missingIds = documentIds.filter(id => !foundIds.has(id))
      throw new Error(`Documents not found: ${missingIds.join(', ')}`)
    }

    console.log(`[exportDocuments] Creating export job for: ${docs.map(d => d.title).join(', ')}`)

    // Create background job for export
    const jobId = await createBackgroundJob(user.id, 'export_documents', documentIds[0], {
      document_ids: documentIds,
      includeConnections: options.includeConnections ?? false,
      includeAnnotations: options.includeAnnotations ?? false,
      format: options.format || 'zip'
    })

    console.log(`[exportDocuments] Export job created: ${jobId}`)

    return { jobId }
  })
}
