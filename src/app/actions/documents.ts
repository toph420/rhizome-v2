'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getSupabaseClient } from '@/lib/auth'

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
    const file = formData.get('file') as File
    if (!file) {
      return { success: false, error: 'No file provided' }
    }
    
    if (!file.type.includes('pdf') && !file.type.includes('text')) {
      return { success: false, error: 'Only PDF and text files are supported' }
    }
    
    const user = await getCurrentUser()
    const supabase = getSupabaseClient()
    const documentId = crypto.randomUUID()
    
    const storagePath = `${user.id}/${documentId}/source.pdf`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file)
    
    if (uploadError) {
      return { success: false, error: uploadError.message }
    }
    
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        user_id: user.id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        storage_path: `${user.id}/${documentId}`,
        processing_status: 'pending'
      })
    
    if (dbError) {
      await supabase.storage.from('documents').remove([storagePath])
      return { success: false, error: dbError.message }
    }
    
    // NEW: Create background job for processing
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        user_id: user.id,
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: documentId,
        input_data: {
          document_id: documentId,
          storage_path: `${user.id}/${documentId}`
        }
      })
      .select()
      .single()
    
    if (jobError) {
      await supabase.from('documents').delete().eq('id', documentId)
      await supabase.storage.from('documents').remove([storagePath])
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
  progress: Record<string, any>
  last_error: string | null
} | null> {
  try {
    const supabase = getSupabaseClient()
    const user = await getCurrentUser()
    
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
  } catch (error) {
    return null
  }
}