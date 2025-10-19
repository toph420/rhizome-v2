'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { AnnotationOperations } from '@/lib/ecs/annotations'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { AnnotationEntity } from '@/types/annotations'

/**
 * Zod schema for annotation creation.
 * Updated to support multi-chunk annotations with chunkIds array.
 */
const CreateAnnotationSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkIds: z.array(z.string().uuid()).min(0).max(5).default([]), // Array of chunk IDs (min 0 allows gap regions)
  documentId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.enum(['yellow', 'green', 'blue', 'red', 'purple', 'orange', 'pink']),
  note: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  textContext: z.object({
    before: z.string(),
    content: z.string(),
    after: z.string(),
  }),
})

/**
 * Creates annotation entity with 5 components (Position, Visual, Content, Temporal, ChunkRef).
 * @param data - Annotation creation data.
 * @returns Success with entity ID or error.
 */
export async function createAnnotation(
  data: z.infer<typeof CreateAnnotationSchema>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Validate input
    const validated = CreateAnnotationSchema.parse(data)

    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Get chunk index for recovery optimization
    const primaryChunkId = validated.chunkIds.length > 0 ? validated.chunkIds[0] : null
    let chunkIndex = -1

    if (primaryChunkId) {
      const { data: chunks } = await supabase
        .from('chunks')
        .select('id, chunk_index')
        .eq('document_id', validated.documentId)
        .eq('is_current', true)
        .order('chunk_index')

      chunkIndex = chunks?.findIndex(c => c.id === primaryChunkId) ?? -1
    }

    // Use AnnotationOperations wrapper
    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    const entityId = await ops.create({
      documentId: validated.documentId,
      startOffset: validated.startOffset,
      endOffset: validated.endOffset,
      originalText: validated.text,
      chunkIds: validated.chunkIds.length > 0 ? validated.chunkIds : [''], // Handle gap regions
      type: 'highlight', // Default type
      color: validated.color,
      note: validated.note,
      tags: validated.tags,
      textContext: {
        before: validated.textContext.before,
        after: validated.textContext.after,
      },
      originalChunkIndex: chunkIndex >= 0 ? chunkIndex : undefined,
    })

    console.log(`[Annotations] ✓ Created: ${entityId}`)

    return { success: true, id: entityId }
  } catch (error) {
    console.error('[Annotations] Create failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Updates annotation component data (note, color, tags).
 * @param entityId - Entity ID.
 * @param updates - Partial annotation data.
 * @param updates.note - Optional note text.
 * @param updates.color - Optional color value.
 * @param updates.tags - Optional tags array.
 * @param updates.type - Optional visual type.
 * @returns Success or error.
 */
export async function updateAnnotation(
  entityId: string,
  updates: { note?: string; tags?: string[]; color?: string; type?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    await ops.update(entityId, {
      note: updates.note,
      tags: updates.tags,
      color: updates.color as any, // Type assertion for color enum
      type: updates.type as any, // Type assertion for type enum
    })

    console.log(`[Annotations] ✓ Updated: ${entityId}`)

    return { success: true }
  } catch (error) {
    console.error('[Annotations] Update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Deletes annotation entity (cascades to all components).
 * @param entityId - Entity ID to delete.
 * @returns Success or error.
 */
export async function deleteAnnotation(
  entityId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    await ops.delete(entityId)

    console.log(`[Annotations] ✓ Deleted: ${entityId}`)

    return { success: true }
  } catch (error) {
    console.error('[Annotations] Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Gets all annotations for a document.
 * @param documentId - Document ID to query.
 * @returns Array of AnnotationEntity objects.
 */
export async function getAnnotations(
  documentId: string
): Promise<AnnotationEntity[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const ecs = createECS()
  const ops = new AnnotationOperations(ecs, user.id)

  return await ops.getByDocument(documentId)
}

/**
 * Gets annotations needing review after document reprocessing.
 *
 * @param documentId - Document ID to query.
 * @returns RecoveryResults categorized by confidence level.
 */
export async function getAnnotationsNeedingReview(
  documentId: string
) {
  const user = await getCurrentUser()
  if (!user) return { success: [], needsReview: [], lost: [] }

  const ecs = createECS()
  const ops = new AnnotationOperations(ecs, user.id)

  const allAnnotations = await ops.getByDocument(documentId)

  const success: any[] = []
  const needsReview: any[] = []
  const lost: any[] = []

  for (const annotation of allAnnotations) {
    const position = annotation.components.Position
    const content = annotation.components.Content
    const visual = annotation.components.Visual

    // Skip annotations missing required components (shouldn't happen with 5-component pattern)
    if (!position || !content || !visual) {
      console.warn(`[getAnnotationsNeedingReview] Skipping annotation ${annotation.id} - missing components`)
      continue
    }

    const confidence = position.recoveryConfidence ?? 0
    const method = position.recoveryMethod

    if (method === 'lost' || confidence === 0) {
      lost.push({
        entityId: annotation.id,
        originalText: position.originalText,
        note: content.note,
        color: visual.color,
        confidence: 0,
        method: 'lost',
      })
    } else if (position.needsReview) {
      needsReview.push({
        entityId: annotation.id,
        originalText: position.originalText,
        note: content.note,
        color: visual.color,
        confidence,
        method,
        suggestedMatch: {
          text: position.originalText,
          context: position.textContext,
        },
      })
    } else {
      success.push({
        entityId: annotation.id,
        text: position.originalText,
        note: content.note,
        color: visual.color,
        confidence,
        method,
      })
    }
  }

  return { success, needsReview, lost }
}

/**
 * Get annotations for a document as AnnotationEntity objects
 * Used by QuickSparkCapture to show linkable annotations
 *
 * @param documentId - Document ID to query
 * @returns Array of AnnotationEntity objects
 */
export async function getAnnotationsByDocument(
  documentId: string
): Promise<AnnotationEntity[]> {
  try {
    const user = await getCurrentUser()
    if (!user) return []

    const ecs = createECS()
    const supabase = await createClient()

    // Query for all annotation entities in this document
    const { data: positionComponents } = await supabase
      .from('components')
      .select('entity_id')
      .eq('component_type', 'Position')
      .eq('data->>documentId', documentId)

    if (!positionComponents || positionComponents.length === 0) {
      return []
    }

    const entityIds = positionComponents.map(c => c.entity_id)

    // Get all components for these entities
    const { data: allComponents } = await supabase
      .from('components')
      .select('entity_id, component_type, data, created_at, updated_at')
      .in('entity_id', entityIds)

    if (!allComponents) return []

    // Group components by entity_id
    const entityMap = new Map<string, any[]>()
    for (const comp of allComponents) {
      if (!entityMap.has(comp.entity_id)) {
        entityMap.set(comp.entity_id, [])
      }
      entityMap.get(comp.entity_id)!.push(comp)
    }

    // Build AnnotationEntity objects
    const annotations: AnnotationEntity[] = []
    for (const [entityId, comps] of entityMap.entries()) {
      const position = comps.find(c => c.component_type === 'Position')
      const content = comps.find(c => c.component_type === 'Content')
      const visual = comps.find(c => c.component_type === 'Visual')
      const temporal = comps.find(c => c.component_type === 'Temporal')

      // Only include complete annotations
      if (position && content && visual && temporal) {
        const entity = await ecs.getEntity(entityId, user.id)
        if (entity) {
          annotations.push({
            id: entityId,
            user_id: user.id,
            created_at: entity.created_at,
            updated_at: entity.updated_at,
            components: {
              Position: position.data,
              Content: content.data,
              Visual: visual.data,
              Temporal: temporal.data,
            }
          } as AnnotationEntity)
        }
      }
    }

    return annotations
  } catch (error) {
    console.error('[getAnnotationsByDocument] Failed:', error)
    return []
  }
}

/**
 * Get specific annotations by their entity IDs.
 * Used for lazy loading annotation content in spark panel.
 *
 * @param ids - Array of annotation entity IDs
 * @returns Array of AnnotationEntity objects
 */
export async function getAnnotationsByIds(
  ids: string[]
): Promise<AnnotationEntity[]> {
  try {
    const user = await getCurrentUser()
    if (!user) return []

    const ecs = createECS()
    const annotations: AnnotationEntity[] = []

    for (const entityId of ids) {
      const entity = await ecs.getEntity(entityId, user.id)
      if (!entity) continue

      const components = entity.components || []

      // Use PascalCase component names
      const position = components.find(c => c.component_type === 'Position')
      const visual = components.find(c => c.component_type === 'Visual')
      const content = components.find(c => c.component_type === 'Content')
      const temporal = components.find(c => c.component_type === 'Temporal')
      const chunkRef = components.find(c => c.component_type === 'ChunkRef')

      // Only include complete annotations (all 5 components)
      if (position && visual && content && temporal && chunkRef) {
        annotations.push({
          id: entityId,
          user_id: user.id,
          created_at: entity.created_at,
          updated_at: entity.updated_at,
          components: {
            Position: position.data as any,
            Visual: visual.data as any,
            Content: content.data as any,
            Temporal: temporal.data as any,
            ChunkRef: chunkRef.data as any,
          }
        } as AnnotationEntity)
      }
    }

    return annotations
  } catch (error) {
    console.error('[getAnnotationsByIds] Failed:', error)
    return []
  }
}