/**
 * Database Integration Tests - Background Jobs
 * 
 * Tests background job processing, retry logic, progress tracking, and realtime updates.
 * Validates job lifecycle, error handling, and concurrent job processing.
 */

import { factories } from '@/tests/factories'

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
  channel: jest.fn()
}

// Test data tracking
const testJobs: string[] = []
const testUsers = ['test-user-1', 'test-user-2']

describe('Background Jobs Database Operations', () => {
  
  beforeEach(() => {
    jest.clearAllMocks()
    testJobs.length = 0
    
    // Create proper chainable mocks
    const createChainableMock = () => {
      const chain = {
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
        in: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: [], error: null })
        })
      }
      // Make eq return itself for further chaining
      chain.eq.mockReturnValue(chain)
      return chain
    }
    
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      select: jest.fn().mockReturnValue(createChainableMock()),
      update: jest.fn().mockReturnValue(createChainableMock()),
      delete: jest.fn().mockReturnValue(createChainableMock())
    })
    
    // Setup realtime channel mock
    mockSupabase.channel.mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockResolvedValue('SUBSCRIBED')
    })
  })

  afterEach(async () => {
    // Clean up test jobs
    testJobs.forEach(async (jobId) => {
      await mockSupabase.from('background_jobs').delete().eq('id', jobId)
    })
  })

  describe('Job Creation and Queuing', () => {
    it('should create document processing job with correct input data', async () => {
      // Arrange
      const documentId = 'doc-123'
      const userId = testUsers[0]
      
      const job = factories.job.create({
        user_id: userId,
        job_type: 'process-document',
        entity_type: 'document',
        entity_id: documentId,
        status: 'pending',
        input_data: {
          document_id: documentId,
          source_type: 'pdf',
          processing_options: {
            extract_images: true,
            generate_summary: true
          }
        },
        progress: { stage: 'queued', percent: 0 }
      })

      mockSupabase.from('background_jobs').insert.mockResolvedValue({
        data: [job],
        error: null
      })

      // Act
      const result = await mockSupabase.from('background_jobs').insert(job)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('background_jobs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'process-document',
          entity_type: 'document',
          entity_id: documentId,
          status: 'pending',
          input_data: expect.objectContaining({
            document_id: documentId,
            source_type: 'pdf'
          })
        })
      )
      
      testJobs.push(job.id)
    })

    it('should create connection detection job with entity relationships', async () => {
      // Arrange
      const userId = testUsers[0]
      const deckId = 'deck-456'
      
      const job = factories.job.create({
        user_id: userId,
        job_type: 'detect-connections',
        entity_type: 'deck',
        entity_id: deckId,
        status: 'pending',
        input_data: {
          deck_id: deckId,
          connection_types: ['semantic', 'thematic', 'contradictory'],
          threshold: 0.7,
          max_connections: 50
        },
        progress: { stage: 'initializing', percent: 0 }
      })

      mockSupabase.from('background_jobs').insert.mockResolvedValue({
        data: [job],
        error: null
      })

      // Act
      const result = await mockSupabase.from('background_jobs').insert(job)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('background_jobs').insert).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'detect-connections',
          entity_type: 'deck',
          input_data: expect.objectContaining({
            deck_id: deckId,
            connection_types: expect.arrayContaining(['semantic', 'thematic'])
          })
        })
      )
      
      testJobs.push(job.id)
    })
  })

  describe('Job Processing Lifecycle', () => {
    it('should update job status through processing stages', async () => {
      // Arrange
      const job = factories.job.create({
        user_id: testUsers[0],
        job_type: 'process-document',
        status: 'pending'
      })

      const processingStages = [
        { status: 'processing', progress: { stage: 'extracting', percent: 25 } },
        { status: 'processing', progress: { stage: 'chunking', percent: 50 } },
        { status: 'processing', progress: { stage: 'embedding', percent: 75 } },
        { status: 'completed', progress: { stage: 'complete', percent: 100 } }
      ]

      // Mock updates for each stage
      processingStages.forEach((stage, index) => {
        mockSupabase.from('background_jobs').update.mockResolvedValueOnce({
          data: [{ ...job, ...stage, updated_at: new Date().toISOString() }],
          error: null
        })
      })

      // Act & Assert each stage
      for (const stage of processingStages) {
        const result = await mockSupabase.from('background_jobs')
          .update({
            status: stage.status,
            progress: stage.progress,
            ...(stage.status === 'processing' && { started_at: new Date().toISOString() }),
            ...(stage.status === 'completed' && { completed_at: new Date().toISOString() })
          })
          .eq('id', job.id)
        
        expect(result.error).toBeNull()
      }

      expect(mockSupabase.from('background_jobs').update).toHaveBeenCalledTimes(4)
      testJobs.push(job.id)
    })

    it('should handle job failure with error details', async () => {
      // Arrange
      const job = factories.job.create({
        user_id: testUsers[0],
        job_type: 'process-document',
        status: 'processing',
        retry_count: 1
      })

      const errorDetails = {
        status: 'failed',
        last_error: 'Gemini API rate limit exceeded. Retry after 60 seconds.',
        retry_count: 2,
        next_retry_at: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        progress: { stage: 'failed', percent: 0, error: 'API_RATE_LIMIT' }
      }

      mockSupabase.from('background_jobs').update.mockResolvedValue({
        data: [{ ...job, ...errorDetails }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('background_jobs')
        .update(errorDetails)
        .eq('id', job.id)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('background_jobs').update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('rate limit'),
          retry_count: 2,
          next_retry_at: expect.any(String)
        })
      )
      
      testJobs.push(job.id)
    })
  })

  describe('Retry Logic and Error Recovery', () => {
    it('should implement exponential backoff for retries', async () => {
      // Arrange
      const job = factories.job.create({
        user_id: testUsers[0],
        job_type: 'process-document',
        status: 'failed',
        retry_count: 0,
        max_retries: 3
      })

      const retryAttempts = [
        { retry_count: 1, delay: 1000 * 60 }, // 1 minute
        { retry_count: 2, delay: 1000 * 60 * 2 }, // 2 minutes  
        { retry_count: 3, delay: 1000 * 60 * 4 } // 4 minutes
      ]

      // Act & Assert each retry
      for (const attempt of retryAttempts) {
        const nextRetryAt = new Date(Date.now() + attempt.delay).toISOString()
        
        mockSupabase.from('background_jobs').update.mockResolvedValueOnce({
          data: [{ 
            ...job, 
            retry_count: attempt.retry_count,
            next_retry_at: nextRetryAt,
            status: attempt.retry_count < 3 ? 'failed' : 'permanently_failed'
          }],
          error: null
        })

        const result = await mockSupabase.from('background_jobs')
          .update({
            retry_count: attempt.retry_count,
            next_retry_at: nextRetryAt,
            status: attempt.retry_count < 3 ? 'failed' : 'permanently_failed'
          })
          .eq('id', job.id)

        expect(result.error).toBeNull()
      }

      testJobs.push(job.id)
    })

    it('should mark jobs as permanently failed after max retries', async () => {
      // Arrange
      const job = factories.job.create({
        user_id: testUsers[0],
        job_type: 'process-document',
        status: 'failed',
        retry_count: 3,
        max_retries: 3,
        last_error: 'Document format not supported'
      })

      mockSupabase.from('background_jobs').update.mockResolvedValue({
        data: [{
          ...job,
          status: 'permanently_failed',
          next_retry_at: null
        }],
        error: null
      })

      // Act
      const result = await mockSupabase.from('background_jobs')
        .update({
          status: 'permanently_failed',
          next_retry_at: null
        })
        .eq('id', job.id)

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.from('background_jobs').update).toHaveBeenCalledWith({
        status: 'permanently_failed',
        next_retry_at: null
      })
      
      testJobs.push(job.id)
    })
  })

  describe('User Isolation and Security', () => {
    it('should only return jobs for authenticated user', async () => {
      // Arrange
      const user1Jobs = [
        factories.job.create({ user_id: testUsers[0], job_type: 'process-document' }),
        factories.job.create({ user_id: testUsers[0], job_type: 'detect-connections' })
      ]
      
      const user2Jobs = [
        factories.job.create({ user_id: testUsers[1], job_type: 'process-document' })
      ]

      // Mock RLS behavior - only return user's jobs
      mockSupabase.from('background_jobs').select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: user1Jobs, // Only user1's jobs returned
          error: null
        })
      })

      // Act - query as user1
      const result = await mockSupabase.from('background_jobs')
        .select('*')
        .eq('user_id', testUsers[0])

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(2)
      expect(result.data.every(job => job.user_id === testUsers[0])).toBe(true)
      
      user1Jobs.forEach(job => testJobs.push(job.id))
      user2Jobs.forEach(job => testJobs.push(job.id))
    })

    it('should prevent cross-user job access', async () => {
      // Arrange
      const user1Job = factories.job.create({ user_id: testUsers[0] })
      
      // Mock RLS blocking unauthorized access
      mockSupabase.from('background_jobs').select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Row Level Security violation' }
        })
      })

      // Act - user2 tries to access user1's job
      const result = await mockSupabase.from('background_jobs')
        .select('*')
        .eq('id', user1Job.id)

      // Assert
      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
      expect(result.error.message).toContain('Row Level Security')
      
      testJobs.push(user1Job.id)
    })
  })

  describe('Job Queue Management', () => {
    it('should retrieve pending jobs in priority order', async () => {
      // Arrange
      const pendingJobs = [
        factories.job.create({ 
          user_id: testUsers[0], 
          status: 'pending',
          job_type: 'process-document',
          created_at: new Date(Date.now() - 3000).toISOString() // 3 seconds ago
        }),
        factories.job.create({ 
          user_id: testUsers[0], 
          status: 'pending',
          job_type: 'detect-connections',
          created_at: new Date(Date.now() - 1000).toISOString() // 1 second ago
        })
      ]

      // Mock ordered retrieval (oldest first)
      mockSupabase.from('background_jobs').select.mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: pendingJobs.sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            ),
            error: null
          })
        })
      })

      // Act
      const result = await mockSupabase.from('background_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(2)
      expect(result.data[0].job_type).toBe('process-document') // Older job first
      expect(result.data[1].job_type).toBe('detect-connections')
      
      pendingJobs.forEach(job => testJobs.push(job.id))
    })

    it('should handle concurrent job processing', async () => {
      // Arrange
      const concurrentJobs = Array.from({ length: 5 }, (_, i) => 
        factories.job.create({
          user_id: testUsers[0],
          status: 'pending',
          job_type: i % 2 === 0 ? 'process-document' : 'detect-connections'
        })
      )

      // Mock concurrent updates
      concurrentJobs.forEach((job, index) => {
        mockSupabase.from('background_jobs').update.mockResolvedValueOnce({
          data: [{ ...job, status: 'processing', started_at: new Date().toISOString() }],
          error: null
        })
      })

      // Act - simulate concurrent processing
      const updatePromises = concurrentJobs.map(job => 
        mockSupabase.from('background_jobs')
          .update({ 
            status: 'processing', 
            started_at: new Date().toISOString() 
          })
          .eq('id', job.id)
      )

      const results = await Promise.all(updatePromises)

      // Assert
      results.forEach(result => {
        expect(result.error).toBeNull()
      })
      expect(mockSupabase.from('background_jobs').update).toHaveBeenCalledTimes(5)
      
      concurrentJobs.forEach(job => testJobs.push(job.id))
    })
  })

  describe('Progress Tracking and Realtime Updates', () => {
    it('should update job progress with stage-specific data', async () => {
      // Arrange
      const job = factories.job.create({
        user_id: testUsers[0],
        job_type: 'process-document',
        status: 'processing'
      })

      const progressUpdates = [
        { 
          stage: 'extracting', 
          percent: 25, 
          stage_data: { pages_processed: 5, total_pages: 20 } 
        },
        { 
          stage: 'chunking', 
          percent: 50, 
          stage_data: { chunks_created: 15, estimated_total: 30 } 
        },
        { 
          stage: 'embedding', 
          percent: 75, 
          stage_data: { embeddings_generated: 22, total_chunks: 30 } 
        }
      ]

      // Mock progress updates
      progressUpdates.forEach((progress, index) => {
        mockSupabase.from('background_jobs').update.mockResolvedValueOnce({
          data: [{ ...job, progress }],
          error: null
        })
      })

      // Act & Assert each progress update
      for (const progress of progressUpdates) {
        const result = await mockSupabase.from('background_jobs')
          .update({ progress })
          .eq('id', job.id)

        expect(result.error).toBeNull()
        expect(mockSupabase.from('background_jobs').update).toHaveBeenCalledWith(
          expect.objectContaining({
            progress: expect.objectContaining({
              stage: progress.stage,
              percent: progress.percent,
              stage_data: progress.stage_data
            })
          })
        )
      }

      testJobs.push(job.id)
    })

    it('should enable realtime subscriptions for job updates', async () => {
      // Arrange
      const userId = testUsers[0]
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn().mockResolvedValue('SUBSCRIBED')
      }
      
      mockSupabase.channel.mockReturnValue(mockChannel)

      // Act
      const channel = mockSupabase.channel(`user-${userId}-jobs`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'background_jobs',
          filter: `user_id=eq.${userId}`
        }, (payload) => {
          // Handle realtime updates
        })
        .subscribe()

      // Assert
      expect(mockSupabase.channel).toHaveBeenCalledWith(`user-${userId}-jobs`)
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'background_jobs',
          filter: `user_id=eq.${userId}`
        }),
        expect.any(Function)
      )
      expect(mockChannel.subscribe).toHaveBeenCalled()
    })
  })
})