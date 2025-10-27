import type { SupabaseClient } from '@supabase/supabase-js'

interface EnrichOptions {
  documentId: string
  chunkIds?: string[]  // Optional: for per-chunk enrichment
  onProgress?: (percent: number, stage: string, details?: string) => void
}

export class ChunkEnrichmentManager {
  constructor(
    private supabase: SupabaseClient,
    private jobId?: string
  ) {}

  /**
   * Enrich chunks with metadata using bulletproof extraction.
   */
  async enrichChunks(options: EnrichOptions): Promise<void> {
    const { documentId, chunkIds, onProgress } = options

    console.log(`[EnrichChunks] Starting for document ${documentId}`)
    if (chunkIds) {
      console.log(`[EnrichChunks] Per-chunk mode: ${chunkIds.length} chunks`)
    } else {
      console.log(`[EnrichChunks] Document-level mode: all chunks`)
    }

    // Get chunks to enrich
    const chunksToEnrich = chunkIds || await this.getAllChunkIds(documentId)

    // Fetch chunk content
    const { data: chunks, error: fetchError } = await this.supabase
      .from('chunks')
      .select('id, chunk_index, content')
      .in('id', chunksToEnrich)
      .order('chunk_index')

    if (fetchError || !chunks) {
      throw new Error(`Failed to fetch chunks: ${fetchError?.message}`)
    }

    console.log(`[EnrichChunks] Fetched ${chunks.length} chunks`)

    // Import bulletproof extraction
    const { bulletproofExtractMetadata } = await import('../chunking/bulletproof-metadata.js')

    // Prepare batch input
    const batchInput = chunks.map(chunk => ({
      id: chunk.id,
      content: chunk.content
    }))

    // Extract metadata with progress tracking
    const results = await bulletproofExtractMetadata(batchInput, {
      maxRetries: 5,
      enableGeminiFallback: false,  // Zero cost (Ollama only)
      onProgress: (processed, total, status) => {
        if (onProgress) {
          const percent = Math.floor((processed / total) * 100)
          onProgress(percent, 'enrichment', `Enriching chunk ${processed}/${total} (${status})`)
        }
      }
    })

    // Apply metadata to chunks in database
    for (const chunk of chunks) {
      const result = results.get(chunk.id)

      if (!result) {
        console.warn(`[EnrichChunks] No result for chunk ${chunk.chunk_index}`)
        continue
      }

      const { error: updateError } = await this.supabase
        .from('chunks')
        .update({
          themes: result.metadata.themes,
          importance_score: result.metadata.importance,
          summary: result.metadata.summary,
          emotional_metadata: {
            polarity: result.metadata.emotional.polarity,
            primaryEmotion: result.metadata.emotional.primaryEmotion,
            intensity: result.metadata.emotional.intensity
          },
          conceptual_metadata: {
            concepts: result.metadata.concepts
          },
          domain_metadata: {
            primaryDomain: result.metadata.domain,
            confidence: 0.8
          },
          metadata_extracted_at: new Date().toISOString(),
          enrichments_detected: true,
          enrichments_detected_at: new Date().toISOString()
        })
        .eq('id', chunk.id)

      if (updateError) {
        console.error(`[EnrichChunks] Failed to update chunk ${chunk.chunk_index}:`, updateError)
      }
    }

    // Log quality distribution
    console.log(`[EnrichChunks] Enrichment complete:`)
    console.log(`  Quality distribution:`)
    console.log(`    - Ollama 32B: ${[...results.values()].filter(r => r.source === 'ollama-32b').length}`)
    console.log(`    - Ollama 14B: ${[...results.values()].filter(r => r.source === 'ollama-14b').length}`)
    console.log(`    - Ollama 7B: ${[...results.values()].filter(r => r.source === 'ollama-7b').length}`)
    console.log(`    - Regex: ${[...results.values()].filter(r => r.source === 'regex').length}`)
    console.log(`    - Fallback: ${[...results.values()].filter(r => r.source === 'fallback').length}`)
  }

  /**
   * Mark chunks as unenriched (user chose to skip).
   */
  async markChunksAsUnenriched(
    documentId: string,
    reason: 'user_choice' | 'error' | 'manual_skip'
  ): Promise<void> {
    const { error } = await this.supabase
      .from('chunks')
      .update({
        enrichments_detected: false,
        enrichment_skipped_reason: reason,
        themes: [],
        importance_score: 0.5,
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      })
      .eq('document_id', documentId)
      .eq('is_current', true)

    if (error) {
      throw new Error(`Failed to mark chunks as unenriched: ${error.message}`)
    }

    console.log(`[ChunkEnrichmentManager] Marked chunks as unenriched (${reason})`)
  }

  /**
   * Get all chunk IDs for a document.
   */
  private async getAllChunkIds(documentId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)
      .eq('is_current', true)
      .order('chunk_index')

    if (error || !data) {
      throw new Error(`Failed to get chunk IDs: ${error?.message}`)
    }

    return data.map(c => c.id)
  }
}
