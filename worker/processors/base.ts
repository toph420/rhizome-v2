/**
 * Base abstract class for all document source processors.
 * Provides common functionality for progress tracking, error handling, and retry logic.
 */

import { GoogleGenAI } from '@google/genai'
import { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProcessResult,
  ProgressUpdate,
  ProcessingOptions,
  ProcessedChunk
} from '../types/processor.js'
import { classifyError, getUserFriendlyError } from '../lib/errors.js'
import { batchInsertChunks, calculateOptimalBatchSize } from '../lib/batch-operations.js'
import type { ChunkMetadata, PartialChunkMetadata } from '../types/metadata.js'
import { saveToStorage } from '../lib/storage-helpers.js'

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
  protected supabase: SupabaseClient
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
   * Refreshes the Supabase client connection.
   * Call this before long-running storage operations to prevent stale connections.
   *
   * Critical for processors with long AI processing phases (e.g., EPUB with 93-minute chunking).
   * Supabase connections timeout after periods of inactivity.
   */
  protected async refreshConnection(): Promise<void> {
    const { createClient } = await import('@supabase/supabase-js')
    // Use NEXT_PUBLIC_SUPABASE_URL if SUPABASE_URL is not set (worker loads from parent .env.local)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL must be set')
    }
    this.supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  /**
   * Abstract method to process document from source.
   * Must be implemented by each source-specific processor.
   * 
   * IMPORTANT: Processors should ONLY transform data. They must NOT:
   * - Upload files to storage (use handler instead)
   * - Insert chunks to database (use handler instead)  
   * - Generate embeddings (use handler instead)
   * 
   * Processors should focus solely on:
   * - Extracting content from source format
   * - Converting to markdown
   * - Creating chunks for semantic search
   * - Extracting metadata
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
          progress: {
            percent: percent,
            stage: stage,
            substage: substage,
            details: details,
            ...additionalData
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
   * Maps AI-extracted metadata to database JSONB columns.
   * Ensures proper storage of emotional, conceptual, and domain metadata.
   * 
   * @param aiChunk - Chunk with AI metadata from batchChunkAndExtractMetadata
   * @param index - Chunk index in document
   * @returns Database-ready chunk object with proper metadata mapping
   */
  protected mapAIChunkToDatabase(
    aiChunk: {
      content: string
      start_offset: number
      end_offset: number
      chunk_index: number
      metadata: {
        themes: string[]
        concepts: Array<{ text: string; importance: number }>
        importance: number
        summary?: string
        domain?: string
        emotional: {
          polarity: number
          primaryEmotion: string
          intensity: number
        }
      }
    }
  ): Record<string, any> {
    return {
      content: aiChunk.content,
      chunk_index: aiChunk.chunk_index,
      // CRITICAL: Use absolute offsets from AI (already calculated)
      start_offset: aiChunk.start_offset,
      end_offset: aiChunk.end_offset,
      word_count: aiChunk.content.split(/\s+/).length,
      
      // Legacy fields (backwards compatibility)
      themes: aiChunk.metadata.themes,
      importance_score: aiChunk.metadata.importance,
      summary: aiChunk.metadata.summary || null,
      
      // JSONB metadata columns (CRITICAL for 3-engine system)
      emotional_metadata: {
        polarity: aiChunk.metadata.emotional.polarity,
        primaryEmotion: aiChunk.metadata.emotional.primaryEmotion,
        intensity: aiChunk.metadata.emotional.intensity
      },
      conceptual_metadata: {
        concepts: aiChunk.metadata.concepts  // [{text, importance}]
      },
      domain_metadata: aiChunk.metadata.domain ? {
        primaryDomain: aiChunk.metadata.domain,
        confidence: 0.8
      } : null,
      
      metadata_extracted_at: new Date().toISOString()
    }
  }


  /**
   * Gets storage path for document files.
   *
   * @returns Storage path in format "userId/documentId"
   */
  protected getStoragePath(): string {
    const inputData = this.job.input_data || {}
    return (inputData as any).storage_path || `dev-user-123/${this.job.document_id}`
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
   * Save processing stage result to Storage for portability and resumability.
   * Supports both intermediate stages (stage-*.json) and final outputs (*.json).
   *
   * Error handling: Non-fatal (logs warning, doesn't throw). Storage failures won't
   * interrupt processing - data is still saved to database.
   *
   * @param stage - Stage name (e.g., "extraction", "chunking", "metadata", "manifest")
   * @param data - Stage data to save (must be JSON-serializable)
   * @param options - Optional configuration
   * @param options.final - If true, saves to final filename (e.g., chunks.json).
   *                        If false, saves to stage-{name}.json for checkpointing.
   *
   * @example
   * ```typescript
   * // Save intermediate stage (checkpointing)
   * await this.saveStageResult('extraction', {
   *   markdown: extractedMarkdown,
   *   doclingChunks: rawChunks,
   *   structure: doclingStructure
   * }, { final: false })
   * // → Saves to: documents/{userId}/{docId}/stage-extraction.json
   *
   * // Save final result (permanent export)
   * await this.saveStageResult('chunks', enrichedChunks, { final: true })
   * // → Saves to: documents/{userId}/{docId}/chunks.json
   *
   * // Save manifest (always final)
   * await this.saveStageResult('manifest', manifestData, { final: true })
   * // → Saves to: documents/{userId}/{docId}/manifest.json
   * ```
   */
  protected async saveStageResult(
    stage: string,
    data: any,
    options?: { final?: boolean }
  ): Promise<void> {
    try {
      // Determine filename based on final flag
      const filename = options?.final
        ? `${stage}.json`  // Final: chunks.json, metadata.json, manifest.json
        : `stage-${stage}.json`  // Intermediate: stage-extraction.json, stage-cleanup.json

      // Build full Storage path: documents/{userId}/{documentId}/{filename}
      const storagePath = this.getStoragePath()
      const fullPath = `${storagePath}/${filename}`

      // Add metadata to all stage results
      const enrichedData = {
        ...data,
        version: data.version || "1.0",
        document_id: this.job.document_id,
        stage: stage,
        timestamp: new Date().toISOString(),
        final: options?.final ?? false
      }

      // Save to Storage (non-fatal, logs warning on failure)
      await saveToStorage(this.supabase, fullPath, enrichedData)

      console.log(
        `[BaseProcessor] ✓ Saved ${options?.final ? 'final' : 'stage'} result: ${fullPath}`
      )

    } catch (error) {
      // Non-fatal: log warning but continue processing
      // Storage save failures should not interrupt document processing
      console.warn(
        `[BaseProcessor] Failed to save stage result for ${stage}:`,
        error instanceof Error ? error.message : error
      )
      // Processing continues - data is still saved to database
    }
  }

}