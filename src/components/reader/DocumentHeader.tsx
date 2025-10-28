'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/rhizome/button'
import { ToggleGroup, TooltippedToggleGroupItem } from '@/components/rhizome/toggle-group'
import { Compass, BookOpen, GraduationCap, ArrowLeft, FileText, FileImage } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/ui-store'

interface DocumentHeaderProps {
  documentId: string
  title: string
  wordCount?: number
  chunkCount?: number
  connectionCount?: number
  viewMode?: 'explore' | 'focus' | 'study'
  onViewModeChange?: (mode: 'explore' | 'focus' | 'study') => void
  onQuickSpark?: () => void
  viewerMode?: 'markdown' | 'pdf'
  onViewerModeChange?: (mode: 'markdown' | 'pdf') => void
  pdfAvailable?: boolean
}

/**
 * Document header with view controls and document details
 */
export function DocumentHeader({
  documentId,
  title,
  wordCount,
  chunkCount,
  connectionCount,
  viewMode = 'explore',
  onViewModeChange,
  onQuickSpark,
  viewerMode = 'markdown',
  onViewerModeChange,
  pdfAvailable = false,
}: DocumentHeaderProps) {
  const router = useRouter()
  const headerRef = useRef<HTMLElement>(null)
  const setDocumentHeaderHeight = useUIStore(state => state.setDocumentHeaderHeight)

  // Track header height for RightPanel positioning
  useEffect(() => {
    if (!headerRef.current) return

    const observer = new ResizeObserver(entries => {
      // Use offsetHeight to include padding and borders, not just content
      const element = entries[0].target as HTMLElement
      const height = element.offsetHeight
      setDocumentHeaderHeight(height)
    })

    observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [setDocumentHeaderHeight])

  return (
    <header ref={headerRef} className="grid grid-cols-3 items-center px-6 py-4 border-b bg-background">
      {/* Left: Back button and title */}
      <div className="flex items-center gap-4 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/')}
          title="Back to Library"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="min-w-0">
          <h1 className="text-l font-semibold truncate">{title}</h1>
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

      {/* Center: Reading mode toggle */}
      <div className="flex items-center justify-center">
        {onViewModeChange && (
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value) onViewModeChange(value as 'explore' | 'focus' | 'study')
            }}
          >
            <TooltippedToggleGroupItem value="explore" tooltip="Explore (sidebar visible)">
              <Compass className="h-4 w-4" />
            </TooltippedToggleGroupItem>
            <TooltippedToggleGroupItem value="focus" tooltip="Focus (hide sidebar)">
              <BookOpen className="h-4 w-4" />
            </TooltippedToggleGroupItem>
            <TooltippedToggleGroupItem value="study" tooltip="Study (flashcards)">
              <GraduationCap className="h-4 w-4" />
            </TooltippedToggleGroupItem>
          </ToggleGroup>
        )}
      </div>

      {/* Right: Markdown/PDF toggle */}
      <div className="flex items-center justify-end">
        {pdfAvailable && onViewerModeChange && (
          <ToggleGroup
            type="single"
            value={viewerMode}
            onValueChange={(value) => {
              if (value) onViewerModeChange(value as 'markdown' | 'pdf')
            }}
          >
            <TooltippedToggleGroupItem value="markdown" tooltip="View as formatted markdown">
              <FileText className="h-4 w-4" />
              <span className="text-sm">Markdown</span>
            </TooltippedToggleGroupItem>
            <TooltippedToggleGroupItem value="pdf" tooltip="View original PDF document">
              <FileImage className="h-4 w-4" />
              <span className="text-sm">PDF</span>
            </TooltippedToggleGroupItem>
          </ToggleGroup>
        )}
      </div>
    </header>
  )
}
