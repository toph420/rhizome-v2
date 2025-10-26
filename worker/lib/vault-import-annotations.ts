import { promises as fs } from 'fs'
import { SupabaseClient } from '@supabase/supabase-js'
import { findAnnotationMatch } from '../../src/lib/fuzzy-matching.js'
import type { AnnotationMatchResult } from '../types/recovery.js'

/**
 * Import annotations from vault JSON
 * Uses direct restore if chunk IDs match, otherwise triggers recovery
 */
export async function importAnnotationsFromVault(
  documentId: string,
  annotationsJsonPath: string,
  markdown: string,
  currentChunks: Array<{ id: string; chunk_index: number; start_offset: number; end_offset: number; content: string }>,
  supabase: SupabaseClient,
  userId: string
): Promise<{ imported: number; recovered: number; method: 'direct' | 'recovery' }> {
  // Read annotations JSON
  const jsonContent = await fs.readFile(annotationsJsonPath, 'utf-8')
  const annotationsData = JSON.parse(jsonContent)

  if (!annotationsData.entities || annotationsData.entities.length === 0) {
    console.log('[ImportAnnotations] No annotations to import')
    return { imported: 0, recovered: 0, method: 'direct' }
  }

  // Check if chunk IDs still exist in current chunks
  const currentChunkIds = new Set(currentChunks.map(c => c.id))
  const allChunkIdsExist = annotationsData.entities.every((entity: any) => {
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
    console.log('[ImportAnnotations] Chunk IDs match - direct restore')
    let imported = 0

    for (const entity of annotationsData.entities) {
      const components = entity.components

      // Check if entity already exists (from previous failed import)
      const { data: existingEntity } = await supabase
        .from('components')
        .select('entity_id')
        .eq('entity_id', entity.entity_id)
        .limit(1)
        .single()

      if (existingEntity) {
        console.log(`[ImportAnnotations] Entity ${entity.entity_id} already exists, skipping`)
        continue
      }

      // Create entity first (required by foreign key constraint)
      const { error: entityError } = await supabase
        .from('entities')
        .insert({
          id: entity.entity_id,
          user_id: userId,
          entity_type: 'annotation'
        })

      if (entityError) {
        console.warn(`Failed to create entity ${entity.entity_id}:`, entityError.message)
        continue
      }

      // Insert Position component
      const { error: posError } = await supabase
        .from('components')
        .insert({
          entity_id: entity.entity_id,
          component_type: 'Position',
          document_id: documentId,  // Set column for query filtering
          data: components.Position.data
        })

      if (posError) {
        console.warn(`Failed to import Position for ${entity.entity_id}:`, posError.message)
        continue
      }

      // Insert Visual component
      await supabase
        .from('components')
        .insert({
          entity_id: entity.entity_id,
          component_type: 'Visual',
          data: components.Visual.data
        })

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

    console.log(`[ImportAnnotations] ✓ Direct restore: ${imported} annotations`)
    return { imported, recovered: 0, method: 'direct' }

  } else {
    // 🔄 RECOVERY PATH: Chunk IDs changed, do fuzzy matching from JSON
    console.log('[ImportAnnotations] Chunk IDs changed - recovering from JSON via fuzzy matching')

    let recovered = 0
    let needsReview = 0
    let lost = 0

    for (const entity of annotationsData.entities) {
      const components = entity.components
      const position = components?.Position?.data

      if (!position || !position.originalText) {
        console.warn(`[ImportAnnotations] Skipping entity ${entity.entity_id} - no originalText`)
        lost++
        continue
      }

      // Try fuzzy matching to find new chunk location
      const match = findAnnotationMatch(
        {
          id: entity.entity_id,
          text: position.originalText,
          startOffset: position.startOffset,
          endOffset: position.endOffset,
          textContext: position.textContext,
          originalChunkIndex: position.chunkIndex
        },
        markdown,
        currentChunks
      )

      if (!match) {
        // No match found - skip this annotation
        console.log(`  ❌ Lost: "${position.originalText.slice(0, 50)}..."`)
        lost++
        continue
      }

      // Find new chunk ID at matched offset
      const newChunk = currentChunks.find(
        c => c.start_offset <= match.startOffset && c.end_offset >= match.endOffset
      )

      if (!newChunk) {
        console.warn(`[ImportAnnotations] No chunk found at offset ${match.startOffset}`)
        lost++
        continue
      }

      // Update position data with recovered offsets
      const updatedPosition = {
        ...position,
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        textContext: {
          before: match.contextBefore || '',
          after: match.contextAfter || ''
        },
        recoveryConfidence: match.confidence,
        recoveryMethod: match.method,
        needsReview: match.confidence < 0.85
      }

      // Update ChunkRef with new chunk ID
      const updatedChunkRef = {
        ...components.ChunkRef.data,
        documentId: documentId,
        chunkId: newChunk.id,
        chunkIds: [newChunk.id]
      }

      // Check if entity already exists
      const { data: existingEntity } = await supabase
        .from('components')
        .select('entity_id')
        .eq('entity_id', entity.entity_id)
        .limit(1)
        .single()

      if (existingEntity) {
        console.log(`[ImportAnnotations] Entity ${entity.entity_id} already exists, skipping`)
        continue
      }

      // Insert components with updated data
      await supabase.from('components').insert({
        entity_id: entity.entity_id,
        component_type: 'Position',
        data: updatedPosition,
        recovery_confidence: match.confidence,
        recovery_method: match.method,
        needs_review: match.confidence < 0.85
      })

      await supabase.from('components').insert({
        entity_id: entity.entity_id,
        component_type: 'Visual',
        data: components.Visual.data
      })

      await supabase.from('components').insert({
        entity_id: entity.entity_id,
        component_type: 'Content',
        data: components.Content.data
      })

      await supabase.from('components').insert({
        entity_id: entity.entity_id,
        component_type: 'Temporal',
        data: components.Temporal.data
      })

      await supabase.from('components').insert({
        entity_id: entity.entity_id,
        component_type: 'ChunkRef',
        data: updatedChunkRef
      })

      if (match.confidence >= 0.85) {
        console.log(`  ✅ Auto-recovered (${(match.confidence * 100).toFixed(1)}%): "${position.originalText.slice(0, 50)}..."`)
        recovered++
      } else {
        console.log(`  ⚠️  Needs review (${(match.confidence * 100).toFixed(1)}%): "${position.originalText.slice(0, 50)}..."`)
        needsReview++
        recovered++
      }
    }

    console.log(`[ImportAnnotations] ✓ Recovery from JSON complete:`)
    console.log(`[ImportAnnotations]   - Auto-recovered: ${recovered - needsReview}`)
    console.log(`[ImportAnnotations]   - Needs review: ${needsReview}`)
    console.log(`[ImportAnnotations]   - Lost: ${lost}`)

    return { imported: 0, recovered, method: 'recovery' }
  }
}
