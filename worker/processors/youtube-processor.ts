/**
 * YouTube Processor with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Specialized 9-stage processing flow
 * 1. Transcript Fetching (10-20%) - YouTube API extraction
 * 2. AI Cleaning (20-30%) - Transcript formatting
 * 3. Chonkie Chunking (30-40%) - User-selected strategy (9 options)
 * 4. Fuzzy Positioning (40-50%) - Map chunks to original transcript for timestamps
 * 5. Metadata Enrichment (50-75%) - PydanticAI + Ollama
 * 6. Local Embeddings (75-90%) - Transformers.js
 * 7. Finalize (90-100%) - Storage + manifest
 *
 * Special Features:
 * - Preserves YouTube timestamps via fuzzy matching
 * - Graceful degradation if AI cleaning fails
 * - Document-level timestamp storage for clickable links
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../lib/youtube.js'
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'
import { fuzzyMatchChunkToSource } from '../lib/fuzzy-matching.js'
import { GEMINI_MODEL } from '../lib/model-config.js'
// Chonkie Integration
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'
// Local metadata enrichment
import { extractMetadataBatch, type ChunkInput } from '../lib/chunking/pydantic-metadata.js'
// Local embeddings
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
// Storage
import { hashMarkdown } from '../lib/cached-chunks.js'
// Statistics
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

/**
 * Processes YouTube videos by fetching transcripts, cleaning with AI,
 * and creating semantic chunks.
 *
 * Timestamps are stored at document level in source_metadata, not at chunk level.
 */
