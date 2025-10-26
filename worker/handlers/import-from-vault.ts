/**
 * Import from Vault Background Job Handler
 *
 * Imports document from Obsidian vault to database. Makes vault a valid restore source
 * for database resets - critical for hybrid deployment.
 *
 * Flow:
 * 1. Read vault document structure (.rhizome/ folder)
 * 2. Upload JSON files to Storage (if not already there)
 * 3. Import to database using existing import-document.ts logic
 * 4. Update sync state with hashes
 *
 * See: thoughts/plans/2025-10-19_obsidian-vault-mirroring.md (Phase 3)
 */

import { createClient } from '@supabase/supabase-js'
import { scanVaultDocuments, readVaultDocumentData } from '../lib/vault-reader.js'
import { importAnnotationsFromVault } from '../lib/vault-import-annotations.js'
// NOTE: Sparks now imported globally via separate mechanism (vault-import-sparks.ts)
import { importConnectionsFromVault } from '../lib/vault-import-connections.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { ImportFromVaultOutputSchema } from '../types/job-schemas.js'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as crypto from 'crypto'

/**
 * Helper to update job progress
 */
async function updateProgress(
  supabase: any,
  jobId: string,
  percent: number,
  stage: string,
  status: string,
  message: string
) {
  await supabase
    .from('background_jobs')
    .update({
      progress_percent: percent,
      progress_stage: stage,
      status: status,
      progress_message: message,
      last_heartbeat: new Date().toISOString()
    })
    .eq('id', jobId)
}

/**
 * Import document from vault to database
 */
