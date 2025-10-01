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
