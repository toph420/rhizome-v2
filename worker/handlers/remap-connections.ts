/**
 * Connection Remapping Handler
 * Remaps cross-document connections after reprocessing using embedding similarity
 *
 * Strategy:
 * - Check which side(s) of connection were edited
 * - Use embedding-based matching to find best chunk in new version
 * - Preserve connections with >0.95 similarity automatically
 * - Flag 0.85-0.95 for review
 * - Mark <0.85 as lost
 */

import { createClient } from '@supabase/supabase-js'
import type {
  Connection,
  ConnectionRecoveryResults,
  Chunk
} from '../types/recovery.js'

/**
 * Remap connections for a document after reprocessing
 *
 * Queries verified connections WITH old chunk embeddings via join.
 * Old chunks have is_current: false but join still retrieves them.
 *
 * @param documentId - Document that was reprocessed
 * @param newChunks - New chunks with embeddings
 * @returns Recovery results for connections
 */
export async function remapConnections(
  documentId: string,
  newChunks: Chunk[],
  supabaseClient?: any
): Promise<ConnectionRecoveryResults> {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // CRITICAL FIX: Explicitly fetch old chunk data
  // PostgREST joins DON'T retrieve is_current:false chunks, contrary to previous assumption

  // Step 1: Get ALL chunk IDs (both old and new) for this document
  const { data: allDocChunks } = await supabase
    .from('chunks')
    .select('id, embedding, document_id, is_current')
    .eq('document_id', documentId)

  // Create a lookup map for old chunk embeddings
  // CRITICAL: Parse embeddings from strings to number arrays (Supabase returns vectors as JSON strings)
  const oldChunkMap = new Map()
  allDocChunks?.forEach(chunk => {
    if (!chunk.is_current && chunk.embedding) {
      const embedding = typeof chunk.embedding === 'string'
        ? JSON.parse(chunk.embedding)
        : chunk.embedding
      oldChunkMap.set(chunk.id, embedding)
    }
  })

  console.log(`[RemapConnections] Found ${oldChunkMap.size} old chunks with embeddings`)

  // Step 2: Fetch verified connections (without relying on joins for old data)
  const { data: allConnections, error } = await supabase
    .from('connections')
    .select(`
      id,
      source_chunk_id,
      target_chunk_id,
      connection_type,
      strength,
      user_validated,
      metadata
    `)
    .eq('user_validated', true)

  if (error) {
    throw new Error(`Failed to fetch connections: ${error.message}`)
  }

  // Step 3: Batch fetch current chunks (avoid N+1 query problem)
  const chunkIdsNeeded = new Set<string>()
  allConnections?.forEach(conn => {
    if (!oldChunkMap.has(conn.source_chunk_id)) {
      chunkIdsNeeded.add(conn.source_chunk_id)
    }
    if (!oldChunkMap.has(conn.target_chunk_id)) {
      chunkIdsNeeded.add(conn.target_chunk_id)
    }
  })

  // Single batch query instead of N queries
  const { data: currentChunks } = await supabase
    .from('chunks')
    .select('id, document_id, embedding')
    .in('id', Array.from(chunkIdsNeeded))
    .eq('is_current', true)

  // Parse embeddings and create lookup map
  const currentChunkMap = new Map(
    currentChunks?.map(c => [
      c.id,
      {
        id: c.id,
        document_id: c.document_id,
        embedding: typeof c.embedding === 'string' ? JSON.parse(c.embedding) : c.embedding
      }
    ]) || []
  )

  // Step 4: Enrich connections with chunk data (synchronous - no more queries)
  const enrichedConnections = (allConnections || []).map(conn => ({
    ...conn,
    source_chunk: oldChunkMap.has(conn.source_chunk_id)
      ? {
          id: conn.source_chunk_id,
          document_id: documentId,
          embedding: oldChunkMap.get(conn.source_chunk_id)
        }
      : currentChunkMap.get(conn.source_chunk_id) || null,
    target_chunk: oldChunkMap.has(conn.target_chunk_id)
      ? {
          id: conn.target_chunk_id,
          document_id: documentId,
          embedding: oldChunkMap.get(conn.target_chunk_id)
        }
      : currentChunkMap.get(conn.target_chunk_id) || null
  }))

  // Step 5: Filter to connections involving this document
  const connections = enrichedConnections.filter(
    conn =>
      conn.source_chunk?.document_id === documentId ||
      conn.target_chunk?.document_id === documentId
  )

  if (!connections || connections.length === 0) {
    console.log('[RemapConnections] No verified connections to remap')
    return { success: [], needsReview: [], lost: [] }
  }

  console.log(`[RemapConnections] Remapping ${connections.length} verified connections...`)

  const success: Connection[] = []
  const needsReview: Array<{
    connection: Connection
    sourceMatch: { chunk: Chunk; similarity: number }
    targetMatch: { chunk: Chunk; similarity: number }
  }> = []
  const lost: Connection[] = []

  for (const conn of connections) {
    const sourceIsEdited = conn.source_chunk?.document_id === documentId
    const targetIsEdited = conn.target_chunk?.document_id === documentId

    let sourceSimilarity = 1.0
    let targetSimilarity = 1.0
    let newSourceChunkId = conn.source_chunk_id
    let newTargetChunkId = conn.target_chunk_id

    // Remap source if it was edited
    if (sourceIsEdited && conn.source_chunk?.embedding) {
      const sourceMatch = await findBestMatch(
        supabase,
        conn.source_chunk.embedding,  // Join retrieves old chunk data even if is_current: false
        newChunks
      )
      if (sourceMatch) {
        sourceSimilarity = sourceMatch.similarity
        newSourceChunkId = sourceMatch.chunk.id
      } else {
        sourceSimilarity = 0.0
      }
    }

    // Remap target if it was edited
    if (targetIsEdited && conn.target_chunk?.embedding) {
      const targetMatch = await findBestMatch(
        supabase,
        conn.target_chunk.embedding,  // Join retrieves old chunk data even if is_current: false
        newChunks
      )
      if (targetMatch) {
        targetSimilarity = targetMatch.similarity
        newTargetChunkId = targetMatch.chunk.id
      } else {
        targetSimilarity = 0.0
      }
    }

    // Classify by combined similarity
    const minSimilarity = Math.min(sourceSimilarity, targetSimilarity)

    if (minSimilarity >= 0.95) {
      // High confidence - auto-remap
      console.log(`  ✅ Auto-remapped (${(minSimilarity * 100).toFixed(1)}%): ${conn.connection_type}`)
      success.push(conn as Connection)
      await updateConnection(supabase, conn.id, newSourceChunkId, newTargetChunkId)
    } else if (minSimilarity >= 0.85) {
      // Medium confidence - needs review
      console.log(`  ⚠️  Needs review (${(minSimilarity * 100).toFixed(1)}%): ${conn.connection_type}`)
      needsReview.push({
        connection: conn as Connection,
        sourceMatch: { chunk: newChunks.find(c => c.id === newSourceChunkId)!, similarity: sourceSimilarity },
        targetMatch: { chunk: newChunks.find(c => c.id === newTargetChunkId)!, similarity: targetSimilarity }
      })
      // Still update but mark for review in metadata
      await updateConnection(supabase, conn.id, newSourceChunkId, newTargetChunkId, true)
    } else {
      // Low confidence - mark as lost, don't update chunk IDs (they'd be random at this point)
      console.log(`  ❌ Lost (${(minSimilarity * 100).toFixed(1)}%): ${conn.connection_type}`)
      lost.push(conn as Connection)

      // Mark as lost in metadata only (don't update chunk IDs with random matches)
      await supabase
        .from('connections')
        .update({
          metadata: { ...conn.metadata, lost_during_reprocessing: true, min_similarity: minSimilarity }
        })
        .eq('id', conn.id)
    }
  }

  console.log(`[RemapConnections] Results:`)
  console.log(`  ✅ Success: ${success.length}`)
  console.log(`  ⚠️  Needs Review: ${needsReview.length}`)
  console.log(`  ❌ Lost: ${lost.length}`)

  return { success, needsReview, lost }
}

