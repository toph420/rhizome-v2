'use client'

import { ReactNode } from 'react'
import { AnnotationLayer } from './AnnotationLayer'
import type { StoredAnnotation } from '@/types/annotations'

interface ChunkWrapperProps {
  chunkId: string
  children: ReactNode
  annotations: StoredAnnotation[]
}

/**
 * Wraps markdown content with chunk identification and annotation overlays.
 * Provides data-chunk-id attribute for text selection capture.
 * 
 * @param props - Component props.
 * @param props.chunkId - Unique identifier for this content chunk.
 * @param props.children - Markdown content to wrap.
 * @param props.annotations - All document annotations (filtered internally).
 * @returns React element wrapping content with chunk metadata.
 */
export function ChunkWrapper({
  chunkId,
  children,
  annotations,
}: ChunkWrapperProps) {
  // Filter annotations for this specific chunk
  const chunkAnnotations = annotations.filter(
    (annotation) => annotation.components.source?.chunk_id === chunkId
  )

  return (
    <div
      data-chunk-id={chunkId}
      className="relative chunk-wrapper"
      style={{ position: 'relative' }}
    >
      {/* Render annotation highlights as overlay */}
      {chunkAnnotations.length > 0 && (
        <AnnotationLayer annotations={chunkAnnotations} chunkId={chunkId} />
      )}

      {/* Original markdown content */}
      {children}
    </div>
  )
}