export class YouTubeProcessor extends SourceProcessor {
  /**
   * Process YouTube video through Chonkie pipeline with fuzzy positioning.
   * @returns Processed markdown, chunks, and source_metadata with timestamps
   */
  async process(): Promise<ProcessResult> {
    // Start heartbeat for UI pulse indicator
    this.startHeartbeat()

    try {
      const sourceUrl = this.job.input_data.source_url as string | undefined
      if (!sourceUrl) {
        throw this.createError('Source URL required for YouTube processing', 'YOUTUBE_MISSING_URL')
      }

      // Stage 1: Transcript fetching (10-20%)
      await this.updateProgress(10, 'download', 'fetching', 'Fetching YouTube transcript')

      const videoId = extractVideoId(sourceUrl)
      if (!videoId) {
        throw this.createError('Invalid YouTube URL format', 'YOUTUBE_INVALID_ID')
      }

      // Fetch transcript with retry logic
      const transcript = await this.withRetry(
        () => fetchTranscriptWithRetry(videoId),
        'fetch_transcript'
      )

      const rawMarkdown = formatTranscriptToMarkdown(transcript, sourceUrl)

      console.log(`[YouTubeProcessor] Fetched transcript: ${rawMarkdown.length} characters`)
      await this.updateProgress(20, 'download', 'complete', 'Transcript fetched successfully')

      // Stage 2: AI cleaning (20-30%)
      await this.updateProgress(23, 'extract', 'cleaning', 'Cleaning transcript with AI')
      console.log('[YouTubeProcessor] Calling cleanYoutubeTranscript, markdown length:', rawMarkdown.length)

      const cleaningResult = await cleanYoutubeTranscript(this.ai, rawMarkdown)
      console.log('[YouTubeProcessor] Cleaning result:', {
        success: cleaningResult.success,
        cleanedLength: cleaningResult.cleaned.length,
        error: cleaningResult.error
      })

      let markdown: string
      if (cleaningResult.success) {
        markdown = cleaningResult.cleaned
        await this.updateProgress(30, 'extract', 'cleaned', 'Transcript cleaned successfully')
      } else {
        // Graceful degradation: use original markdown
        markdown = rawMarkdown
        console.warn(`[YouTubeProcessor] AI cleaning failed for ${videoId}, using original transcript:`, cleaningResult.error)
        await this.updateProgress(30, 'extract', 'warning',
          `Cleaning failed: ${cleaningResult.error}. Using original transcript.`)
      }

      // Checkpoint 1: Save cleaned markdown
      await this.saveStageResult('cleanup', { markdown, raw_markdown: rawMarkdown })

      // Stage 3: Chonkie Chunking (30-40%)
      const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
      const chunkSize = this.job.input_data?.chunkSize as number | undefined
      console.log(`[YouTubeProcessor] Stage 3: Chunking with Chonkie strategy: ${chunkerStrategy}`)

      await this.updateProgress(33, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

      const chonkieChunks = await chunkWithChonkie(markdown, {
        chunker_type: chunkerStrategy,
        ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
        timeout: 300000
      })

      console.log(`[YouTubeProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
      await this.updateProgress(40, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

      // Stage 4: Fuzzy Positioning (40-50%)
      // CRITICAL: Map chunks back to original transcript for accurate character offsets and timestamps
      await this.updateProgress(43, 'positioning', 'processing', 'Applying fuzzy position matching')

      let highConfidenceCount = 0
      let exactMatchCount = 0
      let approximateCount = 0

      // Convert Chonkie chunks with fuzzy-matched offsets
      let finalChunks: ProcessedChunk[] = chonkieChunks.map((chunk, index) => {
        // Match chunk to source for position data (uses raw markdown for timestamp accuracy)
        const matchResult = fuzzyMatchChunkToSource(chunk.text, rawMarkdown, index, chonkieChunks.length)

        // Track match quality metrics
        if (matchResult.method === 'exact') exactMatchCount++
        if (matchResult.confidence >= 0.7) highConfidenceCount++
        if (matchResult.method === 'approximate') approximateCount++

        return {
          document_id: this.job.document_id,
          chunk_index: index,
          content: chunk.text,
          start_offset: matchResult.startOffset,  // Fuzzy-matched offsets for timestamps
          end_offset: matchResult.endOffset,
          token_count: chunk.token_count || 0,
          word_count: chunk.text.split(/\s+/).length,
          heading_path: null,
          heading_level: null,
          page_start: null,
          page_end: null,
          section_marker: null,
          bboxes: null,
          metadata_overlap_count: 0,
          metadata_confidence: 'none',
          metadata_interpolated: false,
          themes: [],
          importance_score: 0.5,
          summary: null,
          emotional_metadata: null,
          conceptual_metadata: null,
          domain_metadata: null,
          metadata_extracted_at: null
        }
      })

      // Report positioning quality
      const positioningQuality = {
        exact: exactMatchCount,
        highConfidence: highConfidenceCount,
        approximate: approximateCount,
        total: chonkieChunks.length
      }

      console.log('[YouTubeProcessor] Positioning quality:', positioningQuality)
      await this.updateProgress(50, 'positioning', 'complete',
        `Positioned ${highConfidenceCount}/${chonkieChunks.length} chunks with high confidence`)

      // Checkpoint 2: Save chunks with positions
      await this.saveStageResult('positioning', finalChunks)

      // Log chunk statistics
      const chunkingStats = calculateChunkStatistics(finalChunks, 512)
      logChunkStatistics(chunkingStats, 'YouTube Transcript Chunks (After Chonkie + Fuzzy Positioning)')

      // Stage 5: Metadata Enrichment (50-75%)
      console.log('[YouTubeProcessor] Stage 5: Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(53, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[YouTubeProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, _total) => {
              const overallProgress = 53 + Math.floor(((i + processed) / finalChunks.length) * 22)
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
              console.warn(`[YouTubeProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk)
            }
          }

          const progress = 53 + Math.floor(((i + batch.length) / finalChunks.length) * 22)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        finalChunks = enrichedChunks

        console.log(`[YouTubeProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(75, 'metadata', 'complete', 'Metadata enrichment done')

        // Checkpoint 3: Save enriched chunks
        await this.saveStageResult('metadata', finalChunks, { final: true })

      } catch (error: any) {
        console.error(`[YouTubeProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[YouTubeProcessor] Continuing with default metadata')
        await this.updateProgress(75, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 6: Local Embeddings (75-90%)
      console.log('[YouTubeProcessor] Stage 6: Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(78, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        const chunkTexts = finalChunks.map(chunk => chunk.content)

        console.log(`[YouTubeProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)

        const startTime = Date.now()
        const embeddings = await generateEmbeddingsLocal(chunkTexts)
        const embeddingTime = Date.now() - startTime

        console.log(`[YouTubeProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[YouTubeProcessor] Embeddings attached to all chunks')
        await this.updateProgress(90, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[YouTubeProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[YouTubeProcessor] Falling back to Gemini embeddings')

        try {
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[YouTubeProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(90, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[YouTubeProcessor] Gemini embeddings also failed: ${fallbackError.message}`)
          await this.updateProgress(90, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

      // Stage 7: Finalize (90-100%)
      console.log('[YouTubeProcessor] Stage 7: Finalizing document processing')
      await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

      // Checkpoint 4: Save final chunks
      await this.saveStageResult('chunks', finalChunks, { final: true })

      // Build YouTube source metadata for document-level storage
      // This includes original transcript segments with timestamps
      const source_metadata = {
        videoId: videoId,
        videoUrl: sourceUrl,
        duration: transcript.reduce((total, seg) => Math.max(total, seg.offset + seg.duration), 0),
        isTranscript: true as const,
        timestamps: transcript.map(seg => ({
          start_seconds: seg.offset,
          end_seconds: seg.offset + seg.duration,
          text: seg.text
        }))
      }

      // Checkpoint 5: Save manifest
      const manifestData = {
        document_id: this.job.document_id,
        processing_mode: 'local',
        source_type: 'youtube',
        source_url: sourceUrl,
        files: {
          'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
          'metadata.json': { size: markdown.length, type: 'final' },
          'manifest.json': { size: 0, type: 'final' }
        },
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).filter(word => word.length > 0).length,
        processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
        markdown_hash: hashMarkdown(markdown),
        chunker_strategy: chunkerStrategy,
        positioning_quality: positioningQuality
      }
      await this.saveStageResult('manifest', manifestData, { final: true })

      await this.updateProgress(100, 'finalize', 'complete', 'YouTube transcript processed successfully')

      // Prepare result with complete metadata
      return {
        markdown,
        chunks: finalChunks,
        outline: undefined,
        wordCount: markdown.split(/\s+/).filter(word => word.length > 0).length,
        metadata: {
          source_metadata,
          extra: {
            source_type: 'youtube',
            video_id: videoId,
            url: sourceUrl,
            cleaning_applied: cleaningResult.success,
            positioning_quality: positioningQuality,
            timestamp_count: transcript.length,
            chunker_strategy: chunkerStrategy
          }
        }
      }

    } catch (error: any) {
      // Handle YouTube-specific errors with user-friendly messages
      if (error.message?.includes('YOUTUBE_TRANSCRIPT_DISABLED')) {
        throw this.createError(
          'Transcripts are disabled for this video. You can paste the transcript manually.',
          'YOUTUBE_TRANSCRIPT_DISABLED'
        )
      }
      if (error.message?.includes('YOUTUBE_PRIVATE')) {
        throw this.createError(
          'This video is private or restricted.',
          'YOUTUBE_PRIVATE'
        )
      }
      if (error.message?.includes('YOUTUBE_RATE_LIMIT')) {
        throw this.createError(
          'YouTube rate limit reached. Please try again in a few minutes.',
          'YOUTUBE_RATE_LIMIT'
        )
      }

      // Re-throw with context
      throw this.createError(
        `YouTube processing failed: ${error.message}`,
        'YOUTUBE_PROCESSING_ERROR',
        error
      )
    } finally {
      // Always stop heartbeat
      this.stopHeartbeat()
    }
  }

  /**
   * Create standardized error with code.
   * @param message - Error message for display
   * @param code - Error code for routing
   * @param originalError - Original error for debugging
   */
  private createError(message: string, code: string, originalError?: any): Error {
    const error = new Error(message) as any
    error.code = code
    if (originalError) {
      error.stack = originalError.stack
      console.error(`${code}:`, originalError)
    }
    return error
  }
}
