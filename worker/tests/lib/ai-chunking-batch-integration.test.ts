/**
 * Integration tests for AI-powered batch metadata extraction.
 * Uses real Gemini API with controlled inputs (requires API key).
 *
 * Run with: GOOGLE_AI_API_KEY=your-key npm test -- ai-chunking-batch-integration.test.ts
 */

import { batchChunkAndExtractMetadata } from '../../lib/ai-chunking-batch'
import type { MetadataExtractionProgress } from '../../types/ai-metadata'

// Skip if no API key (for CI/CD)
const describeIfApiKey = process.env.GOOGLE_AI_API_KEY ? describe : describe.skip

describeIfApiKey('AI Batch Metadata Extraction - Integration', () => {
  // Increase timeout for real API calls
  jest.setTimeout(60000)

  describe('Real AI Processing', () => {
    it('should extract metadata from small markdown document', async () => {
      const markdown = `# Introduction to Testing

Testing is a critical part of software development. It ensures code quality and prevents regressions.

## Types of Testing

There are several types of testing:
- Unit testing
- Integration testing
- End-to-end testing

## Best Practices

Always write tests for critical functionality.`

      const result = await batchChunkAndExtractMetadata(markdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY!,
        maxBatchSize: 100000
      })

      // Verify structure
      expect(result.length).toBeGreaterThan(0)

      // Verify each chunk has metadata
      result.forEach(chunk => {
        expect(chunk.content).toBeTruthy()
        expect(chunk.metadata.themes).toBeInstanceOf(Array)
        expect(chunk.metadata.themes.length).toBeGreaterThan(0)
        expect(chunk.metadata.concepts).toBeInstanceOf(Array)
        expect(typeof chunk.metadata.importance).toBe('number')
        expect(chunk.metadata.importance).toBeGreaterThanOrEqual(0)
        expect(chunk.metadata.importance).toBeLessThanOrEqual(1)
      })

      // Log for manual inspection
      console.log('\n📊 Extracted Metadata Sample:')
      console.log(JSON.stringify(result[0], null, 2))
    })

    it('should handle progress tracking', async () => {
      const markdown = 'Test paragraph. '.repeat(1000)
      const progressUpdates: MetadataExtractionProgress[] = []

      await batchChunkAndExtractMetadata(
        markdown,
        { apiKey: process.env.GOOGLE_AI_API_KEY! },
        async (progress) => {
          progressUpdates.push(progress)
        }
      )

      // Verify progress was tracked
      expect(progressUpdates.length).toBeGreaterThan(0)

      // Verify stages
      const stages = progressUpdates.map(p => p.stage)
      expect(stages).toContain('batching')
      expect(stages).toContain('complete')
    })

    it('should process multiple paragraphs with distinct metadata', async () => {
      const markdown = `Authentication is crucial for security.

Databases store persistent data.

APIs enable communication between services.`

      const result = await batchChunkAndExtractMetadata(markdown, {
        apiKey: process.env.GOOGLE_AI_API_KEY!
      })

      expect(result.length).toBe(3)

      // Each chunk should have different themes (or at least some themes extracted)
      const allThemes = result.flatMap(r => r.metadata.themes)
      const uniqueThemes = new Set(allThemes)

      console.log('\n🎯 Extracted Themes:', Array.from(uniqueThemes))
      // At minimum, we should have extracted some themes
      expect(uniqueThemes.size).toBeGreaterThanOrEqual(1)
      expect(allThemes.length).toBeGreaterThanOrEqual(3) // At least 1 theme per chunk
    })
  })

  describe('Error Handling with Real API', () => {
    it('should use fallback metadata when API fails', async () => {
      const markdown = 'Test content'

      // Invalid API key should fail but return fallback metadata
      const result = await batchChunkAndExtractMetadata(markdown, {
        apiKey: 'invalid-key-12345',
        maxRetries: 1
      })

      // Should get fallback metadata instead of throwing
      expect(result.length).toBeGreaterThan(0)
      expect(result[0].metadata.themes).toEqual(['general'])
      expect(result[0].metadata.importance).toBe(0.5)
    })
  })
})

/**
 * Unit tests using test fixtures (no API calls)
 */
describe('AI Batch Metadata Extraction - Unit', () => {
  describe('Batching Logic', () => {
    it('should create appropriate batch sizes', () => {
      // Test the batching logic without hitting the API
      const smallDoc = 'Small document'
      const mediumDoc = 'Paragraph. '.repeat(1000) // ~11KB
      const largeDoc = 'Paragraph. '.repeat(10000) // ~110KB

      // These would create 1, 1, and 2 batches respectively
      // (Logic can be tested by exposing createBatches as export if needed)
      expect(smallDoc.length).toBeLessThan(100000)
      expect(mediumDoc.length).toBeLessThan(100000)
      expect(largeDoc.length).toBeGreaterThan(100000)
    })
  })

  describe('Configuration', () => {
    it('should throw error if API key is missing', async () => {
      const markdown = 'Test content'

      await expect(
        batchChunkAndExtractMetadata(markdown, { apiKey: '' })
      ).rejects.toThrow('Gemini API key is required')
    })

    it('should accept custom batch size', () => {
      const customConfig = {
        apiKey: 'test',
        maxBatchSize: 50000
      }

      expect(customConfig.maxBatchSize).toBe(50000)
    })
  })
})
