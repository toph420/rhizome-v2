'use client'

import { memo, useRef, useEffect, useState, useMemo } from 'react'
import DOMPurify from 'dompurify'
import { injectAnnotations } from '@/lib/annotations/inject'
import { ChunkMetadataIcon } from './ChunkMetadataIcon'
import { useUIStore } from '@/stores/ui-store'
import { useReaderStore } from '@/stores/reader-store'
import type { Block } from '@/lib/reader/block-parser'
import type { Chunk } from '@/types/annotations'

interface BlockRendererProps {
  block: Block
  annotations: Array<{
    id: string
    startOffset: number
    endOffset: number
    color: string
  }>
  chunk?: Chunk
  onAnnotationClick?: (annotationId: string, element: HTMLElement) => void
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
  'a', 'span', 'div',  // span is critical for annotations
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img',
]

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'target', 'rel', 'class', 'id', 'style',
  'data-annotation-id',       // For click handlers
  'data-annotation-color',    // For CSS styling
  'data-annotation-start',    // For resize handles
  'data-annotation-end',      // For resize handles
]

export const BlockRenderer = memo(function BlockRenderer({
  block,
  annotations,
  chunk,
  onAnnotationClick
}: BlockRendererProps) {
  const showChunkBoundaries = useUIStore(state => state.showChunkBoundaries)
  const chunks = useReaderStore(state => state.chunks)
  const contentRef = useRef<HTMLDivElement>(null)
  const [chunkPositions, setChunkPositions] = useState<Map<string, number>>(new Map())

  // Find annotations that overlap this block
  const overlappingAnnotations = annotations.filter(
    (ann) =>
      ann.endOffset > block.startOffset &&
      ann.startOffset < block.endOffset
  )

  // BANDAID: Find all chunks that START within this block's offset range
  // This catches chunks 3, 4, 8, 9 that are split mid-paragraph by Docling
  // Memoized to prevent infinite re-renders in useEffect
  const chunksStartingInBlock = useMemo(
    () => chunks.filter(
      c => c.start_offset >= block.startOffset && c.start_offset < block.endOffset
    ),
    [chunks, block.startOffset, block.endOffset]
  )

  // Calculate accurate Y positions for chunks that start mid-block
  useEffect(() => {
    if (!contentRef.current || chunksStartingInBlock.length === 0) return

    const positions = new Map<string, number>()
    const contentEl = contentRef.current
    const blockTop = contentEl.getBoundingClientRect().top

    chunksStartingInBlock.forEach((chunkInBlock) => {
      const relativeOffset = chunkInBlock.start_offset - block.startOffset

      // Walk through text nodes to find position at offset
      let currentOffset = 0
      const walker = document.createTreeWalker(
        contentEl,
        NodeFilter.SHOW_TEXT,
        null
      )

      let node: Node | null
      while ((node = walker.nextNode())) {
        const textLength = node.textContent?.length || 0

        if (currentOffset + textLength >= relativeOffset) {
          // Found the text node containing our offset
          const range = document.createRange()
          const offsetInNode = Math.max(0, relativeOffset - currentOffset)

          try {
            range.setStart(node, Math.min(offsetInNode, textLength))
            range.setEnd(node, Math.min(offsetInNode + 1, textLength))
            const rect = range.getBoundingClientRect()
            const yPosition = rect.top - blockTop
            positions.set(chunkInBlock.id, yPosition)
          } catch (e) {
            // If range creation fails, fallback to default positioning
            console.warn('Failed to calculate chunk position:', e)
          }
          break
        }

        currentOffset += textLength
      }
    })

    setChunkPositions(positions)
  }, [chunksStartingInBlock, block.startOffset])

  // Inject annotations into HTML
  const annotatedHtml = injectAnnotations(
    block.html,
    block.startOffset,
    block.endOffset,
    overlappingAnnotations as any  // Type cast needed for color
  )

  // Sanitize (now allows span + data attributes)
  const cleanHtml = DOMPurify.sanitize(annotatedHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })

  // Prose classes for everything except code blocks
  const proseClass =
    block.type === 'code'
      ? 'not-prose'
      : 'prose prose-sm lg:prose-base dark:prose-invert max-w-none'

  // Handle annotation clicks via event delegation
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onAnnotationClick) return

    const target = e.target as HTMLElement
    const annotationSpan = target.closest('[data-annotation-id]')

    if (annotationSpan) {
      const annotationId = annotationSpan.getAttribute('data-annotation-id')
      if (annotationId) {
        onAnnotationClick(annotationId, annotationSpan as HTMLElement)
      }
    }
  }

  // Only show metadata icon for first paragraph block of each chunk (avoid duplication)
  const showMetadataIcon = block.type === 'paragraph' && chunk && block.chunkPosition >= 0

  return (
    <div
      data-block-id={block.id}
      data-chunk-id={block.chunkId}
      className={`${proseClass} py-2 min-h-[1rem] relative group`}
      onClick={handleClick}
    >
      {/* Chunk metadata icon in left margin - only show on first block of chunk */}
      {showMetadataIcon && block.chunkPosition === 0 && (
        <ChunkMetadataIcon
          chunk={chunk}
          chunkIndex={chunk.chunk_index}
          alwaysVisible={showChunkBoundaries}
        />
      )}

      {/* BANDAID: Show icons for chunks that START in this block (mid-paragraph splits) */}
      {chunksStartingInBlock.map((chunkInBlock) => {
        const calculatedPosition = chunkPositions.get(chunkInBlock.id)
        return (
          <ChunkMetadataIcon
            key={chunkInBlock.id}
            chunk={chunkInBlock}
            chunkIndex={chunkInBlock.chunk_index}
            alwaysVisible={showChunkBoundaries}
            style={
              calculatedPosition !== undefined
                ? { top: `${calculatedPosition}px` }
                : undefined // Fallback to default em-based positioning
            }
          />
        )
      })}

      {/* Rendered content with injected annotations */}
      <div
        ref={contentRef}
        data-start-offset={block.startOffset}
        data-end-offset={block.endOffset}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </div>
  )
})
