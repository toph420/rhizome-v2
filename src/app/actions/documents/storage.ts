'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthContext, createBackgroundJob, withErrorHandling } from './utils'
import type {
  ScanResult,
  DocumentScanResult,
  SyncState,
  ImportResult,
  ImportOptions,
  ImportConflict,
  ChunkExportData
} from './types'

// ============================================================================
// Storage Scanner - Storage-First Portability System
// ============================================================================

/**
 * Reads chunk count from chunks.json in Storage
 */
async function readStorageChunkCount(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<number | null> {
  try {
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(`${userId}/${documentId}/chunks.json`, 3600)

    if (!urlError && signedUrlData?.signedUrl) {
      const response = await fetch(signedUrlData.signedUrl)
      if (response.ok) {
        const chunksData = await response.json() as { chunks?: unknown[] }
        return chunksData.chunks?.length || 0
      }
    }
  } catch (error) {
    console.warn(`[readStorageChunkCount] Failed for ${documentId}:`, error)
  }
  return null
}

/**
 * Calculates sync state based on database and storage status
 */
function calculateSyncState(
  inDatabase: boolean,
  storageFiles: string[],
  dbChunkCount: number | null,
  storageChunkCount: number | null
): SyncState {
  if (!inDatabase && storageFiles.length > 0) {
    return 'missing_from_db'
  }

  if (inDatabase && storageFiles.length === 0) {
    return 'missing_from_storage'
  }

  if (inDatabase && storageChunkCount !== null && dbChunkCount !== null) {
    return storageChunkCount === dbChunkCount ? 'healthy' : 'out_of_sync'
  }

  if (inDatabase && storageFiles.length > 0) {
    // Both exist but couldn't verify chunk count - assume healthy
    return 'healthy'
  }

  // Edge case: neither exists (shouldn't happen)
  return 'healthy'
}

/**
 * Processes a single document folder from Storage
 */
async function processDocumentFolder(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  dbDocsMap: Map<string, { id: string; title: string; created_at: string }>
): Promise<DocumentScanResult | null> {
  // List files in this document folder
  const { data: files, error: filesError } = await supabase.storage
    .from('documents')
    .list(`${userId}/${documentId}`)

  if (filesError) {
    console.warn(`[processDocumentFolder] Error listing files for ${documentId}:`, filesError.message)
    return null
  }

  const storageFiles = (files || [])
    .filter(f => f.metadata) // Only files, not subdirectories
    .map(f => f.name)

  // Check if document exists in Database
  const dbDoc = dbDocsMap.get(documentId)
  const inDatabase = !!dbDoc

  // Get chunk count from Database
  let chunkCount: number | null = null
  if (inDatabase) {
    const { count, error: countError } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId)

    if (!countError) {
      chunkCount = count
    }
  }

  // Read chunks.json from Storage
  const storageChunkCount = storageFiles.includes('chunks.json')
    ? await readStorageChunkCount(supabase, userId, documentId)
    : null

  // Calculate sync state
  const syncState = calculateSyncState(inDatabase, storageFiles, chunkCount, storageChunkCount)

  return {
    documentId,
    title: dbDoc?.title || `Unknown (${documentId.substring(0, 8)}...)`,
    storageFiles,
    inDatabase,
    chunkCount,
    syncState,
    createdAt: dbDoc?.created_at || null
  }
}

/**
 * Scan Storage to compare against Database state.
 * Lists all document folders in Storage, checks which files exist,
 * queries Database for document and chunk count, and calculates sync state.
 *
 * Sync States:
 * - healthy: Document in DB with matching chunk count
 * - missing_from_db: Files in Storage but no document/chunks in DB
 * - missing_from_storage: Document in DB but no Storage files
 * - out_of_sync: Both exist but chunk counts don't match
 */
export async function scanStorage(): Promise<ScanResult> {
  const result = await withErrorHandling(async () => {
    const { user, supabase } = await getAuthContext()
    const userId = user.id

    console.log(`[scanStorage] Scanning for user: ${userId}`)

    // Step 1: List all document folders in Storage
    const { data: storageFolders, error: storageError } = await supabase.storage
      .from('documents')
      .list(userId, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      })

    if (storageError) {
      console.error('[scanStorage] Storage list error:', storageError)
      throw new Error(`Storage error: ${storageError.message}`)
    }

    // Step 2: Get all documents from Database for comparison
    const { data: dbDocuments, error: dbError } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .eq('user_id', userId)

    if (dbError) {
      console.error('[scanStorage] Database query error:', dbError)
      throw new Error(`Database error: ${dbError.message}`)
    }

    // Create a map for quick DB lookups
    const dbDocsMap = new Map<string, { id: string; title: string; created_at: string }>(
      (dbDocuments || []).map(doc => [doc.id, doc])
    )

    // Step 3: Process each Storage folder (exclude non-document folders like 'sparks')
    const folders = (storageFolders || []).filter(item =>
      !item.metadata && item.name !== 'sparks'
    )

    console.log(`[scanStorage] Found ${folders.length} document folders in Storage (excluded sparks/)`)

    const results: DocumentScanResult[] = []
    for (const folder of folders) {
      const result = await processDocumentFolder(supabase, userId, folder.name, dbDocsMap)
      if (result) {
        results.push(result)
      }
    }

    // Step 4: Check for documents in DB but not in Storage
    for (const dbDoc of (dbDocuments || [])) {
      if (results.some(r => r.documentId === dbDoc.id)) {
        continue // Already processed
      }

      // This document is in DB but has no Storage folder
      const { count: chunkCount } = await supabase
        .from('chunks')
        .select('*', { count: 'exact', head: true })
        .eq('document_id', dbDoc.id)

      results.push({
        documentId: dbDoc.id,
        title: dbDoc.title,
        storageFiles: [],
        inDatabase: true,
        chunkCount: chunkCount || 0,
        syncState: 'missing_from_storage',
        createdAt: dbDoc.created_at
      })
    }

    console.log(`[scanStorage] Scan complete: ${results.length} documents analyzed`)

    return { documents: results }
  })

  // Handle error case - withErrorHandling returns { success: false, error: string }
  if (!result.success) {
    return { success: false, documents: [], error: result.error }
  }

  return result
}

