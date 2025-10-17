/**
 * Import Document Background Job Handler
 *
 * Restores chunks from Storage to Database with intelligent conflict resolution.
 *
 * Three strategies:
 * - skip: No-op, preserve existing data
 * - replace: DELETE all existing chunks, INSERT from Storage (destructive)
 * - merge_smart: UPDATE metadata only, preserve IDs and annotations (safe)
 *
 * Optional: Regenerate embeddings after import
 *
 * See: docs/tasks/storage-first-portability.md (T-012)
 * Pattern reference: worker/handlers/process-document.ts
 */

import { readFromStorage } from '../lib/storage-helpers.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import type { ChunksExport, ConflictStrategy } from '../types/storage.js'
import { createHash } from 'crypto'

/**
 * Check if resuming from a paused import.
 * Import jobs are typically quick (<1 min) so pause/resume is less critical,
 * but we support it for consistency.
 */
async function checkResumeState(job: any): Promise<{ resuming: boolean; lastStage?: string }> {
  if (!job.resume_count || job.resume_count === 0) {
    return { resuming: false }
  }

  console.log(`[Resume] Import job resumed (attempt #${job.resume_count})`)

  // For import jobs, we track completed stages in metadata
  const lastStage = job.metadata?.last_completed_stage

  if (lastStage) {
    console.log(`[Resume] Last completed stage: ${lastStage}`)
    return { resuming: true, lastStage }
  }

  return { resuming: false }
}

/**
 * Import document chunks from Storage to Database.
 *
 * @param supabase - Supabase client with service role
 * @param job - Background job containing import request
 */
