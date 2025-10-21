'use client'

import React, { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Database,
  Network,
  GitBranch,
  Zap,
  BookOpen,
  RefreshCw,
  Pause,
  Play,
  RotateCw,
  Trash2,
  PauseCircle,
} from 'lucide-react'
import { type JobStatus } from '@/stores/admin/background-jobs'
import { pauseJob, resumeJob, retryJob, deleteJob } from '@/app/actions/admin'

interface JobListProps {
  jobs: JobStatus[]
  showFilters?: boolean
  emptyMessage?: string
  className?: string
}

type JobFilter = 'all' | 'import' | 'export' | 'connections' | 'active' | 'completed' | 'failed'

const jobTypeLabels: Record<JobStatus['type'], string> = {
  process_document: 'Processing',
  import_document: 'Import',
  export_documents: 'Export',
  reprocess_connections: 'Connections',
  detect_connections: 'Detecting',
  obsidian_export: 'Obsidian Export',
  obsidian_sync: 'Obsidian Sync',
  readwise_import: 'Readwise Import',
}

const jobTypeIcons: Record<JobStatus['type'], React.ReactNode> = {
  process_document: <Zap className="size-4 text-primary" />,
  import_document: <Database className="size-4 text-blue-600" />,
  export_documents: <FileText className="size-4 text-purple-600" />,
  reprocess_connections: <Network className="size-4 text-orange-600" />,
  detect_connections: <GitBranch className="size-4 text-pink-600" />,
  obsidian_export: <RefreshCw className="size-4 text-indigo-600" />,
  obsidian_sync: <RefreshCw className="size-4 text-indigo-600" />,
  readwise_import: <BookOpen className="size-4 text-green-600" />,
}

const getStatusIcon = (status: JobStatus['status']) => {
  switch (status) {
    case 'pending':
      return <AlertCircle className="size-4 text-yellow-600" />
    case 'processing':
      return <Loader2 className="size-4 animate-spin text-blue-600" />
    case 'paused':
      return <PauseCircle className="size-4 text-orange-600" />
    case 'completed':
      return <CheckCircle2 className="size-4 text-green-600" />
    case 'failed':
      return <XCircle className="size-4 text-red-600" />
    case 'cancelled':
      return <XCircle className="size-4 text-gray-600" />
  }
}

const getStatusBadge = (status: JobStatus['status']) => {
  const variants: Record<JobStatus['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'secondary',
    processing: 'default',
    paused: 'outline',
    completed: 'default',
    failed: 'destructive',
    cancelled: 'secondary',
  }

  const customColors: Record<JobStatus['status'], string> = {
    pending: '',
    processing: 'bg-blue-600 hover:bg-blue-700',
    paused: 'border-orange-600 text-orange-600',
    completed: 'bg-green-600 hover:bg-green-700',
    failed: '',
    cancelled: '',
  }

  return (
    <Badge variant={variants[status]} className={customColors[status]}>
      {status}
    </Badge>
  )
}

/**
 * Shared job list component for displaying background jobs.
 *
 * Used in:
 * - ImportTab: Shows import_document jobs only
 * - JobsTab: Shows all jobs with filtering
 * - Future: ExportTab, ConnectionsTab, etc.
 *
 * Features:
 * - Type-based filtering (all, import, export, connections)
 * - Status-based filtering (active, completed, failed)
 * - Job cards with progress bars
 * - Status icons and badges
 * - Responsive design
 */
