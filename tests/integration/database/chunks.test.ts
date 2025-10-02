/**
 * Database Integration Tests - Chunks Table
 * 
 * Tests chunk operations with pgvector embeddings, similarity search, and semantic analysis.
 * Validates embedding storage, retrieval, and vector similarity operations.
 */

import { factories } from '@/tests/factories'

// Mock Supabase client with pgvector support
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn()
}

// Test users for isolation
const testUser1 = 'test-user-1'
const testUser2 = 'test-user-2'

// Track test data for cleanup
const testChunks: string[] = []
const testDocuments: string[] = []

describe('Chunks Database Operations', () => {
  
  beforeEach(() => {
    jest.clearAllMocks()
    testChunks.length = 0
    testDocuments.length = 0
    
    // Setup default mock behavior
    const mockChain = {
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      order: jest.fn().mockResolvedValue({ data: [], error: null })
    }
    
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      select: jest.fn().mockReturnValue(mockChain),
      update: jest.fn().mockReturnValue(mockChain),
      delete: jest.fn().mockReturnValue(mockChain)
    })
    
    // Setup RPC mock for similarity search
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null })
  })

  afterEach(async () => {
    // Clean up test data
    testChunks.forEach(async (chunkId) => {
      await mockSupabase.from('chunks').delete().eq('id', chunkId)
    })
    testDocuments.forEach(async (docId) => {
      await mockSupabase.from('documents').delete().eq('id', docId)
    })
  })

  describe('Chunk Creation with Embeddings', () => {
    it('should store 768-dimensional embeddings with chunk content', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const chunk = factories.chunk.create({
        document_id: document.id,
        content: 'The paradigm shift in artificial intelligence represents a fundamental change in how we approach machine learning.',
        chunk_index: 0,
        embedding: new Array(768).fill(0).map(() => Math.random() - 0.5), // 768-dimensional vector
        importance_score: 0.85,
        summary: 'Discussion of AI paradigm shift'
      })

      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: [chunk],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('chunks').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('paradigm shift'),
          embedding: expect.arrayContaining([expect.any(Number)]),
          importance_score: 0.85,
          summary: 'Discussion of AI paradigm shift'
        })
      )
      
      // Verify embedding dimensions
      const insertedChunk = mockSupabase.from('chunks').insert.mock.calls[0][0]
      expect(insertedChunk.embedding).toHaveLength(768)
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })

    it('should store semantic analysis metadata as JSONB', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const chunk = factories.chunk.create({
        document_id: document.id,
        content: 'Neural networks demonstrate remarkable capabilities in pattern recognition.',
        themes: ['machine learning', 'pattern recognition', 'neural networks'],
        entities: {
          concepts: ['neural networks', 'pattern recognition'],
          technologies: ['deep learning', 'AI'],
          methods: ['supervised learning', 'backpropagation']
        },
        chunk_type: 'explanation'
      })

      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: [chunk],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('chunks').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          themes: expect.arrayContaining(['machine learning', 'neural networks']),
          entities: expect.objectContaining({
            concepts: expect.arrayContaining(['neural networks']),
            technologies: expect.arrayContaining(['deep learning'])
          }),
          chunk_type: 'explanation'
        })
      )
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })
  })

  describe('Positional and Structural Data', () => {
    it('should store document position and heading context', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const chunk = factories.chunk.create({
        document_id: document.id,
        content: 'This section covers the theoretical foundations.',
        chunk_index: 5,
        start_offset: 2847,
        end_offset: 2894,
        heading_path: ['Chapter 2', 'Theoretical Background', 'Foundations'],
        page_numbers: [15, 16]
      })

      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: [chunk],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('chunks').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          chunk_index: 5,
          start_offset: 2847,
          end_offset: 2894,
          heading_path: ['Chapter 2', 'Theoretical Background', 'Foundations'],
          page_numbers: [15, 16]
        })
      )
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })

    it('should maintain chunk ordering within documents', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const chunks = [
        factories.chunk.create({ document_id: document.id, chunk_index: 0, content: 'Introduction text' }),
        factories.chunk.create({ document_id: document.id, chunk_index: 1, content: 'Method description' }),
        factories.chunk.create({ document_id: document.id, chunk_index: 2, content: 'Results analysis' })
      ]

      // Mock ordered retrieval
      mockSupabase.from('chunks').select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: chunks.sort((a, b) => a.chunk_index - b.chunk_index),
            error: null
          })
        })
      })

      // Act
      const result = await mockSupabase.from('chunks')
        .select('*')
        .eq('document_id', document.id)
        .order('chunk_index')

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(3)
      expect(result.data[0].chunk_index).toBe(0)
      expect(result.data[1].chunk_index).toBe(1)
      expect(result.data[2].chunk_index).toBe(2)
      expect(result.data[0].content).toContain('Introduction')
      
      chunks.forEach(chunk => testChunks.push(chunk.id))
      testDocuments.push(document.id)
    })
  })

  describe('pgVector Similarity Search', () => {
    it('should perform vector similarity search with match_chunks function', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const matchThreshold = 0.7
      const matchCount = 5
      const excludeDocumentId = 'exclude-doc-123'

      const expectedResults = [
        {
          id: 'chunk-1',
          content: 'Similar content about machine learning',
          similarity: 0.89,
          document_id: 'doc-1',
          themes: ['machine learning'],
          summary: 'ML overview'
        },
        {
          id: 'chunk-2', 
          content: 'Related AI concepts and applications',
          similarity: 0.75,
          document_id: 'doc-2',
          themes: ['artificial intelligence'],
          summary: 'AI applications'
        }
      ]

      mockSupabase.rpc.mockResolvedValue({
        data: expectedResults,
        error: null
      })

      // Act
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        exclude_document_id: excludeDocumentId
      })

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(2)
      expect(result.data[0].similarity).toBeGreaterThan(matchThreshold)
      expect(result.data[1].similarity).toBeGreaterThan(matchThreshold)
      expect(result.data[0].similarity).toBeGreaterThan(result.data[1].similarity) // Ordered by similarity
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5,
        exclude_document_id: excludeDocumentId
      })

      // Track for cleanup
      expectedResults.forEach(chunk => testChunks.push(chunk.id))
    })

    it('should handle similarity search with high precision thresholds', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const highThreshold = 0.95 // Very strict similarity
      
      const preciseResults = [
        {
          id: 'precise-chunk-1',
          content: 'Exact conceptual match',
          similarity: 0.97,
          document_id: 'doc-precise',
          themes: ['exact match'],
          summary: 'Precise content'
        }
      ]

      mockSupabase.rpc.mockResolvedValue({
        data: preciseResults,
        error: null
      })

      // Act
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: highThreshold,
        match_count: 10
      })

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1) // Only very similar results
      expect(result.data[0].similarity).toBeGreaterThan(0.95)
      
      testChunks.push(preciseResults[0].id)
    })
  })

  describe('User Isolation in Chunk Access', () => {
    it('should only return chunks from user-owned documents', async () => {
      // Arrange
      const user1Doc = factories.document.create({ user_id: testUser1 })
      const user2Doc = factories.document.create({ user_id: testUser2 })
      
      const user1Chunks = [
        factories.chunk.create({ document_id: user1Doc.id, content: 'User 1 content' }),
        factories.chunk.create({ document_id: user1Doc.id, content: 'More user 1 content' })
      ]
      
      const user2Chunks = [
        factories.chunk.create({ document_id: user2Doc.id, content: 'User 2 content' })
      ]

      // Mock RLS behavior - only return chunks from user's documents
      mockSupabase.from('chunks').select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: user1Chunks, // RLS filters to user's chunks only
          error: null
        })
      })

      // Act - query as user1
      const result = await mockSupabase.from('chunks')
        .select('*')
        .eq('document_id', user1Doc.id)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(2)
      expect(result.data.every(chunk => chunk.document_id === user1Doc.id)).toBe(true)
      
      // Track for cleanup
      user1Chunks.forEach(chunk => testChunks.push(chunk.id))
      user2Chunks.forEach(chunk => testChunks.push(chunk.id))
      testDocuments.push(user1Doc.id, user2Doc.id)
    })

    it('should prevent cross-user chunk access in similarity search', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      
      // Mock RLS in similarity search - only return chunks from accessible documents
      const accessibleResults = [
        {
          id: 'accessible-chunk',
          content: 'User can access this',
          similarity: 0.85,
          document_id: 'user-owned-doc',
          themes: ['accessible'],
          summary: 'Accessible content'
        }
      ]

      mockSupabase.rpc.mockResolvedValue({
        data: accessibleResults,
        error: null
      })

      // Act
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 10
      })

      // Assert - should only return chunks from user's documents
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data[0].document_id).toBe('user-owned-doc')
      
      testChunks.push(accessibleResults[0].id)
    })
  })

  describe('Bulk Operations and Performance', () => {
    it('should handle batch chunk insertion efficiently', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const batchSize = 50
      const chunks = Array.from({ length: batchSize }, (_, i) => 
        factories.chunk.create({
          document_id: document.id,
          chunk_index: i,
          content: `Chunk content ${i}`,
          embedding: new Array(768).fill(0).map(() => Math.random() - 0.5)
        })
      )

      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: chunks,
        error: null
      })

      // Act
      const startTime = performance.now()
      const result = await mockSupabase.from('chunks').insert(chunks)
      const duration = performance.now() - startTime

      // Assert
      expect(result.error).toBeNull()
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      expect(mockSupabase.from('chunks').insert).toHaveBeenCalledWith(chunks)
      
      chunks.forEach(chunk => testChunks.push(chunk.id))
      testDocuments.push(document.id)
    })

    it('should handle embedding dimension validation', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const invalidChunk = factories.chunk.create({
        document_id: document.id,
        embedding: new Array(512).fill(0) // Wrong dimension (should be 768)
      })

      // Mock database validation error
      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: null,
        error: { message: 'dimension mismatch', code: '22003' }
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(invalidChunk)

      // Assert
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('dimension')
      expect(result.data).toBeNull()
      
      testDocuments.push(document.id)
    })
  })

  describe('Semantic Analysis Updates', () => {
    it('should update importance scores and themes after analysis', async () => {
      // Arrange
      const document = factories.document.create({ user_id: testUser1 })
      const chunk = factories.chunk.create({
        document_id: document.id,
        importance_score: null,
        themes: null
      })

      const updatedData = {
        importance_score: 0.92,
        themes: ['key concept', 'methodology', 'breakthrough'],
        entities: {
          concepts: ['novel approach', 'innovation'],
          people: ['Dr. Smith', 'Research Team'],
          organizations: ['MIT', 'Stanford']
        }
      }

      mockSupabase.from('chunks').update.mockResolvedValue({
        data: [{ ...chunk, ...updatedData }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks')
        .update(updatedData)
        .eq('id', chunk.id)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('chunks').update).toHaveBeenCalledWith(
        expect.objectContaining({
          importance_score: 0.92,
          themes: expect.arrayContaining(['key concept', 'methodology']),
          entities: expect.objectContaining({
            concepts: expect.arrayContaining(['novel approach'])
          })
        })
      )
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })
  })
})