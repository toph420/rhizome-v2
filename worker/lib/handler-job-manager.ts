/**
 * HandlerJobManager - Standardized job state management for background job handlers
 *
 * Eliminates duplicate progress tracking, completion, and error handling across handlers.
 * Provides consistent interface for job lifecycle management.
 *
 * Used by all handlers in worker/handlers/*
 */

import { classifyError, getUserFriendlyError } from './errors.js'
import { handleHandlerError, extractErrorContext } from './handler-error.js'
import type { ErrorType } from '../types/multi-format.js'

/**
 * Progress update structure for background jobs
 */
export interface JobProgress {
  percent: number
  stage: string
  details?: string
}

/**
 * Resume state information from checkpoints
 */
export interface ResumeState {
  resuming: boolean
  lastStage?: string
  checkpointPath?: string
  checkpointHash?: string
}

/**
 * Manages job state transitions and progress updates for background job handlers.
 *
 * Consolidates duplicate code from 8+ handlers into single utility class.
 *
 * @example
 * ```typescript
 * const jobManager = new HandlerJobManager(supabase, job.id)
 *
 * try {
 *   await jobManager.updateProgress(10, 'processing', 'Starting work...')
 *   // ... do work ...
 *   await jobManager.markComplete({ success: true, result: data })
 * } catch (error: any) {
 *   await jobManager.markFailed(error)
 *   throw error
 * }
 * ```
 */
export class HandlerJobManager {
  constructor(
    protected supabase: any,
    protected jobId: string
  ) {}

  /**
   * Update job progress with standardized format.
   * Sets job status to 'processing' automatically.
   *
   * @param percent - Progress percentage (0-100)
   * @param stage - Current processing stage (e.g., 'download', 'chunking')
   * @param details - Optional detailed status message
   *
   * @example
   * await jobManager.updateProgress(50, 'chunking', 'Processing chunk 123/500')
   */
  async updateProgress(
    percent: number,
    stage: string,
    details?: string
  ): Promise<void> {
    await this.supabase
      .from('background_jobs')
      .update({
        progress: {
          percent,
          stage,
          details: details || `${stage}: ${percent}%`
        },
        status: 'processing'
      })
      .eq('id', this.jobId)
  }