/**
 * Find best matching chunk using local cosine similarity
 * Searches ONLY within newChunks, not the entire database
 *
 * @param supabase - Supabase client (unused but kept for signature compatibility)
 * @param queryEmbedding - Embedding to match
 * @param newChunks - New chunks to search (typically ~378 chunks for 500 pages)
 * @returns Best match or null
 */
async function findBestMatch(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  newChunks: Chunk[]
): Promise<{ chunk: Chunk; similarity: number } | null> {
  let bestMatch: { chunk: Chunk; similarity: number } | null = null

  for (const chunk of newChunks) {
    if (!chunk.embedding) continue

    // Parse embedding if it's a string (Supabase returns vectors as JSON strings)
    const chunkEmbedding = typeof chunk.embedding === 'string'
      ? JSON.parse(chunk.embedding)
      : chunk.embedding

    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding)

    if (similarity > 0.75 && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { chunk, similarity }
    }
  }

  return bestMatch
}

/**
 * Calculate cosine similarity between two embeddings
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Similarity score between 0 and 1
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Update connection with new chunk IDs
 *
 * @param supabase - Supabase client
 * @param connectionId - Connection ID
 * @param newSourceChunkId - New source chunk ID
 * @param newTargetChunkId - New target chunk ID
 * @param needsReview - Flag for manual review
 * @param isLost - Flag for lost connection
 */
async function updateConnection(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  newSourceChunkId: string,
  newTargetChunkId: string,
  needsReview = false,
  isLost = false
): Promise<void> {
  const metadata = needsReview
    ? { remapped: true, needs_review: true }
    : isLost
    ? { remapped: true, lost: true }
    : { remapped: true }

  const { error } = await supabase
    .from('connections')
    .update({
      source_chunk_id: newSourceChunkId,
      target_chunk_id: newTargetChunkId,
      metadata
    })
    .eq('id', connectionId)

  if (error) {
    console.error(`Failed to update connection: ${error.message}`)
  }
}
