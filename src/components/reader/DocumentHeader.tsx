'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ExternalLink, RefreshCw, Loader2, BookMarked } from 'lucide-react'

interface DocumentHeaderProps {
  documentId: string
  title: string
}

/**
 * Document header with Obsidian integration controls
 *
 * Features:
 * - "Edit in Obsidian" button: Exports to vault and opens in Obsidian
 * - "Sync from Obsidian" button: Imports edits and recovers annotations
 *
 * Protocol Handling:
 * Uses invisible iframe for Obsidian URI (NOT window.open)
 * This ensures protocol handler works reliably across platforms
 */
export function DocumentHeader({ documentId, title }: DocumentHeaderProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  /**
   * Export document to Obsidian vault and open in editor
   * Uses invisible iframe for reliable protocol handling
   */
  async function handleEditInObsidian() {
    setIsExporting(true)

    try {
      const response = await fetch('/api/obsidian/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Export failed')
      }

      const { uri, path } = await response.json()

      // CRITICAL: Use iframe for protocol handling, NOT window.open
      // This ensures Obsidian URI works on all platforms
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = uri
      document.body.appendChild(iframe)

      // Remove iframe after 1 second (protocol handler will have triggered)
      setTimeout(() => iframe.remove(), 1000)

      toast.success('Exported to Obsidian', {
        description: `Document available at: ${path}`
      })

    } catch (error) {
      console.error('[DocumentHeader] Export failed:', error)
      toast.error('Export Failed', {
        description: error instanceof Error ? error.message : 'Failed to export to Obsidian'
      })
    } finally {
      setIsExporting(false)
    }
  }

  /**
   * Poll job status until completion
   */
  async function pollJobStatus(jobId: string): Promise<any> {
    const maxAttempts = 900 // 30 minutes
    const intervalMs = 2000 // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`/api/obsidian/status/${jobId}`)
      const data = await response.json()

      if (data.status === 'completed') {
        return data.result
      }

      if (data.status === 'failed') {
        throw new Error(data.error || 'Job failed')
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs))
    }

    throw new Error('Sync timeout - processing took too long')
  }

  /**
   * Sync edited markdown from Obsidian vault (async version)
   * Triggers reprocessing pipeline with annotation recovery
   * Uses client-side polling to avoid API timeout issues
   */
  async function handleSync() {
    setIsSyncing(true)

    try {
      // Start sync job
      const response = await fetch('/api/obsidian/sync-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Sync failed')
      }

      const { jobId } = await response.json()

      toast.info('Sync Started', {
        description: 'Processing document - this may take several minutes for large files',
        duration: 3000
      })

      // Poll for completion
      const { changed, recovery } = await pollJobStatus(jobId)

      if (!changed) {
        toast.info('No Changes', {
          description: 'Document is already up to date'
        })
        return
      }

      // Show recovery stats in toast
      const stats = recovery
        ? `Recovered: ${recovery.success.length} | Review: ${recovery.needsReview.length} | Lost: ${recovery.lost.length}`
        : 'No annotations to recover'

      toast.success('Sync Complete', {
        description: recovery
          ? `Document updated successfully. ${stats}`
          : 'Document updated successfully',
        duration: 5000
      })

      // Reload page to show updated content and recovered annotations
      // TODO: Replace with optimistic UI update once review panel is integrated
      window.location.reload()

    } catch (error) {
      console.error('[DocumentHeader] Sync failed:', error)
      toast.error('Sync Failed', {
        description: error instanceof Error ? error.message : 'Failed to sync from Obsidian'
      })
    } finally {
      setIsSyncing(false)
    }
  }

  /**
   * Import highlights from Readwise
   * Searches Readwise library for matching book and imports highlights
   */
  async function handleImportFromReadwise() {
    setIsImporting(true)

    try {
      const response = await fetch('/api/readwise/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Import failed')
      }

      const { imported, needsReview, failed, bookTitle, bookAuthor } = result

      // Show success toast with stats
      const total = imported + needsReview + failed
      const stats = `${imported} imported | ${needsReview} need review | ${failed} failed`

      toast.success('Readwise Import Complete', {
        description: `${bookTitle} by ${bookAuthor}\n${stats}`,
        duration: 5000
      })

      // Reload page to show imported annotations
      window.location.reload()

    } catch (error) {
      console.error('[DocumentHeader] Readwise import failed:', error)
      toast.error('Import Failed', {
        description: error instanceof Error ? error.message : 'Failed to import from Readwise'
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-background">
      <div className="flex-1">
        <h1 className="text-2xl font-semibold truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleImportFromReadwise}
          disabled={isExporting || isSyncing || isImporting}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isImporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <BookMarked className="h-4 w-4" />
          )}
          Import from Readwise
        </Button>

        <Button
          onClick={handleEditInObsidian}
          disabled={isExporting || isSyncing || isImporting}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {isExporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          Edit in Obsidian
        </Button>

        <Button
          onClick={handleSync}
          disabled={isExporting || isSyncing || isImporting}
          variant="default"
          size="sm"
          className="gap-2"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Sync from Obsidian
        </Button>
      </div>
    </header>
  )
}
