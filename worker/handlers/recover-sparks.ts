/**
 * Spark Recovery Handler
 * Recovers user sparks after document edits using dual strategy
 *
 * 2-mode recovery:
 * 1. Selection-based recovery (if spark has selections) - uses 4-tier fuzzy matching
 * 2. Semantic recovery (if thought-only spark) - uses embedding similarity
 */

import { createClient } from '@supabase/supabase-js'
import { findAnnotationMatch } from '../../src/lib/fuzzy-matching.js'
import { embed } from 'ai'
import { google } from '@ai-sdk/google'
import type { Chunk } from '../types/recovery.js'

interface SparkSelection {
  text: string
  chunkId: string
  startOffset: number
  endOffset: number
  textContext?: {
    before: string
    after: string
  }
  recoveryConfidence?: number
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'semantic' | 'lost'
}

interface SparkRecoveryResults {
  success: string[]
  needsReview: string[]
  orphaned: string[]
}

/**
 * Recover sparks for a document after reprocessing
 *
 * @param documentId - Document ID to recover sparks for
 * @param newMarkdown - New markdown content after edit
 * @param newChunks - New chunks after reprocessing
 * @returns Recovery results with success, needsReview, and orphaned sparks
 */
export async function recoverSparks(
  documentId: string,
  newMarkdown: string,
  newChunks: Chunk[],
  supabaseClient?: any
): Promise<SparkRecoveryResults> {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log(`[RecoverSparks] Starting recovery for document ${documentId}...`)

  const results: SparkRecoveryResults = {
    success: [],
    needsReview: [],
    orphaned: []
  }

  // 1. Get all spark entity IDs for this document
  const { data: chunkRefComponents } = await supabase
    .from('components')
    .select('entity_id, data')
    .eq('component_type', 'ChunkRef')
    .eq('data->>document_id', documentId)

  if (!chunkRefComponents || chunkRefComponents.length === 0) {
    console.log('[RecoverSparks] No sparks to recover')
    return results
  }

  // Filter to only entities that have Spark component
  const entityIds = chunkRefComponents.map((c: { entity_id: string }) => c.entity_id)

  const { data: sparkComponents } = await supabase
    .from('components')
    .select('entity_id, data')
    .eq('component_type', 'Spark')
    .in('entity_id', entityIds)

  if (!sparkComponents || sparkComponents.length === 0) {
    console.log('[RecoverSparks] No spark components found')
    return results
  }

  const sparkEntityIds = new Set<string>(sparkComponents.map((c: { entity_id: string }) => c.entity_id))

  console.log(`[RecoverSparks] Found ${sparkEntityIds.size} sparks to recover`)

  // 2. Process each spark
  for (const entityId of Array.from(sparkEntityIds)) {
    try {
      // Get all components for this spark
      const { data: components } = await supabase
        .from('components')
        .select('id, component_type, data')
        .eq('entity_id', entityId)

      if (!components) continue

      type ComponentData = { id: string; component_type: string; data: any }
      const spark = components.find((c: ComponentData) => c.component_type === 'Spark')
      const content = components.find((c: ComponentData) => c.component_type === 'Content')
      const chunkRef = components.find((c: ComponentData) => c.component_type === 'ChunkRef')

      if (!spark || !content || !chunkRef) continue

      // Determine recovery strategy based on selections
      if (spark.data.selections && spark.data.selections.length > 0) {
        // Selection-based recovery (like annotations)
        await recoverSelectionBasedSpark(
          supabase,
          entityId,
          components,
          newMarkdown,
          newChunks,
          results
        )
      } else {
        // Semantic recovery (for thought-only sparks)
        await recoverThoughtBasedSpark(
          supabase,
          entityId,
          components,
          newChunks,
          results
        )
      }
    } catch (error) {
      console.error(`[RecoverSparks] Error recovering spark ${entityId}:`, error)
      results.orphaned.push(entityId)
    }
  }

  console.log(`[RecoverSparks] Results:`)
  console.log(`  ✅ Success: ${results.success.length}`)
  console.log(`  ⚠️  Needs Review: ${results.needsReview.length}`)
  console.log(`  ❌ Orphaned: ${results.orphaned.length}`)

  return results
}

