/**
 * Annotation Recovery Server Actions
 *
 * Server Actions for accepting/discarding annotation fuzzy matches during recovery.
 * Migrated from API routes to follow Next.js 15 + React 19 best practices.
 *
 * Replaces:
 * - /api/annotations/accept-match
 * - /api/annotations/discard
 * - /api/annotations/batch-accept
 * - /api/annotations/batch-discard
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface FuzzyMatchResult {
  startOffset: number
  endOffset: number
  text: string
  confidence: number
  method: string
  contextBefore?: string
  contextAfter?: string
}

/**
 * Accept a single fuzzy match suggestion
 * Uses read-merge-write pattern to preserve existing data
 */
export async function acceptAnnotationMatch(
  componentId: string,
  suggestedMatch: FuzzyMatchResult,
  documentId?: string
) {
  if (!componentId || !suggestedMatch) {
    throw new Error('componentId and suggestedMatch are required')
  }

  const supabase = await createClient()

  // 1. Fetch current component data for merging (read-merge-write pattern)
  const { data: component, error: fetchError } = await supabase
    .from('components')
    .select('data, chunk_ids')
    .eq('id', componentId)
    .single()

  if (fetchError || !component) {
    console.error('[Action] Failed to fetch component:', fetchError)
    throw new Error('Component not found')
  }

  // 2. Merge suggested match into existing data
  const updatedData = {
    ...component.data,
    startOffset: suggestedMatch.startOffset,
    endOffset: suggestedMatch.endOffset,
    originalText: suggestedMatch.text,
    textContext: {
      before: suggestedMatch.contextBefore || '',
      after: suggestedMatch.contextAfter || ''
    }
  }

  // 3. Update component with merged data + recovery metadata
  const { error: updateError } = await supabase
    .from('components')
    .update({
      data: updatedData,
      needs_review: false,
      recovery_confidence: suggestedMatch.confidence,
      recovery_method: suggestedMatch.method,
      updated_at: new Date().toISOString()
    })
    .eq('id', componentId)

  if (updateError) {
    console.error('[Action] Failed to update component:', updateError)
    throw new Error('Failed to accept match')
  }

  console.log(`[Action] ✅ Accepted annotation ${componentId} (${(suggestedMatch.confidence * 100).toFixed(1)}%)`)

  // Revalidate document page if documentId provided
  if (documentId) {
    revalidatePath(`/read/${documentId}`)
  }

  return {
    success: true,
    componentId
  }
}

/**
 * Discard a single annotation that failed recovery
 * Marks as lost (recovery_method: 'lost', needs_review: false)
 */
export async function discardAnnotationMatch(componentId: string, documentId?: string) {
  if (!componentId) {
    throw new Error('componentId is required')
  }

  const supabase = await createClient()

  // Mark annotation as lost (don't delete - user might want to see what was lost)
  const { error } = await supabase
    .from('components')
    .update({
      recovery_method: 'lost',
      recovery_confidence: 0.0,
      needs_review: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', componentId)

  if (error) {
    console.error('[Action] Failed to discard annotation:', error)
    throw new Error('Failed to discard annotation')
  }

  console.log(`[Action] ✅ Discarded annotation ${componentId}`)

  // Revalidate document page if documentId provided
  if (documentId) {
    revalidatePath(`/read/${documentId}`)
  }

  return {
    success: true,
    componentId
  }
}

/**
 * Accept multiple fuzzy match suggestions at once
 * Uses single supabase.upsert() for performance
 */
export async function batchAcceptMatches(
  matches: Array<{ componentId: string; suggestedMatch: FuzzyMatchResult }>,
  documentId?: string
) {
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('Matches array is required')
  }

  const supabase = await createClient()

  // Prepare batch updates: update position data + needs_review: false
  const updates = matches.map((match) => ({
    id: match.componentId,
    data: {
      ...match.suggestedMatch,
      // Keep existing data, just update position fields
      startOffset: match.suggestedMatch.startOffset,
      endOffset: match.suggestedMatch.endOffset,
      originalText: match.suggestedMatch.text
    },
    needs_review: false,
    recovery_confidence: match.suggestedMatch.confidence,
    recovery_method: match.suggestedMatch.method,
    updated_at: new Date().toISOString()
  }))

  // OPTIMIZE: Single upsert not loop
  const { error, data } = await supabase
    .from('components')
    .upsert(updates, {
      onConflict: 'id',
      ignoreDuplicates: false
    })
    .select('id')

  if (error) {
    console.error('[Action] Batch accept failed:', error)
    throw new Error('Failed to accept matches')
  }

  console.log(`[Action] ✅ Accepted ${data?.length || 0} annotations`)

  // Revalidate document page if documentId provided
  if (documentId) {
    revalidatePath(`/read/${documentId}`)
  }

  return {
    success: true,
    updated: data?.length || 0
  }
}

/**
 * Discard multiple annotations that failed recovery
 * Uses batch delete for performance
 */
export async function batchDiscardMatches(componentIds: string[], documentId?: string) {
  if (!Array.isArray(componentIds) || componentIds.length === 0) {
    throw new Error('Component IDs array is required')
  }

  const supabase = await createClient()

  // Batch delete using .in()
  const { error, data } = await supabase
    .from('components')
    .delete()
    .in('id', componentIds)
    .select('id')

  if (error) {
    console.error('[Action] Batch discard failed:', error)
    throw new Error('Failed to discard annotations')
  }

  console.log(`[Action] ✅ Discarded ${data?.length || 0} annotations`)

  // Revalidate document page if documentId provided
  if (documentId) {
    revalidatePath(`/read/${documentId}`)
  }

  return {
    success: true,
    deleted: data?.length || 0
  }
}
