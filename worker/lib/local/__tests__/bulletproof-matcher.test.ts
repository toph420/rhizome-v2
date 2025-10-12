/**
 * Test suite for bulletproof matching system
 *
 * Tests all 5 layers individually and the orchestrator integration.
 * Uses mocked embeddings and LLM for reliable CI testing.
 */

import { bulletproofMatch, type MatchResult, type DoclingChunk } from '../bulletproof-matcher'

// Import type for proper typing
import type { DoclingChunk as ImportedDoclingChunk } from '../bulletproof-matcher.js'

// Mock dependencies - must be defined before imports
const mockEmbeddingPipeline = jest.fn((texts: string[], options: any) => {
  // Generate fake embeddings (768 dimensions)
  const embeddings = texts.map(() =>
    Array.from({ length: 768 }, () => Math.random())
  )
  return Promise.resolve({
    tolist: () => embeddings
  })
})

const mockOllamaClient = {
  generateStructured: jest.fn((prompt: string) => {
    // Parse chunk content from prompt
    const chunkMatch = prompt.match(/CHUNK:\n([\s\S]+?)\n\nSEARCH WINDOW/)
    const windowMatch = prompt.match(/SEARCH WINDOW:\n([\s\S]+)$/)

    if (chunkMatch && windowMatch) {
      const chunkContent = chunkMatch[1]
      const window = windowMatch[1]

      // Simple mock: if chunk is in window, return offsets
      const index = window.indexOf(chunkContent.slice(0, 100))
      if (index !== -1) {
        return Promise.resolve({
          found: true,
          start_offset: index,
          end_offset: index + chunkContent.length,
          confidence: 'high'
        })
      }
    }

    return Promise.resolve({ found: false })
  })
}

// Apply mocks
jest.mock('@huggingface/transformers', () => ({
  pipeline: jest.fn(() => Promise.resolve(mockEmbeddingPipeline))
}))

jest.mock('../ollama-client.js', () => ({
  OllamaClient: jest.fn(() => mockOllamaClient),
  OOMError: class OOMError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'OOMError'
    }
  }
}))

