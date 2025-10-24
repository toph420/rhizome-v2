'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ============================================
// ZOD SCHEMAS
// ============================================

const StartSessionSchema = z.object({
  deckId: z.string().uuid().optional(),
  filters: z.object({
    tags: z.array(z.string()).optional(),
  }).optional(),
})

// ============================================
// SERVER ACTIONS
// ============================================

/**
 * Start a new study session
 * Returns session ID and due cards from flashcards_cache
 *
 * @param input - Session configuration (deck, filters)
 * @returns Session ID and array of due flashcards
 */
export async function startStudySession(input: z.infer<typeof StartSessionSchema>) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = StartSessionSchema.parse(input)
    const supabase = createAdminClient()

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from('study_sessions')
      .insert({
        user_id: user.id,
        deck_id: validated.deckId || null,
        started_at: new Date().toISOString(),
        filters_applied: validated.filters || null,
      })
      .select()
      .single()

    if (sessionError) throw sessionError

    // Get due cards from cache table (fast)
    const now = new Date().toISOString()
    let query = supabase
      .from('flashcards_cache')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lte('next_review', now)
      .order('next_review', { ascending: true })
      .limit(50)

    if (validated.deckId) {
      query = query.eq('deck_id', validated.deckId)
    }

    if (validated.filters?.tags && validated.filters.tags.length > 0) {
      query = query.contains('tags', validated.filters.tags)
    }

    const { data: cards, error: cardsError } = await query

    if (cardsError) throw cardsError

    console.log(`[Study] ✓ Started session ${session.id}: ${cards?.length || 0} cards due`)

    return {
      success: true,
      sessionId: session.id,
      cards: cards || [],
    }

  } catch (error) {
    console.error('[Study] Start session failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Update session stats after reviewing a card
 * Uses RPC function from migration 063
 */
export async function updateSessionStats(
  sessionId: string,
  rating: number,
  timeSpentMs: number
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    // Call RPC function (from migration 063_study_sessions.sql)
    const { error } = await supabase.rpc('update_study_session', {
      p_session_id: sessionId,
      p_rating: rating,
      p_time_ms: timeSpentMs,
    })

    if (error) throw error

    return { success: true }

  } catch (error) {
    console.error('[Study] Update stats failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update session stats',
    }
  }
}

/**
 * End study session (sets ended_at timestamp)
 */
export async function endStudySession(sessionId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('study_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', user.id)

    if (error) throw error

    revalidatePath('/flashcards/study')
    revalidatePath('/flashcards')

    console.log(`[Study] ✓ Ended session ${sessionId}`)

    return { success: true }

  } catch (error) {
    console.error('[Study] End session failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to end session',
    }
  }
}

/**
 * Get session stats (for display during study)
 */
export async function getSessionStats(sessionId: string) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return {
      success: true,
      stats: {
        reviewedCount: data.reviewed_count,
        againCount: data.again_count,
        hardCount: data.hard_count,
        goodCount: data.good_count,
        easyCount: data.easy_count,
        totalTimeMs: data.total_time_ms,
        startedAt: data.started_at,
        endedAt: data.ended_at,
      },
    }

  } catch (error) {
    console.error('[Study] Get stats failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session stats',
    }
  }
}
