'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

/**
 * Creates a Supabase client with service role access for admin operations
 */
async function createAdminClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

/**
 * Delete a document and all associated data.
 * This comprehensively removes:
 * - Document record (if exists in DB)
 * - All chunks (if exists in DB)
 * - All ECS entities (annotations, flashcards, etc.) (if exists in DB)
 * - All chunk connections (if exists in DB)
 * - All background jobs (if exists in DB)
 * - All storage files (source, markdown, cover)
 *
 * Special handling for storage-only documents (missing from DB):
 * - Deletes all files from Storage using constructed path
 * - Safe to use on documents that failed to process or were partially imported
 */
export async function deleteDocument(documentId: string) {
  const supabase = await createClient()
  const adminClient = await createAdminClient()

  try {
    console.log(`[deleteDocument] Starting deletion for document ${documentId}`)

    // Get current user (with dev fallback)
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID
    if (!userId) throw new Error('Not authenticated')

    // Get document info for storage path
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('user_id, storage_path')
      .eq('id', documentId)
      .single()

    // Handle storage-only documents (missing from DB)
    if (docError || !doc) {
      console.log(`[deleteDocument] Document not in DB, treating as storage-only deletion`)
      console.log(`[deleteDocument] userId: ${userId}, documentId: ${documentId}`)

      // Construct storage path from user ID and document ID
      const storagePath = `${userId}/${documentId}`
      console.log(`[deleteDocument] Storage path: ${storagePath}`)

      // Delete all storage files using admin client
      const { data: files, error: listError } = await adminClient.storage
        .from('documents')
        .list(storagePath)

      console.log(`[deleteDocument] List result:`, { files: files?.length, error: listError })

      if (listError) {
        console.error('[deleteDocument] Error listing storage files:', listError)
        return { success: false, error: `Failed to list files: ${listError.message}` }
      } else if (files && files.length > 0) {
        const filePaths = files.map(f => `${storagePath}/${f.name}`)
        console.log(`[deleteDocument] Deleting files:`, filePaths)

        const { error: deleteFilesError } = await adminClient.storage
          .from('documents')
          .remove(filePaths)

        if (deleteFilesError) {
          console.error('[deleteDocument] Error deleting storage files:', deleteFilesError)
          return { success: false, error: `Failed to delete files: ${deleteFilesError.message}` }
        } else {
          console.log(`[deleteDocument] Successfully deleted ${files.length} storage files`)
        }
      } else {
        console.log('[deleteDocument] No files found in storage path')
      }

      console.log(`[deleteDocument] Storage-only deletion complete for ${documentId}`)
      revalidatePath('/')
      return { success: true }
    }

    // 1. Get all chunk IDs for this document (needed for ECS cleanup)
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)

    if (chunksError) throw chunksError

    const chunkIds = chunks?.map(c => c.id) || []
    console.log(`[deleteDocument] Found ${chunkIds.length} chunks to delete`)

    // 2. Delete ECS entities related to document (annotations, sparks, etc.)
    // Use documentId filter - works even if chunks are already deleted!
    const { data: chunkRefComponents, error: chunkRefError } = await supabase
      .from('components')
      .select('entity_id')
      .eq('component_type', 'ChunkRef')
      .eq('data->>documentId', documentId)

    if (chunkRefError) throw chunkRefError

    const entityIds = [...new Set(chunkRefComponents?.map(c => c.entity_id) || [])]

    if (entityIds.length > 0) {
      console.log(`[deleteDocument] Deleting ${entityIds.length} ECS entities (annotations, sparks, etc.)`)

      // Delete all components for these entities
      const { error: deleteComponentsError } = await supabase
        .from('components')
        .delete()
        .in('entity_id', entityIds)

      if (deleteComponentsError) throw deleteComponentsError

      // Delete entities
      const { error: deleteEntitiesError } = await supabase
        .from('entities')
        .delete()
        .in('id', entityIds)

      if (deleteEntitiesError) throw deleteEntitiesError
    }

    // 3. Delete connections (only if chunks exist)
    if (chunkIds.length > 0) {
      // First delete where these chunks are the source
      const { error: connectionsError1 } = await supabase
        .from('connections')
        .delete()
        .in('source_chunk_id', chunkIds)

      if (connectionsError1) console.warn('[deleteDocument] Error deleting source connections:', connectionsError1)

      // Then delete where these chunks are the target
      const { error: connectionsError2 } = await supabase
        .from('connections')
        .delete()
        .in('target_chunk_id', chunkIds)

      if (connectionsError2) console.warn('[deleteDocument] Error deleting target connections:', connectionsError2)
    }

    // 4. Delete chunks
    const { error: deleteChunksError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId)

    if (deleteChunksError) throw deleteChunksError

    // 5. Delete background jobs (use entity_id, not document_id)
    const { error: jobsError } = await supabase
      .from('background_jobs')
      .delete()
      .eq('entity_id', documentId)

    if (jobsError) console.warn('[deleteDocument] Error deleting jobs:', jobsError)

    // 6. Delete import_pending records
    const { error: importError } = await supabase
      .from('import_pending')
      .delete()
      .eq('document_id', documentId)

    if (importError) console.warn('[deleteDocument] Error deleting import records:', importError)

    // 7. Delete storage files if storage_path exists
    if (doc.storage_path) {
      console.log(`[deleteDocument] Deleting storage files at ${doc.storage_path}`)

      // List all files in the document's storage folder using admin client
      const { data: files, error: listError } = await adminClient.storage
        .from('documents')
        .list(doc.storage_path)

      if (listError) {
        console.warn('[deleteDocument] Error listing storage files:', listError)
      } else if (files && files.length > 0) {
        // Delete all files using admin client
        const filePaths = files.map(f => `${doc.storage_path}/${f.name}`)
        const { error: deleteFilesError } = await adminClient.storage
          .from('documents')
          .remove(filePaths)

        if (deleteFilesError) {
          console.warn('[deleteDocument] Error deleting storage files:', deleteFilesError)
        }
      }
    }

    // 8. Finally, delete the document record
    const { error: deleteDocError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (deleteDocError) throw deleteDocError

    console.log(`[deleteDocument] Successfully deleted document ${documentId}`)
    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('[deleteDocument] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
