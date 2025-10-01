/**
 * Type definitions for AI-powered metadata extraction.
 * Used for batched processing of large documents with Gemini AI.
 */

/**
 * AI-extracted metadata for a single chunk.
 * Returned by Gemini AI for each text segment in a batch.
 * Enhanced schema for 3-engine collision detection system.
 */
export interface AIChunkMetadata {
  /** Array of 2-5 key themes or topics covered in this chunk */
  themes: string[]

  /** Array of key concepts with importance scores for ThematicBridge engine */
  concepts: Array<{ text: string; importance: number }>

  /** Importance score 0.0-1.0 representing centrality to document */
  importance: number

  /** Optional one-sentence summary of chunk content */
  summary?: string

  /** Optional domain classification (technical, narrative, academic, etc.) */
  domain?: string

  /** Emotional metadata for ContradictionDetection engine */
  emotional: {
    /** Polarity score -1 to +1 for detecting conceptual tensions */
    polarity: number
    /** Primary emotion expressed (joy/fear/anger/neutral/etc) */
    primaryEmotion: string
    /** Intensity of emotion 0 to 1 */
    intensity: number
  }
}

/**
 * Batch of text content to send to AI for semantic chunking and metadata extraction.
 * AI identifies chunk boundaries and extracts metadata in one pass.
 */
export interface MetadataExtractionBatch {
  /** Unique identifier for this batch */
  batchId: string

  /** Text content to analyze (up to 100K characters) */
  content: string

  /** Character position where this batch starts in the original document */
  startOffset: number

  /** Character position where this batch ends in the original document */
  endOffset: number
}

/**
 * Chunk with content, offsets, and metadata identified by AI.
 */
export interface ChunkWithOffsets {
  /** Chunk text content (verbatim from document) */
  content: string

  /** Absolute character offset where chunk starts in full document */
  start_offset: number

  /** Absolute character offset where chunk ends in full document */
  end_offset: number

  /** AI-extracted metadata for this chunk */
  metadata: AIChunkMetadata
}

/**
 * Result of AI metadata extraction for a single batch.
 * Returns chunks with content, offsets, and metadata.
 */
export interface MetadataExtractionResult {
  /** Batch identifier this result corresponds to */
  batchId: string

  /** Array of chunks with content, offsets, and metadata */
  chunkMetadata: ChunkWithOffsets[]

  /** Extraction status */
  status: 'success' | 'partial' | 'failed'

  /** Any errors encountered during extraction */
  errors?: Array<{ chunkIndex: number; error: string }>

  /** Processing time in milliseconds */
  processingTime: number

  /** Number of AI tokens used */
  tokensUsed?: {
    input: number
    output: number
  }
}

/**
 * Configuration for batch metadata extraction.
 */
export interface BatchMetadataConfig {
  /** Maximum characters per batch (default: 100000) */
  maxBatchSize?: number

  /** Gemini model to use (default: 'gemini-2.0-flash-exp') */
  modelName?: string

  /** API key for Gemini (defaults to env var) */
  apiKey?: string

  /** Maximum retries for failed batches (default: 3) */
  maxRetries?: number

  /** Enable progress tracking callbacks */
  enableProgress?: boolean
}

/**
 * Progress callback for batch metadata extraction.
 */
export interface MetadataExtractionProgress {
  /** Current processing phase */
  phase: 'batching' | 'ai_chunking' | 'deduplication' | 'complete'

  /** Number of batches processed */
  batchesProcessed: number

  /** Total number of batches */
  totalBatches: number

  /** Number of chunks identified by AI so far */
  chunksIdentified: number

  /** Estimated final chunk count (optional) */
  estimatedFinalChunks?: number

  /** Current batch being processed (optional) */
  currentBatchId?: string

  /** Estimated time remaining in milliseconds (optional) */
  estimatedTimeRemaining?: number
}

/**
 * Fallback metadata used when AI extraction fails.
 */
export interface FallbackMetadata {
  themes: string[]
  concepts: string[]
  importance: number
  summary: string
  source: 'fallback'
}
