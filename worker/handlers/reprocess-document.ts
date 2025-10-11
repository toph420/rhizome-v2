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
    await updateProgress(20, 'Starting AI chunking (this may take several minutes)...')

    const { batchChunkAndExtractMetadata } = await import('../lib/ai-chunking-batch.js')
    const { generateEmbeddings } = await import('../lib/embeddings.js')

    // Process markdown with AI to create semantic chunks
    const aiChunks = await batchChunkAndExtractMetadata(
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
    const embeddings = await generateEmbeddings(aiChunks.map(c => c.content))
    await updateProgress(70, 'Embeddings generated')

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
