import { estimateProcessingCost, uploadDocument, triggerProcessing, retryProcessing } from '../documents'

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}))

jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn()
}))

describe('Document Actions', () => {
  describe('estimateProcessingCost', () => {
    test('should calculate cost correctly for small file', async () => {
      const fileSize = 50000 // 50KB
      const result = await estimateProcessingCost(fileSize)
      
      // 75000 chars * 1.5 = 75000 estimated chars
      // inputTokens = 75, outputTokens = 38, embeddingTokens = 23
      expect(result.tokens).toBe(136) // 75 + 38 + 23
      expect(result.cost).toBeCloseTo(0.03825) // (75*0.00025) + (38*0.0005) + (23*0.000025)
      expect(result.estimatedTime).toBe(1000) // 1 page * 1000ms
    })

    test('should calculate cost correctly for large file', async () => {
      const fileSize = 500000 // 500KB
      const result = await estimateProcessingCost(fileSize)
      
      // 500000 * 1.5 = 750000 estimated chars
      // inputTokens = 750, outputTokens = 375, embeddingTokens = 225
      expect(result.tokens).toBe(1350) // 750 + 375 + 225
      expect(result.cost).toBeCloseTo(0.38125) // (750*0.00025) + (375*0.0005) + (225*0.000025)
      expect(result.estimatedTime).toBe(10000) // 10 pages * 1000ms
    })

    test('should handle zero file size', async () => {
      const result = await estimateProcessingCost(0)
      
      expect(result.tokens).toBe(0)
      expect(result.cost).toBe(0)
      expect(result.estimatedTime).toBe(0)
    })

    test('should calculate tokens and cost proportionally', async () => {
      const smallFile = await estimateProcessingCost(100000)
      const doubleFile = await estimateProcessingCost(200000)
      
      // Double file size should roughly double cost
      expect(doubleFile.tokens).toBeGreaterThan(smallFile.tokens * 1.8)
      expect(doubleFile.cost).toBeGreaterThan(smallFile.cost * 1.8)
    })
  })

  describe('uploadDocument', () => {
    const mockSupabase = {
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn(),
        remove: jest.fn()
      },
      from: jest.fn().mockReturnThis(),
      insert: jest.fn()
    }

    const mockUser = { id: 'user-123' }

    beforeEach(() => {
      const { createClient } = require('@/lib/supabase/server')
      const { getCurrentUser } = require('@/lib/auth')
      
      createClient.mockResolvedValue(mockSupabase)
      getCurrentUser.mockResolvedValue(mockUser)
      
      // Reset all mocks
      jest.clearAllMocks()
    })

    test('should successfully upload PDF file', async () => {
      // Mock successful operations
      mockSupabase.storage.upload.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(true)
      expect(result.documentId).toBeDefined()
      expect(result.error).toBeUndefined()

      // Verify storage upload was called
      expect(mockSupabase.storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/user-123\/.*\/source\.pdf/),
        file
      )

      // Verify database insert was called
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        id: expect.any(String),
        user_id: 'user-123',
        title: 'test',
        storage_path: expect.stringMatching(/user-123\/.*/),
        processing_status: 'pending'
      })
    })

    test('should accept text files', async () => {
      mockSupabase.storage.upload.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ error: null })

      const file = new File(['test content'], 'test.txt', { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(true)
    })

    test('should reject unsupported file types', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Only PDF and text files are supported')
    })

    test('should handle missing file', async () => {
      const formData = new FormData()

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No file provided')
    })

    test('should handle storage upload error', async () => {
      mockSupabase.storage.upload.mockResolvedValue({ 
        error: { message: 'Storage error' } 
      })

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Storage error')
    })

    test('should clean up storage on database error', async () => {
      mockSupabase.storage.upload.mockResolvedValue({ error: null })
      mockSupabase.insert.mockResolvedValue({ 
        error: { message: 'Database error' } 
      })
      mockSupabase.storage.remove.mockResolvedValue({ error: null })

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database error')
      
      // Verify cleanup was called
      expect(mockSupabase.storage.remove).toHaveBeenCalledWith([
        expect.stringMatching(/user-123\/.*\/source\.pdf/)
      ])
    })
  })

  describe('triggerProcessing', () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      functions: {
        invoke: jest.fn()
      }
    }

    const mockUser = { id: 'user-123' }

    beforeEach(() => {
      const { createClient } = require('@/lib/supabase/server')
      const { getCurrentUser } = require('@/lib/auth')
      
      createClient.mockResolvedValue(mockSupabase)
      getCurrentUser.mockResolvedValue(mockUser)
      
      jest.clearAllMocks()
    })

    test('should successfully trigger processing', async () => {
      mockSupabase.eq.mockResolvedValue({ error: null })
      mockSupabase.functions.invoke.mockResolvedValue({ error: null })

      const result = await triggerProcessing('doc-123')

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()

      // Verify status was updated to processing
      expect(mockSupabase.update).toHaveBeenCalledWith({
        processing_status: 'processing',
        processing_started_at: expect.any(String)
      })

      // Verify edge function was invoked
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('process-document', {
        body: {
          documentId: 'doc-123',
          storagePath: 'user-123/doc-123'
        }
      })
    })

    test('should handle edge function error and update status', async () => {
      mockSupabase.eq.mockResolvedValue({ error: null })
      mockSupabase.functions.invoke.mockResolvedValue({ 
        error: { message: 'Function error' } 
      })

      const result = await triggerProcessing('doc-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Function error')

      // Verify status was updated to failed
      expect(mockSupabase.update).toHaveBeenCalledTimes(2)
      expect(mockSupabase.update).toHaveBeenLastCalledWith({
        processing_status: 'failed',
        processing_error: 'Function error'
      })
    })
  })

  describe('retryProcessing', () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      functions: {
        invoke: jest.fn()
      }
    }

    beforeEach(() => {
      const { createClient } = require('@/lib/supabase/server')
      const { getCurrentUser } = require('@/lib/auth')
      
      createClient.mockResolvedValue(mockSupabase)
      jest.clearAllMocks()
    })

    test('should reset status and trigger processing', async () => {
      mockSupabase.eq.mockResolvedValue({ error: null })
      mockSupabase.functions.invoke.mockResolvedValue({ error: null })

      const result = await retryProcessing('doc-123')

      expect(result.success).toBe(true)

      // Verify status was reset
      expect(mockSupabase.update).toHaveBeenCalledWith({
        processing_status: 'pending',
        processing_error: null
      })
    })

    test('should handle retry failure', async () => {
      mockSupabase.eq.mockResolvedValue({ error: null })
      mockSupabase.functions.invoke.mockResolvedValue({ 
        error: { message: 'Retry failed' } 
      })

      const result = await retryProcessing('doc-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Retry failed')
    })
  })
})