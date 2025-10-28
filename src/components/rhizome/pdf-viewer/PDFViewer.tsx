'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { useGesture } from '@use-gesture/react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker - use local file from public/ (copied by scripts)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
import { usePDFSelection } from '@/hooks/usePDFSelection'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useReaderStore } from '@/stores/reader-store'
import { useConnectionStore } from '@/stores/connection-store'
import { getAnnotations, createAnnotation } from '@/app/actions/annotations'
import { PDFAnnotationOverlay } from './PDFAnnotationOverlay'
import { PDFAnnotationButton } from './PDFAnnotationButton'
import { PDFChunkOverlay } from './PDFChunkOverlay'
import { toast } from 'sonner'
import type { Chunk } from '@/types/annotations'

interface PDFViewerProps {
  fileUrl: string
  documentId: string
  onMetadataLoad?: (metadata: any) => void
  onOutlineLoad?: (outline: any[]) => void  // Outline extraction callback
  onNumPagesLoad?: (numPages: number) => void  // 🆕 ADD: numPages callback
  chunks?: Chunk[]  // Optional chunks for visualization
}

export function PDFViewer({ fileUrl, documentId, onMetadataLoad, onOutlineLoad, onNumPagesLoad, chunks = [] }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState(1.0)
  const [pageWidth, setPageWidth] = useState<number>(0)
  const [pageHeight, setPageHeight] = useState<number>(0)
  const [pdfMetadata, setPdfMetadata] = useState<any>(null)

  // Reader store for PDF navigation
  const pdfPageNumber = useReaderStore(state => state.pdfPageNumber)
  const highlightedChunkId = useReaderStore(state => state.highlightedChunkId)
  const setPdfPageNumber = useReaderStore(state => state.setPdfPageNumber)

  // Use reader store page number
  const pageNumber = pdfPageNumber

  // Text selection tracking
  const { selection, clearSelection, longPressActive } = usePDFSelection({
    enabled: true,
    pageNumber,
    scale, // Pass current scale for coordinate conversion
  })

  // Annotation store
  const annotations = useAnnotationStore(
    state => state.annotations[documentId] ?? []
  )
  const setAnnotations = useAnnotationStore(state => state.setAnnotations)

  // 🆕 ADD: Get connections from store
  const connections = useConnectionStore(state => state.filteredConnections)

  // Load annotations on mount
  useEffect(() => {
    async function loadAnnotations() {
      try {
        const fetchedAnnotations = await getAnnotations(documentId)
        setAnnotations(documentId, fetchedAnnotations)
      } catch (error) {
        console.error('[PDFViewer] Failed to load annotations:', error)
      }
    }
    loadAnnotations()
  }, [documentId, setAnnotations])

  // ✅ Memoize options to prevent unnecessary re-renders (react-pdf best practice)
  const documentOptions = useMemo(() => ({
    cMapUrl: '/cmaps/',
    cMapPacked: true,
  }), [])

  const onDocumentLoadSuccess = useCallback((pdf: any) => {
    setNumPages(pdf.numPages)
    onNumPagesLoad?.(pdf.numPages)  // 🆕 ADD: Emit numPages
    console.log(`[PDFViewer] Loaded PDF with ${pdf.numPages} pages`)

    // Load PDF metadata
    pdf.getMetadata().then((metadata: any) => {
      const pdfInfo = {
        title: metadata.info?.Title || null,
        author: metadata.info?.Author || null,
        creator: metadata.info?.Creator || null,
        pageCount: pdf.numPages,
      }
      setPdfMetadata(pdfInfo)
      onMetadataLoad?.(pdfInfo)
      console.log('[PDFViewer] Loaded PDF metadata:', pdfInfo)
    }).catch((error: Error) => {
      console.error('[PDFViewer] Failed to load PDF metadata:', error)
    })

    // 🆕 ADD: Load PDF outline (table of contents)
    pdf.getOutline().then((outline: any[]) => {
      if (outline && outline.length > 0) {
        console.log('[PDFViewer] Loaded PDF outline:', outline.length, 'items')
        onOutlineLoad?.(outline)
      } else {
        console.log('[PDFViewer] No outline available')
        onOutlineLoad?.([])
      }
    }).catch((error: Error) => {
      console.error('[PDFViewer] Failed to load PDF outline:', error)
      onOutlineLoad?.([])
    })
  }, [onMetadataLoad, onOutlineLoad, onNumPagesLoad])

  // Touch gesture detection for mobile
  const bind = useGesture({
    onPinch: ({ offset: [d] }) => {
      setScale(Math.max(0.5, Math.min(3.0, 1 + d / 200)))
    },
    onDrag: ({ offset: [x, y] }) => {
      // Pan handling for mobile (future enhancement)
      console.log('[PDFViewer] Pan gesture detected:', x, y)
    }
  })

  // Log selection for testing
  useEffect(() => {
    if (selection) {
      console.log('[PDFViewer] Text selected:', {
        text: selection.text.substring(0, 50),
        page: selection.pageNumber,
        rect: selection.pdfRect,
      })
    }
  }, [selection])

  // Zoom presets
  const handleFitWidth = () => {
    if (pageWidth > 0) {
      const containerWidth = window.innerWidth - 400 // Account for panels
      setScale(containerWidth / pageWidth)
    }
  }

  const handleFitPage = () => {
    // Fit to visible viewport height
    if (pageHeight > 0) {
      const containerHeight = window.innerHeight - 200 // Account for header/controls
      setScale(containerHeight / pageHeight)
    }
  }

  const handleActualSize = () => {
    setScale(1.0)
  }

  // Annotation click handler
  const handleAnnotationClick = (annotationId: string) => {
    console.log('[PDFViewer] Annotation clicked:', annotationId)
    // TODO: Open edit panel (Phase 4+)
  }

  // Chunk click handler
  const handleChunkClick = (chunkId: string) => {
    console.log('[PDFViewer] Chunk clicked:', chunkId)
    // TODO: Navigate to chunk in sidebar or show chunk details
  }

  // Create annotation from PDF selection
  const handleCreateAnnotation = async () => {
    if (!selection) return

    try {
      const result = await createAnnotation({
        documentId,
        text: selection.text,
        startOffset: 0, // Not used for PDF-only annotations
        endOffset: 0,
        chunkIds: [], // Will be calculated by backend if needed
        color: 'yellow',
        textContext: {
          before: '',
          content: selection.text,
          after: '',
        },
        // PDF coordinates - prefer multiple rects for multi-line
        pdfPageNumber: selection.pdfRect.pageNumber,
        pdfRects: selection.pdfRects, // Multiple rects for multi-line
        pdfX: selection.pdfRect.x,
        pdfY: selection.pdfRect.y,
        pdfWidth: selection.pdfRect.width,
        pdfHeight: selection.pdfRect.height,
      })

      if (result.success) {
        toast.success('Annotation created')

        // Reload annotations to show the new one
        const fetchedAnnotations = await getAnnotations(documentId)
        setAnnotations(documentId, fetchedAnnotations)

        // Clear selection
        clearSelection()
      } else {
        toast.error('Failed to create annotation')
      }
    } catch (error) {
      console.error('[PDFViewer] Failed to create annotation:', error)
      toast.error('Failed to create annotation')
    }
  }

  return (
    <div className="pdf-viewer-container flex flex-col h-full">
      {/* Selection indicator - Floating bottom-right to avoid interfering with selection */}
      {selection && (
        <div className="fixed bottom-4 right-4 z-40 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg px-4 py-2 text-sm max-w-md">
          <div className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground">Selected:</span>
            <span className="flex-1 text-xs">"{selection.text.substring(0, 60)}{selection.text.length > 60 ? '...' : ''}"</span>
            <button
              onClick={clearSelection}
              className="text-blue-600 hover:underline text-xs shrink-0"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Long-press indicator for mobile */}
      {longPressActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full text-xs z-50">
          Selection Mode Active
        </div>
      )}

      {/* Annotation creation button */}
      {selection && (
        <PDFAnnotationButton
          rect={selection.rect}
          onCreateAnnotation={handleCreateAnnotation}
        />
      )}

      {/* Controls */}
      <div className="pdf-controls flex items-center gap-4 p-4 border-b bg-background">
        <button
          onClick={() => setPdfPageNumber(Math.max(1, pageNumber - 1))}
          disabled={pageNumber <= 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-sm">
          Page {pageNumber} of {numPages}
        </span>

        <button
          onClick={() => setPdfPageNumber(Math.min(numPages, pageNumber + 1))}
          disabled={pageNumber >= numPages}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next
        </button>

        <div className="flex-1" />

        {/* Zoom presets */}
        <button onClick={handleFitWidth} className="px-3 py-1 border rounded text-xs">
          Fit Width
        </button>
        <button onClick={handleFitPage} className="px-3 py-1 border rounded text-xs">
          Fit Page
        </button>
        <button onClick={handleActualSize} className="px-3 py-1 border rounded text-xs">
          100%
        </button>

        <button onClick={() => setScale(s => s * 1.2)} className="px-3 py-1 border rounded">
          Zoom In
        </button>
        <button onClick={() => setScale(s => s / 1.2)} className="px-3 py-1 border rounded">
          Zoom Out
        </button>
      </div>

      {/* PDF document */}
      <div
        {...bind()}
        className="pdf-content flex-1 overflow-auto flex items-center justify-center bg-gray-100 dark:bg-gray-900 touch-none"
      >
        <div className="relative">
          <Document
            file={fileUrl}
            options={documentOptions}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="text-center p-8">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading PDF...</p>
              </div>
            }
            error={
              <div className="text-center p-8">
                <p className="text-destructive mb-2">Failed to load PDF</p>
                <p className="text-sm text-muted-foreground">Please try refreshing the page</p>
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
              onLoadSuccess={(page) => {
                setPageWidth(page.width)
                setPageHeight(page.height)
              }}
            />
          </Document>

          {/* Annotation overlay layer (underneath chunks) */}
          <PDFAnnotationOverlay
            annotations={annotations}
            pageNumber={pageNumber}
            scale={scale}
            onAnnotationClick={handleAnnotationClick}
          />

          {/* Chunk overlay layer (on top of annotations) */}
          <PDFChunkOverlay
            chunks={chunks}
            pageNumber={pageNumber}
            scale={scale}
            highlightedChunkId={highlightedChunkId}
            connections={connections}
            onChunkClick={handleChunkClick}
          />
        </div>
      </div>
    </div>
  )
}
