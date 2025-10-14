import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

/**
 * Background job status interface
 */
export interface JobStatus {
  id: string
  type: 'import_document' | 'export_documents' | 'reprocess_connections'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  details: string
  metadata?: {
    documentId?: string
    documentIds?: string[]
    title?: string
  }
  result?: any
  error?: string
  createdAt: number
}

/**
 * Background Jobs Store State
 */
interface BackgroundJobsStore {
  // State
  jobs: Map<string, JobStatus>
  polling: boolean
  pollInterval: number

  // Computed
  activeJobs: () => JobStatus[]
  completedJobs: () => JobStatus[]
  failedJobs: () => JobStatus[]

  // Actions
  registerJob: (jobId: string, type: JobStatus['type'], metadata?: any) => void
  updateJob: (jobId: string, update: Partial<JobStatus>) => void
  replaceJob: (oldJobId: string, newJobId: string) => void
  removeJob: (jobId: string) => void
  clearCompleted: () => void
  startPolling: () => void
  stopPolling: () => void
}

let pollIntervalId: NodeJS.Timeout | null = null

/**
 * Zustand store for unified background job management.
 *
 * Purpose: Consolidate polling logic from ImportTab, ConnectionsTab,
 * and ExportTab into one place. Reduces ~50 lines of duplication.
 *
 * Features:
 * - Auto-start polling when first job registered
 * - Auto-stop polling when no active jobs
 * - Unified job tracking across all tabs
 *
 * @example
 * ```tsx
 * const { registerJob, activeJobs } = useBackgroundJobsStore()
 *
 * // Register job after triggering import
 * const result = await importFromStorage(docId)
 * if (result.jobId) {
 *   registerJob(result.jobId, 'import_document', { title: doc.title })
 * }
 *
 * // Display active jobs
 * const myJobs = activeJobs().filter(j => j.type === 'import_document')
 * ```
 */
