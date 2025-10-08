'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { forceFailAllProcessing, clearFailedJobs, clearCompletedJobs, clearAllJobs } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function TaskManager() {
  const router = useRouter()
  const [isForceFailingAll, setIsForceFailingAll] = useState(false)
  const [isClearingFailed, setIsClearingFailed] = useState(false)
  const [isClearingCompleted, setIsClearingCompleted] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleForceFailAll = async () => {
    if (!confirm('Force fail all stuck processing jobs? They will retry immediately.')) return

    setIsForceFailingAll(true)
    setMessage(null)

    const result = await forceFailAllProcessing()

    if (result.success) {
      setMessage('All processing jobs force-failed and queued for retry')
      // Force a full page refresh to update all components
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsForceFailingAll(false)
  }

  const handleClearFailed = async () => {
    if (!confirm('Delete all failed jobs? This cannot be undone.')) return

    setIsClearingFailed(true)
    setMessage(null)

    const result = await clearFailedJobs()

    if (result.success) {
      setMessage('All failed jobs cleared')
      // Force a full page refresh to update all components
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsClearingFailed(false)
  }

  const handleClearCompleted = async () => {
    if (!confirm('Delete all completed jobs? This cannot be undone.')) return

    setIsClearingCompleted(true)
    setMessage(null)

    const result = await clearCompletedJobs()

    if (result.success) {
      setMessage('All completed jobs cleared')
      // Force a full page refresh to update all components
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsClearingCompleted(false)
  }

  const handleClearAll = async () => {
    if (!confirm('Delete ALL jobs (pending, processing, failed, completed)? This cannot be undone.')) return

    setIsClearingAll(true)
    setMessage(null)

    const result = await clearAllJobs()

    if (result.success) {
      setMessage('All jobs cleared')
      // Force a full page refresh to update all components
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsClearingAll(false)
  }

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Task Management</h3>
        <p className="text-sm text-muted-foreground">
          Development tools for managing background jobs
        </p>
      </div>

      {message && (
        <div className="p-3 rounded-lg bg-muted text-sm">
          {message}
        </div>
      )}

      <div className="space-y-2">
        <Button
          variant="destructive"
          className="w-full justify-start"
          onClick={handleClearAll}
          disabled={isClearingAll}
        >
          {isClearingAll ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-2" />
          )}
          Clear ALL Jobs
        </Button>

        <div className="h-px bg-border" />

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleForceFailAll}
          disabled={isForceFailingAll}
        >
          {isForceFailingAll ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4 mr-2" />
          )}
          Force Fail All Processing Jobs
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleClearFailed}
          disabled={isClearingFailed}
        >
          {isClearingFailed ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4 mr-2" />
          )}
          Clear All Failed Jobs
        </Button>

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleClearCompleted}
          disabled={isClearingCompleted}
        >
          {isClearingCompleted ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Clear All Completed Jobs
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Clear ALL:</strong> Nuclear option - deletes everything</p>
        <p><strong>Force Fail:</strong> Resets stuck jobs to retry immediately</p>
        <p><strong>Clear Failed:</strong> Permanently deletes failed jobs</p>
        <p><strong>Clear Completed:</strong> Permanently deletes completed jobs</p>
      </div>
    </Card>
  )
}
