import { fetchTranscript } from 'youtube-transcript-plus'
import type { TranscriptSegment } from '../types/multi-format.js'
import { ERROR_PREFIXES } from '../types/multi-format.js'

/**
 * Extracts the 11-character video ID from various YouTube URL formats.
 * Supports youtube.com/watch, youtu.be, youtube.com/shorts, and embed URLs.
 * 
 * @param url - YouTube URL in any supported format
 * @returns 11-character video ID or null if URL is invalid
 * 
 * @example
 * extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ') // 'dQw4w9WgXcQ'
 * extractVideoId('https://youtu.be/dQw4w9WgXcQ') // 'dQw4w9WgXcQ'
 * extractVideoId('https://youtube.com/shorts/abc123def45') // 'abc123def45'
 * extractVideoId('invalid-url') // null
 */
export function extractVideoId(url: string): string | null {
  // Regex pattern to match various YouTube URL formats
  // Captures the 11-character video ID from:
  // - youtube.com/watch?v=VIDEO_ID
  // - youtu.be/VIDEO_ID
  // - youtube.com/shorts/VIDEO_ID
  // - youtube.com/embed/VIDEO_ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
  ]
  
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }
  
  return null
}

/**
 * Fetches YouTube transcript with exponential backoff retry logic.
 * Handles rate limits, network errors, and provides structured error messages.
 * 
 * Retry delays: 1s, 2s, 4s (exponential backoff)
 * 
 * @param videoId - 11-character YouTube video ID
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Array of transcript segments with text, duration, and offset
 * @throws {Error} With prefixed error message for UI routing:
 *   - YOUTUBE_TRANSCRIPT_DISABLED: Transcripts disabled by uploader
 *   - YOUTUBE_VIDEO_UNAVAILABLE: Video not found or private
 *   - YOUTUBE_RATE_LIMIT: Rate limit exceeded (temporary)
 *   - YOUTUBE_INVALID_ID: Invalid video ID format
 * 
 * @example
 * const transcript = await fetchTranscriptWithRetry('dQw4w9WgXcQ')
 * // Returns: [{ text: 'Never gonna give you up', duration: 2, offset: 0, lang: 'en' }, ...]
 * 
 * @example
 * // Handle disabled transcripts
 * try {
 *   const transcript = await fetchTranscriptWithRetry('abc123')
 * } catch (error) {
 *   if (error.message.startsWith('YOUTUBE_TRANSCRIPT_DISABLED')) {
 *     // Suggest manual paste
 *   }
 * }
 */
