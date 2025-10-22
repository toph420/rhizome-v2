/**
 * Centralized Error Handler for background job handlers.
 *
 * Provides consistent error handling across all handlers:
 * - Error classification (transient, permanent, validation, etc.)
 * - Structured error logging
 * - Retry scheduling for transient errors
 * - User-friendly error messages
 *
 * Phase 6: Error Handling Consolidation
 * Consolidates 12+ catch blocks with different patterns into single handler.
 */

import { getUserFriendlyError, classifyError, type ErrorType } from './errors.js'

export interface ErrorHandlerOptions {
  /**
   * Job ID for tracking
   */
  jobId: string

  /**
   * Entity ID (e.g., documentId) for context
   */
  entityId?: string

  /**
   * Whether to automatically schedule retry for transient errors
   */
  autoRetry?: boolean

  /**
   * Maximum retry attempts
   */
  maxRetries?: number

  /**
   * Custom error context for logging
   */
  context?: Record<string, any>
}

export interface ErrorHandlerResult {
  /**
   * Classified error type
   */
  errorType: ErrorType

  /**
   * User-friendly error message
   */
  userMessage: string

  /**
   * Whether retry was scheduled
   */
  retryScheduled: boolean

  /**
   * Next retry timestamp (if scheduled)
   */
  nextRetryAt?: string
}

/**
 * Centralized error handler for background jobs.
 * Call this from catch blocks instead of implementing error handling inline.
 *
 * @param supabase - Supabase client
 * @param error - The error to handle
 * @param options - Error handling options
 * @returns Error handling result
 *
 * @example
 * ```typescript
 * try {
 *   await processDocument()
 * } catch (error: any) {
 *   const result = await handleHandlerError(supabase, error, {
 *     jobId: job.id,
 *     entityId: documentId,
 *     autoRetry: true
 *   })
 *
 *   if (!result.retryScheduled) {
 *     // Permanent error - notify user
 *   }
 * }
 * ```
 */
export async function handleHandlerError(
  supabase: any,
  error: Error,
  options: ErrorHandlerOptions
): Promise<ErrorHandlerResult> {
  const {
    jobId,
    entityId,
    autoRetry = true,
    maxRetries = 3,
    context = {}
  } = options

  // Classify error
  const errorType = classifyError(error)
  const userMessage = getUserFriendlyError(error)

  // Log error with full context
  console.error(`[ErrorHandler] Job ${jobId} failed:`, {
    error: error.message,
    type: errorType,
    entityId,
    stack: error.stack,
    context
  })

  // Determine if we should retry
  const shouldRetry = autoRetry && shouldScheduleRetry(errorType, jobId, maxRetries)
  let nextRetryAt: string | undefined

  if (shouldRetry) {
    // Calculate retry delay with exponential backoff
    const retryDelay = calculateRetryDelay(errorType, getRetryAttempt(jobId))
    nextRetryAt = new Date(Date.now() + retryDelay).toISOString()

    console.log(`[ErrorHandler] Scheduling retry in ${retryDelay / 1000}s (${errorType})`)
  } else {
    console.log(`[ErrorHandler] No retry scheduled (${errorType})`)
  }

  // Update job status
  await updateJobStatus(supabase, jobId, {
    status: shouldRetry ? 'failed' : 'failed',
    errorType,
    errorMessage: error.message,
    userMessage,
    failedAt: new Date().toISOString(),
    nextRetryAt: shouldRetry ? nextRetryAt : null
  })

  // Record failure for analytics/monitoring
  await recordFailure(supabase, jobId, {
    errorType,
    errorMessage: error.message,
    entityId,
    context
  })

  return {
    errorType,
    userMessage,
    retryScheduled: shouldRetry,
    nextRetryAt
  }
}

/**
 * Determine if error should be retried.
 */
function shouldScheduleRetry(
  errorType: ErrorType,
  jobId: string,
  maxRetries: number
): boolean {
  // Don't retry permanent errors
  if (errorType === 'validation_error' || errorType === 'not_found') {
    return false
  }

  // Don't retry if max attempts exceeded
  const currentAttempts = getRetryAttempt(jobId)
  if (currentAttempts >= maxRetries) {
    console.log(`[ErrorHandler] Max retries (${maxRetries}) exceeded`)
    return false
  }

  // Retry transient and network errors
  return errorType === 'transient' || errorType === 'network_error'
}

/**
 * Calculate retry delay with exponential backoff.
 * Base delay increases: 30s → 2min → 5min
 */
function calculateRetryDelay(errorType: ErrorType, attempt: number): number {
  const baseDelays: Record<ErrorType, number> = {
    transient: 30 * 1000, // 30 seconds
    network_error: 60 * 1000, // 1 minute
    ai_error: 120 * 1000, // 2 minutes
    validation_error: 0, // No retry
    not_found: 0, // No retry
    unknown: 60 * 1000 // 1 minute
  }

  const baseDelay = baseDelays[errorType] || 60 * 1000

  // Exponential backoff: delay * 2^attempt
  // Capped at 15 minutes
  return Math.min(baseDelay * Math.pow(2, attempt), 15 * 60 * 1000)
}

/**
 * Get current retry attempt count (mock implementation).
 * In production, would query from job metadata.
 */
function getRetryAttempt(jobId: string): number {
  // TODO: Query from job.metadata.retry_count or similar
  return 0
}

/**
 * Update job status in database.
 */
async function updateJobStatus(
  supabase: any,
  jobId: string,
  status: {
    status: string
    errorType: ErrorType
    errorMessage: string
    userMessage: string
    failedAt: string
    nextRetryAt: string | null
  }
): Promise<void> {
  const { error } = await supabase
    .from('background_jobs')
    .update({
      status: status.status,
      error_type: status.errorType,
      error_message: status.errorMessage,
      failed_at: status.failedAt,
      next_retry_at: status.nextRetryAt,
      progress: {
        percent: 0,
        stage: 'failed',
        status: 'failed',
        message: status.userMessage
      }
    })
    .eq('id', jobId)

  if (error) {
    console.error(`[ErrorHandler] Failed to update job status:`, error)
  }
}

/**
 * Record failure for monitoring/analytics.
 */
async function recordFailure(
  supabase: any,
  jobId: string,
  details: {
    errorType: ErrorType
    errorMessage: string
    entityId?: string
    context?: Record<string, any>
  }
): Promise<void> {
  // Could log to monitoring system, analytics, etc.
  console.log(`[ErrorHandler] Failure recorded:`, {
    jobId,
    ...details
  })

  // TODO: Could insert into error_log table for analytics
}

/**
 * Extract error context from various error types.
 * Helps with debugging and error reporting.
 */
export function extractErrorContext(error: Error): Record<string, any> {
  const context: Record<string, any> = {
    name: error.name,
    message: error.message
  }

  // Extract additional context from known error types
  if ('code' in error) {
    context.code = (error as any).code
  }

  if ('statusCode' in error) {
    context.statusCode = (error as any).statusCode
  }

  if ('response' in error) {
    context.response = (error as any).response
  }

  return context
}
