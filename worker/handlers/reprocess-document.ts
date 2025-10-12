/**
 * Document Reprocessing Orchestrator
 * Coordinates annotation recovery and connection remapping after document edits
 *
 * Transaction-Safe Pattern with Batch ID:
 * 1. Mark old chunks as is_current: false
 * 2. Create new chunks with is_current: false + reprocessing_batch timestamp
 * 3. Run collision detection (non-blocking - wrapped in try-catch)
 * 4. Recover annotations with fuzzy matching
 * 5. Remap connections (queries old chunk data internally)
 * 6. ALWAYS commit (let user review via UI)
 * 7. Delete ALL old chunks (simple: is_current = false)
 * 8. On error: Delete new chunks by batch ID, restore old chunks
 */

import { createClient } from '@supabase/supabase-js'
import { recoverAnnotations } from './recover-annotations.js'
import { remapConnections } from './remap-connections.js'
import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
import type { ReprocessResults, Chunk } from '../types/recovery.js'

/**
 * Reprocess a document with transaction-safe annotation recovery
 *
 * @param documentId - Document to reprocess
 * @param supabaseClient - Optional Supabase client (if not provided, creates new one)
 * @param jobId - Optional job ID for progress tracking
 * @returns Recovery results for annotations and connections
 */
export async function reprocessDocument(
  documentId: string,
  supabaseClient?: any,
  jobId?: string
): Promise<ReprocessResults> {
  const startTime = Date.now()
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Helper to update job progress
  async function updateProgress(percent: number, message?: string) {
    if (jobId) {
      await supabase
        .from('background_jobs')
        .update({
          progress: {
            percent,
            stage: 'reprocessing',
            details: message || ''
          }
        })
        .eq('id', jobId)
      console.log(`[ReprocessDocument] Progress: ${percent}% ${message || ''}`)
    }
  }

  // Unique batch ID for this reprocessing attempt
  const reprocessingBatch = new Date().toISOString()

  console.log(`[ReprocessDocument] Starting for document ${documentId}`)
  console.log(`[ReprocessDocument] Batch ID: ${reprocessingBatch}`)
  await updateProgress(5, 'Starting reprocessing...')

  try {
    // 1. Set processing status
    await supabase
      .from('documents')
      .update({ processing_status: 'reprocessing' })
      .eq('id', documentId)

    // 2. Fetch edited markdown from storage
    const { data: document } = await supabase
      .from('documents')
      .select('markdown_path')
      .eq('id', documentId)
      .single()

    if (!document?.markdown_path) {
      throw new Error('Document markdown_path not found')
    }

    const { data: blob } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    if (!blob) {
      throw new Error('Failed to download markdown from storage')
    }

    const newMarkdown = await blob.text()
    await updateProgress(10, 'Markdown fetched')

    // 3. Mark old chunks as not current (transaction safety)
    console.log('[ReprocessDocument] Marking old chunks as is_current: false')
    await supabase
      .from('chunks')
      .update({ is_current: false })
      .eq('document_id', documentId)
      .eq('is_current', true)
    await updateProgress(15, 'Old chunks marked')

    // 4. Reprocess markdown to create new chunks with metadata
    console.log('[ReprocessDocument] Creating new chunks from edited markdown...')
    await updateProgress(20, 'Checking for cached chunks...')

    // Check processing mode and load cached chunks if LOCAL mode
    const isLocalMode = process.env.PROCESSING_MODE === 'local'
    console.log(`[ReprocessDocument] Processing mode: ${isLocalMode ? 'LOCAL' : 'CLOUD'}`)

    let aiChunks: any[]
    let embeddings: number[][]

    if (isLocalMode) {
      // ============================================================
      // LOCAL MODE: Cached Chunks + Bulletproof Matching + Local Pipeline
      // ============================================================
      console.log('[ReprocessDocument] LOCAL MODE: Loading cached chunks for bulletproof matching')

      // Generate hash of new markdown for validation
      const currentHash = hashMarkdown(newMarkdown)
      console.log(`[ReprocessDocument] Current markdown hash: ${currentHash.slice(0, 8)}...`)

      // Load cached chunks with hash validation
      const cacheResult = await loadCachedChunks(supabase, documentId, currentHash)

      if (!cacheResult) {
        console.warn('[ReprocessDocument] LOCAL mode but no valid cached chunks found')
        console.warn('[ReprocessDocument] Falling back to CLOUD mode for this reprocessing')
        // Fall through to CLOUD mode path below
      } else {
        const cachedDoclingChunks = cacheResult.chunks
        console.log(`[ReprocessDocument] ✓ Found ${cachedDoclingChunks.length} cached chunks`)
        console.log(`[ReprocessDocument]   Mode: ${cacheResult.extraction_mode}, Created: ${cacheResult.created_at}`)
        await updateProgress(25, `Loaded ${cachedDoclingChunks.length} cached chunks`)

        // Import LOCAL mode dependencies
        const { bulletproofMatch } = await import('../lib/local/bulletproof-matcher.js')
        const { extractMetadataBatch } = await import('../lib/chunking/pydantic-metadata.js')
        const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
        const { generateEmbeddings: generateGeminiEmbeddings } = await import('../lib/embeddings.js')

        // Step 1: Bulletproof matching (25-45%)
        console.log('[ReprocessDocument] Running 5-layer bulletproof matching...')
        await updateProgress(30, 'Starting bulletproof matching...')

        const { chunks: rematchedChunks, stats } = await bulletproofMatch(
          newMarkdown,
          cachedDoclingChunks,
          {
            onProgress: async (layerNum, matched, remaining) => {
              console.log(`[ReprocessDocument] Layer ${layerNum}: ${matched} matched, ${remaining} remaining`)
              const percent = 30 + Math.floor((layerNum / 5) * 15)
              await updateProgress(percent, `Matching layer ${layerNum}/5`)
            }
          }
        )

        console.log(`[ReprocessDocument] Bulletproof matching complete:`)
        console.log(`  ✅ Exact: ${stats.exact}/${stats.total} (${(stats.exact / stats.total * 100).toFixed(1)}%)`)
        console.log(`  🔍 High: ${stats.high}/${stats.total}`)
        console.log(`  📍 Medium: ${stats.medium}/${stats.total}`)
        console.log(`  ⚠️  Synthetic: ${stats.synthetic}/${stats.total}`)
        await updateProgress(45, `${rematchedChunks.length} chunks matched`)

        // Step 2: Local metadata enrichment (45-55%)
        console.log('[ReprocessDocument] Starting local metadata enrichment (PydanticAI + Ollama)')
        await updateProgress(47, 'Extracting structured metadata...')

        let enrichedChunks = rematchedChunks.map((result, idx) => {
          const wordCount = result.chunk.content.split(/\s+/).filter((w: string) => w.length > 0).length
          return {
            document_id: documentId,
            content: result.chunk.content,
            chunk_index: idx,
            start_offset: result.start_offset,
            end_offset: result.end_offset,
            word_count: wordCount,
            // Docling structural metadata (preserved from cache)
            page_start: result.chunk.meta.page_start || null,
            page_end: result.chunk.meta.page_end || null,
            heading_level: result.chunk.meta.heading_level || null,
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

            console.log(`[ReprocessDocument] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(enrichedChunks.length / BATCH_SIZE)}`)

            const metadataMap = await extractMetadataBatch(batchInput, {
              onProgress: (processed) => {
                const overallProgress = 47 + Math.floor(((i + processed) / enrichedChunks.length) * 8)
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
                console.warn(`[ReprocessDocument] Metadata extraction failed for chunk ${chunk.chunk_index}`)
                enrichedResults.push(chunk)
              }
            }
          }

          enrichedChunks = enrichedResults
          console.log(`[ReprocessDocument] Local metadata enrichment complete`)
          await updateProgress(55, 'Metadata enrichment done')

        } catch (error: any) {
          console.error(`[ReprocessDocument] Metadata enrichment failed: ${error.message}`)
          console.warn('[ReprocessDocument] Continuing with default metadata')
          await updateProgress(55, 'Using default metadata (enrichment failed)')
        }

        // Step 3: Local embeddings (55-65%)
        console.log('[ReprocessDocument] Starting local embeddings (Transformers.js)')
        await updateProgress(57, 'Generating local embeddings...')

        try {
          const chunkContents = enrichedChunks.map(c => c.content)
          embeddings = await generateEmbeddingsLocal(chunkContents)
          console.log(`[ReprocessDocument] Local embeddings complete: ${embeddings.length} vectors (768d)`)
          await updateProgress(65, 'Local embeddings generated')
        } catch (error: any) {
          console.error(`[ReprocessDocument] Local embeddings failed: ${error.message}`)
          console.warn('[ReprocessDocument] Falling back to Gemini embeddings')

          try {
            const chunkContents = enrichedChunks.map(c => c.content)
            embeddings = await generateGeminiEmbeddings(chunkContents)
            console.log('[ReprocessDocument] Gemini embeddings fallback successful')
            await updateProgress(65, 'Gemini embeddings generated')
          } catch (fallbackError: any) {
            console.error(`[ReprocessDocument] Gemini embeddings also failed: ${fallbackError.message}`)
            // Create empty embeddings as last resort
            embeddings = enrichedChunks.map(() => new Array(768).fill(0))
            await updateProgress(65, 'Embeddings generation failed')
          }
        }

        // Map to aiChunks format (compatible with existing code below)
        aiChunks = enrichedChunks.map((chunk, index) => ({
          content: chunk.content,
          start_offset: chunk.start_offset,
          end_offset: chunk.end_offset,
          metadata: {
            themes: chunk.themes,
            importance: chunk.importance_score,
            summary: chunk.summary,
            emotional: chunk.emotional_metadata,
            concepts: chunk.conceptual_metadata.concepts,
            domain: chunk.domain_metadata?.primaryDomain
          },
          // Include Docling structural metadata
          page_start: chunk.page_start,
          page_end: chunk.page_end,
          heading_level: chunk.heading_level,
          section_marker: chunk.section_marker,
          bboxes: chunk.bboxes,
          position_confidence: chunk.position_confidence,
          position_method: chunk.position_method
        }))

        console.log(`[ReprocessDocument] LOCAL MODE complete: ${aiChunks.length} chunks ready with structural metadata`)
        console.log(`[ReprocessDocument] Cost: $0.00 (zero Gemini calls)`)
        await updateProgress(70, `LOCAL mode complete: ${aiChunks.length} chunks`)

        // Skip CLOUD mode path below
        // Continue to chunk insertion (section 6)
      }
    }

    // ============================================================
    // CLOUD MODE: AI Semantic Chunking (existing path)
    // ============================================================
    if (!aiChunks) {
      console.log('[ReprocessDocument] CLOUD MODE: Using AI semantic chunking')
      await updateProgress(20, 'Starting AI chunking (this may take several minutes)...')

      const { batchChunkAndExtractMetadata } = await import('../lib/ai-chunking-batch.js')
      const { generateEmbeddings: generateGeminiEmbeddings } = await import('../lib/embeddings.js')

      // Process markdown with AI to create semantic chunks
      aiChunks = await batchChunkAndExtractMetadata(
        newMarkdown,
        {
          apiKey: process.env.GOOGLE_AI_API_KEY,
          modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
          enableProgress: false
        }
      )

      console.log(`[ReprocessDocument] Created ${aiChunks.length} chunks via AI`)
      await updateProgress(60, `Created ${aiChunks.length} semantic chunks`)

      // 5. Generate embeddings for new chunks
      console.log('[ReprocessDocument] Generating embeddings...')
      await updateProgress(65, 'Generating embeddings...')
      embeddings = await generateGeminiEmbeddings(aiChunks.map(c => c.content))
      await updateProgress(70, 'Embeddings generated')
    }

    // 6. Insert new chunks with batch ID (transaction safety)
    // Map AI metadata to database schema (JSONB columns for 3-engine collision detection)
    const newChunksToInsert = aiChunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: index,
      content: chunk.content,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.content.split(/\s+/).length,
      themes: chunk.metadata?.themes || [],
      importance_score: chunk.metadata?.importance || 0.5,
      summary: chunk.metadata?.summary || null,

      // JSONB metadata columns for collision detection engines
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

      // Docling structural metadata (only present in LOCAL mode)
      page_start: chunk.page_start || null,
      page_end: chunk.page_end || null,
      heading_level: chunk.heading_level || null,
      section_marker: chunk.section_marker || null,
      bboxes: chunk.bboxes || null,
      position_confidence: chunk.position_confidence || null,
      position_method: chunk.position_method || null,
      position_validated: false,

      metadata_extracted_at: new Date().toISOString(),
      embedding: embeddings[index],
      is_current: false, // Transaction safety - not current until recovery succeeds
      reprocessing_batch: reprocessingBatch // Tag for rollback
    }))

    const { data: insertedChunks, error: insertError } = await supabase
      .from('chunks')
      .insert(newChunksToInsert)
      .select('id, document_id, chunk_index, start_offset, end_offset, content, embedding, is_current')

    if (insertError || !insertedChunks) {
      throw new Error(`Failed to insert new chunks: ${insertError?.message}`)
    }

    const newChunks = insertedChunks
    console.log(`[ReprocessDocument] Inserted ${newChunks.length} new chunks`)
    await updateProgress(73, 'New chunks inserted')

    // 7. Run collision detection (wrapped in try-catch - non-blocking)
    // Don't let connection failures block annotation recovery
    try {
      console.log('[ReprocessDocument] Running 3-engine collision detection...')
      await updateProgress(75, 'Running collision detection...')
      const { processDocument } = await import('../engines/orchestrator.js')
      await processDocument(documentId)
      console.log('[ReprocessDocument] ✅ Collision detection complete')
      await updateProgress(77, 'Collision detection complete')
    } catch (error) {
      console.error('[ReprocessDocument] ⚠️  Collision detection failed:', error)
      console.log('[ReprocessDocument] Continuing with annotation recovery (connections can be rebuilt later)')
    }

    // 8. Recover annotations
    console.log('[ReprocessDocument] Starting annotation recovery...')
    await updateProgress(80, 'Recovering annotations...')
    const annotationResults = await recoverAnnotations(
      documentId,
      newMarkdown,
      newChunks as Chunk[],
      supabase
    )

    // Log recovery stats
    const totalAnnotations = annotationResults.success.length +
      annotationResults.needsReview.length +
      annotationResults.lost.length

    const recoveryRate = totalAnnotations > 0
      ? (annotationResults.success.length + annotationResults.needsReview.length) / totalAnnotations
      : 1.0

    console.log(`[ReprocessDocument] Recovery stats:`)
    console.log(`  - Success: ${annotationResults.success.length}`)
    console.log(`  - Needs review: ${annotationResults.needsReview.length}`)
    console.log(`  - Lost: ${annotationResults.lost.length}`)
    console.log(`  - Rate: ${(recoveryRate * 100).toFixed(1)}%`)
    await updateProgress(85, `Annotations recovered: ${annotationResults.success.length} success, ${annotationResults.needsReview.length} review`)

    // 9. Remap connections (queries old chunk data internally via join)
    // Wrapped in try-catch - don't let connection remapping block annotation recovery
    let connectionResults
    try {
      console.log('[ReprocessDocument] Starting connection remapping...')
      await updateProgress(88, 'Remapping connections...')
      connectionResults = await remapConnections(
        documentId,
        newChunks as Chunk[],
        supabase
      )
      console.log('[ReprocessDocument] ✅ Connection remapping complete')
      await updateProgress(92, 'Connections remapped')
    } catch (error) {
      console.error('[ReprocessDocument] ⚠️  Connection remapping failed:', error)
      console.log('[ReprocessDocument] Continuing without connection remapping (can be rebuilt later)')
      connectionResults = { success: [], needsReview: [], lost: [] }
    }

    // 10. ALWAYS commit changes (let user review via UI)
    // Even if recovery rate is low, committed annotations are still valuable
    console.log('[ReprocessDocument] ✅ Committing changes (user can review via UI)')
    await updateProgress(95, 'Committing changes...')

    // Set new chunks as current
    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('reprocessing_batch', reprocessingBatch)

    // Delete ALL old chunks (simple query - if not current, delete it)
    console.log('[ReprocessDocument] Deleting old chunks...')
    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('is_current', false)

    if (deleteError) {
      console.error('[ReprocessDocument] ⚠️  Failed to delete old chunks:', deleteError.message)
    }

    // 11. Update processing status
    await supabase
      .from('documents')
      .update({ processing_status: 'completed' })
      .eq('id', documentId)

    const executionTime = Date.now() - startTime
    console.log(`[ReprocessDocument] ✅ Complete in ${(executionTime / 1000).toFixed(1)}s`)
    await updateProgress(100, `Complete in ${(executionTime / 1000).toFixed(1)}s`)

    return {
      annotations: annotationResults,
      connections: connectionResults,
      executionTime,
      recoveryRate  // Return for UI display
    }
  } catch (error) {
    console.error('[ReprocessDocument] ❌ Error - rolling back:', error)

    // Rollback: Delete new chunks by batch ID
    await supabase
      .from('chunks')
      .delete()
      .eq('reprocessing_batch', reprocessingBatch)

    // Restore old chunks (any that are is_current: false for this document)
    await supabase
      .from('chunks')
      .update({ is_current: true })
      .eq('document_id', documentId)
      .eq('is_current', false)

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
