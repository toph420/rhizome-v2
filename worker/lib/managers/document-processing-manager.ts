/**
 * Document Processing Manager - Orchestrates the complete document processing workflow.
 *
 * Extends HandlerJobManager to manage the complex document processing pipeline:
 * 1. Checkpoint/cache checking
 * 2. AI processing with cancellation support
 * 3. Storage operations (markdown, metadata)
 * 4. Database operations (chunks, metadata)
 * 5. Embeddings generation
 * 6. Connection detection
 *
 * This manager reduces the process-document handler from 730 lines to ~100 lines
 * by organizing the workflow into clear, testable stages.
 */

import { GoogleGenAI } from '@google/genai'
import { HandlerJobManager } from '../handler-job-manager.js'
import { ProcessorRouter } from '../../processors/index.js'
import { StorageClient } from '../storage-client.js'
import { generateEmbeddings } from '../embeddings.js'
import { saveToStorage } from '../storage-helpers.js'
import { processDocument as orchestrateConnections } from '../../engines/orchestrator.js'
import { ConnectionDetectionManager } from './connection-detection-manager.js'
import { ChunkEnrichmentManager } from './chunk-enrichment-manager.js'
import type { SourceType } from '../../types/multi-format.js'
import type { ProcessResult } from '../../types/processor.js'
import { GEMINI_MODEL } from '../model-config.js'
import { createHash } from 'crypto'

interface DocumentProcessingOptions {
  documentId: string
  userId: string
  sourceType: SourceType
  reviewBeforeChunking?: boolean
  reviewDoclingExtraction?: boolean
  enrichChunks?: boolean  // Default: true
  detectConnections?: boolean  // Default: true for backward compatibility
}

/**
 * Manager class for document processing workflow.
 * Handles the entire pipeline from AI processing to connection detection.
 */
export class DocumentProcessingManager extends HandlerJobManager {
  private ai: GoogleGenAI
  private storage: StorageClient
  private options: DocumentProcessingOptions

  constructor(supabase: any, jobId: string, options: DocumentProcessingOptions) {
    super(supabase, jobId)

    // Validate API key
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY is not configured')
    }

