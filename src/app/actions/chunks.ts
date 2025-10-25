'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

/**
 * Zod schema for chunk offset updates.
 * Ensures valid offsets and required metadata for corrections.
 */
const UpdateChunkOffsetsSchema = z.object({
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  reason: z.string().min(1).max(500), // User's reason for correction
})

/**
 * Interface for correction history entries.
 */
interface CorrectionHistoryEntry {
  timestamp: string
  old_offsets: { start: number; end: number }
  new_offsets: { start: number; end: number }
  reason: string
}

/**
 * Interface for overlap detection result.
 */
interface OverlapResult {
  hasOverlap: boolean
  adjacentChunks?: Array<{
    id: string
    chunk_index: number
    start_offset: number
    end_offset: number
    position: 'previous' | 'next'
  }>
}

/**
 * Validates chunk position (marks as correct, no changes needed).
 *
 * Simple operation: sets position_validated = true.
 * User confirms the current position is correct and needs no adjustment.
 *
 * @param chunkId - UUID of chunk to validate
 * @param documentId - UUID of document (for path revalidation)
 * @returns Success or error response
 */
export async function validateChunkPosition(
  chunkId: string,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Verify chunk exists and belongs to user's document
    const { data: chunk, error: fetchError } = await supabase
      .from('chunks')
      .select('id, document_id')
      .eq('id', chunkId)
      .single()

    if (fetchError || !chunk) {
      return { success: false, error: 'Chunk not found' }
    }

    // Verify document ownership
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', chunk.document_id)
      .single()

    if (docError || !document || document.user_id !== user.id) {
      return { success: false, error: 'Document not found or access denied' }
    }

    // Update position_validated flag
    const { error: updateError } = await supabase
      .from('chunks')
      .update({ position_validated: true })
      .eq('id', chunkId)

    if (updateError) {
      console.error('Failed to validate chunk position:', updateError)
      return { success: false, error: 'Failed to update chunk' }
    }

    // Revalidate document reader path
    revalidatePath(`/read/${documentId}`)

    return { success: true }
  } catch (error) {
    console.error('validateChunkPosition failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Checks if new offsets overlap with adjacent chunks.
 *
 * Overlap conditions:
 * 1. New start falls within adjacent chunk range
 * 2. New end falls within adjacent chunk range
 * 3. New range completely contains adjacent chunk
 *
 * @param supabase - Supabase client
 * @param chunkId - Current chunk ID
 * @param documentId - Document ID
 * @param chunkIndex - Current chunk index
 * @param newStart - Proposed start offset
 * @param newEnd - Proposed end offset
 * @returns Overlap detection result
 */
async function detectOverlap(
  supabase: any,
  chunkId: string,
  documentId: string,
  chunkIndex: number,
  newStart: number,
  newEnd: number
): Promise<OverlapResult> {
  // Query adjacent chunks (previous and next)
  const { data: adjacentChunks, error } = await supabase
    .from('chunks')
    .select('id, chunk_index, start_offset, end_offset')
    .eq('document_id', documentId)
    .eq('is_current', true)
    .in('chunk_index', [chunkIndex - 1, chunkIndex + 1])
    .not('id', 'eq', chunkId) // Exclude current chunk

  if (error) {
    console.error('Failed to query adjacent chunks:', error)
    throw error
  }

  // No adjacent chunks (first or last chunk, or only chunk)
  if (!adjacentChunks || adjacentChunks.length === 0) {
    return { hasOverlap: false }
  }

  // Check each adjacent chunk for overlap
  const overlapping: Array<{
    id: string
    chunk_index: number
    start_offset: number
    end_offset: number
    position: 'previous' | 'next'
  }> = []

  for (const adj of adjacentChunks) {
    const adjStart = adj.start_offset
    const adjEnd = adj.end_offset

    // Skip if adjacent chunk has null offsets (shouldn't happen, but defensive)
    if (adjStart === null || adjEnd === null) {
      continue
    }

    // Determine position (previous or next)
    const position = adj.chunk_index < chunkIndex ? 'previous' : 'next'

    // Check overlap conditions:
    // 1. New start falls within adjacent range: newStart >= adjStart && newStart < adjEnd
    // 2. New end falls within adjacent range: newEnd > adjStart && newEnd <= adjEnd
    // 3. New range completely contains adjacent: newStart <= adjStart && newEnd >= adjEnd
    const startOverlaps = newStart >= adjStart && newStart < adjEnd
    const endOverlaps = newEnd > adjStart && newEnd <= adjEnd
    const completelyContains = newStart <= adjStart && newEnd >= adjEnd

    if (startOverlaps || endOverlaps || completelyContains) {
      overlapping.push({
        id: adj.id,
        chunk_index: adj.chunk_index,
        start_offset: adjStart,
        end_offset: adjEnd,
        position,
      })
    }
  }

  if (overlapping.length > 0) {
    return {
      hasOverlap: true,
      adjacentChunks: overlapping,
    }
  }

  return { hasOverlap: false }
}

/**
 * Updates chunk offsets with overlap detection and correction history tracking.
 *
 * This is the main correction action. Workflow:
 * 1. Validate input with Zod
 * 2. Get current chunk and verify ownership
 * 3. Check for overlaps with adjacent chunks
 * 4. Build correction history entry
 * 5. Update chunk with new offsets, history, and flags
 * 6. Revalidate path
 *
 * @param data - Correction data (chunkId, documentId, offsets, reason)
 * @returns Success or error (with overlap details if applicable)
 */
export async function updateChunkOffsets(
  data: z.infer<typeof UpdateChunkOffsetsSchema>
): Promise<{
  success: boolean
  error?: string
  errorType?: 'validation' | 'overlap' | 'not_found' | 'permission' | 'unknown'
  adjacentChunks?: Array<{
    id: string
    chunk_index: number
    start_offset: number
    end_offset: number
    position: 'previous' | 'next'
  }>
}> {
  try {
    // Validate input
    const validated = UpdateChunkOffsetsSchema.parse(data)

    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated', errorType: 'permission' }
    }

    const supabase = await createClient()

    // Get current chunk with all relevant fields
    const { data: chunk, error: fetchError } = await supabase
      .from('chunks')
      .select('id, document_id, chunk_index, start_offset, end_offset, correction_history')
      .eq('id', validated.chunkId)
      .single()

    if (fetchError || !chunk) {
      return { success: false, error: 'Chunk not found', errorType: 'not_found' }
    }

    // Verify document ownership
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', chunk.document_id)
      .single()

    if (docError || !document || document.user_id !== user.id) {
      return {
        success: false,
        error: 'Document not found or access denied',
        errorType: 'permission',
      }
    }

    // Validate offsets are different (no no-op corrections)
    if (
      chunk.start_offset === validated.startOffset &&
      chunk.end_offset === validated.endOffset
    ) {
      return {
        success: false,
        error: 'New offsets are identical to current offsets',
        errorType: 'validation',
      }
    }

    // Validate end > start
    if (validated.endOffset <= validated.startOffset) {
      return {
        success: false,
        error: 'End offset must be greater than start offset',
        errorType: 'validation',
      }
    }

    // Check for overlaps with adjacent chunks
    const overlapResult = await detectOverlap(
      supabase,
      chunk.id,
      chunk.document_id,
      chunk.chunk_index,
      validated.startOffset,
      validated.endOffset
    )

    if (overlapResult.hasOverlap) {
      return {
        success: false,
        error: 'New offsets overlap with adjacent chunks',
        errorType: 'overlap',
        adjacentChunks: overlapResult.adjacentChunks,
      }
    }

    // Build correction history entry
    const historyEntry: CorrectionHistoryEntry = {
      timestamp: new Date().toISOString(),
      old_offsets: {
        start: chunk.start_offset,
        end: chunk.end_offset,
      },
      new_offsets: {
        start: validated.startOffset,
        end: validated.endOffset,
      },
      reason: validated.reason,
    }

    // Get existing history (default to empty array)
    const existingHistory = (chunk.correction_history as CorrectionHistoryEntry[]) || []

    // Append new entry and trim to last 50 (prevent unbounded growth)
    const updatedHistory = [...existingHistory, historyEntry].slice(-50)

    // Update chunk with new offsets, history, and flags
    const { error: updateError } = await supabase
      .from('chunks')
      .update({
        start_offset: validated.startOffset,
        end_offset: validated.endOffset,
        correction_history: updatedHistory,
        position_validated: true, // Correction implies validation
        position_corrected: true, // Mark as manually corrected
      })
      .eq('id', chunk.id)

    if (updateError) {
      console.error('Failed to update chunk offsets:', updateError)
      return {
        success: false,
        error: 'Failed to update chunk',
        errorType: 'unknown',
      }
    }

    // Revalidate document reader path
    revalidatePath(`/read/${validated.documentId}`)

    return { success: true }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation error: ${error.errors.map((e) => e.message).join(', ')}`,
        errorType: 'validation',
      }
    }

    console.error('updateChunkOffsets failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: 'unknown',
    }
  }
}

/**
 * Load lightweight chunk metadata for list display.
 * Includes detection status and connection count.
 */
export async function loadChunkMetadata(documentId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: chunks, error } = await supabase
    .from('chunks')
    .select(`
      id,
      chunk_index,
      connections_detected,
      heading_path,
      word_count,
      content
    `)
    .eq('document_id', documentId)
    .eq('is_current', true)
    .order('chunk_index')

  if (error) throw error

  // Count connections for each chunk (lazy load approach - only when needed)
  // For now, return without counts (will query in detailed mode)
  return chunks.map(chunk => ({
    id: chunk.id,
    chunk_index: chunk.chunk_index,
    connections_detected: chunk.connections_detected,
    preview: chunk.content.slice(0, 150) + '...',
    connection_count: 0  // Placeholder - will load in detailed mode
  }))
}

/**
 * Load full chunk details for editing (lazy loaded on demand).
 * Includes connection count query.
 */
export async function loadChunkDetails(chunkId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: chunk, error } = await supabase
    .from('chunks')
    .select(`
      id,
      content,
      heading_path,
      page_start,
      page_end,
      word_count,
      token_count,
      themes,
      importance_score,
      summary,

      emotional_metadata,
      conceptual_metadata,
      domain_metadata,

      connections_detected,
      connections_detected_at,

      position_confidence,
      metadata_confidence,
      chunker_type
    `)
    .eq('id', chunkId)
    .single()

  if (error) throw error

  // Count connections (only when loading detailed view)
  const { count: connectionCount } = await supabase
    .from('connections')
    .select('id', { count: 'exact', head: true })
    .eq('source_chunk_id', chunkId)

  return {
    ...chunk,
    connection_count: connectionCount || 0
  }
}

/**
 * Update chunk metadata (JSONB fields and scalar fields).
 * Used by metadata editor in detailed mode.
 */
export async function updateChunkMetadata(
  chunkId: string,
  metadata: {
    title?: string
    domain_metadata?: Record<string, any>
    emotional_metadata?: Record<string, any>
    conceptual_metadata?: Record<string, any>
    themes?: string[]
    importance_score?: number
  }
) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  // Build update object for JSONB fields
  const updates: Record<string, any> = {}

  if (metadata.domain_metadata !== undefined) {
    updates.domain_metadata = metadata.domain_metadata
  }
  if (metadata.emotional_metadata !== undefined) {
    updates.emotional_metadata = metadata.emotional_metadata
  }
  if (metadata.conceptual_metadata !== undefined) {
    updates.conceptual_metadata = metadata.conceptual_metadata
  }
  if (metadata.themes !== undefined) {
    updates.themes = metadata.themes
  }
  if (metadata.importance_score !== undefined) {
    updates.importance_score = metadata.importance_score
  }

  const { error } = await supabase
    .from('chunks')
    .update(updates)
    .eq('id', chunkId)

  if (error) throw error

  // Revalidate reader page to show updated metadata
  const { data: chunk } = await supabase
    .from('chunks')
    .select('document_id')
    .eq('id', chunkId)
    .single()

  if (chunk) {
    revalidatePath(`/read/${chunk.document_id}`)
  }

  return { success: true }
}

/**
 * Detect connections for multiple chunks (batch operation).
 */
export async function detectBatchChunkConnections(
  documentId: string,
  chunkIds: string[]
) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const supabase = await createClient()

  // Create batch detection job
  const { data: job, error} = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect_connections',
      input_data: {
        document_id: documentId,
        chunk_ids: chunkIds,  // Batch mode
        trigger: 'user_batch'
      },
      entity_id: documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  if (error) throw error

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: chunkIds.length }
}
