import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

/**
 * Background job status interface
 */
export interface JobStatus {
  id: string
  type: 'process_document' | 'import_document' | 'export_documents' | 'reprocess_connections' | 'detect_connections' | 'enrich_chunks' | 'enrich_and_connect' | 'reprocess_document' | 'continue_processing' | 'obsidian_export' | 'obsidian_sync' | 'readwise_import' | 'scan_vault' | 'import_from_vault' | 'export_vault_sparks' | 'import_vault_sparks' | 'generate_flashcards'
  status: 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled'
  progress: number
  details: string
  metadata?: {
    documentId?: string
    documentIds?: string[]
    title?: string
  }
  input_data?: {
    mode?: string
    regenerateEmbeddings?: boolean
    reprocessConnections?: boolean
    includeConnections?: boolean
    includeAnnotations?: boolean
    [key: string]: any
  }
  result?: any
  error?: string
  createdAt: number
  updatedAt?: number
  // Phase 4 fields
  pauseReason?: string
  checkpointStage?: string
  canResume?: boolean
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
let lastJobCompletedAt: number | null = null
const GRACE_PERIOD_MS = 30000 // 30 seconds grace period after last job completes

/**
 * Format raw stage names into human-readable labels
 */
function formatStageName(stage: string): string {
  const stageNames: Record<string, string> = {
    // PDF Processing
    download: 'Downloading',
    extract: 'Extracting',
    cleanup_local: 'Cleaning text',
    cleanup_ai: 'AI cleanup',
    bulletproof_mapping: 'Mapping metadata',
    chunking: 'Chunking',
    metadata_transfer: 'Transferring metadata',
    metadata: 'Enriching metadata',
    embeddings: 'Generating embeddings',
    finalize: 'Finalizing',

    // Import
    reading: 'Reading from storage',
    validating: 'Validating',
    strategy: 'Applying import strategy',

    // Export
    creating: 'Creating export',
    zipping: 'Creating ZIP',
    saving: 'Saving to storage',

    // Connections
    preparing: 'Preparing',
    detecting: 'Detecting connections',

    // Common
    processing: 'Processing',
    complete: 'Complete',
  }

  return stageNames[stage] || stage
}

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
    persist(
      (set, get) => ({
        jobs: new Map(),
        polling: false,
        pollInterval: 2000, // 2 seconds

      // Computed selectors
      activeJobs: () => {
        const { jobs } = get()
        return Array.from(jobs.values()).filter(
          (j) => j.status === 'pending' || j.status === 'processing' || j.status === 'paused'
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
          const { activeJobs, updateJob, registerJob, jobs } = get()
          const supabase = createClient()

          // Auto-discovery FIRST: Check for new jobs in database that we don't know about yet
          // This catches worker-created jobs like detect-connections
          // CRITICAL: Run this BEFORE checking if active.length === 0
          try {
            const { data: allActiveJobs, error: discoveryError } = await supabase
              .from('background_jobs')
              .select('id, job_type, input_data, entity_id, entity_type, created_at')
              .in('status', ['pending', 'processing', 'paused'])
              .order('created_at', { ascending: false })
              .limit(50) // Last 50 active jobs

            if (!discoveryError && allActiveJobs) {
              for (const dbJob of allActiveJobs) {
                // Check if we already know about this job
                if (!jobs.has(dbJob.id)) {
                  console.log(`[BackgroundJobs] Auto-discovered new job: ${dbJob.id} (${dbJob.job_type})`)

                  // Get document title for better display
                  let title = 'Unknown'
                  const documentId = dbJob.entity_type === 'document' ? dbJob.entity_id : (dbJob.input_data as any)?.document_id

                  if (documentId) {
                    const { data: doc } = await supabase
                      .from('documents')
                      .select('title')
                      .eq('id', documentId)
                      .single()

                    if (doc) {
                      title = doc.title
                    }
                  }

                  // Register the newly discovered job
                  registerJob(dbJob.id, dbJob.job_type as any, {
                    title,
                    documentId,
                  })
                }
              }
            }
          } catch (discoveryErr) {
            console.error('[BackgroundJobs] Auto-discovery error:', discoveryErr)
            // Don't block polling if discovery fails
          }

          // Now get the updated active jobs list (after auto-discovery)
          const active = activeJobs()

          // Stop polling only if:
          // 1. No active jobs after auto-discovery, AND
          // 2. Grace period has elapsed (to allow worker to create follow-up jobs like detect-connections)
          if (active.length === 0) {
            const now = Date.now()

            // If this is the first poll with no jobs, record the time
            if (!lastJobCompletedAt) {
              lastJobCompletedAt = now
              console.log('[BackgroundJobs] No active jobs, starting 30s grace period for follow-up jobs')
              return // Keep polling during grace period
            }

            // Check if grace period has elapsed
            const timeSinceLastJob = now - lastJobCompletedAt
            if (timeSinceLastJob < GRACE_PERIOD_MS) {
              console.log(`[BackgroundJobs] Grace period active (${Math.round(timeSinceLastJob / 1000)}s / 30s), continuing to poll`)
              return // Keep polling during grace period
            }

            // Grace period elapsed, safe to stop
            console.log('[BackgroundJobs] Grace period elapsed, no new jobs found, stopping polling')
            lastJobCompletedAt = null // Reset for next session
            get().stopPolling()
            return
          }

          // Reset grace period timer if we have active jobs
          lastJobCompletedAt = null

          // Poll existing jobs
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
                .select('status, progress, input_data, output_data, error_message, updated_at, pause_reason, last_checkpoint_stage')
                .eq('id', job.id)
                .single()

              if (error) {
                console.error(`[BackgroundJobs] Error polling job ${job.id}:`, error.message || error)
                // Don't block other jobs if one fails
                continue
              }

              if (jobData) {
                // Extract progress info from JSONB progress field
                const progressData = jobData.progress as any
                const progressPercent = typeof progressData === 'number'
                  ? progressData
                  : (progressData?.percent || progressData?.percentage || progressData?.progress || 0)

                // Format stage names for better UX
                const rawStage = progressData?.stage || ''
                const details = progressData?.details || progressData?.message || ''
                const formattedStage = formatStageName(rawStage)
                const progressMessage = details || formattedStage || ''

                // Extract checkpoint info from progress JSONB
                const checkpointData = progressData?.checkpoint
                const canResume = checkpointData?.can_resume || false
                const checkpointStage = jobData.last_checkpoint_stage || checkpointData?.stage

                // Parse updated_at for heartbeat tracking
                const updatedAt = jobData.updated_at ? new Date(jobData.updated_at).getTime() : undefined

                if (jobData.status === 'completed') {
                  console.log(`[BackgroundJobs] Job completed: ${job.id}`)
                  updateJob(job.id, {
                    status: 'completed',
                    progress: 100,
                    details: progressMessage || 'Completed successfully',
                    result: jobData.output_data,
                    input_data: jobData.input_data,
                    updatedAt,
                  })
                } else if (jobData.status === 'failed') {
                  console.error(`[BackgroundJobs] Job failed: ${job.id}`, jobData.output_data)
                  updateJob(job.id, {
                    status: 'failed',
                    progress: 0,
                    details: jobData.error_message || progressMessage || 'Job failed',
                    error: jobData.output_data?.error || jobData.error_message || 'Unknown error',
                    input_data: jobData.input_data,
                    updatedAt,
                  })
                } else if (jobData.status === 'paused') {
                  updateJob(job.id, {
                    status: 'paused',
                    progress: progressPercent,
                    details: progressMessage || 'Paused',
                    pauseReason: jobData.pause_reason,
                    checkpointStage,
                    canResume: true,
                    input_data: jobData.input_data,
                    updatedAt,
                  })
                } else if (jobData.status === 'cancelled') {
                  updateJob(job.id, {
                    status: 'cancelled',
                    progress: progressPercent,
                    details: 'Cancelled by user',
                    input_data: jobData.input_data,
                    updatedAt,
                  })
                } else if (jobData.status === 'processing') {
                  updateJob(job.id, {
                    status: 'processing',
                    progress: progressPercent,
                    details: progressMessage || 'Processing...',
                    canResume,
                    checkpointStage,
                    input_data: jobData.input_data,
                    updatedAt,
                  })
                } else if (jobData.status === 'pending') {
                  updateJob(job.id, {
                    status: 'pending',
                    progress: progressPercent,
                    details: progressMessage || 'Waiting to start...',
                    input_data: jobData.input_data,
                    updatedAt,
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
          lastJobCompletedAt = null // Reset grace period on manual stop
        }
        set({ polling: false })
      },
    }),
      {
        name: 'background-jobs-storage',
        // Custom storage to handle Map serialization
        storage: {
          getItem: (name) => {
            const str = localStorage.getItem(name)
            if (!str) return null
            const parsed = JSON.parse(str)
            // Convert jobs array back to Map
            if (parsed.state?.jobs) {
              parsed.state.jobs = new Map(parsed.state.jobs)
            }
            return parsed
          },
          setItem: (name, value) => {
            // Convert jobs Map to array for serialization
            const toSerialize = {
              ...value,
              state: {
                ...value.state,
                jobs: Array.from(value.state.jobs.entries()),
              },
            }
            localStorage.setItem(name, JSON.stringify(toSerialize))
          },
          removeItem: (name) => localStorage.removeItem(name),
        },
        // Only persist jobs, not polling state
        partialize: (state) => ({ jobs: state.jobs } as BackgroundJobsStore),
        // Auto-restart polling on hydration if there are active jobs
        onRehydrateStorage: () => (state) => {
          if (state) {
            console.log('[BackgroundJobs] Rehydrated from storage')
            const activeJobs = state.activeJobs()
            if (activeJobs.length > 0) {
              console.log(`[BackgroundJobs] Found ${activeJobs.length} active jobs, restarting polling`)
              state.startPolling()
            }
          }
        },
      }
    ),
    {
      name: 'BackgroundJobs',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
