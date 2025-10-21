'use server'

import { getCurrentUser, getSupabaseClient } from '@/lib/auth'
import { base64ToBlob } from '@/types/metadata'

/**
 * Job progress structure for tracking processing stages.
 */
interface JobProgress {
  stage?: string
  percent?: number
  stage_data?: Record<string, unknown>
}

/**
 * Estimates processing cost for a document.
 * @param fileSize - Size of file in bytes.
 * @returns Estimated tokens, cost, and processing time.
 */
export async function estimateProcessingCost(fileSize: number): Promise<{
  tokens: number
  cost: number
  estimatedTime: number
}> {
  const COST_PER_1K_CHARS_INPUT = 0.00025
  const COST_PER_1K_CHARS_OUTPUT = 0.00050
  const EMBEDDING_COST_PER_1K_CHARS = 0.000025
  
  const estimatedChars = fileSize * 1.5
  const inputTokens = Math.ceil(estimatedChars / 1000)
  const outputTokens = Math.ceil(estimatedChars * 0.5 / 1000)
  const embeddingTokens = Math.ceil(estimatedChars * 0.3 / 1000)
  
  const totalTokens = inputTokens + outputTokens + embeddingTokens
  const cost = 
    (inputTokens * COST_PER_1K_CHARS_INPUT) +
    (outputTokens * COST_PER_1K_CHARS_OUTPUT) +
    (embeddingTokens * EMBEDDING_COST_PER_1K_CHARS)
  
  const estimatedPages = fileSize / 50000
  const estimatedTime = estimatedPages * 1000
  
  return { tokens: totalTokens, cost, estimatedTime }
}

/**
 * Uploads a document to Supabase Storage and creates metadata record.
 * Also creates a background job for processing.
 * @param formData - Form data containing the PDF file.
 * @returns Result with document ID, job ID, or error.
 */
