import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface ChunkStats {
  exact: number
  high: number
  medium: number
  synthetic: number
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

        // Fetch chunks with confidence levels
        const { data: chunks, error } = await supabase
          .from('chunks')
          .select('position_confidence')
          .eq('document_id', documentId)

        if (error) throw error

        // Aggregate by confidence level
        const stats: ChunkStats = {
          exact: 0,
          high: 0,
          medium: 0,
          synthetic: 0,
          total: chunks?.length || 0
        }

        chunks?.forEach(chunk => {
          const confidence = chunk.position_confidence as string | null
          if (!confidence) return // Skip chunks without confidence (cloud mode)

          if (confidence === 'exact') stats.exact++
          else if (confidence === 'high') stats.high++
          else if (confidence === 'medium') stats.medium++
          else if (confidence === 'synthetic') stats.synthetic++
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
