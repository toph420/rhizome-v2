import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface SyntheticChunk {
  id: string
  chunk_index: number
  content: string
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  position_method: string | null
  position_validated: boolean
}

/**
 * Hook to fetch chunks with 'synthetic' confidence level.
 * These chunks need user validation as their positions were interpolated.
 *
 * @param documentId - Document identifier
 * @returns Array of synthetic chunks or null if loading/error
 */
export function useSyntheticChunks(documentId: string) {
  const [data, setData] = useState<SyntheticChunk[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchSyntheticChunks() {
      try {
        setIsLoading(true)
        const supabase = createClient()

        const { data: chunks, error } = await supabase
          .from('chunks')
          .select('id, chunk_index, content, page_start, page_end, section_marker, position_method, position_validated')
          .eq('document_id', documentId)
          .eq('position_confidence', 'synthetic')
          .order('chunk_index', { ascending: true })

        if (error) throw error

        setData(chunks as SyntheticChunk[])
      } catch (err) {
        console.error('[useSyntheticChunks] Error fetching synthetic chunks:', err)
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSyntheticChunks()
  }, [documentId])

  return { data, isLoading, error }
}
