/**
 * Chunk utilities for multi-chunk annotation support.
 *
 * Provides functions to find which chunks an annotation spans
 * and create ChunkRef components for multi-chunk annotations.
 * @module chunk-utils
 */

import type { Chunk } from '@/types/annotations'
import type { ChunkRefComponent } from '@/lib/ecs/components'

// ============================================
// CONSTANTS
// ============================================

/** Maximum number of chunks a single annotation can span. */
export const MAX_CHUNKS_PER_ANNOTATION = 5

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Find all chunks that overlap with a given offset range.
 *
 * Uses efficient filtering to identify chunks that contain any part
 * of the specified range. Returns chunks in order by start offset.
 * @param startOffset - Starting character offset in markdown.
 * @param endOffset - Ending character offset in markdown.
 * @param chunks - Array of chunks with offset information.
 * @returns Array of overlapping chunks (max 5), sorted by start offset.
 * @example
 * ```typescript
 * const chunks = [
 *   { id: 'ch1', start_offset: 0, end_offset: 1000 },
 *   { id: 'ch2', start_offset: 1001, end_offset: 2000 },
 *   { id: 'ch3', start_offset: 2001, end_offset: 3000 }
 * ]
 * const spanned = findSpannedChunks(500, 1500, chunks)
 * // Returns [ch1, ch2]
 * ```
 */
export function findSpannedChunks(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): Chunk[] {
  // Validate inputs
  if (startOffset < 0 || endOffset < 0) {
    return []
  }
  if (startOffset >= endOffset) {
    return []
  }
  if (chunks.length === 0) {
    return []
  }

  // Filter chunks that overlap with [startOffset, endOffset)
  const overlapping = chunks.filter((chunk) => {
    // Skip chunks with null offsets
    if (chunk.start_offset == null || chunk.end_offset == null) {
      return false
    }

    const chunkStart = chunk.start_offset
    const chunkEnd = chunk.end_offset

    // Check for overlap: chunk overlaps if it starts before range ends
    // AND ends after range starts
    // Note: Using <= for endOffset to include boundary touches
    return chunkStart < endOffset && chunkEnd >= startOffset
  })

  // Sort by start offset for consistent ordering
  overlapping.sort((a, b) => {
    const aStart = a.start_offset ?? 0
    const bStart = b.start_offset ?? 0
    return aStart - bStart
  })

  // Enforce 5-chunk limit
  if (overlapping.length > MAX_CHUNKS_PER_ANNOTATION) {
    console.warn(
      `Annotation spans ${overlapping.length} chunks, limiting to ${MAX_CHUNKS_PER_ANNOTATION}`
    )
    return overlapping.slice(0, MAX_CHUNKS_PER_ANNOTATION)
  }

  return overlapping
}

/**
 * Create a ChunkRef component for an annotation.
 *
 * Handles both single-chunk and multi-chunk annotations.
 * For multi-chunk annotations, stores array of chunk IDs.
 * @param startOffset - Starting character offset.
 * @param endOffset - Ending character offset.
 * @param chunks - All chunks in the document.
 * @returns ChunkRef component data with chunkIds array.
 * @example
 * ```typescript
 * const ref = createChunkRef(500, 1500, allChunks)
 * // Returns:
 * // {
 * //   chunkId: 'ch1',  // Primary chunk
 * //   chunk_id: 'ch1',
 * //   chunkIds: ['ch1', 'ch2'],
 * //   chunkPosition: 0
 * // }
 * ```
 */
export function createChunkRef(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): Omit<ChunkRefComponent, 'chunk_id'> & { chunk_id: string; chunkIds: string[] } {
  const spannedChunks = findSpannedChunks(startOffset, endOffset, chunks)

  if (spannedChunks.length === 0) {
    throw new Error(
      `No chunks found for offset range [${startOffset}, ${endOffset})`
    )
  }

  // Primary chunk is the first one (where annotation starts)
  const primaryChunk = spannedChunks[0]
  const chunkIds = spannedChunks.map((ch) => ch.id)

  return {
    chunkId: primaryChunk.id,
    chunk_id: primaryChunk.id, // For ECS filtering
    chunkIds, // Array for multi-chunk support
    chunkPosition: primaryChunk.chunk_index ?? 0,
  }
}

/**
 * Find the chunk containing a specific offset using binary search.
 *
 * Efficient O(log n) search for chunk lookup. Returns null if offset
 * is not within any chunk's range.
 * @param chunks - Array of chunks (should be sorted by start_offset).
 * @param offset - Character offset to find.
 * @returns The containing chunk or null if not found.
 * @example
 * ```typescript
 * const chunk = findChunkForOffset(sortedChunks, 1500)
 * if (chunk) {
 *   console.log(`Offset 1500 is in chunk ${chunk.id}`)
 * }
 * ```
 */
export function findChunkForOffset(
  chunks: Chunk[],
  offset: number
): Chunk | null {
  if (chunks.length === 0 || offset < 0) {
    return null
  }

  // Sort chunks by start offset for binary search
  const sortedChunks = [...chunks].sort((a, b) => {
    const aStart = a.start_offset ?? 0
    const bStart = b.start_offset ?? 0
    return aStart - bStart
  })

  let left = 0
  let right = sortedChunks.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const chunk = sortedChunks[mid]
    const startOffset = chunk.start_offset ?? 0
    const endOffset = chunk.end_offset ?? Number.MAX_SAFE_INTEGER

    // Include both boundaries: [startOffset, endOffset]
    if (offset >= startOffset && offset <= endOffset) {
      return chunk
    }

    if (offset < startOffset) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return null
}

/**
 * Check if an annotation would exceed the 5-chunk limit.
 * @param startOffset - Starting offset.
 * @param endOffset - Ending offset.
 * @param chunks - All chunks.
 * @returns True if annotation would span more than 5 chunks (before limiting).
 */
export function exceedsChunkLimit(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): boolean {
  // Count raw overlapping chunks before limit is applied
  const rawCount = chunks.filter((chunk) => {
    if (chunk.start_offset == null || chunk.end_offset == null) {
      return false
    }
    return chunk.start_offset < endOffset && chunk.end_offset >= startOffset
  }).length

  return rawCount > MAX_CHUNKS_PER_ANNOTATION
}

/**
 * Get chunk span count for an annotation.
 * @param startOffset - Starting offset.
 * @param endOffset - Ending offset.
 * @param chunks - All chunks.
 * @returns Number of chunks the annotation spans.
 */
export function getChunkSpanCount(
  startOffset: number,
  endOffset: number,
  chunks: Chunk[]
): number {
  const spanned = findSpannedChunks(startOffset, endOffset, chunks)
  return spanned.length
}

// ============================================
// TYPE EXPORTS
// ============================================

export type { Chunk } from '@/types/annotations'
