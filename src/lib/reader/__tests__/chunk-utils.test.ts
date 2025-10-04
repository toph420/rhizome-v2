/**
 * Tests for chunk utilities
 */

import {
  findSpannedChunks,
  createChunkRef,
  findChunkForOffset,
  exceedsChunkLimit,
  getChunkSpanCount,
  MAX_CHUNKS_PER_ANNOTATION,
} from '../chunk-utils'
import type { Chunk } from '@/types/annotations'

// ============================================
// TEST FIXTURES
// ============================================

const createChunk = (
  id: string,
  start: number,
  end: number,
  index: number
): Chunk => ({
  id,
  document_id: 'test-doc',
  chunk_index: index,
  content: 'test content',
  summary: 'test summary',
  start_offset: start,
  end_offset: end,
  embedding: null,
  metadata: {},
  importance_score: 0.5,
  created_at: new Date().toISOString(),
})

const testChunks: Chunk[] = [
  createChunk('ch1', 0, 1000, 0),
  createChunk('ch2', 1001, 2000, 1),
  createChunk('ch3', 2001, 3000, 2),
  createChunk('ch4', 3001, 4000, 3),
  createChunk('ch5', 4001, 5000, 4),
  createChunk('ch6', 5001, 6000, 5),
]

// ============================================
// findSpannedChunks TESTS
// ============================================

