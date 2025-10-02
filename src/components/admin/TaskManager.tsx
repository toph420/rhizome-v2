'use client'

import { useState } from 'react'
import { forceFailAllProcessing, clearFailedJobs, clearCompletedJobs } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function TaskManager() {
  const [isForceFailingAll, setIsForceFailingAll] = useState(false)
  const [isClearingFailed, setIsClearingFailed] = useState(false)
  const [isClearingCompleted, setIsClearingCompleted] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleForceFailAll = async () => {
    if (!confirm('Force fail all stuck processing jobs? They will retry immediately.')) return

    setIsForceFailingAll(true)
    setMessage(null)

    const result = await forceFailAllProcessing()

    if (result.success) {
      setMessage('All processing jobs force-failed and queued for retry')
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
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsClearingCompleted(false)
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
        <p><strong>Force Fail:</strong> Resets stuck jobs to retry immediately</p>
        <p><strong>Clear Failed:</strong> Permanently deletes failed jobs</p>
        <p><strong>Clear Completed:</strong> Permanently deletes completed jobs</p>
      </div>
    </Card>
  )
}
