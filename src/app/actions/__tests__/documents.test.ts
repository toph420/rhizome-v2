import { estimateProcessingCost, uploadDocument, triggerProcessing, retryProcessing, getDocumentJob, reprocessConnections } from '../documents'

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn()
}))

jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
  getSupabaseClient: jest.fn()
}))

describe('Document Actions - Background Processing System', () => {
  describe('estimateProcessingCost', () => {
    test('should calculate cost correctly for small file', async () => {
      const fileSize = 50000 // 50KB
      const result = await estimateProcessingCost(fileSize)
      
      // 50000 * 1.5 = 75000 estimated chars
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
  })

  describe('uploadDocument - Background Job Creation', () => {
    const mockSupabase = {
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn(),
        remove: jest.fn()
      },
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn()
    }

    const mockUser = { id: 'user-123' }

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSupabaseClient } = require('@/lib/auth')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/lib/auth')
      
      getSupabaseClient.mockReturnValue(mockSupabase)
      getCurrentUser.mockResolvedValue(mockUser)
      
      // Reset all mocks
      jest.clearAllMocks()
    })

    test('should successfully upload PDF and create background job', async () => {
      // Mock successful operations
      mockSupabase.storage.upload.mockResolvedValue({ error: null })
      
      // Mock document insert success
      mockSupabase.insert.mockReturnValueOnce({
        ...mockSupabase,
        insert: jest.fn().mockResolvedValue({ error: null })
      })
      
      // Mock background job creation success
      const mockJobId = 'job-456'
      mockSupabase.select.mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: { id: mockJobId },
          error: null
        })
      })

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(true)
      expect(result.documentId).toBeDefined()
      expect(result.jobId).toBe(mockJobId)
      expect(result.error).toBeUndefined()

      // Verify storage upload was called
      expect(mockSupabase.storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/user-123\/.*\/source\.pdf/),
        file
      )

      // Verify background job was created
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        user_id: 'user-123',
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: expect.any(String),
        input_data: {
          document_id: expect.any(String),
          storage_path: expect.stringMatching(/user-123\/.*/)
        }
      })
    })

    test('should rollback storage on job creation failure', async () => {
      // Mock successful storage upload but failed job creation
      mockSupabase.storage.upload.mockResolvedValue({ error: null })
      mockSupabase.storage.remove.mockResolvedValue({ error: null })
      
      // Mock document insert success
      mockSupabase.insert.mockReturnValueOnce({
        ...mockSupabase,
        insert: jest.fn().mockResolvedValue({ error: null })
      })
      
      // Mock background job creation failure
      mockSupabase.select.mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Job creation failed' }
        })
      })

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Job creation failed')

      // Verify rollback operations
      expect(mockSupabase.delete).toHaveBeenCalled() // Document cleanup
      expect(mockSupabase.storage.remove).toHaveBeenCalled() // Storage cleanup
    })

    test('should rollback document on job creation failure', async () => {
      // Mock successful storage and document creation but failed job creation
      mockSupabase.storage.upload.mockResolvedValue({ error: null })
      
      // Mock document insert success
      mockSupabase.insert.mockReturnValueOnce({
        ...mockSupabase,
        insert: jest.fn().mockResolvedValue({ error: null })
      })
      
      // Mock background job creation failure
      mockSupabase.select.mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Background job failed' }
        })
      })

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Background job failed')

      // Verify complete rollback
      expect(mockSupabase.delete).toHaveBeenCalled()
      expect(mockSupabase.storage.remove).toHaveBeenCalled()
    })

    test('should reject unsupported file types', async () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('file', file)

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Only PDF and text files are supported')
      
      // Verify no storage or database operations were attempted
      expect(mockSupabase.storage.upload).not.toHaveBeenCalled()
      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('should handle missing file', async () => {
      const formData = new FormData()

      const result = await uploadDocument(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No file provided')
    })
  })

  describe('triggerProcessing - Background Job Management', () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn(),
      eq: jest.fn().mockReturnThis()
    }

    const mockUser = { id: 'user-123' }

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSupabaseClient } = require('@/lib/auth')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/lib/auth')
      
      getSupabaseClient.mockReturnValue(mockSupabase)
      getCurrentUser.mockResolvedValue(mockUser)
      
      jest.clearAllMocks()
    })

    test('should successfully create background job for processing', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValueOnce({
        data: { storage_path: 'user-123/doc-123' },
        error: null
      })

      // Mock job creation success
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'job-789' },
        error: null
      })

      const result = await triggerProcessing('doc-123')

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('job-789')
      expect(result.error).toBeUndefined()

      // Verify job was created with correct parameters
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        user_id: 'user-123',
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: 'doc-123',
        input_data: {
          document_id: 'doc-123',
          storage_path: 'user-123/doc-123'
        }
      })
    })

    test('should handle document not found', async () => {
      // Mock document not found
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Document not found' }
      })

      const result = await triggerProcessing('nonexistent-doc')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Document not found')
      
      // Verify no job creation was attempted
      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('should handle job creation failure', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValueOnce({
        data: { storage_path: 'user-123/doc-123' },
        error: null
      })

      // Mock job creation failure
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Job creation failed' }
      })

      const result = await triggerProcessing('doc-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Job creation failed')
    })
  })

  describe('retryProcessing - Job Retry Logic', () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn()
    }

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSupabaseClient } = require('@/lib/auth')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/lib/auth')
      
      getSupabaseClient.mockReturnValue(mockSupabase)
      getCurrentUser.mockResolvedValue({ id: 'user-123' })
      
      jest.clearAllMocks()
    })

    test('should reset document status and create new job', async () => {
      // Mock document reset success
      mockSupabase.eq.mockResolvedValueOnce({ error: null })

      // Mock document exists for triggerProcessing
      mockSupabase.single.mockResolvedValueOnce({
        data: { storage_path: 'user-123/doc-123' },
        error: null
      })

      // Mock new job creation success
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'retry-job-456' },
        error: null
      })

      const result = await retryProcessing('doc-123')

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('retry-job-456')

      // Verify document status was reset
      expect(mockSupabase.update).toHaveBeenCalledWith({
        processing_status: 'pending',
        processing_error: null
      })
    })

    test('should handle retry failure gracefully', async () => {
      // Mock document reset success
      mockSupabase.eq.mockResolvedValueOnce({ error: null })

      // Mock document exists but job creation fails
      mockSupabase.single.mockResolvedValueOnce({
        data: { storage_path: 'user-123/doc-123' },
        error: null
      })

      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Retry job creation failed' }
      })

      const result = await retryProcessing('doc-123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Retry job creation failed')
    })
  })

  describe('getDocumentJob - Job Status Tracking', () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn()
    }

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSupabaseClient } = require('@/lib/auth')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/lib/auth')
      
      getSupabaseClient.mockReturnValue(mockSupabase)
      getCurrentUser.mockResolvedValue({ id: 'user-123' })
      
      jest.clearAllMocks()
    })

    test('should return active job for document', async () => {
      const mockJobData = {
        id: 'job-123',
        status: 'processing',
        progress: { stage: 'extract', percent: 30 },
        last_error: null
      }

      mockSupabase.single.mockResolvedValue({
        data: mockJobData,
        error: null
      })

      const result = await getDocumentJob('doc-123')

      expect(result).toEqual(mockJobData)

      // Verify correct query was made
      expect(mockSupabase.eq).toHaveBeenCalledWith('entity_type', 'document')
      expect(mockSupabase.eq).toHaveBeenCalledWith('entity_id', 'doc-123')
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123')
      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockSupabase.limit).toHaveBeenCalledWith(1)
    })

    test('should return null when no job found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'No job found' }
      })

      const result = await getDocumentJob('doc-without-job')

      expect(result).toBeNull()
    })

    test('should handle query errors gracefully', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Database error'))

      const result = await getDocumentJob('doc-123')

      expect(result).toBeNull()
    })
  })

  describe('reprocessConnections - Connection Reprocessing (T-015)', () => {
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    }

    const mockUser = { id: 'user-123' }

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSupabaseClient } = require('@/lib/auth')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/lib/auth')

      getSupabaseClient.mockReturnValue(mockSupabase)
      getCurrentUser.mockResolvedValue(mockUser)

      jest.clearAllMocks()
    })

    test('Scenario 1: Create reprocess job with all options', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' },
        error: null
      })

      // Mock job creation success
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'job-reprocess-123' },
        error: null
      })

      const result = await reprocessConnections('doc-123', {
        mode: 'smart',
        engines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
        preserveValidated: true,
        backupFirst: true
      })

      expect(result.success).toBe(true)
      expect(result.jobId).toBe('job-reprocess-123')
      expect(result.error).toBeUndefined()

      // Verify job was created with correct parameters
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        user_id: 'user-123',
        job_type: 'reprocess_connections',
        entity_type: 'document',
        entity_id: 'doc-123',
        input_data: {
          document_id: 'doc-123',
          mode: 'smart',
          engines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
          preserveValidated: true,
          backupFirst: true
        }
      })
    })

    test('Scenario 2: Validation failure - empty engines array', async () => {
      const result = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: []
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('At least one engine required')

      // Verify no database operations were attempted
      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('Scenario 3: Smart Mode with preservation defaults', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' },
        error: null
      })

      // Mock job creation success
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'job-smart-456' },
        error: null
      })

      const result = await reprocessConnections('doc-123', {
        mode: 'smart',
        engines: ['semantic_similarity']
        // Not providing preserveValidated or backupFirst - should default to true
      })

      expect(result.success).toBe(true)

      // Verify defaults were applied
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          input_data: expect.objectContaining({
            preserveValidated: true,
            backupFirst: true
          })
        })
      )
    })

    test('should validate invalid mode', async () => {
      const result = await reprocessConnections('doc-123', {
        mode: 'invalid_mode' as any,
        engines: ['semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid mode')

      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('should validate invalid engine names', async () => {
      const result = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['invalid_engine' as any, 'semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid engines: invalid_engine')

      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('should handle document not found', async () => {
      // Mock document not found
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Document not found' }
      })

      const result = await reprocessConnections('nonexistent-doc', {
        mode: 'all',
        engines: ['semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Document not found')

      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('should handle unauthorized access (wrong user)', async () => {
      // Mock document exists but belongs to different user
      mockSupabase.single.mockResolvedValue({
        data: { id: 'doc-123', user_id: 'other-user', title: 'Test Doc' },
        error: null
      })

      const result = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authorized to reprocess this document')

      expect(mockSupabase.insert).not.toHaveBeenCalled()
    })

    test('should handle job creation failure', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' },
        error: null
      })

      // Mock job creation failure
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' }
      })

      const result = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Job creation failed')
    })

    test('should handle invalid document ID', async () => {
      const result = await reprocessConnections('', {
        mode: 'all',
        engines: ['semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid document ID')

      expect(mockSupabase.from).not.toHaveBeenCalled()
    })

    test('should handle not authenticated', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getCurrentUser } = require('@/lib/auth')
      getCurrentUser.mockResolvedValue(null)

      const result = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['semantic_similarity']
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    test('should accept all three modes', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValue({
        data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' },
        error: null
      })

      // Mock job creation success (will be called 3 times)
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'job-2' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'job-3' }, error: null })

      // Test 'all' mode
      const result1 = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['semantic_similarity']
      })
      expect(result1.success).toBe(true)

      // Test 'add_new' mode
      const result2 = await reprocessConnections('doc-123', {
        mode: 'add_new',
        engines: ['semantic_similarity']
      })
      expect(result2.success).toBe(true)

      // Test 'smart' mode
      const result3 = await reprocessConnections('doc-123', {
        mode: 'smart',
        engines: ['semantic_similarity']
      })
      expect(result3.success).toBe(true)
    })

    test('should accept all three engines individually', async () => {
      // Mock document exists
      mockSupabase.single.mockResolvedValue({
        data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' },
        error: null
      })

      // Mock job creation success (will be called 3 times)
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'job-2' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'doc-123', user_id: 'user-123', title: 'Test Doc' }, error: null })
        .mockResolvedValueOnce({ data: { id: 'job-3' }, error: null })

      // Test semantic_similarity
      const result1 = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['semantic_similarity']
      })
      expect(result1.success).toBe(true)

      // Test contradiction_detection
      const result2 = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['contradiction_detection']
      })
      expect(result2.success).toBe(true)

      // Test thematic_bridge
      const result3 = await reprocessConnections('doc-123', {
        mode: 'all',
        engines: ['thematic_bridge']
      })
      expect(result3.success).toBe(true)
    })
  })
})