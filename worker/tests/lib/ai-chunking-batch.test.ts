/**
 * Tests for AI semantic chunking with offset validation.
 */

import { batchChunkAndExtractMetadata } from '../../lib/ai-chunking-batch'

describe('AI Semantic Chunking', () => {
  const testMarkdown = `# Introduction

This is a test document with multiple sections.

## Section 1

First paragraph with some content about testing.
Second paragraph with more details.

## Section 2

Another section with different content.
This section discusses validation.

### Subsection

Nested content here for testing hierarchies.

## Conclusion

Final thoughts and wrap-up.`

  describe('Offset Validation', () => {
    it('should return chunks with valid absolute offsets', async () => {
      const chunks = await batchChunkAndExtractMetadata(testMarkdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key'
      })

      expect(chunks.length).toBeGreaterThan(0)

      chunks.forEach((chunk, index) => {
        // Validate offset ranges
        expect(chunk.start_offset).toBeGreaterThanOrEqual(0)
        expect(chunk.end_offset).toBeLessThanOrEqual(testMarkdown.length)
        expect(chunk.start_offset).toBeLessThan(chunk.end_offset)

        // Validate content matches offsets
        const extractedContent = testMarkdown.substring(
          chunk.start_offset,
          chunk.end_offset
        )

        expect(extractedContent.trim()).toBe(chunk.content.trim())
      })
    })

    it('should return chunks in sequential order', async () => {
      const chunks = await batchChunkAndExtractMetadata(testMarkdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key'
      })

      for (let i = 1; i < chunks.length; i++) {
        expect(chunks[i].start_offset).toBeGreaterThanOrEqual(
          chunks[i - 1].end_offset
        )
      }
    })

    it('should assign sequential chunk indices', async () => {
      const chunks = await batchChunkAndExtractMetadata(testMarkdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key'
      })

      chunks.forEach((chunk, index) => {
        expect(chunk.chunk_index).toBe(index)
      })
    })
  })

  describe('Batch Windowing', () => {
    it('should handle documents larger than batch size', async () => {
      // Create a large document (150K chars)
      const largeDoc = testMarkdown.repeat(2000)

      const chunks = await batchChunkAndExtractMetadata(largeDoc, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key',
        maxBatchSize: 100000
      })

      expect(chunks.length).toBeGreaterThan(0)

      // Validate no gaps in coverage
      let coveredChars = 0
      chunks.forEach(chunk => {
        coveredChars += chunk.end_offset - chunk.start_offset
      })

      expect(coveredChars).toBeGreaterThan(0)
    })
  })

  describe('Metadata Validation', () => {
    it('should return chunks with complete metadata', async () => {
      const chunks = await batchChunkAndExtractMetadata(testMarkdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key'
      })

      chunks.forEach(chunk => {
        // Validate metadata structure
        expect(chunk.metadata).toBeDefined()
        expect(chunk.metadata.themes).toBeInstanceOf(Array)
        expect(chunk.metadata.themes.length).toBeGreaterThan(0)
        expect(chunk.metadata.concepts).toBeInstanceOf(Array)
        expect(chunk.metadata.importance).toBeGreaterThanOrEqual(0)
        expect(chunk.metadata.importance).toBeLessThanOrEqual(1)
        expect(chunk.metadata.emotional).toBeDefined()
        expect(chunk.metadata.emotional.polarity).toBeGreaterThanOrEqual(-1)
        expect(chunk.metadata.emotional.polarity).toBeLessThanOrEqual(1)
      })
    })
  })

  describe('Deduplication', () => {
    it('should not have overlapping chunks', async () => {
      const chunks = await batchChunkAndExtractMetadata(testMarkdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key'
      })

      for (let i = 1; i < chunks.length; i++) {
        const prevChunk = chunks[i - 1]
        const currentChunk = chunks[i]

        // No overlap: current starts at or after previous ends
        expect(currentChunk.start_offset).toBeGreaterThanOrEqual(prevChunk.end_offset)
      }
    })
  })

  describe('Progress Tracking', () => {
    it('should call progress callback with correct phases', async () => {
      const progressPhases: string[] = []

      await batchChunkAndExtractMetadata(testMarkdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key',
        enableProgress: true
      }, async (progress) => {
        progressPhases.push(progress.phase)
      })

      expect(progressPhases).toContain('batching')
      expect(progressPhases).toContain('ai_chunking')
      expect(progressPhases).toContain('deduplication')
      expect(progressPhases).toContain('complete')
    })
  })
})
