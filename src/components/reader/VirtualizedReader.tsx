'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { toast } from 'sonner'
import { parseMarkdownToBlocks } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import { QuickCapturePanel } from './QuickCapturePanel'
import { AnnotationsDebugPanel } from './AnnotationsDebugPanel'
import { useTextSelection } from '@/hooks/useTextSelection'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useReaderStore } from '@/stores/reader-store'
import { useUIStore } from '@/stores/ui-store'
import { getAnnotations } from '@/app/actions/annotations'
import type { AnnotationEntity, OptimisticAnnotation, TextSelection } from '@/types/annotations'

// Constant empty array to prevent infinite loops from new references
const EMPTY_ANNOTATIONS: AnnotationEntity[] = []

/**
 * Virtualized document reader with annotation support.
 * Gets document content from ReaderStore (no props needed).
 * Handles progressive loading, text selection, and highlight injection.
 * @returns React element with virtualized rendering.
 */
export function VirtualizedReader() {
  // Ref to Virtuoso for programmatic scrolling
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Get document data from ReaderStore (replaces props)
  const markdown = useReaderStore(state => state.markdownContent)
  const chunks = useReaderStore(state => state.chunks)
  const documentId = useReaderStore(state => state.documentId)
  const updateScroll = useReaderStore(state => state.updateScroll)
  const scrollToChunk = useReaderStore(state => state.scrollToChunkId)
  const setScrollToChunk = useReaderStore(state => state.setScrollToChunkId)
  // Zustand store for annotations (document-keyed)
  // Use constant empty array reference to prevent infinite loop
  const annotations = useAnnotationStore(
    state => state.annotations[documentId ?? ''] ?? EMPTY_ANNOTATIONS
  )
  const setAnnotations = useAnnotationStore(state => state.setAnnotations)
  const addAnnotation = useAnnotationStore(state => state.addAnnotation)
  const updateStoreAnnotation = useAnnotationStore(state => state.updateAnnotation)

  // Optimistic annotations (temporary, for instant UI updates)
  const [optimisticAnnotations, setOptimisticAnnotations] = useState<
    Map<string, OptimisticAnnotation>
  >(new Map())

  // Store the selection that opened the panel (snapshot, independent of live selection)
  // This prevents panel from closing when browser clears selection on click
  const [captureSelection, setCaptureSelection] = useState<TextSelection | null>(null)

  // Expose method to force-show annotation panel with a selection (for spark panel integration)
  const forceShowAnnotationPanel = useCallback((selection: TextSelection) => {
    setCaptureSelection(selection)
  }, [])

  // Track annotation being edited (if any)
  const [editingAnnotation, setEditingAnnotation] = useState<AnnotationEntity | null>(null)

  // Text selection tracking for new annotations
  const { selection, clearSelection } = useTextSelection({
    chunks,
    enabled: true,
  })

  // When selection changes, capture it for the panel (unless in correction mode or spark panel is open)
  const correctionModeActive = useReaderStore(state => state.correctionModeActive)
  const sparkCaptureOpen = useUIStore(state => state.sparkCaptureOpen)
  const pendingAnnotationSelection = useUIStore(state => state.pendingAnnotationSelection)
  const setPendingAnnotationSelection = useUIStore(state => state.setPendingAnnotationSelection)

  useEffect(() => {
    // Don't capture selection if:
    // - In correction mode (fixing chunk positions)
    // - Spark capture panel is open (spark panel owns the selection)
    if (selection && !captureSelection && !correctionModeActive && !sparkCaptureOpen) {
      setCaptureSelection(selection)
    }
  }, [selection, captureSelection, correctionModeActive, sparkCaptureOpen])

  // Handle pending annotation selection from spark panel
  useEffect(() => {
    if (pendingAnnotationSelection) {
      setCaptureSelection(pendingAnnotationSelection)
      setPendingAnnotationSelection(null) // Clear after using
    }
  }, [pendingAnnotationSelection, setPendingAnnotationSelection])

  // Load annotations from database into Zustand store
  useEffect(() => {
    if (!documentId) return

    async function loadAnnotations() {
      try {
        const annotations = await getAnnotations(documentId!)
        setAnnotations(documentId!, annotations)
      } catch (error) {
        console.error('[VirtualizedReader] Error loading annotations:', error)
      }
    }

    void loadAnnotations()
  }, [documentId, setAnnotations])

  // Parse markdown into blocks (without annotations - injection happens in BlockRenderer)
  const blocks = useMemo(() => {
    return parseMarkdownToBlocks(markdown, chunks)
  }, [markdown, chunks])

  // Handle programmatic scrolling to chunk (triggered by ReaderLayout)
  useEffect(() => {
    if (!scrollToChunk || !virtuosoRef.current) return

    // Find the first block index for this chunk
    const targetBlockIndex = blocks.findIndex(block => block.chunkId === scrollToChunk)

    if (targetBlockIndex >= 0) {
      console.log(`[VirtualizedReader] Scrolling to chunk ${scrollToChunk} at block index ${targetBlockIndex}`)

      // Use Virtuoso's scrollToIndex for precise scrolling
      virtuosoRef.current.scrollToIndex({
        index: targetBlockIndex,
        align: 'center',
        behavior: 'smooth'
      })

      // Clear the scroll trigger after 500ms
      setTimeout(() => {
        setScrollToChunk(null)
      }, 500)
    } else {
      console.warn(`[VirtualizedReader] Chunk not found in blocks: ${scrollToChunk}`)
      setScrollToChunk(null)
    }
  }, [scrollToChunk, blocks, setScrollToChunk])

  // Merge store annotations with optimistic ones
  const allAnnotations = useMemo(() => {
    // Start with store annotations converted to simple format
    // IMPORTANT: Read offsets from position component (has recovered offsets after reprocessing)
    // annotation.range has ORIGINAL offsets, position has CURRENT/RECOVERED offsets
    const storeAnnotationsSimple = annotations
      .filter(ann => ann.components.Position && ann.components.Visual)
      .map(ann => ({
        id: ann.id,
        startOffset: ann.components.Position!.startOffset,
        endOffset: ann.components.Position!.endOffset,
        color: ann.components.Visual!.color,
      }))

    // Add optimistic annotations
    const optimisticArray: Array<{
      id: string
      startOffset: number
      endOffset: number
      color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
    }> = []

    optimisticAnnotations.forEach((annotation) => {
      // Skip deleted annotations (error rollback)
      if (annotation._deleted) return

      // Add optimistic annotation
      optimisticArray.push({
        id: annotation.id,
        startOffset: annotation.start_offset,
        endOffset: annotation.end_offset,
        color: annotation.color as 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink',
      })
    })

    // Merge: optimistic annotations override store ones with same offsets
    const merged = [...storeAnnotationsSimple]

    optimisticArray.forEach(optAnn => {
      // Check if this annotation already exists in store data
      const existingIndex = merged.findIndex(
        ann =>
          ann.startOffset === optAnn.startOffset &&
          ann.endOffset === optAnn.endOffset
      )

      if (existingIndex >= 0) {
        // Replace store annotation with optimistic (has real ID now)
        merged[existingIndex] = optAnn
      } else if (!optAnn.id.startsWith('temp-')) {
        // Real ID but not in store data yet - add it
        merged.push(optAnn)
      } else {
        // Temp ID - add it for immediate display
        merged.push(optAnn)
      }
    })

    return merged
  }, [annotations, optimisticAnnotations])

  // Convert to format expected by BlockRenderer
  const annotationsForBlocks = useMemo(() => {
    return allAnnotations
  }, [allAnnotations])

  // Track visible blocks and update ReaderStore scroll position
  const handleVisibleRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      if (blocks.length === 0 || !markdown) return

      // Get visible blocks
      const visibleBlocks = blocks.slice(range.startIndex, range.endIndex + 1)
      if (visibleBlocks.length === 0) return

      // Calculate viewport offsets from visible blocks
      const firstBlock = visibleBlocks[0]
      const lastBlock = visibleBlocks[visibleBlocks.length - 1]

      const viewportStart = firstBlock?.startOffset || 0
      const viewportEnd = lastBlock?.endOffset || markdown.length

      // Calculate scroll percentage
      const scrollPosition = markdown.length > 0
        ? (viewportStart / markdown.length) * 100
        : 0

      console.log('[VirtualizedReader] Visible range:', {
        blocks: `${range.startIndex}-${range.endIndex}`,
        offsets: `${viewportStart}-${viewportEnd}`,
        scrollPercent: scrollPosition.toFixed(1) + '%'
      })

      // Update ReaderStore (this triggers visibleChunks recalculation)
      updateScroll(scrollPosition, {
        start: viewportStart,
        end: viewportEnd
      })
    },
    [blocks, markdown, updateScroll]
  )

  // Handle optimistic annotation updates (for new annotations)
  const handleAnnotationCreated = useCallback((annotation: OptimisticAnnotation) => {
    // Clear browser selection immediately to prevent expansion after DOM injection
    // This fixes the issue where multi-chunk annotations cause selection to expand
    clearSelection()

    // First, update optimistic annotations state
    setOptimisticAnnotations((prev) => {
      const next = new Map(prev)

      // Handle deletion (error rollback)
      if (annotation._deleted) {
        next.delete(annotation.id)
        return next
      }

      // Add or update annotation
      next.set(annotation.id, annotation)

      // Clean up temp annotations when real ID arrives
      if (!annotation.id.startsWith('temp-')) {
        // Remove any temp annotations with matching offsets
        Array.from(next.entries()).forEach(([id, ann]) => {
          if (
            id.startsWith('temp-') &&
            ann.start_offset === annotation.start_offset &&
            ann.end_offset === annotation.end_offset
          ) {
            next.delete(id)
          }
        })
      }

      return next
    })

    // Then, separately update the Zustand store (must be outside setOptimisticAnnotations)
    // This prevents "Cannot update component while rendering" React error
    if (!annotation.id.startsWith('temp-') && documentId) {
      // Build annotation entity for store
      const storedAnnotation: AnnotationEntity = {
        id: annotation.id,
        user_id: '',
        created_at: annotation.created_at,
        updated_at: annotation.created_at,
        components: {
          Position: {
            documentId: annotation.document_id,
            document_id: annotation.document_id,
            startOffset: annotation.start_offset,
            endOffset: annotation.end_offset,
            originalText: annotation.text,
            textContext: annotation.text_context,
            recoveryConfidence: 1.0,
            recoveryMethod: 'exact',
            needsReview: false,
          },
          Visual: {
            type: 'highlight',
            color: annotation.color,
          },
          Content: {
            note: annotation.note,
            tags: annotation.tags || [],
          },
          Temporal: {
            createdAt: annotation.created_at,
            updatedAt: annotation.created_at,
          },
          ChunkRef: {
            chunkId: annotation.chunk_ids[0],
            chunk_id: annotation.chunk_ids[0],
            chunkIds: annotation.chunk_ids,
            chunkPosition: 0,
            documentId: annotation.document_id,
            document_id: annotation.document_id,
          },
        },
      }

      // Add to store (avoids duplicates via store logic)
      addAnnotation(documentId, storedAnnotation)
    }
  }, [documentId, addAnnotation, clearSelection])

  // Handle annotation updates (for editing existing annotations)
  const handleAnnotationUpdated = useCallback((annotation: AnnotationEntity) => {
    // Update the store
    if (!documentId) return
    updateStoreAnnotation(documentId, annotation.id, annotation)

    // Remove from optimistic annotations (if present) to prevent stale override
    setOptimisticAnnotations(prev => {
      const next = new Map(prev)
      next.delete(annotation.id)
      return next
    })
  }, [documentId, updateStoreAnnotation])

  // Handle annotation click to enter edit mode
  const handleAnnotationEdit = useCallback((annotationId: string, element: HTMLElement) => {
    // Check if this is an optimistic annotation (temp ID)
    if (annotationId.startsWith('temp-')) {
      toast.info('Annotation still saving', {
        description: 'Please wait a moment before editing',
        duration: 2000,
      })
      return
    }

    // Find annotation in store
    const annotation = annotations.find(a => a.id === annotationId)
    if (!annotation || !annotation.components.Position) {
      toast.error('Annotation not found', {
        description: 'This annotation may have been deleted',
        duration: 3000,
      })
      return
    }

    // Get rect from clicked element
    const rect = element.getBoundingClientRect()

    // Construct TextSelection from annotation data
    const textSelection: TextSelection = {
      text: annotation.components.Position.originalText,
      range: {
        startOffset: annotation.components.Position.startOffset,
        endOffset: annotation.components.Position.endOffset,
        chunkIds: annotation.components.ChunkRef?.chunkIds || [],
      },
      rect
    }

    // Set edit mode
    setEditingAnnotation(annotation)
    setCaptureSelection(textSelection)
  }, [annotations])

  // Guard: Wait for document to load
  if (!documentId || blocks.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">
          {!documentId ? 'Loading document...' : 'No content to display'}
        </p>
      </div>
    )
  }

  return (
    <>
      <Virtuoso
        ref={virtuosoRef}
        data={blocks}
        itemContent={(index, block) => {
          // Find the chunk for this block
          const chunk = chunks.find(c => c.id === block.chunkId)

          // Create a key that changes when annotations in this block change
          // This forces BlockRenderer to re-render when annotation colors/content change
          const blockAnnotations = annotationsForBlocks.filter(
            ann => ann.endOffset > block.startOffset && ann.startOffset < block.endOffset
          )
          const annotationKey = blockAnnotations
            .map(ann => `${ann.id}:${ann.color}`)
            .join(',')

          return (
            <div
              className="max-w-4xl mx-auto px-8 transition-all duration-300"
              data-chunk-id={block.chunkId}
              data-block-index={index}
            >
              <BlockRenderer
                key={`${block.startOffset}-${annotationKey}`}
                block={block}
                annotations={annotationsForBlocks}
                chunk={chunk}
                onAnnotationClick={handleAnnotationEdit}
              />
            </div>
          )
        }}
        rangeChanged={handleVisibleRangeChange}
        overscan={2000}
        style={{ height: '100%', width: '100%' }}
      />

      {/* QuickCapture panel appears when text is selected (but not in correction mode) */}
      {captureSelection && documentId && !correctionModeActive && (
        <QuickCapturePanel
          selection={captureSelection}
          documentId={documentId}
          onClose={() => {
            setCaptureSelection(null)
            setEditingAnnotation(null)
            clearSelection()
          }}
          onAnnotationCreated={handleAnnotationCreated}
          onAnnotationUpdated={handleAnnotationUpdated}
          existingAnnotation={editingAnnotation}
          mode={editingAnnotation ? 'edit' : 'create'}
          chunks={chunks}
          markdown={markdown}
        />
      )}

      {/* Debug panel to show annotations */}
      <AnnotationsDebugPanel annotations={annotations} />
    </>
  )
}
