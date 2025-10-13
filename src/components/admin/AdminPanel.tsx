'use client'

import { useState } from 'react'
import { clearAllJobs, clearCompletedJobs, clearFailedJobs, forceFailAllProcessing, clearAllJobsAndProcessingDocuments } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Loader2, X, Trash2, AlertTriangle, Bomb } from 'lucide-react'

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 h-full w-80 bg-background border-l shadow-lg z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Job Controls</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Message */}
        {message && (
          <div className="p-4 border-b bg-muted">
            <p className="text-sm">{message}</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Quick Actions</h3>

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
          </div>

          <div className="space-y-2 pt-4 border-t">
            <h3 className="text-sm font-medium text-muted-foreground">Emergency Controls</h3>

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
          </div>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              These controls manage background jobs. Use "Stop All Processing" to cancel stuck jobs,
              or "Clear Completed/Failed" to clean up the job queue.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