export async function uploadDocument(formData: FormData): Promise<{
  success: boolean
  documentId?: string
  jobId?: string
  error?: string
}> {
  try {
    // Extract source metadata
    const sourceType = formData.get('source_type') as string || 'pdf'
    const sourceUrl = formData.get('source_url') as string | null
    const processingRequested = formData.get('processing_requested') === 'true'
    const pastedContent = formData.get('pasted_content') as string | null
    const reviewBeforeChunkingRaw = formData.get('reviewBeforeChunking')
    const reviewBeforeChunking = reviewBeforeChunkingRaw === 'true'

    const cleanMarkdownRaw = formData.get('cleanMarkdown')
    const cleanMarkdown = cleanMarkdownRaw !== 'false' // Default to true

    const reviewDoclingExtractionRaw = formData.get('reviewDoclingExtraction')
    const reviewDoclingExtraction = reviewDoclingExtractionRaw === 'true'

    const extractImagesRaw = formData.get('extractImages')
    const extractImages = extractImagesRaw === 'true'

    const chunkerStrategy = formData.get('chunkerStrategy') as string || 'recursive'

    console.log('[uploadDocument] Processing flags DEBUG:', {
      reviewBeforeChunking: { raw: reviewBeforeChunkingRaw, parsed: reviewBeforeChunking },
      cleanMarkdown: { raw: cleanMarkdownRaw, parsed: cleanMarkdown },
      reviewDoclingExtraction: { raw: reviewDoclingExtractionRaw, parsed: reviewDoclingExtraction },
      extractImages: { raw: extractImagesRaw, parsed: extractImages },
      chunkerStrategy: chunkerStrategy
    })

    // Extract document metadata (from preview)
    const documentType = formData.get('document_type') as string | null
    const author = formData.get('author') as string | null
    const publicationYear = formData.get('publication_year') ? parseInt(formData.get('publication_year') as string) : null
    const publisher = formData.get('publisher') as string | null
    const isbn = formData.get('isbn') as string | null
    const coverImage = formData.get('cover_image') as File | null
    const coverImageData = formData.get('cover_image_data') as string | null // base64 or URL
    
    // Validate source type
    const validSourceTypes = ['pdf', 'epub', 'markdown_asis', 'markdown_clean', 'txt', 'youtube', 'web_url', 'paste']
    if (!validSourceTypes.includes(sourceType)) {
      return { success: false, error: 'Invalid source type' }
    }
    
    // For URL-based sources, validate URL
    if ((sourceType === 'youtube' || sourceType === 'web_url') && !sourceUrl) {
      return { success: false, error: 'Source URL required for this type' }
    }
    
    // For paste type, validate content
    if (sourceType === 'paste' && !pastedContent) {
      return { success: false, error: 'Content required for paste type' }
    }
    
    // For file uploads, validate file exists and type
    const file = formData.get('file') as File | null
    if (!['youtube', 'web_url', 'paste'].includes(sourceType) && !file) {
      return { success: false, error: 'No file provided' }
    }
    
    if (file) {
      const isValidType =
        file.type.includes('pdf') ||
        file.type === 'application/epub+zip' ||
        file.name.endsWith('.epub') ||
        file.type.includes('text') ||
        file.type.includes('markdown')

      if (!isValidType) {
        return { success: false, error: 'Only PDF, EPUB, text, and markdown files are supported' }
      }
    }
    
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }
    
    const supabase = getSupabaseClient()
    const documentId = crypto.randomUUID()
    const baseStoragePath = `${user.id}/${documentId}`
    
    // Upload file to storage if provided
    if (file) {
      // Determine file extension based on source type
      let fileExtension = '.pdf'
      if (sourceType === 'epub') {
        fileExtension = '.epub'
      } else if (sourceType === 'markdown_asis' || sourceType === 'markdown_clean') {
        fileExtension = '.md'
      } else if (sourceType === 'txt') {
        fileExtension = '.txt'
      }
      
      const storagePath = `${baseStoragePath}/source${fileExtension}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)
      
      if (uploadError) {
        return { success: false, error: uploadError.message }
      }
    }
    
    // Determine document title (from metadata or fallback)
    let title = formData.get('title') as string | null
    if (!title) {
      if (file) {
        title = file.name.replace(/\.[^/.]+$/, '')
      } else if (sourceUrl) {
        title = sourceUrl.split('/').pop() || sourceUrl
      } else {
        title = 'Untitled Document'
      }
    }

    // Handle cover image (three types: File upload, base64 from EPUB, URL from YouTube)
    let coverImageUrl: string | null = null

    if (coverImage) {
      // Case 1: Manual file upload from DocumentPreview
      const coverPath = `${baseStoragePath}/cover.jpg`
      const { error: coverError } = await supabase.storage
        .from('documents')
        .upload(coverPath, coverImage, {
          contentType: coverImage.type,
          upsert: true
        })

      if (!coverError) {
        const { data: publicUrl } = supabase.storage
          .from('documents')
          .getPublicUrl(coverPath)
        coverImageUrl = publicUrl.publicUrl
      } else {
        console.warn('Cover image upload failed (non-blocking):', coverError.message)
      }
    } else if (coverImageData) {
      if (coverImageData.startsWith('data:image')) {
        // Case 2: Base64 from EPUB - decode and upload to storage
        console.log('Converting base64 cover image to storage')
        const coverBlob = base64ToBlob(coverImageData)
        const coverPath = `${baseStoragePath}/cover.jpg`

        const { error: coverError } = await supabase.storage
          .from('documents')
          .upload(coverPath, coverBlob, { upsert: true })

        if (!coverError) {
          const { data } = supabase.storage
            .from('documents')
            .getPublicUrl(coverPath)

          coverImageUrl = data.publicUrl
        } else {
          console.warn('Cover upload failed (non-blocking):', coverError)
        }
      } else if (coverImageData.startsWith('http')) {
        // Case 3: URL from YouTube - use directly
        console.log('Using HTTP cover image URL')
        coverImageUrl = coverImageData
      }
    }

    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        user_id: user.id,
        title: title,
        storage_path: baseStoragePath,
        source_type: sourceType,
        source_url: sourceUrl,
        processing_requested: processingRequested,
        processing_status: 'pending',
        // Chonkie strategy selection (migration 050)
        chunker_type: chunkerStrategy,
        // Metadata fields
        document_type: documentType,
        author: author,
        publication_year: publicationYear,
        publisher: publisher,
        cover_image_url: coverImageUrl,
        detected_metadata: documentType ? {
          type: documentType,
          author,
          publisher,
          year: publicationYear?.toString(),
          isbn
        } : null
      })
    
    if (dbError) {
      // Clean up uploaded file if it exists
      if (file) {
        let fileExtension = '.pdf'
        if (sourceType === 'markdown_asis' || sourceType === 'markdown_clean') {
          fileExtension = '.md'
        } else if (sourceType === 'txt') {
          fileExtension = '.txt'
        }
        await supabase.storage.from('documents').remove([`${baseStoragePath}/source${fileExtension}`])
      }
      return { success: false, error: dbError.message }
    }
    
    // Create background job for processing
    const { data: job, error: jobError} = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          document_id: documentId,
          storage_path: baseStoragePath,
          source_type: sourceType,
          source_url: sourceUrl,
          processing_requested: processingRequested,
          pasted_content: pastedContent,
          // Include document metadata for worker
          document_type: documentType,
          reviewBeforeChunking: reviewBeforeChunking,
          cleanMarkdown: cleanMarkdown,
          reviewDoclingExtraction: reviewDoclingExtraction,
          extractImages: extractImages,
          chunkerStrategy: chunkerStrategy
        }
      })
      .select()
      .single()
    
    if (jobError) {
      await supabase.from('documents').delete().eq('id', documentId)
      // Clean up uploaded file if it exists
      if (file) {
        let fileExtension = '.pdf'
        if (sourceType === 'markdown_asis' || sourceType === 'markdown_clean') {
          fileExtension = '.md'
        } else if (sourceType === 'txt') {
          fileExtension = '.txt'
        }
        await supabase.storage.from('documents').remove([`${baseStoragePath}/source${fileExtension}`])
      }
      return { success: false, error: jobError.message }
    }
    
    return { success: true, documentId, jobId: job.id }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Triggers processing for an uploaded document.
 * Creates a background job that the worker will pick up.
 * @param documentId - Document to process.
 * @returns Success status with job ID.
 */
export async function triggerProcessing(documentId: string): Promise<{
  success: boolean
  jobId?: string
  error?: string
}> {
  try {
    console.log('🚀 triggerProcessing START for:', documentId)
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Authentication required' }
    }
    
    // Get document storage path
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .single()
    
    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }
    
    // Create background job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          document_id: documentId,
          storage_path: doc.storage_path
        }
      })
      .select()
      .single()
    
    if (jobError) {
      console.error('❌ Failed to create background job:', jobError)
      return { success: false, error: jobError.message }
    }
    
    console.log('✅ Background job created:', job.id)
    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('💥 triggerProcessing EXCEPTION:', error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Retries failed document processing by creating a new background job.
 * @param documentId - Document to retry.
 * @returns Success status with new job ID.
 */
export async function retryProcessing(documentId: string): Promise<{
  success: boolean
  jobId?: string
  error?: string
}> {
  try {
    const supabase = getSupabaseClient()
    
    // Reset document status
    await supabase
      .from('documents')
      .update({ 
        processing_status: 'pending',
        processing_error: null 
      })
      .eq('id', documentId)
    
    // Create new background job
    return await triggerProcessing(documentId)
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Gets the active background job for a document.
 * @param documentId - Document ID to check.
 * @returns Job info or null.
 */
export async function getDocumentJob(documentId: string): Promise<{
  id: string
  status: string
  progress: JobProgress
  last_error: string | null
} | null> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()
    if (!user) {
      return null
    }

    const { data, error } = await supabase
      .from('background_jobs')
      .select('id, status, progress, last_error')
      .eq('entity_type', 'document')
      .eq('entity_id', documentId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) return null
    return data
  } catch {
    return null
  }
}

// ============================================================================
// Storage Scanner - Storage-First Portability System
// ============================================================================

/**
 * Document sync state types for Storage Scanner
 */
export type SyncState = 'healthy' | 'missing_from_db' | 'missing_from_storage' | 'out_of_sync'

/**
 * Scan result for a single document
 */
export interface DocumentScanResult {
  documentId: string
  title: string
  storageFiles: string[] // File names (chunks.json, metadata.json, etc.)
  inDatabase: boolean
  chunkCount: number | null
  syncState: SyncState
  createdAt: string | null
}

/**
 * Result of scanning Storage vs Database
 */
export interface ScanResult {
  success: boolean
  documents: DocumentScanResult[]
  error?: string
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
 *
 * @returns ScanResult with document comparison data
 *
 * @example
 * ```typescript
 * const result = await scanStorage()
 * if (result.success) {
 *   console.log(`Found ${result.documents.length} documents`)
 *   result.documents.forEach(doc => {
 *     console.log(`${doc.title}: ${doc.syncState}`)
 *   })
 * }
 * ```
 */
export async function scanStorage(): Promise<ScanResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, documents: [], error: 'Not authenticated' }
    }

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
      return { success: false, documents: [], error: `Storage error: ${storageError.message}` }
    }

    // Step 2: Get all documents from Database for comparison
    const { data: dbDocuments, error: dbError } = await supabase
      .from('documents')
      .select('id, title, created_at')
      .eq('user_id', userId)

    if (dbError) {
      console.error('[scanStorage] Database query error:', dbError)
      return { success: false, documents: [], error: `Database error: ${dbError.message}` }
    }

    // Create a map for quick DB lookups
    const dbDocsMap = new Map(
      (dbDocuments || []).map(doc => [doc.id, doc])
    )

    // Step 3: Process each Storage folder
    const results: DocumentScanResult[] = []

    // Filter to only directories (folders don't have metadata)
    // Exclude non-document folders like 'sparks'
    const folders = (storageFolders || []).filter(item =>
      !item.metadata && item.name !== 'sparks'
    )

    console.log(`[scanStorage] Found ${folders.length} document folders in Storage (excluded sparks/)`)

    for (const folder of folders) {
      const documentId = folder.name

      // List files in this document folder
      const { data: files, error: filesError } = await supabase.storage
        .from('documents')
        .list(`${userId}/${documentId}`)

      if (filesError) {
        console.warn(`[scanStorage] Error listing files for ${documentId}:`, filesError.message)
        continue
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

      // Read chunks.json from Storage to get Storage chunk count
      let storageChunkCount: number | null = null
      if (storageFiles.includes('chunks.json')) {
        try {
          // Create signed URL for chunks.json
          const { data: signedUrlData, error: urlError } = await supabase.storage
            .from('documents')
            .createSignedUrl(`${userId}/${documentId}/chunks.json`, 3600)

          if (!urlError && signedUrlData?.signedUrl) {
            const response = await fetch(signedUrlData.signedUrl)
            if (response.ok) {
              const chunksData = await response.json() as { chunks?: unknown[] }
              storageChunkCount = chunksData.chunks?.length || 0
            }
          }
        } catch (error) {
          console.warn(`[scanStorage] Failed to read chunks.json for ${documentId}:`, error)
        }
      }

      // Calculate sync state
      let syncState: SyncState

      if (!inDatabase && storageFiles.length > 0) {
        // Files in Storage but not in DB
        syncState = 'missing_from_db'
      } else if (inDatabase && storageFiles.length === 0) {
        // Document in DB but no Storage files
        syncState = 'missing_from_storage'
      } else if (inDatabase && storageChunkCount !== null && chunkCount !== null) {
        // Both exist - check if counts match
        if (storageChunkCount === chunkCount) {
          syncState = 'healthy'
        } else {
          syncState = 'out_of_sync'
        }
      } else if (inDatabase && storageFiles.length > 0) {
        // Both exist but couldn't verify chunk count - assume healthy
        syncState = 'healthy'
      } else {
        // Edge case: neither exists (shouldn't happen)
        continue
      }

      results.push({
        documentId,
        title: dbDoc?.title || `Unknown (${documentId.substring(0, 8)}...)`,
        storageFiles,
        inDatabase,
        chunkCount,
        syncState,
        createdAt: dbDoc?.created_at || null
      })
    }

    // Step 4: Check for documents in DB but not in Storage
    for (const dbDoc of (dbDocuments || [])) {
      // Skip if we already processed this document from Storage
      if (results.some(r => r.documentId === dbDoc.id)) {
        continue
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

    return {
      success: true,
      documents: results
    }

  } catch (error) {
    console.error('[scanStorage] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, documents: [], error: message }
  }
}

// ============================================================================
// Import from Storage - Storage-First Portability System
// ============================================================================

/**
 * Import conflict data structure for ConflictResolutionDialog
 */
export interface ImportConflict {
  documentId: string
  existingChunkCount: number
  importChunkCount: number
  existingProcessedAt: string
  importProcessedAt: string
  sampleChunks: {
    existing: ChunkExportData[]
    import: ChunkExportData[]
  }
}

/**
 * Chunk export data structure (matches worker/types/storage.ts)
 */
interface ChunkExportData {
  content: string
  chunk_index: number
  start_offset?: number
  end_offset?: number
  word_count?: number
  page_start?: number | null
  page_end?: number | null
  heading_level?: number | null
  section_marker?: string | null
  themes?: string[]
  importance_score?: number
  summary?: string | null
  metadata_extracted_at?: string | null
}

/**
 * Conflict resolution strategies for import
 */
export type ConflictStrategy = 'skip' | 'replace' | 'merge_smart'

/**
 * Import options for restoring from Storage
 */
export interface ImportOptions {
  strategy?: ConflictStrategy
  regenerateEmbeddings?: boolean
  reprocessConnections?: boolean
}

/**
 * Result of import operation with conflict detection
 */
export interface ImportResult {
  success: boolean
  jobId?: string
  needsResolution?: boolean
  conflict?: ImportConflict
  error?: string
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
 *
 * @param documentId - Document to import from Storage
 * @param options - Import options including conflict strategy
 * @returns Import result with job ID or conflict data
 *
 * @example
 * ```typescript
 * // First call: Detect conflict
 * const result = await importFromStorage(docId)
 * if (result.needsResolution) {
 *   // Show ConflictResolutionDialog with result.conflict
 * }
 *
 * // Second call: Apply strategy
 * const result2 = await importFromStorage(docId, { strategy: 'merge_smart' })
 * if (result2.success) {
 *   // Track job progress with result2.jobId
 * }
 * ```
 */
export async function importFromStorage(
  documentId: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[importFromStorage] Starting import for: ${documentId}`)
    console.log(`[importFromStorage] Options:`, options)

    // Validate documentId
    if (!documentId || typeof documentId !== 'string') {
      return { success: false, error: 'Invalid document ID' }
    }

    // Step 1: Check if chunks already exist in Database
    const { count: existingChunkCount, error: countError } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId)

    if (countError) {
      console.error('[importFromStorage] Error checking chunks:', countError)
      return { success: false, error: `Database error: ${countError.message}` }
    }

    const hasExistingChunks = (existingChunkCount || 0) > 0

    console.log(`[importFromStorage] Existing chunks: ${existingChunkCount}`)

    // Step 2: Read chunks.json from Storage to get import chunk count
    const storagePath = `${user.id}/${documentId}/chunks.json`

    let importChunkCount = 0
    let importProcessedAt = new Date().toISOString()
    let sampleImportChunks: ChunkExportData[] = []

    try {
      const { data: signedUrlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 3600)

      if (urlError || !signedUrlData?.signedUrl) {
        return {
          success: false,
          error: 'chunks.json not found in Storage. Process document first.'
        }
      }

      const response = await fetch(signedUrlData.signedUrl)
      if (!response.ok) {
        return {
          success: false,
          error: 'Failed to read chunks.json from Storage'
        }
      }

      const chunksData = await response.json() as {
        chunks?: ChunkExportData[]
        created_at?: string
      }

      importChunkCount = chunksData.chunks?.length || 0
      importProcessedAt = chunksData.created_at || importProcessedAt
      sampleImportChunks = chunksData.chunks?.slice(0, 3) || []

      console.log(`[importFromStorage] Import chunks: ${importChunkCount}`)

    } catch (error) {
      console.error('[importFromStorage] Error reading chunks.json:', error)
      return {
        success: false,
        error: 'Failed to read chunks.json. Ensure document is processed.'
      }
    }

    // Step 3: Handle conflict detection
    if (hasExistingChunks && !options.strategy) {
      console.log('[importFromStorage] Conflict detected, no strategy provided')

      // Query sample existing chunks for comparison
      const { data: existingChunks, error: chunksError } = await supabase
        .from('chunks')
        .select('content, chunk_index, themes, importance_score, summary, created_at')
        .eq('document_id', documentId)
        .order('chunk_index')
        .limit(3)

      if (chunksError) {
        console.error('[importFromStorage] Error fetching sample chunks:', chunksError)
      }

      const sampleExisting: ChunkExportData[] = (existingChunks || []).map(c => ({
        content: c.content,
        chunk_index: c.chunk_index,
        themes: c.themes || undefined,
        importance_score: c.importance_score || undefined,
        summary: c.summary || undefined
      }))

      // Get existing processed date
      const { data: docData } = await supabase
        .from('documents')
        .select('created_at')
        .eq('id', documentId)
        .single()

      const existingProcessedAt = docData?.created_at || new Date().toISOString()

      // Return conflict for UI resolution
      return {
        success: false,
        needsResolution: true,
        conflict: {
          documentId,
          existingChunkCount: existingChunkCount || 0,
          importChunkCount,
          existingProcessedAt,
          importProcessedAt,
          sampleChunks: {
            existing: sampleExisting,
            import: sampleImportChunks
          }
        }
      }
    }

    // Step 4: Handle skip strategy (no-op)
    if (options.strategy === 'skip') {
      console.log('[importFromStorage] Skip strategy selected, no changes')
      return {
        success: true,
        jobId: undefined,
        error: undefined
      }
    }

    // Step 5: Create background job for import
    console.log('[importFromStorage] Creating import job')

    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'import_document',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          document_id: documentId,
          storage_path: `${user.id}/${documentId}`,
          strategy: options.strategy || 'replace', // Default to replace if no conflict
          regenerateEmbeddings: options.regenerateEmbeddings || false,
          reprocessConnections: options.reprocessConnections || false
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[importFromStorage] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[importFromStorage] Import job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[importFromStorage] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ============================================================================
// Connection Reprocessing - Storage-First Portability System
// ============================================================================

