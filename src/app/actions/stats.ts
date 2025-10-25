'use server'

import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const GetStatsSchema = z.object({
  scope: z.enum(['global', 'deck', 'document']),
  scopeId: z.string().uuid().optional(),
  timeRange: z.enum(['today', 'week', 'month', 'all']).optional(),
})

export interface StudyStatsData {
  reviewedToday: number
  reviewedThisWeek: number
  dueCount: number
  retentionRate: number       // (Good + Easy) / Total
  avgTimePerCard: number      // milliseconds
  streak: number              // consecutive days studied
  upcomingReviews: Array<{
    date: string              // 'Today', 'Tomorrow', 'Fri Oct 25'
    count: number
  }>
}

/**
 * Get study statistics for global, deck, or document scope
 *
 * @example
 * // Global stats
 * getStudyStats({ scope: 'global', timeRange: 'week' })
 *
 * // Deck stats
 * getStudyStats({ scope: 'deck', scopeId: deckId })
 *
 * // Document stats
 * getStudyStats({ scope: 'document', scopeId: documentId })
 */
export async function getStudyStats(
  input: z.infer<typeof GetStatsSchema>
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')

  try {
    const validated = GetStatsSchema.parse(input)
    const supabase = createAdminClient()

    // Calculate date ranges
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    // Base query for sessions
    let sessionsQuery = supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', user.id)

    // Apply scope filters
    if (validated.scope === 'deck' && validated.scopeId) {
      sessionsQuery = sessionsQuery.eq('deck_id', validated.scopeId)
    }
    // Note: document scope requires joining through flashcards_cache (implement if needed)

    // Get sessions
    const { data: sessions } = await sessionsQuery

    // Calculate stats
    const todaySessions = sessions?.filter(s =>
      new Date(s.started_at) >= today
    ) || []

    const weekSessions = sessions?.filter(s =>
      new Date(s.started_at) >= weekAgo
    ) || []

    const reviewedToday = todaySessions.reduce((sum, s) =>
      sum + (s.cards_reviewed || 0), 0
    )

    const reviewedThisWeek = weekSessions.reduce((sum, s) =>
      sum + (s.cards_reviewed || 0), 0
    )

    // Calculate retention rate from ratings
    const totalRatings = weekSessions.reduce((sum, s) => {
      const ratings = s.ratings || { again: 0, hard: 0, good: 0, easy: 0 }
      return sum + ratings.again + ratings.hard + ratings.good + ratings.easy
    }, 0)

    const goodRatings = weekSessions.reduce((sum, s) => {
      const ratings = s.ratings || { again: 0, hard: 0, good: 0, easy: 0 }
      return sum + ratings.good + ratings.easy
    }, 0)

    const retentionRate = totalRatings > 0 ? goodRatings / totalRatings : 0

    // Calculate streak (consecutive days with at least 1 review)
    const streak = calculateStreak(sessions || [])

    // Get due cards count
    let dueQuery = supabase
      .from('flashcards_cache')
      .select('entity_id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .lte('next_review', now.toISOString())

    if (validated.scope === 'deck' && validated.scopeId) {
      dueQuery = dueQuery.eq('deck_id', validated.scopeId)
    }
    if (validated.scope === 'document' && validated.scopeId) {
      dueQuery = dueQuery.eq('document_id', validated.scopeId)
    }

    const { count: dueCount } = await dueQuery

    // Get upcoming reviews (next 7 days)
    const upcomingReviews = await getUpcomingReviews(
      supabase,
      user.id,
      validated.scope,
      validated.scopeId
    )

    // Calculate average time per card
    const totalTime = weekSessions.reduce((sum, s) =>
      sum + (s.total_time_ms || 0), 0
    )
    const avgTimePerCard = reviewedThisWeek > 0
      ? totalTime / reviewedThisWeek
      : 0

    return {
      success: true,
      stats: {
        reviewedToday,
        reviewedThisWeek,
        dueCount: dueCount || 0,
        retentionRate,
        avgTimePerCard,
        streak,
        upcomingReviews,
      } as StudyStatsData
    }

  } catch (error) {
    console.error('[Stats] Get stats failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

interface StudySession {
  started_at: string
  [key: string]: unknown
}

/**
 * Calculate study streak (consecutive days with reviews)
 */
function calculateStreak(sessions: StudySession[]): number {
  if (sessions.length === 0) return 0

  // Group sessions by date
  const dateSet = new Set<string>()
  sessions.forEach(s => {
    const date = new Date(s.started_at)
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    dateSet.add(dateStr)
  })

  const dates = Array.from(dateSet).sort().reverse()

  // Count consecutive days from today
  const today = new Date()
  let streak = 0
  let checkDate = new Date(today)

  for (let i = 0; i < dates.length; i++) {
    const dateStr = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
    if (dates.includes(dateStr)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

/**
 * Get upcoming review counts for next 7 days
 */
async function getUpcomingReviews(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  scope: 'global' | 'deck' | 'document',
  scopeId?: string
) {
  const now = new Date()
  const upcoming: Array<{ date: string; count: number }> = []

  for (let i = 0; i < 7; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() + i)
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)

    let query = supabase
      .from('flashcards_cache')
      .select('entity_id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('next_review', startOfDay.toISOString())
      .lt('next_review', endOfDay.toISOString())

    if (scope === 'deck' && scopeId) {
      query = query.eq('deck_id', scopeId)
    }
    if (scope === 'document' && scopeId) {
      query = query.eq('document_id', scopeId)
    }

    const { count } = await query

    if (count && count > 0) {
      const dateLabel = i === 0 ? 'Today' :
                        i === 1 ? 'Tomorrow' :
                        date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

      upcoming.push({ date: dateLabel, count })
    }
  }

  return upcoming
}
