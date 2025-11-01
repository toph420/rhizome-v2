'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { DocumentViewer } from './DocumentViewer'
import { DocumentHeader } from './DocumentHeader'
import { RightPanelV2 as RightPanel } from '../sidebar/RightPanel'
import { ConnectionHeatmap } from './ConnectionHeatmap'
import { QuickSparkCapture } from '../sparks/QuickSparkCapture'
import { CorrectionModePanel } from './CorrectionModePanel'
import { CorrectionConfirmDialog } from './CorrectionConfirmDialog'
import { LeftPanel } from '@/components/layout/LeftPanel'

// Dynamic import PDFViewer to avoid SSR issues with PDF.js
const PDFViewer = dynamic(
  () => import('@/components/rhizome/pdf-viewer/PDFViewer').then(mod => ({ default: mod.PDFViewer })),
  { ssr: false }
)
import { toast } from 'sonner'
import { useReaderStore } from '@/stores/reader-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useUIStore } from '@/stores/ui-store'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { calculateOffsetsFromCurrentSelection } from '@/lib/reader/offset-calculator'
import { getConnectionsForChunks } from '@/app/actions/connections'
import { refetchChunks } from '@/app/actions/chunks'
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
  pdfUrl: string | null  // 🆕 ADD: PDF signed URL
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
  pdfUrl,  // 🆕 ADD: PDF URL
  chunks,
  annotations,
  documentTitle,
  wordCount,
  connectionCount,
  chunkerType,
  reviewResults = null,
}: ReaderLayoutProps) {
  // 🆕 ADD: Viewer mode state
  const [viewerMode, setViewerMode] = useState<'markdown' | 'pdf'>('markdown')
  // 🆕 ADD: PDF metadata state
  const [pdfMetadata, setPdfMetadata] = useState<any>(null)
  // 🆕 ADD: PDF outline state (for LeftPanel Outline tab)
  const [pdfOutline, setPdfOutline] = useState<any[]>([])
  // 🆕 ADD: PDF numPages state (for LeftPanel Thumbnails tab)
  const [pdfNumPages, setPdfNumPages] = useState<number>(0)

  // ReaderStore: Document content and scroll state
  const loadDocument = useReaderStore(state => state.loadDocument)
  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const scrollPosition = useReaderStore(state => state.scrollPosition)
  const setCorrectionModeStore = useReaderStore(state => state.setCorrectionMode)
  const setScrollToChunkId = useReaderStore(state => state.setScrollToChunkId)
  const updateChunks = useReaderStore(state => state.updateChunks)
  // 🆕 ADD: PDF navigation methods and state
  const pdfPageNumber = useReaderStore(state => state.pdfPageNumber)
  const setPdfPageNumber = useReaderStore(state => state.setPdfPageNumber)
  const setHighlightedChunkId = useReaderStore(state => state.setHighlightedChunkId)

  // ConnectionStore: Engine configuration and connections
  const setConnections = useConnectionStore(state => state.setConnections)
  const filteredConnections = useConnectionStore(state => state.filteredConnections)

  // UIStore: View modes and UI preferences
  const viewMode = useUIStore(state => state.viewMode)
  const setViewMode = useUIStore(state => state.setViewMode)
  const sparkCaptureOpen = useUIStore(state => state.sparkCaptureOpen)
  const openSparkCapture = useUIStore(state => state.openSparkCapture)
  const closeSparkCapture = useUIStore(state => state.closeSparkCapture)

  // BackgroundJobsStore: Watch for enrichment completion
  const jobsMap = useBackgroundJobsStore(state => state.jobs)

  // Track processed enrichment jobs to avoid duplicate updates
  const processedJobsRef = useRef<Set<string>>(new Set())

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
        const chunkIds = visibleChunks.map(c => c.id)
        const connections = await getConnectionsForChunks(chunkIds)
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

  // Watch for enrichment job completion and refresh affected chunks
  useEffect(() => {
    // Convert Map to array for filtering
    const allJobs = Array.from(jobsMap.values())

    const enrichmentJobs = allJobs.filter(job =>
      (job.type === 'enrich_chunks' || job.type === 'enrich_and_connect') &&
      job.status === 'completed' &&
      job.metadata?.documentId === documentId &&
      !processedJobsRef.current.has(job.id)
    )

    if (enrichmentJobs.length === 0) return

    console.log(`[ReaderLayout] 🔍 Found ${enrichmentJobs.length} new enrichment jobs to process`)

    // Process each new enrichment job
    enrichmentJobs.forEach(async (job) => {
      // Mark as processed immediately to prevent duplicate handling
      processedJobsRef.current.add(job.id)

      console.log('[ReaderLayout] 📋 Job details:', {
        id: job.id,
        type: job.type,
        status: job.status,
        input_data: job.input_data,
        metadata: job.metadata
      })

      try {
        // Extract chunk IDs from job input data (try both field names)
        const chunkIds = job.input_data?.chunk_ids || job.input_data?.chunkIds || []

        if (chunkIds.length === 0) {
          console.warn('[ReaderLayout] ⚠️ Enrichment job completed but no chunk IDs found:', job.id)
          console.warn('[ReaderLayout] Job input_data:', job.input_data)
          return
        }

        console.log(`[ReaderLayout] 🔄 Enrichment completed for ${chunkIds.length} chunks, refreshing...`, chunkIds)

        // Refetch updated chunks from database
        const updatedChunks = await refetchChunks(chunkIds)

        console.log(`[ReaderLayout] 📥 Fetched ${updatedChunks.length} updated chunks from database`)
        if (updatedChunks.length > 0) {
          console.log('[ReaderLayout] Sample chunk data:', {
            id: updatedChunks[0].id,
            themes: updatedChunks[0].themes,
            summary: updatedChunks[0].summary?.substring(0, 50),
            enrichments_detected: updatedChunks[0].enrichments_detected,
            connections_detected: updatedChunks[0].connections_detected
          })
        }

        if (updatedChunks.length > 0) {
          // Update ReaderStore with fresh chunk data
          updateChunks(updatedChunks)

          console.log(`[ReaderLayout] ✅ Refreshed ${updatedChunks.length} chunks with new metadata`)
        }
      } catch (error) {
        console.error('[ReaderLayout] ❌ Failed to refresh chunks after enrichment:', error)
        // Don't show error toast - enrichment completed successfully, just refresh failed
      }
    })
  }, [jobsMap, documentId, updateChunks])

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
   * @param mode - Optional mode to navigate to ('markdown' | 'pdf')
   */
  const handleNavigateToChunk = useCallback((chunkId: string, enterCorrectionMode = false, mode?: 'markdown' | 'pdf') => {
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

    // 🆕 ADD: Switch to PDF mode if requested
    if (mode === 'pdf' && viewerMode !== 'pdf') {
      setViewerMode('pdf')
    }

    // 🆕 ADD: For PDF mode, navigate to page
    if (viewerMode === 'pdf' || mode === 'pdf') {
      if (!chunk.page_start) {
        toast.error('Chunk has no page information')
        return
      }

      // Set page number in PDFViewer (via ReaderStore)
      setPdfPageNumber(chunk.page_start)
      setHighlightedChunkId(chunk.id)

      // Clear highlight after 2 seconds
      setTimeout(() => {
        setHighlightedChunkId(null)
      }, 2000)

      toast.success(`Navigated to page ${chunk.page_start}`)
      return
    }

    // Markdown mode: Trigger scroll via ReaderStore (VirtualizedReader will handle it)
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
  }, [chunks, setCorrectionModeStore, setScrollToChunkId, viewerMode, setViewerMode, setPdfPageNumber, setHighlightedChunkId])

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
   * 🆕 ADD: PDF page navigation handler for LeftPanel Outline tab.
   * Sets the page number in ReaderStore, which PDFViewer subscribes to.
   */
  const handlePageNavigate = useCallback((page: number) => {
    setPdfPageNumber(page)
    toast.success(`Navigated to page ${page}`)
  }, [setPdfPageNumber])

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
      {/* Enhanced document header with reading modes + Quick Spark + View toggle - sticky below TopNav */}
      <div className="sticky top-14 z-40 bg-background">
        <DocumentHeader
        documentId={documentId}
        title={documentTitle}
        wordCount={wordCount}
        chunkCount={chunks.length}
        connectionCount={connectionCount}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onQuickSpark={openSparkCapture}
        viewerMode={viewerMode}
        onViewerModeChange={setViewerMode}
        pdfAvailable={!!pdfUrl}
      />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* LeftPanel - hidden in focus mode */}
        {viewMode !== 'focus' && (
          <LeftPanel
            documentId={documentId}
            pdfMetadata={pdfMetadata}
            outline={pdfOutline}
            fileUrl={pdfUrl || undefined}
            numPages={pdfNumPages}
            currentPage={pdfPageNumber}
            chunks={chunks}
            onPageNavigate={handlePageNavigate}
          />
        )}

        {/* Main viewer area */}
        <div className="flex-1 overflow-hidden relative">
          {/* Connection density heatmap in left margin (markdown only) */}
          {viewMode === 'explore' && viewerMode === 'markdown' && (
            <ConnectionHeatmap
              documentId={documentId}
              chunks={chunks}
            />
          )}

          {/* Conditional viewer based on mode */}
          {viewerMode === 'markdown' ? (
            <DocumentViewer
              documentId={documentId}
              markdownUrl={markdownUrl}
              chunks={chunks}
              annotations={annotations}
            />
          ) : (
            pdfUrl && (
              <PDFViewer
                fileUrl={pdfUrl}
                documentId={documentId}
                onMetadataLoad={setPdfMetadata}
                onOutlineLoad={setPdfOutline}
                onNumPagesLoad={setPdfNumPages}
                chunks={chunks}
              />
            )
          )}
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
      </div>

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