describe('Bulletproof Matcher', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Layer 1: Enhanced Fuzzy Matching', () => {
    it('matches exact content (Strategy 1)', async () => {
      const markdown = 'This is the first chunk. This is the second chunk. This is the third chunk.'
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'This is the first chunk.',
          meta: {
            page_start: 1,
            page_end: 1,
            heading_path: ['Chapter 1'],
            heading_level: 1
          }
        },
        {
          index: 1,
          content: 'This is the second chunk.',
          meta: {
            page_start: 1,
            page_end: 1,
            heading_path: ['Chapter 1'],
            heading_level: 1
          }
        }
      ]

      const { chunks, stats } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: true, layer2: false, layer3: false, layer4: false }
      })

      expect(chunks).toHaveLength(2)
      expect(stats.exact).toBe(2)
      expect(chunks[0].method).toBe('exact_match')
      expect(chunks[0].confidence).toBe('exact')
      expect(chunks[0].start_offset).toBe(0)
      expect(chunks[0].end_offset).toBe(24)
    })

    it('matches with normalized whitespace (Strategy 2)', async () => {
      const markdown = 'This is   the    first chunk.'  // Extra whitespace
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'This is the first chunk.',  // Normal whitespace
          meta: { page_start: 1, page_end: 1 }
        }
      ]

      const { chunks, stats } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: true, layer2: false, layer3: false, layer4: false }
      })

      expect(chunks).toHaveLength(1)
      expect(chunks[0].method).toBe('normalized_match')
      expect(chunks[0].confidence).toBe('high')
    })

    it('matches with multi-anchor search (Strategy 3)', async () => {
      const markdown = 'Start of chunk... [middle content heavily modified] ... end of chunk.'
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'Start of chunk... [middle content original] ... end of chunk.',
          meta: { page_start: 1, page_end: 1 }
        }
      ]

      const { chunks } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: true, layer2: false, layer3: false, layer4: false }
      })

      expect(chunks).toHaveLength(1)
      expect(chunks[0].method).toBe('multi_anchor_search')
      expect(chunks[0].confidence).toBe('high')
    })
  })

  describe('Layer 2: Embeddings-Based Matching', () => {
    it('uses embeddings for unmatched chunks', async () => {
      const markdown = 'This is completely different content.'
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'This is original content that was heavily rewritten.',
          meta: { page_start: 1, page_end: 1 }
        }
      ]

      const { chunks } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: false, layer2: true, layer3: false, layer4: false }
      })

      expect(chunks).toHaveLength(1)
      expect(chunks[0].method).toBe('embeddings')
      expect(chunks[0].confidence).toMatch(/high|medium/)
      expect(mockEmbeddingPipeline).toHaveBeenCalled()
    })
  })

  describe('Layer 3: LLM-Assisted Matching', () => {
    it('uses LLM for unmatched chunks', async () => {
      const markdown = 'Some context before. The actual chunk content. Some context after.'
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'The actual chunk content.',
          meta: { page_start: 1, page_end: 1 }
        }
      ]

      // Mock LLM to find the chunk
      mockOllamaClient.generateStructured.mockResolvedValueOnce({
        found: true,
        start_offset: 21,
        end_offset: 46,
        confidence: 'high'
      })

      const { chunks } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: false, layer2: false, layer3: true, layer4: false }
      })

      expect(chunks).toHaveLength(1)
      expect(chunks[0].method).toBe('llm_assisted')
      expect(chunks[0].confidence).toBe('medium')
      expect(mockOllamaClient.generateStructured).toHaveBeenCalled()
    })

    it('handles LLM failures gracefully', async () => {
      const markdown = 'Some content.'
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'Missing content.',
          meta: { page_start: 1, page_end: 1 }
        }
      ]

      // Mock LLM to fail
      mockOllamaClient.generateStructured.mockRejectedValueOnce(new Error('LLM timeout'))

      const { chunks } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: false, layer2: false, layer3: true, layer4: true }
      })

      // Should fall through to Layer 4 (interpolation)
      expect(chunks).toHaveLength(1)
      expect(chunks[0].method).toBe('interpolation')
      expect(chunks[0].confidence).toBe('synthetic')
    })
  })

  describe('Layer 4: Anchor Interpolation', () => {
    it('interpolates positions for unmatched chunks', async () => {
      const markdown = 'A'.repeat(1000) + 'B'.repeat(1000) + 'C'.repeat(1000)
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'A'.repeat(100),  // Will match at start
          meta: { page_start: 1, page_end: 1 }
        },
        {
          index: 1,
          content: 'MISSING',  // Won't match
          meta: { page_start: 2, page_end: 2 }
        },
        {
          index: 2,
          content: 'C'.repeat(100),  // Will match at end
          meta: { page_start: 3, page_end: 3 }
        }
      ]

      const { chunks, stats, warnings } = await bulletproofMatch(markdown, doclingChunks)

      expect(chunks).toHaveLength(3)
      expect(stats.synthetic).toBe(1)
      expect(chunks[1].method).toBe('interpolation')
      expect(chunks[1].confidence).toBe('synthetic')
      expect(chunks[1].start_offset).toBeGreaterThan(0)
      expect(chunks[1].start_offset).toBeLessThan(markdown.length)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('Chunk 1')
      expect(warnings[0]).toContain('approximate')
    })

    it('never fails - guarantees 100% recovery', async () => {
      const markdown = 'Some content'
      const doclingChunks: DoclingChunk[] = Array.from({ length: 100 }, (_, i) => ({
        index: i,
        content: `Nonexistent chunk ${i}`,
        meta: { page_start: i + 1, page_end: i + 1 }
      }))

      const { chunks, stats } = await bulletproofMatch(markdown, doclingChunks, {
        enabledLayers: { layer1: false, layer2: false, layer3: false, layer4: true }
      })

      // CRITICAL: All chunks must be recovered
      expect(chunks).toHaveLength(100)
      expect(stats.synthetic).toBe(100)
      expect(stats.total).toBe(100)
    })
  })

  describe('Orchestrator Integration', () => {
    it('runs all layers in sequence until 100% recovery', async () => {
      const markdown = `
        Chapter 1: Introduction
        This is the first chunk with exact match.

        This    is   the   second chunk with   normalized whitespace.

        Start of third chunk... [heavily modified middle] ... end of third.

        Fourth chunk that requires embeddings.

        Final content.
      `.trim()

      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'This is the first chunk with exact match.',
          meta: { page_start: 1, page_end: 1 }
        },
        {
          index: 1,
          content: 'This is the second chunk with normalized whitespace.',
          meta: { page_start: 1, page_end: 1 }
        },
        {
          index: 2,
          content: 'Start of third chunk... [original middle] ... end of third.',
          meta: { page_start: 2, page_end: 2 }
        },
        {
          index: 3,
          content: 'Fourth chunk completely different.',
          meta: { page_start: 2, page_end: 2 }
        },
        {
          index: 4,
          content: 'Nonexistent chunk.',
          meta: { page_start: 3, page_end: 3 }
        }
      ]

      const { chunks, stats, warnings } = await bulletproofMatch(markdown, doclingChunks)

      // All chunks must be matched
      expect(chunks).toHaveLength(5)
      expect(stats.total).toBe(5)

      // Stats should show distribution across layers
      expect(stats.byLayer.layer1).toBeGreaterThan(0)  // At least some exact/fuzzy matches
      expect(stats.byLayer.layer4).toBeGreaterThan(0)  // At least some interpolations

      // Synthetic chunks should have warnings
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('preserves all Docling metadata', async () => {
      const markdown = 'This is chunk content.'
      const doclingChunks: DoclingChunk[] = [
        {
          index: 0,
          content: 'This is chunk content.',
          meta: {
            page_start: 42,
            page_end: 43,
            heading_path: ['Chapter 5', 'Section 5.2'],
            heading_level: 2,
            section_marker: 'sec_5_2',
            bboxes: [
              { page: 42, l: 100, t: 200, r: 500, b: 250 }
            ]
          }
        }
      ]

      const { chunks } = await bulletproofMatch(markdown, doclingChunks)

      expect(chunks[0].chunk.meta.page_start).toBe(42)
      expect(chunks[0].chunk.meta.page_end).toBe(43)
      expect(chunks[0].chunk.meta.heading_path).toEqual(['Chapter 5', 'Section 5.2'])
      expect(chunks[0].chunk.meta.heading_level).toBe(2)
      expect(chunks[0].chunk.meta.section_marker).toBe('sec_5_2')
      expect(chunks[0].chunk.meta.bboxes).toHaveLength(1)
      expect(chunks[0].chunk.meta.bboxes![0].page).toBe(42)
    })

    it('returns chunks in correct order', async () => {
      const markdown = 'A B C D E'
      const doclingChunks: DoclingChunk[] = [
        { index: 0, content: 'A', meta: {} },
        { index: 1, content: 'B', meta: {} },
        { index: 2, content: 'C', meta: {} },
        { index: 3, content: 'D', meta: {} },
        { index: 4, content: 'E', meta: {} }
      ]

      const { chunks } = await bulletproofMatch(markdown, doclingChunks)

      // Chunks should maintain original order by index
      expect(chunks[0].chunk.index).toBe(0)
      expect(chunks[1].chunk.index).toBe(1)
      expect(chunks[2].chunk.index).toBe(2)
      expect(chunks[3].chunk.index).toBe(3)
      expect(chunks[4].chunk.index).toBe(4)
    })

    it('provides accurate statistics', async () => {
      const markdown = 'A B C D E'
      const doclingChunks: DoclingChunk[] = Array.from({ length: 5 }, (_, i) => ({
        index: i,
        content: String.fromCharCode(65 + i),  // A, B, C, D, E
        meta: {}
      }))

      const { stats } = await bulletproofMatch(markdown, doclingChunks)

      expect(stats.total).toBe(5)
      expect(stats.exact + stats.high + stats.medium + stats.synthetic).toBe(5)
      expect(stats.processingTime).toBeGreaterThan(0)
      expect(stats.byLayer.layer1 + stats.byLayer.layer2 + stats.byLayer.layer3 + stats.byLayer.layer4).toBe(5)
    })

    it('calls progress callback for each layer', async () => {
      const markdown = 'A B C'
      const doclingChunks: DoclingChunk[] = Array.from({ length: 3 }, (_, i) => ({
        index: i,
        content: String.fromCharCode(65 + i),
        meta: {}
      }))

      const progressCalls: Array<{ layer: number; matched: number; remaining: number }> = []

      await bulletproofMatch(markdown, doclingChunks, {
        onProgress: (layerNum, matched, remaining) => {
          progressCalls.push({ layer: layerNum, matched, remaining })
        }
      })

      expect(progressCalls.length).toBeGreaterThan(0)
      expect(progressCalls[0].layer).toBe(1)  // Layer 1 called first
    })
  })

  describe('Error Handling', () => {
    it('throws error if chunk count mismatch', async () => {
      // This should never happen in practice, but test defensive programming
      const markdown = 'Content'
      const doclingChunks: DoclingChunk[] = []

      await expect(
        bulletproofMatch(markdown, doclingChunks)
      ).rejects.toThrow('Chunk count mismatch')
    })
  })

  describe('Performance', () => {
    it('processes 400 chunks in reasonable time', async () => {
      const markdown = 'A'.repeat(200000)  // 200KB document
      const doclingChunks: DoclingChunk[] = Array.from({ length: 400 }, (_, i) => ({
        index: i,
        content: 'A'.repeat(500),  // 500-char chunks
        meta: { page_start: Math.floor(i / 10) + 1, page_end: Math.floor(i / 10) + 1 }
      }))

      const startTime = Date.now()
      const { chunks, stats } = await bulletproofMatch(markdown, doclingChunks, {
        // Disable expensive layers for performance test
        enabledLayers: { layer1: true, layer2: false, layer3: false, layer4: true }
      })
      const elapsed = Date.now() - startTime

      expect(chunks).toHaveLength(400)
      expect(elapsed).toBeLessThan(10000)  // Should complete in <10 seconds
      console.log(`[Performance] 400 chunks matched in ${elapsed}ms`)
    })
  })
})