  /**
   * Mark job as successfully completed with output data.
   * Sets status to 'completed', progress to 100%, and records completion time.
   *
   * @param outputData - Job-specific output data (stored in output_data JSONB column)
   * @param finalMessage - Optional final progress message (defaults to 'Processing complete')
   *
   * @example
   * await jobManager.markComplete({
   *   success: true,
   *   connectionCount: 42,
   *   processingTime: 1234
   * })
   */
  async markComplete(
    outputData: any,
    finalMessage: string = 'Processing complete'
  ): Promise<void> {
    await this.supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        progress: {
          percent: 100,
          stage: 'complete',
          details: finalMessage
        },
        output_data: outputData,
        completed_at: new Date().toISOString()
      })
      .eq('id', this.jobId)
  }

  /**
   * Mark job as failed with error classification and user-friendly message.
   * Automatically classifies error type, generates helpful message, and schedules retries.
   *
   * ENHANCED (Phase 6): Now uses centralized error handler for consistent error handling,
   * automatic retry scheduling, and comprehensive error logging.
   *
   * @param error - Error that caused the failure
   * @param options - Optional configuration for error handling
   *
   * @example
   * try {
   *   await processDocument()
   * } catch (error: any) {
   *   await jobManager.markFailed(error, {
   *     entityId: documentId,
   *     autoRetry: true
   *   })
   *   throw error
   * }
   */
  async markFailed(
    error: Error,
    options?: {
      customErrorType?: ErrorType
      entityId?: string
      autoRetry?: boolean
      maxRetries?: number
    }
  ): Promise<void> {
    // Extract options
    const {
      customErrorType,
      entityId,
      autoRetry = true,
      maxRetries = 3
    } = options || {}

    // If custom error type provided, use simple implementation (backward compatibility)
    if (customErrorType) {
      const userMessage = getUserFriendlyError(error)
      await this.supabase
        .from('background_jobs')
        .update({
          status: 'failed',
          last_error: userMessage,
          error_type: customErrorType,
          completed_at: new Date().toISOString()
        })
        .eq('id', this.jobId)
      return
    }

    // Use centralized error handler (Phase 6)
    const errorContext = extractErrorContext(error)

    await handleHandlerError(this.supabase, error, {
      jobId: this.jobId,
      entityId,
      autoRetry,
      maxRetries,
      context: errorContext
    })
  }

  /**
   * Check if job is resuming from a checkpoint.
   * Returns resume state information including last completed stage.
   *
   * @returns Resume state with checkpoint information
   *
   * @example
   * const { resuming, lastStage } = await jobManager.checkResumeState()
   * if (resuming) {
   *   console.log(`Resuming from stage: ${lastStage}`)
   * }
   */
  async checkResumeState(): Promise<ResumeState> {
    const { data: job, error } = await this.supabase
      .from('background_jobs')
      .select('resume_count, metadata, last_checkpoint_path, checkpoint_hash')
      .eq('id', this.jobId)
      .single()

    if (error || !job) {
      console.warn(`[HandlerJobManager] Failed to check resume state: ${error?.message}`)
      return { resuming: false }
    }

    // Not a resume if resume_count is 0 or null
    if (!job.resume_count || job.resume_count === 0) {
      return { resuming: false }
    }

    // Check for checkpoint information
    const lastStage = job.metadata?.last_completed_stage
    if (lastStage) {
      console.log(`[HandlerJobManager] Resume detected - last stage: ${lastStage}`)
      return {
        resuming: true,
        lastStage,
        checkpointPath: job.last_checkpoint_path,
        checkpointHash: job.checkpoint_hash
      }
    }

    // Resume count > 0 but no checkpoint info
    console.warn(`[HandlerJobManager] Resume count=${job.resume_count} but no checkpoint stage found`)
    return { resuming: false }
  }

  /**
   * Get the full job record from database.
   * Useful for accessing input_data, entity_id, or other job fields.
   *
   * @returns Complete job record
   *
   * @example
   * const job = await jobManager.getJob()
   * const documentId = job.entity_id
   * const inputData = job.input_data
   */
  async getJob(): Promise<any> {
    const { data: job, error } = await this.supabase
      .from('background_jobs')
      .select('*')
      .eq('id', this.jobId)
      .single()

    if (error) {
      throw new Error(`Failed to fetch job: ${error.message}`)
    }

    return job
  }

  /**
   * Update job metadata (for checkpoint tracking, resume state, etc.)
   * Merges with existing metadata instead of replacing.
   *
   * @param metadata - Metadata object to merge
   *
   * @example
   * await jobManager.updateMetadata({ last_completed_stage: 'chunking' })
   */
  async updateMetadata(metadata: Record<string, any>): Promise<void> {
    // Get current job to merge metadata
    const job = await this.getJob()
    const currentMetadata = job.metadata || {}

    await this.supabase
      .from('background_jobs')
      .update({
        metadata: {
          ...currentMetadata,
          ...metadata
        }
      })
      .eq('id', this.jobId)
  }

  /**
   * Save checkpoint information for pause/resume functionality.
   * Updates checkpoint path, hash, and last completed stage.
   *
   * @param checkpointPath - Storage path to checkpoint file
   * @param checkpointHash - SHA-256 hash for validation
   * @param lastStage - Last completed processing stage
   *
   * @example
   * await jobManager.saveCheckpoint(
   *   'documents/checkpoints/job-123.json',
   *   'abc123def456',
   *   'chunking'
   * )
   */
  async saveCheckpoint(
    checkpointPath: string,
    checkpointHash: string,
    lastStage: string
  ): Promise<void> {
    await this.supabase
      .from('background_jobs')
      .update({
        last_checkpoint_path: checkpointPath,
        checkpoint_hash: checkpointHash,
        metadata: {
          last_completed_stage: lastStage
        }
      })
      .eq('id', this.jobId)
  }
}
