/**
 * Continue Processing Handler
 * Resumes chunking pipeline after manual markdown review
 *
 * Simpler than reprocessing:
 * - No annotation recovery (annotations don't exist yet)
 * - No connection remapping (connections don't exist yet)
 * - Just: sync markdown → chunk → embed → save → detect connections
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Get Supabase client (lazy initialization)
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(`Missing environment variables: SUPABASE_URL=${!!supabaseUrl}, SERVICE_KEY=${!!supabaseServiceKey}`)
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export interface ContinueProcessingResult {
  success: boolean
  chunksCreated: number
}

/**
 * Continue processing a document from awaiting_manual_review state
 * Handles two review stages:
 * 1. docling_extraction: Can run AI cleanup or skip to chunking
 * 2. ai_cleanup: Just run chunking (AI cleanup already done)
 *
 * @param documentId - Document to continue processing
 * @param userId - User ID
 * @param jobId - Optional job ID for progress tracking
 * @param skipAiCleanup - Skip AI cleanup (only for docling_extraction stage)
 */
export async function continueProcessing(
  documentId: string,
  userId: string,
  jobId?: string,
  skipAiCleanup: boolean = false
): Promise<ContinueProcessingResult> {
  const supabase = getSupabaseClient()

  // Helper to update job progress
  async function updateProgress(percent: number, message?: string) {
    if (jobId) {
      await supabase
        .from('background_jobs')
        .update({
          progress: {
            percent,
            stage: 'continue_processing',
            details: message || ''
          }
        })
        .eq('id', jobId)
      console.log(`[ContinueProcessing] Progress: ${percent}% ${message || ''}`)
    }
  }

  try {
    console.log(`[ContinueProcessing] Starting for document ${documentId}`)
    await updateProgress(5, 'Starting chunking pipeline...')

    // 1. Get document
    const { data: document } = await supabase
      .from('documents')
      .select('id, markdown_path, processing_status, obsidian_path, review_stage')
      .eq('id', documentId)
      .single()

    if (!document) {
      throw new Error('Document not found')
    }

    if (document.processing_status !== 'awaiting_manual_review') {
      throw new Error(`Invalid status: ${document.processing_status}. Expected: awaiting_manual_review`)
    }

    const reviewStage = document.review_stage as 'docling_extraction' | 'ai_cleanup' | null
    console.log(`[ContinueProcessing] Review stage: ${reviewStage}, skipAiCleanup: ${skipAiCleanup}`)

    // 2. Sync latest version from Obsidian (if it was edited)
    // This is a simple sync - no annotation recovery needed
    if (document.obsidian_path) {
      console.log('[ContinueProcessing] Syncing markdown from Obsidian...')
      const { syncFromObsidian } = await import('./obsidian-sync.js')
      const syncResult = await syncFromObsidian(documentId, userId)

      if (syncResult.changed) {
        console.log('[ContinueProcessing] ✓ Synced edited markdown from Obsidian')
      } else {
        console.log('[ContinueProcessing] ✓ No changes in Obsidian (using existing markdown)')
      }
    }

    await updateProgress(10, 'Markdown synced')

    // 3. Download markdown from storage
    const { data: blob } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (!blob) {
      throw new Error('Failed to download markdown from storage')
    }

    let markdown = await blob.text()
    console.log(`[ContinueProcessing] Markdown loaded (${Math.round(markdown.length / 1024)}KB)`)
    await updateProgress(15, 'Markdown loaded')

    // 4. Handle AI cleanup if needed (only for docling_extraction stage)
    if (reviewStage === 'docling_extraction' && !skipAiCleanup) {
      console.log('[ContinueProcessing] Running AI cleanup on Docling extraction...')
      await updateProgress(20, 'AI cleaning markdown...')

      const { cleanPdfMarkdown } = await import('../lib/markdown-cleanup-ai.js')
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! })

      markdown = await cleanPdfMarkdown(ai, markdown, {
        onProgress: async (section, total) => {
          const percent = 20 + Math.floor((section / total) * 30) // 20-50%
          await updateProgress(percent, `AI cleaning section ${section}/${total}`)
        }
      })

      console.log(`[ContinueProcessing] ✓ AI cleanup complete (${Math.round(markdown.length / 1024)}KB)`)

      // Save cleaned markdown back to storage
      await updateProgress(51, 'Saving cleaned markdown...')
      const markdownBlob = new Blob([markdown], { type: 'text/plain' })
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .update(document.markdown_path, markdownBlob, {
          contentType: 'text/plain',
          upsert: true
        })

      if (uploadError) {
        console.warn(`[ContinueProcessing] ⚠️ Failed to save cleaned markdown: ${uploadError.message}`)
      } else {
        console.log('[ContinueProcessing] ✓ Cleaned markdown saved to storage')
      }

      await updateProgress(55, 'AI cleanup complete')
    }

    // 5. Set processing status and clear review_stage
    await supabase
      .from('documents')
      .update({
        processing_status: 'processing',
        review_stage: null // Clear review stage now that we're continuing
      })
      .eq('id', documentId)

    // 6. Run AI chunking
    await updateProgress(60, 'Starting AI chunking...')
    const { batchChunkAndExtractMetadata } = await import('../lib/ai-chunking-batch.js')

    const aiChunks = await batchChunkAndExtractMetadata(
      markdown,
      {
        apiKey: process.env.GOOGLE_AI_API_KEY,
        modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        enableProgress: false // We'll handle progress manually
      }
    )

    console.log(`[ContinueProcessing] Created ${aiChunks.length} chunks`)
    await updateProgress(80, `Created ${aiChunks.length} semantic chunks`)

    // 7. Generate embeddings
    await updateProgress(85, 'Generating embeddings...')
    const { generateEmbeddings } = await import('../lib/embeddings.js')
    const embeddings = await generateEmbeddings(aiChunks.map(c => c.content))
    console.log(`[ContinueProcessing] Generated ${embeddings.length} embeddings`)
    await updateProgress(88, 'Embeddings generated')

    // 8. Map chunks to database schema
    const chunksToInsert = aiChunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      content: chunk.content,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.content.split(/\s+/).length,
      themes: chunk.metadata?.themes || [],
      importance_score: chunk.metadata?.importance || 0.5,
      summary: chunk.metadata?.summary || null,

      // JSONB metadata columns for collision detection
      emotional_metadata: chunk.metadata?.emotional ? {
        polarity: chunk.metadata.emotional.polarity,
        primaryEmotion: chunk.metadata.emotional.primaryEmotion,
        intensity: chunk.metadata.emotional.intensity
      } : null,
      conceptual_metadata: chunk.metadata?.concepts ? {
        concepts: chunk.metadata.concepts
      } : null,
      domain_metadata: chunk.metadata?.domain ? {
        primaryDomain: chunk.metadata.domain,
        confidence: 0.8
      } : null,

      metadata_extracted_at: new Date().toISOString(),
      embedding: embeddings[index],
      is_current: true
    }))

    // 9. Insert chunks into database
    console.log(`[ContinueProcessing] Saving ${chunksToInsert.length} chunks to database`)
    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`)
    }

    console.log(`[ContinueProcessing] ✓ Saved ${chunksToInsert.length} chunks`)
    await updateProgress(90, 'Chunks saved to database')

    // 10. Queue collision detection job
    await updateProgress(92, 'Queueing collision detection...')

    // Check for existing active jobs to avoid duplicates
    const { data: existingJobs } = await supabase
      .from('background_jobs')
      .select('id, status')
      .eq('job_type', 'detect-connections')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing'])
      .contains('input_data', { document_id: documentId })
      .limit(1)

    if (existingJobs && existingJobs.length > 0) {
      console.log(`[ContinueProcessing] Collision detection job already exists (${existingJobs[0].status})`)
    } else {
      const { error: jobError } = await supabase
        .from('background_jobs')
        .insert({
          user_id: userId,
          job_type: 'detect-connections',
          status: 'pending',
          input_data: {
            document_id: documentId,
            user_id: userId,
            chunk_count: chunksToInsert.length,
            trigger: 'continue-processing-complete'
          },
          created_at: new Date().toISOString()
        })

      if (jobError) {
        console.warn(`[ContinueProcessing] ⚠️ Failed to create collision detection job: ${jobError.message}`)
      } else {
        console.log(`[ContinueProcessing] ✓ Collision detection job queued`)
      }
    }

    await updateProgress(95, 'Collision detection queued')

    // 11. Mark document as completed
    await supabase
      .from('documents')
      .update({
        processing_status: 'completed',
        markdown_available: true,
        embeddings_available: true
      })
      .eq('id', documentId)

    await updateProgress(100, 'Processing complete')
    console.log('[ContinueProcessing] ✅ Complete')

    return {
      success: true,
      chunksCreated: chunksToInsert.length
    }

  } catch (error) {
    console.error('[ContinueProcessing] ❌ Failed:', error)

    // Mark document as failed
    await supabase
      .from('documents')
      .update({
        processing_status: 'failed',
        processing_error: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', documentId)

    throw error
  }
}
