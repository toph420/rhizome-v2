import { ChunkEnrichmentManager } from '../lib/managers/chunk-enrichment-manager.js'
import { ConnectionDetectionManager } from '../lib/managers/connection-detection-manager.js'

export async function handleEnrichAndConnect(supabase: any, job: any): Promise<void> {
  console.log(`[EnrichAndConnectHandler] Starting job ${job.id}`)

  const { document_id: documentId, chunk_ids: chunkIds } = job.input_data

  await supabase
    .from('background_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString()
    })
    .eq('id', job.id)

  try {
    // STEP 1: Enrichment (0-50% progress)
    console.log(`[EnrichAndConnect] Step 1: Enriching ${chunkIds?.length || 'all'} chunks`)

    const enrichmentManager = new ChunkEnrichmentManager(supabase, job.id)

    await enrichmentManager.enrichChunks({
      documentId,
      chunkIds,
      onProgress: async (percent, stage, details) => {
        // Map enrichment progress to 0-50% range
        const overallPercent = Math.floor(percent / 2)
        await supabase
          .from('background_jobs')
          .update({
            progress: {
              percent: overallPercent,
              stage: 'enrichment',
              details
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        console.log(`[EnrichAndConnect] Enrichment: ${percent}% (overall: ${overallPercent}%)`)
      }
    })

    console.log(`[EnrichAndConnect] Enrichment complete, starting connection detection`)

    // Update to 50% before starting connections
    await supabase
      .from('background_jobs')
      .update({
        progress: {
          percent: 50,
          stage: 'connections',
          details: 'Starting connection detection'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)

    // STEP 2: Connection Detection (50-100% progress)
    console.log(`[EnrichAndConnect] Step 2: Detecting connections`)

    const connectionManager = new ConnectionDetectionManager(supabase, job.id)

    await connectionManager.detectConnections({
      documentId,
      chunkIds,
      trigger: 'enrich_and_connect',
      onProgress: async (percent, stage, details) => {
        // Map connection detection progress to 50-100% range
        const overallPercent = 50 + Math.floor(percent / 2)
        await supabase
          .from('background_jobs')
          .update({
            progress: {
              percent: overallPercent,
              stage: 'connections',
              details
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', job.id)

        console.log(`[EnrichAndConnect] Connections: ${percent}% (overall: ${overallPercent}%)`)
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
          details: 'Enrichment and connection detection complete'
        },
        output_data: {
          success: true,
          chunksProcessed: chunkIds?.length || 'all',
          enrichmentComplete: true,
          connectionsComplete: true,
          completedAt: new Date().toISOString()
        }
      })
      .eq('id', job.id)

    console.log(`[EnrichAndConnectHandler] Job ${job.id} completed successfully`)
  } catch (error: any) {
    console.error(`[EnrichAndConnectHandler] Job ${job.id} failed:`, error)

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
