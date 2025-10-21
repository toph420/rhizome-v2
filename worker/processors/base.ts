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
import { createHash } from 'crypto'

/**
 * Background job interface from database.
 * Simplified version with only fields needed by processors.
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

  // Pause/Resume fields (added in migration 052)
  resume_count?: number
  last_checkpoint_path?: string
  last_checkpoint_stage?: string
  checkpoint_hash?: string
  created_at?: string
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
  /** Heartbeat timer for keeping job alive indicator */
  private heartbeatTimer?: NodeJS.Timeout

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
   * Starts heartbeat mechanism that updates job.updated_at every 5 seconds.
   * This provides visual "alive" indication in the UI (green pulse).
   *
   * Call this at the beginning of long-running operations.
   * Automatically stopped by stopHeartbeat() in finally blocks.
   */
  protected startHeartbeat(): void {
    // Clear any existing heartbeat
    this.stopHeartbeat()

    // Update every 5 seconds
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.supabase
          .from('background_jobs')
          .update({
            updated_at: new Date().toISOString()
          })
          .eq('id', this.job.id)
      } catch (error) {
        // Non-critical - just log the error
        console.warn(`[Heartbeat] Failed to update for job ${this.job.id}:`, error)
      }
    }, 5000)

    console.log(`[Heartbeat] Started for job ${this.job.id}`)
  }

  /**
   * Stops the heartbeat timer.
   * Should be called in finally blocks to ensure cleanup.
   */
  protected stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
      console.log(`[Heartbeat] Stopped for job ${this.job.id}`)
    }
  }

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
            updated_at: new Date().toISOString(), // Add timestamp to progress
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
    return (inputData as any).storage_path || `dev-user-123/${this.job.input_data.document_id}`
  }

  /**
   * Enrich chunks with structured metadata using PydanticAI + Ollama.
   * Shared method for PDF, EPUB, and YouTube processors.
   *
   * Phase 2: Extracted from processor duplication (240 lines saved)
   *
   * @param chunks - Chunks to enrich with metadata
   * @param startProgress - Starting progress percentage (e.g., 77)
   * @param endProgress - Ending progress percentage (e.g., 90)
   * @param options - Optional configuration
   * @returns Enriched chunks with AI metadata
   */
  protected async enrichMetadataBatch(
    chunks: ProcessedChunk[],
    startProgress: number,
    endProgress: number,
    options?: {
      batchSize?: number
      onError?: 'throw' | 'warn' | 'mark_review'
    }
  ): Promise<ProcessedChunk[]> {
    const BATCH_SIZE = options?.batchSize || 10
    const progressRange = endProgress - startProgress
    const enrichedChunks: ProcessedChunk[] = []

    // Dynamically import to avoid circular dependency
    const { extractMetadataBatch } = await import('../lib/chunking/pydantic-metadata.js')
    type ChunkInput = { id: string; content: string }

    console.log(`[BaseProcessor] Enriching ${chunks.length} chunks with metadata (batch size: ${BATCH_SIZE})`)
    await this.updateProgress(startProgress + 1, 'metadata', 'processing', 'Extracting structured metadata')

    try {
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)

        // Prepare batch for metadata extraction
        const batchInput: ChunkInput[] = batch.map(chunk => ({
          id: `${this.job.document_id}-${chunk.chunk_index}`,
          content: chunk.content
        }))

        console.log(`[BaseProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`)

        // Extract metadata with progress tracking
        const metadataMap = await extractMetadataBatch(batchInput, {
          onProgress: (processed, _total) => {
            const overallProgress = startProgress + Math.floor(((i + processed) / chunks.length) * progressRange)
            this.updateProgress(overallProgress, 'metadata', 'processing', `Enriching chunk ${i + processed}/${chunks.length}`)
          }
        })

        // Enrich chunks with extracted metadata
        for (const chunk of batch) {
          const chunkId = `${this.job.document_id}-${chunk.chunk_index}`
          const metadata = metadataMap.get(chunkId)

          if (metadata) {
            enrichedChunks.push({
              ...chunk,
              themes: metadata.themes,
              importance_score: metadata.importance,
              summary: metadata.summary,
              emotional_metadata: {
                polarity: metadata.emotional.polarity,
                primaryEmotion: metadata.emotional.primaryEmotion as any,
                intensity: metadata.emotional.intensity
              },
              conceptual_metadata: {
                concepts: metadata.concepts as any
              },
              domain_metadata: {
                primaryDomain: metadata.domain as any,
                confidence: 0.8
              },
              metadata_extracted_at: new Date().toISOString()
            })
          } else {
            console.warn(`[BaseProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
            enrichedChunks.push(chunk)
          }
        }

        // Progress update after each batch
        const progress = startProgress + Math.floor(((i + batch.length) / chunks.length) * progressRange)
        await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
      }

      console.log(`[BaseProcessor] Metadata enrichment complete: ${enrichedChunks.length} chunks enriched`)
      await this.updateProgress(endProgress, 'metadata', 'complete', 'Metadata enrichment done')

      return enrichedChunks

    } catch (error: any) {
      console.error(`[BaseProcessor] Metadata enrichment failed: ${error.message}`)

      // Handle errors based on configuration
      const errorHandling = options?.onError || 'mark_review'

      if (errorHandling === 'throw') {
        throw error
      } else if (errorHandling === 'warn') {
        console.warn('[BaseProcessor] Continuing with default metadata')
        await this.updateProgress(endProgress, 'metadata', 'fallback', 'Using default metadata')
        return chunks // Return original chunks without enrichment
      } else {
        // mark_review: Default behavior for PDF/EPUB processors
        console.warn('[BaseProcessor] Continuing with default metadata')

        // Try to mark for review (processor-specific method may not exist)
        if (typeof (this as any).markForReview === 'function') {
          await (this as any).markForReview(
            'metadata_enrichment_failed',
            `Local metadata enrichment failed: ${error.message}. Using default metadata.`
          )
        }

        await this.updateProgress(endProgress, 'metadata', 'fallback', 'Using default metadata')
        return chunks // Return original chunks without enrichment
      }
    }
  }

  /**
   * Generate embeddings for chunks using Transformers.js with Gemini fallback.
   * Shared method for PDF, EPUB, and YouTube processors.
   *
   * Phase 2: Extracted from processor duplication (270 lines saved)
   *
   * @param chunks - Chunks to generate embeddings for
   * @param startProgress - Starting progress percentage (e.g., 90)
   * @param endProgress - Ending progress percentage (e.g., 95)
   * @param options - Optional configuration
   * @returns Chunks with embeddings attached
   */
  protected async generateChunkEmbeddings(
    chunks: ProcessedChunk[],
    startProgress: number,
    endProgress: number,
    options?: {
      enhanceWithMetadata?: boolean
      onError?: 'throw' | 'warn' | 'mark_review'
    }
  ): Promise<ProcessedChunk[]> {
    const enhanceWithMetadata = options?.enhanceWithMetadata ?? true

    console.log(`[BaseProcessor] Generating embeddings for ${chunks.length} chunks`)
    await this.updateProgress(startProgress + 2, 'embeddings', 'processing', 'Generating local embeddings')

    try {
      // Dynamically import to avoid circular dependencies
      const { generateEmbeddingsLocal } = await import('../lib/local/embeddings-local.js')
      const { generateEmbeddings } = await import('../lib/embeddings.js')

      let chunkTexts: string[]
      let enhancedCount = 0
      let fallbackCount = 0

      if (enhanceWithMetadata) {
        // Import metadata enhancement functions
        const { createEnhancedEmbeddingText, validateEnhancedText } = await import('../lib/embeddings/metadata-context.js')

        // Create enhanced text with metadata context for better retrieval
        chunkTexts = chunks.map((chunk) => {
          const enhancedText = createEnhancedEmbeddingText({
            content: chunk.content,
            heading_path: chunk.heading_path,
            page_start: chunk.page_start,
            section_marker: chunk.section_marker
          })

          // Validate enhancement doesn't exceed token limits
          const validation = validateEnhancedText(chunk.content, enhancedText)
          if (!validation.valid) {
            console.warn(`[BaseProcessor] ${validation.warning} - using original text for chunk ${chunk.chunk_index}`)
            fallbackCount++
            return chunk.content
          }

          if (enhancedText !== chunk.content) {
            enhancedCount++
          }

          return enhancedText
        })

        console.log(`[BaseProcessor] Metadata enhancement: ${enhancedCount}/${chunkTexts.length} (${((enhancedCount/chunkTexts.length)*100).toFixed(1)}%)`)
        if (fallbackCount > 0) {
          console.warn(`[BaseProcessor] Fallback: ${fallbackCount} chunks exceeded token limits`)
        }
      } else {
        // Use plain chunk content without enhancement (YouTube transcripts)
        chunkTexts = chunks.map(chunk => chunk.content)
      }

      console.log(`[BaseProcessor] Generating embeddings (Xenova/all-mpnet-base-v2)`)
      const startTime = Date.now()

      // Generate embeddings locally with Transformers.js
      const embeddings = await generateEmbeddingsLocal(chunkTexts)

      const embeddingTime = Date.now() - startTime
      console.log(`[BaseProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

      // Validate dimensions
      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`)
      }

      // Attach embeddings to chunks
      const enrichedChunks = chunks.map((chunk, idx) => ({
        ...chunk,
        embedding: embeddings[idx]
      }))

      console.log('[BaseProcessor] Embeddings attached to all chunks')
      await this.updateProgress(endProgress, 'embeddings', 'complete', 'Local embeddings generated')

      return enrichedChunks

    } catch (error: any) {
      console.error(`[BaseProcessor] Local embeddings failed: ${error.message}`)
      console.warn('[BaseProcessor] Falling back to Gemini embeddings')

      try {
        // Dynamically import Gemini fallback
        const { generateEmbeddings } = await import('../lib/embeddings.js')

        // Fallback to Gemini embeddings
        const chunkContents = chunks.map(chunk => chunk.content)
        const embeddings = await generateEmbeddings(chunkContents)

        const enrichedChunks = chunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[BaseProcessor] Gemini embeddings fallback successful')
        await this.updateProgress(endProgress, 'embeddings', 'fallback', 'Using Gemini embeddings')

        return enrichedChunks

      } catch (fallbackError: any) {
        console.error(`[BaseProcessor] Gemini embeddings also failed: ${fallbackError.message}`)

        // Handle errors based on configuration
        const errorHandling = options?.onError || 'mark_review'

        if (errorHandling === 'throw') {
          throw fallbackError
        } else if (errorHandling === 'warn') {
          console.warn('[BaseProcessor] Continuing without embeddings')
          await this.updateProgress(endProgress, 'embeddings', 'failed', 'Embeddings generation failed')
          return chunks // Return chunks without embeddings
        } else {
          // mark_review: Default behavior
          console.warn('[BaseProcessor] Continuing without embeddings')

          // Try to mark for review
          if (typeof (this as any).markForReview === 'function') {
            await (this as any).markForReview(
              'embeddings_failed',
              `Both local and Gemini embeddings failed. Chunks saved without embeddings. Error: ${fallbackError.message}`
            )
          }

          await this.updateProgress(endProgress, 'embeddings', 'failed', 'Embeddings generation failed')
          return chunks // Return chunks without embeddings
        }
      }
    }
  }

  /**
   * Builds document-level metadata export for metadata.json.
   * Combines job data, ProcessResult metadata, and format-specific fields.
   *
   * @param result - ProcessResult from processor
   * @param formatSpecificData - Optional format-specific fields (page_count, isbn, etc.)
   * @returns MetadataExport object ready for saveStageResult('metadata')
   */
  protected buildMetadataExport(
    result: ProcessResult,
    formatSpecificData?: {
      page_count?: number | null
      isbn?: string | null
      genre?: string | null
      publication_year?: number | null
      language?: string
    }
  ): Record<string, any> {
    return {
      version: "1.0",
      document_id: this.job.input_data.document_id,

      // Document identification
      title: result.metadata?.title || null,
      author: result.metadata?.author || null,

      // Content metrics
      word_count: result.wordCount || 0,
      page_count: formatSpecificData?.page_count || null,

      // Classification
      language: formatSpecificData?.language || 'en',
      genre: formatSpecificData?.genre || null,
      publication_year: formatSpecificData?.publication_year || null,
      isbn: formatSpecificData?.isbn || null,

      // Source information
      source_type: this.job.input_data.source_type || 'unknown',
      original_filename: (this.job.input_data as any).original_filename || null,
      source_url: result.metadata?.sourceUrl || this.job.input_data.source_url || null,

      // Format-specific metadata (YouTube timestamps, etc.)
      source_metadata: result.metadata?.source_metadata || null,

      // Additional metadata
      extra: result.metadata?.extra || {},

      // Timestamps
      created_at: this.job.created_at || new Date().toISOString(),
      processing_completed_at: new Date().toISOString()
    }
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
   * Checkpoint tracking: When pauseSafe=true, updates job metadata with checkpoint info
   * for pause/resume functionality.
   *
   * @param stage - Stage name (e.g., "extraction", "chunking", "metadata", "manifest")
   * @param data - Stage data to save (must be JSON-serializable)
   * @param options - Optional configuration
   * @param options.final - If true, saves to final filename (e.g., chunks.json).
   *                        If false, saves to stage-{name}.json for checkpointing.
   * @param options.pauseSafe - If true, marks this stage as a safe pause point and
   *                            tracks checkpoint in job metadata for resumption.
   *
   * @example
   * ```typescript
   * // Save intermediate stage (checkpointing)
   * await this.saveStageResult('extraction', {
   *   markdown: extractedMarkdown,
   *   doclingChunks: rawChunks,
   *   structure: doclingStructure
   * }, { final: false, pauseSafe: true })
   * // → Saves to: documents/{userId}/{docId}/stage-extraction.json
   * // → Updates job with checkpoint info for pause/resume
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
    options?: { final?: boolean; pauseSafe?: boolean }
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
      // CRITICAL: Handle arrays properly (chunks are passed as array, not wrapped object)
      const enrichedData = Array.isArray(data)
        ? {
            chunks: data,  // Wrap array in chunks property
            version: "1.0",
            document_id: this.job.input_data.document_id,
            stage: stage,
            timestamp: new Date().toISOString(),
            final: options?.final ?? false
          }
        : {
            ...data,  // Objects can be spread normally
            version: data.version || "1.0",
            document_id: this.job.input_data.document_id,
            stage: stage,
            timestamp: new Date().toISOString(),
            final: options?.final ?? false
          }

      // Save to Storage (non-fatal, logs warning on failure)
      await saveToStorage(this.supabase, fullPath, enrichedData)

      console.log(
        `[BaseProcessor] ✓ Saved ${options?.final ? 'final' : 'stage'} result: ${fullPath}`
      )

      // NEW: Track checkpoint in job metadata if pause-safe
      if (options?.pauseSafe && this.job.id) {
        try {
          // Generate hash of checkpoint data for validation
          const checkpointHash = createHash('sha256')
            .update(JSON.stringify(enrichedData))
            .digest('hex')
            .substring(0, 16) // Use first 16 chars for brevity

          // Get current progress to preserve existing data
          const { data: currentJob } = await this.supabase
            .from('background_jobs')
            .select('progress')
            .eq('id', this.job.id)
            .single()

          const currentProgress = currentJob?.progress || {}

          // Update job with checkpoint info
          await this.supabase
            .from('background_jobs')
            .update({
              last_checkpoint_path: fullPath,
              last_checkpoint_stage: stage,
              checkpoint_hash: checkpointHash,
              progress: {
                ...currentProgress,
                checkpoint: {
                  stage,
                  path: fullPath,
                  timestamp: new Date().toISOString(),
                  can_resume: true,
                  hash: checkpointHash
                }
              }
            })
            .eq('id', this.job.id)

          console.log(
            `[BaseProcessor] ✓ Checkpoint tracked for job ${this.job.id} at stage: ${stage}`
          )
        } catch (checkpointError) {
          // Non-critical - just log the error
          console.warn(
            `[BaseProcessor] Failed to track checkpoint for ${stage}:`,
            checkpointError instanceof Error ? checkpointError.message : checkpointError
          )
        }
      }

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