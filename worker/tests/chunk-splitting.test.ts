/**
 * Test for automatic oversized chunk splitting
 */

import { splitOversizedChunk } from '../lib/chunking/chunk-validator'
import type { ChunkWithOffsets } from '../types/chunking'

describe('Oversized Chunk Splitting', () => {
  test('splits oversized chunk into multiple smaller chunks', () => {
    const oversizedChunk: ChunkWithOffsets = {
      content: 'A'.repeat(15000), // 15K chars, exceeds 10K limit
      start_offset: 0,
      end_offset: 15000,
      metadata: {
        themes: ['test'],
        concepts: [{ text: 'testing', importance: 0.8 }],
        importance: 0.7,
        summary: 'Test chunk',
        domain: 'test',
        emotional: {
          polarity: 0.5,
          primaryEmotion: 'neutral',
          intensity: 0.3
        }
      }
    }

    const result = splitOversizedChunk(oversizedChunk, 8000)

    // Should split into 2 chunks (15000 / 8000 = ~2)
    expect(result.length).toBeGreaterThanOrEqual(2)

    // Each chunk should be under max size
    for (const chunk of result) {
      expect(chunk.content.length).toBeLessThanOrEqual(8000)
    }

    // Metadata should be preserved
    for (const chunk of result) {
      expect(chunk.metadata.themes).toEqual(['test'])
      expect(chunk.metadata.concepts).toEqual([{ text: 'testing', importance: 0.8 }])
      expect(chunk.metadata.importance).toBe(0.7)
      expect(chunk.metadata.domain).toBe('test')
    }

    // Summary should indicate split
    for (let i = 0; i < result.length; i++) {
      expect(result[i].metadata.summary).toContain(`split ${i + 1}`)
    }
  })

  test('preserves single chunk if under max size', () => {
    const normalChunk: ChunkWithOffsets = {
      content: 'A'.repeat(5000), // 5K chars, under 8K default
      start_offset: 0,
      end_offset: 5000,
      metadata: {
        themes: ['test'],
        concepts: [],
        importance: 0.5,
        emotional: {
          polarity: 0,
          primaryEmotion: 'neutral',
          intensity: 0
        }
      }
    }

    const result = splitOversizedChunk(normalChunk, 8000)

    expect(result.length).toBe(1)
    expect(result[0].content).toBe(normalChunk.content)
  })

  test('calculates proportional offsets correctly', () => {
    const chunk: ChunkWithOffsets = {
      content: 'A'.repeat(16000),
      start_offset: 1000,
      end_offset: 17000, // 16000 char range
      metadata: {
        themes: ['test'],
        concepts: [],
        importance: 0.5,
        emotional: {
          polarity: 0,
          primaryEmotion: 'neutral',
          intensity: 0
        }
      }
    }

    const result = splitOversizedChunk(chunk, 8000)

    // First chunk should start at original offset
    expect(result[0].start_offset).toBe(1000)

    // Each chunk's offsets should be within the original range
    for (const splitChunk of result) {
      expect(splitChunk.start_offset).toBeGreaterThanOrEqual(1000)
      expect(splitChunk.end_offset).toBeLessThanOrEqual(17000)
    }

    // Last chunk should end at original end offset (within rounding)
    const lastChunk = result[result.length - 1]
    expect(lastChunk.end_offset).toBeCloseTo(17000, -2) // Within 100 chars due to rounding
  })
})
