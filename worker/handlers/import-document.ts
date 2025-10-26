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
 * REFACTORED: Now uses HandlerJobManager
 */

import { readFromStorage } from '../lib/storage-helpers.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import type { ChunksExport, ConflictStrategy } from '../types/storage.js'
import { ImportJobOutputSchema } from '../types/job-schemas.js'
import { createHash } from 'crypto'
import { HandlerJobManager } from '../lib/handler-job-manager.js'

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
  const jobManager = new HandlerJobManager(supabase, job.id)

  console.log(`📥 Starting import for document: ${document_id}`)
  console.log(`   - Strategy: ${strategy}`)
  console.log(`   - Storage path: ${storage_path}`)
  console.log(`   - Regenerate embeddings: ${regenerateEmbeddings || false}`)
  console.log(`   - Reprocess connections: ${reprocessConnections || false}`)

  // Check if resuming from pause
  const resumeState = await checkResumeState(job)

  try {
    // ✅ STEP 1: READ CHUNKS FROM STORAGE (10%)
    await jobManager.updateProgress(10, 'reading', 'Reading chunks from Storage')

    const chunksPath = `${storage_path}/chunks.json`
    console.log(`📂 Reading chunks.json from: ${chunksPath}`)

    const chunksData = await readFromStorage<ChunksExport>(supabase, chunksPath)
    console.log(`✓ Loaded ${chunksData.chunks.length} chunks from Storage`)

    // ✅ STEP 2: VALIDATE SCHEMA VERSION (20%)
    await jobManager.updateProgress(20, 'validating', 'Validating schema version')

    if (chunksData.version !== '1.0') {
      throw new Error(`Unsupported chunks.json version: ${chunksData.version}. Expected: 1.0`)
    }
    console.log(`✓ Schema version validated: ${chunksData.version}`)

    // ✅ STEP 2.5: ENSURE DOCUMENT EXISTS (30%)
    // Check if document exists in database, create if missing (for deleted documents)
    await jobManager.updateProgress(30, 'checking_document', 'Verifying document exists')

    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', document_id)
      .single()

    if (!existingDoc) {
      console.log(`📄 Document not found in database, creating from metadata...`)

      // Read metadata.json for document details
      let metadata: any = {}
      try {
        const metadataPath = `${storage_path}/metadata.json`
        metadata = await readFromStorage<any>(supabase, metadataPath)
      } catch (error) {
        console.warn(`⚠️ Could not read metadata.json, using defaults:`, error)
      }

      // Create document record with metadata or defaults
      const { error: createError } = await supabase
        .from('documents')
        .insert({
          id: document_id,
          user_id: job.user_id,
          title: metadata.title || `Imported Document (${document_id.substring(0, 8)})`,
          storage_path: storage_path,
          source_type: metadata.source_type || 'unknown',
          source_url: metadata.source_url || null,
          processing_status: 'completed',
          chunker_type: metadata.chunker_type || 'recursive',
          document_type: metadata.document_type || null,
          author: metadata.author || null,
          publication_year: metadata.publication_year || null,
          publisher: metadata.publisher || null,
          cover_image_url: metadata.cover_image_url || null,
          detected_metadata: metadata.detected_metadata || null,
          created_at: metadata.created_at || new Date().toISOString()
        })

      if (createError) {
        throw new Error(`Failed to create document record: ${createError.message}`)
      }

      console.log(`✓ Created document record from Storage metadata`)
    } else {
      console.log(`✓ Document exists in database`)
    }

    // ✅ STEP 3: APPLY STRATEGY (40-60%)
    const importedCount = await applyStrategy(
      supabase,
      jobManager,
      document_id,
      strategy,
      chunksData.chunks
    )

    // ✅ STEP 4: REGENERATE EMBEDDINGS (Optional, 60-90%)
    if (regenerateEmbeddings) {
      await jobManager.updateProgress(60, 'embeddings', 'Regenerating embeddings')
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

      await jobManager.updateProgress(
        65,
        'embeddings',
        `Generating embeddings for ${chunkTexts.length} chunks...`
      )

      const embeddings = await generateEmbeddings(chunkTexts)
      console.log(`✓ Generated ${embeddings.length} embeddings`)

      await jobManager.updateProgress(
        75,
        'embeddings',
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
          await jobManager.updateProgress(
            percent,
            'embeddings',
            `Updated ${i + 1} of ${chunksWithoutEmbeddings.length} chunk embeddings`
          )
        }
      }

      console.log(`✓ Updated embeddings for ${chunksWithoutEmbeddings.length} chunks`)
      await jobManager.updateProgress(90, 'embeddings', 'Embeddings regenerated')
    }

    // ✅ STEP 5: MARK JOB COMPLETE (100%)
    const outputData = {
      success: true,
      documentId: document_id,  // ✅ camelCase
      documentTitle: existingDoc?.title,
      chunksImported: importedCount,  // ✅ Correct field name
      strategy,
      embeddingsRegenerated: regenerateEmbeddings || false,  // ✅ Correct field name
      connectionsReprocessed: reprocessConnections || false,  // ✅ Correct field name
    }

    // Validate before saving
    ImportJobOutputSchema.parse(outputData)

    await jobManager.markComplete(
      outputData,
      'Import completed successfully'
    )

    console.log(`✅ Import complete: ${importedCount} chunks imported with strategy '${strategy}'`)

  } catch (error: any) {
    console.error('❌ Import failed:', error)
    await jobManager.markFailed(error)

    throw error
  }
}

