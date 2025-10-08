import { GoogleGenAI } from '@google/genai'
import { getUserFriendlyError, classifyError } from '../lib/errors.js'
import { ProcessorRouter } from '../processors/index.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { enhanceThemesFromConcepts, enhanceSummaryFromConcepts } from '../lib/markdown-chunking.js'
import type { SourceType } from '../types/multi-format.js'
import type { ProcessResult } from '../types/processor.js'
import { GEMINI_MODEL } from '../lib/model-config.js'

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
    // ✅ STEP 1: CHECK FOR CACHED RESULTS (avoid re-running AI)
    const cachedChunks = job.metadata?.cached_chunks
    const cachedMarkdown = job.metadata?.cached_markdown
    const cachedMetadata = job.metadata?.cached_metadata
    const cachedWordCount = job.metadata?.cached_word_count
    const cachedOutline = job.metadata?.cached_outline

    let result: ProcessResult

    if (cachedChunks && cachedMarkdown) {
      // Use cached results from previous attempt
      console.log(`♻️  Using cached processing result from previous attempt`)
      console.log(`   - Cached chunks: ${cachedChunks.length}`)
      console.log(`   - Word count: ${cachedWordCount || 'unknown'}`)
      console.log(`💰 Saved ~$0.40 by skipping AI re-processing`)

      result = {
        markdown: cachedMarkdown,
        chunks: cachedChunks,
        metadata: cachedMetadata,
        wordCount: cachedWordCount,
        outline: cachedOutline
      }
    } else {
      // ✅ STEP 2: NO CACHE, RUN AI PROCESSING
      console.log(`🤖 No cache found, running AI processing`)

      // ✅ CHECK: Should we pause for manual review BEFORE chunking?
      const { reviewBeforeChunking = false } = job.input_data as any

      if (reviewBeforeChunking) {
        console.log('[ProcessDocument] Review before chunking enabled - will pause after extraction')
        // Continue with processor, but we'll pause before chunking later
      }

      // Create processor using router
      processor = ProcessorRouter.createProcessor(sourceType, ai, supabase, job)

      // ✅ START HEARTBEAT: Update job timestamp every 5 minutes during long processing
      // Also checks for job cancellation
      let jobCancelled = false
      const heartbeatInterval = setInterval(async () => {
        console.log('[Heartbeat] Updating job timestamp to prevent stale detection...')
        try {
          // Check if job has been cancelled
          const { data: currentJob } = await supabase
            .from('background_jobs')
            .select('status')
            .eq('id', job.id)
            .single()

          if (currentJob?.status === 'cancelled') {
            console.log('[Heartbeat] ⚠️  Job has been cancelled - stopping processing')
            jobCancelled = true
            clearInterval(heartbeatInterval)
            return
          }

          // Update timestamp if still processing
          await supabase
            .from('background_jobs')
            .update({
              started_at: new Date().toISOString() // Reset timeout clock
            })
            .eq('id', job.id)
        } catch (error) {
          console.error('[Heartbeat] Failed to update timestamp:', error)
        }
      }, 5 * 60 * 1000) // Every 5 minutes

      try {
        // Process document with AI
        console.log(`🚀 Starting processing with ${processor.constructor.name}`)
        result = await processor.process()

        // Check if job was cancelled during processing
        if (jobCancelled) {
          throw new Error('Job was cancelled during processing')
        }
      } finally {
        // ✅ ALWAYS CLEANUP: Stop heartbeat when processing completes or fails
        clearInterval(heartbeatInterval)
        console.log('[Heartbeat] Stopped')
      }

      // ✅ STEP 3: CACHE IMMEDIATELY AFTER AI PROCESSING (before database operations)
      console.log(`💾 Caching processing result for retry safety`)
      console.log(`   - Chunks to cache: ${result.chunks.length}`)
      console.log(`   - Markdown size: ${Math.round(result.markdown.length / 1024)}KB`)

      await supabase
        .from('background_jobs')
        .update({
          metadata: {
            // Existing caching (keep this)
            cached_chunks: result.chunks,
            cached_markdown: result.markdown,
            cached_metadata: result.metadata,
            cached_word_count: result.wordCount,
            cached_outline: result.outline,
            cache_created_at: new Date().toISOString(),

            // NEW: Stage tracking for idempotent retry
            processing_stage: 'extracted',
            completed_stages: ['extracting'],
            stage_timestamps: {
              extracting: new Date().toISOString()
            }
          }
        })
        .eq('id', job.id)

      console.log(`✅ Processing complete and cached (stage: extracted)`)
    }

    // Validate result (same as before)
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

    // Refresh connection after long processing (prevents stale connection)
    console.log(`🔄 Refreshing Supabase connection after processing`)
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set')
    }
    supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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

    // Update markdown_path in database to match actual storage location
    const { error: pathUpdateError } = await supabase
      .from('documents')
      .update({ markdown_path: markdownPath })
      .eq('id', document_id)

    if (pathUpdateError) {
      console.warn(`⚠️ Failed to update markdown_path: ${pathUpdateError.message}`)
    } else {
      console.log(`✅ Updated markdown_path: ${markdownPath}`)
    }

    // Update stage after markdown saved
    await updateStage(supabase, job.id, 'markdown_saved')

    // NEW: Check if manual review is requested - if so, pause BEFORE saving chunks
    const { reviewBeforeChunking = false } = job.input_data as any

    if (reviewBeforeChunking) {
      console.log('[ProcessDocument] Review mode - pausing before saving chunks')

      // Discard the chunks the processor created - we'll re-chunk after review
      console.log(`[ProcessDocument] Discarding ${result.chunks.length} pre-review chunks`)

      // Export to Obsidian for review
      const { exportToObsidian } = await import('./obsidian-sync.js')
      const exportResult = await exportToObsidian(document_id, userId)

      if (exportResult.success) {
        console.log(`[ProcessDocument] ✓ Exported to Obsidian: ${exportResult.path}`)
      } else {
        console.warn(`[ProcessDocument] ⚠️ Export failed: ${exportResult.error}`)
      }

      // Pause pipeline
      await supabase
        .from('documents')
        .update({ processing_status: 'awaiting_manual_review' })
        .eq('id', document_id)

      await supabase
        .from('background_jobs')
        .update({
          progress: {
            percent: 50,
            stage: 'awaiting_manual_review',
            details: 'Exported to Obsidian - awaiting manual review'
          },
          status: 'completed',
          output_data: {
            success: true,
            status: 'awaiting_manual_review',
            message: 'Review markdown in Obsidian, then click "Continue Processing"',
            exportPath: exportResult.path,
            exportUri: exportResult.uri,
            discardedChunks: result.chunks.length
          },
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)

      console.log('[ProcessDocument] ⏸️ Paused - chunks will be created after review')
      return {
        success: true,
        status: 'awaiting_manual_review',
        message: 'Review markdown in Obsidian, then click "Continue Processing"'
      }
    }

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
      ...chunk,  // Processor already mapped metadata correctly via mapAIChunkToDatabase
      document_id,  // CRITICAL: Set document_id AFTER spread to prevent undefined override
      embedding: embeddings[i]
    }))

    // ✅ CONDITIONAL CHUNK DELETION: Stage-aware cleanup to prevent FK violations
    // Only delete chunks if starting fresh, not if resuming from a checkpoint
    const stage = job.metadata?.processing_stage || 'pending'
    const isResume = ['chunked', 'embedded', 'complete'].includes(stage)

    if (isResume) {
      console.log(`♻️  Resuming from stage: ${stage}, keeping existing chunks`)
      console.log(`   This prevents FK violations in collision detection`)
    } else {
      // Fresh processing: Clean slate for consistent chunk_index ordering
      // Why: If AI re-chunking produces fewer chunks (350 vs 366), we don't want orphans
      console.log(`🧹 Cleaning existing chunks for fresh processing`)
      const { error: deleteError } = await supabase
        .from('chunks')
        .delete()
        .eq('document_id', document_id)

      if (deleteError) {
        // Log warning but continue - delete might fail if no chunks exist yet
        console.warn(`⚠️ Failed to clean existing chunks: ${deleteError.message}`)
      }
    }

    // ✅ STEP 2: INSERT FRESH CHUNKS
    // Unique constraint on (document_id, chunk_index) prevents duplicates
    const { error: chunkError } = await supabase
      .from('chunks')
      .insert(chunksWithEmbeddings)

    if (chunkError) {
      throw new Error(`Failed to save chunks: ${chunkError.message}`)
    }
    console.log(`✅ Saved ${chunksWithEmbeddings.length} chunks to database`)

    // Update stage after chunks inserted
    await updateStage(supabase, job.id, 'chunked')

    // ✅ ASYNC CONNECTION DETECTION: Queued as separate job (doesn't block document completion)
    // This prevents the main processing job from timing out during connection detection
    if (chunksWithEmbeddings.length >= 2) {
      // Check for existing ACTIVE jobs to avoid duplicates
      // Only check pending/processing - allow retries if previous job completed/failed
      const { data: existingJobs } = await supabase
        .from('background_jobs')
        .select('id, status')
        .eq('job_type', 'detect-connections')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing'])
        .contains('input_data', { document_id })
        .limit(1)

      if (existingJobs && existingJobs.length > 0) {
        console.log(`🔍 Collision detection job already exists (${existingJobs[0].status}) - skipping duplicate`)
      } else {
        console.log(`🔍 Creating collision detection job for ${chunksWithEmbeddings.length} chunks`)
        const { error: jobError } = await supabase
          .from('background_jobs')
          .insert({
            user_id: userId,  // Required field in background_jobs table
            job_type: 'detect-connections',
            status: 'pending',
            input_data: {
              document_id,
              user_id: userId,
              chunk_count: chunksWithEmbeddings.length,
              trigger: 'document-processing-complete'
            },
            created_at: new Date().toISOString()
          })

        if (jobError) {
          console.error(`❌ Failed to create collision detection job: ${jobError.message}`)
        } else {
          console.log(`🔍 Collision detection job queued`)
        }
      }
    } else {
      console.log(`📭 Skipping collision detection - need at least 2 chunks (found ${chunksWithEmbeddings.length})`)
    }

    // Update stage after embeddings complete (document ready for use)
    await updateStage(supabase, job.id, 'embedded')

    // Update document status to completed with availability flags and source_metadata
    await updateDocumentStatus(
      supabase,
      document_id,
      'completed',
      true,
      true,
      undefined, // No error message
      result.metadata?.source_metadata, // YouTube timestamps if applicable
      result.metadata?.extra?.source_type || sourceType // Explicit source type
    )
    
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
 * Updates processing stage in job metadata for idempotent retry.
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID to update
 * @param stage - Current processing stage
 */
