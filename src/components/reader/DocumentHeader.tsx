'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/rhizome/tooltip'
import { toast } from 'sonner'
import { ExternalLink, RefreshCw, Loader2, BookMarked, Compass, BookOpen, GraduationCap, Zap, ArrowLeft } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useRouter } from 'next/navigation'
import { chunkerLabels, chunkerDescriptions, chunkerColors, type ChunkerType } from '@/types/chunker'
import { exportToObsidian, syncFromObsidian } from '@/app/actions/integrations'

interface DocumentHeaderProps {
  documentId: string
  title: string
  wordCount?: number
  chunkCount?: number
  connectionCount?: number
  chunkerType?: string | null
  viewMode?: 'explore' | 'focus' | 'study'
  onViewModeChange?: (mode: 'explore' | 'focus' | 'study') => void
  onQuickSpark?: () => void
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
export function DocumentHeader({
  documentId,
  title,
  wordCount,
  chunkCount,
  connectionCount,
  chunkerType,
  viewMode = 'explore',
  onViewModeChange,
  onQuickSpark
}: DocumentHeaderProps) {
  const router = useRouter()
  const [isExporting, setIsExporting] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  /**
   * Export document to Obsidian vault and open in editor
   * Creates background job for export
   */
  async function handleEditInObsidian() {
    setIsExporting(true)

    try {
      toast.info('Exporting to Obsidian...', {
        description: 'Creating vault files'
      })

      const result = await exportToObsidian(documentId)

      if (!result.success) {
        throw new Error(result.error || 'Export failed')
      }

      toast.success('Export job created', {
        description: 'Document will be available in Obsidian shortly. Check ProcessingDock for progress.',
        duration: 5000
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
   * Sync edited markdown from Obsidian vault
   * Triggers reprocessing pipeline with annotation recovery
   * Creates background job for sync
   */
  async function handleSync() {
    setIsSyncing(true)

    try {
      toast.info('Sync started', {
        description: 'Processing document - this may take several minutes for large files'
      })

      const result = await syncFromObsidian(documentId)

      if (!result.success) {
        throw new Error(result.error || 'Sync failed')
      }

      toast.success('Sync job created', {
        description: 'Check ProcessingDock for progress. Page will reload when complete.',
        duration: 5000
      })

      // Note: In production, would want to poll job status and reload when complete
      // For now, user can monitor via ProcessingDock

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
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/')}
          title="Back to Library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold truncate">{title}</h1>
            {chunkerType && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={chunkerColors[chunkerType as ChunkerType] || chunkerColors.hybrid}
                    >
                      {chunkerLabels[chunkerType as ChunkerType] || 'Unknown'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      {chunkerDescriptions[chunkerType as ChunkerType] || 'No description available'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {(wordCount || chunkCount || connectionCount) && (
            <p className="text-xs text-muted-foreground">
              {wordCount && `${wordCount.toLocaleString()} words`}
              {wordCount && chunkCount && ' • '}
              {chunkCount && `${chunkCount} chunks`}
              {chunkCount && connectionCount && ' • '}
              {connectionCount !== undefined && `${connectionCount} connections`}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Reading Mode Toggle */}
        {onViewModeChange && (
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) onViewModeChange(value as 'explore' | 'focus' | 'study')
            }}
          >
            <ToggleGroupItem value="explore" title="Explore (sidebar visible)">
              <Compass className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="focus" title="Focus (hide sidebar)">
              <BookOpen className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="study" title="Study (flashcards)">
              <GraduationCap className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {/* Quick Spark Button */}
        {onQuickSpark && (
          <Button variant="outline" size="sm" onClick={onQuickSpark}>
            <Zap className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Quick Spark</span>
            <kbd className="hidden sm:inline-flex ml-2 h-5 items-center gap-1 rounded border bg-gray-100 dark:bg-gray-800 px-1.5 font-mono text-xs">
              ⌘K
            </kbd>
          </Button>
        )}

        <div className="w-px h-6 bg-border" />
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
