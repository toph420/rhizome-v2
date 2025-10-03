/**
 * Types for AI-powered semantic chunking and metadata extraction.
 * Extracted from ai-chunking-batch.ts for reusability.
 */

/**
 * AI-extracted metadata for a semantic chunk.
 */
export interface AIChunkMetadata {
  themes: string[]
  concepts: Array<{ text: string; importance: number }>
  importance: number
  summary?: string
  domain?: string
  emotional: {
    polarity: number
    primaryEmotion: string
    intensity: number
  }
}

/**
 * Chunk with absolute character offsets and metadata.
 */
export interface ChunkWithOffsets {
  content: string
  start_offset: number
  end_offset: number
  metadata: AIChunkMetadata
}

/**
 * Batch of markdown content for AI processing.
 */
export interface MetadataExtractionBatch {
  batchId: string
  content: string
  startOffset: number
  endOffset: number
}

/**
 * Result from processing a single batch.
 */
export interface MetadataExtractionResult {
  batchId: string
  chunkMetadata: ChunkWithOffsets[]
  status: 'success' | 'failed'
  errors?: Array<{ chunkIndex: number; error: string }>
  processingTime: number
}

/**
 * Configuration for batch metadata extraction.
 */
export interface BatchMetadataConfig {
  maxBatchSize?: number
  modelName?: string
  apiKey?: string
  maxRetries?: number
  enableProgress?: boolean
}

/**
 * Progress callback for batch processing.
 */
export interface MetadataExtractionProgress {
  phase: 'batching' | 'ai_chunking' | 'deduplication' | 'complete'
  batchesProcessed: number
  totalBatches: number
  chunksIdentified: number
  currentBatchId?: string
}