/**
 * Recover selection-based spark using 4-tier fuzzy matching
 * Same strategy as annotations
 */
async function recoverSelectionBasedSpark(
  supabase: any,
  entityId: string,
  components: any[],
  newMarkdown: string,
  newChunks: Chunk[],
  results: SparkRecoveryResults
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')
  const selections = spark.data.selections as SparkSelection[]

  console.log(`[RecoverSparks] Recovering selection-based spark ${entityId} (${selections.length} selections)...`)

  const recoveredSelections: SparkSelection[] = []
  let totalConfidence = 0
  let successCount = 0

  // Try to recover each selection
  for (const selection of selections) {
    const match = findAnnotationMatch(
      {
        id: entityId,
        text: selection.text,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        textContext: selection.textContext,
        originalChunkIndex: undefined // TODO: Track chunk index in selection
      },
      newMarkdown,
      newChunks
    )

    if (match && match.confidence > 0.7) {
      recoveredSelections.push({
        ...selection,
        chunkId: getChunkIdAtOffset(match.startOffset, newChunks),
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        textContext: {
          before: match.contextBefore || '',
          after: match.contextAfter || ''
        },
        recoveryConfidence: match.confidence,
        recoveryMethod: match.method as any
      })
      totalConfidence += match.confidence
      successCount++
    }
  }

  // Calculate average confidence
  const avgConfidence = successCount > 0 ? totalConfidence / selections.length : 0

  // Update spark components
  if (successCount > 0) {
    // Update Spark component with recovered selections
    await supabase
      .from('components')
      .update({
        data: {
          ...spark.data,
          selections: recoveredSelections,
          recoveryConfidence: avgConfidence,
          recoveryMethod: 'selections',
          needsReview: avgConfidence < 0.85
        }
      })
      .eq('id', spark.id)

    // Update ChunkRef with new chunk IDs
    const newChunkIds = Array.from(new Set(recoveredSelections.map(s => s.chunkId)))
    const chunkRef = components.find(c => c.component_type === 'ChunkRef')

    await supabase
      .from('components')
      .update({
        data: {
          ...chunkRef.data,
          chunkId: newChunkIds[0],
          chunk_id: newChunkIds[0],
          chunkIds: newChunkIds
        }
      })
      .eq('id', chunkRef.id)

    // Update Temporal.lastRecoveredAt
    const temporal = components.find(c => c.component_type === 'Temporal')
    await supabase
      .from('components')
      .update({
        data: {
          ...temporal.data,
          lastRecoveredAt: new Date().toISOString()
        }
      })
      .eq('id', temporal.id)

    // Classify result
    if (avgConfidence >= 0.85) {
      console.log(`  ✅ Auto-recovered (${(avgConfidence * 100).toFixed(1)}%): ${successCount}/${selections.length} selections`)
      results.success.push(entityId)
    } else {
      console.log(`  ⚠️  Needs review (${(avgConfidence * 100).toFixed(1)}%): ${successCount}/${selections.length} selections`)
      results.needsReview.push(entityId)
    }
  } else {
    // No selections recovered - mark as orphaned
    console.log(`  ❌ Orphaned: 0/${selections.length} selections recovered`)
    await markSparkOrphaned(supabase, components)
    results.orphaned.push(entityId)
  }
}

/**
 * Recover thought-based spark using semantic similarity
 * Matches on Content.note + originalChunkContent
 */
