'use client'

import { useState, useCallback } from 'react'
import { DocumentViewer } from './DocumentViewer'
import { DocumentHeader } from './DocumentHeader'
import { RightPanel } from '../sidebar/RightPanel'
import { toast } from 'sonner'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

interface ReaderLayoutProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
  reviewResults?: {
    success: Array<{
      id: string
      text: string
      startOffset: number
      endOffset: number
      textContext?: { before: string; after: string }
      originalChunkIndex?: number
    }>
    needsReview: Array<{
      annotation: {
        id: string
        text: string
        startOffset: number
        endOffset: number
        textContext?: { before: string; after: string }
        originalChunkIndex?: number
      }
      suggestedMatch: {
        text: string
        startOffset: number
        endOffset: number
        confidence: number
        method: 'exact' | 'context' | 'chunk_bounded' | 'trigram'
        contextBefore?: string
        contextAfter?: string
      }
    }>
    lost: Array<{
      id: string
      text: string
      startOffset: number
      endOffset: number
      textContext?: { before: string; after: string }
      originalChunkIndex?: number
    }>
  } | null
}

/**
 * Client-side layout component that lifts visibleChunkIds state
 * from DocumentViewer to RightPanel for connection surfacing.
 *
 * **State Flow**:
 * 1. VirtualizedReader tracks visible chunks in viewport
 * 2. Calls onVisibleChunksChange callback with chunk IDs
 * 3. DocumentViewer passes callback up to this component
 * 4. ReaderLayout stores visibleChunkIds in state
 * 5. RightPanel receives visibleChunkIds as prop
 * 6. ConnectionsList uses debounced chunkIds to fetch connections
 *
 * This enables connection surfacing for currently visible chunks.
 */
export function ReaderLayout({
  documentId,
  markdownUrl,
  chunks,
  annotations,
  reviewResults = null,
}: ReaderLayoutProps) {
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([])

  /**
   * Navigates to a chunk by scrolling it into view.
   * Finds the chunk element by data-chunk-id attribute and scrolls smoothly.
   */
  const handleNavigateToChunk = useCallback((chunkId: string) => {
    // Find the chunk element by data attribute
    const chunkElement = document.querySelector(`[data-chunk-id="${chunkId}"]`)

    if (chunkElement) {
      chunkElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      // Highlight the chunk temporarily
      chunkElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
      setTimeout(() => {
        chunkElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2')
      }, 2000)

      toast.success('Navigated to connected chunk', {
        duration: 2000,
      })
    } else {
      console.warn(`Chunk element not found: ${chunkId}`)
      toast.info('Cross-document connection', {
        description: 'This connection points to another document. Cross-document navigation coming soon!',
        duration: 3000,
      })
    }
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Document header with Obsidian sync buttons */}
      <DocumentHeader documentId={documentId} />

      <div className="flex-1 overflow-hidden">
        <DocumentViewer
          documentId={documentId}
          markdownUrl={markdownUrl}
          chunks={chunks}
          annotations={annotations}
          onVisibleChunksChange={setVisibleChunkIds}
        />
      </div>

      {/* Right panel with connections and annotations */}
      <RightPanel
        documentId={documentId}
        visibleChunkIds={visibleChunkIds}
        reviewResults={reviewResults}
        onNavigateToChunk={handleNavigateToChunk}
      />
    </div>
  )
}
