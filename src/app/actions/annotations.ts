'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/auth'
import type {
  StoredAnnotation,
  AnnotationData,
  PositionData,
  SourceData,
} from '@/types/annotations'

/**
 * Zod schema for annotation creation.
 * Updated to support multi-chunk annotations with chunkIds array.
 */
const CreateAnnotationSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkIds: z.array(z.string().uuid()).min(1).max(5), // Array of chunk IDs (max 5)
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
 * Creates annotation entity with 3 components (annotation, position, source).
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

    // Create ECS instance
    const ecs = createECS()

    // Get primary chunk (first in array)
    const primaryChunkId = validated.chunkIds[0]

    // Create entity with 3 components
    const entityId = await ecs.createEntity(user.id, {
      annotation: {
        text: validated.text,
        note: validated.note,
        tags: validated.tags || [],
        color: validated.color,
        range: {
          startOffset: validated.startOffset,
          endOffset: validated.endOffset,
          chunkIds: validated.chunkIds, // Array of chunk IDs
        },
        textContext: validated.textContext,
      },
      position: {
        chunkIds: validated.chunkIds, // Array of chunk IDs
        startOffset: validated.startOffset,
        endOffset: validated.endOffset,
        confidence: 1.0, // Exact match on creation
        method: 'exact',
        textContext: {
          before: validated.textContext.before,
          after: validated.textContext.after,
        },
      },
      source: {
        chunk_id: primaryChunkId, // Primary chunk for ECS filtering
        chunk_ids: validated.chunkIds, // All chunks for connection graph queries
        document_id: validated.documentId,
      },
    })

    // No revalidation needed - client handles optimistic updates
    return { success: true, id: entityId }
  } catch (error) {
    console.error('Failed to create annotation:', error)
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
 * @returns Success or error.
 */
export async function updateAnnotation(
  entityId: string,
  updates: { note?: string; color?: string; tags?: string[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ecs = createECS()

    // Get entity to find annotation component
    const entity = await ecs.getEntity(entityId, user.id)
    if (!entity) {
      return { success: false, error: 'Annotation not found' }
    }

    const annotationComponent = entity.components?.find(
      (c) => c.component_type === 'annotation'
    )

    if (!annotationComponent) {
      return { success: false, error: 'Annotation component not found' }
    }

    // Merge updates with existing data
    const updatedData = {
      ...annotationComponent.data,
      ...updates,
    }

    await ecs.updateComponent(annotationComponent.id, updatedData, user.id)

    // No revalidation needed - client handles optimistic updates

    return { success: true }
  } catch (error) {
    console.error('Failed to update annotation:', error)
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
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ecs = createECS()
    await ecs.deleteEntity(entityId, user.id)

    return { success: true }
  } catch (error) {
    console.error('Failed to delete annotation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Gets all annotations for a document.
 * @param documentId - Document ID to query.
 * @returns Array of StoredAnnotation entities.
 */
export async function getAnnotations(
  documentId: string
): Promise<{ success: boolean; data: StoredAnnotation[]; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, data: [], error: 'Not authenticated' }
    }

    const ecs = createECS()

    const entities = await ecs.query(
      ['annotation', 'position', 'source'],
      user.id,
      { document_id: documentId }
    )

    // Map to StoredAnnotation interface
    // ComponentData is intentionally 'any' for ECS flexibility, so we type-assert
    const annotations: StoredAnnotation[] = entities.map((entity) => ({
      id: entity.id,
      user_id: entity.user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      components: {
        annotation: entity.components?.find((c) => c.component_type === 'annotation')
          ?.data as unknown as AnnotationData | undefined,
        position: entity.components?.find((c) => c.component_type === 'position')
          ?.data as unknown as PositionData | undefined,
        source: entity.components?.find((c) => c.component_type === 'source')
          ?.data as unknown as SourceData | undefined,
      },
    }))

    return { success: true, data: annotations }
  } catch (error) {
    console.error('Failed to get annotations:', error)
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}