async function recoverThoughtBasedSpark(
  supabase: any,
  entityId: string,
  components: any[],
  newChunks: Chunk[],
  results: SparkRecoveryResults
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')
  const content = components.find(c => c.component_type === 'Content')

  console.log(`[RecoverSparks] Recovering thought-based spark ${entityId}...`)

  // Build context text from thought + original chunk content
  const contextText = [
    content.data.note,
    spark.data.originalChunkContent
  ].filter(Boolean).join(' ')

  if (!contextText) {
    console.log(`  ❌ Orphaned: No context available for semantic matching`)
    await markSparkOrphaned(supabase, components)
    results.orphaned.push(entityId)
    return
  }

  // Generate embedding
  const { embedding: sparkEmbedding } = await embed({
    model: google.textEmbedding('text-embedding-004'),
    value: contextText,
    providerOptions: {
      google: {
        outputDimensionality: 768
      }
    }
  })

  // Get embeddings for new chunks
  const chunkEmbeddings = await Promise.all(
    newChunks.map(async (chunk: any) => {
      const { data } = await supabase
        .from('chunks')
        .select('embedding')
        .eq('id', chunk.id)
        .single()

      return {
        chunkId: chunk.id,
        embedding: data?.embedding
      }
    })
  )

  // Calculate cosine similarity
  const similarities = chunkEmbeddings
    .filter(c => c.embedding)
    .map(c => ({
      chunkId: c.chunkId,
      score: cosineSimilarity(sparkEmbedding, c.embedding)
    }))
    .sort((a, b) => b.score - a.score)

  const bestMatch = similarities[0]

  if (bestMatch && bestMatch.score > 0.85) {
    // High confidence - auto-recover
    console.log(`  ✅ Auto-recovered (${(bestMatch.score * 100).toFixed(1)}%) to chunk ${bestMatch.chunkId}`)

    await updateSparkAfterRecovery(
      supabase,
      components,
      bestMatch.chunkId,
      similarities.slice(0, 3).map(s => s.chunkId),
      bestMatch.score,
      'semantic',
      false
    )

    results.success.push(entityId)
  } else if (bestMatch && bestMatch.score > 0.70) {
    // Medium confidence - needs review
    console.log(`  ⚠️  Needs review (${(bestMatch.score * 100).toFixed(1)}%) to chunk ${bestMatch.chunkId}`)

    await updateSparkAfterRecovery(
      supabase,
      components,
      bestMatch.chunkId,
      similarities.slice(0, 3).map(s => s.chunkId),
      bestMatch.score,
      'semantic',
      true
    )

    results.needsReview.push(entityId)
  } else {
    // Low confidence - mark as orphaned
    console.log(`  ❌ Orphaned: Low similarity (${bestMatch ? (bestMatch.score * 100).toFixed(1) : '0.0'}%)`)
    await markSparkOrphaned(supabase, components)
    results.orphaned.push(entityId)
  }
}

/**
 * Update spark components after successful recovery
 */
async function updateSparkAfterRecovery(
  supabase: any,
  components: any[],
  newChunkId: string,
  newChunkIds: string[],
  confidence: number,
  method: string,
  needsReview: boolean
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')
  const chunkRef = components.find(c => c.component_type === 'ChunkRef')
  const temporal = components.find(c => c.component_type === 'Temporal')

  // Update Spark component
  await supabase
    .from('components')
    .update({
      data: {
        ...spark.data,
        recoveryConfidence: confidence,
        recoveryMethod: method,
        needsReview
      }
    })
    .eq('id', spark.id)

  // Update ChunkRef component
  await supabase
    .from('components')
    .update({
      data: {
        ...chunkRef.data,
        chunkId: newChunkId,
        chunk_id: newChunkId,
        chunkIds: newChunkIds
      }
    })
    .eq('id', chunkRef.id)

  // Update Temporal component
  await supabase
    .from('components')
    .update({
      data: {
        ...temporal.data,
        lastRecoveredAt: new Date().toISOString()
      }
    })
    .eq('id', temporal.id)
}

/**
 * Mark spark as orphaned (origin chunk no longer exists)
 */
async function markSparkOrphaned(
  supabase: any,
  components: any[]
): Promise<void> {
  const spark = components.find(c => c.component_type === 'Spark')

  await supabase
    .from('components')
    .update({
      data: {
        ...spark.data,
        orphaned: true,
        recoveryMethod: 'orphaned',
        needsReview: true
      }
    })
    .eq('id', spark.id)
}

/**
 * Helper: Get chunk ID at document offset
 */
function getChunkIdAtOffset(offset: number, chunks: Chunk[]): string {
  const chunk = chunks.find(
    c => c.start_offset <= offset && c.end_offset >= offset
  )
  return chunk?.id || chunks[0]?.id || ''
}

/**
 * Helper: Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}