async function updateStage(
  supabase: any,
  jobId: string,
  stage: string
) {
  const { data: job } = await supabase
    .from('background_jobs')
    .select('metadata')
    .eq('id', jobId)
    .single()

  const metadata = job?.metadata || {}
  const completedStages = metadata.completed_stages || []

  await supabase
    .from('background_jobs')
    .update({
      metadata: {
        ...metadata,
        processing_stage: stage,
        completed_stages: [...completedStages, stage],
        stage_timestamps: {
          ...metadata.stage_timestamps,
          [stage]: new Date().toISOString()
        }
      }
    })
    .eq('id', jobId)

  console.log(`📍 Stage updated: ${stage}`)
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
 * @param sourceMetadata - Optional source-specific metadata (e.g., YouTube timestamps)
 * @param sourceType - Optional explicit source type
 */
async function updateDocumentStatus(
  supabase: any,
  documentId: string,
  status: string,
  markdownAvailable: boolean = false,
  embeddingsAvailable: boolean = false,
  errorMessage?: string,
  sourceMetadata?: any,
  sourceType?: string
) {
  const updateData: any = {
    processing_status: status,
    markdown_available: markdownAvailable,
    embeddings_available: embeddingsAvailable
  }

  if (errorMessage) {
    updateData.processing_error = errorMessage
  }

  // Store source_metadata if provided (YouTube timestamps, etc.)
  if (sourceMetadata) {
    updateData.source_metadata = sourceMetadata
  }

  // Store explicit source_type if provided
  if (sourceType) {
    updateData.source_type = sourceType
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
export { updateDocumentStatus, updateProgress, updateStage }