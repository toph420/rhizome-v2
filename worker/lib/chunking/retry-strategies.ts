/**
 * Retry strategies for AI batch processing with size validation.
 *
 * Handles:
 * - Exponential backoff for transient failures
 * - Batch splitting when AI violates size constraints
 * - Natural boundary detection for splitting
 * - Non-retryable error detection
 */

import type { MetadataExtractionBatch } from '../../types/chunking'

/**
 * Sleep utility for retry delays.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Determines if an error should stop retries immediately.
 *
 * Non-retryable errors:
 * - Authentication/API key errors
 * - Invalid request structure
 * - Forbidden access
 *
 * @param error - Error from AI call
 * @returns true if retries should stop
 */
export function shouldStopRetrying(error: Error): boolean {
  const message = error.message.toLowerCase()

  if (message.includes('auth') || message.includes('api key') || message.includes('forbidden')) {
    return true
  }

  if (message.includes('invalid') && message.includes('request')) {
    return true
  }

  return false
}

/**
 * Finds a natural boundary (paragraph, sentence, or fallback) to split content.
 * Avoids mid-sentence splits that corrupt chunk content.
 *
 * Strategies (in order):
 * 1. Double newline (paragraph break)
 * 2. Single newline
 * 3. Period + space (sentence boundary)
 * 4. Any period
 * 5. Halfway point (fallback)
 *
 * @param content - Content to split
 * @returns Character position for split
 */
export function splitAtNaturalBoundary(content: string): number {
  const half = Math.floor(content.length / 2)

  // Strategy 1: Find paragraph break (double newline)
  let split = content.indexOf('\n\n', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 2 // Include the newlines in first batch
  }

  // Strategy 2: Find single newline
  split = content.indexOf('\n', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 1
  }

  // Strategy 3: Find sentence boundary (period + space)
  split = content.indexOf('. ', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 2 // Include period and space
  }

  // Strategy 4: Find any period
  split = content.indexOf('.', half)
  if (split !== -1 && split < content.length * 0.75) {
    return split + 1
  }

  // Fallback: Split at halfway point (better than nothing)
  return half
}

/**
 * Splits a batch into two smaller batches at natural boundary.
 *
 * @param batch - Batch to split
 * @returns Two sub-batches with updated IDs and offsets
 */
export function splitBatch(
  batch: MetadataExtractionBatch
): [MetadataExtractionBatch, MetadataExtractionBatch] {
  const splitPoint = splitAtNaturalBoundary(batch.content)

  const batch1: MetadataExtractionBatch = {
    ...batch,
    batchId: `${batch.batchId}-a`,
    content: batch.content.slice(0, splitPoint),
    endOffset: batch.startOffset + splitPoint
  }

  const batch2: MetadataExtractionBatch = {
    ...batch,
    batchId: `${batch.batchId}-b`,
    content: batch.content.slice(splitPoint),
    startOffset: batch.startOffset + splitPoint
  }

  console.log(
    `[Retry Strategy] Split batch at natural boundary: ` +
    `${splitPoint} chars (${(splitPoint / batch.content.length * 100).toFixed(1)}% of batch)`
  )

  return [batch1, batch2]
}

/**
 * Calculates exponential backoff delay.
 *
 * @param attempt - Attempt number (1-based)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = 1000): number {
  return Math.pow(2, attempt) * baseDelay
}
