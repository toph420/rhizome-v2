import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ChunkStats {
  high: number
  medium: number
  low: number
  interpolated: number
  total: number
}

/**
 * Hook to fetch chunk quality statistics for a document.
 * Groups chunks by Chonkie metadata_confidence level.
 *
 * **Chonkie Integration (Migration 050)**:
 * - high: 3+ Docling overlaps OR >70% coverage
 * - medium: 1-2 overlaps with >30% coverage
 * - low: <30% overlap OR interpolated
 * - interpolated: No Docling overlaps (metadata_interpolated = true)
 *
 * @param documentId - Document identifier
 * @returns Chunk statistics or null if loading/error
 */
export function useChunkStats(documentId: string) {
  const [data, setData] = useState<ChunkStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        setIsLoading(true)
        const supabase = createClient()

        // Fetch chunks with Chonkie metadata confidence fields
        const { data: chunks, error } = await supabase
          .from('chunks')
          .select('metadata_confidence, metadata_interpolated')
          .eq('document_id', documentId)

        if (error) throw error

        // Aggregate by Chonkie confidence level
        const stats: ChunkStats = {
          high: 0,
          medium: 0,
          low: 0,
          interpolated: 0,
          total: chunks?.length || 0
        }

        chunks?.forEach(chunk => {
          const confidence = chunk.metadata_confidence as string | null
          const interpolated = chunk.metadata_interpolated as boolean | null

          // Skip chunks without confidence (old hybrid mode or cloud mode)
          if (!confidence) return

          // Count by Chonkie metadata confidence level
          if (confidence === 'high') stats.high++
          else if (confidence === 'medium') stats.medium++
          else if (confidence === 'low') stats.low++

          // Count interpolated chunks (no Docling overlaps)
          if (interpolated === true) stats.interpolated++
        })

        setData(stats)
      } catch (err) {
        console.error('[useChunkStats] Error fetching chunk stats:', err)
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [documentId])

  return { data, isLoading, error }
}
