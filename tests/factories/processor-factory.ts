import { createChunkFactory } from './chunk-factory'

// Type definitions (will be imported from actual types when available)
type ProcessedDocument = {
  markdown: string
  chunks: any[]
  metadata: Record<string, any>
  embeddingsGenerated: boolean
  totalTokens: number
  error: Error | null
}

type ProcessedChunk = any // Using any temporarily for compatibility

interface ProcessorOverrides {
  markdown?: string
  chunks?: ProcessedChunk[]
  metadata?: Record<string, any>
  embeddingsGenerated?: boolean
  totalTokens?: number
  error?: Error | null
}

export function createProcessorFactory() {
  const chunkFactory = createChunkFactory()

  return {
    /**
     * Create a processed document result
     */
    createProcessedDocument(overrides: ProcessorOverrides = {}): ProcessedDocument {
      const chunks = overrides.chunks || [
        chunkFactory.createProcessed({ chunk_index: 0 }),
        chunkFactory.createProcessed({ chunk_index: 1 }),
        chunkFactory.createProcessed({ chunk_index: 2 })
      ]

      return {
        markdown: overrides.markdown || '# Test Document\n\nThis is test markdown content.\n\n## Section 1\n\nContent here.',
        chunks,
        metadata: overrides.metadata || {
          title: 'Test Document',
          author: 'Test Author',
          wordCount: 100,
          language: 'en'
        },
        embeddingsGenerated: overrides.embeddingsGenerated ?? true,
        totalTokens: overrides.totalTokens ?? chunks.reduce((sum, c) => sum + (c.token_count || 0), 0),
        error: overrides.error || null
      }
    },

    /**
     * Create a PDF processing result
     */
    createPDFResult(overrides: ProcessorOverrides = {}): ProcessedDocument {
      return this.createProcessedDocument({
        metadata: {
          source_type: 'pdf',
          pageCount: 10,
          ...overrides.metadata
        },
        ...overrides
      })
    },

    /**
     * Create a YouTube processing result
     */
    createYouTubeResult(overrides: ProcessorOverrides = {}): ProcessedDocument {
      return this.createProcessedDocument({
        markdown: overrides.markdown || '[00:00:00] Welcome to this test video\n\n[00:01:30] Main content begins here',
        metadata: {
          source_type: 'youtube',
          duration: 600,
          channel: 'Test Channel',
          videoId: 'test123',
          ...overrides.metadata
        },
        ...overrides
      })
    },

    /**
     * Create a web article processing result
     */
    createWebResult(overrides: ProcessorOverrides = {}): ProcessedDocument {
      return this.createProcessedDocument({
        metadata: {
          source_type: 'web',
          url: 'https://example.com/article',
          domain: 'example.com',
          publishDate: new Date().toISOString(),
          ...overrides.metadata
        },
        ...overrides
      })
    },

    /**
     * Create a failed processing result
     */
    createFailedResult(error: string = 'Test processing error'): ProcessedDocument {
      return {
        markdown: '',
        chunks: [],
        metadata: {},
        embeddingsGenerated: false,
        totalTokens: 0,
        error: new Error(error)
      }
    },

    /**
     * Create a processing result with specific chunk count
     */
    createWithChunkCount(count: number, overrides: ProcessorOverrides = {}): ProcessedDocument {
      const chunks = Array.from({ length: count }, (_, i) =>
        chunkFactory.createProcessed({
          chunk_index: i,
          content: `Chunk ${i + 1} content`
        })
      )

      return this.createProcessedDocument({
        chunks,
        ...overrides
      })
    }
  }
}