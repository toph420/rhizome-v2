'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'

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

    const { data, error } = await supabase
      .from('connections')
      .select('*')
      .in('source_chunk_id', validChunkIds)
      .order('strength', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[getConnectionsForChunks] Error:', error)
      return []
    }

    console.log('[getConnectionsForChunks] Fetched connections:', data?.length || 0)
    return data || []
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
