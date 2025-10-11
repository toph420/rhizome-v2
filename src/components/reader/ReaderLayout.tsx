'use client'

import { useCallback, useEffect } from 'react'
import { DocumentViewer } from './DocumentViewer'
import { DocumentHeader } from './DocumentHeader'
import { RightPanel } from '../sidebar/RightPanel'
import { ConnectionHeatmap } from './ConnectionHeatmap'
import { QuickSparkModal } from './QuickSparkModal'
import { toast } from 'sonner'
import { useReaderStore } from '@/stores/reader-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useUIStore } from '@/stores/ui-store'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

interface ReaderLayoutProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
  documentTitle: string
  wordCount?: number
  connectionCount?: number
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
 * Client-side layout component that orchestrates all 4 Zustand stores.
 *
 * **Store Orchestration**:
 * - ReaderStore: Document content + scroll + visible chunks
 * - ConnectionStore: Weights + filtering + connections
 * - UIStore: View modes + sidebar + display settings
 * - AnnotationStore: Annotation data (loaded by VirtualizedReader)
 *
 * **Data Flow**:
 * 1. Loads document into ReaderStore on mount
 * 2. VirtualizedReader updates scroll → ReaderStore.updateScroll()
 * 3. ReaderStore recalculates visibleChunks
 * 4. ReaderLayout subscribes to visibleChunks (useEffect)
 * 5. Fetches connections for visible chunks (debounced 300ms)
 * 6. Updates ConnectionStore → triggers sidebar re-render
 */
