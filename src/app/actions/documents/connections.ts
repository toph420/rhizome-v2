'use server'

import { getAuthContext, createBackgroundJob, validateDocumentId, withErrorHandling } from './utils'
import type { ReprocessResult, ReprocessOptions, ReprocessMode, EngineType } from './types'

/**
 * Reprocess connections for a document with intelligent preservation.
 *
 * Modes:
 * - all: Delete all connections and regenerate from scratch (fresh start)
 * - add_new: Keep existing connections, only add connections to newer documents (incremental)
 * - smart: Preserve user-validated connections, regenerate others (safe for annotations)
 *
 * Engines:
 * - semantic_similarity: Fast, embedding-based, no AI cost
 * - contradiction_detection: Fast, metadata-based, no AI cost
 * - thematic_bridge: Slow, AI-powered, ~$0.20 per document
 *
 * Smart Mode Options:
 * - preserveValidated: Keep connections marked as user_validated=true
 * - backupFirst: Save validated connections to Storage before reprocessing
 *
 * @param documentId - Document to reprocess connections for
 * @param options - Reprocessing configuration
 * @returns Result with job ID for tracking
 */
export async function reprocessConnections(
  documentId: string,
  options: ReprocessOptions
): Promise<ReprocessResult> {
  return withErrorHandling(async () => {
    const { user, supabase } = await getAuthContext()

    console.log(`[reprocessConnections] Starting for: ${documentId}`)
    console.log(`[reprocessConnections] Options:`, options)

    // Validate documentId
    await validateDocumentId(documentId)

    // Validate mode
    const validModes: ReprocessMode[] = ['all', 'add_new', 'smart']
    if (!validModes.includes(options.mode)) {
      throw new Error(`Invalid mode. Must be one of: ${validModes.join(', ')}`)
    }

    // Validate engines (at least one required)
    if (!options.engines || options.engines.length === 0) {
      throw new Error('At least one engine required')
    }

    const validEngines: EngineType[] = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
    const invalidEngines = options.engines.filter(e => !validEngines.includes(e))
    if (invalidEngines.length > 0) {
      throw new Error(
        `Invalid engines: ${invalidEngines.join(', ')}. Valid engines: ${validEngines.join(', ')}`
      )
    }

    // Verify document exists and belongs to user
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, title')
      .eq('id', documentId)
      .single()

    if (docError || !doc) {
      throw new Error('Document not found')
    }

    if (doc.user_id !== user.id) {
      throw new Error('Not authorized to reprocess this document')
    }

    console.log(`[reprocessConnections] Creating job for document: ${doc.title}`)

    // Create background job for reprocessing
    const jobId = await createBackgroundJob(user.id, 'reprocess_connections', documentId, {
      document_id: documentId,
      mode: options.mode,
      engines: options.engines,
      preserveValidated: options.preserveValidated ?? true, // Default to true for safety
      backupFirst: options.backupFirst ?? true // Default to true for safety
    })

    console.log(`[reprocessConnections] Job created: ${jobId}`)

    return { jobId }
  })
}
