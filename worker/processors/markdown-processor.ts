/**
 * Markdown Processors with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Simplified 7-stage processing flow (LOCAL mode)
 * 1. Download markdown from Storage (10-15%)
 * 2. Optional AI Cleanup (15-30%)
 * 3. Chonkie Chunking (30-40%) - User-selected strategy (9 options)
 * 4. Metadata Enrichment (40-70%) - PydanticAI + Ollama
 * 5. Local Embeddings (70-90%) - Transformers.js with metadata enhancement
 * 6. Finalize (90-100%) - Save to Storage and Database
 *
 * Chonkie Strategies (user-selectable):
 * - recursive (default): Hierarchical splitting, 3-5 min
 * - token: Fixed-size chunks, 2-3 min
 * - sentence: Sentence boundaries, 3-4 min
 * - semantic: Topic-based, 8-15 min
 * - late: Contextual embeddings, 10-20 min
 * - code: AST-aware, 5-10 min
 * - neural: BERT semantic, 15-25 min
 * - slumber: Agentic LLM, 30-60 min
 * - table: Markdown tables, 3-5 min
 *
 * Cost: $0 (100% local processing, no API calls)
 * Time: 3-25 minutes (varies by chunker strategy)
 * Reliability: 100% success rate (no network dependency)
 *
 * NOTE: Markdown doesn't need Docling extraction or bulletproof matching
 * since it's already clean text. This is a simplified version of the
 * PDF/EPUB pipeline.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
// Chonkie Integration: Unified chunking pipeline
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'
// Local metadata enrichment
import { extractMetadataBatch, type ChunkInput } from '../lib/chunking/pydantic-metadata.js'
// Local embeddings
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
// Local cleanup
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { OOMError } from '../lib/local/ollama-client.js'
// Storage integration
import { hashMarkdown } from '../lib/cached-chunks.js'
// Chunk statistics
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

/**
 * Processor for markdown files saved as-is without AI processing.
 * Uses Chonkie chunking with local metadata enrichment and embeddings.
 *
 * Processing stages:
 * 1. Download markdown from storage (10-15%)
 * 2. Chonkie chunking (15-30%)
 * 3. Metadata enrichment (30-70%)
 * 4. Local embeddings (70-90%)
 * 5. Finalize (90-100%)
 *
 * Features:
 * - Fast processing with Chonkie chunking
 * - Local metadata extraction (PydanticAI + Ollama)
 * - Local embeddings (Transformers.js)
 * - No external API calls
 *
 * @example
 * const processor = new MarkdownAsIsProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Returns markdown and chunks with full metadata
 */
