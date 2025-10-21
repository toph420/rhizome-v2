import { promises as fs } from 'fs'
import { SupabaseClient } from '@supabase/supabase-js'
import { recoverSparks } from '../handlers/recover-sparks.js'

/**
 * Import sparks from vault JSON
 * Uses direct restore if chunk IDs match, otherwise triggers recovery
 */
export async function importSparksFromVault(
  documentId: string,
  sparksJsonPath: string,
  markdown: string,
  currentChunks: Array<{ id: string; chunk_index: number; start_offset: number; end_offset: number; content: string }>,
  supabase: SupabaseClient,
  userId: string
): Promise<{ imported: number; recovered: number; method: 'direct' | 'recovery' }> {
  // Read sparks JSON
  const jsonContent = await fs.readFile(sparksJsonPath, 'utf-8')
  const sparksData = JSON.parse(jsonContent)

  if (!sparksData.entities || sparksData.entities.length === 0) {
    console.log('[ImportSparks] No sparks to import')
    return { imported: 0, recovered: 0, method: 'direct' }
  }

  // Check if chunk IDs still exist in current chunks
  const currentChunkIds = new Set(currentChunks.map(c => c.id))
  const allChunkIdsExist = sparksData.entities.every((entity: any) => {
    const chunkRef = entity.components?.ChunkRef?.data
    if (!chunkRef) return false

    // Check primary chunkId
    if (chunkRef.chunkId && !currentChunkIds.has(chunkRef.chunkId)) return false

    // Check all chunkIds array
    if (chunkRef.chunkIds) {
      return chunkRef.chunkIds.every((id: string) => currentChunkIds.has(id))
    }

    return true
  })

  if (allChunkIdsExist) {
    // ✅ FAST PATH: Direct restore (chunk IDs match)
    console.log('[ImportSparks] Chunk IDs match - direct restore')
    let imported = 0

    for (const entity of sparksData.entities) {
      const components = entity.components

      // Check if entity already exists (from previous failed import)
      const { data: existingEntity } = await supabase
        .from('components')
        .select('entity_id')
        .eq('entity_id', entity.entity_id)
        .limit(1)
        .single()

      if (existingEntity) {
        console.log(`[ImportSparks] Entity ${entity.entity_id} already exists, skipping`)
        continue
      }

      // Create entity first (required by foreign key constraint)
      const { error: entityError } = await supabase
        .from('entities')
        .insert({
          id: entity.entity_id,
          user_id: userId,
          entity_type: 'spark'
        })

      if (entityError) {
        console.warn(`Failed to create entity ${entity.entity_id}:`, entityError.message)
        continue
      }

      // Insert Spark component
      const sparkData = components.Spark.data
      const { error: sparkError } = await supabase
        .from('components')
        .insert({
          entity_id: entity.entity_id,
          component_type: 'Spark',
          document_id: documentId,  // Set column for query filtering
          data: sparkData
        })

      if (sparkError) {
        console.warn(`Failed to import Spark for ${entity.entity_id}:`, sparkError.message)
        continue
      }

      // Insert Content component
      await supabase
        .from('components')
        .insert({
          entity_id: entity.entity_id,
          component_type: 'Content',
          data: components.Content.data
        })

      // Insert Temporal component
      await supabase
        .from('components')
        .insert({
          entity_id: entity.entity_id,
          component_type: 'Temporal',
          data: components.Temporal.data
        })

      // Insert ChunkRef component
      const chunkRefData = components.ChunkRef.data
      await supabase
        .from('components')
        .insert({
          entity_id: entity.entity_id,
          component_type: 'ChunkRef',
          document_id: documentId,  // Set column for query filtering
          chunk_id: chunkRefData.chunkId || null,  // Set primary chunk_id
          data: chunkRefData
        })

      imported++
    }

    console.log(`[ImportSparks] ✓ Direct restore: ${imported} sparks`)
    return { imported, recovered: 0, method: 'direct' }

  } else {
    // 🔄 RECOVERY PATH: Chunk IDs changed, use recovery handler
    console.log('[ImportSparks] Chunk IDs changed - triggering recovery')

    const recoveryResults = await recoverSparks(
      documentId,
      markdown,
      currentChunks,
      supabase
    )

    const recovered = recoveryResults.success.length + recoveryResults.needsReview.length
    console.log(`[ImportSparks] ✓ Recovery complete: ${recovered} sparks recovered`)
    console.log(`[ImportSparks]   - Success: ${recoveryResults.success.length}`)
    console.log(`[ImportSparks]   - Needs review: ${recoveryResults.needsReview.length}`)
    console.log(`[ImportSparks]   - Orphaned: ${recoveryResults.orphaned.length}`)

    return { imported: 0, recovered, method: 'recovery' }
  }
}
