'use client'

import { useEffect, useState } from 'react'
import { VirtualizedReader } from './VirtualizedReader'
import { QuickCapturePanel } from './QuickCapturePanel'
import { KeyboardHelp } from './KeyboardHelp'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { captureSelection } from '@/lib/annotations/text-range'
import type { Chunk, StoredAnnotation, TextSelection } from '@/types/annotations'

interface DocumentViewerProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
}

/**
 * Document viewer component with virtualized rendering.
 * Uses VirtualizedReader for smooth 60fps scrolling on large documents.
 * Handles document loading, text selection, and annotation overlays.
 */
export function DocumentViewer({
  documentId,
  markdownUrl,
  chunks,
  annotations,
}: DocumentViewerProps) {
  const [markdown, setMarkdown] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null)
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([])
  const [retryCount, setRetryCount] = useState(0)

  // Load markdown from signed URL
  useEffect(() => {
    async function loadMarkdown() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(markdownUrl)
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Document not found. It may have been deleted.')
          }
          if (response.status >= 500) {
            throw new Error('Server error. Please try again in a moment.')
          }
          throw new Error(`Failed to fetch markdown (${response.status})`)
        }
        const text = await response.text()
        setMarkdown(text)
        setRetryCount(0)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load document'
        console.error('Failed to load markdown:', err)
        setError(errorMessage)

        toast.error('Failed to load document', {
          description: errorMessage,
          duration: 5000,
        })
      } finally {
        setLoading(false)
      }
    }

    loadMarkdown()
  }, [markdownUrl, retryCount])

  // Handle text selection
  function handleMouseUp() {
    const selection = captureSelection()
    if (selection) {
      setSelectedText(selection)
    } else {
      setSelectedText(null)
    }
  }

  // Handle Escape key to close selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedText(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Handle retry
  function handleRetry() {
    if (retryCount < 3) {
      setRetryCount(retryCount + 1)
    } else {
      toast.error('Maximum retry attempts reached', {
        description: 'Please refresh the page or contact support.',
        duration: 5000,
      })
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-4xl">
        <div className="space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <div className="pt-4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
          <div className="pt-4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
        </div>
      </div>
    )
  }

  // Error state with retry
  if (error) {
    return (
      <div className="container mx-auto p-8 max-w-4xl">
        <div className="border border-destructive rounded-lg p-6 bg-destructive/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-destructive mb-2">
                Failed to load document
              </h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <div className="flex gap-2">
                <Button
                  onClick={handleRetry}
                  disabled={retryCount >= 3}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry {retryCount > 0 && `(${retryCount}/3)`}
                </Button>
                <Button
                  onClick={() => (window.location.href = '/')}
                  variant="ghost"
                  size="sm"
                >
                  Back to Library
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full" onMouseUp={handleMouseUp}>
      <VirtualizedReader
        markdown={markdown}
        chunks={chunks}
        onVisibleChunksChange={setVisibleChunkIds}
      />

      {selectedText && (
        <QuickCapturePanel
          selection={selectedText}
          documentId={documentId}
          onClose={() => setSelectedText(null)}
          chunkContent={
            chunks.find((c) => c.id === selectedText.range.chunkId)?.content ||
            ''
          }
        />
      )}

      <KeyboardHelp />
    </div>
  )
}
