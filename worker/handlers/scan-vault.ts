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

/**
 * Scan vault for documents
 * Fast operation (2-5 seconds typically)
 */
export async function scanVaultHandler(supabase: any, job: any): Promise<void> {
  const { userId, vaultPath, rhizomePath } = job.input_data

  console.log(`[ScanVault] Starting vault scan at ${vaultPath}`)

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

    // Update job with results
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: {
          documents: serializedDocuments,
          vaultPath: vaultPath
        }
      })
      .eq('id', job.id)

    console.log(`[ScanVault] ✅ Scan complete`)
  } catch (error) {
    console.error('[ScanVault] ❌ Scan failed:', error)
    throw error
  }
}
