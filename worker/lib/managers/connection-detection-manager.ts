/**
 * Connection Detection Manager - Orchestrates connection detection and reprocessing.
 *
 * Handles two workflows:
 * 1. Initial connection detection (detect-connections handler)
 * 2. Connection reprocessing with preservation (reprocess-connections handler)
 *
 * Reduces handlers from 70+267 lines to ~30-40 lines each.
 */

import { HandlerJobManager } from '../handler-job-manager.js'
import { processDocument } from '../../engines/orchestrator.js'
import { DEFAULT_ENGINE_CONFIG } from '../../engines/engine-config.js'
import { saveToStorage } from '../storage-helpers.js'

type ReprocessMode = 'all' | 'add_new' | 'smart'
type EngineType = 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'

interface DetectOptions {
  documentId: string
  chunkCount?: number
  trigger?: string
}

interface ReprocessOptions {
  documentId: string
  userId: string
  mode: ReprocessMode
  engines: EngineType[]
  preserveValidated?: boolean
  backupFirst?: boolean
}

/**
 * Manager for connection detection workflows.
 */
export class ConnectionDetectionManager extends HandlerJobManager {
  /**
   * Execute initial connection detection for a document.
   */
  async detectConnections(options: DetectOptions): Promise<void> {
    const { documentId, chunkCount, trigger } = options

    console.log(`[DetectConnections] Starting for document ${documentId} (${chunkCount} chunks, ${trigger})`)

    await this.updateProgress(0, 'detect-connections', 'Starting connection detection')

    // Run orchestrator with all 3 engines
    const result = await processDocument(documentId, {
      enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
      onProgress: (percent, stage, details) => this.updateProgress(percent, stage, details),
      ...DEFAULT_ENGINE_CONFIG
    })

    console.log(`[DetectConnections] Created ${result.totalConnections} connections`)
    console.log(`[DetectConnections] By engine:`, result.byEngine)

    await this.markComplete({
      success: true,
      totalConnections: result.totalConnections,
      byEngine: result.byEngine
    }, `Found ${result.totalConnections} connections`)
  }

  /**
   * Execute connection reprocessing with optional validation preservation.
   */
  async reprocessConnections(options: ReprocessOptions): Promise<void> {
    const { documentId, userId, mode, engines, preserveValidated, backupFirst } = options

    console.log(`[ReprocessConnections] Starting for document ${documentId}`)
    console.log(`[ReprocessConnections] Mode: ${mode}, Engines: ${engines.join(', ')}`)

    await this.updateProgress(10, 'preparing', 'Counting existing connections')

    // Get chunk IDs
    const chunkIds = await this.getChunkIds(documentId)
    if (chunkIds.length === 0) {
      throw new Error('No chunks found for document')
    }

    console.log(`[ReprocessConnections] Found ${chunkIds.length} chunks`)

    // Get current connection count
    const connectionsBefore = await this.getConnectionCount(chunkIds)
    console.log(`[ReprocessConnections] Connections before: ${connectionsBefore}`)

    // Handle mode-specific logic
    let validatedPreserved = 0
    let backupPath: string | undefined
    let targetDocumentIds: string[] | undefined

    if (mode === 'all') {
      // Delete all and regenerate
      await this.deleteAllConnections(chunkIds, connectionsBefore)

    } else if (mode === 'smart' && preserveValidated) {
      // Preserve validated connections
      const result = await this.preserveValidatedConnections(documentId, userId, chunkIds, backupFirst)
      validatedPreserved = result.count
      backupPath = result.backupPath

    } else if (mode === 'add_new') {
      // Add connections to newer documents
      targetDocumentIds = await this.getNewerDocumentIds(documentId)
      console.log(`[ReprocessConnections] Will connect to ${targetDocumentIds.length} newer documents`)
    }

    // Run engines
    await this.updateProgress(40, 'detecting', 'Running connection detection')

    const orchestratorConfig: any = {
      enabledEngines: engines,
      onProgress: (percent: number, stage: string, details: string) =>
        this.updateProgress(40 + (percent / 2), stage, details),
      ...DEFAULT_ENGINE_CONFIG
    }

    if (targetDocumentIds) {
      orchestratorConfig.targetDocumentIds = targetDocumentIds
    }

    const result = await processDocument(documentId, orchestratorConfig)

    // Get final connection count
    const connectionsAfter = await this.getConnectionCount(chunkIds)

    console.log(`[ReprocessConnections] Complete:`)
    console.log(`  - Before: ${connectionsBefore}`)
    console.log(`  - After: ${connectionsAfter}`)
    console.log(`  - By engine:`, result.byEngine)

    await this.markComplete({
      success: true,
      connectionsBefore,
      connectionsAfter,
      validatedPreserved,
      backupPath,
      byEngine: result.byEngine
    }, `Reprocessed connections (${mode} mode)`)
  }

