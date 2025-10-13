'use client'

import { memo } from 'react'
import DOMPurify from 'dompurify'
import { injectAnnotations } from '@/lib/annotations/inject'
import { ChunkMetadataIcon } from './ChunkMetadataIcon'
import { useUIStore } from '@/stores/ui-store'
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

  // Find annotations that overlap this block
  const overlappingAnnotations = annotations.filter(
    (ann) =>
      ann.endOffset > block.startOffset &&
      ann.startOffset < block.endOffset
  )

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

  // Show chunk boundary indicator on first block of each chunk
  const isChunkStart = chunk && block.chunkPosition === 0

  // Debug: Log chunk boundary detection
  if (isChunkStart && showChunkBoundaries) {
    console.log('[BlockRenderer] Chunk boundary detected:', {
      chunkIndex: chunk.chunk_index,
      blockType: block.type,
      chunkPosition: block.chunkPosition,
      showChunkBoundaries,
      isChunkStart
    })
  }

  // Generate color for chunk boundary (cycle through colors)
  const getChunkColor = (chunkIndex: number) => {
    const colors = [
      'rgb(59, 130, 246)',   // blue
      'rgb(168, 85, 247)',   // purple
      'rgb(236, 72, 153)',   // pink
      'rgb(34, 197, 94)',    // green
      'rgb(251, 146, 60)',   // orange
      'rgb(14, 165, 233)',   // sky
    ]
    return colors[chunkIndex % colors.length]
  }

  return (
    <div
      data-block-id={block.id}
      data-chunk-id={block.chunkId}
      data-start-offset={block.startOffset}
      data-end-offset={block.endOffset}
      className={`${proseClass} py-2 min-h-[1rem] relative group`}
      onClick={handleClick}
      style={{
        borderLeft: showChunkBoundaries && isChunkStart && chunk
          ? `4px solid ${getChunkColor(chunk.chunk_index)}`
          : undefined,
        paddingLeft: showChunkBoundaries && isChunkStart ? '0.75rem' : undefined
      }}
    >
      {/* Chunk metadata icon in left margin - only show on first block of chunk */}
      {showMetadataIcon && block.chunkPosition === 0 && (
        <ChunkMetadataIcon
          chunk={chunk}
          chunkIndex={chunk.chunk_index}
          alwaysVisible={showChunkBoundaries}
        />
      )}

      {/* Chunk boundary label - shows when boundaries are enabled */}
      {showChunkBoundaries && isChunkStart && chunk && (
        <div className="absolute -left-2 -top-6 flex items-center gap-2">
          <div
            className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-sm shadow-sm border"
            style={{
              backgroundColor: `${getChunkColor(chunk.chunk_index)}15`,
              borderColor: getChunkColor(chunk.chunk_index),
              color: getChunkColor(chunk.chunk_index)
            }}
          >
            Chunk {chunk.chunk_index}
          </div>
        </div>
      )}

      {/* Rendered content with injected annotations */}
      <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
    </div>
  )
})