export async function importFromVaultHandler(supabase: any, job: any): Promise<void> {
  const { documentTitle, strategy, uploadToStorage, userId, regenerateEmbeddings = true } = job.input_data

  console.log(`[ImportFromVault] Starting import for "${documentTitle}"`)

  try {
    // ✅ STEP 1: GET VAULT SETTINGS (10%)
    await updateProgress(supabase, job.id, 10, 'reading', 'processing', 'Reading vault settings')

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('obsidian_settings')
      .eq('user_id', userId)
      .single()

    if (settingsError || !settings?.obsidian_settings?.vaultPath) {
      throw new Error('Vault not configured')
    }

    const vaultConfig = settings.obsidian_settings
    console.log(`[ImportFromVault] Vault path: ${vaultConfig.vaultPath}`)

    // ✅ STEP 2: SCAN VAULT FOR DOCUMENTS (20%)
    await updateProgress(supabase, job.id, 20, 'scanning', 'processing', 'Scanning vault for documents')

    const vaultDocs = await scanVaultDocuments(
      vaultConfig.vaultPath,
      vaultConfig.rhizomePath || 'Rhizome/'
    )

    console.log(`[ImportFromVault] Found ${vaultDocs.length} documents in vault`)

    const doc = vaultDocs.find(d => d.title === documentTitle)
    if (!doc) {
      throw new Error(`Document "${documentTitle}" not found in vault`)
    }

    if (!doc.complete) {
      const missing = []
      if (!doc.hasChunksJson) missing.push('chunks.json')
      if (!doc.hasMetadataJson) missing.push('metadata.json')
      if (!doc.contentPath) missing.push('content.md')
      throw new Error(`Document incomplete: missing ${missing.join(', ')}`)
    }

    console.log(`[ImportFromVault] Document found and complete`)

    // ✅ STEP 3: READ DOCUMENT DATA (30%)
    await updateProgress(supabase, job.id, 30, 'reading', 'processing', 'Reading document data from vault')

    const docData = await readVaultDocumentData(doc)
    console.log(`[ImportFromVault] Read ${docData.chunks.chunks.length} chunks from vault`)
    console.log(`[ImportFromVault] Metadata:`, JSON.stringify({
      title: docData.metadata.title,
      source_type: docData.metadata.source_type,
      hasTitle: !!docData.metadata.title
    }))

    // ✅ STEP 4: CHECK IF DOCUMENT EXISTS IN DATABASE (40%)
    await updateProgress(supabase, job.id, 40, 'checking', 'processing', 'Checking if document exists in database')

    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id, title, storage_path')
      .eq('title', documentTitle)
      .eq('user_id', userId)
      .single()

    let documentId = existingDoc?.id
    let storagePath = existingDoc?.storage_path

    if (!documentId) {
      // Create new document entry
      console.log(`[ImportFromVault] Document not in database, creating new entry`)

      try {
        console.log('[ImportFromVault] ===== CHECKPOINT 1: Before insert preparation =====')

        // Use doc.title from vault scan (more reliable than metadata.json)
        const title = doc.title || docData.metadata.title || 'Untitled'
        const sourceType = docData.metadata.source_type || 'paste'

        console.log('[ImportFromVault] Document data preparation:')
        console.log('  - doc.title:', doc.title)
        console.log('  - metadata.title:', docData.metadata.title)
        console.log('  - final title:', title)
        console.log('  - metadata.source_type:', docData.metadata.source_type)
        console.log('  - final source_type:', sourceType)
        console.log('  - userId:', userId)

        console.log('[ImportFromVault] ===== CHECKPOINT 2: Supabase client check =====')
        console.log('  - Supabase client exists:', !!supabase)
        console.log('  - Supabase client type:', typeof supabase)
        console.log('  - Has from() method:', typeof supabase.from === 'function')

        // Generate UUID and storage_path upfront (storage_path is NOT NULL, required for insert)
        // IMPORTANT: Use document_id from metadata.json if present (vault portability)
        const vaultDocId = docData.metadata.document_id
        const newDocId = vaultDocId || crypto.randomUUID()  // Preserve vault UUID or generate new
        const newStoragePath = `${userId}/${newDocId}`

        console.log('[ImportFromVault] Document ID strategy:', vaultDocId ? `Preserving vault UUID: ${newDocId}` : `Generating new UUID: ${newDocId}`)

        const insertData = {
          id: newDocId,  // Use preserved or new ID
          user_id: userId,
          title: title,
          source_type: sourceType,
          storage_path: newStoragePath,  // Required NOT NULL field
          processing_status: 'completed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }

        console.log('[ImportFromVault] ===== CHECKPOINT 3: Insert data prepared =====')
        console.log('  - Insert data:', JSON.stringify(insertData, null, 2))

        console.log('[ImportFromVault] ===== CHECKPOINT 4: Starting Supabase insert =====')

        const { data: newDoc, error: insertError } = await supabase
          .from('documents')
          .insert(insertData)
          .select('id')
          .single()

        console.log('[ImportFromVault] ===== CHECKPOINT 5: Insert completed =====')
        console.log('  - Insert error:', insertError ? JSON.stringify(insertError, null, 2) : 'null')
        console.log('  - Insert data:', newDoc ? JSON.stringify(newDoc, null, 2) : 'null')

        if (insertError) {
          console.error('[ImportFromVault] Insert error details:', JSON.stringify(insertError))
          throw new Error(`Failed to create document: ${insertError.message} (code: ${insertError.code})`)
        }

        if (!newDoc) {
          throw new Error('Document insert returned no data')
        }

        documentId = newDoc.id
        storagePath = newStoragePath  // Use the same storage path we inserted
        console.log(`[ImportFromVault] ===== CHECKPOINT 6: Document created successfully =====`)
        console.log(`  - Document ID: ${documentId}`)
        console.log(`  - Storage path: ${storagePath}`)
      } catch (createError: any) {
        console.error('[ImportFromVault] ===== CHECKPOINT ERROR: Exception caught =====')
        console.error('[ImportFromVault] Error message:', createError.message)
        console.error('[ImportFromVault] Error type:', createError.constructor.name)
        console.error('[ImportFromVault] Error stack:', createError.stack)
        console.error('[ImportFromVault] Full error object:', JSON.stringify(createError, Object.getOwnPropertyNames(createError)))
        throw createError
      }

      console.log(`[ImportFromVault] Created document with ID: ${documentId}`)
    } else {
      console.log(`[ImportFromVault] Document exists in database with ID: ${documentId}`)
    }

    // ✅ STEP 5: UPLOAD JSON FILES TO STORAGE (50-60%)
    if (uploadToStorage !== false) {
      await updateProgress(supabase, job.id, 50, 'uploading', 'processing', 'Uploading JSON files to Storage')
      console.log(`[ImportFromVault] Uploading JSON files to Storage`)

      // Upload chunks.json
      const { error: chunksError } = await supabase.storage
        .from('documents')
        .upload(`${storagePath}/chunks.json`, JSON.stringify(docData.chunks, null, 2), {
          contentType: 'application/json',
          upsert: true
        })

      if (chunksError) {
        console.warn(`⚠️ Failed to upload chunks.json: ${chunksError.message}`)
      }

      // Upload metadata.json
      const { error: metadataError } = await supabase.storage
        .from('documents')
        .upload(`${storagePath}/metadata.json`, JSON.stringify(docData.metadata, null, 2), {
          contentType: 'application/json',
          upsert: true
        })

      if (metadataError) {
        console.warn(`⚠️ Failed to upload metadata.json: ${metadataError.message}`)
      }

      // Upload manifest.json (if exists)
      if (docData.manifest) {
        const { error: manifestError } = await supabase.storage
          .from('documents')
          .upload(`${storagePath}/manifest.json`, JSON.stringify(docData.manifest, null, 2), {
            contentType: 'application/json',
            upsert: true
          })

        if (manifestError) {
          console.warn(`⚠️ Failed to upload manifest.json: ${manifestError.message}`)
        }
      }

      // Upload content.md
      const { error: markdownError } = await supabase.storage
        .from('documents')
        .upload(`${storagePath}/content.md`, docData.markdown, {
          contentType: 'text/markdown',
          upsert: true
        })

      if (markdownError) {
        console.warn(`⚠️ Failed to upload content.md: ${markdownError.message}`)
      } else {
        // Update document with markdown_path for vault export compatibility
        const markdownPath = `${storagePath}/content.md`
        const { error: updateError } = await supabase
          .from('documents')
          .update({ markdown_path: markdownPath })
          .eq('id', documentId)

        if (updateError) {
          console.warn(`⚠️ Failed to update markdown_path: ${updateError.message}`)
        } else {
          console.log(`✅ Updated document.markdown_path: ${markdownPath}`)
        }
      }

      console.log('[ImportFromVault] JSON files uploaded to Storage')
      await updateProgress(supabase, job.id, 60, 'uploading', 'processing', 'Storage upload complete')
    }

    // ✅ STEP 6: IMPORT CHUNKS TO DATABASE (60-80%)
    await updateProgress(supabase, job.id, 65, 'importing', 'processing', 'Importing chunks to database')

    // Check if document has any existing chunks
    const { count: existingChunkCount } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId)

    // Strategy selection logic:
    // 1. New document (just created) → use 'replace' to INSERT chunks
    // 2. Document exists but has 0 chunks → use 'replace' to INSERT chunks
    // 3. Document exists with chunks → use user's preferred strategy (default: merge_smart)
    const wasJustCreated = !existingDoc
    const hasNoChunks = existingChunkCount === 0
    const needsInsert = wasJustCreated || hasNoChunks
    const importStrategy = needsInsert ? 'replace' : (strategy || 'merge_smart')

    console.log(`[ImportFromVault] Importing ${docData.chunks.chunks.length} chunks with strategy: ${importStrategy}${needsInsert ? ` (${wasJustCreated ? 'new document' : 'empty document'})` : ''}`)

    const chunksImported = await applyImportStrategy(
      supabase,
      documentId,
      userId,
      importStrategy,
      docData.chunks.chunks
    )

    console.log(`[ImportFromVault] Imported ${chunksImported} chunks`)

    // ✅ STEP 7: IMPORT ANNOTATIONS (80%)
    await updateProgress(supabase, job.id, 80, 'importing_annotations', 'processing', 'Importing annotations')

    const annotationsJsonPath = path.join(doc.folderPath, '.rhizome', 'annotations.json')
    let annotationsResult = { imported: 0, recovered: 0 }

    try {
      await fs.access(annotationsJsonPath)
      // Get current chunks for recovery
      const { data: currentChunks } = await supabase
        .from('chunks')
        .select('id, chunk_index, start_offset, end_offset, content')
        .eq('document_id', documentId)
        .eq('is_current', true)

      if (currentChunks && currentChunks.length > 0) {
        annotationsResult = await importAnnotationsFromVault(
          documentId,
          annotationsJsonPath,
          docData.markdown,
          currentChunks,
          supabase,
          userId
        )
        console.log(`[ImportFromVault] Annotations: ${annotationsResult.imported} imported, ${annotationsResult.recovered} recovered`)
      }
    } catch (error: any) {
      console.log(`[ImportFromVault] No annotations.json found or import failed: ${error.message}`)
    }

    // NOTE: Sparks are now imported globally from Rhizome/Sparks/, not per-document
    // Per-document spark import removed - sparks are user-level entities
    // See: worker/lib/vault-import-sparks.ts for global import
    let sparksResult = { imported: 0, recovered: 0 }

    // ✅ STEP 9: IMPORT CONNECTIONS (88%)
    await updateProgress(supabase, job.id, 88, 'importing_connections', 'processing', 'Importing connections')

    const connectionsJsonPath = path.join(doc.folderPath, '.rhizome', 'connections.json')
    let connectionsResult = { imported: 0, remapped: 0 }

    try {
      await fs.access(connectionsJsonPath)
      const { data: currentChunks } = await supabase
        .from('chunks')
        .select('id, chunk_index, start_offset, end_offset, content, embedding')
        .eq('document_id', documentId)
        .eq('is_current', true)

      if (currentChunks && currentChunks.length > 0) {
        connectionsResult = await importConnectionsFromVault(
          documentId,
          connectionsJsonPath,
          currentChunks,
          supabase
        )
        console.log(`[ImportFromVault] Connections: ${connectionsResult.imported} imported, ${connectionsResult.remapped} remapped`)
      }
    } catch (error: any) {
      console.log(`[ImportFromVault] No connections.json found or import failed: ${error.message}`)
    }

    // ✅ STEP 9.5: REGENERATE EMBEDDINGS (85-88%)
    let embeddingsRegenerated = false
    let connectionDetectionJobId: string | null = null

    if (chunksImported > 0 && regenerateEmbeddings) {
      await updateProgress(supabase, job.id, 85, 'embeddings', 'processing', 'Regenerating embeddings for imported chunks')
      console.log(`[ImportFromVault] Regenerating embeddings for ${chunksImported} chunks...`)

      try {
        // Get imported chunks
        const { data: importedChunks, error: chunksError } = await supabase
          .from('chunks')
          .select('id, content, chunk_index')
          .eq('document_id', documentId)
          .eq('is_current', true)
          .order('chunk_index')

        if (chunksError) {
          console.warn(`⚠️ Failed to fetch chunks for embeddings: ${chunksError.message}`)
        } else if (importedChunks && importedChunks.length > 0) {
          // Generate embeddings
          const texts = importedChunks.map((c: any) => c.content)
          const embeddings = await generateEmbeddings(texts)
          console.log(`[ImportFromVault] Generated ${embeddings.length} embeddings`)

          // Update chunks with embeddings
          for (let i = 0; i < importedChunks.length; i++) {
            const { error: updateError } = await supabase
              .from('chunks')
              .update({ embedding: embeddings[i] })
              .eq('id', importedChunks[i].id)

            if (updateError) {
              console.warn(`⚠️ Failed to update chunk ${i} embedding: ${updateError.message}`)
            }
          }

          embeddingsRegenerated = true
          console.log(`✅ [ImportFromVault] Embeddings regenerated for all ${importedChunks.length} chunks`)

          // Only trigger connection detection if connections weren't imported from vault
          // (i.e., connections.json was missing or import failed)
          const connectionsWereImported = connectionsResult.imported > 0 || connectionsResult.remapped > 0

          if (!connectionsWereImported) {
            // Trigger connection detection job - no connections in vault, need to detect
            await updateProgress(supabase, job.id, 88, 'connections', 'processing', 'Triggering connection detection (no connections.json found)')

            const { data: connectionJob, error: jobError } = await supabase
              .from('background_jobs')
              .insert({
                job_type: 'detect_connections',
                user_id: userId,
                input_data: {
                  document_id: documentId,
                  source: 'vault-import-auto'
                },
                status: 'pending'
              })
              .select('id')
              .single()

            if (jobError) {
              console.warn(`⚠️ Failed to create connection detection job: ${jobError.message}`)
            } else {
              connectionDetectionJobId = connectionJob.id
              console.log(`✅ [ImportFromVault] Connection detection job created: ${connectionJob.id}`)
            }
          } else {
            console.log(`⏭️  [ImportFromVault] Skipping connection detection - ${connectionsWereImported ? connectionsResult.imported + connectionsResult.remapped : 0} connections already imported from vault`)
          }
        }
      } catch (error: any) {
        console.warn(`⚠️ Embeddings regeneration failed: ${error.message}`)
      }
    }

    // ✅ STEP 9.6: UPDATE DOCUMENT FLAGS (89%)
    // Set markdown_available and embeddings_available flags for UI
    if (chunksImported > 0) {
      await supabase
        .from('documents')
        .update({
          markdown_available: true,
          embeddings_available: embeddingsRegenerated
        })
        .eq('id', documentId)

      console.log(`[ImportFromVault] Document flags updated (embeddings_available: ${embeddingsRegenerated})`)
    }

    // ✅ STEP 10: UPDATE SYNC STATE (90%)
    await updateProgress(supabase, job.id, 90, 'sync_state', 'processing', 'Updating sync state')

    const vaultRelativePath = path.relative(vaultConfig.vaultPath, doc.contentPath)

    await supabase
      .from('obsidian_sync_state')
      .upsert({
        document_id: documentId,
        user_id: userId,
        vault_path: vaultRelativePath,
        vault_hash: docData.vaultHash,
        storage_hash: docData.vaultHash, // Same after import
        vault_modified_at: new Date().toISOString(),
        storage_modified_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        last_sync_direction: 'vault_to_storage',
        conflict_state: 'none',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'document_id'
      })

    console.log(`[ImportFromVault] Sync state updated`)

    // ✅ STEP 11: MARK JOB COMPLETE (100%)
    await updateProgress(supabase, job.id, 100, 'complete', 'completed', 'Import from vault completed')

    // Prepare and validate output data
    const outputData = {
      success: true,
      documentId,
      documentTitle,
      chunksImported,
      annotationsImported: annotationsResult.imported,
      annotationsRecovered: annotationsResult.recovered,
      sparksImported: sparksResult.imported,
      sparksRecovered: sparksResult.recovered,
      connectionsImported: connectionsResult.imported,
      connectionsRemapped: connectionsResult.remapped,
      uploadedToStorage: uploadToStorage !== false,
      strategy: importStrategy,
      embeddingsRegenerated,
      connectionDetectionJobId
    }

    // Validate before saving
    ImportFromVaultOutputSchema.parse(outputData)

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: outputData,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    console.log(`✅ [ImportFromVault] Complete:`)
    console.log(`  - Chunks: ${chunksImported} imported`)
    console.log(`  - Annotations: ${annotationsResult.imported} imported, ${annotationsResult.recovered} recovered`)
    console.log(`  - Sparks: ${sparksResult.imported} imported, ${sparksResult.recovered} recovered`)
    console.log(`  - Connections: ${connectionsResult.imported} imported, ${connectionsResult.remapped} remapped`)
    console.log(`  - Embeddings: ${embeddingsRegenerated ? '✅ regenerated' : '⏭️  skipped'}`)
    if (connectionDetectionJobId) {
      console.log(`  - Connection detection: job ${connectionDetectionJobId} queued`)
    }

  } catch (error: any) {
    console.error('❌ [ImportFromVault] Import failed:', error)

    // Update job with error
    await updateProgress(
      supabase,
      job.id,
      0,
      'error',
      'failed',
      error.message || 'Import from vault failed'
    )

    // Prepare and validate error output
    const errorOutputData = {
      success: false,
      documentTitle,
      chunksImported: 0,
      error: error.message
    }

    // Validate before saving
    ImportFromVaultOutputSchema.parse(errorOutputData)

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        output_data: errorOutputData,
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

/**
 * Apply import strategy (reuse logic from import-document.ts)
 */
async function applyImportStrategy(
  supabase: any,
  documentId: string,
  userId: string,
  strategy: 'skip' | 'replace' | 'merge_smart',
  chunks: any[]
): Promise<number> {

  if (strategy === 'skip') {
    console.log(`⏭️  Skip strategy - no changes made`)
    return 0
  }

  if (strategy === 'replace') {
    // DELETE all existing chunks, INSERT from vault
    console.log(`🗑️  Replace strategy - deleting existing chunks`)

    const { error: deleteError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId)

    if (deleteError) {
      throw new Error(`Failed to delete existing chunks: ${deleteError.message}`)
    }

    console.log(`💾 Inserting ${chunks.length} chunks from vault`)

    // Check if chunks have IDs (for UUID preservation)
    const hasChunkIds = chunks.some(c => c.id)
    console.log(`[ImportFromVault] Chunk ID strategy:`, hasChunkIds ? `Preserving ${chunks.filter(c => c.id).length} vault UUIDs` : `Generating new UUIDs (backward compatible)`)

    // Prepare chunks for insert
    const chunksToInsert = chunks.map(chunk => ({
      // IMPORTANT: Preserve chunk ID from vault if present (for annotation references)
      ...(chunk.id ? { id: chunk.id } : {}),  // Use vault UUID or let DB generate
      document_id: documentId,
      // Note: chunks table has no user_id column (linked via document)
      content: chunk.content,
      chunk_index: chunk.chunk_index,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.word_count,
      // Chonkie chunking metadata
      chunker_type: chunk.chunker_type || 'recursive',
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
      // created_at will default to now() from database
    }))

    const { error: insertError } = await supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`)
    }

    console.log(`✓ Inserted ${chunksToInsert.length} chunks`)
    return chunksToInsert.length
  }

  if (strategy === 'merge_smart') {
    // UPDATE metadata only, preserve IDs and annotations
    console.log(`🔄 Merge Smart strategy - updating metadata, preserving IDs`)

    // Query existing chunks
    const { data: existingChunks, error: queryError } = await supabase
      .from('chunks')
      .select('id, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index')

    if (queryError) {
      throw new Error(`Failed to query existing chunks: ${queryError.message}`)
    }

    let updatedCount = 0

    for (const chunk of chunks) {
      const existing = existingChunks.find((c: any) => c.chunk_index === chunk.chunk_index)

      if (existing) {
        // Update metadata only
        const { error: updateError } = await supabase
          .from('chunks')
          .update({
            themes: chunk.themes,
            importance_score: chunk.importance_score,
            summary: chunk.summary,
            emotional_metadata: chunk.emotional_metadata,
            conceptual_metadata: chunk.conceptual_metadata,
            domain_metadata: chunk.domain_metadata,
            metadata_extracted_at: chunk.metadata_extracted_at,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (updateError) {
          console.warn(`⚠️ Failed to update chunk ${chunk.chunk_index}: ${updateError.message}`)
        } else {
          updatedCount++
        }
      }
    }

    console.log(`✓ Updated ${updatedCount} chunks with merge_smart strategy`)
    return updatedCount
  }

  throw new Error(`Unknown strategy: ${strategy}`)
}