/**
 * Apply import strategy (skip, replace, merge_smart).
 *
 * @param supabase - Supabase client
 * @param jobManager - Job manager for progress tracking
 * @param documentId - Document ID to import
 * @param strategy - Import strategy
 * @param chunks - Chunks to import
 * @returns Number of chunks imported
 */
async function applyStrategy(
  supabase: any,
  jobManager: HandlerJobManager,
  documentId: string,
  strategy: ConflictStrategy,
  chunks: any[]
): Promise<number> {

  if (strategy === 'skip') {
    // ✅ SKIP: No-op, preserve existing data
    await jobManager.updateProgress(40, 'skip', 'Skipping import (preserving existing data)')
    console.log(`⏭️  Skip strategy - no changes made`)
    return 0
  }

  if (strategy === 'replace') {
    // ✅ REPLACE: DELETE all existing chunks, INSERT from Storage
    await jobManager.updateProgress(40, 'replace', 'Deleting existing chunks')
    console.log(`🗑️  Replace strategy - deleting existing chunks`)

    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId)

    if (deleteError) {
      throw new Error(`Failed to delete existing chunks: ${deleteError.message}`)
    }
    console.log(`✓ Deleted existing chunks`)

    await jobManager.updateProgress(50, 'inserting', 'Inserting chunks from Storage')
    console.log(`💾 Inserting ${chunks.length} chunks from Storage`)

    // Check if chunks have IDs (for UUID preservation)
    const hasChunkIds = chunks.some(c => c.id)
    console.log(`[ImportDocument] Chunk ID strategy:`, hasChunkIds ? `Preserving ${chunks.filter(c => c.id).length} Storage UUIDs` : `Generating new UUIDs (backward compatible)`)

    // Prepare chunks for insert (exclude database-specific fields)
    const chunksToInsert = chunks.map(chunk => ({
      // IMPORTANT: Preserve chunk ID from Storage if present (for annotation references)
      ...(chunk.id ? { id: chunk.id } : {}),  // Use Storage UUID or let DB generate
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
    await jobManager.updateProgress(60, 'replace_complete', 'Replace strategy completed')

    return chunksToInsert.length
  }

  if (strategy === 'merge_smart') {
    // ✅ MERGE SMART: UPDATE metadata only, preserve IDs and annotations
    await jobManager.updateProgress(40, 'merge_smart', 'Updating metadata (preserving IDs)')
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
        await jobManager.updateProgress(
          percent,
          'merge_smart',
          `Updated ${i + 1} of ${chunks.length} chunk metadata`
        )
      }
    }

    console.log(`✓ Updated metadata for ${updatedCount}/${chunks.length} chunks`)
    await jobManager.updateProgress(60, 'merge_complete', 'Merge Smart strategy completed')

    return updatedCount
  }

  throw new Error(`Unknown import strategy: ${strategy}`)
}
