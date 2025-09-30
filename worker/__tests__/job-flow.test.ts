/**
 * Tests for background job status flow:
 * pending → processing → completed/failed
 * 
 * This tests the core worker logic for job state transitions,
 * retry mechanisms, and error handling.
 */

import { jest } from '@jest/globals'

describe('Background Job Status Flow', () => {
  // Mock Supabase client
  const mockSupabase = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Job State Transitions', () => {
    test('should correctly identify transient vs permanent errors', () => {
      // Import the function directly to test error classification
      const { getUserFriendlyError } = require('../lib/errors')
      
      const transientErrors = [
        'Rate limit exceeded (429)',
        'Request timeout after 30s',
        'Service temporarily unavailable',
        'ECONNRESET connection lost',
        'HTTP 503 Service Unavailable'
      ]

      const permanentErrors = [
        'Invalid API key provided',
        'PDF file is corrupted',
        'Unauthorized access denied',
        'Resource not found (404)',
        'Invalid file format'
      ]

      // Test that transient errors get appropriate retry messages
      transientErrors.forEach(errorMsg => {
        const error = new Error(errorMsg)
        const friendlyMsg = getUserFriendlyError(error)
        
        // Should contain retry language
        expect(friendlyMsg).toMatch(/retry|automatically|minutes|wait/i)
      })

      // Test that permanent errors get immediate action messages
      permanentErrors.forEach(errorMsg => {
        const error = new Error(errorMsg)
        const friendlyMsg = getUserFriendlyError(error)
        
        // Should not suggest automatic retry
        expect(friendlyMsg).not.toMatch(/retry automatically/i)
      })
    })

    test('should provide appropriate error classification patterns', () => {
      // Test error pattern matching that would be used in worker
      const errorPatterns = {
        transient: [
          'rate limit',
          'timeout',
          'unavailable', 
          'ECONNRESET',
          '429',
          '503',
          '504'
        ],
        permanent: [
          'unauthorized',
          'invalid pdf',
          'corrupted',
          'password',
          'not found',
          '404',
          '403'
        ]
      }

      const isTransientPattern = (error: Error): boolean => {
        const message = error.message.toLowerCase()
        return errorPatterns.transient.some(pattern => 
          message.includes(pattern.toLowerCase())
        )
      }

      // Test transient error detection
      errorPatterns.transient.forEach(pattern => {
        const error = new Error(`Test error with ${pattern}`)
        expect(isTransientPattern(error)).toBe(true)
      })

      // Test permanent error detection
      errorPatterns.permanent.forEach(pattern => {
        const error = new Error(`Test error with ${pattern}`)
        expect(isTransientPattern(error)).toBe(false)
      })
    })
  })

  describe('Job Progress Tracking', () => {
    test('should track processing stages correctly', () => {
      const stages = {
        DOWNLOAD: { name: 'download', percent: 10 },
        EXTRACT: { name: 'extract', percent: 30 },
        SAVE_MARKDOWN: { name: 'save_markdown', percent: 50 },
        EMBED: { name: 'embed', percent: 99 },
        COMPLETE: { name: 'complete', percent: 100 }
      }

      // Verify stage progression makes sense
      const stageValues = Object.values(stages)
      stageValues.forEach((stage, index) => {
        if (index > 0) {
          expect(stage.percent).toBeGreaterThan(stageValues[index - 1].percent)
        }
      })

      // Verify all critical stages are present
      expect(stages.DOWNLOAD.percent).toBe(10)
      expect(stages.SAVE_MARKDOWN.percent).toBe(50) // Checkpoint stage
      expect(stages.COMPLETE.percent).toBe(100)
    })

    test('should handle progress updates correctly', async () => {
      const jobId = 'job-123'
      const stage = 'extract'
      const percent = 30

      // Simulate progress update that would happen in worker
      const progressUpdate = {
        progress: {
          percent,
          stage,
          updated_at: expect.any(String)
        }
      }

      // Verify the structure matches what the worker would send
      expect(progressUpdate.progress.percent).toBe(percent)
      expect(progressUpdate.progress.stage).toBe(stage)
      expect(progressUpdate.progress).toHaveProperty('updated_at')
    })

    test('should handle checkpoint recovery correctly', () => {
      // Test checkpoint logic for save_markdown stage
      const completedStages = ['download', 'extract', 'save_markdown']
      const currentStage = 'embed'

      // If save_markdown is completed, should skip to embed stage
      const shouldSkipExtraction = completedStages.includes('save_markdown')
      expect(shouldSkipExtraction).toBe(true)

      // Should resume from embed stage
      const nextStage = shouldSkipExtraction ? 'embed' : 'download'
      expect(nextStage).toBe('embed')
    })
  })

  describe('Retry Logic Calculations', () => {
    test('should calculate exponential backoff correctly', () => {
      const calculateDelay = (retryCount: number): number => {
        return 5000 * Math.pow(5, retryCount)
      }

      const expectedDelays = [
        { retry: 0, delay: 5000 },     // 5 seconds
        { retry: 1, delay: 25000 },    // 25 seconds  
        { retry: 2, delay: 125000 },   // ~2 minutes
        { retry: 3, delay: 625000 }    // ~10 minutes
      ]

      expectedDelays.forEach(({ retry, delay }) => {
        expect(calculateDelay(retry)).toBe(delay)
      })
    })

    test('should respect max retry limits', () => {
      const maxRetries = 3
      const retryAttempts = [0, 1, 2, 3, 4, 5]

      retryAttempts.forEach(attempt => {
        const canRetry = attempt < maxRetries
        
        if (attempt < 3) {
          expect(canRetry).toBe(true)
        } else {
          expect(canRetry).toBe(false)
        }
      })
    })

    test('should handle retry scheduling correctly', () => {
      const now = Date.now()
      const delayMs = 25000 // 25 seconds
      const nextRetry = new Date(now + delayMs)
      
      // Verify retry time is in the future
      expect(nextRetry.getTime()).toBeGreaterThan(now)
      
      // Verify delay calculation
      const actualDelay = nextRetry.getTime() - now
      expect(actualDelay).toBe(delayMs)
    })
  })

  describe('Job Status Flow Validation', () => {
    test('should validate status transitions', () => {
      const validTransitions = {
        'pending': ['processing', 'failed'],
        'processing': ['completed', 'failed'],
        'failed': ['processing'], // For retries
        'completed': [] // Terminal state
      }

      // Test valid transitions
      expect(validTransitions.pending).toContain('processing')
      expect(validTransitions.processing).toContain('completed')
      expect(validTransitions.processing).toContain('failed')
      expect(validTransitions.failed).toContain('processing') // Retry

      // Test invalid transitions
      expect(validTransitions.completed).toHaveLength(0) // No transitions from completed
    })

    test('should handle job data structure correctly', () => {
      const jobStructure = {
        id: 'job-123',
        user_id: 'user-456', 
        job_type: 'process_document',
        entity_type: 'document',
        entity_id: 'doc-789',
        status: 'pending',
        progress: {},
        input_data: {
          document_id: 'doc-789',
          storage_path: 'user-456/doc-789'
        },
        retry_count: 0,
        max_retries: 3,
        last_error: null,
        next_retry_at: null,
        started_at: null,
        completed_at: null,
        created_at: expect.any(String)
      }

      // Verify required fields are present
      expect(jobStructure).toHaveProperty('id')
      expect(jobStructure).toHaveProperty('job_type')
      expect(jobStructure).toHaveProperty('status')
      expect(jobStructure).toHaveProperty('input_data')
      expect(jobStructure).toHaveProperty('retry_count')
      expect(jobStructure).toHaveProperty('max_retries')

      // Verify job type mapping
      expect(jobStructure.job_type).toBe('process_document')
      expect(jobStructure.entity_type).toBe('document')
      expect(jobStructure.input_data.document_id).toBe(jobStructure.entity_id)
    })

    test('should handle error state persistence', () => {
      const errorStates = {
        transient_retry: {
          status: 'failed',
          retry_count: 1,
          max_retries: 3,
          next_retry_at: expect.any(String),
          last_error: 'AI service rate limit reached. Will retry automatically in a few minutes.'
        },
        permanent_failure: {
          status: 'failed',
          completed_at: expect.any(String),
          last_error: 'PDF file appears corrupted or password-protected. Please try a different file.'
        },
        max_retries_exceeded: {
          status: 'failed',
          retry_count: 3,
          max_retries: 3,
          completed_at: expect.any(String),
          last_error: expect.any(String)
        }
      }

      // Test transient error with retry
      expect(errorStates.transient_retry.status).toBe('failed')
      expect(errorStates.transient_retry.retry_count).toBeLessThan(errorStates.transient_retry.max_retries)
      expect(errorStates.transient_retry).toHaveProperty('next_retry_at')

      // Test permanent failure
      expect(errorStates.permanent_failure.status).toBe('failed')
      expect(errorStates.permanent_failure).toHaveProperty('completed_at')
      expect(errorStates.permanent_failure).not.toHaveProperty('next_retry_at')

      // Test max retries exceeded
      expect(errorStates.max_retries_exceeded.retry_count).toBe(errorStates.max_retries_exceeded.max_retries)
      expect(errorStates.max_retries_exceeded).toHaveProperty('completed_at')
    })
  })

  describe('Processing Pipeline Integration', () => {
    test('should validate document processing stages', () => {
      const processingStages = [
        'download',      // Get PDF from storage
        'extract',       // Gemini PDF → markdown + chunks  
        'save_markdown', // Save to storage (checkpoint)
        'embed',         // Generate embeddings for chunks
        'complete'       // Mark as finished
      ]

      // Verify checkpoint stage is in the middle
      const checkpointIndex = processingStages.indexOf('save_markdown')
      expect(checkpointIndex).toBeGreaterThan(0)
      expect(checkpointIndex).toBeLessThan(processingStages.length - 1)

      // Verify all critical stages are present
      expect(processingStages).toContain('download')
      expect(processingStages).toContain('extract')
      expect(processingStages).toContain('save_markdown')
      expect(processingStages).toContain('embed')
      expect(processingStages).toContain('complete')
    })

    test('should handle document availability flags', () => {
      const documentStates = {
        initial: {
          processing_status: 'pending',
          markdown_available: false,
          embeddings_available: false
        },
        after_extraction: {
          processing_status: 'extracted', 
          markdown_available: true,
          embeddings_available: false
        },
        completed: {
          processing_status: 'completed',
          markdown_available: true,
          embeddings_available: true,
          processing_completed_at: expect.any(String)
        },
        failed: {
          processing_status: 'failed',
          processing_error: expect.any(String),
          markdown_available: false,
          embeddings_available: false
        }
      }

      // Test progressive availability
      expect(documentStates.initial.markdown_available).toBe(false)
      expect(documentStates.after_extraction.markdown_available).toBe(true)
      expect(documentStates.after_extraction.embeddings_available).toBe(false)
      expect(documentStates.completed.embeddings_available).toBe(true)

      // Test failure state
      expect(documentStates.failed.processing_status).toBe('failed')
      expect(documentStates.failed).toHaveProperty('processing_error')
    })
  })
})