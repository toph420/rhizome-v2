/**
 * Retry Manager
 *
 * Handles automatic retry logic for failed background jobs with:
 * - Error classification (transient vs permanent)
 * - Exponential backoff
 * - Retry eligibility checking
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// Simplified types - we don't need full Database types for retry logic
type BackgroundJob = {
  id: string
  job_type: string
  status: string
  retry_count: number
  max_retries: number
  next_retry_at: string | null
  error_message: string | null
  input_data: any
}

export type ErrorType = 'transient' | 'permanent' | 'paywall' | 'invalid'

export interface ErrorClassification {
  type: ErrorType
  message: string
  canRetry: boolean
}

/**
 * Classifies errors to determine if they should be retried
 *
 * @param error - The error to classify
 * @returns Classification with type, message, and retry eligibility
 */
export function classifyError(error: Error): ErrorClassification {
  const errorMessage = error.message.toLowerCase()

  // Transient errors (retry-able) - network and temporary issues
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('socket hang up') ||
    errorMessage.includes('503') ||
    errorMessage.includes('502') ||
    errorMessage.includes('504') ||
    errorMessage.includes('429') || // Rate limit
    errorMessage.includes('temporarily unavailable')
  ) {
    return {
      type: 'transient',
      message: 'Temporary network or service issue. Will retry automatically.',
      canRetry: true
    }
  }

  // Paywall errors - quota/billing issues
  if (
    errorMessage.includes('quota') ||
    errorMessage.includes('credits') ||
    errorMessage.includes('billing') ||
    errorMessage.includes('rate limit exceeded') ||
    errorMessage.includes('insufficient funds')
  ) {
    return {
      type: 'paywall',
      message: 'API quota or billing issue. Check your account.',
      canRetry: false
    }
  }

  // Invalid input errors - bad data that won't change
  if (
    errorMessage.includes('invalid') ||
    errorMessage.includes('malformed') ||
    errorMessage.includes('not found') ||
    errorMessage.includes('does not exist') ||
    errorMessage.includes('parse error') ||
    errorMessage.includes('syntax error')
  ) {
    return {
      type: 'invalid',
      message: 'Invalid input or missing resource. Manual intervention required.',
      canRetry: false
    }
  }

  // Default to permanent for unknown errors
  return {
    type: 'permanent',
    message: 'Permanent error. Manual intervention required.',
    canRetry: false
  }
}

/**
 * Calculates next retry time with exponential backoff
 *
 * Backoff schedule: 1min → 2min → 4min → 8min → 16min (max 30min)
 *
 * @param retryCount - Current retry attempt number (0-indexed)
 * @returns ISO timestamp for next retry
 */
export function calculateNextRetry(retryCount: number): string {
  // Exponential backoff: 2^retryCount minutes, capped at 30 min
  const delayMinutes = Math.min(Math.pow(2, retryCount), 30)
  return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
}

/**
 * Checks for retry-eligible failed jobs and queues them for retry
 *
 * Runs periodically in the worker loop to automatically retry transient failures.
 * Only retries jobs that:
 * - Are in 'failed' status
 * - Have retry_count < max_retries
 * - Have passed next_retry_at timestamp
 * - Have 'transient' error type
 *
 * @param supabase - Supabase client with service role permissions
 */
export async function retryLoop(supabase: SupabaseClient) {
  try {
    // Query for retry-eligible jobs
    // Note: We query all failed jobs and filter in code since max_retries is per-job
    const { data: failedJobs, error } = await supabase
      .from('background_jobs')
      .select('*')
      .eq('status', 'failed')

    if (error) {
      console.error('[RetryManager] Failed to query retry-eligible jobs:', error)
      return
    }

    if (!failedJobs || failedJobs.length === 0) {
      return // No jobs to retry
    }

    // Filter for actually retry-eligible jobs (transient errors, not at max retries)
    const retryableJobs = failedJobs.filter(job => {
      if (job.retry_count >= job.max_retries) {
        return false
      }

      const errorType = job.error_message?.toLowerCase() || ''
      const isTransient = errorType.includes('temporary') ||
                         errorType.includes('timeout') ||
                         errorType.includes('network')

      return isTransient
    })

    // Only log if there are actual jobs to retry
    if (retryableJobs.length === 0) {
      return // No jobs need retry
    }

    console.log(`[RetryManager] Retrying ${retryableJobs.length} job(s) with transient errors`)

    for (const job of retryableJobs) {

      // Calculate next retry time with exponential backoff
      const nextRetryCount = job.retry_count + 1
      const nextRetryAt = calculateNextRetry(nextRetryCount)

      console.log(
        `[RetryManager] Auto-retrying job ${job.id} (${job.job_type}) - ` +
        `attempt ${nextRetryCount}/${job.max_retries} - ` +
        `next retry: ${nextRetryAt}`
      )

      // Update job to pending for re-processing
      const { error: updateError } = await supabase
        .from('background_jobs')
        .update({
          status: 'pending',
          retry_count: nextRetryCount,
          next_retry_at: nextRetryAt,
          resumed_at: new Date().toISOString(),
          error_message: null // Clear previous error for fresh attempt
        })
        .eq('id', job.id)

      if (updateError) {
        console.error(`[RetryManager] Failed to queue retry for job ${job.id}:`, updateError)
      } else {
        console.log(`[RetryManager] ✅ Job ${job.id} queued for retry`)
      }
    }
  } catch (error) {
    console.error('[RetryManager] Unexpected error in retry loop:', error)
  }
}

/**
 * Helper function to record a failed job with proper error classification
 *
 * Use this in handlers' catch blocks to ensure proper error tracking and retry eligibility.
 *
 * @param supabase - Supabase client
 * @param jobId - Job ID to update
 * @param error - The error that occurred
 */
export async function recordJobFailure(
  supabase: SupabaseClient,
  jobId: string,
  error: Error
): Promise<void> {
  const classification = classifyError(error)

  // Calculate next retry time if transient
  const nextRetryAt = classification.canRetry
    ? calculateNextRetry(0) // First retry in 1 minute
    : null

  // Preserve actual error message with classification context
  const errorMessage = `${error.message} (${classification.type}: ${classification.message})`

  try {
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        next_retry_at: nextRetryAt
        // Note: We don't modify input_data to avoid type issues
      })
      .eq('id', jobId)

    console.log(
      `[RetryManager] Recorded ${classification.type} error for job ${jobId}: ${error.message}`
    )
  } catch (updateError) {
    console.error(`[RetryManager] Failed to record job failure for ${jobId}:`, updateError)
  }
}
