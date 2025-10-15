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
  // Chonkie Integration (Migration 050)
  metadata_confidence: string | null
  metadata_interpolated: boolean | null
  metadata_overlap_count: number | null
}

export interface CategorizedUnvalidatedChunks {
  interpolated: UnvalidatedChunk[]
  lowConfidence: UnvalidatedChunk[]
  mediumConfidence: UnvalidatedChunk[]
  all: UnvalidatedChunk[]
}

/**
 * Hook to fetch all unvalidated chunks for a document, categorized by Chonkie metadata confidence.
 *
 * **Chonkie Integration (Migration 050)**:
 * Categories now map to Chonkie metadata transfer quality:
 * - interpolated: No Docling overlaps (metadata_interpolated = true)
 * - lowConfidence: Weak overlaps <30% coverage (metadata_confidence = 'low')
 * - mediumConfidence: Decent overlaps 30-70% coverage (metadata_confidence = 'medium')
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
        // Include both old fields (backward compat) and new Chonkie fields
        const { data: chunks, error } = await supabase
          .from('chunks')
          .select(
            'id, chunk_index, content, start_offset, end_offset, page_start, page_end, section_marker, position_method, position_confidence, position_validated, validation_warning, validation_details, overlap_corrected, position_corrected, correction_history, metadata_confidence, metadata_interpolated, metadata_overlap_count'
          )
          .eq('document_id', documentId)
          .eq('position_validated', false)
          .order('chunk_index', { ascending: true })

        if (error) throw error

        // Categorize chunks by Chonkie metadata confidence
        const categorized: CategorizedUnvalidatedChunks = {
          interpolated: [],
          lowConfidence: [],
          mediumConfidence: [],
          all: (chunks as UnvalidatedChunk[]) || []
        }

        chunks?.forEach((chunk) => {
          const typedChunk = chunk as UnvalidatedChunk

          // Prioritize Chonkie fields if available, fallback to old fields
          const metadataConfidence = typedChunk.metadata_confidence
          const metadataInterpolated = typedChunk.metadata_interpolated

          if (metadataConfidence) {
            // NEW: Chonkie metadata confidence system
            if (metadataInterpolated === true) {
              categorized.interpolated.push(typedChunk)
            }

            if (metadataConfidence === 'low') {
              categorized.lowConfidence.push(typedChunk)
            }

            if (metadataConfidence === 'medium') {
              categorized.mediumConfidence.push(typedChunk)
            }
          } else {
            // OLD: Fallback to bulletproof matcher fields for backward compatibility
            if (typedChunk.position_confidence === 'synthetic') {
              categorized.interpolated.push(typedChunk)
            }

            if (typedChunk.overlap_corrected || typedChunk.position_confidence === 'low') {
              categorized.lowConfidence.push(typedChunk)
            }

            if (typedChunk.position_confidence === 'medium') {
              categorized.mediumConfidence.push(typedChunk)
            }
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
