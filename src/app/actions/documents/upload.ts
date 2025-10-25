'use server'

import { getSupabaseClient } from '@/lib/auth'
import { base64ToBlob } from '@/types/metadata'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthContext, createBackgroundJob, withErrorHandling } from './utils'
import type { JobProgress } from './types'

// ============================================================================
// Types
// ============================================================================

interface UploadConfig {
  sourceType: string
  sourceUrl: string | null
  processingRequested: boolean
  pastedContent: string | null
  reviewBeforeChunking: boolean
  cleanMarkdown: boolean
  reviewDoclingExtraction: boolean
  extractImages: boolean
  chunkerStrategy: string
  detectConnections: boolean  // NEW: Connection detection flag
  documentType: string | null
  author: string | null
  publicationYear: number | null
  publisher: string | null
  isbn: string | null
}

// ============================================================================
// Upload Helpers
// ============================================================================

/**
 * Extracts and parses upload configuration from FormData
 */
function extractUploadConfig(formData: FormData): UploadConfig {
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

  const detectConnectionsRaw = formData.get('detectConnections')
  const detectConnections = detectConnectionsRaw === 'true'  // NEW: Default false

  const documentType = formData.get('document_type') as string | null
  const author = formData.get('author') as string | null
  const publicationYear = formData.get('publication_year')
    ? parseInt(formData.get('publication_year') as string)
    : null
  const publisher = formData.get('publisher') as string | null
  const isbn = formData.get('isbn') as string | null

  console.log('[extractUploadConfig] Processing flags:', {
    reviewBeforeChunking: { raw: reviewBeforeChunkingRaw, parsed: reviewBeforeChunking },
    cleanMarkdown: { raw: cleanMarkdownRaw, parsed: cleanMarkdown },
    reviewDoclingExtraction: { raw: reviewDoclingExtractionRaw, parsed: reviewDoclingExtraction },
    extractImages: { raw: extractImagesRaw, parsed: extractImages },
    detectConnections: { raw: detectConnectionsRaw, parsed: detectConnections },
    chunkerStrategy
  })

  return {
    sourceType,
    sourceUrl,
    processingRequested,
    pastedContent,
    reviewBeforeChunking,
    cleanMarkdown,
    reviewDoclingExtraction,
    extractImages,
    chunkerStrategy,
    detectConnections,
    documentType,
    author,
    publicationYear,
    publisher,
    isbn
  }
}

/**
 * Validates upload configuration and file
 */
function validateUpload(config: UploadConfig, file: File | null): void {
  const validSourceTypes = ['pdf', 'epub', 'markdown_asis', 'markdown_clean', 'txt', 'youtube', 'web_url', 'paste']
  if (!validSourceTypes.includes(config.sourceType)) {
    throw new Error('Invalid source type')
  }

  if ((config.sourceType === 'youtube' || config.sourceType === 'web_url') && !config.sourceUrl) {
    throw new Error('Source URL required for this type')
  }

  if (config.sourceType === 'paste' && !config.pastedContent) {
    throw new Error('Content required for paste type')
  }

  if (!['youtube', 'web_url', 'paste'].includes(config.sourceType) && !file) {
    throw new Error('No file provided')
  }

  if (file) {
    const isValidType =
      file.type.includes('pdf') ||
      file.type === 'application/epub+zip' ||
      file.name.endsWith('.epub') ||
      file.type.includes('text') ||
      file.type.includes('markdown')

    if (!isValidType) {
      throw new Error('Only PDF, EPUB, text, and markdown files are supported')
    }
  }
}

/**
 * Uploads file to Supabase Storage
 */
async function uploadFileToStorage(
  supabase: SupabaseClient,
  storagePath: string,
  file: File,
  sourceType: string
): Promise<void> {
  let fileExtension = '.pdf'
  if (sourceType === 'epub') {
    fileExtension = '.epub'
  } else if (sourceType === 'markdown_asis' || sourceType === 'markdown_clean') {
    fileExtension = '.md'
  } else if (sourceType === 'txt') {
    fileExtension = '.txt'
  }

  const fullPath = `${storagePath}/source${fileExtension}`
  const { error } = await supabase.storage
    .from('documents')
    .upload(fullPath, file)

  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Determines document title from FormData or fallbacks
 */
function determineDocumentTitle(
  formData: FormData,
  file: File | null,
  sourceUrl: string | null
): string {
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
  return title
}

/**
 * Handles cover image upload (3 types: File, base64, URL)
 */
async function handleCoverImage(
  supabase: SupabaseClient,
  storagePath: string,
  formData: FormData
): Promise<string | null> {
  const coverImage = formData.get('cover_image') as File | null
  const coverImageData = formData.get('cover_image_data') as string | null

  if (coverImage) {
    // Case 1: Manual file upload from DocumentPreview
    const coverPath = `${storagePath}/cover.jpg`
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
      return publicUrl.publicUrl
    } else {
      console.warn('Cover image upload failed (non-blocking):', coverError.message)
    }
  } else if (coverImageData) {
    if (coverImageData.startsWith('data:image')) {
      // Case 2: Base64 from EPUB - decode and upload to storage
      console.log('Converting base64 cover image to storage')
      const coverBlob = base64ToBlob(coverImageData)
      const coverPath = `${storagePath}/cover.jpg`

      const { error: coverError } = await supabase.storage
        .from('documents')
        .upload(coverPath, coverBlob, { upsert: true })

      if (!coverError) {
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(coverPath)
        return data.publicUrl
      } else {
        console.warn('Cover upload failed (non-blocking):', coverError)
      }
    } else if (coverImageData.startsWith('http')) {
      // Case 3: URL from YouTube - use directly
      console.log('Using HTTP cover image URL')
      return coverImageData
    }
  }

  return null
}

