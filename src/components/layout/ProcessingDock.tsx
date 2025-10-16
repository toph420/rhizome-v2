'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  ChevronUp,
  ChevronDown,
  FileText,
  Database,
  Network,
  GitBranch,
  Zap,
  BookOpen,
  RefreshCw,
} from 'lucide-react'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'
import { cancelAndDeleteJob, pauseJob, resumeJob, retryJob } from '@/app/actions/admin'
import { useState, useEffect } from 'react'
import { Pause, Play, RotateCw } from 'lucide-react'

/**
 * Processing Dock Component
 *
 * Displays active background jobs in a bottom-left dock.
 *
 * **UX Philosophy (Hybrid Approach)**:
 * - Shows ONLY active jobs (processing/pending)
 * - Hides when Admin Panel is open (avoids redundancy)
 * - Provides quick "View All Jobs →" link to Admin Panel
 * - Minimal screen footprint with collapse/expand
 *
 * **Changes from Original**:
 * - Uses background-jobs store (no separate polling)
 * - Removed completed/failed jobs (use Admin Panel → Jobs tab)
 * - Removed "Clear Completed" button (use Jobs tab)
 * - Added collapse/expand toggle
 * - Positioned bottom-right (not full-width bottom sheet)
 */
export function ProcessingDock() {
  const { activeJobs, removeJob } = useBackgroundJobsStore()
  const { isOpen: isAdminPanelOpen, open: openAdminPanel } = useAdminPanelStore()
  const [isExpanded, setIsExpanded] = useState(true)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [isHydrated, setIsHydrated] = useState(false)

  // Prevent hydration mismatch by only rendering jobs after client-side hydration
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const jobs = isHydrated ? activeJobs() : []

  // Hide dock when Admin Panel is open (jobs already visible there)
  if (isAdminPanelOpen) {
    return null
  }

  // When no active jobs, show minimal "View All Jobs" button
  if (jobs.length === 0) {
    return (
      <div className="fixed left-4 bottom-4 z-40">
        <Button
          variant="outline"
          className="shadow-lg"
          onClick={() => openAdminPanel('jobs')}
        >
          <FileText className="size-4 mr-2" />
          View All Jobs
        </Button>
      </div>
    )
  }

  async function handleCancelAndDelete(jobId: string) {
    setDeletingIds((prev) => new Set(prev).add(jobId))

    const result = await cancelAndDeleteJob(jobId)

    if (result.success) {
      removeJob(jobId)
    }

    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.delete(jobId)
      return next
    })
  }

  /**
   * Get intelligent display name for job based on type, metadata, and options
   */
  const getJobDisplayName = (job: any): string => {
    const title = job.metadata?.title
    const mode = job.input_data?.mode
    const count = job.metadata?.documentIds?.length

    // Format mode for display
    const formatMode = (m: string): string => {
      const modes: Record<string, string> = {
        smart: 'Smart Mode',
        all: 'Reprocess All',
        add_new: 'Add New',
      }
      return modes[m] || m
    }

    switch (job.type) {
      case 'process_document':
        return title ? `Processing: ${title}` : 'Processing document'

      case 'import_document': {
        const base = title ? `Import: ${title}` : 'Importing document'
        const options = []
        if (job.input_data?.regenerateEmbeddings) options.push('with embeddings')
        if (job.input_data?.reprocessConnections) options.push('with connections')
        return options.length > 0 ? `${base} (${options.join(', ')})` : base
      }

      case 'export_documents':
        if (count && count > 1) {
          const options = []
          if (job.input_data?.includeConnections) options.push('with connections')
          if (job.input_data?.includeAnnotations) options.push('with annotations')
          const optionsText = options.length > 0 ? ` (${options.join(', ')})` : ''
          return `Export: ${count} documents${optionsText}`
        }
        return title ? `Export: ${title}` : 'Exporting document'

      case 'reprocess_connections': {
        const base = title ? `Connections: ${title}` : 'Reprocessing connections'
        return mode ? `${base} (${formatMode(mode)})` : base
      }

      case 'detect_connections':
        return title ? `Detecting: ${title}` : 'Detecting connections'

      case 'obsidian_export':
        return 'Obsidian Export'

      case 'obsidian_sync':
        return 'Obsidian Sync'

      case 'readwise_import':
        return 'Readwise Import'

      default:
        return 'Processing...'
    }
  }

  /**
   * Get icon for job type
   */
  const getJobTypeIcon = (type: string) => {
    switch (type) {
      case 'process_document':
        return <Zap className="size-4 text-primary" />
      case 'import_document':
        return <Database className="size-4 text-blue-600" />
      case 'export_documents':
        return <FileText className="size-4 text-purple-600" />
      case 'reprocess_connections':
        return <Network className="size-4 text-orange-600" />
      case 'detect_connections':
        return <GitBranch className="size-4 text-pink-600" />
      case 'obsidian_export':
      case 'obsidian_sync':
        return <RefreshCw className="size-4 text-indigo-600" />
      case 'readwise_import':
        return <BookOpen className="size-4 text-green-600" />
      default:
        return <Loader2 className="size-4 text-muted-foreground" />
    }
  }

  const getStatusIcon = (status: string) => {
    if (status === 'processing') {
      return <Loader2 className="size-4 animate-spin text-blue-600" />
    }
    if (status === 'completed') {
      return <CheckCircle2 className="size-4 text-green-600" />
    }
    if (status === 'failed') {
      return <XCircle className="size-4 text-red-600" />
    }
    return <Loader2 className="size-4 text-muted-foreground" />
  }

  // Mini badge when collapsed
  if (!isExpanded) {
    return (
      <div className="fixed left-4 bottom-4 z-40">
        <Button
          variant="default"
          className="shadow-lg"
          onClick={() => setIsExpanded(true)}
        >
          <Loader2 className="size-4 mr-2 animate-spin" />
          {jobs.length} active job{jobs.length > 1 ? 's' : ''}
          <ChevronUp className="size-4 ml-2" />
        </Button>
      </div>
    )
  }

  // Full dock when expanded
  return (
    <div className="fixed left-4 bottom-4 w-96 z-40 space-y-2">
      {/* Header */}
      <Card className="p-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span className="text-sm font-medium">
              {jobs.length} Active Job{jobs.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openAdminPanel('jobs')}
              className="text-xs"
            >
              View All →
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              className="size-7"
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Job Cards */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {jobs.map((job) => {
          // Check if job is "alive" (updated within last 10 seconds)
          const isAlive =
            job.updatedAt && Date.now() - new Date(job.updatedAt).getTime() < 10000

          // Determine which buttons to show
          const canPause = job.status === 'processing' && job.canResume
          const canResume = job.status === 'paused'
          const canRetry = job.status === 'failed' || job.status === 'cancelled'

          return (
            <Card key={job.id} className="p-3 shadow-lg">
              <div className="space-y-2">
                {/* Job Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getJobTypeIcon(job.type)}
                    <span className="text-sm font-medium truncate">
                      {getJobDisplayName(job)}
                    </span>
                    {/* Heartbeat indicator - pulses when job is actively updating */}
                    {isAlive && job.status === 'processing' && (
                      <div
                        className="size-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"
                        title="Active"
                      />
                    )}
                  </div>

                  {/* Control Buttons */}
                  <div className="flex gap-1 flex-shrink-0">
                    {canPause && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={async () => {
                          setDeletingIds((prev) => new Set(prev).add(job.id))
                          const result = await pauseJob(job.id)
                          if (!result.success) {
                            console.error('Failed to pause job:', result.error)
                          }
                          setDeletingIds((prev) => {
                            const next = new Set(prev)
                            next.delete(job.id)
                            return next
                          })
                        }}
                        disabled={deletingIds.has(job.id) || !job.canResume}
                        className="size-7"
                        title={job.canResume ? 'Pause job' : 'Pause not available yet'}
                      >
                        <Pause className="size-3" />
                      </Button>
                    )}

                    {canResume && (
                      <Button
                        variant="default"
                        size="icon"
                        onClick={async () => {
                          setDeletingIds((prev) => new Set(prev).add(job.id))
                          const result = await resumeJob(job.id)
                          if (!result.success) {
                            console.error('Failed to resume job:', result.error)
                          }
                          setDeletingIds((prev) => {
                            const next = new Set(prev)
                            next.delete(job.id)
                            return next
                          })
                        }}
                        disabled={deletingIds.has(job.id)}
                        className="size-7"
                        title="Resume from checkpoint"
                      >
                        <Play className="size-3" />
                      </Button>
                    )}

                    {canRetry && (
                      <Button
                        variant="default"
                        size="icon"
                        onClick={async () => {
                          setDeletingIds((prev) => new Set(prev).add(job.id))
                          const result = await retryJob(job.id)
                          if (!result.success) {
                            console.error('Failed to retry job:', result.error)
                          }
                          setDeletingIds((prev) => {
                            const next = new Set(prev)
                            next.delete(job.id)
                            return next
                          })
                        }}
                        disabled={deletingIds.has(job.id)}
                        className="size-7"
                        title="Retry job"
                      >
                        <RotateCw className="size-3" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCancelAndDelete(job.id)}
                      disabled={deletingIds.has(job.id)}
                      className="size-7"
                      title="Cancel and delete job"
                    >
                      {deletingIds.has(job.id) ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <X className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Progress Bar */}
                {(job.status === 'processing' || job.status === 'paused') && (
                  <div className="space-y-1">
                    <Progress value={job.progress} className="h-1.5" />
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {job.details}
                      </p>
                      <span className="text-xs text-muted-foreground ml-2">{job.progress}%</span>
                    </div>
                  </div>
                )}

                {/* Checkpoint info for paused jobs */}
                {job.status === 'paused' && job.checkpointStage && (
                  <div className="bg-orange-50 border border-orange-200 rounded p-1.5">
                    <p className="text-xs text-orange-800 truncate">
                      Paused at: {job.checkpointStage}
                    </p>
                  </div>
                )}

                {/* Error Message */}
                {job.error && (
                  <p className="text-xs text-red-600 truncate" title={job.error}>
                    {job.error}
                  </p>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
