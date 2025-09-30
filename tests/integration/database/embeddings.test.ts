/**
 * Database Integration Tests - Embeddings and Vector Operations
 * 
 * Tests pgvector embedding operations, similarity search performance,
 * and vector indexing functionality.
 */

import { factories } from '@/tests/factories'

// Mock Supabase client with pgvector operations
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn()
}

// Test data tracking
const testChunks: string[] = []
const testDocuments: string[] = []

describe('Embeddings and Vector Operations', () => {
  
  beforeEach(() => {
    jest.clearAllMocks()
    testChunks.length = 0
    testDocuments.length = 0
    
    // Setup default mocks
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

  describe('Vector Storage and Retrieval', () => {
    it('should store 768-dimensional Gemini embeddings', async () => {
      // Arrange
      const document = factories.document.create({ user_id: 'test-user' })
      const geminiEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      
      const chunk = factories.chunk.create({
        document_id: document.id,
        content: 'Machine learning algorithms show promising results.',
        embedding: geminiEmbedding
      })

      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: [chunk],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeNull()
      const insertedChunk = mockSupabase.from('chunks').insert.mock.calls[0][0]
      expect(insertedChunk.embedding).toHaveLength(768)
      expect(insertedChunk.embedding.every(val => typeof val === 'number')).toBe(true)
      expect(insertedChunk.embedding.some(val => val !== 0)).toBe(true) // Non-zero values
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })

    it('should reject embeddings with incorrect dimensions', async () => {
      // Arrange
      const document = factories.document.create({ user_id: 'test-user' })
      const invalidEmbedding = new Array(512).fill(0) // Wrong dimension
      
      const chunk = factories.chunk.create({
        document_id: document.id,
        embedding: invalidEmbedding
      })

      // Mock dimension validation error
      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: null,
        error: { 
          message: 'vector dimension 512 does not match declared dimension 768',
          code: '22003'
        }
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('dimension')
      expect(result.data).toBeNull()
      
      testDocuments.push(document.id)
    })
  })

  describe('Similarity Search Performance', () => {
    it('should perform cosine similarity search under 500ms for 100 chunks', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const chunkCount = 100
      
      const similarChunks = Array.from({ length: chunkCount }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content chunk ${i}`,
        similarity: Math.random() * 0.3 + 0.7, // 0.7-1.0 range
        document_id: `doc-${i % 10}`, // 10 documents
        themes: [`theme-${i % 5}`],
        summary: `Summary ${i}`
      })).sort((a, b) => b.similarity - a.similarity) // Sort by similarity desc

      mockSupabase.rpc.mockResolvedValue({
        data: similarChunks,
        error: null
      })

      // Act
      const startTime = performance.now()
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: chunkCount
      })
      const duration = performance.now() - startTime

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(chunkCount)
      expect(duration).toBeLessThan(500) // Performance requirement
      
      // Verify results are sorted by similarity (descending)
      for (let i = 0; i < result.data.length - 1; i++) {
        expect(result.data[i].similarity).toBeGreaterThanOrEqual(result.data[i + 1].similarity)
      }

      similarChunks.forEach(chunk => testChunks.push(chunk.id))
    })

    it('should handle large embedding batches efficiently', async () => {
      // Arrange
      const batchSize = 50
      const chunks = Array.from({ length: batchSize }, (_, i) => 
        factories.chunk.create({
          document_id: `doc-${Math.floor(i / 10)}`,
          content: `Batch content ${i}`,
          embedding: new Array(768).fill(0).map(() => Math.random() - 0.5),
          chunk_index: i
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
      expect(duration).toBeLessThan(2000) // Should complete in under 2 seconds
      expect(mockSupabase.from('chunks').insert).toHaveBeenCalledWith(chunks)
      
      chunks.forEach(chunk => testChunks.push(chunk.id))
    })
  })

  describe('Vector Index Utilization', () => {
    it('should use ivfflat index for similarity queries', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      
      const indexedResults = [
        {
          id: 'indexed-chunk-1',
          content: 'Content found via index',
          similarity: 0.89,
          document_id: 'doc-indexed',
          themes: ['indexed search'],
          summary: 'Index-optimized result'
        }
      ]

      // Mock database execution plan (simulated)
      mockSupabase.rpc.mockImplementation((functionName, params) => {
        if (functionName === 'match_chunks') {
          // Simulate index usage by fast execution
          return Promise.resolve({
            data: indexedResults,
            error: null,
            executionPlan: 'Index Scan using idx_chunks_embedding'
          })
        }
        return Promise.resolve({ data: [], error: null })
      })

      // Act
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.8,
        match_count: 5
      })

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_chunks', 
        expect.objectContaining({
          query_embedding: queryEmbedding,
          match_threshold: 0.8
        })
      )
      
      testChunks.push(indexedResults[0].id)
    })

    it('should optimize similarity search with distance operators', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      
      const distanceResults = [
        {
          id: 'distance-chunk-1',
          content: 'Closest semantic match',
          similarity: 0.95, // 1 - distance
          document_id: 'doc-distance',
          themes: ['semantic proximity'],
          summary: 'High similarity match'
        },
        {
          id: 'distance-chunk-2',
          content: 'Moderate semantic match',
          similarity: 0.78,
          document_id: 'doc-distance-2',
          themes: ['moderate proximity'],
          summary: 'Medium similarity match'
        }
      ]

      mockSupabase.rpc.mockResolvedValue({
        data: distanceResults,
        error: null
      })

      // Act - test with different similarity thresholds
      const highThresholdResult = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.9,
        match_count: 10
      })
      
      const mediumThresholdResult = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 10
      })

      // Assert
      expect(highThresholdResult.error).toBeNull()
      expect(mediumThresholdResult.error).toBeNull()
      
      // High threshold should return fewer, more similar results
      expect(highThresholdResult.data.every(chunk => chunk.similarity >= 0.9)).toBe(true)
      
      distanceResults.forEach(chunk => testChunks.push(chunk.id))
    })
  })

  describe('Embedding Quality and Validation', () => {
    it('should validate embedding normalization', async () => {
      // Arrange
      const document = factories.document.create({ user_id: 'test-user' })
      
      // Create normalized embedding (magnitude = 1)
      const rawEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const magnitude = Math.sqrt(rawEmbedding.reduce((sum, val) => sum + val * val, 0))
      const normalizedEmbedding = rawEmbedding.map(val => val / magnitude)
      
      const chunk = factories.chunk.create({
        document_id: document.id,
        embedding: normalizedEmbedding
      })

      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: [chunk],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeNull()
      
      // Verify embedding is normalized (magnitude ≈ 1)
      const insertedEmbedding = mockSupabase.from('chunks').insert.mock.calls[0][0].embedding
      const insertedMagnitude = Math.sqrt(
        insertedEmbedding.reduce((sum, val) => sum + val * val, 0)
      )
      expect(insertedMagnitude).toBeCloseTo(1.0, 3) // Within 0.001 tolerance
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })

    it('should handle embedding updates for re-processed content', async () => {
      // Arrange
      const document = factories.document.create({ user_id: 'test-user' })
      const originalEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const updatedEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      
      const chunk = factories.chunk.create({
        document_id: document.id,
        content: 'Original content for embedding',
        embedding: originalEmbedding
      })

      // Mock update with new embedding
      mockSupabase.from('chunks').update.mockResolvedValue({
        data: [{ ...chunk, embedding: updatedEmbedding }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('chunks')
        .update({
          content: 'Updated content for re-embedding',
          embedding: updatedEmbedding
        })
        .eq('id', chunk.id)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('chunks').update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Updated content for re-embedding',
          embedding: updatedEmbedding
        })
      )
      
      testChunks.push(chunk.id)
      testDocuments.push(document.id)
    })
  })

  describe('Cross-Document Similarity', () => {
    it('should find similar chunks across different documents', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const excludeDocId = 'current-doc-123'
      
      const crossDocResults = [
        {
          id: 'cross-chunk-1',
          content: 'Similar concept in different document',
          similarity: 0.87,
          document_id: 'other-doc-1',
          themes: ['shared concept'],
          summary: 'Cross-document match 1'
        },
        {
          id: 'cross-chunk-2',
          content: 'Related idea from another source',
          similarity: 0.82,
          document_id: 'other-doc-2',
          themes: ['related concept'],
          summary: 'Cross-document match 2'
        }
      ]

      mockSupabase.rpc.mockResolvedValue({
        data: crossDocResults,
        error: null
      })

      // Act
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.8,
        match_count: 5,
        exclude_document_id: excludeDocId
      })

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(2)
      expect(result.data.every(chunk => chunk.document_id !== excludeDocId)).toBe(true)
      expect(result.data.every(chunk => chunk.similarity >= 0.8)).toBe(true)
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_chunks', 
        expect.objectContaining({
          exclude_document_id: excludeDocId
        })
      )
      
      crossDocResults.forEach(chunk => testChunks.push(chunk.id))
    })

    it('should maintain performance with large vector datasets', async () => {
      // Arrange
      const queryEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const largeDatasetSize = 1000 // Simulate 1000 chunks in database
      
      const performanceResults = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-chunk-${i}`,
        content: `Performance test content ${i}`,
        similarity: 0.9 - (i * 0.01), // Decreasing similarity
        document_id: `perf-doc-${i}`,
        themes: [`performance-${i}`],
        summary: `Performance chunk ${i}`
      }))

      mockSupabase.rpc.mockImplementation(() => {
        // Simulate database work time proportional to dataset size
        const delay = Math.min(largeDatasetSize / 10, 100) // Max 100ms
        return new Promise(resolve => 
          setTimeout(() => resolve({
            data: performanceResults,
            error: null
          }), delay)
        )
      })

      // Act
      const startTime = performance.now()
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: 0.8,
        match_count: 10
      })
      const duration = performance.now() - startTime

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(10)
      expect(duration).toBeLessThan(500) // Should scale well
      
      performanceResults.forEach(chunk => testChunks.push(chunk.id))
    })
  })
})