/**
 * Reprocess Connections Handler V2 - Refactored with ConnectionDetectionManager
 *
 * Reduced from 267 lines to ~25 lines by extracting workflow into manager.
 */

import { ConnectionDetectionManager } from '../lib/managers/connection-detection-manager.js'
import type { SupabaseClient } from '@supabase/supabase-js'

type ReprocessMode = 'all' | 'add_new' | 'smart'
type EngineType = 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'

interface ReprocessInput {
  mode: ReprocessMode
  engines: EngineType[]
  preserveValidated?: boolean
  backupFirst?: boolean
}

export async function reprocessConnectionsHandler(supabase: any, job: any): Promise<void> {
  const documentId = job.entity_id
  const userId = job.user_id
  const options: ReprocessInput = job.input_data

  const manager = new ConnectionDetectionManager(supabase, job.id)

  try {
    await manager.reprocessConnections({
      documentId,
      userId,
      ...options
    })
  } catch (error: any) {
    await manager.markFailed(error)
    throw error
  }
}