/**
 * Reprocessing modes for connections
 */
export type ReprocessMode = 'all' | 'add_new' | 'smart'

/**
 * Valid engine types for connection reprocessing
 */
export type EngineType = 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'

/**
 * Options for connection reprocessing
 */
export interface ReprocessOptions {
  mode: ReprocessMode
  engines: EngineType[]
  preserveValidated?: boolean
  backupFirst?: boolean
}

/**
 * Result of reprocess connections operation
 */
export interface ReprocessResult {
  success: boolean
  jobId?: string
  error?: string
}

/**
 * Reprocess connections for a document with intelligent preservation.
 *
 * Modes:
 * - all: Delete all connections and regenerate from scratch (fresh start)
 * - add_new: Keep existing connections, only add connections to newer documents (incremental)
 * - smart: Preserve user-validated connections, regenerate others (safe for annotations)
 *
 * Engines:
 * - semantic_similarity: Fast, embedding-based, no AI cost
 * - contradiction_detection: Fast, metadata-based, no AI cost
 * - thematic_bridge: Slow, AI-powered, ~$0.20 per document
 *
 * Smart Mode Options:
 * - preserveValidated: Keep connections marked as user_validated=true
 * - backupFirst: Save validated connections to Storage before reprocessing
 *
 * @param documentId - Document to reprocess connections for
 * @param options - Reprocessing configuration
 * @returns Result with job ID for tracking
 *
 * @example
 * ```typescript
 * // Smart Mode (preserves validated connections)
 * const result = await reprocessConnections(docId, {
 *   mode: 'smart',
 *   engines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
 *   preserveValidated: true,
 *   backupFirst: true
 * })
 *
 * // Reprocess All (fresh start)
 * const result2 = await reprocessConnections(docId, {
 *   mode: 'all',
 *   engines: ['semantic_similarity', 'thematic_bridge']
 * })
 *
 * // Track progress
 * if (result.success) {
 *   // Poll background_jobs table with result.jobId
 * }
 * ```
 */
