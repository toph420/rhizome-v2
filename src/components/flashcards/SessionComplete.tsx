'use client'

import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { CheckCircle } from 'lucide-react'

interface SessionStats {
  reviewedCount: number
  timeSpentMs: number
  againCount: number
  hardCount: number
  goodCount: number
  easyCount: number
}

interface SessionCompleteProps {
  stats: SessionStats
  onStudyMore: () => void
  onExit: () => void
  returnTo?: 'management' | { type: 'document'; id: string; title: string }
}

/**
 * Session completion screen with analytics and navigation
 *
 * **Features**:
 * - Rating breakdown visualization
 * - Retention calculation
 * - Time summary
 * - Smart navigation (back to management or document)
 * - "Study More" quick restart
 */
export function SessionComplete({
  stats,
  onStudyMore,
  onExit,
  returnTo,
}: SessionCompleteProps) {
  const totalRatings = stats.againCount + stats.hardCount + stats.goodCount + stats.easyCount
  const retention = totalRatings > 0
    ? ((stats.goodCount + stats.easyCount) / totalRatings) * 100
    : 0

  const timeMinutes = Math.floor(stats.timeSpentMs / 60000)
  const timeSeconds = Math.floor((stats.timeSpentMs % 60000) / 1000)

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-8 space-y-6">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-green-100 dark:bg-green-900/20">
              <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
            <p className="text-muted-foreground">
              You reviewed {stats.reviewedCount} card{stats.reviewedCount !== 1 ? 's' : ''} in{' '}
              {timeMinutes > 0 && `${timeMinutes} min `}
              {timeSeconds}s
            </p>
          </div>

          {/* Ratings Breakdown */}
          <div className="space-y-3">
            <h3 className="font-semibold text-center">Ratings Breakdown</h3>

            {/* Visual bars */}
            <div className="space-y-2">
              {stats.againCount > 0 && (
                <RatingBar
                  label="Again"
                  count={stats.againCount}
                  total={totalRatings}
                  color="bg-red-500"
                />
              )}
              {stats.hardCount > 0 && (
                <RatingBar
                  label="Hard"
                  count={stats.hardCount}
                  total={totalRatings}
                  color="bg-yellow-500"
                />
              )}
              {stats.goodCount > 0 && (
                <RatingBar
                  label="Good"
                  count={stats.goodCount}
                  total={totalRatings}
                  color="bg-blue-500"
                />
              )}
              {stats.easyCount > 0 && (
                <RatingBar
                  label="Easy"
                  count={stats.easyCount}
                  total={totalRatings}
                  color="bg-green-500"
                />
              )}
            </div>

            {/* Retention */}
            <div className="text-center pt-2 border-t">
              <p className="text-sm text-muted-foreground">Retention Rate</p>
              <p className="text-3xl font-bold text-green-600">
                {Math.round(retention)}%
              </p>
              <p className="text-xs text-muted-foreground">
                ({stats.goodCount + stats.easyCount} Good/Easy out of {totalRatings})
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="neutral"
              className="flex-1"
              onClick={onStudyMore}
            >
              Study More
            </Button>
            <Button
              className="flex-1"
              onClick={onExit}
            >
              {returnTo === 'management'
                ? 'Back to Management'
                : returnTo?.type === 'document'
                ? `Back to "${returnTo.title}"`
                : 'Done'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Rating bar visualization
 */
function RatingBar({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const percentage = (count / total) * 100

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {count} ({Math.round(percentage)}%)
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
