'use server'

import { revalidatePath } from 'next/cache'
import { getAuthContext, createBackgroundJob, withErrorHandling, validateDocumentOwnership, type ActionResult } from './utils'

/**
 * Continue processing a document from awaiting_manual_review state
 * Creates a background job that resumes chunking pipeline after markdown review
 *
 * @param documentId - Document to continue processing
 * @param skipAiCleanup - Skip AI cleanup (only for docling_extraction stage)
 * @param chunkerStrategy - Chonkie chunking strategy (default: 'recursive')
 * @returns Job ID on success
 */
export async function continueDocumentProcessing(
  documentId: string,
  skipAiCleanup: boolean = false,
  chunkerStrategy: string = 'recursive'
): Promise<ActionResult<{ jobId: string }>> {
  return withErrorHandling(async () => {
    const { user, supabase } = await getAuthContext()

    // Validate ownership
    await validateDocumentOwnership(supabase, user.id, documentId)

    // Get document to verify status
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, processing_status, review_stage, title')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      throw new Error('Document not found')
    }

    if (document.processing_status !== 'awaiting_manual_review' && document.processing_status !== 'failed') {
      throw new Error(`Invalid status: ${document.processing_status}. Expected: awaiting_manual_review or failed`)
    }

    // Create background job
    const jobId = await createBackgroundJob(
      user.id,
      'continue_processing',
      documentId,
      {
        documentId,
        userId: user.id,
        skipAiCleanup,
        chunkerStrategy,
        documentTitle: document.title,
        reviewStage: document.review_stage
      }
    )

    // Revalidate paths
    revalidatePath('/library')
    revalidatePath(`/read/${documentId}`)

    return { jobId }
  })
}

/**
 * Get status of a background job
 * Used for polling job progress
 *
 * @param jobId - Job ID to check
 * @returns Job status and progress
 */
export async function getJobStatus(jobId: string): Promise<ActionResult<{
  status: string
  progress: {
    percent: number
    stage?: string
    details?: string
  } | null
  error: string | null
  output_data: Record<string, unknown> | null
}>> {
  return withErrorHandling(async () => {
    const { user, supabase } = await getAuthContext()

    const { data: job, error } = await supabase
      .from('background_jobs')
      .select('status, progress, last_error, output_data, user_id')
      .eq('id', jobId)
      .single()

    if (error || !job) {
      throw new Error('Job not found')
    }

    // Verify ownership
    if (job.user_id !== user.id) {
      throw new Error('Not authorized to access this job')
    }

    return {
      status: job.status,
      progress: job.progress,
      error: job.last_error,
      output_data: job.output_data
    }
  })
}
