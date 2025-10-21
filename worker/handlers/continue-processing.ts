/**
 * Continue Processing Handler
 * Resumes chunking pipeline after manual markdown review
 *
 * Uses same Chonkie chunking pipeline as main processing:
 * - Stage 6: Chonkie chunking with user-selected strategy (9 strategies)
 * - Stage 7: Metadata transfer from cached Docling chunks
 * - Stage 8: Metadata enrichment (PydanticAI + Ollama)
 * - Stage 9: Local embeddings (Transformers.js)
 *
 * Simpler than reprocessing:
 * - No annotation recovery (annotations don't exist yet)
 * - No connection remapping (connections don't exist yet)
 * - Just: sync markdown → Chonkie chunk → enrich → embed → save → detect connections
 */

import { createClient } from '@supabase/supabase-js'
import { loadCachedChunksRaw } from '../lib/cached-chunks.js'
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'

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
 * @param chunkerStrategy - Chonkie chunking strategy (default: 'recursive')
 */
export async function continueProcessing(
  documentId: string,
  userId: string,
  jobId?: string,
  skipAiCleanup: boolean = false,
  chunkerStrategy: ChonkieStrategy = 'recursive'
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

    if (document.processing_status !== 'awaiting_manual_review' && document.processing_status !== 'failed') {
      throw new Error(`Invalid status: ${document.processing_status}. Expected: awaiting_manual_review or failed`)
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
      const markdownBlob = new Blob([markdown], { type: 'text/markdown' })
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .update(document.markdown_path, markdownBlob, {
          contentType: 'text/markdown',
          upsert: true
        })

      if (uploadError) {
        console.warn(`[ContinueProcessing] ⚠️ Failed to save cleaned markdown: ${uploadError.message}`)
      } else {
        console.log('[ContinueProcessing] ✓ Cleaned markdown saved to storage')
      }

      await updateProgress(55, 'AI cleanup complete')
    }

    // 5. Load cached Docling chunks for metadata transfer
    // Strategy 1: Check job metadata first (resume from checkpoint scenario)
    let cachedDoclingChunks = null
    const { data: job } = await supabase
      .from('background_jobs')
      .select('metadata')
      .eq('job_type', 'process_document')
      .eq('status', 'processing')
      .contains('input_data', { document_id: documentId })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (job?.metadata?.cached_extraction?.doclingChunks) {
      cachedDoclingChunks = job.metadata.cached_extraction.doclingChunks
      console.log(`[ContinueProcessing] ✓ Loaded ${cachedDoclingChunks.length} chunks from job metadata`)
    } else {
      // Strategy 2: Check cached_chunks table (true reprocessing scenario)
      console.log('[ContinueProcessing] No job metadata, checking cached_chunks table...')

      const cacheResult = await loadCachedChunksRaw(supabase, documentId)

      if (cacheResult) {
        cachedDoclingChunks = cacheResult.chunks
        console.log(`[ContinueProcessing] ✓ Loaded ${cachedDoclingChunks.length} cached chunks from cached_chunks table`)
      } else {
        console.warn('[ContinueProcessing] ⚠️ No cached chunks found - metadata transfer will be limited')
      }
    }

    // 6. Set processing status and clear review_stage
    await supabase
      .from('documents')
      .update({
        processing_status: 'processing',
        review_stage: null // Clear review stage now that we're continuing
      })
      .eq('id', documentId)

    // 6. Stage 6: Chonkie Chunking (60-72%)
    console.log(`[ContinueProcessing] Stage 6: Chunking with Chonkie strategy: ${chunkerStrategy}`)
    await updateProgress(60, `Chunking with ${chunkerStrategy} strategy`)

    const chonkieChunks = await chunkWithChonkie(markdown, {
      chunker_type: chunkerStrategy,
      timeout: 300000 // 5 minutes base timeout (scales with document size)
    })

    console.log(`[ContinueProcessing] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
    await updateProgress(72, `${chonkieChunks.length} chunks created`)

    // 7. Stage 7: Metadata Transfer (72-75%)
    // Transfer Docling metadata (pages, headings, bboxes) to Chonkie chunks
    console.log('[ContinueProcessing] Stage 7: Transferring Docling metadata to Chonkie chunks')
    await updateProgress(73, 'Transferring metadata via overlap detection')

    let chunksWithMetadata: any[]

    if (cachedDoclingChunks && cachedDoclingChunks.length > 0) {
      // Transfer metadata using overlap detection
      chunksWithMetadata = await transferMetadataToChonkieChunks(
        chonkieChunks,
        cachedDoclingChunks,
        documentId
      )
      console.log(`[ContinueProcessing] ✓ Metadata transfer complete: ${chunksWithMetadata.length} enriched chunks`)
      await updateProgress(75, 'Metadata transfer done')
    } else {
      // No cached chunks - create chunks with basic metadata
      console.warn('[ContinueProcessing] No cached chunks - using basic metadata only')
      chunksWithMetadata = chonkieChunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: index,
        content: chunk.text,
        start_offset: chunk.start_index,
        end_offset: chunk.end_index,
        word_count: chunk.text.split(/\s+/).length,
        // No Docling metadata available
        page_start: null,
        page_end: null,
        heading_level: null,
        section_marker: null,
        bboxes: null,
        heading_path: null,
        // Default metadata
        themes: [],
        importance_score: 0.5,
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      }))
      await updateProgress(75, 'Basic metadata assigned')
    }

    // 8. Stage 8: Metadata Enrichment (75-85%)
    console.log('[ContinueProcessing] Stage 8: Starting metadata enrichment (PydanticAI + Ollama)')
    await updateProgress(76, 'Extracting structured metadata...')

    const { bulletproofExtractMetadata } = await import('../lib/chunking/bulletproof-metadata.js')

    const batchInput = chunksWithMetadata.map(chunk => ({
      id: `${documentId}-${chunk.chunk_index}`,
      content: chunk.content
    }))

    const results = await bulletproofExtractMetadata(batchInput, {
      maxRetries: 5,
      enableGeminiFallback: false,
      onProgress: (processed, total, status) => {
        const overallProgress = 76 + Math.floor((processed / total) * 9) // 76-85%
        updateProgress(overallProgress, `Enriching chunk ${processed}/${total} (${status})`)
      }
    })

    // Apply extracted metadata to chunks
    let enrichedChunks = chunksWithMetadata.map(chunk => {
      const chunkId = `${documentId}-${chunk.chunk_index}`
      const result = results.get(chunkId)

      if (result) {
        return {
          ...chunk,
          themes: result.metadata.themes,
          importance_score: result.metadata.importance,
          summary: result.metadata.summary,
          emotional_metadata: {
            polarity: result.metadata.emotional.polarity,
            primaryEmotion: result.metadata.emotional.primaryEmotion,
            intensity: result.metadata.emotional.intensity
          },
          conceptual_metadata: {
            concepts: result.metadata.concepts
          },
          domain_metadata: {
            primaryDomain: result.metadata.domain,
            confidence: 0.8
          },
          metadata_extracted_at: new Date().toISOString()
        }
      }

      console.warn(`[ContinueProcessing] No metadata for chunk ${chunk.chunk_index}`)
      return chunk
    })

    console.log(`[ContinueProcessing] Metadata enrichment complete`)
    console.log(`  Quality distribution:`)
    console.log(`    - Ollama 32B: ${[...results.values()].filter(r => r.source === 'ollama-32b').length}`)
    console.log(`    - Ollama 14B: ${[...results.values()].filter(r => r.source === 'ollama-14b').length}`)
    console.log(`    - Ollama 7B: ${[...results.values()].filter(r => r.source === 'ollama-7b').length}`)
    console.log(`    - Regex: ${[...results.values()].filter(r => r.source === 'regex').length}`)
    console.log(`    - Fallback: ${[...results.values()].filter(r => r.source === 'fallback').length}`)
    await updateProgress(85, 'Metadata enrichment done')

    // 9. Stage 9: Local Embeddings (85-90%)
    console.log('[ContinueProcessing] Stage 9: Generating embeddings')
    await updateProgress(86, 'Generating embeddings...')

    const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
    const { generateEmbeddings } = await import('../lib/embeddings.js')

    let embeddings: number[][]
    try {
      const chunkContents = enrichedChunks.map(c => c.content)
      embeddings = await generateEmbeddingsLocal(chunkContents)
      console.log(`[ContinueProcessing] Local embeddings complete: ${embeddings.length} vectors (768d)`)
      await updateProgress(90, 'Local embeddings generated')
    } catch (error: any) {
      console.error(`[ContinueProcessing] Local embeddings failed: ${error.message}`)
      console.warn('[ContinueProcessing] Falling back to Gemini embeddings')

      try {
        const chunkContents = enrichedChunks.map(c => c.content)
        embeddings = await generateEmbeddings(chunkContents)
        console.log('[ContinueProcessing] Gemini embeddings fallback successful')
        await updateProgress(90, 'Gemini embeddings generated')
      } catch (fallbackError: any) {
        console.error(`[ContinueProcessing] Gemini embeddings also failed: ${fallbackError.message}`)
        // Create empty embeddings as last resort
        embeddings = enrichedChunks.map(() => new Array(768).fill(0))
        await updateProgress(90, 'Embeddings generation failed')
      }
    }

    // Attach embeddings and prepare for insertion
    const chunksToInsert = enrichedChunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index],
      is_current: true
    }))

    console.log(`[ContinueProcessing] Pipeline complete: ${chunksToInsert.length} chunks ready`)

    // 8. Insert chunks into database (both modes converge here)
    console.log(`[ContinueProcessing] Saving ${chunksToInsert.length} chunks to database`)
    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`)
    }

    console.log(`[ContinueProcessing] ✓ Saved ${chunksToInsert.length} chunks`)
    await updateProgress(90, 'Chunks saved to database')

    // 9. Queue collision detection job
    await updateProgress(92, 'Queueing collision detection...')

    // Check for existing active jobs to avoid duplicates
    const { data: existingJobs } = await supabase
      .from('background_jobs')
      .select('id, status')
      .eq('job_type', 'detect_connections')
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
          job_type: 'detect_connections',
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

    // 10. Mark document as completed
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
