import { ChunkEnrichmentManager } from '../lib/managers/chunk-enrichment-manager.js'

export async function handleEnrichChunks(supabase: any, job: any): Promise<void> {
  console.log(`[EnrichChunksHandler] Starting job ${job.id}`)

  const { document_id: documentId, chunk_ids: chunkIds } = job.input_data

  // Update job status
  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', job.id)

  try {
    const manager = new ChunkEnrichmentManager(supabase, job.id)

    await manager.enrichChunks({
      documentId,
      chunkIds,  // Optional: for per-chunk mode
      onProgress: async (percent, stage, details) => {
        // Report progress to database for UI polling
        const { error } = await supabase
          .from('background_jobs')
          .update({
            progress: {
              percent,
              stage,
              details
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        if (error) {
          console.error(`[EnrichChunksHandler] Progress update error:`, error)
        } else {
          console.log(`[EnrichChunksHandler] Progress: ${percent}% - ${stage} - ${details}`)
        }
      }
    })

    // Mark job complete
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        progress: {
          percent: 100,
          stage: 'completed',
          details: 'Enrichment complete'
        },
        output_data: {
          success: true,
          chunksEnriched: chunkIds?.length || 'all',
          completedAt: new Date().toISOString()
        }
      })
      .eq('id', job.id)

    console.log(`[EnrichChunksHandler] Job ${job.id} completed successfully`)
  } catch (error: any) {
    console.error(`[EnrichChunksHandler] Job ${job.id} failed:`, error)

    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', job.id)

    throw error
  }
}