export async function fetchTranscriptWithRetry(
  videoId: string,
  maxRetries: number = 3
): Promise<TranscriptSegment[]> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Fetch transcript using youtube-transcript-plus library
      const transcript = await fetchTranscript(videoId)
      
      // Transform library response to our TranscriptSegment type
      return transcript.map(segment => ({
        text: segment.text,
        duration: segment.duration,
        offset: segment.offset,
        lang: segment.lang
      }))
      
    } catch (error: any) {
      lastError = error
      const errorMessage = error.message?.toLowerCase() || ''
      
      // Classify error type and determine if retry is appropriate
      
      // Permanent errors - no retry
      if (errorMessage.includes('transcript') && errorMessage.includes('disabled')) {
        throw new Error(
          `${ERROR_PREFIXES.YOUTUBE_TRANSCRIPT_DISABLED}: Transcripts are disabled for this video. ` +
          `Try pasting the transcript manually from YouTube's transcript feature.`
        )
      }
      
      if (errorMessage.includes('video unavailable') || 
          errorMessage.includes('not found') ||
          errorMessage.includes('private')) {
        throw new Error(
          `${ERROR_PREFIXES.YOUTUBE_VIDEO_UNAVAILABLE}: Video is unavailable, private, or does not exist.`
        )
      }
      
      if (errorMessage.includes('invalid') && errorMessage.includes('id')) {
        throw new Error(
          `${ERROR_PREFIXES.YOUTUBE_INVALID_ID}: Invalid YouTube video ID format.`
        )
      }
      
      // Transient errors - retry with exponential backoff
      if (errorMessage.includes('rate limit') || 
          errorMessage.includes('429') ||
          errorMessage.includes('too many requests')) {
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt) * 1000
          console.log(`Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        
        throw new Error(
          `${ERROR_PREFIXES.YOUTUBE_RATE_LIMIT}: YouTube rate limit exceeded. Please try again in a few minutes.`
        )
      }
      
      // Network errors - retry with exponential backoff
      if (errorMessage.includes('network') || 
          errorMessage.includes('timeout') ||
          errorMessage.includes('econnrefused') ||
          errorMessage.includes('econnreset')) {
        
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000
          console.log(`Network error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
          continue
        }
        
        throw new Error(
          `${ERROR_PREFIXES.YOUTUBE_RATE_LIMIT}: Network error while fetching transcript. Will retry automatically.`
        )
      }
      
      // Unknown error after max retries
      if (attempt >= maxRetries) {
        throw new Error(
          `${ERROR_PREFIXES.PROCESSING_ERROR}: Failed to fetch transcript after ${maxRetries + 1} attempts: ${error.message}`
        )
      }
      
      // Retry for unknown errors
      const delayMs = Math.pow(2, attempt) * 1000
      console.log(`Unknown error, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError || new Error(`${ERROR_PREFIXES.PROCESSING_ERROR}: Failed to fetch transcript`)
}

/**
 * Formats transcript segments to markdown with clickable YouTube timestamp links.
 * Converts seconds to HH:MM:SS or MM:SS format and generates deep links.
 * 
 * @param transcript - Array of transcript segments from fetchTranscriptWithRetry
 * @param videoUrl - Original YouTube video URL for generating deep links
 * @returns Markdown string with inline timestamp links
 * 
 * @example
 * const markdown = formatTranscriptToMarkdown(
 *   [
 *     { text: 'Hello world', offset: 0, duration: 2 },
 *     { text: 'Welcome back', offset: 125, duration: 3 }
 *   ],
 *   'https://youtube.com/watch?v=abc123'
 * )
 * // Returns:
 * // [[00:00](https://youtube.com/watch?v=abc123&t=0s)] Hello world
 * // [[02:05](https://youtube.com/watch?v=abc123&t=125s)] Welcome back
 * 
 * @example
 * // Handles hour-long videos
 * formatTranscriptToMarkdown(
 *   [{ text: 'Introduction', offset: 3665, duration: 5 }],
 *   'https://youtube.com/watch?v=xyz789'
 * )
 * // Returns: [[01:01:05](https://youtube.com/watch?v=xyz789&t=3665s)] Introduction
 */
export function formatTranscriptToMarkdown(
  transcript: TranscriptSegment[],
  videoUrl: string
): string {
  // Ensure video URL has proper format for deep links
  const baseUrl = videoUrl.includes('?') ? videoUrl : `${videoUrl}?v=placeholder`
  
  return transcript.map(segment => {
    // Convert offset (seconds) to timestamp format
    const hours = Math.floor(segment.offset / 3600)
    const minutes = Math.floor((segment.offset % 3600) / 60)
    const seconds = Math.floor(segment.offset % 60)
    
    // Format as HH:MM:SS or MM:SS
    const timestamp = hours > 0
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    
    // Generate YouTube deep link with &t=Xs parameter
    const deepLink = baseUrl.includes('&t=')
      ? baseUrl.replace(/&t=\d+s?/, `&t=${segment.offset}s`)
      : `${baseUrl}&t=${segment.offset}s`
    
    // Format as markdown: [[MM:SS](link)] text
    return `[[${timestamp}](${deepLink})] ${segment.text}`
  }).join('\n\n')
}

/**
 * Calculates the video timestamp for a chunk based on its character offset.
 * Maps chunk position to the corresponding timestamp segment from document metadata.
 *
 * This function enables "Watch at 9:35" links in the frontend by calculating
 * which video timestamp corresponds to a chunk's position in the document.
 *
 * @param chunk - Chunk with start_offset (character position in document)
 * @param document - Document with source_metadata containing timestamps
 * @returns Video timestamp info with seconds and optional URL, or null if not a YouTube document
 *
 * @example
 * const result = getVideoTimestamp(
 *   { start_offset: 1250 },
 *   {
 *     source_type: 'youtube',
 *     source_metadata: {
 *       videoId: 'abc123',
 *       isTranscript: true,
 *       timestamps: [
 *         { start_seconds: 0, end_seconds: 575, text: 'Intro...' },
 *         { start_seconds: 575, end_seconds: 1847, text: 'Main content...' }
 *       ]
 *     }
 *   }
 * )
 * // Returns: { seconds: 575, url: 'https://youtube.com/watch?v=abc123&t=575s', hasVideoLink: true }
 *
 * @example
 * // For pasted transcripts (no videoId)
 * const result = getVideoTimestamp(
 *   { start_offset: 500 },
 *   {
 *     source_type: 'youtube_transcript',
 *     source_metadata: {
 *       isTranscript: true,
 *       timestamps: [...]
 *     }
 *   }
 * )
 * // Returns: { seconds: 30, url: null, hasVideoLink: false }
 */
export function getVideoTimestamp(
  chunk: { start_offset: number },
  document: {
    source_type?: string
    source_metadata?: {
      videoId?: string
      isTranscript?: boolean
      timestamps?: Array<{
        start_seconds: number
        end_seconds: number
        text: string
      }>
    }
  }
): { seconds: number; url: string | null; hasVideoLink: boolean } | null {
  // Return null if not a YouTube document
  if (!document.source_type || !['youtube', 'youtube_transcript'].includes(document.source_type)) {
    return null
  }

  // Return null if no timestamps available
  if (!document.source_metadata?.isTranscript || !document.source_metadata.timestamps) {
    return null
  }

  const timestamps = document.source_metadata.timestamps
  let charCount = 0

  // Find which timestamp segment contains this chunk's start_offset
  for (const segment of timestamps) {
    const segmentLength = segment.text.length

    // Check if chunk offset falls within this segment
    if (chunk.start_offset >= charCount && chunk.start_offset < charCount + segmentLength) {
      const videoId = document.source_metadata.videoId

      // Return with video URL if we have a videoId (real YouTube video)
      if (videoId) {
        return {
          seconds: segment.start_seconds,
          url: `https://youtube.com/watch?v=${videoId}&t=${segment.start_seconds}s`,
          hasVideoLink: true
        }
      } else {
        // Pasted transcript: no video link, just timestamp
        return {
          seconds: segment.start_seconds,
          url: null,
          hasVideoLink: false
        }
      }
    }

    charCount += segmentLength
  }

  // No matching segment found
  return null
}