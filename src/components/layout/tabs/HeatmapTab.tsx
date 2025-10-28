'use client'

import { useMemo } from 'react'
import { useConnectionStore } from '@/stores/connection-store'
import type { Chunk } from '@/types/annotations'

interface HeatmapTabProps {
  documentId: string
  currentPage?: number
  chunks: Chunk[]
}

export function HeatmapTab({ documentId, currentPage, chunks }: HeatmapTabProps) {
  const connections = useConnectionStore(state => state.filteredConnections)

  // Calculate density by page
  const pageDensity = useMemo(() => {
    const densityMap = new Map<number, number>()

    chunks.forEach(chunk => {
      if (!chunk.page_start || !chunk.page_end) return

      // Count connections for this chunk
      const chunkConnections = connections.filter(conn =>
        conn.source_chunk_id === chunk.id || conn.target_chunk_id === chunk.id
      )

      // Distribute density across pages
      for (let page = chunk.page_start; page <= chunk.page_end; page++) {
        const current = densityMap.get(page) || 0
        densityMap.set(page, current + chunkConnections.length)
      }
    })

    return densityMap
  }, [chunks, connections])

  if (pageDensity.size === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">
          No connections detected yet.
        </p>
      </div>
    )
  }

  const maxDensity = Math.max(...Array.from(pageDensity.values()))

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold mb-3">Connection Density by Page</h3>
      <div className="space-y-1">
        {Array.from(pageDensity.entries())
          .sort(([a], [b]) => a - b)
          .map(([page, density]) => {
            const percentage = (density / maxDensity) * 100
            const isCurrentPage = page === currentPage

            return (
              <div
                key={page}
                className={`flex items-center gap-2 p-2 rounded transition-colors ${
                  isCurrentPage ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-muted'
                }`}
              >
                <span className="text-xs font-mono w-12">
                  Page {page}
                </span>
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {density}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