/**
 * Inserts document record into database
 */
async function insertDocumentRecord(
  supabase: SupabaseClient,
  documentId: string,
  userId: string,
  data: {
    title: string
    storagePath: string
    coverImageUrl: string | null
    config: UploadConfig
  }
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .insert({
      id: documentId,
      user_id: userId,
      title: data.title,
      storage_path: data.storagePath,
      source_type: data.config.sourceType,
      source_url: data.config.sourceUrl,
      processing_requested: data.config.processingRequested,
      processing_status: 'pending',
      chunker_type: data.config.chunkerStrategy,
      document_type: data.config.documentType,
      author: data.config.author,
      publication_year: data.config.publicationYear,
      publisher: data.config.publisher,
      cover_image_url: data.coverImageUrl,
      detected_metadata: data.config.documentType ? {
        type: data.config.documentType,
        author: data.config.author,
        publisher: data.config.publisher,
        year: data.config.publicationYear?.toString(),
        isbn: data.config.isbn
      } : null
    })

  if (error) {
    throw new Error(error.message)
  }
}

/**
 * Cleans up storage on failure
 */
async function cleanupStorageOnFailure(
  supabase: SupabaseClient,
  storagePath: string,
  sourceType: string
): Promise<void> {
  let fileExtension = '.pdf'
  if (sourceType === 'markdown_asis' || sourceType === 'markdown_clean') {
    fileExtension = '.md'
  } else if (sourceType === 'txt') {
    fileExtension = '.txt'
  } else if (sourceType === 'epub') {
    fileExtension = '.epub'
  }

  await supabase.storage
    .from('documents')
    .remove([`${storagePath}/source${fileExtension}`])
}

// ============================================================================
// Main Upload Action
// ============================================================================

/**
 * Uploads a document to Supabase Storage and creates metadata record.
 * Also creates a background job for processing.
 */
export async function uploadDocument(formData: FormData): Promise<{
  success: boolean
  documentId?: string
  jobId?: string
  error?: string
}> {
  return withErrorHandling(async () => {
    // 1. Setup
    const { user, supabase } = await getAuthContext()
    const config = extractUploadConfig(formData)
    const file = formData.get('file') as File | null

    // 2. Validation
    validateUpload(config, file)

    // 3. Storage Upload
    const documentId = crypto.randomUUID()
    const storagePath = `${user.id}/${documentId}`

    try {
      if (file) {
        await uploadFileToStorage(supabase, storagePath, file, config.sourceType)
      }

      // 4. Metadata Processing
      const title = determineDocumentTitle(formData, file, config.sourceUrl)
      const coverImageUrl = await handleCoverImage(supabase, storagePath, formData)

      // 5. Database Record
      await insertDocumentRecord(supabase, documentId, user.id, {
        title,
        storagePath,
        coverImageUrl,
        config
      })

      // 6. Background Job
      const jobId = await createBackgroundJob(user.id, 'process_document', documentId, {
        document_id: documentId,
        storage_path: storagePath,
        source_type: config.sourceType,
        source_url: config.sourceUrl,
        processing_requested: config.processingRequested,
        pasted_content: config.pastedContent,
        document_type: config.documentType,
        reviewBeforeChunking: config.reviewBeforeChunking,
        cleanMarkdown: config.cleanMarkdown,
        reviewDoclingExtraction: config.reviewDoclingExtraction,
        extractImages: config.extractImages,
        chunkerStrategy: config.chunkerStrategy,
        detectConnections: config.detectConnections  // NEW: Pass connection detection flag
      })

      return { documentId, jobId }

    } catch (error) {
      // Cleanup on failure
      if (file) {
        await cleanupStorageOnFailure(supabase, storagePath, config.sourceType)
      }
      await supabase.from('documents').delete().eq('id', documentId)
      throw error
    }
  })
}

// ============================================================================
// Processing Actions
// ============================================================================

/**
 * Triggers processing for an uploaded document.
 * Creates a background job that the worker will pick up.
 */
export async function triggerProcessing(documentId: string): Promise<{
  success: boolean
  jobId?: string
  error?: string
}> {
  return withErrorHandling(async () => {
    console.log('🚀 triggerProcessing START for:', documentId)
    const { user, supabase } = await getAuthContext()

    // Get document storage path
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      throw new Error('Document not found')
    }

    // Create background job
    const jobId = await createBackgroundJob(user.id, 'process_document', documentId, {
      document_id: documentId,
      storage_path: doc.storage_path
    })

    console.log('✅ Background job created:', jobId)
    return { jobId }
  })
}

/**
 * Retries failed document processing by creating a new background job.
 */
export async function retryProcessing(documentId: string): Promise<{
  success: boolean
  jobId?: string
  error?: string
}> {
  return withErrorHandling(async () => {
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
    const result = await triggerProcessing(documentId)
    if (!result.success) {
      throw new Error(result.error || 'Failed to trigger processing')
    }

    return { jobId: result.jobId }
  })
}

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimates processing cost for a document.
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
