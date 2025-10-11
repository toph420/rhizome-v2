/**
 * Test for automatic oversized chunk splitting
 */

import { splitOversizedChunk } from '../lib/chunking/chunk-validator'
import type { ChunkWithOffsets } from '../types/chunking'

describe('Oversized Chunk Splitting', () => {
  test('splits oversized chunk into multiple smaller chunks', () => {
    // Create realistic markdown content with paragraph breaks (3K chars per paragraph)
    const paragraph1 = 'A'.repeat(3000)
    const paragraph2 = 'B'.repeat(3000)
    const paragraph3 = 'C'.repeat(3000)
    const paragraph4 = 'D'.repeat(3000)
    const paragraph5 = 'E'.repeat(3000)

    const sourceMarkdown = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}\n\n${paragraph4}\n\n${paragraph5}`

    const oversizedChunk: ChunkWithOffsets = {
      content: sourceMarkdown, // ~15K chars with paragraph breaks
      start_offset: 0,
      end_offset: sourceMarkdown.length,
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

    const result = splitOversizedChunk(oversizedChunk, sourceMarkdown, 8000)

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

    // Summary should indicate split (check for 'part' keyword)
    for (let i = 0; i < result.length; i++) {
      expect(result[i].metadata.summary).toContain('part')
    }
  })

  test('preserves single chunk if under max size', () => {
    const sourceMarkdown = 'A'.repeat(5000) // 5K chars

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

    const result = splitOversizedChunk(normalChunk, sourceMarkdown, 8000)

    expect(result.length).toBe(1)
    expect(result[0].content).toBe(normalChunk.content)
  })

  test('uses placeholder offsets for fuzzy matcher', () => {
    // Create realistic markdown content with paragraph breaks
    const paragraph1 = 'A'.repeat(3000)
    const paragraph2 = 'B'.repeat(3000)
    const paragraph3 = 'C'.repeat(3000)
    const paragraph4 = 'D'.repeat(3000)
    const paragraph5 = 'E'.repeat(3000)

    const chunkContent = `${paragraph1}\n\n${paragraph2}\n\n${paragraph3}\n\n${paragraph4}\n\n${paragraph5}`

    // Create source markdown with chunk at offset 1000
    const sourceMarkdown = 'X'.repeat(1000) + chunkContent + 'Y'.repeat(1000)

    const chunk: ChunkWithOffsets = {
      content: chunkContent,
      start_offset: 1000,
      end_offset: 1000 + chunkContent.length,
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

    const result = splitOversizedChunk(chunk, sourceMarkdown, 8000)

    // Should split into multiple chunks
    expect(result.length).toBeGreaterThan(1)

    // All split chunks should have placeholder offsets (-1)
    // Fuzzy matcher will correct these during processing
    for (const splitChunk of result) {
      expect(splitChunk.start_offset).toBe(-1)
      expect(splitChunk.end_offset).toBe(-1)
    }

    // But content should still be split properly
    for (const splitChunk of result) {
      expect(splitChunk.content.length).toBeLessThanOrEqual(8000)
    }
  })
})
