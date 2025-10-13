/**
 * Shared types for document processor system.
 * Defines common interfaces used across all source processors.
 */

import type {
  EmotionalMetadata,
  ConceptualMetadata,
  DomainMetadata,
  NarrativeMetadata,
  ReferenceMetadata,
  StructuralMetadata,
  MethodMetadata,
  QualityMetadata
} from './metadata.js'

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
 *
 * ARCHITECTURE: This interface uses FLAT metadata properties that match the
 * database schema (migration 015). Each metadata type is stored in a separate
 * JSONB column for optimal query performance with individual GIN indexes.
 */
export interface ProcessedChunk {
  /** Document ID (foreign key) */
  document_id?: string
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
  /** AI-generated summary (null if not extracted) */
  summary?: string | null
  /** Word count for the chunk */
  word_count?: number
  /** Position context for fuzzy matching (confidence, method, snippets only) */
  positionContext?: PositionContext

  // === PHASE 4/5: Local Pipeline Structural Metadata (Migration 045) ===
  // These fields store Docling-extracted structural metadata for PDFs and EPUBs

  /** Starting page number (PDF only, null for EPUB) */
  page_start?: number | null
  /** Ending page number (PDF only, null for EPUB) */
  page_end?: number | null
  /** Heading level in document structure */
  heading_level?: number | null
  /** Heading path array (e.g., ["Chapter 1", "Section 1.1"]) */
  heading_path?: string[] | null
  /** Section marker (EPUB only, generated from headings) */
  section_marker?: string | null
  /** PDF bounding boxes for coordinate highlighting */
  bboxes?: Array<{
    page: number
    l: number  // left
    t: number  // top
    r: number  // right
    b: number  // bottom
  }> | null
  /** Position matching confidence (exact, high, medium, synthetic) */
  position_confidence?: string
  /** Position matching method used */
  position_method?: string
  /** Whether position has been manually validated */
  position_validated?: boolean

  // === PHASE 6: Validation and Correction System (Migration 048) ===
  // These fields support LOCAL mode quality assurance workflow

  /** Human-readable validation warning */
  validation_warning?: string | null
  /** Structured validation metadata */
  validation_details?: ValidationDetails | null
  /** Whether chunk offsets were adjusted to prevent overlap */
  overlap_corrected?: boolean
  /** Whether user has validated or corrected position */
  position_corrected?: boolean
  /** Audit trail of all corrections */
  correction_history?: CorrectionHistoryEntry[]

  // === METADATA (Flat structure matching database schema) ===
  // These correspond to individual JSONB columns in the chunks table (migration 015)
  // Each has a GIN index for efficient queries by the 3-engine collision detection system
  //
  // NOTE: Metadata fields use Partial<T> to support gradual enrichment across different
  // extraction methods (simple AI extraction vs full 7-engine analysis). The database
  // JSONB columns are schema-less and can store partial structures.

  /** Emotional tone and sentiment metadata (null if not extracted) */
  emotional_metadata?: Partial<EmotionalMetadata> | null
  /** Key concepts, entities, and relationships metadata (null if not extracted) */
  conceptual_metadata?: Partial<ConceptualMetadata> | null
  /** Domain classification and technical depth metadata (null if not extracted) */
  domain_metadata?: Partial<DomainMetadata> | null
  /** Narrative rhythm and writing style metadata (null if not extracted) */
  narrative_metadata?: Partial<NarrativeMetadata> | null
  /** Cross-references and citation metadata (null if not extracted) */
  reference_metadata?: Partial<ReferenceMetadata> | null
  /** Structural patterns (headings, lists, tables) metadata (null if not extracted) */
  structural_metadata?: Partial<StructuralMetadata> | null
  /** Method signatures metadata (for code chunks only, null if not applicable) */
  method_metadata?: Partial<MethodMetadata> | null
  /** Extraction quality and completeness metadata (null if not extracted) */
  quality_metadata?: Partial<QualityMetadata> | null
  /** Timestamp when metadata was last extracted (null if never extracted) */
  metadata_extracted_at?: string | null
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
 * Validation details for chunks that need review.
 * Structured metadata about why chunk position needs validation.
 */
export interface ValidationDetails {
  /** Type of validation warning */
  type: 'overlap_corrected' | 'synthetic' | 'low_similarity'
  /** Original offsets before correction (for overlap_corrected) */
  original_offsets?: { start: number; end: number }
  /** Adjusted offsets after correction (for overlap_corrected) */
  adjusted_offsets?: { start: number; end: number }
  /** Confidence level change (e.g., "exact → high") */
  confidence_downgrade?: string
  /** Reason for warning */
  reason: string
  /** Additional context-specific data */
  metadata?: Record<string, any>
}

/**
 * Correction history entry for audit trail.
 * Records each user correction with full details.
 */
export interface CorrectionHistoryEntry {
  /** Timestamp of correction */
  timestamp: string
  /** Offsets before correction */
  old_offsets: { start: number; end: number }
  /** Offsets after correction */
  new_offsets: { start: number; end: number }
  /** Reason for correction */
  reason: string
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