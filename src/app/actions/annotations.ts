'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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
    const supabase = await createClient()

    // Get primary chunk (first in array, or null for gap regions)
    const primaryChunkId = validated.chunkIds.length > 0 ? validated.chunkIds[0] : null

    // ENHANCEMENT: Find chunk index for chunk-bounded recovery
    // This enables 50-75x performance boost during annotation recovery
    // Skip if no chunks (gap region annotation)
    let chunkIndex = -1
    if (primaryChunkId) {
      const { data: chunks } = await supabase
        .from('chunks')
        .select('id, chunk_index, start_offset, end_offset')
        .eq('document_id', validated.documentId)
        .eq('is_current', true)
        .order('chunk_index')

      chunkIndex = chunks?.findIndex(
        c => c.id === primaryChunkId
      ) ?? -1
    }

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
        originalChunkIndex: chunkIndex >= 0 ? chunkIndex : undefined, // For chunk-bounded recovery
      },
      source: {
        chunk_id: primaryChunkId || null, // Primary chunk for ECS filtering (null for gap regions)
        chunk_ids: validated.chunkIds, // All chunks for connection graph queries
        document_id: validated.documentId,
      },
    })

    // Update position component with originalChunkIndex in database
    if (chunkIndex >= 0) {
      const { data: positionComponent } = await supabase
        .from('components')
        .select('id')
        .eq('entity_id', entityId)
        .eq('component_type', 'position')
        .single()

      if (positionComponent) {
        await supabase
          .from('components')
          .update({ original_chunk_index: chunkIndex })
          .eq('id', positionComponent.id)
      }
    }

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

    // NOTE: No revalidation - client handles optimistic updates
    // QuickCapturePanel calls onAnnotationUpdated() immediately for instant UI updates

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

    // NOTE: No revalidation - client handles optimistic updates
    // Component should remove annotation from local state immediately

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

/**
 * Gets annotations needing review after document reprocessing.
 *
 * Uses optimized query strategy: filters by documentId FIRST at database level,
 * then fetches related components. Includes comprehensive edge case handling.
 *
 * @param documentId - Document ID to query.
 * @returns RecoveryResults categorized by confidence level, or null if no recovered annotations.
 */
export async function getAnnotationsNeedingReview(
  documentId: string
): Promise<{
  success: Array<{
    id: string
    text: string
    startOffset: number
    endOffset: number
    textContext?: { before: string; after: string }
    originalChunkIndex?: number
  }>
  needsReview: Array<{
    annotation: {
      id: string
      text: string
      startOffset: number
      endOffset: number
      textContext?: { before: string; after: string }
      originalChunkIndex?: number
    }
    suggestedMatch: {
      text: string
      startOffset: number
      endOffset: number
      confidence: number
      method: 'exact' | 'context' | 'chunk_bounded' | 'trigram'
      contextBefore?: string
      contextAfter?: string
    }
  }>
  lost: Array<{
    id: string
    text: string
    startOffset: number
    endOffset: number
    textContext?: { before: string; after: string }
    originalChunkIndex?: number
  }>
}> {
  try {
    const supabase = await createClient()
    const user = await getCurrentUser()

    if (!user) {
      return { success: [], needsReview: [], lost: [] }
    }

    // OPTIMIZATION: Filter by documentId FIRST at database level
    // This prevents fetching recovery data for all documents
    // Note: Must join through entities table since user_id is there, not on components
    const { data: sources, error: sourcesError } = await supabase
      .from('components')
      .select(`
        entity_id,
        entities!inner(user_id)
      `)
      .eq('component_type', 'source')
      .eq('data->>document_id', documentId)
      .eq('entities.user_id', user.id)

    if (sourcesError) {
      console.error('[getAnnotationsNeedingReview] Source query failed:', sourcesError)
      throw sourcesError
    }

    const entityIds = sources?.map((s: { entity_id: string }) => s.entity_id) || []

    if (entityIds.length === 0) {
      // No annotations for this document
      return { success: [], needsReview: [], lost: [] }
    }

    // Get position components for ONLY those entities
    const { data: positions, error: positionsError } = await supabase
      .from('components')
      .select('id, entity_id, data, recovery_confidence, recovery_method, needs_review, original_chunk_index')
      .eq('component_type', 'position')
      .in('entity_id', entityIds)
      .not('recovery_method', 'is', null)

    if (positionsError) {
      console.error('[getAnnotationsNeedingReview] Position query failed:', positionsError)
      throw positionsError
    }

    // No recovered annotations
    if (!positions || positions.length === 0) {
      return { success: [], needsReview: [], lost: [] }
    }

    // Get annotation components for same entities
    const { data: annotations, error: annotationsError } = await supabase
      .from('components')
      .select('entity_id, data')
      .eq('component_type', 'annotation')
      .in('entity_id', entityIds)

    if (annotationsError) {
      console.error('[getAnnotationsNeedingReview] Annotation query failed:', annotationsError)
      throw annotationsError
    }

    // EDGE CASE HANDLING: Use Maps for defensive lookup
    const positionMap = new Map(
      positions?.map((p: any) => [p.entity_id, p]) || []
    )
    const annotationMap = new Map(
      annotations?.map((a: any) => [a.entity_id, a]) || []
    )

    const success: any[] = []
    const needsReview: any[] = []
    const lost: any[] = []

    for (const entityId of entityIds) {
      const position = positionMap.get(entityId)
      const annotation = annotationMap.get(entityId)

      // EDGE CASE #1: Missing components (annotation without position, or vice versa)
      if (!position || !annotation) {
        console.warn(
          `[getAnnotationsNeedingReview] Missing components for entity ${entityId}:`,
          { hasPosition: !!position, hasAnnotation: !!annotation }
        )
        continue
      }

      // Skip if no recovery metadata (not a recovered annotation)
      if (!position.recovery_method) {
        continue
      }

      // Map to Annotation interface with null safety
      const annotationObj = {
        id: entityId,
        text: annotation.data?.text || '',
        startOffset: position.data?.startOffset || 0,
        endOffset: position.data?.endOffset || 0,
        textContext: position.data?.textContext
          ? {
              before: position.data.textContext.before || '',
              after: position.data.textContext.after || '',
            }
          : undefined,
        originalChunkIndex: position.original_chunk_index,
      }

      // EDGE CASE #2: Lost annotations with null confidence
      if (
        position.recovery_method === 'lost' ||
        position.recovery_confidence === 0 ||
        position.recovery_confidence === null
      ) {
        lost.push(annotationObj)
      } else if (position.recovery_confidence >= 0.85 && !position.needs_review) {
        // High confidence - auto-recovered
        success.push(annotationObj)
      } else if (position.needs_review) {
        // Medium confidence - needs manual review
        const suggestedMatch = {
          text: annotation.data?.text || '',
          startOffset: position.data?.startOffset || 0,
          endOffset: position.data?.endOffset || 0,
          confidence: position.recovery_confidence || 0,
          method: position.recovery_method as 'exact' | 'context' | 'chunk_bounded' | 'trigram',
          // EDGE CASE #3: Undefined text context - provide fallbacks
          contextBefore: position.data?.textContext?.before || '',
          contextAfter: position.data?.textContext?.after || '',
        }

        needsReview.push({
          annotation: annotationObj,
          suggestedMatch,
        })
      }
    }

    return { success, needsReview, lost }
  } catch (error) {
    console.error('[getAnnotationsNeedingReview] Failed:', error)
    // ERROR BOUNDARY: Return empty results instead of throwing
    // This prevents the entire reader page from crashing
    return { success: [], needsReview: [], lost: [] }
  }
}