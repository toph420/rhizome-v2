'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Delete a document and all associated data.
 * This comprehensively removes:
 * - Document record
 * - All chunks
 * - All ECS entities (annotations, flashcards, etc.)
 * - All chunk connections
 * - All background jobs
 * - All storage files (source, markdown, cover)
 */
export async function deleteDocument(documentId: string) {
  const supabase = await createClient()

  try {
    console.log(`[deleteDocument] Starting deletion for document ${documentId}`)

    // Get document info for storage path
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('user_id, storage_path')
      .eq('id', documentId)
      .single()

    if (docError) throw docError
    if (!doc) throw new Error('Document not found')

    // 1. Get all chunk IDs for this document (needed for ECS cleanup)
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)

    if (chunksError) throw chunksError

    const chunkIds = chunks?.map(c => c.id) || []
    console.log(`[deleteDocument] Found ${chunkIds.length} chunks to delete`)

    // 2. Delete ECS entities related to chunks (annotations, flashcards, etc.)
    if (chunkIds.length > 0) {
      // Get entity IDs from components that reference these chunks
      // Query components where data JSONB contains chunk_id matching our list
      const { data: components, error: componentsError } = await supabase
        .from('components')
        .select('entity_id, data')
        .eq('component_type', 'source')

      if (componentsError) throw componentsError

      // Filter in JavaScript since PostgREST JSONB filtering is complex
      const relevantComponents = components?.filter(c => {
        const chunkId = c.data?.chunk_id
        return chunkId && chunkIds.includes(chunkId)
      }) || []

      const entityIds = [...new Set(relevantComponents.map(c => c.entity_id))]

      if (entityIds.length > 0) {
        console.log(`[deleteDocument] Deleting ${entityIds.length} ECS entities`)

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

      // 3. Delete connections (delete in two passes to avoid complex OR query)
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

      // 4. Delete chunks
      const { error: deleteChunksError } = await supabase
        .from('chunks')
        .delete()
        .eq('document_id', documentId)

      if (deleteChunksError) throw deleteChunksError
    }

    // 5. Delete background jobs
    const { error: jobsError } = await supabase
      .from('background_jobs')
      .delete()
      .eq('document_id', documentId)

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

      // List all files in the document's storage folder
      const { data: files, error: listError } = await supabase.storage
        .from('documents')
        .list(doc.storage_path)

      if (listError) {
        console.warn('[deleteDocument] Error listing storage files:', listError)
      } else if (files && files.length > 0) {
        // Delete all files
        const filePaths = files.map(f => `${doc.storage_path}/${f.name}`)
        const { error: deleteFilesError } = await supabase.storage
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
  } catch (error: any) {
    console.error('[deleteDocument] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Retry processing for a failed document.
 */
export async function retryDocument(documentId: string) {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Not authenticated')

    // Create a new job for this document
    const { error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'process_document',
        payload: { document_id: documentId },
        user_id: user.id,
        status: 'pending'
      })

    if (jobError) throw jobError

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error retrying document:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Get latest Gemini response from worker logs (for debugging).
 */
export async function getLatestGeminiResponse() {
  const supabase = await createClient()

  try {
    // Get the most recent failed job with error details
    const { data: jobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error

    return { success: true, jobs }
  } catch (error: any) {
    console.error('Error fetching jobs:', error)
    return { success: false, error: error.message, jobs: [] }
  }
}

/**
 * Force fail a stuck job to trigger retry.
 * Useful for development when jobs are stuck in processing state.
 */
export async function forceFailJob(jobId: string) {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        last_error: 'Manually reset - stuck job',
        retry_count: 0,
        next_retry_at: new Date().toISOString()
      })
      .eq('id', jobId)

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error force-failing job:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Clear all failed jobs.
 * Useful for development to clean up test failures.
 */
export async function clearFailedJobs() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      // In dev mode, use dev user ID
      const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
      if (!devUserId) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('background_jobs')
        .delete()
        .eq('user_id', devUserId)
        .eq('status', 'failed')

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('background_jobs')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'failed')

      if (error) throw error
    }

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error clearing failed jobs:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Clear all completed jobs.
 * Useful for keeping the job list clean during development.
 */
export async function clearCompletedJobs() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      // In dev mode, use dev user ID
      const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
      if (!devUserId) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('background_jobs')
        .delete()
        .eq('user_id', devUserId)
        .eq('status', 'completed')

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('background_jobs')
        .delete()
        .eq('user_id', user.id)
        .eq('status', 'completed')

      if (error) throw error
    }

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error clearing completed jobs:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Delete a specific job by ID.
 * Useful for clearing individual jobs during testing.
 */
export async function deleteJob(jobId: string) {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('id', jobId)

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting job:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Force fail all stuck processing jobs.
 * Useful when multiple jobs are hung and need to be reset.
 */
export async function forceFailAllProcessing() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      // In dev mode, use dev user ID
      const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
      if (!devUserId) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('background_jobs')
        .update({
          status: 'failed',
          last_error: 'Manually reset - stuck in processing',
          retry_count: 0,
          next_retry_at: new Date().toISOString()
        })
        .eq('user_id', devUserId)
        .eq('status', 'processing')

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('background_jobs')
        .update({
          status: 'failed',
          last_error: 'Manually reset - stuck in processing',
          retry_count: 0,
          next_retry_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('status', 'processing')

      if (error) throw error
    }

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error force-failing processing jobs:', error)
    return { success: false, error: error.message }
  }
}
