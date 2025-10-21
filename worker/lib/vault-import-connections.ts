import { promises as fs } from 'fs'
import { SupabaseClient } from '@supabase/supabase-js'
import { remapConnections } from '../handlers/remap-connections.js'

/**
 * Import connections from vault JSON
 * Uses direct restore if chunk IDs match, otherwise triggers remapping
 */
export async function importConnectionsFromVault(
  documentId: string,
  connectionsJsonPath: string,
  currentChunks: Array<{ id: string; chunk_index: number; start_offset: number; end_offset: number; content: string; embedding?: number[] }>,
  supabase: SupabaseClient
): Promise<{ imported: number; remapped: number; method: 'direct' | 'remapping' }> {
  // Read connections JSON
  const jsonContent = await fs.readFile(connectionsJsonPath, 'utf-8')
  const connectionsData = JSON.parse(jsonContent)

  if (!connectionsData.connections || connectionsData.connections.length === 0) {
    console.log('[ImportConnections] No connections to import')
    return { imported: 0, remapped: 0, method: 'direct' }
  }

  // Check if chunk IDs still exist in database (cross-document connections allowed!)
  // Collect all unique chunk IDs from connections
  const allChunkIdsInConnections = new Set<string>()
  connectionsData.connections.forEach((conn: any) => {
    allChunkIdsInConnections.add(conn.source_chunk_id)
    allChunkIdsInConnections.add(conn.target_chunk_id)
  })

  // Query database to check which chunks exist
  const { data: existingChunks, error: chunkError } = await supabase
    .from('chunks')
    .select('id')
    .in('id', Array.from(allChunkIdsInConnections))

  if (chunkError) {
    console.error('[ImportConnections] Failed to verify chunk existence:', chunkError.message)
    return { imported: 0, remapped: 0, method: 'direct' }
  }

  const existingChunkIds = new Set(existingChunks?.map((c: any) => c.id) || [])
  const allChunkIdsExist = connectionsData.connections.every((conn: any) => {
    return existingChunkIds.has(conn.source_chunk_id) && existingChunkIds.has(conn.target_chunk_id)
  })

  if (allChunkIdsExist) {
    // ✅ FAST PATH: Direct restore (chunk IDs match)
    console.log('[ImportConnections] Chunk IDs match - direct restore')
    let imported = 0

    for (const conn of connectionsData.connections) {
      const { error } = await supabase
        .from('connections')
        .upsert({
          id: conn.id,
          source_chunk_id: conn.source_chunk_id,
          target_chunk_id: conn.target_chunk_id,
          connection_type: conn.connection_type,
          strength: conn.strength,
          metadata: conn.metadata,
          user_validated: conn.user_validated,
          user_starred: conn.user_starred,
          auto_detected: conn.auto_detected,
          discovered_at: conn.discovered_at,
          validated_at: conn.validated_at
        }, {
          onConflict: 'source_chunk_id,target_chunk_id,connection_type',
          ignoreDuplicates: false
        })

      if (!error) {
        imported++
      } else {
        console.warn(`Failed to import connection ${conn.id}:`, error.message)
      }
    }

    console.log(`[ImportConnections] ✓ Direct restore: ${imported} connections`)
    return { imported, remapped: 0, method: 'direct' }

  } else {
    // 🔄 REMAPPING PATH: Chunk IDs changed, use remapping handler
    console.log('[ImportConnections] Chunk IDs changed - triggering remapping')

    const remappingResults = await remapConnections(
      documentId,
      currentChunks,
      supabase
    )

    const remapped = remappingResults.success.length
    console.log(`[ImportConnections] ✓ Remapping complete: ${remapped} connections remapped`)
    console.log(`[ImportConnections]   - Success: ${remappingResults.success.length}`)
    console.log(`[ImportConnections]   - Needs review: ${remappingResults.needsReview.length}`)
    console.log(`[ImportConnections]   - Lost: ${remappingResults.lost.length}`)

    return { imported: 0, remapped, method: 'remapping' }
  }
}