export async function importDocumentHandler(supabase: any, job: any): Promise<void> {
  const { document_id, storage_path, strategy, regenerateEmbeddings, reprocessConnections } = job.input_data

  console.log(`📥 Starting import for document: ${document_id}`)
  console.log(`   - Strategy: ${strategy}`)
  console.log(`   - Storage path: ${storage_path}`)
  console.log(`   - Regenerate embeddings: ${regenerateEmbeddings || false}`)
  console.log(`   - Reprocess connections: ${reprocessConnections || false}`)

  // Check if resuming from pause
  const resumeState = await checkResumeState(job)

  try {
    // ✅ STEP 1: READ CHUNKS FROM STORAGE (10%)
    await updateProgress(supabase, job.id, 10, 'reading', 'processing', 'Reading chunks from Storage')

    const chunksPath = `${storage_path}/chunks.json`
    console.log(`📂 Reading chunks.json from: ${chunksPath}`)

    const chunksData = await readFromStorage<ChunksExport>(supabase, chunksPath)
    console.log(`✓ Loaded ${chunksData.chunks.length} chunks from Storage`)

    // ✅ STEP 2: VALIDATE SCHEMA VERSION (20%)
    await updateProgress(supabase, job.id, 20, 'validating', 'processing', 'Validating schema version')

    if (chunksData.version !== '1.0') {
      throw new Error(`Unsupported chunks.json version: ${chunksData.version}. Expected: 1.0`)
    }
    console.log(`✓ Schema version validated: ${chunksData.version}`)

    // ✅ STEP 3: APPLY STRATEGY (40-60%)
    const importedCount = await applyStrategy(
      supabase,
      job.id,
      document_id,
      strategy,
      chunksData.chunks
    )

    // ✅ STEP 4: REGENERATE EMBEDDINGS (Optional, 60-90%)
    if (regenerateEmbeddings) {
      await updateProgress(supabase, job.id, 60, 'embeddings', 'processing', 'Regenerating embeddings')
      console.log(`🔢 Regenerating embeddings for ${importedCount} chunks`)

      // Query chunks without embeddings
      const { data: chunksWithoutEmbeddings, error: queryError } = await supabase
        .from('chunks')
        .select('id, content')
        .eq('document_id', document_id)
        .order('chunk_index')

      if (queryError) {
        throw new Error(`Failed to query chunks: ${queryError.message}`)
      }

      // Generate embeddings
      const chunkTexts = chunksWithoutEmbeddings.map((c: any) => c.content)

      await updateProgress(
        supabase,
        job.id,
        65,
        'embeddings',
        'processing',
        `Generating embeddings for ${chunkTexts.length} chunks...`
      )

      const embeddings = await generateEmbeddings(chunkTexts)
      console.log(`✓ Generated ${embeddings.length} embeddings`)

      await updateProgress(
        supabase,
        job.id,
        75,
        'embeddings',
        'processing',
        `Updating ${chunksWithoutEmbeddings.length} chunks with embeddings`
      )

      // Update chunks with embeddings (batch progress updates every 10 chunks)
      for (let i = 0; i < chunksWithoutEmbeddings.length; i++) {
        const { error: updateError } = await supabase
          .from('chunks')
          .update({ embedding: embeddings[i] })
          .eq('id', chunksWithoutEmbeddings[i].id)

        if (updateError) {
          console.warn(`⚠️ Failed to update embedding for chunk ${i}: ${updateError.message}`)
        }

        // Update progress every 10 chunks
        if ((i + 1) % 10 === 0 || i === chunksWithoutEmbeddings.length - 1) {
          const percent = 75 + Math.floor((i + 1) / chunksWithoutEmbeddings.length * 15) // 75-90%
          await updateProgress(
            supabase,
            job.id,
            percent,
            'embeddings',
            'processing',
            `Updated ${i + 1} of ${chunksWithoutEmbeddings.length} chunk embeddings`
          )
        }
      }

      console.log(`✓ Updated embeddings for ${chunksWithoutEmbeddings.length} chunks`)
      await updateProgress(supabase, job.id, 90, 'embeddings', 'processing', 'Embeddings regenerated')
    }

    // ✅ STEP 5: MARK JOB COMPLETE (100%)
    await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Import completed successfully')

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          success: true,
          document_id,
          strategy,
          imported: importedCount,
          regeneratedEmbeddings: regenerateEmbeddings || false,
          reprocessConnections: reprocessConnections || false
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    console.log(`✅ Import complete: ${importedCount} chunks imported with strategy '${strategy}'`)

  } catch (error: any) {
    console.error('❌ Import failed:', error)

    // Update job with error
    await updateProgress(
      supabase,
      job.id,
      0,
      'error',
      'failed',
      error.message || 'Import failed'
    )

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        output_data: {
          success: false,
          document_id,
          error: error.message
        },
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

/**
 * Apply import strategy (skip, replace, merge_smart).
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID for progress tracking
 * @param documentId - Document ID to import
 * @param strategy - Import strategy
 * @param chunks - Chunks to import
 * @returns Number of chunks imported
 */
async function applyStrategy(
  supabase: any,
  jobId: string,
  documentId: string,
  strategy: ConflictStrategy,
  chunks: any[]
): Promise<number> {

  if (strategy === 'skip') {
    // ✅ SKIP: No-op, preserve existing data
    await updateProgress(supabase, jobId, 40, 'skip', 'processing', 'Skipping import (preserving existing data)')
    console.log(`⏭️  Skip strategy - no changes made`)
    return 0
  }

  if (strategy === 'replace') {
    // ✅ REPLACE: DELETE all existing chunks, INSERT from Storage
    await updateProgress(supabase, jobId, 40, 'replace', 'processing', 'Deleting existing chunks')
    console.log(`🗑️  Replace strategy - deleting existing chunks`)

    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId)

    if (deleteError) {
      throw new Error(`Failed to delete existing chunks: ${deleteError.message}`)
    }
    console.log(`✓ Deleted existing chunks`)

    await updateProgress(supabase, jobId, 50, 'inserting', 'processing', 'Inserting chunks from Storage')
    console.log(`💾 Inserting ${chunks.length} chunks from Storage`)

    // Prepare chunks for insert (exclude database-specific fields)
    const chunksToInsert = chunks.map(chunk => ({
      document_id: documentId,
      content: chunk.content,
      chunk_index: chunk.chunk_index,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.word_count,
      // Chonkie chunking metadata
      chunker_type: chunk.chunker_type || 'hybrid', // Fallback for legacy exports (pre-Session 8)
      heading_path: chunk.heading_path,
      metadata_overlap_count: chunk.metadata_overlap_count,
      metadata_confidence: chunk.metadata_confidence,
      metadata_interpolated: chunk.metadata_interpolated,
      // Docling metadata
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      heading_level: chunk.heading_level,
      section_marker: chunk.section_marker,
      bboxes: chunk.bboxes,
      position_confidence: chunk.position_confidence,
      position_method: chunk.position_method,
      position_validated: chunk.position_validated,
      // AI metadata
      themes: chunk.themes,
      importance_score: chunk.importance_score,
      summary: chunk.summary,
      emotional_metadata: chunk.emotional_metadata,
      conceptual_metadata: chunk.conceptual_metadata,
      domain_metadata: chunk.domain_metadata,
      metadata_extracted_at: chunk.metadata_extracted_at
      // Note: embedding will be regenerated if regenerateEmbeddings=true
    }))

    // Batch insert (Supabase handles batching internally)
    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`)
    }

    console.log(`✓ Inserted ${chunksToInsert.length} chunks`)
    await updateProgress(supabase, jobId, 60, 'replace_complete', 'processing', 'Replace strategy completed')

    return chunksToInsert.length
  }

  if (strategy === 'merge_smart') {
    // ✅ MERGE SMART: UPDATE metadata only, preserve IDs and annotations
    await updateProgress(supabase, jobId, 40, 'merge_smart', 'processing', 'Updating metadata (preserving IDs)')
    console.log(`🔄 Merge Smart strategy - updating metadata, preserving IDs`)

    let updatedCount = 0

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const { error: updateError } = await supabase
        .from('chunks')
        .update({
          // Update AI metadata only (preserve content and IDs)
          themes: chunk.themes,
          importance_score: chunk.importance_score,
          summary: chunk.summary,
          emotional_metadata: chunk.emotional_metadata,
          conceptual_metadata: chunk.conceptual_metadata,
          domain_metadata: chunk.domain_metadata,
          metadata_extracted_at: chunk.metadata_extracted_at
        })
        .eq('document_id', documentId)
        .eq('chunk_index', chunk.chunk_index)

      if (updateError) {
        console.warn(`⚠️ Failed to update chunk ${chunk.chunk_index}: ${updateError.message}`)
      } else {
        updatedCount++
      }

      // Update progress every 10 chunks
      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        const percent = 40 + Math.floor((i + 1) / chunks.length * 20) // 40-60%
        await updateProgress(
          supabase,
          jobId,
          percent,
          'merge_smart',
          'processing',
          `Updated ${i + 1} of ${chunks.length} chunk metadata`
        )
      }
    }

    console.log(`✓ Updated metadata for ${updatedCount}/${chunks.length} chunks`)
    await updateProgress(supabase, jobId, 60, 'merge_complete', 'processing', 'Merge Smart strategy completed')

    return updatedCount
  }

  throw new Error(`Unknown import strategy: ${strategy}`)
}

/**
 * Update job progress in background_jobs table.
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