    // Initialize AI client
    this.ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
      httpOptions: {
        timeout: 900000 // 15 minutes for large documents
      }
    })

    // Initialize storage client
    this.storage = new StorageClient(supabase, 'documents')

    this.options = options
  }

  /**
   * Execute the complete document processing workflow.
   * Main entry point called by the handler.
   */
  async execute(): Promise<void> {
    const { documentId, userId, sourceType } = this.options

    console.log(`📄 Processing document ${documentId} as ${ProcessorRouter.getSourceTypeName(sourceType)}`)

    // Validate source type
    if (!ProcessorRouter.isValidSourceType(sourceType)) {
      throw new Error(`Invalid source type: ${sourceType}`)
    }

    // Stage 1: Try to resume from checkpoint or cache
    await this.updateProgress(5, 'initializing', 'Checking for cached results')
    const result = await this.getProcessingResult(sourceType)

    // Validate result
    if (!result || !result.markdown || !result.chunks) {
      throw new Error('Processor returned invalid result')
    }

    console.log(`✅ Processing complete: ${result.chunks.length} chunks, ${result.wordCount || 'unknown'} words`)

    // Stage 2: Save markdown to storage
    await this.updateProgress(50, 'storage', 'Saving markdown')
    await this.saveMarkdownToStorage(userId, documentId, result.markdown)

    // Stage 3: Handle manual review if requested
    if (this.options.reviewBeforeChunking || this.options.reviewDoclingExtraction) {
      await this.pauseForReview(documentId, userId, result)
      return // Exit early - will resume after review
    }

    // Stage 4: Save chunks to database
    await this.updateProgress(60, 'database', 'Saving chunks')
    await this.saveChunksToDatabase(documentId, userId, result)

    // Stage 5: Update document metadata
    await this.updateProgress(75, 'metadata', 'Updating metadata')
    await this.updateDocumentMetadata(documentId, result)

    // Stage 5.5: Optional Metadata Enrichment (75-85%)
    if (this.options.enrichChunks !== false) {
      await this.updateProgress(75, 'enrichment', 'Enriching chunks with metadata')
      await this.enrichChunks(documentId)
    } else {
      console.log('[DocumentProcessing] Skipping metadata enrichment (user opted out)')

      // Mark chunks as skipped
      const enrichmentManager = new ChunkEnrichmentManager(this.supabase, this.jobId)
      await enrichmentManager.markChunksAsUnenriched(documentId, 'user_choice')

      // Auto-skip connections if enrichment skipped
      if (this.options.detectConnections !== false) {
        console.log('[DocumentProcessing] Auto-skipping connections (enrichment required)')
        this.options.detectConnections = false
      }
    }

    // Stage 6: Optional Connection Detection (85-95%)
    if (this.options.detectConnections !== false) {
      await this.updateProgress(85, 'connections', 'Detecting connections')
      await this.detectConnections(documentId)
    } else {
      console.log('[DocumentProcessing] Skipping connection detection (user opted out)')

      // Mark chunks as skipped
      const connectionManager = new ConnectionDetectionManager(this.supabase, this.jobId)
      await connectionManager.markChunksAsSkipped(this.options.documentId, 'user_choice')
    }

    // Stage 7: Mark complete
    await this.markComplete({
      documentId,
      chunkCount: result.chunks.length,
      wordCount: result.wordCount
    })

    console.log(`✅ Document processing complete: ${documentId}`)
  }

  /**
   * Get processing result from checkpoint, cache, or fresh AI processing.
   */
  private async getProcessingResult(sourceType: SourceType): Promise<ProcessResult> {
    // Try checkpoint first
    const checkpoint = await this.tryResumeFromCheckpoint()
    if (checkpoint) {
      console.log(`♻️  Using checkpoint data from paused job`)
      return {
        markdown: checkpoint.data.markdown || checkpoint.data.cleaned_markdown || '',
        chunks: checkpoint.data.chunks || [],
        metadata: checkpoint.data.metadata,
        wordCount: checkpoint.data.word_count || checkpoint.data.wordCount,
        outline: checkpoint.data.outline
      }
    }

    // Try cache second
    const cached = await this.getCachedResult()
    if (cached) {
      console.log(`♻️  Using cached processing result (saved ~$0.40)`)
      return cached
    }

    // No cache/checkpoint - run fresh AI processing
    console.log(`🤖 No cache found, running AI processing`)
    return await this.processWithAI(sourceType)
  }

  /**
   * Try to resume from checkpoint.
   */
  private async tryResumeFromCheckpoint(): Promise<{ stage: string; data: any } | null> {
    const job = await this.getJob()
    if (!job.resume_count || !job.last_checkpoint_path) {
      return null
    }

    try {
      const blob = await this.storage.download(job.last_checkpoint_path)
      const checkpointText = await blob.text()
      const checkpointData = JSON.parse(checkpointText)

      // Validate hash
      const currentHash = createHash('sha256')
        .update(checkpointText)
        .digest('hex')
        .substring(0, 16)

      if (job.checkpoint_hash && currentHash !== job.checkpoint_hash) {
        console.warn(`[Resume] Checkpoint hash mismatch - falling back to fresh processing`)
        return null
      }

      console.log(`[Resume] ✓ Checkpoint loaded: ${job.last_checkpoint_stage}`)
      return {
        stage: job.last_checkpoint_stage,
        data: checkpointData
      }
    } catch (error) {
      console.error(`[Resume] Failed to load checkpoint:`, error)
      return null
    }
  }

  /**
   * Get cached result from previous attempt.
   */
  private async getCachedResult(): Promise<ProcessResult | null> {
    const job = await this.getJob()
    const cached = job.metadata?.cached_chunks

    if (!cached || !job.metadata?.cached_markdown) {
      return null
    }

    return {
      markdown: job.metadata.cached_markdown,
      chunks: job.metadata.cached_chunks,
      metadata: job.metadata.cached_metadata,
      wordCount: job.metadata.cached_word_count,
      outline: job.metadata.cached_outline
    }
  }

  /**
   * Process document with AI (fresh processing).
   */
  private async processWithAI(sourceType: SourceType): Promise<ProcessResult> {
    const job = await this.getJob()
    const processor = ProcessorRouter.createProcessor(sourceType, this.ai, this.supabase, job)

    // Start cancellation check heartbeat
    const cancellationCheck = this.startCancellationCheck()

    try {
      console.log(`🚀 Starting processing with ${processor.constructor.name}`)
      const result = await processor.process()

      // Check if cancelled
      if (cancellationCheck.wasCancelled()) {
        throw new Error('Job was cancelled during processing')
      }

      // Cache immediately for retry safety
      await this.cacheProcessingResult(result)

      return result
    } finally {
      cancellationCheck.stop()
    }
  }

  /**
   * Start cancellation check heartbeat.
   */
  private startCancellationCheck() {
    let cancelled = false
    let heartbeatCount = 0
    const INTERVAL = 10 * 1000 // 10 seconds
    const UPDATE_EVERY = 30 // Update timestamp every 5 minutes

    const interval = setInterval(async () => {
      heartbeatCount++

      try {
        const job = await this.getJob()
        if (job.status === 'cancelled') {
          console.log('[Heartbeat] Job cancelled - stopping processing')
          cancelled = true
          clearInterval(interval)
          return
        }

        // Update timestamp to prevent stale detection
        if (heartbeatCount % UPDATE_EVERY === 0) {
          await this.supabase
            .from('background_jobs')
            .update({ started_at: new Date().toISOString() })
            .eq('id', this.jobId)
        }
      } catch (error) {
        console.error('[Heartbeat] Check failed:', error)
      }
    }, INTERVAL)

    return {
      wasCancelled: () => cancelled,
      stop: () => clearInterval(interval)
    }
  }

  /**
   * Cache processing result for retry safety.
   */
  private async cacheProcessingResult(result: ProcessResult): Promise<void> {
    console.log(`💾 Caching processing result (${result.chunks.length} chunks)`)

    await this.supabase
      .from('background_jobs')
      .update({
        metadata: {
          cached_chunks: result.chunks,
          cached_markdown: result.markdown,
          cached_metadata: result.metadata,
          cached_word_count: result.wordCount,
          cached_outline: result.outline,
          cache_created_at: new Date().toISOString(),
          processing_stage: 'extracted',
          completed_stages: ['extracting']
        }
      })
      .eq('id', this.jobId)
  }

  /**
   * Save markdown to storage.
   */
  private async saveMarkdownToStorage(userId: string, documentId: string, markdown: string): Promise<void> {
    const markdownPath = `${userId}/${documentId}/content.md`
    const markdownBlob = new Blob([markdown], { type: 'text/markdown' })

    await this.storage.upload(markdownPath, markdownBlob, {
      contentType: 'text/markdown',
      upsert: true
    })

    // Update markdown_path in database
    await this.supabase
      .from('documents')
      .update({ markdown_path: markdownPath })
      .eq('id', documentId)

    console.log(`✅ Markdown saved: ${markdownPath}`)
  }

  /**
   * Pause for manual review.
   */
  private async pauseForReview(documentId: string, userId: string, result: ProcessResult): Promise<void> {
    const isDoclingReview = this.options.reviewDoclingExtraction && result.chunks.length === 0
    const reviewStage = isDoclingReview ? 'docling_extraction' : 'ai_cleanup'

    console.log(`[Review] Pausing for ${reviewStage} review`)

    try {
      // Export to Obsidian and capture URI
      const { exportToObsidian } = await import('../../handlers/obsidian-sync.js')
      const exportResult = await exportToObsidian(documentId, userId)

      console.log(`[Review] Export result:`, {
        success: exportResult.success,
        hasUri: !!exportResult.uri,
        hasPath: !!exportResult.path,
        uri: exportResult.uri,
        error: exportResult.error
      })

      // Check if export succeeded
      if (!exportResult.success) {
        console.error(`[Review] Obsidian export failed: ${exportResult.error}`)
        throw new Error(`Obsidian export failed: ${exportResult.error}`)
      }

      // Update document status with markdown_available since it's uploaded
      console.log(`[Review] Updating document status...`)
      await this.supabase
        .from('documents')
        .update({
          processing_status: 'awaiting_manual_review',
          review_stage: reviewStage,
          markdown_available: true,  // ✅ Markdown is uploaded, set flag
          obsidian_path: exportResult.path || null  // ✅ Store Obsidian path
        })
        .eq('id', documentId)

      console.log(`[Review] Document updated, marking job complete...`)

      // Mark job as complete with Obsidian URI for UI
      await this.updateProgress(100, 'review', 'Awaiting manual review')
      await this.markComplete({
        obsidianUri: exportResult.uri || null,
        obsidianPath: exportResult.path || null,
        reviewStage,
        status: 'awaiting_manual_review'
      })

      console.log(`[Review] ✓ Job marked complete with URI: ${exportResult.uri}`)

    } catch (error) {
      console.error(`[Review] ❌ Error in pauseForReview:`, error)
      throw error
    }
  }

  /**
   * Save chunks to database.
   */
  private async saveChunksToDatabase(documentId: string, userId: string, result: ProcessResult): Promise<void> {
    // Prepare chunks for insertion
    const chunksToInsert = result.chunks.map((chunk, index) => ({
      document_id: documentId,
      content: chunk.content,
      chunk_index: chunk.chunk_index ?? index,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      word_count: chunk.word_count,

      // AI metadata
      themes: chunk.themes,
      importance_score: chunk.importance_score,
      summary: chunk.summary,
      emotional_metadata: chunk.emotional_metadata,
      conceptual_metadata: chunk.conceptual_metadata,
      domain_metadata: chunk.domain_metadata,
      metadata_extracted_at: chunk.metadata_extracted_at,

      // Docling structural metadata (PDF/EPUB)
      heading_path: chunk.heading_path,
      heading_level: chunk.heading_level,
      section_marker: chunk.section_marker,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      bboxes: (chunk as any).bboxes,
      position_confidence: (chunk as any).position_confidence,
      position_method: (chunk as any).position_method,
      position_validated: (chunk as any).position_validated,

      // Chonkie metadata (from metadata transfer)
      chunker_type: (chunk as any).chunker_type,
      token_count: (chunk as any).token_count,
      metadata_overlap_count: (chunk as any).metadata_overlap_count,
      metadata_confidence: (chunk as any).metadata_confidence,
      metadata_interpolated: (chunk as any).metadata_interpolated,

      // Embeddings (generated by processor)
      embedding: (chunk as any).embedding

      // Note: user_id comes from documents table via RLS, not stored in chunks
      // Note: is_current defaults to true
    }))

    // Insert chunks
    const { error } = await this.supabase
      .from('chunks')
      .insert(chunksToInsert)

    if (error) {
      throw new Error(`Failed to save chunks: ${error.message}`)
    }

    console.log(`✅ Saved ${chunksToInsert.length} chunks to database`)

    // Save to storage for portability
    await saveToStorage(
      this.supabase,
      `${userId}/${documentId}/chunks.json`,
      { version: '1.0', chunks: result.chunks }
    )
  }

  /**
   * Update document metadata.
   */
  private async updateDocumentMetadata(documentId: string, result: ProcessResult): Promise<void> {
    await this.supabase
      .from('documents')
      .update({
        title: result.metadata?.title,
        author: result.metadata?.author,
        word_count: result.wordCount,
        outline: result.outline,
        metadata: result.metadata,
        processing_completed_at: new Date().toISOString(),
        processing_status: 'completed',
        markdown_available: true,
        embeddings_available: true
      })
      .eq('id', documentId)
  }

  /**
   * Enrich chunks with metadata using bulletproof extraction.
   */
  private async enrichChunks(documentId: string): Promise<void> {
    try {
      const enrichmentManager = new ChunkEnrichmentManager(this.supabase, this.jobId)

      await enrichmentManager.enrichChunks({
        documentId,
        onProgress: async (percent, stage, details) => {
          await this.updateProgress(75 + (percent / 10), stage, details)
        }
      })
    } catch (error: any) {
      console.error(`Chunk enrichment failed: ${error.message}`)
      // Non-fatal: Continue to next stage even if enrichment fails
    }
  }

  /**
   * Run connection detection.
   */
  private async detectConnections(documentId: string): Promise<void> {
    try {
      await orchestrateConnections(documentId, {
        enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
        onProgress: async (percent, stage, details) => {
          await this.updateProgress(85 + (percent / 10), stage, details)
        }
      })
    } catch (error: any) {
      console.error(`Connection detection failed: ${error.message}`)
      // Don't fail the whole job if connections fail
    }
  }

}
