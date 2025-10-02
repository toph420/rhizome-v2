// Type definitions (will be imported from actual types when available)
type ChunkMetadata = {
  structural?: any
  semantic?: any
  temporal?: any
  domain?: any
  quality?: any
  [key: string]: any
}

type Chunk = {
  id: string
  document_id: string
  content: string
  chunk_index: number
  embedding: number[]
  metadata?: ChunkMetadata
  created_at: Date
}

type ProcessedChunk = Chunk & {
  chunk_type?: string
  token_count?: number
  heading_context?: string | null
  code_language?: string | null
  structural_metadata?: any
  semantic_metadata?: any
  temporal_metadata?: any
  domain_metadata?: any
  quality_metadata?: any
  processing_metadata?: any
}

interface ChunkOverrides {
  id?: string
  document_id?: string
  content?: string
  chunk_index?: number
  embedding?: number[]
  metadata?: Partial<ChunkMetadata>
  created_at?: Date
}

export function createChunkFactory() {
  let idCounter = 1

  /**
   * Generate a mock embedding vector
   */
  function generateEmbedding(seed: number = 1): number[] {
    const dimension = 768
    const embedding = new Array(dimension)
    for (let i = 0; i < dimension; i++) {
      // Generate deterministic pseudo-random values based on seed
      embedding[i] = Math.sin(seed * (i + 1)) * 0.5 + 0.5
    }
    return embedding
  }

  return {
    /**
     * Create a single chunk with default values
     */
    create(overrides: ChunkOverrides = {}): Chunk {
      const id = overrides.id || `chunk-test-${idCounter++}`

      return {
        id,
        document_id: overrides.document_id || 'doc-test-001',
        content: overrides.content || `This is test chunk content for ${id}`,
        chunk_index: overrides.chunk_index ?? idCounter - 1,
        embedding: overrides.embedding || generateEmbedding(idCounter - 1),
        metadata: {
          structural: {
            headingContext: [],
            listContext: null,
            blockType: 'paragraph',
            isComplete: true,
            continuationOf: null,
            continuesTo: null,
            indentationLevel: 0,
            ...overrides.metadata?.structural
          },
          semantic: {
            topics: [],
            entities: [],
            keywords: [],
            sentiment: { polarity: 0, magnitude: 0 },
            language: 'en',
            ...overrides.metadata?.semantic
          },
          temporal: {
            documentOrder: overrides.chunk_index ?? idCounter - 1,
            sectionOrder: 0,
            references: { internal: [], external: [] },
            ...overrides.metadata?.temporal
          },
          quality: {
            contentDensity: 0.5,
            informationScore: 0.7,
            coherenceScore: 0.8,
            completeness: 1.0,
            ...overrides.metadata?.quality
          },
          ...overrides.metadata
        },
        created_at: overrides.created_at || new Date()
      }
    },

    /**
     * Create a processed chunk (includes more fields)
     */
    createProcessed(overrides: Partial<ProcessedChunk> = {}): ProcessedChunk {
      const chunk = this.create(overrides)

      return {
        ...chunk,
        chunk_type: overrides.chunk_type || 'paragraph',
        token_count: overrides.token_count ?? chunk.content.split(' ').length,
        heading_context: overrides.heading_context || null,
        code_language: overrides.code_language || null,
        structural_metadata: overrides.structural_metadata || chunk.metadata?.structural || {},
        semantic_metadata: overrides.semantic_metadata || chunk.metadata?.semantic || {},
        temporal_metadata: overrides.temporal_metadata || chunk.metadata?.temporal || {},
        domain_metadata: overrides.domain_metadata || {},
        quality_metadata: overrides.quality_metadata || chunk.metadata?.quality || {},
        processing_metadata: overrides.processing_metadata || {
          extractedAt: new Date(),
          processorVersion: '1.0.0',
          retryCount: 0
        }
      }
    },

    /**
     * Create a code chunk
     */
    createCode(overrides: ChunkOverrides = {}): Chunk {
      return this.create({
        content: overrides.content || `function test() {\n  return "Hello, World!";\n}`,
        metadata: {
          structural: {
            blockType: 'code',
            ...overrides.metadata?.structural
          },
          ...overrides.metadata
        },
        ...overrides
      })
    },

    /**
     * Create a heading chunk
     */
    createHeading(level: number = 1, overrides: ChunkOverrides = {}): Chunk {
      return this.create({
        content: overrides.content || `Test Heading Level ${level}`,
        metadata: {
          structural: {
            blockType: 'heading',
            indentationLevel: level,
            ...overrides.metadata?.structural
          },
          ...overrides.metadata
        },
        ...overrides
      })
    },

    /**
     * Create multiple chunks for the same document
     */
    createMany(count: number, documentId: string, overrides: ChunkOverrides = {}): Chunk[] {
      return Array.from({ length: count }, (_, i) =>
        this.create({
          document_id: documentId,
          chunk_index: i,
          content: `Test chunk ${i + 1} content`,
          ...overrides
        })
      )
    },

    /**
     * Create chunks that simulate a document structure
     */
    createDocumentStructure(documentId: string): Chunk[] {
      return [
        this.createHeading(1, {
          document_id: documentId,
          chunk_index: 0,
          content: 'Introduction'
        }),
        this.create({
          document_id: documentId,
          chunk_index: 1,
          content: 'This is the introduction paragraph.'
        }),
        this.createHeading(2, {
          document_id: documentId,
          chunk_index: 2,
          content: 'Background'
        }),
        this.create({
          document_id: documentId,
          chunk_index: 3,
          content: 'Here is some background information.'
        }),
        this.createCode({
          document_id: documentId,
          chunk_index: 4
        }),
        this.createHeading(2, {
          document_id: documentId,
          chunk_index: 5,
          content: 'Conclusion'
        }),
        this.create({
          document_id: documentId,
          chunk_index: 6,
          content: 'In conclusion, this test demonstrates document structure.'
        })
      ]
    },

    /**
     * Reset the ID counter for test isolation
     */
    reset() {
      idCounter = 1
    }
  }
}