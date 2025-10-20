import { SupabaseClient } from '@supabase/supabase-js'

interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  connection_type: 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge'
  strength: number
  metadata: {
    explanation?: string
    bridge_type?: string
    source_domain?: string
    target_domain?: string
    [key: string]: any
  } | null
  user_validated: boolean
  discovered_at: Date
}

interface ConnectionWithChunks extends Connection {
  sourceChunk: {
    chunkIndex: number
    content: string
    documentId: string
    documentTitle: string
  }
  targetChunk: {
    chunkIndex: number
    content: string
    documentId: string
    documentTitle: string
  }
}

/**
 * Generate connections.md for a document
 * Format: Obsidian-compatible with [[wikilinks]]
 */
export async function generateConnectionsMarkdown(
  documentId: string,
  documentTitle: string,
  supabase: SupabaseClient
): Promise<string> {
  // Fetch all connections for this document
  const connections = await fetchDocumentConnections(documentId, supabase)

  if (connections.length === 0) {
    return `# ${documentTitle} - Connections\n\nNo connections found yet. Process more documents to discover connections!\n`
  }

  // Group by type
  const byType = groupBy(connections, c => c.connection_type)

  let markdown = `# ${documentTitle} - Connections\n\n`
  markdown += `**Total Connections**: ${connections.length}\n\n`
  markdown += `---\n\n`

  // Semantic Similarity
  if (byType['semantic_similarity']?.length > 0) {
    markdown += `## 🔗 Semantic Similarity (${byType['semantic_similarity'].length})\n\n`
    markdown += `*These passages express similar ideas or concepts*\n\n`

    for (const conn of byType['semantic_similarity']) {
      markdown += formatConnection(conn, documentTitle)
    }
  }

  // Contradiction Detection
  if (byType['contradiction_detection']?.length > 0) {
    markdown += `## ⚡ Contradictions (${byType['contradiction_detection'].length})\n\n`
    markdown += `*These passages present opposing or conflicting ideas*\n\n`

    for (const conn of byType['contradiction_detection']) {
      markdown += formatConnection(conn, documentTitle)
    }
  }

  // Thematic Bridge
  if (byType['thematic_bridge']?.length > 0) {
    markdown += `## 🌉 Thematic Bridges (${byType['thematic_bridge'].length})\n\n`
    markdown += `*These passages connect across different domains or contexts*\n\n`

    for (const conn of byType['thematic_bridge']) {
      markdown += formatConnection(conn, documentTitle)
    }
  }

  return markdown
}

/**
 * Format single connection as markdown
 */
function formatConnection(conn: ConnectionWithChunks, currentDocTitle: string): string {
  const isExternal = conn.targetChunk.documentTitle !== currentDocTitle

  let md = ''

  if (isExternal) {
    // Cross-document connection (use wikilink)
    md += `### → [[${conn.targetChunk.documentTitle}]]\n\n`
  } else {
    // Internal connection
    md += `### → Chunk ${conn.targetChunk.chunkIndex}\n\n`
  }

  md += `> "${conn.targetChunk.content.slice(0, 150)}..."\n\n`
  md += `**Strength**: ${(conn.strength * 100).toFixed(0)}%\n\n`

  // Extract explanation from metadata (reasoning is stored as metadata.explanation)
  const explanation = conn.metadata?.explanation || 'No explanation available'
  md += `**Reasoning**: ${explanation}\n\n`

  if (conn.user_validated) {
    md += `✅ *User validated*\n\n`
  }

  md += `---\n\n`

  return md
}

/**
 * Fetch connections for a document with chunk details
 */
async function fetchDocumentConnections(
  documentId: string,
  supabase: SupabaseClient
): Promise<ConnectionWithChunks[]> {
  // Get chunk IDs for this document
  const { data: chunks } = await supabase
    .from('chunks')
    .select('id')
    .eq('document_id', documentId)
    .eq('is_current', true)

  if (!chunks || chunks.length === 0) return []

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
      discovered_at
    `)
    .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`)
    .order('strength', { ascending: false })

  if (!connections) return []

  // Fetch chunk details for all connections
  const allChunkIds = new Set<string>()
  connections.forEach(c => {
    allChunkIds.add(c.source_chunk_id)
    allChunkIds.add(c.target_chunk_id)
  })

  const { data: chunkDetails } = await supabase
    .from('chunks')
    .select(`
      id,
      chunk_index,
      content,
      document_id,
      documents!inner(title)
    `)
    .in('id', Array.from(allChunkIds))

  // Build chunk map
  const chunkMap = new Map()
  chunkDetails?.forEach((chunk: any) => {
    chunkMap.set(chunk.id, {
      chunkIndex: chunk.chunk_index,
      content: chunk.content,
      documentId: chunk.document_id,
      documentTitle: chunk.documents.title
    })
  })

  // Combine connections with chunk details
  return connections.map(conn => ({
    ...conn,
    sourceChunk: chunkMap.get(conn.source_chunk_id),
    targetChunk: chunkMap.get(conn.target_chunk_id)
  })).filter(conn => conn.sourceChunk && conn.targetChunk) // Filter out any with missing chunk details
}

/**
 * Group array by key function
 */
function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const key = keyFn(item)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
