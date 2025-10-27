'use client'

import { useMemo, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import type { Chunk } from '@/types/annotations'

interface ConnectionHeatmapProps {
  documentId: string
  chunks: Chunk[]
  className?: string
}

interface DensityPoint {
  density: number
  chunkIds: string[]
  position: number
  count: number
}

/**
 * Visual connection density indicator in the left margin.
 * Shows where connections cluster across the ENTIRE DOCUMENT using heatmap visualization.
 * Click density points to jump to that region.
 *
 * IMPORTANT: Uses ALL connections in the document, not just visible chunks.
 * This gives users a bird's-eye view of connection density across the entire document.
 *
 * @param props - Component props
 * @param props.documentId - Document ID to fetch all connections
 * @param props.chunks - Document chunks for position mapping
 * @param props.className - Optional additional CSS classes
 * @returns Full-height heatmap visualization component
 */
export function ConnectionHeatmap({ documentId, chunks, className = '' }: ConnectionHeatmapProps) {
  const [allConnections, setAllConnections] = useState<Array<{
    source_chunk_id: string
    strength: number
  }>>([])

  // Fetch ALL connections for this document (not just visible chunks)
  useEffect(() => {
    async function fetchAllConnections() {
      const supabase = createClient()

      // Get all chunk IDs for this document
      const chunkIds = chunks.map(c => c.id)
      if (chunkIds.length === 0) return

      // Batch queries to avoid URL length limits (max 50 chunks per query)
      const BATCH_SIZE = 50
      const allData = []

      for (let i = 0; i < chunkIds.length; i += BATCH_SIZE) {
        const batch = chunkIds.slice(i, i + BATCH_SIZE)

        const { data, error } = await supabase
          .from('connections')
          .select('source_chunk_id, strength')
          .in('source_chunk_id', batch)

        if (!error && data) {
          allData.push(...data)
        }
      }

      setAllConnections(allData)
    }

    fetchAllConnections()
  }, [documentId, chunks])

  // Calculate density per 5% of document (20 points) using ALL connections
  const densityPoints = useMemo<DensityPoint[]>(() => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      density: 0,
      chunkIds: [] as string[],
      position: (i / 20) * 100,
      count: 0
    }))

    const totalChunks = chunks.length
    if (totalChunks === 0 || allConnections.length === 0) return points

    allConnections.forEach(conn => {
      const chunk = chunks.find(c => c.id === conn.source_chunk_id)
      if (!chunk) return

      const position = chunk.chunk_index / totalChunks
      const pointIndex = Math.min(Math.floor(position * 20), 19)

      points[pointIndex].density += conn.strength
      points[pointIndex].count += 1
      if (!points[pointIndex].chunkIds.includes(chunk.id)) {
        points[pointIndex].chunkIds.push(chunk.id)
      }
    })

    // Normalize to 0-1 range
    const maxDensity = Math.max(...points.map(p => p.density), 1)
    return points.map(p => ({ ...p, density: p.density / maxDensity }))
  }, [chunks, allConnections])

  /**
   * Scroll to chunk when density point is clicked
   */
  function handleHeatmapClick(point: DensityPoint) {
    if (point.chunkIds.length === 0) return

    // Scroll to first chunk in this region
    const chunkElement = document.querySelector(`[data-chunk-id="${point.chunkIds[0]}"]`)
    if (chunkElement) {
      chunkElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Highlight temporarily with left border indicator
      const indicator = document.createElement('div')
      indicator.className = 'absolute left-[-20px] top-0 bottom-0 w-[5px] bg-primary rounded-full transition-opacity duration-300'
      indicator.setAttribute('data-chunk-indicator', 'true')
      chunkElement.appendChild(indicator)

      setTimeout(() => {
        indicator.remove()
      }, 2000)
    }
  }

  return (
    <div className={`fixed left-4 top-20 bottom-20 w-3 z-20 ${className}`}>
      <div className="relative h-full bg-gray-100 dark:bg-gray-800 rounded-sm overflow-hidden shadow-sm">
        {densityPoints.map((point, i) => {
          const hasConnections = point.count > 0
          const intensityColor = hasConnections
            ? `rgba(59, 130, 246, ${0.3 + point.density * 0.7})` // 30% min, 100% max
            : 'rgba(156, 163, 175, 0.2)' // Gray for empty regions

          return (
            <motion.button
              key={i}
              className="absolute w-full transition-all group"
              style={{
                top: `${point.position}%`,
                height: '5%',
                backgroundColor: intensityColor,
                cursor: hasConnections ? 'pointer' : 'default'
              }}
              onClick={() => hasConnections && handleHeatmapClick(point)}
              whileHover={hasConnections ? { scale: 1.3, x: -2 } : {}}
              whileTap={hasConnections ? { scale: 0.95 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              {/* Hover tooltip */}
              {hasConnections && (
                <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-md text-xs whitespace-nowrap border">
                    <div className="font-medium">{point.count} connection{point.count > 1 ? 's' : ''}</div>
                    <div className="text-muted-foreground">
                      {point.chunkIds.length} chunk{point.chunkIds.length > 1 ? 's' : ''}
                    </div>
                    <div className="text-muted-foreground mt-1">
                      Density: {Math.round(point.density * 100)}%
                    </div>
                  </div>
                </div>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
