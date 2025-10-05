/**
 * Annotation Recovery Handler
 * Recovers user annotations after document edits using fuzzy matching
 *
 * 4-tier matching strategy:
 * 1. Exact match (markdown.indexOf)
 * 2. Context-guided Levenshtein (if context available)
 * 3. Chunk-bounded Levenshtein (if chunk index known) - 50-75x faster
 * 4. Trigram fallback (last resort)
 */

import { createClient } from '@supabase/supabase-js'
import { findAnnotationMatch } from '../lib/fuzzy-matching.js'
import type {
  Annotation,
  RecoveryResults,
  AnnotationMatchResult,
  Chunk
} from '../types/recovery.js'

/**
 * Recover annotations for a document after reprocessing
 *
 * @param documentId - Document ID to recover annotations for
 * @param newMarkdown - New markdown content after edit
 * @param newChunks - New chunks after reprocessing
 * @returns Recovery results with success, needsReview, and lost annotations
 */
export async function recoverAnnotations(
  documentId: string,
  newMarkdown: string,
  newChunks: Array<{ id: string; chunk_index: number; start_offset: number; end_offset: number; content: string }>,
  supabaseClient?: any
): Promise<RecoveryResults> {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // First, get all entity_ids for this document (source components)
  const { data: sourceComponents } = await supabase
    .from('components')
    .select('entity_id')
    .eq('component_type', 'source')
    .eq('data->>document_id', documentId)

  const entityIds = sourceComponents?.map(c => c.entity_id) || []

  if (entityIds.length === 0) {
    console.log('[RecoverAnnotations] No annotations to recover')
    return { success: [], needsReview: [], lost: [] }
  }

  // Fetch both position and annotation components for recovery
  const { data: positionComponents, error: posError } = await supabase
    .from('components')
    .select('id, entity_id, data, original_chunk_index')
    .eq('component_type', 'position')
    .in('entity_id', entityIds)

  if (posError) {
    throw new Error(`Failed to fetch position components: ${posError.message}`)
  }

  if (!positionComponents || positionComponents.length === 0) {
    console.log('[RecoverAnnotations] No annotations to recover')
    return { success: [], needsReview: [], lost: [] }
  }

  // Fetch annotation components (contain the text)
  const { data: annotationComponents, error: annError } = await supabase
    .from('components')
    .select('entity_id, data')
    .eq('component_type', 'annotation')
    .in('entity_id', entityIds)

  if (annError) {
    throw new Error(`Failed to fetch annotation components: ${annError.message}`)
  }

  // Create a map of entity_id -> annotation text
  const annotationTextMap = new Map(
    annotationComponents?.map(c => [c.entity_id, c.data.text]) || []
  )

  console.log(`[RecoverAnnotations] Recovering ${positionComponents.length} annotations...`)

  const success: Annotation[] = []
  const needsReview: Array<{ annotation: Annotation; suggestedMatch: AnnotationMatchResult }> = []
  const lost: Annotation[] = []

  // Process each annotation
  for (const component of positionComponents) {
    const annotationText = annotationTextMap.get(component.entity_id)

    if (!annotationText) {
      console.warn(`  ⚠️  No annotation text for entity ${component.entity_id}, skipping`)
      continue
    }

    const annotation: Annotation = {
      id: component.entity_id,
      text: annotationText, // From annotation component
      startOffset: component.data.startOffset,
      endOffset: component.data.endOffset,
      textContext: component.data.textContext, // From position component (ECS pattern)
      originalChunkIndex: component.original_chunk_index
    }

    // Try to find match using 4-tier strategy
    const match = findAnnotationMatch(
      annotation,
      newMarkdown,
      newChunks
    )

    if (!match) {
      // No match found - mark as lost
      console.log(`  ❌ Lost: "${annotation.text.slice(0, 50)}..."`)
      lost.push(annotation)
      await updateAnnotationPosition(supabase, component.id, {
        recoveryMethod: 'lost',
        recoveryConfidence: 0.0,
        needsReview: false
      }, newChunks)
    } else if (match.confidence >= 0.85) {
      // High confidence - auto-recover
      console.log(`  ✅ Auto-recovered (${(match.confidence * 100).toFixed(1)}%): "${annotation.text.slice(0, 50)}..."`)
      success.push(annotation)

      const newChunkIndex = newChunks.findIndex(
        c => c.start_offset <= match.startOffset && c.end_offset >= match.endOffset
      )

      // Extract matched text from new markdown
      const matchedText = newMarkdown.substring(match.startOffset, match.endOffset)

      // Update both position and annotation components
      await Promise.all([
        updateAnnotationPosition(supabase, component.id, {
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          recoveryMethod: match.method,
          recoveryConfidence: match.confidence,
          needsReview: false,
          textContext: {
            before: match.contextBefore || '',
            after: match.contextAfter || ''
          },
          newChunkIndex
        }, newChunks),
        updateAnnotationText(supabase, component.entity_id, matchedText)
      ])
    } else {
      // Medium confidence (0.75-0.85) - needs review
      console.log(`  ⚠️  Needs review (${(match.confidence * 100).toFixed(1)}%): "${annotation.text.slice(0, 50)}..."`)
      needsReview.push({ annotation, suggestedMatch: match })

      const newChunkIndex = newChunks.findIndex(
        c => c.start_offset <= match.startOffset && c.end_offset >= match.endOffset
      )

      // Extract matched text from new markdown
      const matchedText = newMarkdown.substring(match.startOffset, match.endOffset)

      // Update both position and annotation components
      await Promise.all([
        updateAnnotationPosition(supabase, component.id, {
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          recoveryMethod: match.method,
          recoveryConfidence: match.confidence,
          needsReview: true,
          textContext: {
            before: match.contextBefore || '',
            after: match.contextAfter || ''
          },
          newChunkIndex
        }, newChunks),
        updateAnnotationText(supabase, component.entity_id, matchedText)
      ])
    }
  }

  console.log(`[RecoverAnnotations] Results:`)
  console.log(`  ✅ Success: ${success.length}`)
  console.log(`  ⚠️  Needs Review: ${needsReview.length}`)
  console.log(`  ❌ Lost: ${lost.length}`)
  console.log(`  📊 Recovery Rate: ${((success.length + needsReview.length) / positionComponents.length * 100).toFixed(1)}%`)

  return { success, needsReview, lost }
}

