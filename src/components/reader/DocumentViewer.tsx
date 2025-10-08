'use client'

import { VirtualizedReader } from './VirtualizedReader'
import { KeyboardHelp } from './KeyboardHelp'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

interface DocumentViewerProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
}

/**
 * Document viewer component wrapper.
 * Now simplified - document loading is handled by ReaderLayout → ReaderStore.
 * VirtualizedReader gets content from ReaderStore (no props needed).
 *
 * This component mainly exists to:
 * 1. Provide a stable container for VirtualizedReader
 * 2. Include KeyboardHelp overlay
 *
 * @param props - Component props (kept for compatibility, not used).
 * @returns React element with document viewer.
 */
export function DocumentViewer({
  documentId,
  markdownUrl,
  chunks,
  annotations,
}: DocumentViewerProps) {
  return (
    <div className="h-full">
      <VirtualizedReader />
      <KeyboardHelp />
    </div>
  )
}
