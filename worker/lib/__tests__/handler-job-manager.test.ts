/**
 * Tests for HandlerJobManager - Standardized job state management
 */

import { HandlerJobManager } from '../handler-job-manager'
import type { ResumeState } from '../handler-job-manager'

describe('HandlerJobManager', () => {
  let mockSupabase: any
  let jobManager: HandlerJobManager
  const TEST_JOB_ID = 'test-job-123'

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null })
    }

    jobManager = new HandlerJobManager(mockSupabase, TEST_JOB_ID)
  })

  describe('updateProgress', () => {
    it('should update progress with correct structure', async () => {
      await jobManager.updateProgress(50, 'chunking', 'Processing chunks')

      expect(mockSupabase.from).toHaveBeenCalledWith('background_jobs')
      expect(mockSupabase.update).toHaveBeenCalledWith({
        progress: {
          percent: 50,
          stage: 'chunking',
          details: 'Processing chunks'
        },
        status: 'processing'
      })
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', TEST_JOB_ID)
    })

    it('should use default details when not provided', async () => {
      await jobManager.updateProgress(75, 'embeddings')

      expect(mockSupabase.update).toHaveBeenCalledWith({
        progress: {
          percent: 75,
          stage: 'embeddings',
          details: 'embeddings: 75%'
        },
        status: 'processing'
      })
    })

    it('should handle 0% progress', async () => {
      await jobManager.updateProgress(0, 'starting', 'Initializing')

      expect(mockSupabase.update).toHaveBeenCalledWith({
        progress: {
          percent: 0,
          stage: 'starting',
          details: 'Initializing'
        },
        status: 'processing'
      })
    })

    it('should handle 100% progress', async () => {
      await jobManager.updateProgress(100, 'complete', 'Done')

      expect(mockSupabase.update).toHaveBeenCalledWith({
        progress: {
          percent: 100,
          stage: 'complete',
          details: 'Done'
        },
        status: 'processing'
      })
    })
  })

  describe('markComplete', () => {
    it('should mark job as complete with output data', async () => {
      const outputData = {
        success: true,
        connectionCount: 42,
        processingTime: 1234
      }

      await jobManager.markComplete(outputData)

      expect(mockSupabase.from).toHaveBeenCalledWith('background_jobs')
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          progress: {
            percent: 100,
            stage: 'complete',
            details: 'Processing complete'
          },
          output_data: outputData
        })
      )
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', TEST_JOB_ID)
    })

    it('should use custom final message when provided', async () => {
      const outputData = { success: true }
      const customMessage = 'Found 123 connections'

      await jobManager.markComplete(outputData, customMessage)

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: expect.objectContaining({
            details: 'Found 123 connections'
          })
        })
      )
    })

    it('should include completed_at timestamp', async () => {
      const outputData = { success: true }
      const beforeCall = new Date().toISOString()

      await jobManager.markComplete(outputData)

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall.completed_at).toBeDefined()
      expect(new Date(updateCall.completed_at).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeCall).getTime()
      )
    })
  })

  describe('markFailed', () => {
    it('should mark job as failed with error classification', async () => {
      const error = new Error('Rate limit exceeded')

      await jobManager.markFailed(error)

      expect(mockSupabase.from).toHaveBeenCalledWith('background_jobs')
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('Rate limit exceeded'),
          error_type: 'transient'
        })
      )
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', TEST_JOB_ID)
    })

    it('should classify transient errors correctly', async () => {
      const error = new Error('Network timeout occurred')

      await jobManager.markFailed(error)

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall.error_type).toBe('transient')
    })

    it('should classify permanent errors correctly', async () => {
      const error = new Error('YOUTUBE_TRANSCRIPT_DISABLED')

      await jobManager.markFailed(error)

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall.error_type).toBe('permanent')
    })

    it('should allow custom error type override', async () => {
      const error = new Error('Some error')

      await jobManager.markFailed(error, 'paywall')

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall.error_type).toBe('paywall')
    })

    it('should include user-friendly error message', async () => {
      const error = new Error('YOUTUBE_TRANSCRIPT_DISABLED: Subtitles are off')

      await jobManager.markFailed(error)

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall.last_error).toContain('YOUTUBE_TRANSCRIPT_DISABLED')
      expect(updateCall.last_error).toContain('pasting the transcript manually')
    })

    it('should include completed_at timestamp', async () => {
      const error = new Error('Test error')
      const beforeCall = new Date().toISOString()

      await jobManager.markFailed(error)

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall.completed_at).toBeDefined()
      expect(new Date(updateCall.completed_at).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeCall).getTime()
      )
    })
  })

  describe('checkResumeState', () => {
    it('should return not resuming when resume_count is 0', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          resume_count: 0,
          metadata: null
        },
        error: null
      })

      const result = await jobManager.checkResumeState()

      expect(result.resuming).toBe(false)
      expect(result.lastStage).toBeUndefined()
    })

    it('should return not resuming when resume_count is null', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          resume_count: null,
          metadata: null
        },
        error: null
      })

      const result = await jobManager.checkResumeState()

      expect(result.resuming).toBe(false)
    })

    it('should detect resume state with checkpoint info', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          resume_count: 1,
          metadata: { last_completed_stage: 'chunking' },
          last_checkpoint_path: 'checkpoints/job-123.json',
          checkpoint_hash: 'abc123'
        },
        error: null
      })

      const result = await jobManager.checkResumeState()

      expect(result.resuming).toBe(true)
      expect(result.lastStage).toBe('chunking')
      expect(result.checkpointPath).toBe('checkpoints/job-123.json')
      expect(result.checkpointHash).toBe('abc123')
    })

    it('should return not resuming when checkpoint stage is missing', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          resume_count: 1,
          metadata: {}
        },
        error: null
      })

      const result = await jobManager.checkResumeState()

      expect(result.resuming).toBe(false)
    })

    it('should handle database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      })

      const result = await jobManager.checkResumeState()

      expect(result.resuming).toBe(false)
    })

    it('should query correct job fields', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { resume_count: 0 },
        error: null
      })

      await jobManager.checkResumeState()

      expect(mockSupabase.from).toHaveBeenCalledWith('background_jobs')
      expect(mockSupabase.select).toHaveBeenCalledWith(
        'resume_count, metadata, last_checkpoint_path, checkpoint_hash'
      )
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', TEST_JOB_ID)
    })
  })

  describe('getJob', () => {
    it('should fetch complete job record', async () => {
      const mockJob = {
        id: TEST_JOB_ID,
        job_type: 'process_document',
        status: 'processing',
        input_data: { document_id: 'doc-123' },
        entity_id: 'doc-123',
        user_id: 'user-456'
      }

      mockSupabase.single.mockResolvedValue({
        data: mockJob,
        error: null
      })

      const result = await jobManager.getJob()

      expect(result).toEqual(mockJob)
      expect(mockSupabase.select).toHaveBeenCalledWith('*')
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', TEST_JOB_ID)
    })

    it('should throw error when job not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Job not found' }
      })

      await expect(jobManager.getJob()).rejects.toThrow('Failed to fetch job')
    })
  })

  describe('updateMetadata', () => {
    it('should merge metadata with existing values', async () => {
      const existingJob = {
        metadata: {
          existing_field: 'value',
          shared_field: 'old'
        }
      }

      mockSupabase.single.mockResolvedValue({
        data: existingJob,
        error: null
      })

      await jobManager.updateMetadata({
        shared_field: 'new',
        new_field: 'added'
      })

      expect(mockSupabase.update).toHaveBeenCalledWith({
        metadata: {
          existing_field: 'value',
          shared_field: 'new',
          new_field: 'added'
        }
      })
    })

    it('should handle job with no existing metadata', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { metadata: null },
        error: null
      })

      await jobManager.updateMetadata({ new_field: 'value' })

      expect(mockSupabase.update).toHaveBeenCalledWith({
        metadata: {
          new_field: 'value'
        }
      })
    })
  })

  describe('saveCheckpoint', () => {
    it('should save checkpoint information', async () => {
      await jobManager.saveCheckpoint(
        'documents/checkpoints/job-123.json',
        'abc123def456',
        'chunking'
      )

      expect(mockSupabase.update).toHaveBeenCalledWith({
        last_checkpoint_path: 'documents/checkpoints/job-123.json',
        checkpoint_hash: 'abc123def456',
        metadata: {
          last_completed_stage: 'chunking'
        }
      })
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', TEST_JOB_ID)
    })

    it('should update all checkpoint fields together', async () => {
      await jobManager.saveCheckpoint('path.json', 'hash', 'metadata')

      const updateCall = mockSupabase.update.mock.calls[0][0]
      expect(updateCall).toHaveProperty('last_checkpoint_path')
      expect(updateCall).toHaveProperty('checkpoint_hash')
      expect(updateCall).toHaveProperty('metadata.last_completed_stage')
    })
  })

  describe('Integration scenarios', () => {
    it('should support typical handler lifecycle', async () => {
      // Start processing
      await jobManager.updateProgress(0, 'starting', 'Initializing')
      expect(mockSupabase.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'processing' })
      )

      // Update progress
      await jobManager.updateProgress(50, 'processing', 'Half done')

      // Complete successfully
      await jobManager.markComplete({ success: true, result: 42 })
      expect(mockSupabase.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_data: { success: true, result: 42 }
        })
      )

      // Should have called update 3 times
      expect(mockSupabase.update).toHaveBeenCalledTimes(3)
    })

    it('should support error handling flow', async () => {
      // Start processing
      await jobManager.updateProgress(10, 'starting')

      // Encounter error and mark failed
      const error = new Error('Rate limit exceeded')
      await jobManager.markFailed(error)

      expect(mockSupabase.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_type: 'transient'
        })
      )
    })

    it('should support checkpoint/resume flow', async () => {
      // Save checkpoint
      await jobManager.saveCheckpoint('path.json', 'hash', 'chunking')

      // Later: Check resume state
      mockSupabase.single.mockResolvedValue({
        data: {
          resume_count: 1,
          metadata: { last_completed_stage: 'chunking' },
          last_checkpoint_path: 'path.json',
          checkpoint_hash: 'hash'
        },
        error: null
      })

      const resumeState = await jobManager.checkResumeState()
      expect(resumeState.resuming).toBe(true)
      expect(resumeState.lastStage).toBe('chunking')
    })
  })
})
