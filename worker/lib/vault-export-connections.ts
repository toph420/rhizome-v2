import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Export connections to JSON format for vault storage
 * Exports all connections where source OR target is in this document
 */
export async function exportConnectionsToJson(
  documentId: string,
  supabase: SupabaseClient
): Promise<string> {
  // Get current chunk IDs for this document
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('is_current', true)

  if (!chunks || chunks.length === 0) {
    return JSON.stringify({
      version: '1.0',
      exported_at: new Date().toISOString(),
      document_id: documentId,
      connections: []
    }, null, 2)
  }

  const chunkIds = chunks.map(c => c.id)

  // Query connections where source OR target is in this document
  const { data: connections } = await supabase
    .from('connections')
    .select(`
      id,
      source_chunk_id,
      target_chunk_id,
      connection_type,
      strength,
      metadata,
      user_validated,
      user_starred,
      auto_detected,
      discovered_at,
      validated_at
    `)
    .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)
    .order('strength', { ascending: false })

  if (!connections || connections.length === 0) {
    return JSON.stringify({
      version: '1.0',
      exported_at: new Date().toISOString(),
      document_id: documentId,
      connections: []
    }, null, 2)
  }

  // Build final JSON structure
  const exportData = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    document_id: documentId,
    chunk_count: chunks.length,
    connections: connections.map(conn => ({
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
    }))
  }

  return JSON.stringify(exportData, null, 2)
}