describe('findSpannedChunks', () => {
  test('finds single chunk annotation', () => {
    const result = findSpannedChunks(500, 700, testChunks)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ch1')
  })

  test('finds multi-chunk annotation (2 chunks)', () => {
    const result = findSpannedChunks(500, 1500, testChunks)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('ch1')
    expect(result[1].id).toBe('ch2')
  })

  test('finds multi-chunk annotation (3 chunks)', () => {
    const result = findSpannedChunks(500, 2500, testChunks)
    expect(result).toHaveLength(3)
    expect(result.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3'])
  })

  test('enforces 5-chunk limit', () => {
    const result = findSpannedChunks(500, 5500, testChunks)
    expect(result).toHaveLength(MAX_CHUNKS_PER_ANNOTATION)
    expect(result.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3', 'ch4', 'ch5'])
  })

  test('returns empty array for invalid offsets', () => {
    expect(findSpannedChunks(-1, 100, testChunks)).toEqual([])
    expect(findSpannedChunks(100, -1, testChunks)).toEqual([])
    expect(findSpannedChunks(100, 50, testChunks)).toEqual([])
  })

  test('returns empty array for empty chunks', () => {
    expect(findSpannedChunks(0, 100, [])).toEqual([])
  })

  test('handles chunks in any order', () => {
    const unordered = [testChunks[2], testChunks[0], testChunks[1]]
    const result = findSpannedChunks(500, 2500, unordered)
    expect(result).toHaveLength(3)
    // Should return in sorted order
    expect(result.map((c) => c.id)).toEqual(['ch1', 'ch2', 'ch3'])
  })

  test('handles boundary conditions', () => {
    // Exact chunk boundary
    const result1 = findSpannedChunks(0, 1000, testChunks)
    expect(result1).toHaveLength(1)
    expect(result1[0].id).toBe('ch1')

    // Spanning chunk boundary
    const result2 = findSpannedChunks(1000, 1001, testChunks)
    expect(result2).toHaveLength(1)
    expect(result2[0].id).toBe('ch1')
  })
})

// ============================================
// createChunkRef TESTS
// ============================================

describe('createChunkRef', () => {
  test('creates ref for single-chunk annotation', () => {
    const ref = createChunkRef(500, 700, testChunks)
    expect(ref.chunkId).toBe('ch1')
    expect(ref.chunk_id).toBe('ch1')
    expect(ref.chunkIds).toEqual(['ch1'])
    expect(ref.chunkPosition).toBe(0)
  })

  test('creates ref for multi-chunk annotation', () => {
    const ref = createChunkRef(500, 2500, testChunks)
    expect(ref.chunkId).toBe('ch1') // Primary is first
    expect(ref.chunk_id).toBe('ch1')
    expect(ref.chunkIds).toEqual(['ch1', 'ch2', 'ch3'])
    expect(ref.chunkPosition).toBe(0)
  })

  test('enforces 5-chunk limit in ref', () => {
    const ref = createChunkRef(500, 5500, testChunks)
    expect(ref.chunkIds).toHaveLength(MAX_CHUNKS_PER_ANNOTATION)
    expect(ref.chunkIds).toEqual(['ch1', 'ch2', 'ch3', 'ch4', 'ch5'])
  })

  test('throws error when no chunks found', () => {
    expect(() => createChunkRef(10000, 11000, testChunks)).toThrow(
      'No chunks found'
    )
  })

  test('uses correct chunk position', () => {
    const ref = createChunkRef(1500, 1700, testChunks)
    expect(ref.chunkPosition).toBe(1) // ch2 has index 1
  })
})

// ============================================
// findChunkForOffset TESTS
// ============================================

describe('findChunkForOffset', () => {
  test('finds chunk containing offset', () => {
    const chunk = findChunkForOffset(testChunks, 500)
    expect(chunk?.id).toBe('ch1')
  })

  test('finds chunk at boundary (start)', () => {
    const chunk = findChunkForOffset(testChunks, 1001)
    expect(chunk?.id).toBe('ch2')
  })

  test('finds chunk at boundary (just before end)', () => {
    const chunk = findChunkForOffset(testChunks, 1000)
    expect(chunk?.id).toBe('ch1')
  })

  test('returns null for offset outside all chunks', () => {
    expect(findChunkForOffset(testChunks, 10000)).toBeNull()
    expect(findChunkForOffset(testChunks, -1)).toBeNull()
  })

  test('returns null for empty chunks array', () => {
    expect(findChunkForOffset([], 500)).toBeNull()
  })

  test('works with unsorted chunks', () => {
    const unordered = [testChunks[3], testChunks[1], testChunks[0]]
    const chunk = findChunkForOffset(unordered, 1500)
    expect(chunk?.id).toBe('ch2')
  })
})

// ============================================
// HELPER FUNCTIONS TESTS
// ============================================

describe('exceedsChunkLimit', () => {
  test('returns false for annotations within limit', () => {
    expect(exceedsChunkLimit(0, 1000, testChunks)).toBe(false)
    expect(exceedsChunkLimit(0, 4000, testChunks)).toBe(false)
  })

  test('returns true for annotations exceeding limit', () => {
    expect(exceedsChunkLimit(0, 6000, testChunks)).toBe(true)
  })
})

describe('getChunkSpanCount', () => {
  test('returns correct count for single chunk', () => {
    expect(getChunkSpanCount(500, 700, testChunks)).toBe(1)
  })

  test('returns correct count for multiple chunks', () => {
    expect(getChunkSpanCount(500, 2500, testChunks)).toBe(3)
  })

  test('respects 5-chunk limit in count', () => {
    expect(getChunkSpanCount(0, 6000, testChunks)).toBe(
      MAX_CHUNKS_PER_ANNOTATION
    )
  })
})

// ============================================
// EDGE CASES
// ============================================

describe('edge cases', () => {
  test('handles chunks with null offsets', () => {
    const chunksWithNulls: Chunk[] = [
      { ...testChunks[0], start_offset: null, end_offset: null },
    ]
    expect(findSpannedChunks(0, 100, chunksWithNulls)).toEqual([])
  })

  test('handles overlapping chunks gracefully', () => {
    const overlapping: Chunk[] = [
      createChunk('ch1', 0, 1500, 0),
      createChunk('ch2', 1000, 2000, 1), // Overlaps with ch1
    ]
    const result = findSpannedChunks(1200, 1300, overlapping)
    expect(result).toHaveLength(2) // Both chunks overlap this range
  })

  test('handles zero-length range', () => {
    expect(findSpannedChunks(500, 500, testChunks)).toEqual([])
  })
})