export function JobList({
  jobs,
  showFilters = true,
  emptyMessage = 'No jobs to display',
  className = '',
}: JobListProps) {
  const [activeFilter, setActiveFilter] = React.useState<JobFilter>('all')

  // Filter jobs based on selected filter
  const filteredJobs = useMemo(() => {
    let filtered = jobs

    // Type-based filtering
    if (activeFilter === 'import') {
      filtered = filtered.filter((j) => j.type === 'import_document')
    } else if (activeFilter === 'export') {
      filtered = filtered.filter((j) => j.type === 'export_documents')
    } else if (activeFilter === 'connections') {
      filtered = filtered.filter((j) => j.type === 'reprocess_connections' || j.type === 'detect_connections')
    }
    // Status-based filtering
    else if (activeFilter === 'active') {
      filtered = filtered.filter((j) => j.status === 'pending' || j.status === 'processing')
    } else if (activeFilter === 'completed') {
      filtered = filtered.filter((j) => j.status === 'completed')
    } else if (activeFilter === 'failed') {
      filtered = filtered.filter((j) => j.status === 'failed')
    }

    // Sort by creation time (newest first)
    return filtered.sort((a, b) => b.createdAt - a.createdAt)
  }, [jobs, activeFilter])

  // Calculate counts for filter badges
  const counts = useMemo(() => {
    return {
      all: jobs.length,
      import: jobs.filter((j) => j.type === 'import_document').length,
      export: jobs.filter((j) => j.type === 'export_documents').length,
      connections: jobs.filter((j) => j.type === 'reprocess_connections' || j.type === 'detect_connections').length,
      active: jobs.filter((j) => j.status === 'pending' || j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
    }
  }, [jobs])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Filters */}
      {showFilters && jobs.length > 0 && (
        <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as JobFilter)}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="all">
              All
              {counts.all > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.all})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="import">
              Import
              {counts.import > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.import})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="export">
              Export
              {counts.export > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.export})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="connections">
              Connect
              {counts.connections > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.connections})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">
              Active
              {counts.active > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.active})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Done
              {counts.completed > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.completed})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed
              {counts.failed > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({counts.failed})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Job Cards */}
      {filteredJobs.length > 0 ? (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      ) : (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Get intelligent display name for job based on type, metadata, and options
 */
function getJobDisplayName(job: JobStatus): string {
  const title = job.metadata?.title
  const mode = job.input_data?.mode
  const count = job.metadata?.documentIds?.length
  const jobTypeLabel = jobTypeLabels[job.type] || job.type

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
      return title || `${jobTypeLabel} Job`
  }
}

/**
 * Individual job card component with control buttons
 */
function JobCard({ job }: { job: JobStatus }) {
  const jobTypeIcon = jobTypeIcons[job.type]
  const [isLoading, setIsLoading] = useState(false)

  // Check if job is "alive" (updated within last 10 seconds)
  const isAlive = job.updatedAt && Date.now() - new Date(job.updatedAt).getTime() < 10000

  // Determine which buttons to show based on job status
  const canPause = job.status === 'processing' && job.canResume
  const canResume = job.status === 'paused'
  const canRetry = job.status === 'failed' || job.status === 'cancelled'
  const canDelete = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'

  const handlePause = async () => {
    setIsLoading(true)
    try {
      const result = await pauseJob(job.id)
      if (!result.success) {
        console.error('Failed to pause job:', result.error)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResume = async () => {
    setIsLoading(true)
    try {
      const result = await resumeJob(job.id)
      if (!result.success) {
        console.error('Failed to resume job:', result.error)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetry = async () => {
    setIsLoading(true)
    try {
      const result = await retryJob(job.id)
      if (!result.success) {
        console.error('Failed to retry job:', result.error)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    setIsLoading(true)
    try {
      const result = await deleteJob(job.id)
      if (!result.success) {
        console.error('Failed to delete job:', result.error)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      {/* Header: Icon, Title, Status, Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getStatusIcon(job.status)}
          <div className="flex items-center gap-2 min-w-0">
            {jobTypeIcon}
            <span className="font-medium text-sm truncate">{getJobDisplayName(job)}</span>
            {/* Heartbeat indicator - pulses when job is actively updating */}
            {isAlive && job.status === 'processing' && (
              <div
                className="size-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"
                title="Active"
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(job.status)}

          {/* Control Buttons */}
          <div className="flex gap-1">
            {canPause && (
              <Button
                size="sm"
                variant="outline"
                onClick={handlePause}
                disabled={isLoading || !job.canResume}
                title={job.canResume ? 'Pause job at next checkpoint' : 'Pause not available yet'}
                className="h-7 px-2"
              >
                <Pause className="size-3" />
              </Button>
            )}

            {canResume && (
              <Button
                size="sm"
                variant="default"
                onClick={handleResume}
                disabled={isLoading}
                title="Resume from checkpoint"
                className="h-7 px-2"
              >
                <Play className="size-3" />
              </Button>
            )}

            {canRetry && (
              <Button
                size="sm"
                variant="default"
                onClick={handleRetry}
                disabled={isLoading}
                title="Retry job"
                className="h-7 px-2"
              >
                <RotateCw className="size-3" />
              </Button>
            )}

            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={isLoading}
                title="Delete job"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar (only for processing/paused jobs) */}
      {(job.status === 'processing' || job.status === 'paused') && (
        <div className="space-y-1">
          <Progress value={job.progress} className="h-2" />
          {job.progress !== undefined && (
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground flex-1">{job.details}</p>
              <span className="text-xs text-muted-foreground ml-2">{job.progress}%</span>
            </div>
          )}
        </div>
      )}

      {/* Checkpoint info for paused jobs */}
      {job.status === 'paused' && job.checkpointStage && (
        <div className="bg-orange-50 border border-orange-200 rounded p-2">
          <p className="text-xs text-orange-800">
            Paused at: {job.checkpointStage}
            {job.pauseReason && ` • ${job.pauseReason}`}
          </p>
        </div>
      )}

      {/* Details for non-processing/paused jobs */}
      {job.status !== 'processing' && job.status !== 'paused' && job.details && (
        <p className="text-xs text-muted-foreground">{job.details}</p>
      )}

      {/* Error Message */}
      {job.error && (
        <div className="bg-red-50 border border-red-200 rounded p-2">
          <p className="text-xs text-red-600">{job.error}</p>
        </div>
      )}
    </div>
  )
}