// ============================================================================
// Import from Storage - Storage-First Portability System
// ============================================================================

/**
 * Reads chunks.json from Storage
 */
async function readChunksFromStorage(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<{
  chunks: ChunkExportData[]
  createdAt: string
}> {
  const storagePath = `${userId}/${documentId}/chunks.json`

  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600)

  if (urlError || !signedUrlData?.signedUrl) {
    throw new Error('chunks.json not found in Storage. Process document first.')
  }

  const response = await fetch(signedUrlData.signedUrl)
  if (!response.ok) {
    throw new Error('Failed to read chunks.json from Storage')
  }

  const chunksData = await response.json() as {
    chunks?: ChunkExportData[]
    created_at?: string
  }

  return {
    chunks: chunksData.chunks || [],
    createdAt: chunksData.created_at || new Date().toISOString()
  }
}

/**
 * Fetches sample existing chunks for conflict comparison
 */
async function fetchSampleChunks(
  supabase: SupabaseClient,
  documentId: string
): Promise<ChunkExportData[]> {
  const { data: existingChunks, error } = await supabase
    .from('chunks')
    .select('content, chunk_index, themes, importance_score, summary, created_at')
    .eq('document_id', documentId)
    .order('chunk_index')
    .limit(3)

  if (error) {
    console.error('[fetchSampleChunks] Error:', error)
    return []
  }

  return (existingChunks || []).map(c => ({
    content: c.content,
    chunk_index: c.chunk_index,
    themes: c.themes || undefined,
    importance_score: c.importance_score || undefined,
    summary: c.summary || undefined
  }))
}

/**
 * Import document from Storage to Database with intelligent conflict resolution.
 *
 * Workflow:
 * 1. Check for existing chunks in Database
 * 2. If conflict exists and no strategy provided, return conflict data for UI
 * 3. If no conflict or strategy provided, create background job to restore
 * 4. Background job reads chunks.json from Storage and applies strategy
 *
 * Strategies:
 * - skip: Do nothing, return success (no changes)
 * - replace: Delete existing chunks, insert from Storage (data loss warning)
 * - merge_smart: Update metadata, preserve chunk IDs and annotations (safe)
 */
export async function importFromStorage(
  documentId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  return withErrorHandling(async () => {
    const { user, supabase } = await getAuthContext()

    console.log(`[importFromStorage] Starting import for: ${documentId}`)
    console.log(`[importFromStorage] Options:`, options)

    if (!documentId || typeof documentId !== 'string') {
      throw new Error('Invalid document ID')
    }

    // Step 1: Check if chunks already exist in Database
    const { count: existingChunkCount, error: countError } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId)

    if (countError) {
      console.error('[importFromStorage] Error checking chunks:', countError)
      throw new Error(`Database error: ${countError.message}`)
    }

    const hasExistingChunks = (existingChunkCount || 0) > 0

    console.log(`[importFromStorage] Existing chunks: ${existingChunkCount}`)

    // Step 2: Read chunks.json from Storage
    const { chunks: importChunks, createdAt: importProcessedAt } =
      await readChunksFromStorage(supabase, user.id, documentId)

    const importChunkCount = importChunks.length
    console.log(`[importFromStorage] Import chunks: ${importChunkCount}`)

    // Step 3: Handle conflict detection
    if (hasExistingChunks && !options.strategy) {
      console.log('[importFromStorage] Conflict detected, no strategy provided')

      const sampleExisting = await fetchSampleChunks(supabase, documentId)
      const sampleImport = importChunks.slice(0, 3)

      // Get existing processed date
      const { data: docData } = await supabase
        .from('documents')
        .select('created_at')
        .eq('id', documentId)
        .single()

      const existingProcessedAt = docData?.created_at || new Date().toISOString()

      // Return conflict for UI resolution
      const conflict: ImportConflict = {
        documentId,
        existingChunkCount: existingChunkCount || 0,
        importChunkCount,
        existingProcessedAt,
        importProcessedAt,
        sampleChunks: {
          existing: sampleExisting,
          import: sampleImport
        }
      }

      return {
        success: false,
        needsResolution: true,
        conflict
      }
    }

    // Step 4: Handle skip strategy (no-op)
    if (options.strategy === 'skip') {
      console.log('[importFromStorage] Skip strategy selected, no changes')
      return { success: true, jobId: undefined }
    }

    // Step 5: Create background job for import
    console.log('[importFromStorage] Creating import job')

    const jobId = await createBackgroundJob(user.id, 'import_document', documentId, {
      document_id: documentId,
      storage_path: `${user.id}/${documentId}`,
      strategy: options.strategy || 'replace',
      regenerateEmbeddings: options.regenerateEmbeddings || false,
      reprocessConnections: options.reprocessConnections || false
    })

    console.log(`[importFromStorage] Import job created: ${jobId}`)

    return { success: true, jobId }
  })
}
