'use server'

import { z } from 'zod'
import { createECS } from '@/lib/ecs'
import { AnnotationOperations } from '@/lib/ecs/annotations'
import { getCurrentUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { calculatePdfCoordinatesFromDocling } from '@/lib/reader/pdf-coordinate-mapper'
import { calculateMarkdownOffsets } from '@/lib/reader/text-offset-calculator'
import type { AnnotationEntity, Chunk } from '@/types/annotations'

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
  // PDF coordinate fields - support multiple rects for multi-line
  pdfPageNumber: z.number().int().positive().optional(),
  pdfRects: z.array(z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    pageNumber: z.number().int().positive(),
  })).optional(),
  // Legacy single rect (deprecated but kept for compatibility)
  pdfX: z.number().optional(),
  pdfY: z.number().optional(),
  pdfWidth: z.number().optional(),
  pdfHeight: z.number().optional(),
  // PDF ↔ Markdown sync metadata
  syncConfidence: z.number().min(0).max(1).optional(),
  syncMethod: z.enum(['charspan_window', 'exact', 'fuzzy', 'bbox', 'docling_bbox', 'pymupdf', 'bbox_proportional', 'page_only', 'manual', 'pdf_selection']).optional(),
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
      // PDF coordinates (optional) - prefer pdfRects over single rect
      pdfPageNumber: validated.pdfPageNumber,
      pdfRects: validated.pdfRects,
      pdfX: validated.pdfX,
      pdfY: validated.pdfY,
      pdfWidth: validated.pdfWidth,
      pdfHeight: validated.pdfHeight,
      // PDF ↔ Markdown sync metadata
      syncConfidence: validated.syncConfidence,
      syncMethod: validated.syncMethod,
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
        id: annotation.id,
        text: position.originalText,
        note: content.note,
        color: visual.color,
        confidence: 0,
        method: 'lost',
      })
    } else if (position.needsReview) {
      needsReview.push({
        annotation: {
          id: annotation.id,
          text: position.originalText,
          startOffset: position.startOffset,
          endOffset: position.endOffset,
          textContext: position.textContext,
        },
        suggestedMatch: {
          text: position.originalText,
          startOffset: position.startOffset,
          endOffset: position.endOffset,
          confidence,
          method,
          contextBefore: position.textContext?.before,
          contextAfter: position.textContext?.after,
        },
      })
    } else {
      success.push({
        id: annotation.id,
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
 * Accept a suggested annotation match from recovery
 * Updates the Position component with new offsets and marks as reviewed
 */
export async function acceptAnnotationMatch(
  annotationId: string,
  suggestedMatch: {
    startOffset: number
    endOffset: number
    text: string
    confidence: number
    method: string
  }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    // Get the annotation entity
    const entity = await ecs.getEntity(annotationId, user.id)
    if (!entity) {
      return { success: false, error: 'Annotation not found' }
    }

    // Find the Position component
    const positionComponent = entity.components?.find(
      (c) => c.component_type === 'Position'
    )

    if (!positionComponent) {
      return { success: false, error: 'Position component not found' }
    }

    // Update Position component with accepted match
    const updatedData = {
      ...positionComponent.data,
      startOffset: suggestedMatch.startOffset,
      endOffset: suggestedMatch.endOffset,
      originalText: suggestedMatch.text,
      recoveryConfidence: suggestedMatch.confidence,
      recoveryMethod: suggestedMatch.method,
      needsReview: false, // Mark as reviewed and accepted
    }

    await ecs.updateComponent(positionComponent.id, updatedData, user.id)

    return { success: true }
  } catch (error) {
    console.error('[acceptAnnotationMatch] Failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Reject an annotation match from recovery (marks as lost)
 * Sets confidence to 0 and method to 'lost'
 */
export async function rejectAnnotationMatch(annotationId: string) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ecs = createECS()

    // Get the annotation entity
    const entity = await ecs.getEntity(annotationId, user.id)
    if (!entity) {
      return { success: false, error: 'Annotation not found' }
    }

    // Find the Position component
    const positionComponent = entity.components?.find(
      (c) => c.component_type === 'Position'
    )

    if (!positionComponent) {
      return { success: false, error: 'Position component not found' }
    }

    // Update Position component to mark as lost
    const updatedData = {
      ...positionComponent.data,
      recoveryConfidence: 0,
      recoveryMethod: 'lost',
      needsReview: false, // Mark as reviewed (rejected)
    }

    await ecs.updateComponent(positionComponent.id, updatedData, user.id)

    return { success: true }
  } catch (error) {
    console.error('[rejectAnnotationMatch] Failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
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

/**
 * Calculate PDF coordinates from markdown offsets using Docling provenance.
 * Server Action wrapper for client component access.
 *
 * @param documentId - Document UUID
 * @param startOffset - Markdown start offset
 * @param length - Length of selected text
 * @param chunks - Chunks array from database
 * @returns PDF coordinate result with confidence scoring
 */
export async function calculatePdfCoordinates(
  documentId: string,
  startOffset: number,
  length: number,
  chunks: Chunk[]
): Promise<{
  found: boolean
  pageNumber?: number
  rects?: Array<{ x: number; y: number; width: number; height: number; pageNumber: number }>
  method?: 'pymupdf' | 'bbox_proportional' | 'page_only'
  confidence?: number
}> {
  try {
    // Call the utility function (runs in server context)
    const result = await calculatePdfCoordinatesFromDocling(
      documentId,
      startOffset,
      length,
      chunks
    )

    // Transform rects to include pageNumber for createAnnotation schema
    if (result.found && result.rects && result.pageNumber) {
      return {
        ...result,
        rects: result.rects.map(rect => ({
          ...rect,
          pageNumber: result.pageNumber!
        }))
      }
    }

    // If found but no rects/pageNumber, return as-is
    if (result.found && !result.rects) {
      return {
        found: result.found,
        pageNumber: result.pageNumber,
        method: result.method,
        confidence: result.confidence
      }
    }

    return { found: false }
  } catch (error) {
    console.error('[calculatePdfCoordinates] Failed:', error)
    return { found: false }
  }
}

/**
 * Calculate markdown offsets from PDF selection (bidirectional sync: PDF → Markdown).
 * Server Action wrapper for text-offset-calculator.
 *
 * @param documentId - Document ID
 * @param text - Selected text from PDF
 * @param pageNumber - PDF page number
 * @param chunks - Chunks with page metadata for mapping
 * @returns Markdown offset result with confidence and method
 */
export async function calculatePdfOffsets(
  documentId: string,
  text: string,
  pageNumber: number,
  chunks: Chunk[]
) {
  try {
    console.log('[calculatePdfOffsets] Input:', {
      documentId,
      text: text.substring(0, 50),
      pageNumber,
      chunksCount: chunks.length,
    })

    // Load docling markdown from storage if available
    // This enables charspan-based matching per PDF annotation sync plan
    const supabase = await createClient()
    const { data: markdown } = await supabase.storage
      .from('documents')
      .download(`${documentId}/docling.md`)

    let doclingMarkdown: string | undefined
    if (markdown) {
      doclingMarkdown = await markdown.text()
      console.log('[calculatePdfOffsets] Loaded docling.md:', doclingMarkdown.length, 'chars')
    }

    // Calculate markdown offsets using text-offset-calculator
    const result = calculateMarkdownOffsets(
      text,
      pageNumber,
      chunks,
      doclingMarkdown // Can be undefined - calculator handles it
    )

    console.log('[calculatePdfOffsets] Result:', result)

    // If not found, return undefined method (PDF-only annotation)
    if (result.method === 'not_found') {
      return {
        startOffset: 0,
        endOffset: 0,
        confidence: 0,
        method: undefined as any, // Cast to match schema
        matchedChunkId: undefined,
      }
    }

    return {
      ...result,
      method: result.method as any, // Cast to match schema enum
    }
  } catch (error) {
    console.error('[calculatePdfOffsets] Failed:', error)
    // Return fallback with zero offsets (PDF-only annotation)
    return {
      startOffset: 0,
      endOffset: 0,
      confidence: 0,
      method: undefined, // No method if not found - will be PDF-only annotation
      matchedChunkId: undefined,
    }
  }
}