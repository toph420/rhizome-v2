'use client'

import React, { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import { type JobStatus } from '@/stores/admin/background-jobs'

interface JobListProps {
  jobs: JobStatus[]
  showFilters?: boolean
  emptyMessage?: string
  className?: string
}

type JobFilter = 'all' | 'import' | 'export' | 'connections' | 'active' | 'completed' | 'failed'

const jobTypeLabels: Record<JobStatus['type'], string> = {
  import_document: 'Import',
  export_documents: 'Export',
  reprocess_connections: 'Connections',
}

const jobTypeIcons: Record<JobStatus['type'], React.ReactNode> = {
  import_document: <Database className="size-4" />,
  export_documents: <FileText className="size-4" />,
  reprocess_connections: <Network className="size-4" />,
}

const getStatusIcon = (status: JobStatus['status']) => {
  switch (status) {
    case 'pending':
      return <AlertCircle className="size-4 text-yellow-600" />
    case 'processing':
      return <Loader2 className="size-4 animate-spin text-blue-600" />
    case 'completed':
      return <CheckCircle2 className="size-4 text-green-600" />
    case 'failed':
      return <XCircle className="size-4 text-red-600" />
  }
}

const getStatusBadge = (status: JobStatus['status']) => {
  const variants = {
    pending: 'secondary' as const,
    processing: 'default' as const,
    completed: 'default' as const,
    failed: 'destructive' as const,
  }

  return (
    <Badge
      variant={variants[status]}
      className={
        status === 'completed'
          ? 'bg-green-600 hover:bg-green-700'
          : status === 'processing'
            ? 'bg-blue-600 hover:bg-blue-700'
            : ''
      }
    >
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
      filtered = filtered.filter((j) => j.type === 'reprocess_connections')
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
      connections: jobs.filter((j) => j.type === 'reprocess_connections').length,
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
 * Individual job card component
 */
function JobCard({ job }: { job: JobStatus }) {
  const jobTypeLabel = jobTypeLabels[job.type] || job.type
  const jobTypeIcon = jobTypeIcons[job.type]

  return (
    <div className="border rounded-lg p-4 space-y-2">
      {/* Header: Icon, Title, Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(job.status)}
          <div className="flex items-center gap-2">
            {jobTypeIcon}
            <span className="font-medium text-sm">
              {job.metadata?.title || `${jobTypeLabel} Job`}
            </span>
          </div>
        </div>
        {getStatusBadge(job.status)}
      </div>

      {/* Progress Bar (only for processing jobs) */}
      {job.status === 'processing' && <Progress value={job.progress} className="h-2" />}

      {/* Details */}
      <p className="text-xs text-muted-foreground">{job.details}</p>

      {/* Error Message */}
      {job.error && (
        <div className="bg-red-50 border border-red-200 rounded p-2">
          <p className="text-xs text-red-600">{job.error}</p>
        </div>
      )}

      {/* Metadata (document IDs for batch exports, etc.) */}
      {job.metadata?.documentIds && job.metadata.documentIds.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {job.metadata.documentIds.length} documents
        </p>
      )}
    </div>
  )
}
