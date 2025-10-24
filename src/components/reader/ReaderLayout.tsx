'use client'

import { useCallback, useEffect, useState } from 'react'
import { DocumentViewer } from './DocumentViewer'
import { DocumentHeader } from './DocumentHeader'
import { RightPanelV2 as RightPanel } from '../sidebar/RightPanel'
import { ConnectionHeatmap } from './ConnectionHeatmap'
import { QuickSparkCapture } from '../sparks/QuickSparkCapture'
import { CorrectionModePanel } from './CorrectionModePanel'
import { CorrectionConfirmDialog } from './CorrectionConfirmDialog'
import { toast } from 'sonner'
import { useReaderStore } from '@/stores/reader-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useUIStore } from '@/stores/ui-store'
import { calculateOffsetsFromCurrentSelection } from '@/lib/reader/offset-calculator'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

/**
 * Correction mode state.
 */
interface CorrectionModeState {
  chunkId: string
  chunkIndex: number
  originalStartOffset: number
  originalEndOffset: number
}

interface ReaderLayoutProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
  documentTitle: string
  wordCount?: number
  connectionCount?: number
  chunkerType?: string | null
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
  chunkerType,
  reviewResults = null,
}: ReaderLayoutProps) {
  // ReaderStore: Document content and scroll state
  const loadDocument = useReaderStore(state => state.loadDocument)
  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const scrollPosition = useReaderStore(state => state.scrollPosition)
  const setCorrectionModeStore = useReaderStore(state => state.setCorrectionMode)
  const setScrollToChunkId = useReaderStore(state => state.setScrollToChunkId)

  // ConnectionStore: Engine configuration and connections
  const setConnections = useConnectionStore(state => state.setConnections)
  const filteredConnections = useConnectionStore(state => state.filteredConnections)

  // UIStore: View modes and UI preferences
  const viewMode = useUIStore(state => state.viewMode)
  const setViewMode = useUIStore(state => state.setViewMode)
  const sparkCaptureOpen = useUIStore(state => state.sparkCaptureOpen)
  const openSparkCapture = useUIStore(state => state.openSparkCapture)
  const closeSparkCapture = useUIStore(state => state.closeSparkCapture)

  // Correction mode state
  const [correctionMode, setCorrectionMode] = useState<CorrectionModeState | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [selectedOffsets, setSelectedOffsets] = useState<{
    startOffset: number
    endOffset: number
    selectedText: string
  } | null>(null)

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
        openSparkCapture()
      }

      // Escape to close spark panel
      if (e.key === 'Escape' && sparkCaptureOpen) {
        closeSparkCapture()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sparkCaptureOpen, openSparkCapture, closeSparkCapture])


  /**
   * Navigates to a chunk using Virtuoso's scrollToIndex API.
   * VirtualizedReader watches scrollToChunkId in ReaderStore and scrolls precisely.
   *
   * @param chunkId - Chunk identifier to navigate to
   * @param enterCorrectionMode - Whether to enter correction mode for this chunk
   */
  const handleNavigateToChunk = useCallback((chunkId: string, enterCorrectionMode = false) => {
    // Find chunk data
    const chunk = chunks.find(c => c.id === chunkId)

    if (!chunk) {
      console.warn(`Chunk not found: ${chunkId}`)
      toast.info('Cross-document connection', {
        description: 'This connection points to another document. Cross-document navigation coming soon!',
        duration: 3000,
      })
      return
    }

    // Trigger scroll via ReaderStore (VirtualizedReader will handle it)
    setScrollToChunkId(chunkId)

    // Wait for scroll to complete, then highlight and enter correction mode if needed
    setTimeout(() => {
      const chunkElements = document.querySelectorAll(`[data-chunk-id="${chunkId}"]`)

      if (chunkElements.length > 0) {
        // Highlight all blocks of this chunk with a left border indicator
        const indicators: HTMLElement[] = []

        chunkElements.forEach((element) => {
          const indicator = document.createElement('div')
          indicator.className = 'absolute left-[-20px] top-0 bottom-0 w-[5px] bg-primary rounded-full transition-opacity duration-300'
          indicator.setAttribute('data-chunk-indicator', 'true')
          element.appendChild(indicator)
          indicators.push(indicator)
        })

        setTimeout(() => {
          indicators.forEach(indicator => indicator.remove())
        }, 2000)

        // Enter correction mode or show success toast
        if (enterCorrectionMode) {
          setCorrectionMode({
            chunkId: chunk.id,
            chunkIndex: chunk.chunk_index,
            originalStartOffset: chunk.start_offset ?? 0,
            originalEndOffset: chunk.end_offset ?? 0,
          })
          setCorrectionModeStore(true)
        } else {
          toast.success('Navigated to chunk ' + chunk.chunk_index, {
            duration: 2000,
          })
        }
      } else {
        console.warn(`Chunk not rendered after scrolling: ${chunkId}`)
        toast.info('Scrolled to chunk ' + chunk.chunk_index, {
          description: 'The chunk should be visible now'
        })

        // Still enter correction mode if requested
        if (enterCorrectionMode) {
          setCorrectionMode({
            chunkId: chunk.id,
            chunkIndex: chunk.chunk_index,
            originalStartOffset: chunk.start_offset ?? 0,
            originalEndOffset: chunk.end_offset ?? 0,
          })
          setCorrectionModeStore(true)
        }
      }
    }, 800)
  }, [chunks, setCorrectionModeStore, setScrollToChunkId])

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

      // Highlight temporarily with background
      annotationElement.classList.add('bg-primary/20', 'transition-colors', 'duration-300')
      setTimeout(() => {
        annotationElement.classList.remove('bg-primary/20', 'transition-colors', 'duration-300')
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

        // Highlight temporarily with background
        annotationElement.classList.add('bg-primary/20', 'transition-colors', 'duration-300')
        setTimeout(() => {
          annotationElement.classList.remove('bg-primary/20', 'transition-colors', 'duration-300')
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
            annotationElement.classList.add('bg-primary/20', 'transition-colors', 'duration-300')
            setTimeout(() => {
              annotationElement.classList.remove('bg-primary/20', 'transition-colors', 'duration-300')
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

  /**
   * Text selection handler for correction mode.
   * Calculates offsets from DOM selection and shows confirmation dialog.
   */
  useEffect(() => {
    if (!correctionMode) return

    function handleMouseUp() {
      // Small delay to ensure selection is complete
      setTimeout(() => {
        if (!correctionMode) return

        const offsetResult = calculateOffsetsFromCurrentSelection(true)

        if (offsetResult) {
          console.log('[ReaderLayout] Text selected for correction:', {
            chunkId: correctionMode.chunkId,
            oldOffsets: [correctionMode.originalStartOffset, correctionMode.originalEndOffset],
            newOffsets: [offsetResult.startOffset, offsetResult.endOffset],
            text: offsetResult.selectedText.substring(0, 100)
          })

          setSelectedOffsets({
            startOffset: offsetResult.startOffset,
            endOffset: offsetResult.endOffset,
            selectedText: offsetResult.selectedText
          })
          setShowConfirmDialog(true)
        }
      }, 100)
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [correctionMode])

  /**
   * Exits correction mode and clears state.
   */
  const handleCancelCorrection = useCallback(() => {
    setCorrectionMode(null)
    setShowConfirmDialog(false)
    setSelectedOffsets(null)
    // Re-enable annotation capture
    setCorrectionModeStore(false)
    toast.info('Correction cancelled')
  }, [setCorrectionModeStore])

  /**
   * Handles successful correction submission.
   */
  const handleCorrectionSuccess = useCallback(() => {
    setCorrectionMode(null)
    setSelectedOffsets(null)
    // Re-enable annotation capture
    setCorrectionModeStore(false)
    // Dialog will be closed by CorrectionConfirmDialog component
  }, [setCorrectionModeStore])

  return (
    <div className="flex flex-col h-screen">
      {/* Enhanced document header with reading modes + Quick Spark - sticky below TopNav */}
      <div className="sticky top-14 z-40 bg-background">
        <DocumentHeader
        documentId={documentId}
        title={documentTitle}
        wordCount={wordCount}
        chunkCount={chunks.length}
        connectionCount={connectionCount}
        chunkerType={chunkerType}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onQuickSpark={openSparkCapture}
      />
      </div>

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

      {/* Right panel with 7 tabs - hidden in Focus mode */}
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

      {/* Quick Spark Capture (⌘K) - handles own visibility */}
      <QuickSparkCapture
        documentId={documentId}
        documentTitle={documentTitle}
        currentChunkId={visibleChunks[0]?.id || ''}
        visibleChunks={visibleChunks.map(c => c.id)}
        connections={filteredConnections}
        engineWeights={{ semantic: 0.25, contradiction: 0.40, bridge: 0.35 }}
        chunks={chunks}
      />

      {/* Correction mode panel */}
      {correctionMode && (
        <CorrectionModePanel
          chunkId={correctionMode.chunkId}
          chunkIndex={correctionMode.chunkIndex}
          onCancel={handleCancelCorrection}
        />
      )}

      {/* Correction confirmation dialog */}
      {correctionMode && selectedOffsets && (
        <CorrectionConfirmDialog
          open={showConfirmDialog}
          onOpenChange={setShowConfirmDialog}
          chunkId={correctionMode.chunkId}
          chunkIndex={correctionMode.chunkIndex}
          documentId={documentId}
          oldStartOffset={correctionMode.originalStartOffset}
          oldEndOffset={correctionMode.originalEndOffset}
          newStartOffset={selectedOffsets.startOffset}
          newEndOffset={selectedOffsets.endOffset}
          selectedText={selectedOffsets.selectedText}
          onSuccess={handleCorrectionSuccess}
          onCancel={handleCancelCorrection}
        />
      )}
    </div>
  )
}
