'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Delete a document and all associated data.
 */
export async function deleteDocument(documentId: string) {
  const supabase = await createClient()

  try {
    // Delete document (cascades to chunks, jobs, etc.)
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (error) throw error

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error deleting document:', error)
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
