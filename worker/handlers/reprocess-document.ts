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
import { loadCachedChunksRaw } from '../lib/cached-chunks.js'
import type { ReprocessResults, Chunk } from '../types/recovery.js'
// Chonkie Integration: Match initial processing pipeline
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'

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

    // ============================================================
    // UNIFIED CHONKIE REPROCESSING (No CLOUD Mode Fallback)
    // ============================================================
    console.log('[ReprocessDocument] Starting Chonkie reprocessing pipeline...')

    // Declare variables for chunks and embeddings
    let aiChunks: any[]
    let embeddings: number[][]

    // Step 1: Query original chunker_type from existing chunks (20-22%)
    console.log('[ReprocessDocument] Querying original chunker strategy...')
    await updateProgress(20, 'Checking original chunker strategy...')

    const { data: existingChunk } = await supabase
      .from('chunks')
      .select('chunker_type')
      .eq('document_id', documentId)
      .eq('is_current', false)  // Query the old chunks we just marked
      .limit(1)
      .single()

    const chunkerStrategy = (existingChunk?.chunker_type || 'recursive') as ChonkieStrategy
    console.log(`[ReprocessDocument] Original chunker strategy: ${chunkerStrategy}`)
    await updateProgress(22, `Using ${chunkerStrategy} chunking strategy`)

    // Step 2: Check for cached Docling chunks (optional - for metadata transfer)
    // Markdown sources won't have these, and that's fine!
    console.log('[ReprocessDocument] Checking for cached Docling chunks (optional)...')
    const cacheResult = await loadCachedChunksRaw(supabase, documentId)
    const hasCachedChunks = !!cacheResult

    if (hasCachedChunks) {
      console.log(`[ReprocessDocument] ✓ Found ${cacheResult.chunks.length} cached Docling chunks for metadata transfer`)
    } else {
      console.log('[ReprocessDocument] No cached chunks found (markdown source) - will use Chonkie without metadata transfer')
    }
    await updateProgress(25, hasCachedChunks ? 'Cached chunks loaded' : 'No cached chunks (markdown source)')

    // Step 3: Import dependencies
    const { extractMetadataBatch } = await import('../lib/chunking/pydantic-metadata.js')
    const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
    const { generateEmbeddings: generateGeminiEmbeddings } = await import('../lib/embeddings.js')

    // Step 4: Run Chonkie chunking (25-35%)
    console.log(`[ReprocessDocument] Running Chonkie chunking with ${chunkerStrategy} strategy...`)
    await updateProgress(27, `Chunking with ${chunkerStrategy} strategy...`)

    const chonkieChunks = await chunkWithChonkie(newMarkdown, {
      chunker_type: chunkerStrategy,
      timeout: 300000
    })

    console.log(`[ReprocessDocument] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
    await updateProgress(32, `${chonkieChunks.length} chunks created`)

    // Step 5: Transfer Docling metadata IF cached chunks exist (32-40%)
    let enrichedChunksWithMetadata

    if (hasCachedChunks) {
      console.log('[ReprocessDocument] Transferring Docling metadata to Chonkie chunks...')
      await updateProgress(35, 'Transferring metadata via overlap detection...')

      const cachedDoclingChunks = cacheResult!.chunks

      // Convert cached Docling chunks to bulletproof match format
      const bulletproofMatches = cachedDoclingChunks.map(chunk => ({
        chunk: {
          content: chunk.content,
          meta: {
            page_start: chunk.meta.page_start,
            page_end: chunk.meta.page_end,
            heading_level: chunk.meta.heading_level,
            section_marker: chunk.meta.section_marker,
            bboxes: chunk.meta.bboxes
          }
        },
        start_offset: chunk.start_char,
        end_offset: chunk.end_char,
        confidence: 'exact' as const,
        method: 'cached' as const
      }))

      enrichedChunksWithMetadata = await transferMetadataToChonkieChunks(
        chonkieChunks,
        bulletproofMatches,
        documentId
      )

      console.log(`[ReprocessDocument] Metadata transfer complete: ${enrichedChunksWithMetadata.length} enriched chunks`)
      await updateProgress(40, 'Metadata transfer complete')
    } else {
      // No cached chunks (markdown source) - use Chonkie chunks directly
      console.log('[ReprocessDocument] No metadata transfer needed (markdown source)')
      enrichedChunksWithMetadata = chonkieChunks
      await updateProgress(40, 'Using Chonkie chunks (no metadata transfer)')
    }

    // Step 6: Metadata enrichment (40-55%)
    console.log('[ReprocessDocument] Starting local metadata enrichment (PydanticAI + Ollama)')
    await updateProgress(42, 'Extracting structured metadata...')

    // enrichedChunksWithMetadata already has Chonkie metadata fields from transferMetadataToChonkieChunks
    // Now we just need to prepare for AI enrichment by adding default metadata
    let enrichedChunks = enrichedChunksWithMetadata.map((chunk, idx) => {
      const wordCount = chunk.content.split(/\s+/).filter((w: string) => w.length > 0).length
      return {
        document_id: documentId,
        content: chunk.content,
        chunk_index: idx,
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        word_count: wordCount,
        // Chonkie metadata fields (from transferMetadataToChonkieChunks)
        chunker_type: chunk.chunker_type || chunkerStrategy,
        heading_path: chunk.heading_path || null,
        metadata_overlap_count: chunk.metadata_overlap_count || 0,
        metadata_confidence: chunk.metadata_confidence || 'low',
        metadata_interpolated: chunk.metadata_interpolated || false,
        // Docling structural metadata (transferred via overlap)
        page_start: chunk.page_start || null,
        page_end: chunk.page_end || null,
        heading_level: chunk.heading_level || null,
        section_marker: chunk.section_marker || null,
        bboxes: chunk.bboxes || null,
        position_confidence: chunk.position_confidence || null,
        position_method: chunk.position_method || null,
        position_validated: false,
        // Default AI metadata (will be enriched)
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

    // Step 7: Local embeddings (55-65%)
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

    // Step 8: Map to aiChunks format (compatible with existing code below)
    aiChunks = enrichedChunks.map((chunk) => ({
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
      // Chonkie metadata fields (NEW - preserve chunking strategy)
      chunker_type: chunk.chunker_type,
      heading_path: chunk.heading_path,
      metadata_overlap_count: chunk.metadata_overlap_count,
      metadata_confidence: chunk.metadata_confidence,
      metadata_interpolated: chunk.metadata_interpolated,
      // Docling structural metadata (transferred via overlap)
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      heading_level: chunk.heading_level,
      section_marker: chunk.section_marker,
      bboxes: chunk.bboxes,
      position_confidence: chunk.position_confidence,
      position_method: chunk.position_method
    }))

    console.log(`[ReprocessDocument] Unified Chonkie pipeline complete: ${aiChunks.length} chunks ready`)
    console.log(`[ReprocessDocument] Cost: $0.00 (zero Gemini chunking calls)`)
    await updateProgress(70, `Chonkie pipeline complete: ${aiChunks.length} chunks`)

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

      // Chonkie metadata fields (NEW - preserve chunking strategy)
      chunker_type: chunk.chunker_type || 'hybrid',
      heading_path: chunk.heading_path || null,
      metadata_overlap_count: chunk.metadata_overlap_count || 0,
      metadata_confidence: chunk.metadata_confidence || 'low',
      metadata_interpolated: chunk.metadata_interpolated || false,

      // Docling structural metadata (transferred via overlap in LOCAL mode)
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
