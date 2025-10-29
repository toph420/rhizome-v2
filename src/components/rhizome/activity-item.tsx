'use client'

import { formatDistanceToNow } from 'date-fns'
import {
  CheckCircle2,
  FileEdit,
  Zap,
  Lightbulb,
  BookPlus,
  Play,
  Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ActivityItem Component
 *
 * Displays a single activity/event item with Lucide icon, timestamp, and description.
 * Features neobrutalist styling with colored accents and bold borders.
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
 * Activity type configuration with Lucide icons and neobrutalist colors
 * Uses color palette from globals.css for consistency
 */
const activityConfig: Record<
  ActivityItemProps['activity']['type'],
  {
    icon: React.ComponentType<{ className?: string }>
    accentColor: string
    bgColor: string
  }
> = {
  connection_validated: {
    icon: CheckCircle2,
    accentColor: 'border-forest',        // Green success from globals.css
    bgColor: 'bg-mint-green/20',         // Mint green tint
  },
  annotation_added: {
    icon: FileEdit,
    accentColor: 'border-sky',           // Sky blue from globals.css
    bgColor: 'bg-sky/20',                // Sky tint
  },
  document_processed: {
    icon: Zap,
    accentColor: 'border-mustard',       // Mustard yellow from globals.css
    bgColor: 'bg-mustard/20',            // Mustard tint
  },
  spark_created: {
    icon: Lightbulb,
    accentColor: 'border-lilac',         // Lilac purple from globals.css
    bgColor: 'bg-lilac/20',              // Lilac tint
  },
  document_added: {
    icon: BookPlus,
    accentColor: 'border-cyan',          // Cyan from globals.css
    bgColor: 'bg-cyan/20',               // Cyan tint
  },
  processing_started: {
    icon: Play,
    accentColor: 'border-coral',         // Coral orange from globals.css
    bgColor: 'bg-coral/20',              // Coral tint
  },
  flashcard_reviewed: {
    icon: Target,
    accentColor: 'border-rose',          // Rose pink from globals.css
    bgColor: 'bg-rose/20',               // Rose tint
  },
}

export function ActivityItem({ activity, onClick }: ActivityItemProps) {
  const Component = onClick ? 'button' : 'div'
  const config = activityConfig[activity.type]
  const Icon = config.icon

  // Format timestamp using date-fns
  const timeAgo =
    activity.timestamp instanceof Date
      ? formatDistanceToNow(activity.timestamp, { addSuffix: true })
      : formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })

  return (
    <Component
      onClick={() => onClick?.(activity)}
      className={cn(
        // Neobrutalist base styling
        'w-full text-left p-3 mb-2',
        'border-2 border-border rounded-base',
        'shadow-shadow',
        config.bgColor,
        // Colored left accent border
        'border-l-4',
        config.accentColor,
        // Interactive states
        onClick && [
          'cursor-pointer',
          'hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none',
          'transition-all duration-200',
        ],
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon badge with neobrutalist styling */}
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8',
            'flex items-center justify-center',
            'border-2 border-border rounded-base',
            'bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
          )}
        >
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Timestamp */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {timeAgo}
          </p>

          {/* Activity text */}
          <p className="text-sm font-base font-medium">{activity.text}</p>
        </div>
      </div>
    </Component>
  )
}