export function ReaderLayout({
  documentId,
  markdownUrl,
  chunks,
  annotations,
  documentTitle,
  wordCount,
  connectionCount,
  reviewResults = null,
}: ReaderLayoutProps) {
  // ReaderStore: Document content and scroll state
  const loadDocument = useReaderStore(state => state.loadDocument)
  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const scrollPosition = useReaderStore(state => state.scrollPosition)

  // ConnectionStore: Engine configuration and connections
  const setConnections = useConnectionStore(state => state.setConnections)
  const filteredConnections = useConnectionStore(state => state.filteredConnections)

  // UIStore: View modes and UI preferences
  const viewMode = useUIStore(state => state.viewMode)
  const setViewMode = useUIStore(state => state.setViewMode)
  const showQuickSpark = useUIStore(state => state.quickCaptureOpen)
  const openQuickCapture = useUIStore(state => state.openQuickCapture)
  const closeQuickCapture = useUIStore(state => state.closeQuickCapture)

  // Initialize document in ReaderStore on mount
  useEffect(() => {
    async function loadMarkdown() {
      try {
        const response = await fetch(markdownUrl)
        const markdown = await response.text()
        loadDocument(documentId, documentTitle, markdown, chunks)
      } catch (error) {
        console.error('[ReaderLayout] Failed to load markdown:', error)
        toast.error('Failed to load document content')
      }
    }

    loadMarkdown()
  }, [documentId, markdownUrl, documentTitle, chunks, loadDocument])

  // Fetch connections when visible chunks change (debounced 300ms)
  useEffect(() => {
    if (visibleChunks.length === 0) return

    const fetchConnections = async () => {
      try {
        const response = await fetch('/api/connections/for-chunks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chunkIds: visibleChunks.map(c => c.id)
          })
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const connections = await response.json()
        setConnections(connections)
      } catch (error) {
        console.error('[ReaderLayout] Failed to fetch connections:', error)
        // Silent fail - connections are supplementary
      }
    }

    // Debounce connection fetching (avoid spam during scroll)
    const timer = setTimeout(fetchConnections, 300)
    return () => clearTimeout(timer)
  }, [visibleChunks, setConnections])

  // ⌘K keyboard shortcut for Quick Spark
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openQuickCapture()
      }

      // Escape to close modal
      if (e.key === 'Escape' && showQuickSpark) {
        closeQuickCapture()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showQuickSpark, openQuickCapture, closeQuickCapture])


  /**
   * Navigates to a chunk by scrolling it into view.
   * Finds the chunk element by data-chunk-id attribute and scrolls smoothly.
   */
  const handleNavigateToChunk = useCallback((chunkId: string) => {
    const chunkElement = document.querySelector(`[data-chunk-id="${chunkId}"]`)

    if (chunkElement) {
      chunkElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      // Highlight the chunk temporarily with Framer Motion classes
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

  /**
   * Scrolls to annotation by finding element with data-annotation-id attribute.
   * Works with VirtualizedReader's virtualization by scrolling to offset first.
   */
  const handleAnnotationClick = useCallback((annotationId: string, startOffset: number) => {
    // Find annotation element by data-annotation-id
    let annotationElement = document.querySelector(`[data-annotation-id="${annotationId}"]`)

    if (annotationElement) {
      // Annotation is already rendered - just scroll to it
      annotationElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      // Highlight temporarily
      annotationElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
      setTimeout(() => {
        annotationElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2')
      }, 2000)

      toast.success('Scrolled to annotation', {
        duration: 2000,
      })
      return
    }

    // Annotation not rendered yet - calculate scroll position and scroll viewport
    // Get markdown length to calculate proportional scroll position
    const markdownContent = useReaderStore.getState().markdownContent
    const markdownLength = markdownContent.length

    if (markdownLength === 0) {
      toast.error('Document not loaded', {
        description: 'Please wait for the document to finish loading',
      })
      return
    }

    // Find the Virtuoso scroll container
    const virtuosoContainer = document.querySelector('[data-virtuoso-scroller]') as HTMLElement

    if (!virtuosoContainer) {
      toast.error('Could not locate scroll container')
      return
    }

    // Calculate target scroll position: annotation's position in document maps to scroll position
    // If annotation is 25% through markdown, scroll to 25% of container height
    const targetScrollTop = (startOffset / markdownLength) * virtuosoContainer.scrollHeight

    console.log(`[ReaderLayout] Scrolling to offset ${startOffset} (${targetScrollTop.toFixed(0)}px in ${virtuosoContainer.scrollHeight}px container)`)

    // Smooth scroll to position
    virtuosoContainer.scrollTo({
      top: targetScrollTop,
      behavior: 'smooth'
    })

    // Wait for virtuoso to render new blocks, then find annotation
    setTimeout(() => {
      const annotationElement = document.querySelector(`[data-annotation-id="${annotationId}"]`)

      if (annotationElement) {
        // Fine-tune scroll to exact annotation position
        annotationElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })

        // Highlight temporarily
        annotationElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
        setTimeout(() => {
          annotationElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2')
        }, 2000)

        toast.success('Scrolled to annotation', {
          duration: 2000,
        })
      } else {
        // Still not found - try one more time with longer delay
        setTimeout(() => {
          const annotationElement = document.querySelector(`[data-annotation-id="${annotationId}"]`)
          if (annotationElement) {
            annotationElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            })
            annotationElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
            setTimeout(() => {
              annotationElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2')
            }, 2000)
            toast.success('Scrolled to annotation')
          } else {
            console.warn(`Annotation still not found after scrolling: ${annotationId} at offset ${startOffset}`)
            toast.info('Scrolled to approximate location', {
              description: 'The annotation should be nearby'
            })
          }
        }, 800)
      }
    }, 500)
  }, [])

  return (
    <div className="flex flex-col h-screen">
      {/* Enhanced document header with reading modes + Quick Spark */}
      <DocumentHeader
        documentId={documentId}
        title={documentTitle}
        wordCount={wordCount}
        chunkCount={chunks.length}
        connectionCount={connectionCount}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onQuickSpark={openQuickCapture}
      />

      <div className="flex-1 overflow-hidden relative">
        {/* Connection density heatmap in left margin */}
        {viewMode === 'explore' && (
          <ConnectionHeatmap
            documentId={documentId}
            chunks={chunks}
          />
        )}

        {/* Main document viewer - VirtualizedReader now self-contained */}
        <DocumentViewer
          documentId={documentId}
          markdownUrl={markdownUrl}
          chunks={chunks}
          annotations={annotations}
        />
      </div>

      {/* Right panel with 6 tabs - hidden in Focus mode */}
      {viewMode !== 'focus' && (
        <RightPanel
          documentId={documentId}
          visibleChunkIds={visibleChunks.map(c => c.id)}
          reviewResults={reviewResults}
          onAnnotationClick={handleAnnotationClick}
          onNavigateToChunk={handleNavigateToChunk}
          chunks={chunks}
        />
      )}

      {/* Quick Spark modal (⌘K) */}
      {showQuickSpark && (
        <QuickSparkModal
          documentId={documentId}
          documentTitle={documentTitle}
          visibleChunks={visibleChunks}
          activeConnections={filteredConnections.length}
          scrollPosition={scrollPosition}
          onClose={closeQuickCapture}
        />
      )}
    </div>
  )
}
