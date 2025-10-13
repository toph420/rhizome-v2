import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ChunkStats {
  exact: number
  high: number
  medium: number
  synthetic: number
  overlapCorrected: number
  total: number
}

/**
 * Hook to fetch chunk quality statistics for a document.
 * Groups chunks by position_confidence level.
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

        // Fetch chunks with confidence levels and overlap_corrected flag
        const { data: chunks, error } = await supabase
          .from('chunks')
          .select('position_confidence, overlap_corrected')
          .eq('document_id', documentId)

        if (error) throw error

        // Aggregate by confidence level and overlap correction
        const stats: ChunkStats = {
          exact: 0,
          high: 0,
          medium: 0,
          synthetic: 0,
          overlapCorrected: 0,
          total: chunks?.length || 0
        }

        chunks?.forEach(chunk => {
          const confidence = chunk.position_confidence as string | null
          const overlapCorrected = chunk.overlap_corrected as boolean | null

          // Skip chunks without confidence (cloud mode)
          if (!confidence) return

          // Count by confidence level
          if (confidence === 'exact') stats.exact++
          else if (confidence === 'high') stats.high++
          else if (confidence === 'medium') stats.medium++
          else if (confidence === 'synthetic') stats.synthetic++

          // Count overlap-corrected chunks
          if (overlapCorrected === true) stats.overlapCorrected++
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
