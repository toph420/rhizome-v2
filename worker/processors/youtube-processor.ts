/**
 * YouTube transcript processor with AI-powered cleaning and fuzzy positioning.
 * Handles 7-stage processing pipeline for extracting and enhancing YouTube content.
 * 
 * Pipeline stages:
 * 1. Transcript fetching (10-15%)
 * 2. Original backup (15-20%) 
 * 3. AI cleaning (20-25%)
 * 4. Semantic rechunking (25-80%)
 * 5. Fuzzy positioning (80-90%)
 * 6. Embeddings generation (90-95%)
 * 7. Storage (95-100%)
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../lib/youtube.js'
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'
import { fuzzyMatchChunkToSource } from '../lib/fuzzy-matching.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
import type { MetadataExtractionProgress } from '../types/ai-metadata.js'
import { GEMINI_MODEL } from '../lib/model-config.js'

/**
 * Processes YouTube videos by fetching transcripts, cleaning with AI,
 * and creating semantic chunks.
 *
 * Timestamps are stored at document level in source_metadata, not at chunk level.
 */
export class YouTubeProcessor extends SourceProcessor {
  /**
   * Process YouTube video through 7-stage pipeline.
   * @returns Processed markdown, chunks, and source_metadata with timestamps
   */
  async process(): Promise<ProcessResult> {
    try {
      const sourceUrl = this.job.input_data.source_url as string | undefined
      if (!sourceUrl) {
        throw this.createError('Source URL required for YouTube processing', 'YOUTUBE_MISSING_URL')
      }

      // Stage 1: Transcript fetching (10-15%)
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
      
      // Stage 2: Prepare for AI cleaning (15-20%)
      await this.updateProgress(20, 'download', 'complete', 'Transcript fetched successfully')
      
      // Stage 3: AI cleaning (20-25%)
      await this.updateProgress(20, 'extract', 'cleaning', 'Cleaning transcript with AI')
      console.log('🧹 DEBUG: Calling cleanYoutubeTranscript, markdown length:', rawMarkdown.length)
      
      const cleaningResult = await cleanYoutubeTranscript(this.ai, rawMarkdown)
      console.log('✨ DEBUG: Cleaning result:', { 
        success: cleaningResult.success, 
        cleanedLength: cleaningResult.cleaned.length, 
        error: cleaningResult.error 
      })
      
      let markdown: string
      if (cleaningResult.success) {
        markdown = cleaningResult.cleaned
        await this.updateProgress(25, 'extract', 'cleaned', 'Transcript cleaned successfully')
      } else {
        // Graceful degradation: use original markdown
        markdown = rawMarkdown
        console.warn(`AI cleaning failed for ${videoId}, using original transcript:`, cleaningResult.error)
        await this.updateProgress(25, 'extract', 'warning', 
          `Cleaning failed: ${cleaningResult.error}. Using original transcript.`)
      }
      
      // Stage 4: AI metadata extraction with chunking (25-90%)
      await this.updateProgress(30, 'extract', 'ai-metadata', 'Processing with AI metadata extraction')

      console.log(`[YouTubeProcessor] Using AI metadata extraction for ${markdown.length} character transcript`)

      const aiChunks = await batchChunkAndExtractMetadata(
        markdown,
        {
          apiKey: process.env.GOOGLE_AI_API_KEY,
          modelName: GEMINI_MODEL,
          enableProgress: true
        },
        async (progress: MetadataExtractionProgress) => {
          // Map AI extraction progress to overall progress (30-85%)
          const aiProgressPercent = (progress.batchesProcessed + 1) / progress.totalBatches
          const overallPercent = 30 + Math.floor(aiProgressPercent * 55)

          await this.updateProgress(
            overallPercent,
            'extract',
            progress.phase,
            `AI extraction: batch ${progress.batchesProcessed + 1}/${progress.totalBatches} (${progress.chunksIdentified} chunks identified)`
          )
        }
      )

      await this.updateProgress(85, 'extract', 'chunked', `Created ${aiChunks.length} semantic chunks with AI metadata`)

      // Stage 5: Fuzzy positioning (85-90%)
      // Match chunks back to original source for accurate character offsets
      await this.updateProgress(87, 'extract', 'positioning', 'Applying fuzzy position matching')

      let highConfidenceCount = 0
      let exactMatchCount = 0
      let approximateCount = 0

      // Convert AI chunks to ProcessedChunk format with fuzzy-matched offsets
      const enhancedChunks = aiChunks.map((aiChunk, i) => {
        // Match chunk to source for position data
        const matchResult = fuzzyMatchChunkToSource(aiChunk.content, rawMarkdown, i, aiChunks.length)

        // Track match quality metrics
        if (matchResult.method === 'exact') exactMatchCount++
        if (matchResult.confidence >= 0.7) highConfidenceCount++
        if (matchResult.method === 'approximate') approximateCount++

        // Build enhanced chunk with AI metadata + fuzzy-matched offsets
        // NOTE: Timestamps are NOT stored at chunk level - they're in document.source_metadata
        // NOTE: document_id is added by process-document handler, not here
        return this.mapAIChunkToDatabase({
          ...aiChunk,
          chunk_index: i,
          // Override with fuzzy-matched offsets (more accurate for YouTube)
          start_offset: matchResult.startOffset,
          end_offset: matchResult.endOffset
        }) as ProcessedChunk
      })

      // Report positioning quality
      const positioningQuality = {
        exact: exactMatchCount,
        highConfidence: highConfidenceCount,
        approximate: approximateCount,
        total: aiChunks.length
      }

      console.log('📍 Positioning quality:', positioningQuality)
      await this.updateProgress(90, 'extract', 'positioned',
        `Positioned ${highConfidenceCount}/${aiChunks.length} chunks with high confidence`)
      
      // Note: Stages 7 (embeddings) and 8 (storage) are handled by the main handler
      // This processor returns the prepared data for those final stages

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

      // Prepare result with complete metadata
      return {
        markdown,
        chunks: enhancedChunks,
        outline: undefined, // TODO: Convert to OutlineSection[] format
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
            usedAIMetadata: true
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