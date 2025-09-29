/**
 * Tests for batch database operations
 */

import { jest } from '@jest/globals'

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn()
  }))
}

// Import after mocking
const { batchInsertChunks, calculateOptimalBatchSize } = await import('../../dist/lib/batch-operations.js')

describe('Batch Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('batchInsertChunks', () => {
    it('should batch insert chunks correctly', async () => {
      // Create 150 test chunks
      const chunks = Array.from({ length: 150 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`,
        themes: ['theme1', 'theme2'],
        importance_score: 0.5,
        summary: `Summary ${i}`
      }))

      // Setup mock to succeed
      const mockInsert = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      // Execute batch insert with batch size of 50
      const result = await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 50
      })

      // Verify results
      expect(result.inserted).toHaveLength(150)
      expect(result.failed).toHaveLength(0)
      expect(result.dbCalls).toBe(3) // 150 / 50 = 3 batches
      expect(mockInsert).toHaveBeenCalledTimes(3)

      // Verify batch sizes
      expect(mockInsert.mock.calls[0][0]).toHaveLength(50) // First batch
      expect(mockInsert.mock.calls[1][0]).toHaveLength(50) // Second batch
      expect(mockInsert.mock.calls[2][0]).toHaveLength(50) // Third batch
    })

    it('should handle partial batch at the end', async () => {
      // Create 120 chunks (not evenly divisible by 50)
      const chunks = Array.from({ length: 120 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`
      }))

      const mockInsert = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      const result = await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 50
      })

      expect(result.dbCalls).toBe(3) // 50 + 50 + 20
      expect(mockInsert.mock.calls[2][0]).toHaveLength(20) // Last batch
    })

    it('should retry on transient failures', async () => {
      const chunks = [{ id: 'chunk-1', content: 'Test' }]
      
      // Fail first attempt, succeed on retry
      const mockInsert = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ error: null })
      
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      const result = await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 1
      })

      expect(result.inserted).toHaveLength(1)
      expect(result.failed).toHaveLength(0)
      expect(mockInsert).toHaveBeenCalledTimes(2) // Initial + retry
    })

    it('should not retry on permanent errors', async () => {
      const chunks = [{ id: 'chunk-1', content: 'Test' }]
      
      // Unique constraint violation - should not retry
      const mockInsert = jest.fn().mockRejectedValue({
        code: '23505',
        message: 'Unique constraint violation'
      })
      
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      const result = await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 1
      })

      expect(result.inserted).toHaveLength(0)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].error.code).toBe('23505')
      expect(mockInsert).toHaveBeenCalledTimes(1) // No retry
    })

    it('should call progress callback', async () => {
      const chunks = Array.from({ length: 100 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`
      }))

      const mockInsert = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      const progressCallback = jest.fn()

      await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 50,
        onProgress: progressCallback
      })

      // Should be called after each batch
      expect(progressCallback).toHaveBeenCalledTimes(2)
      expect(progressCallback).toHaveBeenCalledWith(50, 100)
      expect(progressCallback).toHaveBeenCalledWith(100, 100)
    })

    it('should handle empty array', async () => {
      const result = await batchInsertChunks(mockSupabase, [], {})
      
      expect(result.inserted).toHaveLength(0)
      expect(result.failed).toHaveLength(0)
      expect(result.dbCalls).toBe(0)
      expect(mockSupabase.from).not.toHaveBeenCalled()
    })

    it('should reduce batch size if parameters exceed limit', async () => {
      // Create chunks with many fields to trigger parameter limit
      const chunks = Array.from({ length: 100 }, (_, i) => {
        const chunk = { id: `chunk-${i}` }
        // Add 1000 fields to exceed parameter limit
        for (let j = 0; j < 1000; j++) {
          chunk[`field_${j}`] = `value_${j}`
        }
        return chunk
      })

      const mockInsert = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      // Spy on console.warn to verify batch size reduction
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()

      await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 50 // Will be reduced due to parameter limit
      })

      // Should warn about batch size reduction
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Batch size reduced')
      )

      warnSpy.mockRestore()
    })
  })

  describe('calculateOptimalBatchSize', () => {
    it('should calculate optimal batch size for target DB calls', () => {
      const records = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        content: `content-${i}`,
        embedding: [1, 2, 3]
      }))

      // Target 10 DB calls for 1000 records = batch size 100
      const batchSize = calculateOptimalBatchSize(records, 10)
      expect(batchSize).toBe(100) // But capped at default max
    })

    it('should respect parameter limits', () => {
      // Create records with many fields
      const records = Array.from({ length: 100 }, (_, i) => {
        const record = { id: i }
        for (let j = 0; j < 1000; j++) {
          record[`field_${j}`] = j
        }
        return record
      })

      const batchSize = calculateOptimalBatchSize(records, 10)
      expect(batchSize).toBeLessThanOrEqual(65) // 65535 / 1001 fields
    })

    it('should apply reasonable bounds', () => {
      // Very few records
      let records = [{ id: 1 }, { id: 2 }]
      let batchSize = calculateOptimalBatchSize(records, 1)
      expect(batchSize).toBeGreaterThanOrEqual(2) // Min batch size

      // Very many records
      records = Array.from({ length: 10000 }, (_, i) => ({ id: i }))
      batchSize = calculateOptimalBatchSize(records, 1)
      expect(batchSize).toBeLessThanOrEqual(100) // Max reasonable batch
    })

    it('should handle empty array', () => {
      const batchSize = calculateOptimalBatchSize([], 10)
      expect(batchSize).toBe(50) // Default batch size
    })
  })

  describe('Performance improvements', () => {
    it('should achieve 50x reduction in DB calls', async () => {
      // Simulate 100 chunks
      const chunks = Array.from({ length: 100 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`,
        embedding: Array(768).fill(0.1) // Typical embedding
      }))

      const mockInsert = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({ insert: mockInsert })

      // Without batching: 100 DB calls
      // With batching (size 50): 2 DB calls
      const result = await batchInsertChunks(mockSupabase, chunks, {
        batchSize: 50
      })

      const improvementRatio = 100 / result.dbCalls
      expect(improvementRatio).toBe(50) // 50x improvement
      expect(result.dbCalls).toBe(2)
    })
  })
})