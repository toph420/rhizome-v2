'use client'

import { useEffect, useState } from 'react'

import type { Chunk } from '@/types/annotations'

interface MetadataTabProps {
  documentId: string
  pdfMetadata?: any
  chunks?: Chunk[]
}

export function MetadataTab({ documentId, pdfMetadata, chunks = [] }: MetadataTabProps) {
  const [rhizomeStats, setRhizomeStats] = useState<any>(null)

  useEffect(() => {
    // Fetch Rhizome-specific stats from database
    async function loadStats() {
      try {
        // Will implement in Phase 3 - fetch chunk count, connection count, etc.
        console.log('[MetadataTab] Loading Rhizome stats for', documentId)
      } catch (error) {
        console.error('[MetadataTab] Failed to load stats:', error)
      }
    }
    loadStats()
  }, [documentId])

  return (
    <div className="p-4 space-y-6">
      {/* PDF Metadata */}
      <div>
        <h3 className="text-sm font-semibold mb-3">PDF Information</h3>
        <div className="space-y-2 text-sm">
          {pdfMetadata?.title && (
            <div>
              <span className="text-muted-foreground">Title:</span>
              <p className="mt-1">{pdfMetadata.title}</p>
            </div>
          )}
          {pdfMetadata?.author && (
            <div>
              <span className="text-muted-foreground">Author:</span>
              <p className="mt-1">{pdfMetadata.author}</p>
            </div>
          )}
          {pdfMetadata?.creator && (
            <div>
              <span className="text-muted-foreground">Creator:</span>
              <p className="mt-1">{pdfMetadata.creator}</p>
            </div>
          )}
          {pdfMetadata?.pageCount && (
            <div>
              <span className="text-muted-foreground">Pages:</span>
              <p className="mt-1">{pdfMetadata.pageCount}</p>
            </div>
          )}
          {!pdfMetadata && (
            <p className="text-muted-foreground text-xs">
              PDF metadata will appear here once loaded.
            </p>
          )}
        </div>
      </div>

      {/* Rhizome Stats */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Rhizome Statistics</h3>
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Chunks:</span>
            <p className="mt-1">{chunks.length}</p>
          </div>
          {chunks.length > 0 && (
            <>
              <div>
                <span className="text-muted-foreground">Chunks with bboxes:</span>
                <p className="mt-1">
                  {chunks.filter(c => c.bboxes && c.bboxes.length > 0).length}
                  <span className="text-muted-foreground text-xs ml-1">
                    ({Math.round((chunks.filter(c => c.bboxes && c.bboxes.length > 0).length / chunks.length) * 100)}%)
                  </span>
                </p>
              </div>
              {chunks[0]?.chunker_type && (
                <div>
                  <span className="text-muted-foreground">Chunker type:</span>
                  <p className="mt-1 capitalize">{chunks[0].chunker_type}</p>
                </div>
              )}
            </>
          )}
          {chunks.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No chunks available for this document.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
