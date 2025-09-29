/**
 * Base abstract class for all document source processors.
 * Provides common functionality for progress tracking, error handling, and retry logic.
 */

import { GoogleGenAI } from '@google/genai'
import { SupabaseClient } from '@supabase/supabase-js'
import type { 
  ProcessResult, 
  ProgressUpdate, 
  ProcessingOptions 
} from '../types/processor.js'
import { classifyError, getUserFriendlyError } from '../lib/errors.js'
import { batchInsertChunks, calculateOptimalBatchSize } from '../lib/batch-operations.js'

/**
 * Background job interface from database.
 */
export interface BackgroundJob {
  id: string
  document_id: string
  status: string
  error?: string
  metadata?: Record<string, any>
  input_data: {
    document_id: string
    source_type?: string
    source_url?: string
    processing_requested?: boolean
    pasted_content?: string
    [key: string]: any
  }
}

/**
 * Abstract base class for source-specific document processors.
 * Handles common operations like progress updates, retry logic, and error classification.
 * 
 * @example
 * class PDFProcessor extends SourceProcessor {
 *   async process(): Promise<ProcessResult> {
 *     // Implementation
 *   }
 * }
 */
export abstract class SourceProcessor {
  /** Google AI client for content processing */
  protected readonly ai: GoogleGenAI
  /** Supabase client for database operations */
  protected readonly supabase: SupabaseClient
  /** Background job being processed */
  protected readonly job: BackgroundJob
  /** Processing configuration options */
  protected readonly options: ProcessingOptions

  /**
   * Creates a new source processor instance.
   * 
   * @param ai - Google Generative AI client
   * @param supabase - Supabase client for database operations
   * @param job - Background job record with document metadata
   * @param options - Optional processing configuration
   */
  constructor(
    ai: GoogleGenAI,
    supabase: SupabaseClient,
    job: BackgroundJob,
    options: ProcessingOptions = {}
  ) {
    this.ai = ai
    this.supabase = supabase
    this.job = job
    this.options = {
      maxRetries: 3,
      trackPositions: true,
      cleanWithAI: true,
      ...options
    }
  }

  /**
   * Abstract method to process document from source.
   * Must be implemented by each source-specific processor.
   * 
   * @returns Processed document result with markdown and chunks
   */
  abstract process(): Promise<ProcessResult>

  /**
   * Updates job progress in the database.
   * Provides real-time status tracking for UI display.
   * 
   * @param percent - Percentage complete (0-100)
   * @param stage - Current processing stage
   * @param substage - Optional sub-stage within current stage
   * @param details - Human-readable status details
   * @param additionalData - Extra data for UI rendering
   * @returns Promise resolving when update is complete
   */
  protected async updateProgress(
    percent: number,
    stage: string,
    substage?: string,
    details?: string,
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
      await this.supabase
        .from('background_jobs')
        .update({
          status: 'processing',
          metadata: {
            ...this.job.metadata,
            progress_percent: percent,
            current_stage: stage,
            current_substage: substage,
            stage_details: details,
            ...additionalData,
            updated_at: new Date().toISOString()
          }
        })
        .eq('id', this.job.id)
    } catch (error) {
      // Log but don't throw - progress updates are non-critical
      console.warn(`Failed to update progress for job ${this.job.id}:`, error)
    }
  }

  /**
   * Wraps an operation with retry logic and exponential backoff.
   * Automatically classifies errors to determine if retry is appropriate.
   * 
   * @param operation - Async function to execute with retry
   * @param operationName - Name for logging and error messages
   * @returns Result from successful operation
   * @throws Final error if all retries exhausted
   */
  protected async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const maxRetries = this.options.maxRetries || 3
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        lastError = error
        const errorType = classifyError(error)

        // Don't retry permanent errors
        if (errorType === 'permanent' || errorType === 'invalid') {
          throw error
        }

        // Don't retry paywall errors
        if (errorType === 'paywall') {
          const friendlyMessage = getUserFriendlyError(error)
          throw new Error(friendlyMessage)
        }

        // Retry transient errors with exponential backoff
        if (attempt < maxRetries && errorType === 'transient') {
          const delay = Math.min(2000 * Math.pow(2, attempt), 16000) // 2s, 4s, 8s, max 16s
          console.log(
            `⏳ ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
            `retrying in ${delay}ms...`
          )
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        // Max retries reached
        throw error
      }
    }

    // Should never reach here, but satisfy TypeScript
    throw lastError || new Error(`${operationName} failed after ${maxRetries} retries`)
  }

  /**
   * Inserts chunks into database using batch operations.
   * Reduces database calls by 50x through intelligent batching.
   * 
   * @param chunks - Array of chunks to insert
   * @param onProgress - Optional progress callback
   * @returns Number of successfully inserted chunks
   */
  protected async insertChunksBatch(
    chunks: Array<Record<string, any>>,
    onProgress?: (completed: number, total: number) => Promise<void>
  ): Promise<number> {
    const batchSize = calculateOptimalBatchSize(chunks, 10)
    
    const result = await batchInsertChunks(
      this.supabase,
      chunks,
      {
        batchSize,
        onProgress: onProgress || (async (done, total) => {
          // Update job progress during batch insert
          const percent = Math.floor((done / total) * 100)
          await this.updateProgress(
            50 + Math.floor(percent * 0.45), // 50-95% range for chunk insertion
            'store',
            'inserting',
            `Inserted ${done}/${total} chunks`
          )
        })
      }
    )
    
    if (result.failed.length > 0) {
      console.error(
        `[${this.constructor.name}] Failed to insert ${result.failed.length} chunks. ` +
        `First error: ${result.failed[0].error.message}`
      )
    }
    
    console.log(
      `[${this.constructor.name}] Batch insert complete: ` +
      `${result.inserted.length}/${chunks.length} chunks in ${result.dbCalls} DB calls ` +
      `(${(result.totalTime / 1000).toFixed(1)}s)`
    )
    
    return result.inserted.length
  }

  /**
   * Gets storage path for document files.
   * 
   * @returns Storage path in format "userId/documentId"
   */
  protected getStoragePath(): string {
    const metadata = this.job.metadata || {}
    return metadata.storage_path || `dev-user-123/${this.job.document_id}`
  }

  /**
   * Downloads a file from Supabase storage.
   * 
   * @param path - Storage path to file
   * @returns File content as text
   * @throws Error if download fails
   */
  protected async downloadFromStorage(path: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from('documents')
      .download(path)
    
    if (error) {
      throw new Error(`Failed to download ${path}: ${error.message}`)
    }

    return data.text()
  }

  /**
   * Uploads content to Supabase storage.
   * 
   * @param path - Storage path for file
   * @param content - File content to upload
   * @param contentType - MIME type of content
   * @returns Upload result data
   * @throws Error if upload fails
   */
  protected async uploadToStorage(
    path: string,
    content: string | Blob,
    contentType: string = 'text/plain'
  ): Promise<any> {
    const blob = typeof content === 'string' 
      ? new Blob([content], { type: contentType })
      : content

    const { data, error } = await this.supabase.storage
      .from('documents')
      .upload(path, blob, {
        contentType,
        upsert: true
      })

    if (error) {
      throw new Error(`Failed to upload to ${path}: ${error.message}`)
    }

    return data
  }
}