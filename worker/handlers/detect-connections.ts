/**
 * Detect Connections Handler V2 - Refactored with ConnectionDetectionManager
 *
 * Reduced from 70 lines to ~20 lines by extracting workflow into manager.
 */

import { ConnectionDetectionManager } from '../lib/managers/connection-detection-manager.js'

export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_count, trigger } = job.input_data

  const manager = new ConnectionDetectionManager(supabase, job.id)

  try {
    await manager.detectConnections({
      documentId: document_id,
      chunkCount: chunk_count,
      trigger
    })
  } catch (error: any) {
    await manager.markFailed(error)
    throw error
  }
}