  /**
   * Get chunk IDs for a document.
   */
  private async getChunkIds(documentId: string): Promise<string[]> {
    const { data: chunks } = await this.supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId)

    return chunks?.map((c: any) => c.id) || []
  }

  /**
   * Get connection count for chunks.
   */
  private async getConnectionCount(chunkIds: string[]): Promise<number> {
    const { count } = await this.supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)

    return count || 0
  }

  /**
   * Delete all connections for chunks.
   */
  private async deleteAllConnections(chunkIds: string[], count: number): Promise<void> {
    await this.updateProgress(20, 'deleting', 'Deleting all connections')

    const { error } = await this.supabase
      .from('connections')
      .delete()
      .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)

    if (error) {
      throw new Error(`Failed to delete connections: ${error.message}`)
    }

    console.log(`[ReprocessConnections] Deleted ${count} connections`)
  }

  /**
   * Preserve validated connections (Smart Mode).
   */
  private async preserveValidatedConnections(
    documentId: string,
    userId: string,
    chunkIds: string[],
    backupFirst?: boolean
  ): Promise<{ count: number; backupPath?: string }> {
    await this.updateProgress(15, 'querying', 'Finding validated connections')

    const { data: validated } = await this.supabase
      .from('connections')
      .select('*')
      .eq('user_validated', true)
      .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)

    const count = validated?.length || 0
    console.log(`[ReprocessConnections] Found ${count} validated connections`)

    let backupPath: string | undefined

    if (backupFirst && count > 0) {
      await this.updateProgress(20, 'backup', 'Backing up validated connections')

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      backupPath = `${userId}/${documentId}/validated-connections-${timestamp}.json`

      await saveToStorage(this.supabase, backupPath, {
        version: '1.0',
        document_id: documentId,
        timestamp,
        connections: validated,
        count
      })

      console.log(`[ReprocessConnections] Backed up to: ${backupPath}`)
    }

    // Delete non-validated connections
    await this.updateProgress(25, 'deleting', 'Deleting non-validated connections')

    const { error } = await this.supabase
      .from('connections')
      .delete()
      .eq('user_validated', false)
      .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)

    if (error) {
      throw new Error(`Failed to delete non-validated connections: ${error.message}`)
    }

    return { count, backupPath }
  }

  /**
   * Get IDs of documents newer than the target document (Add New mode).
   */
  private async getNewerDocumentIds(documentId: string): Promise<string[]> {
    // Get target document's created_at
    const { data: doc } = await this.supabase
      .from('documents')
      .select('created_at, user_id')
      .eq('id', documentId)
      .single()

    if (!doc) {
      throw new Error('Document not found')
    }

    // Find documents created after this one
    const { data: newerDocs } = await this.supabase
      .from('documents')
      .select('id')
      .eq('user_id', doc.user_id)
      .gt('created_at', doc.created_at)

    return newerDocs?.map((d: any) => d.id) || []
  }
}