export async function reprocessConnections(
  documentId: string,
  options: ReprocessOptions
): Promise<ReprocessResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[reprocessConnections] Starting for: ${documentId}`)
    console.log(`[reprocessConnections] Options:`, options)

    // Validate documentId
    if (!documentId || typeof documentId !== 'string') {
      return { success: false, error: 'Invalid document ID' }
    }

    // Validate mode
    const validModes: ReprocessMode[] = ['all', 'add_new', 'smart']
    if (!validModes.includes(options.mode)) {
      return { success: false, error: `Invalid mode. Must be one of: ${validModes.join(', ')}` }
    }

    // Validate engines (at least one required)
    if (!options.engines || options.engines.length === 0) {
      return { success: false, error: 'At least one engine required' }
    }

    const validEngines: EngineType[] = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
    const invalidEngines = options.engines.filter(e => !validEngines.includes(e))
    if (invalidEngines.length > 0) {
      return {
        success: false,
        error: `Invalid engines: ${invalidEngines.join(', ')}. Valid engines: ${validEngines.join(', ')}`
      }
    }

    // Verify document exists and belongs to user
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, title')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      return { success: false, error: 'Document not found' }
    }

    if (doc.user_id !== user.id) {
      return { success: false, error: 'Not authorized to reprocess this document' }
    }

    console.log(`[reprocessConnections] Creating job for document: ${doc.title}`)

    // Create background job for reprocessing
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'reprocess_connections',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          document_id: documentId,
          mode: options.mode,
          engines: options.engines,
          preserveValidated: options.preserveValidated ?? true, // Default to true for safety
          backupFirst: options.backupFirst ?? true // Default to true for safety
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[reprocessConnections] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[reprocessConnections] Job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[reprocessConnections] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

// ============================================================================
// Export Documents - Storage-First Portability System
// ============================================================================

/**
 * Export format types for document bundles
 */
export type ExportFormat = 'storage' | 'zip'

/**
 * Options for document export
 */
export interface ExportOptions {
  includeConnections?: boolean
  includeAnnotations?: boolean
  format?: ExportFormat
}

/**
 * Result of export operation
 */
export interface ExportResult {
  success: boolean
  jobId?: string
  error?: string
}

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
 *
 * @example
 * ```typescript
 * // Export single document with connections
 * const result = await exportDocuments([docId], {
 *   includeConnections: true,
 *   includeAnnotations: true,
 *   format: 'zip'
 * })
 *
 * // Batch export multiple documents
 * const result2 = await exportDocuments([docId1, docId2, docId3], {
 *   format: 'zip'
 * })
 *
 * // Track progress
 * if (result.success) {
 *   // Poll background_jobs table with result.jobId
 *   // On completion, output_data will contain download URL
 * }
 * ```
 */
export async function exportDocuments(
  documentIds: string[],
  options: ExportOptions = {}
): Promise<ExportResult> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    console.log(`[exportDocuments] Starting export for ${documentIds.length} documents`)
    console.log(`[exportDocuments] Options:`, options)

    // Validate documentIds (non-empty array)
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return { success: false, error: 'At least one document ID required' }
    }

    // Validate all document IDs are strings
    const invalidIds = documentIds.filter(id => !id || typeof id !== 'string')
    if (invalidIds.length > 0) {
      return { success: false, error: 'All document IDs must be valid strings' }
    }

    // Verify all documents exist and belong to user
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id, user_id, title')
      .in('id', documentIds)

    if (docsError) {
      console.error('[exportDocuments] Error fetching documents:', docsError)
      return { success: false, error: `Database error: ${docsError.message}` }
    }

    if (!docs || docs.length === 0) {
      return { success: false, error: 'No documents found with provided IDs' }
    }

    // Check if user owns all documents
    const unauthorizedDocs = docs.filter(doc => doc.user_id !== user.id)
    if (unauthorizedDocs.length > 0) {
      return {
        success: false,
        error: `Not authorized to export: ${unauthorizedDocs.map(d => d.title).join(', ')}`
      }
    }

    // Check if all requested documents were found
    if (docs.length !== documentIds.length) {
      const foundIds = new Set(docs.map(d => d.id))
      const missingIds = documentIds.filter(id => !foundIds.has(id))
      return {
        success: false,
        error: `Documents not found: ${missingIds.join(', ')}`
      }
    }

    console.log(`[exportDocuments] Creating export job for: ${docs.map(d => d.title).join(', ')}`)

    // Create background job for export
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'export_documents',
        entity_type: 'document',
        entity_id: documentIds[0], // Use first document ID as primary entity
        input_data: {
          document_ids: documentIds,
          includeConnections: options.includeConnections ?? false,
          includeAnnotations: options.includeAnnotations ?? false,
          format: options.format || 'zip'
        }
      })
      .select()
      .single()

    if (jobError) {
      console.error('[exportDocuments] Failed to create job:', jobError)
      return { success: false, error: `Job creation failed: ${jobError.message}` }
    }

    console.log(`[exportDocuments] Export job created: ${job.id}`)

    return {
      success: true,
      jobId: job.id
    }

  } catch (error) {
    console.error('[exportDocuments] Unexpected error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}