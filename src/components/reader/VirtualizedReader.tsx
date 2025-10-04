'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { parseMarkdownToBlocks } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import { QuickCapturePanel } from './QuickCapturePanel'
import { AnnotationsDebugPanel } from './AnnotationsDebugPanel'
import { useTextSelection } from '@/hooks/useTextSelection'
import { getAnnotations } from '@/app/actions/annotations'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

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
  // State for annotations (progressive loading)
  const [annotations, setAnnotations] = useState<StoredAnnotation[]>([])

  // Text selection tracking for new annotations
  const { selection, clearSelection } = useTextSelection({
    chunks,
    enabled: true,
  })

  // Load annotations from database
  useEffect(() => {
    async function loadAnnotations() {
      try {
        const result = await getAnnotations(documentId)
        if (result.success) {
          setAnnotations(result.data)
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
    console.time('parse-blocks')
    const parsed = parseMarkdownToBlocks(markdown, chunks)
    console.timeEnd('parse-blocks')
    return parsed
  }, [markdown, chunks])

  // Convert annotations for BlockRenderer
  const annotationsForBlocks = useMemo(() => {
    return annotations
      .filter(ann => ann.components.annotation)
      .map(ann => ({
        id: ann.id,
        startOffset: ann.components.annotation!.range.startOffset,
        endOffset: ann.components.annotation!.range.endOffset,
        color: ann.components.annotation!.color,
      }))
  }, [annotations])

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
      console.log('[VirtualizedReader] Visible chunks changed:', chunkIdArray)
      onVisibleChunksChange(chunkIdArray)
    },
    [blocks, onVisibleChunksChange]
  )

  // Handle annotation refresh after creation
  const handleAnnotationCreated = useCallback(async () => {
    try {
      const result = await getAnnotations(documentId)
      if (result.success) {
        console.log(`✅ Loaded ${result.data.length} annotations`)
        setAnnotations(result.data)
      } else {
        console.error('[VirtualizedReader] Failed to refresh annotations:', result.error)
      }
    } catch (error) {
      console.error('[VirtualizedReader] Error refreshing annotations:', error)
    }
  }, [documentId])

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
            <BlockRenderer block={block} annotations={annotationsForBlocks} />
          </div>
        )}
        rangeChanged={handleVisibleRangeChange}
        overscan={2000}
        style={{ height: '100%', width: '100%' }}
      />

      {/* QuickCapture panel appears when text is selected */}
      {selection && (
        <QuickCapturePanel
          selection={selection}
          documentId={documentId}
          onClose={async () => {
            clearSelection()
            await handleAnnotationCreated()
          }}
          chunks={chunks}
        />
      )}

      {/* Debug panel to show annotations */}
      <AnnotationsDebugPanel annotations={annotations} />
    </>
  )
}
