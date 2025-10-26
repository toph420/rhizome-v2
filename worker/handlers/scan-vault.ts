/**
 * Scan Vault Background Job Handler
 *
 * Quick operation to scan Obsidian vault and return list of documents.
 * Returns document metadata including completeness status.
 *
 * See: thoughts/plans/2025-10-19_obsidian-vault-mirroring.md (Phase 3)
 */

import { createClient } from '@supabase/supabase-js'
import { scanVaultDocuments } from '../lib/vault-reader.js'
import { HandlerJobManager } from '../lib/handler-job-manager.js'
import { ScanVaultOutputSchema } from '../types/job-schemas.js'

/**
 * Scan vault for documents
 * Fast operation (2-5 seconds typically)
 */
export async function scanVaultHandler(supabase: any, job: any): Promise<void> {
  const { userId, vaultPath, rhizomePath } = job.input_data

  console.log(`[ScanVault] Starting vault scan at ${vaultPath}`)

  const jobManager = new HandlerJobManager(supabase, job.id)

  try {
    // Scan vault for documents
    const documents = await scanVaultDocuments(vaultPath, rhizomePath || 'Rhizome/')

    console.log(`[ScanVault] Found ${documents.length} documents in vault`)

    // Convert to serializable format (remove non-essential properties)
    const serializedDocuments = documents.map(doc => ({
      title: doc.title,
      complete: doc.complete,
      hasContent: !!doc.contentPath,
      hasHighlights: !!doc.highlightsPath,
      hasConnections: !!doc.connectionsPath,
      hasChunksJson: doc.hasChunksJson,
      hasMetadataJson: doc.hasMetadataJson,
      hasManifestJson: doc.hasManifestJson
    }))

    // Prepare output data
    const outputData = {
      success: true,
      documentCount: documents.length,
      documents: serializedDocuments,
      vaultPath: vaultPath
    }

    // Validate before saving
    ScanVaultOutputSchema.parse(outputData)

    // Mark job complete
    await jobManager.markComplete(outputData, `Scanned ${documents.length} documents`)

    console.log(`[ScanVault] ✅ Scan complete`)
  } catch (error: any) {
    console.error('[ScanVault] ❌ Scan failed:', error)
    await jobManager.markFailed(error)
    throw error
  }
}
