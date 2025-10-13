import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UnvalidatedChunk {
  id: string
  chunk_index: number
  content: string
  start_offset: number
  end_offset: number
  page_start: number | null
  page_end: number | null
  section_marker: string | null
  position_method: string | null
  position_confidence: string | null
  position_validated: boolean
  validation_warning: string | null
  validation_details: any | null
  overlap_corrected: boolean
  position_corrected: boolean
  correction_history: any[]
}

export interface CategorizedUnvalidatedChunks {
  synthetic: UnvalidatedChunk[]
  overlapCorrected: UnvalidatedChunk[]
  lowSimilarity: UnvalidatedChunk[]
  all: UnvalidatedChunk[]
}

/**
 * Hook to fetch all unvalidated chunks for a document, categorized by warning type.
 * Replaces useSyntheticChunks to provide comprehensive validation coverage.
 *
 * Categories:
 * - synthetic: Chunks positioned via Layer 4 interpolation (position_confidence = 'synthetic')
 * - overlapCorrected: Chunks with offsets adjusted due to overlap (overlap_corrected = true)
 * - lowSimilarity: Chunks with medium confidence (position_confidence = 'medium')
 * - all: All unvalidated chunks combined
 *
 * @param documentId - Document identifier
 * @returns Categorized unvalidated chunks or null if loading/error
 */
export function useUnvalidatedChunks(documentId: string) {
  const [data, setData] = useState<CategorizedUnvalidatedChunks | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    async function fetchUnvalidatedChunks() {
      try {
        setIsLoading(true)
        const supabase = createClient()

        // Query all chunks where position_validated = false
        const { data: chunks, error } = await supabase
          .from('chunks')
          .select(
            'id, chunk_index, content, start_offset, end_offset, page_start, page_end, section_marker, position_method, position_confidence, position_validated, validation_warning, validation_details, overlap_corrected, position_corrected, correction_history'
          )
          .eq('document_id', documentId)
          .eq('position_validated', false)
          .order('chunk_index', { ascending: true })

        if (error) throw error

        // Categorize chunks by warning type
        const categorized: CategorizedUnvalidatedChunks = {
          synthetic: [],
          overlapCorrected: [],
          lowSimilarity: [],
          all: (chunks as UnvalidatedChunk[]) || []
        }

        chunks?.forEach((chunk) => {
          const typedChunk = chunk as UnvalidatedChunk

          // Categorize by position_confidence and overlap_corrected
          if (typedChunk.position_confidence === 'synthetic') {
            categorized.synthetic.push(typedChunk)
          }

          if (typedChunk.overlap_corrected) {
            categorized.overlapCorrected.push(typedChunk)
          }

          if (typedChunk.position_confidence === 'medium') {
            categorized.lowSimilarity.push(typedChunk)
          }
        })

        setData(categorized)
      } catch (err) {
        console.error('[useUnvalidatedChunks] Error fetching unvalidated chunks:', err)
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUnvalidatedChunks()
  }, [documentId])

  return { data, isLoading, error }
}
