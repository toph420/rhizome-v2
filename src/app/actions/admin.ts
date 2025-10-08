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
  } catch (error) {
    console.error('[deleteDocument] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
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
  } catch (error) {
    console.error('Error retrying document:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
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
  } catch (error) {
    console.error('Error fetching jobs:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message, jobs: [] }
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
  } catch (error) {
    console.error('Error force-failing job:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Cancel and delete a job immediately.
 * Marks job as cancelled (worker will check and exit) then deletes it.
 * Useful for development when testing and need to stop+remove jobs quickly.
 */
export async function cancelAndDeleteJob(jobId: string) {
  const supabase = await createClient()

  try {
    // First mark as cancelled so worker knows to stop
    await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        last_error: 'Cancelled by user'
      })
      .eq('id', jobId)

    // Give worker a moment to see the cancellation
    await new Promise(resolve => setTimeout(resolve, 100))

    // Then delete the job
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('id', jobId)

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    console.error('Error cancelling and deleting job:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
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
  } catch (error) {
    console.error('Error clearing failed jobs:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
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
 * Force fail and DELETE all stuck processing jobs.
 * Useful when multiple jobs are hung and need to be completely removed.
 *
 * Step 1: Marks as cancelled (worker will stop)
 * Step 2: Deletes jobs from database
 */
export async function forceFailAllProcessing() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID
    if (!userId) throw new Error('Not authenticated')

    // Step 1: Mark as cancelled so worker stops
    await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        last_error: 'Force cancelled - stuck in processing'
      })
      .eq('user_id', userId)
      .eq('status', 'processing')

    // Give worker time to see cancellation
    await new Promise(resolve => setTimeout(resolve, 200))

    // Step 2: Delete the cancelled jobs
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('user_id', userId)
      .eq('status', 'cancelled')

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error force-failing processing jobs:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Clear ALL jobs regardless of status.
 * Nuclear option for development - removes everything.
 *
 * Step 0: Fix orphaned documents (no jobs)
 * Step 1: Marks all processing jobs as cancelled (worker will check and stop)
 * Step 2: Deletes all jobs from database
 *
 * @returns Promise with success status.
 */
export async function clearAllJobs() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID
    if (!userId) throw new Error('Not authenticated')

    // Step 0: Fix orphaned documents first
    await fixOrphanedDocuments()

    // Step 1: Cancel all processing jobs first (worker will see this and stop)
    await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        last_error: 'Cleared by user - all jobs cancelled'
      })
      .eq('user_id', userId)
      .eq('status', 'processing')

    // Give worker a moment to see the cancellation
    await new Promise(resolve => setTimeout(resolve, 200))

    // Step 2: Delete ALL jobs (cancelled, pending, failed, completed)
    const { error } = await supabase
      .from('background_jobs')
      .delete()
      .eq('user_id', userId)

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error clearing all jobs:', error)
    return { success: false, error: errorMessage }
  }
}

/**
 * Fix orphaned documents - documents stuck in "processing" with no active job.
 * Resets them to "pending" so they can be retried.
 *
 * @returns Promise with count of documents fixed
 */
export async function fixOrphanedDocuments() {
  const supabase = await createClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID
    if (!userId) throw new Error('Not authenticated')

    // Find documents in processing/pending state
    const { data: processingDocs } = await supabase
      .from('documents')
      .select('id, title, processing_status')
      .eq('user_id', userId)
      .in('processing_status', ['pending', 'processing'])

    if (!processingDocs || processingDocs.length === 0) {
      return { success: true, fixed: 0 }
    }

    const orphaned = []

    // Check each document for active jobs
    for (const doc of processingDocs) {
      const { data: jobs } = await supabase
        .from('background_jobs')
        .select('id')
        .eq('entity_id', doc.id)

      if (!jobs || jobs.length === 0) {
        orphaned.push(doc)
      }
    }

    if (orphaned.length === 0) {
      return { success: true, fixed: 0 }
    }

    // Reset orphaned documents to pending
    for (const doc of orphaned) {
      await supabase
        .from('documents')
        .update({
          processing_status: 'failed',
          processing_error: 'Job was cancelled or lost. Please retry processing.'
        })
        .eq('id', doc.id)
    }

    revalidatePath('/')
    return { success: true, fixed: orphaned.length }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fixOrphanedDocuments] Error:', error)
    return { success: false, error: errorMessage, fixed: 0 }
  }
}

/**
 * Nuclear option: Cancel all jobs AND delete all processing documents.
 * Use this for testing when you want to completely reset the system.
 *
 * This will:
 * 1. Fix any orphaned documents (processing status but no job)
 * 2. Cancel all processing jobs
 * 3. Delete all jobs from database
 * 4. Delete all documents with processing status (pending, processing, failed)
 * 5. Clean up all associated chunks, connections, and storage files
 *
 * @returns Promise with success status and counts of what was deleted
 */
export async function clearAllJobsAndProcessingDocuments() {
  const supabase = await createClient()

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const userId = user?.id || process.env.NEXT_PUBLIC_DEV_USER_ID
    if (!userId) throw new Error('Not authenticated')

    console.log('[clearAllJobsAndProcessingDocuments] Starting nuclear cleanup...')

    // Step 0: Fix orphaned documents first
    const orphanResult = await fixOrphanedDocuments()
    if (orphanResult.fixed > 0) {
      console.log(`[clearAllJobsAndProcessingDocuments] Fixed ${orphanResult.fixed} orphaned documents`)
    }

    // Step 1: Cancel all processing jobs
    await supabase
      .from('background_jobs')
      .update({
        status: 'cancelled',
        last_error: 'Nuclear cleanup - cancelled'
      })
      .eq('user_id', userId)
      .eq('status', 'processing')

    // Give worker time to stop
    await new Promise(resolve => setTimeout(resolve, 300))

    // Step 2: Delete all jobs
    const { error: jobsError } = await supabase
      .from('background_jobs')
      .delete()
      .eq('user_id', userId)

    if (jobsError) console.warn('[clearAllJobsAndProcessingDocuments] Error deleting jobs:', jobsError)

    // Step 3: Find all documents that are not completed
    const { data: docs, error: docsError } = await supabase
      .from('documents')
      .select('id, title, processing_status')
      .eq('user_id', userId)
      .in('processing_status', ['pending', 'processing', 'failed'])

    if (docsError) throw docsError

    const docCount = docs?.length || 0
    console.log(`[clearAllJobsAndProcessingDocuments] Found ${docCount} documents to delete`)

    // Step 4: Delete each document comprehensively
    if (docs && docs.length > 0) {
      for (const doc of docs) {
        console.log(`[clearAllJobsAndProcessingDocuments] Deleting document: ${doc.title}`)
        await deleteDocument(doc.id)
      }
    }

    revalidatePath('/')
    return {
      success: true,
      documentsDeleted: docCount,
      message: `Deleted all jobs and ${docCount} processing documents`
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[clearAllJobsAndProcessingDocuments] Error:', error)
    return { success: false, error: errorMessage }
  }
}
