'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  forceFailAllProcessing,
  clearFailedJobs,
  clearCompletedJobs,
  clearAllJobs,
  clearAllJobsAndProcessingDocuments,
  fixOrphanedDocuments
} from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export function TaskManager() {
  const router = useRouter()
  const [isForceFailingAll, setIsForceFailingAll] = useState(false)
  const [isClearingFailed, setIsClearingFailed] = useState(false)
  const [isClearingCompleted, setIsClearingCompleted] = useState(false)
  const [isClearingAll, setIsClearingAll] = useState(false)
  const [isNuclearCleaning, setIsNuclearCleaning] = useState(false)
  const [isFixingOrphans, setIsFixingOrphans] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleForceFailAll = async () => {
    if (!confirm('Stop and DELETE all stuck processing jobs? This cannot be undone.')) return

    setIsForceFailingAll(true)
    setMessage(null)

    const result = await forceFailAllProcessing()

    if (result.success) {
      setMessage('All processing jobs stopped and deleted')
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
    if (!confirm('Stop and DELETE ALL jobs (pending, processing, failed, completed)? This cannot be undone.')) return

    setIsClearingAll(true)
    setMessage(null)

    const result = await clearAllJobs()

    if (result.success) {
      setMessage('All jobs stopped and deleted')
      // Force a full page refresh to update all components
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsClearingAll(false)
  }

  const handleNuclearClean = async () => {
    if (!confirm('⚠️ NUCLEAR OPTION ⚠️\n\nThis will:\n1. Fix orphaned documents\n2. Stop all processing jobs\n3. Delete ALL jobs\n4. Delete ALL processing documents\n5. Clean up chunks, storage files, annotations\n\nThis CANNOT be undone. Continue?')) return

    setIsNuclearCleaning(true)
    setMessage(null)

    const result = await clearAllJobsAndProcessingDocuments()

    if (result.success) {
      setMessage(`Nuclear cleanup complete! Deleted ${result.documentsDeleted} documents and all jobs`)
      // Force a full page refresh to update all components
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsNuclearCleaning(false)
  }

  const handleFixOrphans = async () => {
    setIsFixingOrphans(true)
    setMessage(null)

    const result = await fixOrphanedDocuments()

    if (result.success) {
      if (result.fixed === 0) {
        setMessage('No orphaned documents found')
      } else {
        setMessage(`Fixed ${result.fixed} orphaned document(s) - reset to failed status`)
      }
      router.refresh()
    } else {
      setMessage(`Error: ${result.error}`)
    }

    setIsFixingOrphans(false)
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
          className="w-full justify-start bg-red-600 hover:bg-red-700 text-white"
          onClick={handleNuclearClean}
          disabled={isNuclearCleaning}
        >
          {isNuclearCleaning ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4 mr-2" />
          )}
          🚨 Nuclear Clean (Jobs + Docs)
        </Button>

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
            <XCircle className="h-4 w-4 mr-2" />
          )}
          Stop & Delete Processing Jobs
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

        <div className="h-px bg-border" />

        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={handleFixOrphans}
          disabled={isFixingOrphans}
        >
          {isFixingOrphans ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4 mr-2" />
          )}
          Fix Orphaned Documents
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>Nuclear Clean:</strong> Fixes orphans + stops jobs + deletes ALL processing documents</p>
        <p><strong>Clear ALL Jobs:</strong> Fixes orphans + stops/deletes all jobs (keeps documents)</p>
        <p><strong>Stop Processing:</strong> Stops and deletes stuck processing jobs</p>
        <p><strong>Clear Failed:</strong> Permanently deletes failed jobs</p>
        <p><strong>Clear Completed:</strong> Permanently deletes completed jobs</p>
        <p><strong>Fix Orphans:</strong> Resets documents stuck in "processing" with no job</p>
      </div>
    </Card>
  )
}
