'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { toast } from 'sonner'
import { parseMarkdownToBlocks } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import { QuickCapturePanel } from './QuickCapturePanel'
import { AnnotationsDebugPanel } from './AnnotationsDebugPanel'
import { useTextSelection } from '@/hooks/useTextSelection'
import { getAnnotations } from '@/app/actions/annotations'
import type { Chunk, StoredAnnotation, OptimisticAnnotation, TextSelection } from '@/types/annotations'

interface VirtualizedReaderProps {
  markdown: string
  chunks: Chunk[]
  documentId: string
  onVisibleChunksChange?: (chunkIds: string[]) => void
}

/**
 * Virtualized document reader with annotation support.
 * Handles progressive loading, text selection, and highlight injection.
 * @param props - Component props.
 * @param props.markdown - Markdown content to render.
 * @param props.chunks - Document chunks with offsets.
 * @param props.documentId - Document ID for annotation queries.
 * @param props.onVisibleChunksChange - Callback for visible chunk changes.
 * @returns React element with virtualized rendering.
 */
export function VirtualizedReader({
  markdown,
  chunks,
  documentId,
  onVisibleChunksChange,
}: VirtualizedReaderProps) {
  // Server annotations (source of truth from database)
  const [serverAnnotations, setServerAnnotations] = useState<StoredAnnotation[]>([])

  // Optimistic annotations (temporary, for instant UI updates)
  const [optimisticAnnotations, setOptimisticAnnotations] = useState<
    Map<string, OptimisticAnnotation>
  >(new Map())

  // Store the selection that opened the panel (snapshot, independent of live selection)
  // This prevents panel from closing when browser clears selection on click
  const [captureSelection, setCaptureSelection] = useState<TextSelection | null>(null)

  // Track annotation being edited (if any)
  const [editingAnnotation, setEditingAnnotation] = useState<StoredAnnotation | null>(null)

  // Text selection tracking for new annotations
  const { selection, clearSelection } = useTextSelection({
    chunks,
    enabled: true,
  })

  // When selection changes, capture it for the panel
  useEffect(() => {
    if (selection && !captureSelection) {
      setCaptureSelection(selection)
    }
  }, [selection, captureSelection])

  // Load annotations from database
  useEffect(() => {
    async function loadAnnotations() {
      try {
        const result = await getAnnotations(documentId)
        if (result.success) {
          setServerAnnotations(result.data)
        } else {
          console.error('[VirtualizedReader] Failed to load annotations:', result.error)
        }
      } catch (error) {
        console.error('[VirtualizedReader] Error loading annotations:', error)
      }
    }

    void loadAnnotations()
  }, [documentId])

  // Parse markdown into blocks (without annotations - injection happens in BlockRenderer)
  const blocks = useMemo(() => {
    return parseMarkdownToBlocks(markdown, chunks)
  }, [markdown, chunks])

  // Merge server annotations with optimistic ones
  const allAnnotations = useMemo(() => {
    // Start with server annotations converted to simple format
    // IMPORTANT: Read offsets from position component (has recovered offsets after reprocessing)
    // annotation.range has ORIGINAL offsets, position has CURRENT/RECOVERED offsets
    const serverAnnotationsSimple = serverAnnotations
      .filter(ann => ann.components.position && ann.components.annotation)
      .map(ann => ({
        id: ann.id,
        startOffset: ann.components.position!.startOffset,
        endOffset: ann.components.position!.endOffset,
        color: ann.components.annotation!.color,
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

    // Merge: optimistic annotations override server ones with same offsets
    const merged = [...serverAnnotationsSimple]

    optimisticArray.forEach(optAnn => {
      // Check if this annotation already exists in server data
      const existingIndex = merged.findIndex(
        ann =>
          ann.startOffset === optAnn.startOffset &&
          ann.endOffset === optAnn.endOffset
      )

      if (existingIndex >= 0) {
        // Replace server annotation with optimistic (has real ID now)
        merged[existingIndex] = optAnn
      } else if (!optAnn.id.startsWith('temp-')) {
        // Real ID but not in server data yet - add it
        merged.push(optAnn)
      } else {
        // Temp ID - add it for immediate display
        merged.push(optAnn)
      }
    })

    return merged
  }, [serverAnnotations, optimisticAnnotations])

  // Convert to format expected by BlockRenderer
  const annotationsForBlocks = useMemo(() => {
    return allAnnotations
  }, [allAnnotations])

  // Track visible chunk IDs
  const handleVisibleRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      if (!onVisibleChunksChange) return

      const visibleChunkIds = new Set<string>()
      for (let i = range.startIndex; i <= range.endIndex; i++) {
        const block = blocks[i]
        if (block) visibleChunkIds.add(block.chunkId)
      }

      const chunkIdArray = Array.from(visibleChunkIds)
      onVisibleChunksChange(chunkIdArray)
    },
    [blocks, onVisibleChunksChange]
  )

  // Handle optimistic annotation updates (for new annotations)
  const handleAnnotationCreated = useCallback((annotation: OptimisticAnnotation) => {
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

        // Add to serverAnnotations for permanent storage and editing
        setServerAnnotations((prevServer) => {
          // Convert OptimisticAnnotation to StoredAnnotation format
          const storedAnnotation: StoredAnnotation = {
            id: annotation.id,
            user_id: '',
            created_at: annotation.created_at,
            updated_at: annotation.created_at,
            components: {
              annotation: {
                text: annotation.text,
                note: annotation.note,
                tags: annotation.tags || [],
                color: annotation.color,
                range: {
                  startOffset: annotation.start_offset,
                  endOffset: annotation.end_offset,
                  chunkIds: annotation.chunk_ids,
                },
                textContext: annotation.text_context,
              },
              position: undefined,
              source: undefined,
            },
          }

          // Check if already exists (avoid duplicates)
          const exists = prevServer.some(a => a.id === annotation.id)
          if (exists) return prevServer

          return [...prevServer, storedAnnotation]
        })
      }

      return next
    })
  }, [])

  // Handle annotation updates (for editing existing annotations)
  const handleAnnotationUpdated = useCallback((annotation: StoredAnnotation) => {
    setServerAnnotations(prev => prev.map(ann =>
      ann.id === annotation.id ? annotation : ann
    ))
  }, [])

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

    // Find annotation in serverAnnotations
    const annotation = serverAnnotations.find(a => a.id === annotationId)
    if (!annotation || !annotation.components.annotation) {
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
      text: annotation.components.annotation.text,
      range: annotation.components.annotation.range,
      rect
    }

    // Set edit mode
    setEditingAnnotation(annotation)
    setCaptureSelection(textSelection)
  }, [serverAnnotations])

  if (blocks.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">No content to display</p>
      </div>
    )
  }

  return (
    <>
      <Virtuoso
        data={blocks}
        itemContent={(index, block) => (
          <div className="max-w-4xl mx-auto px-8">
            <BlockRenderer
              block={block}
              annotations={annotationsForBlocks}
              onAnnotationClick={handleAnnotationEdit}
            />
          </div>
        )}
        rangeChanged={handleVisibleRangeChange}
        overscan={2000}
        style={{ height: '100%', width: '100%' }}
      />

      {/* QuickCapture panel appears when text is selected */}
      {captureSelection && (
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
        />
      )}

      {/* Debug panel to show annotations */}
      <AnnotationsDebugPanel annotations={serverAnnotations} />
    </>
  )
}
