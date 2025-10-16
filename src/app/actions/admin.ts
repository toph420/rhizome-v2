'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { deleteDocument } from './delete-document'

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
 * Pause a currently processing job.
 * Job must be in 'processing' status.
 * Marks job as 'paused' with timestamp and reason.
 */
export async function pauseJob(jobId: string) {
  const supabase = await createClient()

  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError) throw jobError
    if (!job) throw new Error('Job not found')

    if (job.status !== 'processing') {
      return { success: false, error: 'Can only pause processing jobs' }
    }

    // Update job to paused status
    const { error: updateError } = await supabase
      .from('background_jobs')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        pause_reason: 'User requested pause'
      })
      .eq('id', jobId)

    if (updateError) throw updateError

    revalidatePath('/')
    revalidatePath('/admin')
    return { success: true }
  } catch (error) {
    console.error('[pauseJob] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Resume a paused job.
 * Job must be in 'paused' status.
 * Validates checkpoint exists before resuming.
 */
export async function resumeJob(jobId: string) {
  const supabase = await createClient()

  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError) throw jobError
    if (!job) throw new Error('Job not found')

    if (job.status !== 'paused') {
      return { success: false, error: 'Can only resume paused jobs' }
    }

    // Validate checkpoint if exists
    if (job.last_checkpoint_path) {
      // Check if checkpoint file exists in storage
      const pathParts = job.last_checkpoint_path.split('/')
      const fileName = pathParts.pop()
      const folderPath = pathParts.join('/')

      const { data: files, error: listError } = await supabase.storage
        .from('documents')
        .list(folderPath)

      if (listError) {
        console.warn('[resumeJob] Could not verify checkpoint:', listError)
        // Continue anyway - handler will handle missing checkpoint gracefully
      } else {
        const checkpointExists = files?.some(f => f.name === fileName)
        if (!checkpointExists) {
          console.warn('[resumeJob] Checkpoint file not found, will restart from beginning')
        }
      }
    }

    // Update job to pending (will be picked up by worker)
    const { error: updateError } = await supabase
      .from('background_jobs')
      .update({
        status: 'pending',
        resumed_at: new Date().toISOString(),
        resume_count: (job.resume_count || 0) + 1
      })
      .eq('id', jobId)

    if (updateError) throw updateError

    revalidatePath('/')
    revalidatePath('/admin')
    return { success: true }
  } catch (error) {
    console.error('[resumeJob] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Retry a failed job.
 * Resets job to pending status and increments retry count.
 */
export async function retryJob(jobId: string) {
  const supabase = await createClient()

  try {
    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError) throw jobError
    if (!job) throw new Error('Job not found')

    // Can retry failed or cancelled jobs
    if (!['failed', 'cancelled'].includes(job.status)) {
      return { success: false, error: 'Can only retry failed or cancelled jobs' }
    }

    // Check retry limit
    if (job.retry_count >= (job.max_retries || 3)) {
      return { success: false, error: 'Max retries exceeded. Use "Restart" instead.' }
    }

    // Update job to pending for retry
    const { error: updateError } = await supabase
      .from('background_jobs')
      .update({
        status: 'pending',
        retry_count: (job.retry_count || 0) + 1,
        next_retry_at: null,
        resumed_at: new Date().toISOString(),
        last_error: null // Clear previous error
      })
      .eq('id', jobId)

    if (updateError) throw updateError

    revalidatePath('/')
    revalidatePath('/admin')
    return { success: true }
  } catch (error) {
    console.error('[retryJob] Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
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
