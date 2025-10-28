'use client'

import { useMemo, useState } from 'react'
import type { Chunk } from '@/types/annotations'

interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
}

interface PDFChunkOverlayProps {
  chunks: Chunk[]
  pageNumber: number
  scale: number
  highlightedChunkId?: string | null
  connections: Connection[]  // 🆕 ADD: Connections for visual indicators
  onChunkClick?: (chunkId: string) => void
}

interface BBox {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export function PDFChunkOverlay({
  chunks,
  pageNumber,
  scale,
  highlightedChunkId,
  connections,  // 🆕 ADD
  onChunkClick,
}: PDFChunkOverlayProps) {
  const [hoveredChunkId, setHoveredChunkId] = useState<string | null>(null)

  // Filter chunks for this page
  const pageChunks = useMemo(() => {
    return chunks.filter(chunk => {
      // Check if chunk overlaps this page
      if (chunk.page_start && chunk.page_end) {
        return pageNumber >= chunk.page_start && pageNumber <= chunk.page_end
      }
      return false
    })
  }, [chunks, pageNumber])

  // 🆕 ADD: Calculate connection counts per chunk
  const chunkConnectionCounts = useMemo(() => {
    const counts = new Map<string, number>()

    connections.forEach(conn => {
      const sourceCount = counts.get(conn.source_chunk_id) || 0
      const targetCount = counts.get(conn.target_chunk_id) || 0

      counts.set(conn.source_chunk_id, sourceCount + 1)
      counts.set(conn.target_chunk_id, targetCount + 1)
    })

    return counts
  }, [connections])

  if (pageChunks.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageChunks.map(chunk => {
        const isHighlighted = chunk.id === highlightedChunkId
        const isHovered = chunk.id === hoveredChunkId
        const connectionCount = chunkConnectionCounts.get(chunk.id) || 0
        const hasConnections = connectionCount > 0

        // Parse bboxes from JSONB
        const bboxes: BBox[] = chunk.bboxes ? (Array.isArray(chunk.bboxes) ? chunk.bboxes : []) : []

        // Filter bboxes for this page
        const pageBboxes = bboxes.filter(bbox => bbox.page === pageNumber)

        if (pageBboxes.length === 0) {
          // Fallback: whole-page indicator if no precise bboxes
          return (
            <div
              key={chunk.id}
              className="absolute top-0 left-0 right-0 h-1 pointer-events-auto cursor-pointer transition-all"
              style={{
                backgroundColor: hasConnections
                  ? 'rgba(59, 130, 246, 0.6)'  // Blue if has connections
                  : isHighlighted || isHovered
                  ? 'rgba(59, 130, 246, 0.5)'
                  : 'rgba(156, 163, 175, 0.2)',
              }}
              onMouseEnter={() => setHoveredChunkId(chunk.id)}
              onMouseLeave={() => setHoveredChunkId(null)}
              onClick={() => onChunkClick?.(chunk.id)}
              title={`Chunk ${chunk.chunk_index}${hasConnections ? ` (${connectionCount} connections)` : ''}`}
            />
          )
        }

        // Render precise bboxes with connection indicators
        return pageBboxes.map((bbox, idx) => {
          const x = bbox.x * scale
          const y = bbox.y * scale
          const width = bbox.width * scale
          const height = bbox.height * scale

          return (
            <div key={`${chunk.id}-${idx}`} className="absolute">
              {/* Chunk boundary */}
              <div
                data-chunk-id={chunk.id}
                className="pointer-events-auto cursor-pointer transition-all"
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  border: isHighlighted
                    ? '3px solid rgba(59, 130, 246, 0.8)'
                    : hasConnections
                    ? '2px solid rgba(59, 130, 246, 0.5)'  // 🆕 Thicker border if has connections
                    : isHovered
                    ? '2px solid rgba(156, 163, 175, 0.5)'
                    : '1px solid rgba(156, 163, 175, 0.3)',
                  backgroundColor: isHighlighted || isHovered
                    ? 'rgba(59, 130, 246, 0.1)'
                    : hasConnections
                    ? 'rgba(59, 130, 246, 0.05)'  // 🆕 Subtle blue tint
                    : 'transparent',
                  borderRadius: '2px',
                }}
                onMouseEnter={() => setHoveredChunkId(chunk.id)}
                onMouseLeave={() => setHoveredChunkId(null)}
                onClick={() => onChunkClick?.(chunk.id)}
                title={`Chunk ${chunk.chunk_index}${hasConnections ? ` (${connectionCount} connections)` : ''}${chunk.summary ? `\n${chunk.summary.substring(0, 80)}...` : ''}`}
              />

              {/* 🆕 ADD: Connection count badge (top-right corner) */}
              {hasConnections && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${x + width - 20}px`,
                    top: `${y - 10}px`,
                  }}
                >
                  <div className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-md">
                    {connectionCount}
                  </div>
                </div>
              )}
            </div>
          )
        })
      })}
    </div>
  )
}
