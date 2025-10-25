/**
 * Detect Connections Handler V3 - Now supports per-chunk detection
 *
 * Two modes:
 * 1. Document-level: Detect connections for all chunks (original behavior)
 * 2. Chunk-level: Detect connections for specific chunks (NEW)
 */

import { ConnectionDetectionManager } from '../lib/managers/connection-detection-manager.js'

export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_count, chunk_ids, trigger } = job.input_data

  const manager = new ConnectionDetectionManager(supabase, job.id)

  try {
    await manager.detectConnections({
      documentId: document_id,
      chunkIds: chunk_ids,  // NEW: Optional chunk filtering
      chunkCount: chunk_count,
      trigger: trigger || (chunk_ids ? 'user_selection' : 'automatic')
    })
  } catch (error: any) {
    await manager.markFailed(error)
    throw error
  }
}
