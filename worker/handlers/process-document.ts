import { GoogleGenAI } from '@google/genai'
import { getUserFriendlyError, classifyError } from '../lib/errors.js'
import { ProcessorRouter } from '../processors/index.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import type { SourceType } from '../types/multi-format.js'
import type { ProcessResult } from '../types/processor.js'

/**
 * Model configuration with fallback support.
 * Uses gemini-2.0-flash-exp as default with 65536 token limit.
 */
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
const MAX_OUTPUT_TOKENS = 65536

console.log(`🤖 Using Gemini model: ${GEMINI_MODEL}`)

/**
 * Main document processing handler.
 * Routes processing to appropriate processor based on source type.
 * 
 * @param supabase - Supabase client with service role
 * @param job - Background job containing document processing request
 */
export async function processDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id } = job.input_data
  
  // Validate API key
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY is not configured')
  }
  
  // Initialize AI client
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GOOGLE_AI_API_KEY,
    httpOptions: {
      timeout: 900000 // 15 minutes for large documents
    }
  })

  // Get document metadata
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('storage_path, user_id')
    .eq('id', document_id)
    .single()
    
  if (docError || !doc) {
    throw new Error(`Document not found: ${document_id}`)
  }

  // Extract source type from job input
  const sourceType = (job.input_data.source_type as SourceType) || 'pdf'
  
  // Validate source type
  if (!ProcessorRouter.isValidSourceType(sourceType)) {
    const validTypes = ['pdf', 'youtube', 'web_url', 'markdown_asis', 'markdown_clean', 'txt', 'paste']
    throw new Error(
      `Invalid source type: ${sourceType}. Valid types are: ${validTypes.join(', ')}`
    )
  }

  console.log(`📄 Processing document ${document_id} as ${ProcessorRouter.getSourceTypeName(sourceType)}`)
  
  let processor = null
  
  try {
    // Create processor using router
    processor = ProcessorRouter.createProcessor(sourceType, ai, supabase, job)
    
    // Process document
    console.log(`🚀 Starting processing with ${processor.constructor.name}`)
    const result: ProcessResult = await processor.process()
    
    // Validate result
    if (!result) {
      throw new Error('Processor returned empty result')
    }
    
    if (!result.markdown || !result.chunks) {
      throw new Error('Processor result missing required fields (markdown, chunks)')
    }
    
    // Log success metrics
    console.log(`✅ Processing complete:`)
    console.log(`   - Chunks created: ${result.chunks.length}`)
    console.log(`   - Word count: ${result.wordCount || 'unknown'}`)
    console.log(`   - Outline sections: ${result.outline?.length || 0}`)
    
    // Handler saves markdown to storage
    const userId = doc.user_id
    const markdownPath = `${userId}/${document_id}/content.md`
    
    // Upload markdown to storage
    console.log(`💾 Saving markdown to storage: ${markdownPath}`)
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(markdownPath, result.markdown, {
        contentType: 'text/markdown',
        upsert: true
      })
    
    if (uploadError) {
      throw new Error(`Failed to save markdown: ${uploadError.message}`)
    }
    console.log(`✅ Markdown saved to storage`)
    
    // Generate embeddings for chunks
    console.log(`🔢 Generating embeddings for ${result.chunks.length} chunks`)
    const chunkTexts = result.chunks.map(chunk => chunk.content).filter(text => text && text.trim().length > 0)
    
    if (chunkTexts.length === 0) {
      throw new Error('No valid chunk content found for embedding generation')
    }
    
    if (chunkTexts.length !== result.chunks.length) {
      console.warn(`⚠️ Filtered out ${result.chunks.length - chunkTexts.length} empty chunks`)
    }
    
    const embeddings = await generateEmbeddings(chunkTexts)
    console.log(`✅ Generated ${embeddings.length} embeddings`)
    
    // Insert chunks with embeddings to database
    console.log(`💾 Saving chunks with embeddings to database`)
    const validChunks = result.chunks.filter(chunk => chunk.content && chunk.content.trim().length > 0)
    const chunksWithEmbeddings = validChunks.map((chunk, i) => ({
      ...chunk,
      document_id,
      embedding: embeddings[i],
      
      // Map metadata to database JSONB columns
      structural_metadata: chunk.metadata?.structural || null,
      emotional_metadata: chunk.metadata?.emotional || null,
      conceptual_metadata: chunk.metadata?.concepts || null,
      method_metadata: chunk.metadata?.methods || null,
      narrative_metadata: chunk.metadata?.narrative || null,
      reference_metadata: chunk.metadata?.references || null,
      domain_metadata: chunk.metadata?.domain || null,
      quality_metadata: chunk.metadata?.quality || null,
      metadata_extracted_at: chunk.metadata ? new Date().toISOString() : null
    }))
    
    const { error: chunkError } = await supabase
      .from('chunks')
      .insert(chunksWithEmbeddings)
    
    if (chunkError) {
      throw new Error(`Failed to save chunks: ${chunkError.message}`)
    }
    console.log(`✅ Saved ${chunksWithEmbeddings.length} chunks to database`)
    
    // Update document status to completed with availability flags
    await updateDocumentStatus(supabase, document_id, 'completed', true, true)
    
    // Final progress update
    await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Processing completed successfully')
    
    // Update job with success result
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          success: true,
          document_id,
          chunks_created: result.chunks.length,
          metadata: result.metadata,
          word_count: result.wordCount,
          outline: result.outline
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)
    
  } catch (error: any) {
    console.error('❌ Processing failed:', error)
    
    // Classify error for appropriate handling
    const errorType = classifyError(error)
    const userMessage = getUserFriendlyError(error)
    
    // Update document status
    await updateDocumentStatus(supabase, document_id, 'failed', false, false, userMessage)
    
    // Update job with error details
    await updateProgress(
      supabase, 
      job.id, 
      0, 
      'error', 
      'failed', 
      userMessage
    )
    
    // Determine if retry is appropriate
    if (errorType === 'transient') {
      console.log('🔄 Error is transient, job will be retried')
      throw error // Let job system handle retry
    } else {
      console.log('⛔ Error is permanent, no retry')
      // Mark job as permanently failed
      await supabase
        .from('background_jobs')
        .update({
          status: 'failed',
          output_data: {
            success: false,
            document_id,
            error: userMessage,
            error_type: errorType
          },
          last_error: userMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)
    }
  }
}

