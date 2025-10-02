'use client'

import { useState } from 'react'
import { DocumentViewer } from './DocumentViewer'
import { RightPanel } from '../sidebar/RightPanel'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

interface ReaderLayoutProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
}

/**
 * Client-side layout component that lifts visibleChunkIds state
 * from DocumentViewer to RightPanel for connection surfacing.
 *
 * **State Flow**:
 * 1. VirtualizedReader tracks visible chunks in viewport
 * 2. Calls onVisibleChunksChange callback with chunk IDs
 * 3. DocumentViewer passes callback up to this component
 * 4. ReaderLayout stores visibleChunkIds in state
 * 5. RightPanel receives visibleChunkIds as prop
 * 6. ConnectionsList uses debounced chunkIds to fetch connections
 *
 * This enables connection surfacing for currently visible chunks.
 */
export function ReaderLayout({
  documentId,
  markdownUrl,
  chunks,
  annotations,
}: ReaderLayoutProps) {
  const [visibleChunkIds, setVisibleChunkIds] = useState<string[]>([])

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-hidden">
        <DocumentViewer
          documentId={documentId}
          markdownUrl={markdownUrl}
          chunks={chunks}
          annotations={annotations}
          onVisibleChunksChange={setVisibleChunkIds}
        />
      </div>

      {/* Right panel with connections and annotations */}
      <RightPanel documentId={documentId} visibleChunkIds={visibleChunkIds} />
    </div>
  )
}
