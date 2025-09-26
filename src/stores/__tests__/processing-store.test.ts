import { renderHook, act } from '@testing-library/react'
import { useProcessingStore, ProcessingJob } from '../processing-store'

describe('ProcessingStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useProcessingStore())
    act(() => {
      // Clear all jobs
      result.current.jobs.forEach(job => {
        result.current.removeJob(job.id)
      })
    })
  })

  test('should initialize with empty jobs array', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    expect(result.current.jobs).toEqual([])
  })

  test('should add job correctly', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const newJob: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Test Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(newJob)
    })

    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.jobs[0]).toEqual(newJob)
  })

  test('should add multiple jobs', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const job1: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'First Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    const job2: ProcessingJob = {
      id: 'job-2',
      documentId: 'doc-2',
      title: 'Second Document',
      status: 'processing',
      progress: 50,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(job1)
      result.current.addJob(job2)
    })

    expect(result.current.jobs).toHaveLength(2)
    expect(result.current.jobs[0]).toEqual(job1)
    expect(result.current.jobs[1]).toEqual(job2)
  })

  test('should update job correctly', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const initialJob: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Test Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(initialJob)
    })

    const updates = {
      status: 'processing' as const,
      progress: 75
    }

    act(() => {
      result.current.updateJob('job-1', updates)
    })

    const updatedJob = result.current.jobs[0]
    expect(updatedJob.status).toBe('processing')
    expect(updatedJob.progress).toBe(75)
    expect(updatedJob.title).toBe('Test Document') // Unchanged fields remain
  })

  test('should update job with error', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const initialJob: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Test Document',
      status: 'processing',
      progress: 50,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(initialJob)
    })

    act(() => {
      result.current.updateJob('job-1', {
        status: 'failed',
        error: 'Processing failed',
        completedAt: new Date()
      })
    })

    const updatedJob = result.current.jobs[0]
    expect(updatedJob.status).toBe('failed')
    expect(updatedJob.error).toBe('Processing failed')
    expect(updatedJob.completedAt).toBeDefined()
  })

  test('should not update non-existent job', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const job: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Test Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(job)
    })

    act(() => {
      result.current.updateJob('non-existent', { status: 'completed' })
    })

    // Original job should be unchanged
    expect(result.current.jobs[0]).toEqual(job)
  })

  test('should remove job correctly', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const job1: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'First Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    const job2: ProcessingJob = {
      id: 'job-2',
      documentId: 'doc-2',
      title: 'Second Document',
      status: 'processing',
      progress: 50,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(job1)
      result.current.addJob(job2)
    })

    act(() => {
      result.current.removeJob('job-1')
    })

    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.jobs[0].id).toBe('job-2')
  })

  test('should handle removing non-existent job', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const job: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Test Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(job)
    })

    act(() => {
      result.current.removeJob('non-existent')
    })

    // Job should still be there
    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.jobs[0]).toEqual(job)
  })

  test('should clear completed jobs', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const pendingJob: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Pending Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    const processingJob: ProcessingJob = {
      id: 'job-2',
      documentId: 'doc-2',
      title: 'Processing Document',
      status: 'processing',
      progress: 50,
      startedAt: new Date()
    }

    const completedJob: ProcessingJob = {
      id: 'job-3',
      documentId: 'doc-3',
      title: 'Completed Document',
      status: 'completed',
      progress: 100,
      startedAt: new Date(),
      completedAt: new Date()
    }

    const failedJob: ProcessingJob = {
      id: 'job-4',
      documentId: 'doc-4',
      title: 'Failed Document',
      status: 'failed',
      progress: 30,
      error: 'Something went wrong',
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(pendingJob)
      result.current.addJob(processingJob)
      result.current.addJob(completedJob)
      result.current.addJob(failedJob)
    })

    act(() => {
      result.current.clearCompleted()
    })

    expect(result.current.jobs).toHaveLength(3)
    expect(result.current.jobs.find(job => job.id === 'job-3')).toBeUndefined()
    expect(result.current.jobs.find(job => job.id === 'job-1')).toBeDefined()
    expect(result.current.jobs.find(job => job.id === 'job-2')).toBeDefined()
    expect(result.current.jobs.find(job => job.id === 'job-4')).toBeDefined()
  })

  test('should clear completed jobs when none exist', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const pendingJob: ProcessingJob = {
      id: 'job-1',
      documentId: 'doc-1',
      title: 'Pending Document',
      status: 'pending',
      progress: 0,
      startedAt: new Date()
    }

    act(() => {
      result.current.addJob(pendingJob)
    })

    act(() => {
      result.current.clearCompleted()
    })

    // Should remain unchanged
    expect(result.current.jobs).toHaveLength(1)
    expect(result.current.jobs[0]).toEqual(pendingJob)
  })

  test('should handle complete job lifecycle', () => {
    const { result } = renderHook(() => useProcessingStore())
    
    const jobId = 'job-1'
    const documentId = 'doc-1'
    
    // Add job
    act(() => {
      result.current.addJob({
        id: jobId,
        documentId,
        title: 'Test Document',
        status: 'pending',
        progress: 0,
        startedAt: new Date()
      })
    })

    // Start processing
    act(() => {
      result.current.updateJob(jobId, {
        status: 'processing',
        progress: 25
      })
    })

    // Progress update
    act(() => {
      result.current.updateJob(jobId, {
        progress: 75
      })
    })

    // Complete
    const completedAt = new Date()
    act(() => {
      result.current.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        completedAt
      })
    })

    const finalJob = result.current.jobs[0]
    expect(finalJob.status).toBe('completed')
    expect(finalJob.progress).toBe(100)
    expect(finalJob.completedAt).toEqual(completedAt)

    // Clear completed
    act(() => {
      result.current.clearCompleted()
    })

    expect(result.current.jobs).toHaveLength(0)
  })
})