/**
 * Updates document processing status in database.
 * 
 * @param supabase - Supabase client
 * @param documentId - Document ID to update
 * @param status - New processing status
 * @param markdownAvailable - Whether markdown content is available in storage
 * @param embeddingsAvailable - Whether chunk embeddings have been generated
 * @param errorMessage - Optional error message if failed
 */
async function updateDocumentStatus(
  supabase: any, 
  documentId: string, 
  status: string, 
  markdownAvailable: boolean = false,
  embeddingsAvailable: boolean = false,
  errorMessage?: string
) {
  const updateData: any = {
    processing_status: status,
    markdown_available: markdownAvailable,
    embeddings_available: embeddingsAvailable
  }
  
  if (errorMessage) {
    updateData.processing_error = errorMessage
  }
  
  const { error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', documentId)
    
  if (error) {
    console.error('Failed to update document status:', error)
  }
}

/**
 * Updates job progress in background_jobs table.
 * 
 * @param supabase - Supabase client
 * @param jobId - Job ID to update
 * @param percentage - Progress percentage (0-100)
 * @param stage - Current processing stage
 * @param status - Job status
 * @param message - Human-readable progress message
 */
async function updateProgress(
  supabase: any,
  jobId: string,
  percentage: number,
  stage: string,
  status: string,
  message?: string
) {
  const { error } = await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent: percentage,
        stage,
        details: message || `${stage}: ${percentage}%`
      },
      status
    })
    .eq('id', jobId)
    
  if (error) {
    console.error('Failed to update job progress:', error)
  }
}

// Export for testing
export { updateDocumentStatus, updateProgress }