'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Loader2 } from 'lucide-react'
import { getStudyStats, type StudyStatsData } from '@/app/actions/stats'
import { cn } from '@/lib/utils'

interface StudyStatsProps {
  // Data source
  scope: 'global' | 'deck' | 'document'
  scopeId?: string  // deckId or documentId when scoped

  // Display mode
  mode: 'compact' | 'expanded'

  // Display options (expanded mode)
  showRetention?: boolean    // Retention rate (Good+Easy / Total)
  showStreak?: boolean       // Study streak (consecutive days)
  showUpcoming?: boolean     // Due cards breakdown
  className?: string
}

/**
 * Reusable study statistics component
 *
 * **Features**:
 * - Works in global, deck, or document scopes
 * - Compact mode (inline stats) or expanded mode (full analytics)
 * - Configurable display options
 * - Auto-refreshes on scope/scopeId changes
 *
 * **Usage**:
 * ```tsx
 * // Global stats in expanded mode
 * <StudyStats scope="global" mode="expanded" showRetention showStreak />
 *
 * // Deck stats in compact mode
 * <StudyStats scope="deck" scopeId={deckId} mode="compact" />
 *
 * // Document stats in sidebar
 * <StudyStats scope="document" scopeId={documentId} mode="compact" />
 * ```
 */
export function StudyStats({
  scope,
  scopeId,
  mode,
  showRetention = true,
  showStreak = true,
  showUpcoming = true,
  className,
}: StudyStatsProps) {
  const [stats, setStats] = useState<StudyStatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [scope, scopeId])

  const loadStats = async () => {
    setLoading(true)
    const result = await getStudyStats({ scope, scopeId, timeRange: 'today' })
    if (result.success && result.stats) {
      setStats(result.stats)
    }
    setLoading(false)
  }

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin" />
  }

  if (!stats) return null

  // Compact mode - 3-4 key stats in single row
  if (mode === 'compact') {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="text-xs">
          <span className="font-semibold">{stats.reviewedToday}</span>
          <span className="text-muted-foreground ml-1">today</span>
        </div>
        <div className="text-xs">
          <span className="font-semibold text-orange-600">{stats.dueCount}</span>
          <span className="text-muted-foreground ml-1">due</span>
        </div>
        {showStreak && stats.streak > 0 && (
          <div className="text-xs">
            <span className="font-semibold">{stats.streak}</span>
            <span className="text-muted-foreground ml-1">day streak 🔥</span>
          </div>
        )}
      </div>
    )
  }

  // Expanded mode - full analytics grid
  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-4">
        <h3 className="font-semibold">Study Statistics</h3>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Today" value={stats.reviewedToday} color="blue" />
          <StatCard label="Due" value={stats.dueCount} color="orange" />
          {showRetention && (
            <StatCard
              label="Retention"
              value={`${Math.round(stats.retentionRate * 100)}%`}
              color="green"
            />
          )}
          {showStreak && (
            <StatCard label="Streak" value={`${stats.streak} days`} color="yellow" />
          )}
        </div>

        {/* Upcoming Reviews */}
        {showUpcoming && stats.upcomingReviews.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Upcoming Reviews</p>
            <div className="space-y-1">
              {stats.upcomingReviews.slice(0, 3).map((item) => (
                <div key={item.date} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.date}</span>
                  <span className="font-semibold">{item.count} cards</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Helper component for stat cards
 */
function StatCard({
  label,
  value,
  color
}: {
  label: string
  value: string | number
  color: 'green' | 'blue' | 'yellow' | 'orange'
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
  }

  return (
    <div className={cn('border rounded-lg p-3', colorClasses[color])}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}
