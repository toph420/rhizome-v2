import { createClient } from '@/lib/supabase/server'
import type { SparkConnection } from './types'
import { extractChunkIds, extractTags } from './extractors'

// Re-export for convenience
export { extractChunkIds, extractTags }

/**
 * Get connections to inherit from origin chunk
 * Returns top 10 connections with 0.7x strength multiplier
 *
 * Pattern: Read from connections table, transform to spark connections.
 * Spark connections stored in component JSON, not connections table.
 */
export async function getInheritedConnections(
  originChunkId: string,
  userId: string
): Promise<SparkConnection[]> {
  const supabase = await createClient()

  // Get strong connections from origin chunk (strength >= 0.6)
  const { data: connections, error } = await supabase
    .from('connections')
    .select('target_chunk_id, connection_type, strength, metadata')
    .eq('source_chunk_id', originChunkId)
    .gte('strength', 0.6)
    .order('strength', { ascending: false })
    .limit(10) // Top 10 connections only

  if (error) {
    console.error(`[Sparks] Failed to get connections for ${originChunkId}:`, error)
    return []
  }

  if (!connections || connections.length === 0) {
    return []
  }

  // Map to spark connections with reduced weight
  return connections.map(conn => ({
    chunkId: conn.target_chunk_id,
    type: 'inherited' as const,
    strength: conn.strength * 0.7, // Reduce weight for inherited
    metadata: {
      inheritedFrom: originChunkId,
      originalStrength: conn.strength,
      originalType: conn.connection_type
    }
  }))
}

/**
 * Build complete connection list for a spark
 * Combines: origin + mentions + inherited
 *
 * Pattern: 3 connection types stored in spark component:
 * 1. origin (strength 1.0) - chunk where spark was created
 * 2. mention (strength 0.9) - chunks explicitly referenced in content
 * 3. inherited (strength original * 0.7) - connections from origin chunk
 */
export async function buildSparkConnections(
  content: string,
  originChunkId: string,
  userId: string
): Promise<SparkConnection[]> {
  const connections: SparkConnection[] = []

  // 1. Origin connection (highest strength)
  if (originChunkId) {
    connections.push({
      chunkId: originChunkId,
      type: 'origin',
      strength: 1.0,
      metadata: { relationship: 'origin' }
    })
  } else {
    console.warn('[Sparks] No origin chunk provided - spark will be orphaned')
  }

  // 2. Explicit mentions in content
  const mentions = extractChunkIds(content)
  for (const chunkId of mentions) {
    connections.push({
      chunkId,
      type: 'mention',
      strength: 0.9,
      metadata: { mentionedInContent: true }
    })
  }

  // 3. Inherited from origin chunk (only if origin exists)
  if (originChunkId) {
    const inherited = await getInheritedConnections(originChunkId, userId)
    connections.push(...inherited)
  }

  // Remove duplicates (keep highest strength)
  const uniqueConnections = new Map<string, SparkConnection>()
  for (const conn of connections) {
    const existing = uniqueConnections.get(conn.chunkId)
    if (!existing || conn.strength > existing.strength) {
      uniqueConnections.set(conn.chunkId, conn)
    }
  }

  return Array.from(uniqueConnections.values())
}
