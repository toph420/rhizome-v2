'use client'

import { useState, useEffect } from 'react'
import { clearAllJobs, clearCompletedJobs, clearFailedJobs, forceFailAllProcessing, clearAllJobsAndProcessingDocuments, getAllJobs } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Loader2, Trash2, AlertTriangle, Bomb } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { JobList } from '@/components/admin/JobList'

export function JobsTab() {
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [dbJobs, setDbJobs] = useState<any[]>([])

  // Prevent hydration mismatch
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Load jobs from database on mount
  useEffect(() => {
    async function loadJobs() {
      const result = await getAllJobs(24) // Last 24 hours
      if (result.success && result.jobs) {
        setDbJobs(result.jobs)
      }
    }
    loadJobs()

    // Refresh every 5 seconds
    const interval = setInterval(loadJobs, 5000)
    return () => clearInterval(interval)
  }, [])

  // Get all jobs from store
  const { jobs } = useBackgroundJobsStore()
  const storeJobs = isHydrated ? Array.from(jobs.values()) : []

  // Merge database jobs with store jobs (database as source of truth)
  const jobsMap = new Map()

  // Add database jobs first
  dbJobs.forEach(dbJob => {
    jobsMap.set(dbJob.id, {
      id: dbJob.id,
      type: dbJob.job_type,
      status: dbJob.status,
      progress: dbJob.progress_percent || 0,
      details: dbJob.progress_message || dbJob.progress_stage || '',
      metadata: dbJob.input_data || {},
      input_data: dbJob.input_data,
      result: dbJob.output_data,
      error: dbJob.error_message,
      createdAt: new Date(dbJob.created_at).getTime(),
      updatedAt: dbJob.updated_at ? new Date(dbJob.updated_at).getTime() : undefined,
    })
  })

  // Override with store jobs if they're more recent
  storeJobs.forEach(storeJob => {
    const existing = jobsMap.get(storeJob.id)
    if (!existing || (storeJob.updatedAt && (!existing.updatedAt || storeJob.updatedAt > existing.updatedAt))) {
      jobsMap.set(storeJob.id, storeJob)
    }
  })

  const allJobs = Array.from(jobsMap.values())

  const handleAction = async (action: () => Promise<any>, loadingKey: string, successMsg: string) => {
    setLoading(loadingKey)
    setMessage(null)

    const result = await action()

    if (result.success) {
      setMessage(successMsg)
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setLoading(null)

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000)
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Background Jobs</h3>
        <p className="text-sm text-muted-foreground">
          Monitor and manage all background processing jobs
        </p>
      </div>

      {/* Job List */}
      {allJobs.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-3">Job History</h4>
          <JobList
            jobs={allJobs}
            showFilters={true}
            emptyMessage="No jobs found"
          />
        </div>
      )}

      {/* Job Controls Section */}
      <div className="space-y-4 pt-4 border-t">
      <div>
        <h4 className="text-sm font-medium">Job Controls</h4>
        <p className="text-xs text-muted-foreground">
          Administrative actions for managing jobs
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className="p-4 border rounded-lg bg-muted">
          <p className="text-sm">{message}</p>
        </div>
      )}

      {/* Controls */}
      <div className="space-y-3">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Quick Actions</h4>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleAction(clearCompletedJobs, 'clear-completed', 'Cleared completed jobs')}
                disabled={loading === 'clear-completed'}
              >
                {loading === 'clear-completed' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Clear Completed Jobs
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Remove all successfully completed jobs from the queue</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleAction(clearFailedJobs, 'clear-failed', 'Cleared failed jobs')}
                disabled={loading === 'clear-failed'}
              >
                {loading === 'clear-failed' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Clear Failed Jobs
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Remove all failed jobs from the queue for cleanup</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <h4 className="text-sm font-medium text-muted-foreground">Emergency Controls</h4>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={() => {
                  if (!confirm('Stop all processing jobs? They will be cancelled immediately.')) return
                  handleAction(forceFailAllProcessing, 'force-fail-all', 'Stopped all processing jobs')
                }}
                disabled={loading === 'force-fail-all'}
              >
                {loading === 'force-fail-all' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-2" />
                )}
                Stop All Processing
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Force-cancel all currently running jobs (for stuck jobs)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={() => {
                  if (!confirm('Delete ALL jobs? This cannot be undone.')) return
                  handleAction(clearAllJobs, 'clear-all', 'Cleared all jobs')
                }}
                disabled={loading === 'clear-all'}
              >
                {loading === 'clear-all' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Clear All Jobs
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete all jobs from the queue (completed, failed, and pending)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                className="w-full justify-start"
                onClick={() => {
                  if (!confirm('⚠️ NUCLEAR OPTION: Delete ALL jobs AND all processing documents? This CANNOT be undone!')) return
                  handleAction(
                    clearAllJobsAndProcessingDocuments,
                    'nuclear',
                    'Deleted all jobs and processing documents'
                  )
                }}
                disabled={loading === 'nuclear'}
              >
                {loading === 'nuclear' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Bomb className="h-4 w-4 mr-2" />
                )}
                Nuclear Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">⚠️ DANGER: Deletes ALL jobs AND documents with status 'processing'. Cannot be undone!</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            These controls manage background jobs. Use "Stop All Processing" to cancel stuck jobs,
            or "Clear Completed/Failed" to clean up the job queue.
          </p>
        </div>
      </div>
      </div>
      </div>
    </TooltipProvider>
  )
}
