'use client'

import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

/**
 * ActivityItem Component
 *
 * Displays a single activity/event item with icon, timestamp, and description.
 * Used in activity feeds, timelines, and notification lists.
 *
 * @example
 * ```tsx
 * <ActivityItem
 *   activity={{
 *     id: '123',
 *     type: 'document_processed',
 *     timestamp: new Date(),
 *     text: 'Thinking Fast & Slow processed successfully',
 *     metadata: { documentId: 'doc-123' }
 *   }}
 *   onClick={(activity) => router.push(`/read/${activity.metadata.documentId}`)}
 * />
 * ```
 */

export interface ActivityItemProps {
  activity: {
    id: string
    type:
      | 'connection_validated'
      | 'annotation_added'
      | 'document_processed'
      | 'spark_created'
      | 'document_added'
      | 'processing_started'
      | 'flashcard_reviewed'
    timestamp: Date | string
    text: string
    metadata?: {
      documentId?: string
      connectionId?: string
      annotationId?: string
      sparkId?: string
      entityId?: string
    }
  }
  onClick?: (activity: ActivityItemProps['activity']) => void
}

/**
 * Icon mapping for activity types
 * Provides visual distinction between different activity categories
 */
const activityIcons: Record<ActivityItemProps['activity']['type'], string> = {
  connection_validated: '✓',
  annotation_added: '📝',
  document_processed: '⚡',
  spark_created: '💭',
  document_added: '📚',
  processing_started: '⚡',
  flashcard_reviewed: '🎯',
}

export function ActivityItem({ activity, onClick }: ActivityItemProps) {
  const Component = onClick ? 'button' : 'div'
  const icon = activityIcons[activity.type]

  // Format timestamp using date-fns
  const timeAgo =
    activity.timestamp instanceof Date
      ? formatDistanceToNow(activity.timestamp, { addSuffix: true })
      : formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })

  return (
    <Component
      onClick={() => onClick?.(activity)}
      className={cn(
        'border-b border-border pb-2 w-full text-left',
        onClick && 'cursor-pointer hover:bg-muted transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
      )}
    >
      {/* Timestamp */}
      <p className="text-xs text-muted-foreground">{timeAgo}</p>

      {/* Icon + Text */}
      <p className="text-sm font-base">
        <span className="mr-2">{icon}</span>
        {activity.text}
      </p>
    </Component>
  )
}
