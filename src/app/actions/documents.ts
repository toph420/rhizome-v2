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

    console.log('[uploadDocument] Processing flags DEBUG:', {
      reviewBeforeChunking: { raw: reviewBeforeChunkingRaw, parsed: reviewBeforeChunking },
      cleanMarkdown: { raw: cleanMarkdownRaw, parsed: cleanMarkdown },
      reviewDoclingExtraction: { raw: reviewDoclingExtractionRaw, parsed: reviewDoclingExtraction },
      extractImages: { raw: extractImagesRaw, parsed: extractImages }
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
          extractImages: extractImages
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