/**
 * Continue Processing Handler
 * Resumes chunking pipeline after manual markdown review
 *
 * Supports dual-mode processing:
 * - LOCAL mode: Bulletproof matching + PydanticAI + Transformers.js (zero cost)
 * - CLOUD mode: Gemini semantic chunking + embeddings ($0.50/book)
 *
 * Simpler than reprocessing:
 * - No annotation recovery (annotations don't exist yet)
 * - No connection remapping (connections don't exist yet)
 * - Just: sync markdown → chunk → embed → save → detect connections
 */

import { createClient } from '@supabase/supabase-js'
import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'

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

    // 5. Check processing mode and load cached data if LOCAL mode
    const isLocalMode = process.env.PROCESSING_MODE === 'local'
    console.log(`[ContinueProcessing] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

    // Load cached chunks from cached_chunks table (needed for LOCAL mode)
    let cachedDoclingChunks = null
    if (isLocalMode) {
      // Generate hash of current markdown for validation
      const currentHash = hashMarkdown(markdown)
      console.log(`[ContinueProcessing] Current markdown hash: ${currentHash.slice(0, 8)}...`)

      // Load cached chunks with hash validation
      const cacheResult = await loadCachedChunks(supabase, documentId, currentHash)

      if (!cacheResult) {
        console.warn('[ContinueProcessing] LOCAL mode but no valid cached chunks found (missing or stale)')
        console.warn('[ContinueProcessing] Falling back to CLOUD mode for this document')
      } else {
        cachedDoclingChunks = cacheResult.chunks
        console.log(`[ContinueProcessing] ✓ Loaded ${cachedDoclingChunks.length} cached chunks from cached_chunks table`)
        console.log(`[ContinueProcessing]   Mode: ${cacheResult.extraction_mode}, Created: ${cacheResult.created_at}`)
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

    // 7. Chunking: LOCAL or CLOUD mode
    let chunksToInsert: any[]

    if (isLocalMode && cachedDoclingChunks) {
      // ============================================================
      // LOCAL MODE: Bulletproof Matching + Local Metadata + Local Embeddings
      // ============================================================
      console.log('[ContinueProcessing] LOCAL MODE: Using bulletproof matching')
      await updateProgress(60, 'Starting bulletproof matching...')

      // Import LOCAL mode dependencies
      const { bulletproofMatch } = await import('../lib/local/bulletproof-matcher.js')
      const { extractMetadataBatch } = await import('../lib/chunking/pydantic-metadata.js')
      const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
      const { generateEmbeddings } = await import('../lib/embeddings.js')

      // Step 1: Bulletproof matching (60-70%)
      console.log('[ContinueProcessing] Running 5-layer bulletproof matching...')
      const { chunks: rematchedChunks, stats } = await bulletproofMatch(
        markdown,
        cachedDoclingChunks,
        {
          onProgress: async (layerNum, matched, remaining) => {
            console.log(`[ContinueProcessing] Layer ${layerNum}: ${matched} matched, ${remaining} remaining`)
            const percent = 60 + Math.floor((layerNum / 5) * 10)
            await updateProgress(percent, `Matching layer ${layerNum}/5`)
          }
        }
      )

      console.log(`[ContinueProcessing] Bulletproof matching complete:`)
      console.log(`  ✅ Exact: ${stats.exact}/${stats.total} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
      console.log(`  🔍 High: ${stats.high}/${stats.total}`)
      console.log(`  📍 Medium: ${stats.medium}/${stats.total}`)
      console.log(`  ⚠️  Synthetic: ${stats.synthetic}/${stats.total}`)

      await updateProgress(70, `${rematchedChunks.length} chunks matched`)

      // Step 2: Local metadata enrichment (70-80%)
      console.log('[ContinueProcessing] Starting local metadata enrichment (PydanticAI + Ollama)')
      await updateProgress(72, 'Extracting structured metadata...')

      let enrichedChunks = rematchedChunks.map((result, idx) => {
        const wordCount = result.chunk.content.split(/\s+/).filter((w: string) => w.length > 0).length
        return {
          document_id: documentId,
          content: result.chunk.content,
          chunk_index: idx,
          start_offset: result.start_offset,
          end_offset: result.end_offset,
          word_count: wordCount,
          // Docling metadata (LOCAL mode only)
          page_start: result.chunk.meta.page_start || null,
          page_end: result.chunk.meta.page_end || null,
          heading_level: result.chunk.meta.heading_level || null,
          heading_path: result.chunk.meta.heading_path || null,
          section_marker: result.chunk.meta.section_marker || null,
          bboxes: result.chunk.meta.bboxes || null,
          position_confidence: result.confidence,
          position_method: result.method,
          position_validated: false,
          // Default metadata (will be enriched)
          themes: [],
          importance_score: 0.5,
          summary: null,
          emotional_metadata: {
            polarity: 0,
            primaryEmotion: 'neutral',
            intensity: 0
          },
          conceptual_metadata: {
            concepts: []
          },
          domain_metadata: null,
          metadata_extracted_at: null
        }
      })

      try {
        const BATCH_SIZE = 10
        const enrichedResults: any[] = []

        for (let i = 0; i < enrichedChunks.length; i += BATCH_SIZE) {
          const batch = enrichedChunks.slice(i, i + BATCH_SIZE)
          const batchInput = batch.map(chunk => ({
            id: `${documentId}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[ContinueProcessing] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(enrichedChunks.length / BATCH_SIZE)}`)

          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed) => {
              const overallProgress = 72 + Math.floor(((i + processed) / enrichedChunks.length) * 8)
              updateProgress(overallProgress, `Enriching chunk ${i + processed}/${enrichedChunks.length}`)
            }
          })

          for (const chunk of batch) {
            const chunkId = `${documentId}-${chunk.chunk_index}`
            const metadata = metadataMap.get(chunkId)

            if (metadata) {
              enrichedResults.push({
                ...chunk,
                themes: metadata.themes,
                importance_score: metadata.importance,
                summary: metadata.summary,
                emotional_metadata: {
                  polarity: metadata.emotional.polarity,
                  primaryEmotion: metadata.emotional.primaryEmotion,
                  intensity: metadata.emotional.intensity
                },
                conceptual_metadata: {
                  concepts: metadata.concepts
                },
                domain_metadata: {
                  primaryDomain: metadata.domain,
                  confidence: 0.8
                },
                metadata_extracted_at: new Date().toISOString()
              })
            } else {
              console.warn(`[ContinueProcessing] Metadata extraction failed for chunk ${chunk.chunk_index}`)
              enrichedResults.push(chunk)
            }
          }
        }

        enrichedChunks = enrichedResults
        console.log(`[ContinueProcessing] Local metadata enrichment complete`)
        await updateProgress(80, 'Metadata enrichment done')

      } catch (error: any) {
        console.error(`[ContinueProcessing] Metadata enrichment failed: ${error.message}`)
        console.warn('[ContinueProcessing] Continuing with default metadata')
        await updateProgress(80, 'Using default metadata (enrichment failed)')
      }

      // Step 3: Local embeddings (80-85%)
      console.log('[ContinueProcessing] Starting local embeddings (Transformers.js)')
      await updateProgress(82, 'Generating local embeddings...')

      let embeddings: number[][]
      try {
        const chunkContents = enrichedChunks.map(c => c.content)
        embeddings = await generateEmbeddingsLocal(chunkContents)
        console.log(`[ContinueProcessing] Local embeddings complete: ${embeddings.length} vectors (768d)`)
        await updateProgress(85, 'Local embeddings generated')
      } catch (error: any) {
        console.error(`[ContinueProcessing] Local embeddings failed: ${error.message}`)
        console.warn('[ContinueProcessing] Falling back to Gemini embeddings')

        try {
          const chunkContents = enrichedChunks.map(c => c.content)
          embeddings = await generateEmbeddings(chunkContents)
          console.log('[ContinueProcessing] Gemini embeddings fallback successful')
          await updateProgress(85, 'Gemini embeddings generated')
        } catch (fallbackError: any) {
          console.error(`[ContinueProcessing] Gemini embeddings also failed: ${fallbackError.message}`)
          // Create empty embeddings as last resort
          embeddings = enrichedChunks.map(() => new Array(768).fill(0))
          await updateProgress(85, 'Embeddings generation failed')
        }
      }

      // Attach embeddings and prepare for insertion
      chunksToInsert = enrichedChunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index],
        is_current: true
      }))

      console.log(`[ContinueProcessing] LOCAL MODE complete: ${chunksToInsert.length} chunks ready`)

    } else {
      // ============================================================
      // CLOUD MODE: AI Semantic Chunking (existing path)
      // ============================================================
      console.log('[ContinueProcessing] CLOUD MODE: Using AI semantic chunking')
      await updateProgress(60, 'Starting AI chunking...')

      const { batchChunkAndExtractMetadata } = await import('../lib/ai-chunking-batch.js')

      const aiChunks = await batchChunkAndExtractMetadata(
        markdown,
        {
          apiKey: process.env.GOOGLE_AI_API_KEY,
          modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          enableProgress: false
        }
      )

      console.log(`[ContinueProcessing] Created ${aiChunks.length} semantic chunks`)
      await updateProgress(75, `${aiChunks.length} semantic chunks created`)

      // Generate embeddings
      await updateProgress(78, 'Generating embeddings...')
      const { generateEmbeddings } = await import('../lib/embeddings.js')
      const embeddings = await generateEmbeddings(aiChunks.map(c => c.content))
      console.log(`[ContinueProcessing] Generated ${embeddings.length} embeddings`)
      await updateProgress(85, 'Embeddings generated')

      // Map to database schema (CLOUD mode - no Docling metadata)
      chunksToInsert = aiChunks.map((chunk, index) => ({
        document_id: documentId,
        chunk_index: index,
        content: chunk.content,
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        word_count: chunk.content.split(/\s+/).length,
        themes: chunk.metadata?.themes || [],
        importance_score: chunk.metadata?.importance || 0.5,
        summary: chunk.metadata?.summary || null,
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

      console.log(`[ContinueProcessing] CLOUD MODE complete: ${chunksToInsert.length} chunks ready`)
    }

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