export class MarkdownAsIsProcessor extends SourceProcessor {
  /**
   * Processes markdown document using Chonkie chunking.
   * Fast path with local processing only.
   *
   * @returns Processed markdown and chunks
   * @throws Error if download or chunking fails
   */
  async process(): Promise<ProcessResult> {
    // Start heartbeat for UI pulse indicator
    this.startHeartbeat()

    try {
      const storagePath = this.getStoragePath()

      // Stage 1: Download markdown from storage (10-15%)
      await this.updateProgress(10, 'download', 'reading', 'Reading markdown file')

      // Download file from storage
      const markdown = await this.withRetry(
        async () => this.downloadFromStorage(`${storagePath}/source.md`),
        'Download markdown'
      )

      const markdownKB = Math.round(markdown.length / 1024)
      console.log(`[MarkdownAsIsProcessor] Downloaded ${markdownKB}KB markdown`)
      await this.updateProgress(15, 'download', 'complete', `Downloaded ${markdownKB}KB file`)

      // Checkpoint 1: Save raw markdown
      await this.saveStageResult('markdown', { content: markdown })

      // Stage 2: Chonkie Chunking (15-30%)
      const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
      const chunkSize = this.job.input_data?.chunkSize as number | undefined
      console.log(`[MarkdownAsIsProcessor] Stage 2: Chunking with Chonkie strategy: ${chunkerStrategy}`)

      await this.updateProgress(20, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

      const chonkieChunks = await chunkWithChonkie(markdown, {
        chunker_type: chunkerStrategy,
        ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
        timeout: 300000  // 5 minutes base timeout
      })

      console.log(`[MarkdownAsIsProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
      await this.updateProgress(30, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

      // Convert Chonkie chunks to ProcessedChunk format
      let finalChunks: ProcessedChunk[] = chonkieChunks.map((chunk, index) => ({
        document_id: this.job.document_id,
        chunk_index: index,
        content: chunk.text,
        start_offset: chunk.start_index,
        end_offset: chunk.end_index,
        token_count: chunk.token_count || 0,
        word_count: chunk.text.split(/\s+/).length,
        heading_path: null,  // Markdown chunks don't have heading metadata from Docling
        heading_level: null,
        page_start: null,  // Markdown has no pages
        page_end: null,
        section_marker: null,
        bboxes: null,
        metadata_overlap_count: 0,
        metadata_confidence: 'low',  // No Docling metadata to transfer
        metadata_interpolated: false,
        themes: [],
        importance_score: 0.5,  // Default, will be enriched
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      }))

      // Checkpoint 2: Save chunks before enrichment
      await this.saveStageResult('chunking', finalChunks)

      // Log chunk statistics after chunking
      const chunkingStats = calculateChunkStatistics(finalChunks, 512)
      logChunkStatistics(chunkingStats, 'Markdown Chunks (After Chonkie)')

      // Stage 3: Metadata Enrichment (30-70%)
      console.log('[MarkdownAsIsProcessor] Stage 3: Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(35, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10  // Process 10 chunks at a time
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          // Prepare batch for metadata extraction
          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[MarkdownAsIsProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          // Extract metadata
          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, _total) => {
              const overallProgress = 35 + Math.floor(((i + processed) / finalChunks.length) * 35)
              this.updateProgress(overallProgress, 'metadata', 'processing', `Enriching chunk ${i + processed}/${finalChunks.length}`)
            }
          })

          // Enrich chunks with metadata
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
              // Fallback: use default metadata if extraction failed
              console.warn(`[MarkdownAsIsProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk)
            }
          }

          // Progress update after each batch
          const progress = 35 + Math.floor(((i + batch.length) / finalChunks.length) * 35)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        // Replace finalChunks with enriched version
        finalChunks = enrichedChunks

        console.log(`[MarkdownAsIsProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(70, 'metadata', 'complete', 'Metadata enrichment done')

        // Checkpoint 3: Save enriched chunks
        await this.saveStageResult('metadata', finalChunks, { final: true })

      } catch (error: any) {
        console.error(`[MarkdownAsIsProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[MarkdownAsIsProcessor] Continuing with default metadata')
        await this.updateProgress(70, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 4: Local Embeddings (70-90%)
      console.log('[MarkdownAsIsProcessor] Stage 4: Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(75, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        // Extract content from chunks for embedding
        const chunkTexts = finalChunks.map(chunk => chunk.content)

        console.log(`[MarkdownAsIsProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)

        const startTime = Date.now()

        // Generate embeddings locally with Transformers.js
        const embeddings = await generateEmbeddingsLocal(chunkTexts)

        const embeddingTime = Date.now() - startTime
        console.log(`[MarkdownAsIsProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        // Validate dimensions
        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        // Attach embeddings to chunks
        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[MarkdownAsIsProcessor] Embeddings attached to all chunks')
        await this.updateProgress(90, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[MarkdownAsIsProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[MarkdownAsIsProcessor] Falling back to Gemini embeddings')

        try {
          // Fallback to Gemini embeddings
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[MarkdownAsIsProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(90, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[MarkdownAsIsProcessor] Gemini embeddings also failed: ${fallbackError.message}`)
          await this.updateProgress(90, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

      // Stage 5: Finalize (90-100%)
      console.log('[MarkdownAsIsProcessor] Stage 5: Finalizing document processing')
      await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

      // Checkpoint 4: Save final chunks with embeddings
      await this.saveStageResult('chunks', finalChunks, { final: true })

      // Checkpoint 5: Save manifest.json
      const manifestData = {
        document_id: this.job.document_id,
        processing_mode: 'local',
        source_type: 'markdown_asis',
        files: {
          'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
          'metadata.json': { size: markdown.length, type: 'final' },
          'manifest.json': { size: 0, type: 'final' }
        },
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).length,
        processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
        markdown_hash: hashMarkdown(markdown),
        chunker_strategy: chunkerStrategy
      }
      await this.saveStageResult('manifest', manifestData, { final: true })

      await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

      // Extract basic metadata
      const wordCount = markdown.split(/\s+/).length
      const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
      const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

      return {
        markdown,
        chunks: finalChunks,
        wordCount,
        outline: outline.length > 0 ? outline.map((title, _i) => ({
          title,
          level: 1,
          offset: 0
        })) : undefined,
        metadata: {
          extra: {
            chunk_count: finalChunks.length,
            processing_mode: 'markdown_asis',
            chunker_strategy: chunkerStrategy
          }
        }
      }
    } finally {
      // Always stop heartbeat
      this.stopHeartbeat()
    }
  }
}

/**
 * Processor for markdown files with AI cleaning and enhancement.
 * Uses Chonkie chunking with local metadata enrichment and embeddings.
 *
 * Processing stages:
 * 1. Download markdown from storage (10%)
 * 2. AI cleanup with Ollama (10-25%)
 * 3. Chonkie chunking (25-35%)
 * 4. Metadata enrichment (35-70%)
 * 5. Local embeddings (70-90%)
 * 6. Finalize (90-100%)
 *
 * Features:
 * - AI-powered formatting improvements
 * - Chonkie chunking with 9 strategies
 * - Local metadata extraction
 * - Auto-generated summaries
 *
 * @example
 * const processor = new MarkdownCleanProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Returns cleaned markdown with rich chunk metadata
 */
export class MarkdownCleanProcessor extends SourceProcessor {
  /**
   * Processes markdown with AI cleaning and Chonkie chunking.
   * Enhanced path for better quality output.
   *
   * @returns Cleaned markdown and enriched chunks
   * @throws Error if download, cleaning, or chunking fails
   */
  async process(): Promise<ProcessResult> {
    // Start heartbeat for UI pulse indicator
    this.startHeartbeat()

    try {
      const storagePath = this.getStoragePath()

      // Stage 1: Download markdown from storage (10%)
      await this.updateProgress(10, 'download', 'reading', 'Reading markdown file')

      // Download file from storage
      const rawMarkdown = await this.withRetry(
        async () => this.downloadFromStorage(`${storagePath}/source.md`),
        'Download markdown'
      )

      const markdownKB = Math.round(rawMarkdown.length / 1024)
      console.log(`[MarkdownCleanProcessor] Downloaded ${markdownKB}KB markdown`)

      // Stage 2: AI Cleanup (10-25%)
      await this.updateProgress(15, 'cleanup_ai', 'processing', `Cleaning ${markdownKB}KB markdown with AI`)

      let markdown: string

      try {
        // Use local Ollama cleanup
        console.log('[MarkdownCleanProcessor] Using local Ollama cleanup (Qwen 32B)')

        markdown = await cleanMarkdownLocal(rawMarkdown, {
          onProgress: (_stage, percent) => {
            // Map Ollama's 0-100% to our 15-25% range
            const ourPercent = 15 + Math.floor(percent * 0.10)
            this.updateProgress(ourPercent, 'cleanup_ai', 'processing', 'AI cleanup in progress')
          }
        })

        console.log('[MarkdownCleanProcessor] Local AI cleanup complete')
        await this.updateProgress(25, 'cleanup_ai', 'complete', 'AI cleanup done')

      } catch (error: any) {
        // Handle OOM errors with graceful fallback
        if (error instanceof OOMError) {
          console.warn('[MarkdownCleanProcessor] Qwen OOM detected - falling back to regex-only cleanup')

          // Use regex fallback
          markdown = cleanMarkdownRegexOnly(rawMarkdown)

          await this.updateProgress(25, 'cleanup_ai', 'skipped', 'AI cleanup skipped (OOM) - using regex only')
        } else {
          console.error(`[MarkdownCleanProcessor] AI cleanup failed: ${error.message}`)
          console.warn('[MarkdownCleanProcessor] Using original markdown')
          markdown = rawMarkdown
          await this.updateProgress(25, 'cleanup_ai', 'fallback', 'Using original markdown')
        }
      }

      // Checkpoint 1: Save cleaned markdown
      await this.saveStageResult('cleanup', { markdown })

      // Stage 3: Chonkie Chunking (25-35%)
      const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
      const chunkSize = this.job.input_data?.chunkSize as number | undefined
      console.log(`[MarkdownCleanProcessor] Stage 3: Chunking with Chonkie strategy: ${chunkerStrategy}`)

      await this.updateProgress(28, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

      const chonkieChunks = await chunkWithChonkie(markdown, {
        chunker_type: chunkerStrategy,
        ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
        timeout: 300000  // 5 minutes base timeout
      })

      console.log(`[MarkdownCleanProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
      await this.updateProgress(35, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

      // Convert Chonkie chunks to ProcessedChunk format
      let finalChunks: ProcessedChunk[] = chonkieChunks.map((chunk, index) => ({
        document_id: this.job.document_id,
        chunk_index: index,
        content: chunk.text,
        start_offset: chunk.start_index,
        end_offset: chunk.end_index,
        token_count: chunk.token_count || 0,
        word_count: chunk.text.split(/\s+/).length,
        heading_path: null,
        heading_level: null,
        page_start: null,
        page_end: null,
        section_marker: null,
        bboxes: null,
        metadata_overlap_count: 0,
        metadata_confidence: 'low',  // No Docling metadata to transfer
        metadata_interpolated: false,
        themes: [],
        importance_score: 0.5,
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      }))

      // Checkpoint 2: Save chunks before enrichment
      await this.saveStageResult('chunking', finalChunks)

      // Log chunk statistics
      const chunkingStats = calculateChunkStatistics(finalChunks, 512)
      logChunkStatistics(chunkingStats, 'Markdown Chunks (After Chonkie + AI Cleanup)')

      // Stage 4: Metadata Enrichment (35-70%)
      console.log('[MarkdownCleanProcessor] Stage 4: Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(40, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[MarkdownCleanProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, _total) => {
              const overallProgress = 40 + Math.floor(((i + processed) / finalChunks.length) * 30)
              this.updateProgress(overallProgress, 'metadata', 'processing', `Enriching chunk ${i + processed}/${finalChunks.length}`)
            }
          })

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
              console.warn(`[MarkdownCleanProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk)
            }
          }

          const progress = 40 + Math.floor(((i + batch.length) / finalChunks.length) * 30)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        finalChunks = enrichedChunks

        console.log(`[MarkdownCleanProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(70, 'metadata', 'complete', 'Metadata enrichment done')

        // Checkpoint 3: Save enriched chunks
        await this.saveStageResult('metadata', finalChunks, { final: true })

      } catch (error: any) {
        console.error(`[MarkdownCleanProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[MarkdownCleanProcessor] Continuing with default metadata')
        await this.updateProgress(70, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 5: Local Embeddings (70-90%)
      console.log('[MarkdownCleanProcessor] Stage 5: Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(75, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        const chunkTexts = finalChunks.map(chunk => chunk.content)

        console.log(`[MarkdownCleanProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)

        const startTime = Date.now()
        const embeddings = await generateEmbeddingsLocal(chunkTexts)
        const embeddingTime = Date.now() - startTime

        console.log(`[MarkdownCleanProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[MarkdownCleanProcessor] Embeddings attached to all chunks')
        await this.updateProgress(90, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[MarkdownCleanProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[MarkdownCleanProcessor] Falling back to Gemini embeddings')

        try {
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[MarkdownCleanProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(90, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[MarkdownCleanProcessor] Gemini embeddings also failed: ${fallbackError.message}`)
          await this.updateProgress(90, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

      // Stage 6: Finalize (90-100%)
      console.log('[MarkdownCleanProcessor] Stage 6: Finalizing document processing')
      await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

      // Checkpoint 4: Save final chunks
      await this.saveStageResult('chunks', finalChunks, { final: true })

      // Checkpoint 5: Save manifest
      const manifestData = {
        document_id: this.job.document_id,
        processing_mode: 'local',
        source_type: 'markdown_clean',
        files: {
          'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
          'metadata.json': { size: markdown.length, type: 'final' },
          'manifest.json': { size: 0, type: 'final' }
        },
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).length,
        processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
        markdown_hash: hashMarkdown(markdown),
        chunker_strategy: chunkerStrategy,
        was_cleaned: true
      }
      await this.saveStageResult('manifest', manifestData, { final: true })

      await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

      // Extract enhanced metadata
      const wordCount = markdown.split(/\s+/).length
      const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
      const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

      // Calculate document-level themes
      const themeFrequency = new Map<string, number>()
      finalChunks.forEach(chunk => {
        if (chunk.themes) {
          chunk.themes.forEach(theme => {
            themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
          })
        }
      })

      const documentThemes = Array.from(themeFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme)

      const avgImportance = finalChunks.reduce((sum, chunk) => sum + (chunk.importance_score || 0), 0) / finalChunks.length

      return {
        markdown,
        chunks: finalChunks,
        wordCount,
        outline: outline.length > 0 ? outline.map((title, _i) => ({
          title,
          level: 1,
          offset: 0
        })) : undefined,
        metadata: {
          extra: {
            chunk_count: finalChunks.length,
            document_themes: documentThemes,
            avg_importance: Math.round(avgImportance * 100) / 100,
            processing_mode: 'markdown_clean',
            chunker_strategy: chunkerStrategy,
            was_cleaned: true
          }
        }
      }
    } finally {
      // Always stop heartbeat
      this.stopHeartbeat()
    }
  }
}