export const useBackgroundJobsStore = create<BackgroundJobsStore>()(
  devtools(
    (set, get) => ({
      jobs: new Map(),
      polling: false,
      pollInterval: 2000, // 2 seconds

      // Computed selectors
      activeJobs: () => {
        const { jobs } = get()
        return Array.from(jobs.values()).filter(
          (j) => j.status === 'pending' || j.status === 'processing'
        )
      },

      completedJobs: () => {
        const { jobs } = get()
        return Array.from(jobs.values()).filter((j) => j.status === 'completed')
      },

      failedJobs: () => {
        const { jobs } = get()
        return Array.from(jobs.values()).filter((j) => j.status === 'failed')
      },

      // Actions
      registerJob: (jobId, type, metadata) => {
        console.log(`[BackgroundJobs] Registering job: ${jobId} (${type})`)
        set((state) => {
          const newJobs = new Map(state.jobs)
          newJobs.set(jobId, {
            id: jobId,
            type,
            status: 'pending',
            progress: 0,
            details: 'Job created...',
            metadata,
            createdAt: Date.now(),
          })
          return { jobs: newJobs }
        })

        // Auto-start polling when first job registered
        const { activeJobs, startPolling, polling } = get()
        if (activeJobs().length > 0 && !polling) {
          console.log('[BackgroundJobs] Auto-starting polling')
          startPolling()
        }
      },

      updateJob: (jobId, update) => {
        set((state) => {
          const newJobs = new Map(state.jobs)
          const existingJob = newJobs.get(jobId)
          if (existingJob) {
            newJobs.set(jobId, { ...existingJob, ...update })
          }
          return { jobs: newJobs }
        })

        // Auto-stop polling when no active jobs
        const { activeJobs, stopPolling, polling } = get()
        if (activeJobs().length === 0 && polling) {
          console.log('[BackgroundJobs] Auto-stopping polling (no active jobs)')
          stopPolling()
        }
      },

      replaceJob: (oldJobId, newJobId) => {
        console.log(`[BackgroundJobs] Replacing job ${oldJobId} with ${newJobId}`)

        let jobWasReplaced = false

        set((state) => {
          const newJobs = new Map(state.jobs)
          const oldJob = newJobs.get(oldJobId)

          if (oldJob) {
            console.log(`[BackgroundJobs] Found old job, replacing with real job ID`)
            // Remove old job
            newJobs.delete(oldJobId)

            // Create new job with same data but new ID
            newJobs.set(newJobId, {
              ...oldJob,
              id: newJobId,
              status: 'processing',
              progress: 30,
              details: 'Import job created'
            })
            jobWasReplaced = true
          } else {
            console.warn(`[BackgroundJobs] Old job ${oldJobId} not found! Creating new job instead.`)
            // Old job doesn't exist - create a new one from scratch
            newJobs.set(newJobId, {
              id: newJobId,
              type: 'import_document',
              status: 'processing',
              progress: 30,
              details: 'Import job created',
              createdAt: Date.now(),
              metadata: {}
            })
            jobWasReplaced = true
          }

          return { jobs: newJobs }
        })

        // Ensure polling continues
        if (jobWasReplaced) {
          const { activeJobs, startPolling, polling } = get()
          console.log(`[BackgroundJobs] Active jobs after replace: ${activeJobs().length}, polling: ${polling}`)
          if (activeJobs().length > 0 && !polling) {
            console.log('[BackgroundJobs] Restarting polling after job replacement')
            startPolling()
          }
        }
      },

      removeJob: (jobId) => {
        console.log(`[BackgroundJobs] Removing job: ${jobId}`)
        set((state) => {
          const newJobs = new Map(state.jobs)
          newJobs.delete(jobId)
          return { jobs: newJobs }
        })

        // Auto-stop polling when no active jobs
        const { activeJobs, stopPolling, polling } = get()
        if (activeJobs().length === 0 && polling) {
          console.log('[BackgroundJobs] Auto-stopping polling (job removed, no active jobs)')
          stopPolling()
        }
      },

      clearCompleted: () => {
        const { completedJobs } = get()
        console.log(`[BackgroundJobs] Clearing ${completedJobs().length} completed jobs`)
        set((state) => {
          const newJobs = new Map(state.jobs)
          Array.from(newJobs.keys()).forEach((jobId) => {
            const job = newJobs.get(jobId)!
            if (job.status === 'completed') {
              newJobs.delete(jobId)
            }
          })
          return { jobs: newJobs }
        })
      },

      startPolling: () => {
        if (pollIntervalId) {
          console.log('[BackgroundJobs] Polling already active')
          return // Already polling
        }

        console.log('[BackgroundJobs] Starting polling')
        set({ polling: true })

        const poll = async () => {
          const { activeJobs, updateJob } = get()
          const active = activeJobs()

          if (active.length === 0) {
            get().stopPolling()
            return
          }

          const supabase = createClient()

          for (const job of active) {
            try {
              // Skip polling temp jobs (IDs like "import-{uuid}", "export-{uuid}")
              // These will be updated with real job IDs after conflict resolution
              const isTempJob = job.id.startsWith('import-') ||
                               job.id.startsWith('export-') ||
                               job.id.startsWith('reprocess-')

              if (isTempJob) {
                // Don't query database for temp jobs, they don't exist yet
                continue
              }

              const { data: jobData, error } = await supabase
                .from('background_jobs')
                .select('status, progress, output_data, error_message')
                .eq('id', job.id)
                .single()

              if (error) {
                console.error(`[BackgroundJobs] Error polling job ${job.id}:`, error)
                continue
              }

              if (jobData) {
                // Extract progress info from JSONB progress field
                const progressData = jobData.progress as any
                const progressPercent = typeof progressData === 'number'
                  ? progressData
                  : (progressData?.percentage || progressData?.progress || 0)
                const progressMessage = progressData?.message || progressData?.stage || ''

                if (jobData.status === 'completed') {
                  console.log(`[BackgroundJobs] Job completed: ${job.id}`)
                  updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    details: progressMessage || 'Completed successfully',
                    result: jobData.output_data,
                  })
                } else if (jobData.status === 'failed') {
                  console.error(`[BackgroundJobs] Job failed: ${job.id}`, jobData.output_data)
                  updateJob(job.id, {
                    status: 'failed',
                    progress: 0,
                    details: jobData.error_message || progressMessage || 'Job failed',
                    error: jobData.output_data?.error || jobData.error_message || 'Unknown error',
                  })
                } else if (jobData.status === 'processing') {
                  updateJob(job.id, {
                    status: 'processing',
                    progress: progressPercent,
                    details: progressMessage || 'Processing...',
                  })
                }
              }
            } catch (err) {
              console.error(`[BackgroundJobs] Polling error for job ${job.id}:`, err)
            }
          }
        }

        // Initial poll
        poll()

        // Set up interval
        pollIntervalId = setInterval(poll, get().pollInterval)
      },

      stopPolling: () => {
        if (pollIntervalId) {
          console.log('[BackgroundJobs] Stopping polling')
          clearInterval(pollIntervalId)
          pollIntervalId = null
        }
        set({ polling: false })
      },
    }),
    {
      name: 'BackgroundJobs',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
