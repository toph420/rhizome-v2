'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { getAuthContext, createBackgroundJob, withErrorHandling } from './documents/utils'
import { revalidatePath } from 'next/cache'

/**
 * Fetches connections for visible chunks with authentication.
 *
 * Pattern 2: Server Action → Zustand Store
 * - Enforces RLS through Server Action
 * - Returns connections for specified chunk IDs
 * - Used by ConnectionsList to populate store
 *
 * @param chunkIds - Array of chunk IDs to fetch connections for
 * @returns Array of connections or empty array on error
 */
export async function getConnectionsForChunks(chunkIds: string[]) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      console.warn('[getConnectionsForChunks] Unauthorized: no user')
      return []
    }

    // Filter out 'no-chunk' placeholders (gap regions without chunk coverage)
    const validChunkIds = chunkIds.filter(id => id !== 'no-chunk')
    if (validChunkIds.length === 0) {
      console.log('[getConnectionsForChunks] No valid chunks (gap region or empty)')
      return []
    }

    const supabase = await createClient()

    // Batch queries to avoid URL length limits (max 50 chunks per query)
    const BATCH_SIZE = 50
    const allConnections = []

    for (let i = 0; i < validChunkIds.length; i += BATCH_SIZE) {
      const batch = validChunkIds.slice(i, i + BATCH_SIZE)

      const { data, error } = await supabase
        .from('connections')
        .select('*')
        .in('source_chunk_id', batch)
        .order('strength', { ascending: false })
        .limit(100)

      if (error) {
        console.error('[getConnectionsForChunks] Error fetching batch:', error)
        continue // Skip failed batch, continue with others
      }

      if (data) {
        allConnections.push(...data)
      }
    }

    console.log('[getConnectionsForChunks] Fetched connections:', allConnections.length)
    return allConnections
  } catch (error) {
    console.error('[getConnectionsForChunks] Exception:', error)
    return []
  }
}

/**
 * Updates connection feedback (validate/reject/star).
 *
 * Design: Star = Validate + Important
 * - validate: user_validated = true, user_starred = false
 * - star: user_validated = true, user_starred = true
 * - reject: user_validated = false, user_starred = false
 *
 * Connection recovery queries use: WHERE user_validated = true
 * This includes both validated and starred connections.
 *
 * @param connectionId - Connection ID to update
 * @param feedback - Type of feedback: validate, reject, or star
 * @returns Success status
 */
export async function updateConnectionFeedback(
  connectionId: string,
  feedback: 'validate' | 'reject' | 'star'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Map UI feedback to database columns
    // Star always sets validated = true (star implies validation)
    const updates = {
      validated_at: new Date().toISOString(),
      user_validated: feedback !== 'reject',  // true for validate/star, false for reject
      user_starred: feedback === 'star',      // true only for star
    }

    const { error } = await supabase
      .from('connections')
      .update(updates)
      .eq('id', connectionId)

    if (error) {
      console.error('[updateConnectionFeedback] Failed:', error)
      return {
        success: false,
        error: error.message,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('[updateConnectionFeedback] Exception:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Detect connections for specific chunks in a document.
 * Creates a background job for connection detection.
 */
export async function detectConnectionsForChunks(
  documentId: string,
  chunkIds: string[]
): Promise<{ success: boolean; jobId?: string; error?: string }> {
  return withErrorHandling(async () => {
    const { user } = await getAuthContext()

    console.log(`[detectConnectionsForChunks] Starting for ${chunkIds.length} chunks`)

    // Create background job for connection detection
    const jobId = await createBackgroundJob(user.id, 'detect_connections', documentId, {
      document_id: documentId,
      chunk_ids: chunkIds
    })

    // Revalidate reader page to show detection started
    revalidatePath(`/read/${documentId}`)

    return { jobId }
  })
}

/**
 * Detect connections for a single chunk.
 * Alias for detectConnectionsForChunks with a single chunk ID.
 */
export async function detectSingleChunkConnections(chunkId: string) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = await createClient()

    // Get chunk's document
    const { data: chunk, error: chunkError } = await supabase
      .from('chunks')
      .select('document_id')
      .eq('id', chunkId)
      .single()

    if (chunkError || !chunk) {
      return { success: false, error: 'Chunk not found' }
    }

    // Create detect-connections job
    const { data: job, error: jobError } = await supabase
      .from('background_jobs')
      .insert({
        job_type: 'detect_connections',
        input_data: {
          document_id: chunk.document_id,
          chunk_ids: [chunkId],  // Single-chunk mode
          trigger: 'user_reader'
        },
        entity_id: chunk.document_id,
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (jobError) {
      return { success: false, error: `Failed to create job: ${jobError.message}` }
    }

    revalidatePath(`/read/${chunk.document_id}`)

    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('[detectSingleChunkConnections] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Load chunk detection statistics for a document using RPC function.
 */
export async function loadChunkDetectionStats(documentId: string) {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase
    .rpc('get_chunk_detection_stats', { doc_id: documentId })
    .single()

  if (error) throw error

  return data
}

/**
 * Detect connections for all undetected chunks in a document.
 * Uses RPC function to get chunk IDs efficiently.
 */
export async function detectAllUndetectedChunks(documentId: string) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const supabase = await createClient()

  // Get all undetected chunk IDs using RPC function
  const { data: chunkIds, error: rpcError } = await supabase
    .rpc('get_undetected_chunk_ids', { doc_id: documentId })

  if (rpcError) throw rpcError

  if (!chunkIds || chunkIds.length === 0) {
    return { success: true, message: 'All chunks already detected', chunkCount: 0 }
  }

  // Create batch detection job
  const { data: job, error: jobError } = await supabase
    .from('background_jobs')
    .insert({
      job_type: 'detect_connections',
      input_data: {
        document_id: documentId,
        chunk_ids: chunkIds.map((c: any) => c.chunk_id),
        trigger: 'admin_detect_all'
      },
      entity_id: documentId,
      user_id: user.id,
      status: 'pending'
    })
    .select()
    .single()

  if (jobError) throw jobError

  revalidatePath(`/read/${documentId}`)

  return { success: true, jobId: job.id, chunkCount: chunkIds.length }
}
