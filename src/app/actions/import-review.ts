'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { createECS } from '@/lib/ecs'

// ============================================================================
// TYPES
// ============================================================================

export interface PendingImport {
  id: string
  source: string
  highlightData: {
    text: string
    note?: string
    color?: string
    location?: number
    highlighted_at: string
    book_id?: string
    title?: string
    author?: string
  }
  suggestedMatch: {
    text: string
    startOffset: number
    endOffset: number
    confidence: number
    method: 'exact' | 'context' | 'chunk_bounded' | 'trigram'
  }
  confidence: number
  created_at: string
}

// ============================================================================
// FETCH PENDING IMPORTS
// ============================================================================

/**
 * Get all pending import reviews for a document
 *
 * @param documentId - Document ID to query
 * @returns Array of pending imports needing manual review
 */
export async function getPendingImports(
  documentId: string
): Promise<{ success: boolean; data: PendingImport[]; error?: string }> {
  try {
    const user = await getCurrentUser()
    console.log('[getPendingImports] User:', user?.id)

    if (!user) {
      console.log('[getPendingImports] No user - not authenticated')
      return { success: false, data: [], error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Verify user owns the document first
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', documentId)
      .single()

    console.log('[getPendingImports] Document owner:', doc?.user_id, 'Error:', docError)

    if (docError || !doc || doc.user_id !== user.id) {
      console.log('[getPendingImports] Ownership check failed')
      return { success: false, data: [], error: 'Document not found or access denied' }
    }

    // Get all pending imports for this document (regardless of who saved them)
    const { data, error } = await supabase
      .from('import_pending')
      .select('*')
      .eq('document_id', documentId)
      .eq('status', 'pending')
      .order('confidence', { ascending: false })

    console.log('[getPendingImports] Query result:', data?.length || 0, 'rows, Error:', error)

    if (error) {
      console.error('[getPendingImports] Query failed:', error)
      throw error
    }

    const pendingImports: PendingImport[] = (data || []).map((row: any) => ({
      id: row.id,
      source: row.source,
      highlightData: row.highlight_data,
      suggestedMatch: row.suggested_match,
      confidence: row.confidence,
      created_at: row.created_at
    }))

    return { success: true, data: pendingImports }
  } catch (error) {
    console.error('[getPendingImports] Failed:', error)
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================================================
// ACCEPT IMPORT
// ============================================================================

/**
 * Accept a pending import and create an annotation entity
 *
 * @param pendingId - ID of the pending import
 * @returns Success status and created entity ID
 */
export async function acceptImport(
  pendingId: string
): Promise<{ success: boolean; entityId?: string; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()
    const ecs = createECS()

    // Get the pending import
    const { data: pending, error: fetchError } = await supabase
      .from('import_pending')
      .select('*')
      .eq('id', pendingId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !pending) {
      return { success: false, error: 'Pending import not found' }
    }

    // Get chunks for the document to find containing chunk
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, start_offset, end_offset, chunk_index')
      .eq('document_id', pending.document_id)
      .eq('is_current', true)
      .order('chunk_index')

    if (!chunks || chunks.length === 0) {
      return { success: false, error: 'No chunks found for document' }
    }

    // Find containing chunk
    const match = pending.suggested_match
    const containingChunk = chunks.find(
      c => c.start_offset <= match.startOffset && c.end_offset >= match.endOffset
    )

    if (!containingChunk) {
      return { success: false, error: 'No chunk found for annotation position' }
    }

    // Map Readwise color to our color system
    const highlight = pending.highlight_data
    const colorMap: Record<string, string> = {
      yellow: 'yellow',
      blue: 'blue',
      red: 'red',
      green: 'green',
      orange: 'orange',
      purple: 'purple',
      pink: 'pink'
    }
    const color = colorMap[highlight.color || 'yellow'] || 'yellow'

    // Create annotation entity with ECS
    const entityId = await ecs.createEntity(user.id, {
      annotation: {
        text: match.text,
        note: highlight.note,
        tags: ['readwise-import'],
        color,
        range: {
          startOffset: match.startOffset,
          endOffset: match.endOffset,
          chunkIds: [containingChunk.id]
        },
        textContext: {
          before: '',
          content: match.text,
          after: ''
        }
      },
      position: {
        chunkIds: [containingChunk.id],
        startOffset: match.startOffset,
        endOffset: match.endOffset,
        confidence: match.confidence,
        method: match.method,
        textContext: {
          before: '',
          after: ''
        },
        originalChunkIndex: containingChunk.chunk_index
      },
      source: {
        chunk_id: containingChunk.id,
        chunk_ids: [containingChunk.id],
        document_id: pending.document_id
      }
    })

    // Update pending import status
    await supabase
      .from('import_pending')
      .update({
        status: 'accepted',
        reviewed_at: new Date().toISOString(),
        created_entity_id: entityId
      })
      .eq('id', pendingId)

    return { success: true, entityId }
  } catch (error) {
    console.error('[acceptImport] Failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================================================
// REJECT IMPORT
// ============================================================================

/**
 * Reject a pending import (mark as discarded)
 *
 * @param pendingId - ID of the pending import
 * @returns Success status
 */
export async function rejectImport(
  pendingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Update status to rejected
    const { error } = await supabase
      .from('import_pending')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', pendingId)
      .eq('user_id', user.id)

    if (error) {
      throw error
    }

    return { success: true }
  } catch (error) {
    console.error('[rejectImport] Failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Accept all pending imports for a document
 *
 * @param documentId - Document ID
 * @returns Success count
 */
export async function acceptAllImports(
  documentId: string
): Promise<{ success: boolean; accepted: number; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, accepted: 0, error: 'Not authenticated' }
    }

    // Get all pending imports
    const result = await getPendingImports(documentId)
    if (!result.success) {
      return { success: false, accepted: 0, error: result.error }
    }

    let accepted = 0
    for (const pending of result.data) {
      const acceptResult = await acceptImport(pending.id)
      if (acceptResult.success) {
        accepted++
      }
    }

    return { success: true, accepted }
  } catch (error) {
    console.error('[acceptAllImports] Failed:', error)
    return {
      success: false,
      accepted: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Reject all pending imports for a document
 *
 * @param documentId - Document ID
 * @returns Success count
 */
export async function rejectAllImports(
  documentId: string
): Promise<{ success: boolean; rejected: number; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, rejected: 0, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Update all pending imports to rejected
    const { data, error } = await supabase
      .from('import_pending')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('document_id', documentId)
      .eq('status', 'pending')
      .select('id')

    if (error) {
      throw error
    }

    return { success: true, rejected: data?.length || 0 }
  } catch (error) {
    console.error('[rejectAllImports] Failed:', error)
    return {
      success: false,
      rejected: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
