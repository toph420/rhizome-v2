'use server'

import { getCurrentUser, getServerSupabaseClient } from '@/lib/auth'

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
    const supabase = await getServerSupabaseClient()
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
        job_type: 'obsidian_export',
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
    const supabase = await getServerSupabaseClient()
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
        job_type: 'obsidian_sync',
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
// VAULT IMPORT OPERATIONS
// ============================================================================

/**
 * Vault document info
 */
export interface VaultDocument {
  title: string
  complete: boolean
  hasContent: boolean
  hasHighlights: boolean | null
  hasConnections: boolean | null
  hasChunksJson: boolean
  hasMetadataJson: boolean
  hasManifestJson: boolean
}

/**
 * Result of vault scan operation
 */
export interface VaultScanResult {
  success: boolean
  documents?: VaultDocument[]
  vaultPath?: string
  error?: string
}

/**
 * Result of vault import operation
 */
export interface VaultImportResult {
  success: boolean
  documentId?: string
  documentTitle?: string
  chunksImported?: number
  error?: string
}

/**
 * Scan Obsidian vault for available documents.
 * Returns list of documents found in the vault with their completion status.
 *
 * @returns Result with list of vault documents
 *
 * @example
 * ```typescript
 * const result = await scanVault()
 * if (result.success) {
 *   result.documents.forEach(doc => {
 *     console.log(`${doc.title}: ${doc.complete ? 'Complete' : 'Incomplete'}`)
 *   })
 * }
 * ```
 */