/**
 * Update annotation position component after recovery
 * Uses read-merge-write pattern for JSONB data
 *
 * @param supabase - Supabase client
 * @param componentId - Position component ID
 * @param updates - Position updates
 * @param newChunks - New chunks for calculating overlapping chunk_ids
 */
async function updateAnnotationPosition(
  supabase: ReturnType<typeof createClient>,
  componentId: string,
  updates: {
    startOffset?: number
    endOffset?: number
    recoveryMethod: 'exact' | 'context' | 'chunk_bounded' | 'trigram' | 'lost'
    recoveryConfidence: number
    needsReview: boolean
    textContext?: { before: string; after: string }
    newChunkIndex?: number
  },
  newChunks: Array<{ id: string; start_offset: number; end_offset: number }>
): Promise<void> {
  // Fetch current data for merging
  const { data: component } = await supabase
    .from('components')
    .select('data')
    .eq('id', componentId)
    .single()

  if (!component) {
    console.error(`Component ${componentId} not found`)
    return
  }

  // Merge updates into existing data
  const updatedData = {
    ...component.data,
    startOffset: updates.startOffset ?? component.data.startOffset,
    endOffset: updates.endOffset ?? component.data.endOffset,
    textContext: updates.textContext ?? component.data.textContext
  }

  // Calculate overlapping chunks (for multi-chunk annotations)
  const overlappingChunks = updates.startOffset !== undefined && updates.endOffset !== undefined
    ? newChunks.filter(
        c => c.end_offset > updates.startOffset! && c.start_offset < updates.endOffset!
      )
    : []

  // Update all fields in single query
  const { error } = await supabase
    .from('components')
    .update({
      data: updatedData,
      recovery_method: updates.recoveryMethod,
      recovery_confidence: updates.recoveryConfidence,
      needs_review: updates.needsReview,
      original_chunk_index: updates.newChunkIndex !== undefined && updates.newChunkIndex >= 0
        ? updates.newChunkIndex
        : null,
      chunk_ids: overlappingChunks.length > 0 ? overlappingChunks.map(c => c.id) : null
    })
    .eq('id', componentId)

  if (error) {
    console.error(`Failed to update annotation position: ${error.message}`)
  }
}

/**
 * Updates annotation component's text with recovered text
 */
async function updateAnnotationText(
  supabase: ReturnType<typeof createClient>,
  entityId: string,
  newText: string
): Promise<void> {
  // Fetch annotation component for this entity
  const { data: annotationComponent } = await supabase
    .from('components')
    .select('id, data')
    .eq('entity_id', entityId)
    .eq('component_type', 'annotation')
    .single()

  if (!annotationComponent) {
    console.error(`Annotation component not found for entity ${entityId}`)
    return
  }

  // Update annotation text
  const updatedData = {
    ...annotationComponent.data,
    text: newText
  }

  const { error } = await supabase
    .from('components')
    .update({ data: updatedData })
    .eq('id', annotationComponent.id)

  if (error) {
    console.error(`Failed to update annotation text: ${error.message}`)
  }
}
