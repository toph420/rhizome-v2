/**
 * Type definitions for multi-format document processing system.
 * Supports PDF, YouTube, web articles, markdown, and pasted content.
 */

/**
 * YouTube transcript segment from youtube-transcript-plus library.
 * 
 * @example
 * {
 *   text: "Hello world",
 *   duration: 2,
 *   offset: 0,
 *   lang: "en"
 * }
 */
export interface TranscriptSegment {
  /** Transcript text content */
  text: string
  /** Segment duration in seconds */
  duration: number
  /** Start time offset in seconds from video beginning */
  offset: number
  /** Language code (e.g., 'en', 'es') */
  lang?: string
}

/**
 * Timestamp context for fuzzy matching in markdown content.
 * Enables linking chunks back to specific moments in source videos.
 * 
 * @example
 * {
 *   time: 125,
 *   context_before: "discussing the importance of",
 *   context_after: "in modern web development"
 * }
 */
export interface TimestampContext {
  /** Timestamp in seconds from start of video */
  time: number
  /** 3-5 words appearing before timestamp in content */
  context_before: string
  /** 3-5 words appearing after timestamp in content */
  context_after: string
}

/**
 * Extracted web article from Mozilla Readability algorithm.
 * Contains cleaned article content without ads, navigation, or boilerplate.
 * 
 * @example
 * {
 *   title: "Introduction to TypeScript",
 *   content: "<article>...</article>",
 *   textContent: "Plain text version...",
 *   excerpt: "Learn TypeScript basics",
 *   byline: "John Doe",
 *   siteName: "Dev Blog",
 *   lang: "en"
 * }
 */
export interface Article {
  /** Article title extracted from page */
  title: string
  /** Processed HTML content (cleaned) */
  content: string
  /** Plain text without HTML tags */
  textContent: string
  /** Article description/summary */
  excerpt: string
  /** Author metadata */
  byline: string
  /** Website name */
  siteName: string
  /** Content language code */
  lang?: string
}

/**
 * Source type enum for document processing routing.
 * Determines which processing pipeline to use for a document.
 * 
 * @example
 * const sourceType: SourceType = 'youtube'
 */
export type SourceType = 
  | 'pdf'              // Existing PDF processing via Gemini Files API
  | 'markdown_asis'    // Save markdown as-is, chunk by headings
  | 'markdown_clean'   // Clean markdown with AI + semantic chunking
  | 'txt'              // Convert text to markdown with AI
  | 'youtube'          // Fetch YouTube transcript + preserve timestamps
  | 'web_url'          // Extract web article + clean with AI
  | 'paste'            // Generic pasted text processing

/**
 * Error types for structured error handling and recovery guidance.
 * Used to provide appropriate user feedback and recovery suggestions.
 * 
 * @example
 * const errorType: ErrorType = 'transient'
 * if (errorType === 'transient') {
 *   // Suggest retry after delay
 * }
 */
export type ErrorType = 
  | 'transient'        // Retry possible (rate limit, timeout, network)
  | 'permanent'        // Fail gracefully (invalid URL, disabled transcripts)
  | 'paywall'          // Suggest alternative (HTTP 403, extraction failed)
  | 'invalid'          // Validation error (malformed input)

/**
 * Error prefix constants for consistent error message routing.
 * Used to identify error types in error messages for UI handling.
 */
export const ERROR_PREFIXES = {
  // YouTube errors
  YOUTUBE_TRANSCRIPT_DISABLED: 'YOUTUBE_TRANSCRIPT_DISABLED',
  YOUTUBE_VIDEO_UNAVAILABLE: 'YOUTUBE_VIDEO_UNAVAILABLE',
  YOUTUBE_RATE_LIMIT: 'YOUTUBE_RATE_LIMIT',
  YOUTUBE_INVALID_ID: 'YOUTUBE_INVALID_ID',
  
  // Web extraction errors
  WEB_NOT_FOUND: 'WEB_NOT_FOUND',
  WEB_PAYWALL: 'WEB_PAYWALL',
  WEB_TIMEOUT: 'WEB_TIMEOUT',
  WEB_NETWORK_ERROR: 'WEB_NETWORK_ERROR',
  WEB_NOT_ARTICLE: 'WEB_NOT_ARTICLE',
  
  // Generic errors
  INVALID_URL: 'INVALID_URL',
  PROCESSING_ERROR: 'PROCESSING_ERROR'
} as const

/**
 * Job input data structure for background processing jobs.
 * Extended to support multi-format document sources.
 * 
 * @example
 * {
 *   document_id: 'uuid-here',
 *   storage_path: 'user/doc',
 *   source_type: 'youtube',
 *   source_url: 'https://youtube.com/watch?v=abc123',
 *   processing_requested: true
 * }
 */
export interface JobInputData {
  /** Document ID being processed */
  document_id: string
  /** Storage path for uploaded files */
  storage_path: string
  /** Source type for routing */
  source_type: SourceType
  /** Source URL for YouTube/web articles */
  source_url?: string
  /** Whether to apply AI processing (for markdown) */
  processing_requested?: boolean
  /** Pasted content for 'paste' source type */
  pasted_content?: string
}