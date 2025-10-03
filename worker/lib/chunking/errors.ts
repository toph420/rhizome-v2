/**
 * Structured error types for AI chunking operations.
 * Provides specific error information for better debugging and retry logic.
 */

/**
 * Error thrown when AI generates chunks exceeding maximum size constraint.
 */
export class OversizedChunksError extends Error {
  constructor(
    public chunks: Array<{ content: string; size: number }>,
    public maxSize: number
  ) {
    const maxChunkSize = Math.max(...chunks.map(c => c.size))
    super(
      `${chunks.length} chunks exceed ${maxSize} chars (max: ${maxChunkSize})`
    )
    this.name = 'OversizedChunksError'
  }
}

/**
 * Error thrown when batch processing fails after retries.
 */
export class BatchProcessingError extends Error {
  constructor(
    public batchId: string,
    public attemptNumber: number,
    public originalError: Error
  ) {
    super(
      `Batch ${batchId} failed on attempt ${attemptNumber}: ${originalError.message}`
    )
    this.name = 'BatchProcessingError'
    this.cause = originalError
  }
}

/**
 * Error thrown when chunk validation fails.
 */
export class ChunkValidationError extends Error {
  constructor(
    public chunkIndex: number,
    public reason: string,
    public chunk?: any
  ) {
    super(`Chunk ${chunkIndex}: ${reason}`)
    this.name = 'ChunkValidationError'
  }
}

/**
 * Error thrown when fuzzy matching cannot locate chunk content.
 */
export class FuzzyMatchError extends Error {
  constructor(
    public chunkIndex: number,
    public contentPreview: string
  ) {
    super(`Chunk ${chunkIndex}: Cannot locate content in markdown`)
    this.name = 'FuzzyMatchError'
  }
}