export async function scanVault(): Promise<VaultScanResult> {
  try {
    const supabase = await getServerSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Get vault settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', user.id)
      .single()

    if (settingsError || !settings?.obsidian_settings?.vaultPath) {
      return { success: false, error: 'Vault not configured. Please configure vault path in Settings.' }
    }

    const vaultConfig = settings.obsidian_settings

    // Create background job for vault scan (quick operation)
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'scan_vault',
        input_data: {
          userId: user.id,
          vaultPath: vaultConfig.vaultPath,
          rhizomePath: vaultConfig.rhizomePath || 'Rhizome/'
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[scanVault] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    // Poll for job completion (vault scan is quick, ~2-5 seconds)
    let attempts = 0
    while (attempts < 30) {
      const { data: completedJob } = await supabase
        .from('background_jobs')
        .select('status, output_data')
        .eq('id', job.id)
        .single()

      if (completedJob?.status === 'completed') {
        return {
          success: true,
          documents: completedJob.output_data.documents,
          vaultPath: vaultConfig.vaultPath
        }
      }

      if (completedJob?.status === 'failed') {
        return {
          success: false,
          error: completedJob.output_data?.error || 'Vault scan failed'
        }
      }

      // Wait 200ms before next poll
      await new Promise(resolve => setTimeout(resolve, 200))
      attempts++
    }

    return { success: false, error: 'Vault scan timeout' }

  } catch (error) {
    console.error('[scanVault] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Import document from Obsidian vault to database.
 * Restores document from vault files (content.md, chunks.json, metadata.json).
 *
 * @param documentTitle - Title of document to import from vault
 * @returns Result with document ID and import stats
 *
 * @example
 * ```typescript
 * const result = await importFromVault("Gravity's Rainbow")
 * if (result.success) {
 *   console.log(`Imported ${result.chunksImported} chunks`)
 * }
 * ```
 */
export async function importFromVault(
  documentTitle: string
): Promise<VaultImportResult> {
  try {
    const supabase = await getServerSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    if (!documentTitle || typeof documentTitle !== 'string') {
      return { success: false, error: 'Invalid document title' }
    }

    console.log(`[importFromVault] Starting import for: ${documentTitle}`)

    // Create background job for vault import
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'import_from_vault',
        input_data: {
          documentTitle,
          strategy: 'merge_smart',
          uploadToStorage: true,
          userId: user.id
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[importFromVault] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[importFromVault] Job created: ${job.id}`)

    return {
      success: true,
      documentTitle
    }

  } catch (error) {
    console.error('[importFromVault] Unexpected error:', error)
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
 * Result of Readwise auto-import operation
 */
export interface ReadwiseAutoImportResult {
  success: boolean
  jobId?: string
  bookTitle?: string
  bookAuthor?: string
  highlightCount?: number
  bookId?: number
  error?: string
  suggestion?: string
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
    const supabase = await getServerSupabaseClient()
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
        job_type: 'readwise_import',
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

/**
 * Auto-import highlights from Readwise by searching library.
 *
 * Flow:
 * 1. Fetch document metadata (title, author)
 * 2. Search Readwise library for matching book
 * 3. Download highlights from matched book
 * 4. Create background job to import highlights
 *
 * @param documentId - Rhizome document ID
 * @returns Result with job ID if successful
 *
 * @example
 * ```typescript
 * const result = await autoImportFromReadwise(docId)
 * if (result.success) {
 *   toast.success(`Found: ${result.bookTitle} by ${result.bookAuthor}`)
 *   // Track job progress with result.jobId
 * } else {
 *   toast.error(result.error)
 *   // Fallback to manual JSON upload
 * }
 * ```
 */
export async function autoImportFromReadwise(
  documentId: string
): Promise<ReadwiseAutoImportResult> {
  try {
    const supabase = await getServerSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // 1. Fetch document metadata
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, title, author, user_id')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    if (doc.user_id !== user.id) {
      return { success: false, error: 'Not authorized' }
    }

    if (!doc.title || !doc.author) {
      return {
        success: false,
        error: 'Document metadata incomplete. Please set title and author first.'
      }
    }

    // 2. Check for Readwise token
    const readwiseToken = process.env.READWISE_ACCESS_TOKEN
    if (!readwiseToken) {
      return {
        success: false,
        error: 'READWISE_ACCESS_TOKEN not configured. Add to .env.local'
      }
    }

    // 3. Search Readwise library
    // TODO: Implement Readwise auto-import
    // const { ReadwiseExportClient } = await import('../../../worker/lib/readwise-export-api.js')
    // const client = new ReadwiseExportClient(readwiseToken)

    console.log(`[autoImportFromReadwise] Feature not yet implemented for: "${doc.title}" by ${doc.author}`)

    // Placeholder - auto-import not yet implemented
    return {
      success: false,
      error: 'Readwise auto-import not yet implemented',
      suggestion: 'Use manual JSON upload from Readwise export instead'
    }

    // const books = await client.searchBooks({
    //   title: doc.title,
    //   author: doc.author
    // })

    // if (books.length === 0) {
    //   return {
    //     success: false,
    //     error: `No matching book found in Readwise library for "${doc.title}"`,
    //     suggestion: 'Try manual JSON upload instead'
    //   }
    // }

    // TODO: Implement the rest when ReadwiseExportClient is available
    // // Use first match (could add fuzzy scoring later)
    // const matchedBook = books[0]
    // console.log(`[autoImportFromReadwise] Found match: ${matchedBook.title} (ID: ${matchedBook.user_book_id})`)

    // // 4. Highlights are already included in the book object
    // const highlights = matchedBook.highlights

    // if (highlights.length === 0) {
    //   return {
    //     success: false,
    //     error: `Book found but has no highlights: "${matchedBook.title}"`,
    //     bookId: matchedBook.user_book_id
    //   }
    // }

    // console.log(`[autoImportFromReadwise] Downloaded ${highlights.length} highlights`)

    // // 5. Create background job (reuse existing readwise_import)
    // const { data: job, error: jobError } = await supabase
    //   .from('background_jobs')
    //   .insert({
    //     user_id: user.id,
    //     job_type: 'readwise_import',
    //     entity_type: 'document',
    //     entity_id: documentId,
    //     input_data: {
    //       documentId: documentId,
    //       readwiseData: highlights
    //     }
    //   })
    //   .select()
    //   .single()

    // if (jobError) {
    //   console.error('[autoImportFromReadwise] Job creation failed:', jobError)
    //   return { success: false, error: `Job creation failed: ${jobError.message}` }
    // }

    // console.log(`[autoImportFromReadwise] Job created: ${job.id}`)

    // return {
    //   success: true,
    //   jobId: job.id,
    //   bookTitle: matchedBook.title,
    //   bookAuthor: matchedBook.author,
    //   highlightCount: highlights.length
    // }

  } catch (error) {
    console.error('[autoImportFromReadwise] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ============================================================================
// SPARK VAULT OPERATIONS
// ============================================================================

/**
 * Result of spark export operation
 */
export interface SparkExportResult {
  success: boolean
  jobId?: string
  sparksExported?: number
  location?: string
  error?: string
}

/**
 * Result of spark import operation
 */
export interface SparkImportResult {
  success: boolean
  jobId?: string
  sparksImported?: number
  errors?: string[]
  location?: string
  error?: string
}

/**
 * Export all user sparks to global Rhizome/Sparks/ folder in vault.
 * Creates both .md (readable) and .json (portable) files.
 *
 * @returns Result with job ID for tracking
 *
 * @example
 * ```typescript
 * const result = await exportSparksToVault()
 * if (result.success) {
 *   // Track job progress with result.jobId
 *   // On completion, check vault for Rhizome/Sparks/ folder
 * }
 * ```
 */
export async function exportSparksToVault(): Promise<SparkExportResult> {
  try {
    const supabase = await getServerSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Get vault settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', user.id)
      .single()

    if (settingsError || !settings?.obsidian_settings?.vaultPath) {
      return { success: false, error: 'Vault not configured. Please configure vault path in Settings.' }
    }

    const vaultConfig = settings.obsidian_settings

    console.log(`[exportSparksToVault] Creating export job for user: ${user.id}`)

    // Create background job for spark export
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'export_vault_sparks',
        input_data: {
          userId: user.id,
          vaultPath: vaultConfig.vaultPath
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[exportSparksToVault] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[exportSparksToVault] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[exportSparksToVault] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Import sparks from global Rhizome/Sparks/ folder in vault.
 * Reads JSON files, creates ECS entities, and uploads to Storage.
 *
 * @returns Result with job ID for tracking
 *
 * @example
 * ```typescript
 * const result = await importSparksFromVault()
 * if (result.success) {
 *   // Track job progress with result.jobId
 *   // On completion, check output_data for import stats
 * }
 * ```
 */
export async function importSparksFromVault(): Promise<SparkImportResult> {
  try {
    const supabase = await getServerSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Get vault settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', user.id)
      .single()

    if (settingsError || !settings?.obsidian_settings?.vaultPath) {
      return { success: false, error: 'Vault not configured. Please configure vault path in Settings.' }
    }

    const vaultConfig = settings.obsidian_settings

    console.log(`[importSparksFromVault] Creating import job for user: ${user.id}`)

    // Create background job for spark import
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'import_vault_sparks',
        input_data: {
          userId: user.id,
          vaultPath: vaultConfig.vaultPath
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[importSparksFromVault] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[importSparksFromVault] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[importSparksFromVault] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
