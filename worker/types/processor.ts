/**
 * Shared types for document processor system.
 * Defines common interfaces used across all source processors.
 */

import type { ChunkMetadata, PartialChunkMetadata } from './metadata.js'

/**
 * Result from document processing operation.
 * Contains extracted content and metadata from any source type.
 */
export interface ProcessResult {
  /** Processed markdown content */
  markdown: string
  /** Extracted text chunks for embedding and search */
  chunks: ProcessedChunk[]
  /** Document metadata extracted during processing */
  metadata?: DocumentMetadata
  /** Word count of processed content */
  wordCount?: number
  /** Document outline with heading hierarchy */
  outline?: OutlineSection[]
}

/**
 * Processed chunk with content and metadata.
 * Represents a semantic unit of text for embedding and search.
 *
 * NOTE: YouTube timestamps are NOT stored at chunk level.
 * They belong in document.source_metadata and are calculated at display time
 * using character offsets (start_offset/end_offset).
 */
export interface ProcessedChunk {
  /** Chunk text content */
  content: string
  /** Starting position in source document */
  start_offset?: number
  /** Ending position in source document */
  end_offset?: number
  /** Index of chunk in document sequence */
  chunk_index?: number
  /** Extracted themes/topics */
  themes?: string[]
  /** Importance score (0-1) */
  importance_score?: number
  /** AI-generated summary */
  summary?: string
  /** Word count for the chunk */
  word_count?: number
  /** Position context for fuzzy matching (confidence, method, snippets only) */
  positionContext?: PositionContext
  /** Rich metadata extracted for 7-engine collision detection */
  metadata?: ChunkMetadata | PartialChunkMetadata
}

/**
 * Document metadata from processing.
 */
export interface DocumentMetadata {
  /** Document title */
  title?: string
  /** Author information */
  author?: string
  /** Publication or creation date */
  date?: string
  /** Source URL if applicable */
  sourceUrl?: string
  /** Source-specific metadata (e.g., YouTube timestamps, video IDs) */
  source_metadata?: YouTubeSourceMetadata | Record<string, any>
  /** Additional format-specific metadata */
  extra?: Record<string, any>
}

/**
 * YouTube-specific source metadata.
 * Stored at document level in documents.source_metadata JSONB column.
 *
 * Used for both:
 * - Real YouTube videos (source_type: 'youtube')
 * - Pasted transcripts (source_type: 'youtube_transcript')
 */
export interface YouTubeSourceMetadata {
  /** Video ID (11-char) - only present for real YouTube URLs */
  videoId?: string
  /** Full YouTube URL - only present for real YouTube URLs */
  videoUrl?: string
  /** Video duration in seconds - only present for real YouTube URLs */
  duration?: number
  /** Flag indicating this document has timestamps */
  isTranscript: true
  /** Timestamp segments from original transcript */
  timestamps: Array<{
    /** Start time in seconds */
    start_seconds: number
    /** End time in seconds (approximate for pasted transcripts) */
    end_seconds: number
    /** Text content of this segment */
    text: string
  }>
}

/**
 * Document outline section for navigation.
 */
export interface OutlineSection {
  /** Section heading text */
  title: string
  /** Heading level (1-6) */
  level: number
  /** Character offset in document */
  offset: number
  /** Nested subsections */
  children?: OutlineSection[]
}

/**
 * Position context for chunk mapping.
 * Enables linking chunks to source positions after transformations.
 */
export interface PositionContext {
  /** Match confidence score (0-1) */
  confidence: number
  /** Matching method used */
  method: 'exact' | 'fuzzy' | 'approximate' | 'none'
  /** Original text snippet for reference */
  originalSnippet?: string
  /** Estimated character offset */
  estimatedOffset?: number
}

/**
 * Progress update data for status tracking.
 */
export interface ProgressUpdate {
  /** Percentage complete (0-100) */
  percent: number
  /** Current processing stage */
  stage: string
  /** Sub-stage within current stage */
  substage?: string
  /** Human-readable details */
  details?: string
  /** Additional data for UI */
  additionalData?: Record<string, any>
}

/**
 * Processing configuration options.
 */
export interface ProcessingOptions {
  /** Enable AI content cleaning */
  cleanWithAI?: boolean
  /** Maximum chunks to generate */
  maxChunks?: number
  /** Target chunk size in tokens */
  targetChunkSize?: number
  /** Skip metadata extraction for chunks */
  skipMetadataExtraction?: boolean
  /** Enable position tracking */
  trackPositions?: boolean
  /** Custom retry attempts */
  maxRetries?: number
}