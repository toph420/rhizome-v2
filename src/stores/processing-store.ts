import { create } from 'zustand'

/**
 * Processing job status.
 */
export type ProcessingStatus = 'pending' | 'processing' | 'embedding' | 'completed' | 'failed'

/**
 * Processing job interface.
 */
export interface ProcessingJob {
  id: string
  documentId: string
  title: string
  status: ProcessingStatus
  progress: number
  error?: string
  startedAt: Date
  completedAt?: Date
}

/**
 * Processing store state.
 */
interface ProcessingState {
  jobs: ProcessingJob[]
  addJob: (job: ProcessingJob) => void
  updateJob: (id: string, updates: Partial<ProcessingJob>) => void
  removeJob: (id: string) => void
  clearCompleted: () => void
}

/**
 * Zustand store for managing document processing jobs.
 * Tracks status, progress, and errors for real-time UI updates.
 */
export const useProcessingStore = create<ProcessingState>((set) => ({
  jobs: [],
  
  /**
   * Adds a new processing job to the store.
   * @param job - Job to add.
   * @returns {void}
   */
  addJob: (job) => set((state) => ({
    jobs: [...state.jobs, job]
  })),
  
  /**
   * Updates an existing processing job.
   * @param id - Job ID to update.
   * @param updates - Partial job updates to apply.
   * @returns {void}
   */
  updateJob: (id, updates) => set((state) => ({
    jobs: state.jobs.map(job => 
      job.id === id ? { ...job, ...updates } : job
    )
  })),
  
  /**
   * Removes a processing job from the store.
   * @param id - Job ID to remove.
   * @returns {void}
   */
  removeJob: (id) => set((state) => ({
    jobs: state.jobs.filter(job => job.id !== id)
  })),
  
  /**
   * Clears all completed processing jobs.
   * @returns {void}
   */
  clearCompleted: () => set((state) => ({
    jobs: state.jobs.filter(job => job.status !== 'completed')
  }))
}))