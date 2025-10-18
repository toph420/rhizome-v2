'use server'

import { getCurrentUser, getSupabaseClient } from '@/lib/auth'

// ============================================================================
// OBSIDIAN INTEGRATION
// ============================================================================

/**
 * Result of Obsidian export operation
 */
export interface ObsidianExportResult {
  success: boolean
  jobId?: string
  path?: string
  uri?: string
  error?: string
}

/**
 * Result of Obsidian sync operation
 */
export interface ObsidianSyncResult {
  success: boolean
  jobId?: string
  changed?: boolean
  error?: string
}

/**
 * Export document markdown to Obsidian vault.
 * Creates a background job that runs the export via worker/handlers/obsidian-sync.ts
 *
 * @param documentId - Document to export to Obsidian
 * @returns Result with job ID for tracking
 *
 * @example
 * ```typescript
 * const result = await exportToObsidian(docId)
 * if (result.success) {
 *   // Track job progress with result.jobId
 *   // On completion, output_data will contain vault path and URI
 * }
 * ```
 */
export async function exportToObsidian(
  documentId: string
): Promise<ObsidianExportResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[exportToObsidian] Starting export for: ${documentId}`)

    // Validate documentId
    if (!documentId || typeof documentId !== 'string') {
      return { success: false, error: 'Invalid document ID' }
    }

    // Verify document exists and belongs to user
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, title, markdown_path')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    if (doc.user_id !== user.id) {
      return { success: false, error: 'Not authorized to export this document' }
    }

    if (!doc.markdown_path) {
      return { success: false, error: 'Document markdown not available. Process document first.' }
    }

    console.log(`[exportToObsidian] Creating export job for: ${doc.title}`)

    // Create background job for Obsidian export
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'obsidian-export',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          documentId: documentId,
          userId: user.id
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[exportToObsidian] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[exportToObsidian] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[exportToObsidian] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Sync edited markdown from Obsidian vault back to Rhizome.
 * Creates a background job that runs the sync via worker/handlers/obsidian-sync.ts
 * Triggers reprocessing pipeline with annotation recovery if content changed.
 *
 * @param documentId - Document to sync from Obsidian
 * @returns Result with job ID for tracking
 *
 * @example
 * ```typescript
 * const result = await syncFromObsidian(docId)
 * if (result.success) {
 *   // Track job progress with result.jobId
 *   // On completion, output_data will indicate if changes were detected
 * }
 * ```
 */
export async function syncFromObsidian(
  documentId: string
): Promise<ObsidianSyncResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[syncFromObsidian] Starting sync for: ${documentId}`)

    // Validate documentId
    if (!documentId || typeof documentId !== 'string') {
      return { success: false, error: 'Invalid document ID' }
    }

    // Verify document exists and belongs to user
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, title, obsidian_path')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    if (doc.user_id !== user.id) {
      return { success: false, error: 'Not authorized to sync this document' }
    }

    if (!doc.obsidian_path) {
      return { success: false, error: 'Document not exported to Obsidian yet. Export first.' }
    }

    console.log(`[syncFromObsidian] Creating sync job for: ${doc.title}`)

    // Create background job for Obsidian sync
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'obsidian-sync',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          documentId: documentId,
          userId: user.id
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[syncFromObsidian] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[syncFromObsidian] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[syncFromObsidian] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ============================================================================
// READWISE INTEGRATION
// ============================================================================

/**
 * Result of Readwise import operation
 */
export interface ReadwiseImportResult {
  success: boolean
  jobId?: string
  error?: string
}

/**
 * Import highlights from Readwise export JSON.
 * Creates a background job that runs the import via worker/handlers/readwise-import.ts
 *
 * Flow:
 * 1. User selects Readwise export JSON file (from Readwise.io/export)
 * 2. Action creates background job with JSON data
 * 3. Worker imports highlights with fuzzy matching
 * 4. Exact matches → immediate annotations
 * 5. Fuzzy matches → import_pending table for review
 * 6. Failed matches → logged in job output
 *
 * @param documentId - Target Rhizome document ID
 * @param readwiseJson - Readwise export JSON (array of highlights)
 * @returns Result with job ID for tracking
 *
 * @example
 * ```typescript
 * const result = await importReadwiseHighlights(docId, readwiseData)
 * if (result.success) {
 *   // Track job progress with result.jobId
 *   // On completion, check import_pending table for fuzzy matches
 * }
 * ```
 */
export async function importReadwiseHighlights(
  documentId: string,
  readwiseJson: unknown[] // Array of Readwise highlight objects
): Promise<ReadwiseImportResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[importReadwiseHighlights] Starting import for: ${documentId}`)
    console.log(`[importReadwiseHighlights] Highlights count: ${readwiseJson.length}`)

    // Validate documentId
    if (!documentId || typeof documentId !== 'string') {
      return { success: false, error: 'Invalid document ID' }
    }

    // Validate readwiseJson
    if (!readwiseJson || !Array.isArray(readwiseJson) || readwiseJson.length === 0) {
      return { success: false, error: 'Readwise JSON data required (must be non-empty array)' }
    }

    // Verify document exists and belongs to user
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, title, markdown_path')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    if (doc.user_id !== user.id) {
      return { success: false, error: 'Not authorized to import to this document' }
    }

    if (!doc.markdown_path) {
      return { success: false, error: 'Document markdown not available. Process document first.' }
    }

    console.log(`[importReadwiseHighlights] Creating import job for: ${doc.title}`)

    // Create background job for Readwise import
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'readwise-import',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          documentId: documentId,
          readwiseData: readwiseJson
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[importReadwiseHighlights] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[importReadwiseHighlights] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[importReadwiseHighlights] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
