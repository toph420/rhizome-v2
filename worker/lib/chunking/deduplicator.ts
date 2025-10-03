/**
 * Deduplication logic for overlapping chunks from batch boundaries.
 *
 * Batches have 2K character overlap to prevent chunk splitting.
 * This module identifies and removes duplicate chunks while preserving
 * the highest-importance version.
 */

import type { ChunkWithOffsets } from '../../types/chunking'

/**
 * Deduplicates overlapping chunks from batch boundaries.
 *
 * Strategy:
 * - Sort by start_offset (document order)
 * - Skip chunks completely contained within previous chunk
 * - Replace overlapping chunks (>50% overlap) with higher-importance version
 * - Keep non-overlapping chunks
 *
 * @param allChunks - All chunks from all batches
 * @returns Deduplicated chunks with sequential indices
 */
export function deduplicateOverlappingChunks(
  allChunks: ChunkWithOffsets[]
): Array<ChunkWithOffsets & { chunk_index: number }> {
  if (allChunks.length === 0) return []

  // Sort by start_offset to process in document order
  const sorted = [...allChunks].sort((a, b) => a.start_offset - b.start_offset)

  const deduplicated: Array<ChunkWithOffsets & { chunk_index: number }> = []
  let lastEnd = -1
  let chunkIndex = 0

  for (const chunk of sorted) {
    // Skip if completely contained within the last chunk
    if (chunk.start_offset < lastEnd && chunk.end_offset <= lastEnd) {
      console.log(`[AI Metadata] Skipping duplicate chunk at offset ${chunk.start_offset}`)
      continue
    }

    // Check for significant overlap (>50% of chunk)
    const overlapStart = Math.max(chunk.start_offset, lastEnd)
    const overlapEnd = Math.min(chunk.end_offset, lastEnd)
    const overlapSize = Math.max(0, overlapEnd - overlapStart)
    const chunkSize = chunk.end_offset - chunk.start_offset
    const overlapRatio = overlapSize / chunkSize

    if (overlapRatio > 0.5 && deduplicated.length > 0) {
      const prevChunk = deduplicated[deduplicated.length - 1]

      // Keep the chunk with higher importance
      if (chunk.metadata.importance > prevChunk.metadata.importance) {
        console.log(`[AI Metadata] Replacing overlapping chunk (importance ${prevChunk.metadata.importance} → ${chunk.metadata.importance})`)
        deduplicated[deduplicated.length - 1] = {
          ...chunk,
          chunk_index: chunkIndex - 1
        }
      } else {
        console.log(`[AI Metadata] Keeping previous chunk (higher importance)`)
      }
      continue
    }

    // Add this chunk
    deduplicated.push({
      ...chunk,
      chunk_index: chunkIndex
    })

    lastEnd = chunk.end_offset
    chunkIndex++
  }

  console.log(`[AI Metadata] Deduplicated ${allChunks.length} chunks → ${deduplicated.length} unique chunks`)
  return deduplicated
}
