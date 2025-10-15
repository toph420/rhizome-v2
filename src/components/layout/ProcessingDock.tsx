'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Loader2, CheckCircle2, XCircle, X, ChevronUp, ChevronDown } from 'lucide-react'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'
import { cancelAndDeleteJob } from '@/app/actions/admin'
import { useState } from 'react'

/**
 * Processing Dock Component
 *
 * Displays active background jobs in a bottom-right dock.
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

  const jobs = activeJobs()

  // Hide dock when:
  // 1. Admin Panel is open (jobs already visible there)
  // 2. No active jobs to show
  if (isAdminPanelOpen || jobs.length === 0) {
    return null
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

  const getJobTitle = (job: any): string => {
    if (job.type === 'import_document') {
      return job.metadata?.title || 'Importing document'
    }
    if (job.type === 'export_documents') {
      const count = job.metadata?.documentIds?.length || 1
      return `Exporting ${count} document${count > 1 ? 's' : ''}`
    }
    if (job.type === 'reprocess_connections') {
      return 'Reprocessing connections'
    }
    return 'Processing...'
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
      <div className="fixed bottom-4 right-4 z-40">
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
    <div className="fixed bottom-4 right-4 w-96 z-40 space-y-2">
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
        {jobs.map((job) => (
          <Card key={job.id} className="p-3 shadow-lg">
            <div className="space-y-2">
              {/* Job Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getStatusIcon(job.status)}
                  <span className="text-sm font-medium truncate">{getJobTitle(job)}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleCancelAndDelete(job.id)}
                  disabled={deletingIds.has(job.id)}
                  className="size-7 flex-shrink-0"
                  title="Cancel job"
                >
                  {deletingIds.has(job.id) ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <X className="size-3" />
                  )}
                </Button>
              </div>

              {/* Progress Bar */}
              {job.status === 'processing' && (
                <div className="space-y-1">
                  <Progress value={job.progress} className="h-1.5" />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground truncate flex-1">{job.details}</p>
                    <span className="text-xs text-muted-foreground ml-2">{job.progress}%</span>
                  </div>
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
        ))}
      </div>
    </div>
  )
}
