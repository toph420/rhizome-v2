/**
 * Batch creation for large markdown documents.
 *
 * Uses sliding window approach with overlap to prevent
 * semantic chunks from being split across batch boundaries.
 */

import type { MetadataExtractionBatch } from '../../types/chunking'

/**
 * Overlap size between batches (1K chars).
 * Prevents chunks from being cut mid-sentence at batch boundaries.
 * Reduced from 2K to match smaller batch size (20K).
 */
export const OVERLAP_SIZE = 1000

/**
 * Creates windowed batches with overlap for large document processing.
 *
 * Strategy:
 * - Slide 100K character windows across markdown
 * - Each batch overlaps previous by 2K chars
 * - AI will identify chunks within each batch
 * - Deduplicator removes overlap chunks later
 *
 * @param markdown - Full markdown content
 * @param maxBatchSize - Maximum batch size in characters (default: 100K)
 * @returns Array of batches ready for AI processing
 */
export function createBatches(
  markdown: string,
  maxBatchSize: number
): MetadataExtractionBatch[] {
  const batches: MetadataExtractionBatch[] = []

  let position = 0
  let batchIndex = 0

  while (position < markdown.length) {
    const endPosition = Math.min(position + maxBatchSize, markdown.length)
    const content = markdown.substring(position, endPosition)

    batches.push({
      batchId: `batch-${batchIndex}`,
      content: content,
      startOffset: position,
      endOffset: endPosition
    })

    // Move to next batch with overlap (unless we're at the end)
    if (endPosition < markdown.length) {
      position = endPosition - OVERLAP_SIZE
    } else {
      break
    }

    batchIndex++
  }

  return batches
}
