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
import type { ProcessResult } from '../types/processor.js'
import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../lib/youtube.js'
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'
// rechunkMarkdown will be imported from main handler or extracted to lib
import { extractTimestampsWithContext } from '../lib/markdown-chunking.js'
import { fuzzyMatchChunkToSource } from '../lib/fuzzy-matching.js'
import type { TimestampContext } from '../types/multi-format.js'

/**
 * Processes YouTube videos by fetching transcripts, cleaning with AI,
 * and creating semantic chunks with timestamp preservation.
 */
export class YouTubeProcessor extends SourceProcessor {
  /**
   * Process YouTube video through 7-stage pipeline.
   * @returns Processed markdown and chunks with timestamps and metadata
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
      
      // Stage 2: Save original transcript (15-20%)
      await this.updateProgress(15, 'download', 'saving', 'Saving original transcript')
      const storagePath = this.getStoragePath()
      console.log('💾 DEBUG: Saving source-raw.md to:', `${storagePath}/source-raw.md`)
      
      const rawBlob = new Blob([rawMarkdown], { type: 'text/markdown' })
      await this.uploadToStorage('source-raw.md', rawBlob, 'text/markdown')
      
      await this.updateProgress(20, 'download', 'complete', 'Original transcript saved')
      
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
      
      // Stage 4: Semantic chunking (25-80%)
      await this.updateProgress(30, 'extract', 'chunking', 'Creating semantic chunks with metadata')
      
      // TODO: Extract rechunkMarkdown from main handler to lib
      const chunks = await this.rechunkMarkdown(markdown)
      
      // Progress tracking for chunking completion
      await this.updateProgress(80, 'extract', 'chunked', `Created ${chunks.length} semantic chunks`)
      
      // Stage 5: Fuzzy positioning (80-90%)
      // Match chunks back to original source for position context
      await this.updateProgress(85, 'extract', 'positioning', 'Applying fuzzy position matching')
      
      const enhancedChunks = []
      let highConfidenceCount = 0
      let exactMatchCount = 0
      let approximateCount = 0
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        
        // Match chunk to source for position data
        const matchResult = fuzzyMatchChunkToSource(chunk.content, rawMarkdown, i, chunks.length)
        
        // Extract timestamps if present
        const timestamps = extractTimestampsWithContext(chunk.content)
        
        // Build enhanced chunk with position context
        const enhancedChunk = {
          ...chunk,
          start_offset: matchResult.startOffset,
          end_offset: matchResult.endOffset,
          position_context: {
            method: matchResult.method,
            confidence: matchResult.confidence,
            originalSnippet: matchResult.contextBefore + '...' + matchResult.contextAfter,
            ...(timestamps.length > 0 && { timestamps })
          }
        }
        
        enhancedChunks.push(enhancedChunk)
        
        // Track match quality metrics
        if (matchResult.method === 'exact') exactMatchCount++
        if (matchResult.confidence >= 0.7) highConfidenceCount++
        if (matchResult.method === 'approximate') approximateCount++
      }
      
      // Report positioning quality
      const positioningQuality = {
        exact: exactMatchCount,
        highConfidence: highConfidenceCount,
        approximate: approximateCount,
        total: chunks.length
      }
      
      console.log('📍 Positioning quality:', positioningQuality)
      await this.updateProgress(90, 'extract', 'positioned', 
        `Positioned ${highConfidenceCount}/${chunks.length} chunks with high confidence`)
      
      // Note: Stages 6 (embeddings) and 7 (storage) are handled by the main handler
      // This processor returns the prepared data for those final stages
      
      // Prepare result with complete metadata
      return {
        markdown,
        chunks: enhancedChunks,
        outline: undefined, // TODO: Convert to OutlineSection[] format
        wordCount: markdown.split(/\s+/).filter(word => word.length > 0).length,
        metadata: {
          extra: {
            source_type: 'youtube',
          video_id: videoId,
          url: sourceUrl,
          cleaning_applied: cleaningResult.success,
          positioning_quality: positioningQuality,
          timestamp_count: enhancedChunks.reduce((count, chunk) => 
            count + (chunk.position_context?.timestamps?.length || 0), 0)
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
   * Extract document outline from markdown content.
   * TODO: Update to return OutlineSection[] format
   * @param markdown - The markdown content to extract outline from
   * @returns Array of heading strings representing document structure
   */
  private extractOutline(markdown: string): string[] {
    const headings: string[] = []
    const lines = markdown.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#')) {
        // Extract heading text without the # symbols
        const match = trimmed.match(/^#+\s+(.+)/)
        if (match) {
          headings.push(match[1])
        }
      }
    }
    
    return headings
  }

  /**
   * Temporary rechunkMarkdown implementation.
   * TODO: Extract this from main handler to lib/semantic-chunking.ts
   */
  private async rechunkMarkdown(markdown: string): Promise<any[]> {
    // For now, simple chunking by paragraphs as placeholder
    // Real implementation will use Gemini for semantic chunking
    const chunks = []
    const paragraphs = markdown.split('\n\n').filter(p => p.trim())
    
    for (let i = 0; i < paragraphs.length; i++) {
      chunks.push({
        content: paragraphs[i],
        chunk_index: i,
        themes: [],
        importance: 5,
        summary: paragraphs[i].substring(0, 100)
      })
    }
    
    return chunks
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

  /**
   * Extract timestamps array if they exist in the chunk metadata.
   * Helper for accessing timestamps in a type-safe way.
   */
  private extractTimestamps(chunk: any): TimestampContext[] | undefined {
    return chunk.timestamps as TimestampContext[] | undefined
  }
}