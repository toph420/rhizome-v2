'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/rhizome/button'
import { ActivityItem, ActivityItemProps } from '@/components/rhizome/activity-item'

/**
 * ActivityFeed Component
 *
 * Client Component orchestrator for the activity feed section.
 * Manages navigation callbacks and interactive state.
 *
 * Pattern: Follows DeckGrid/StatsPanel pattern
 * - Server Component (homepage/page.tsx) imports this
 * - This Client Component creates callbacks
 * - Reusable ActivityItem accepts callbacks as props
 */

export function ActivityFeed() {
  const router = useRouter()

  // TODO: Replace with real data from Server Action getActivityFeed()
  // For now, using mock data matching the placeholder design
  const mockActivities: ActivityItemProps['activity'][] = [
    {
      id: '1',
      type: 'connection_validated',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      text: 'Validated Bridge connection',
      metadata: { connectionId: 'conn-123' },
    },
    {
      id: '2',
      type: 'annotation_added',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      text: 'Annotation added',
      metadata: { annotationId: 'ann-456' },
    },
    {
      id: '3',
      type: 'document_processed',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      text: 'Document processed',
      metadata: { documentId: 'doc-789' },
    },
    {
      id: '4',
      type: 'spark_created',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000), // 8 hours ago
      text: 'Spark captured',
      metadata: { sparkId: 'spark-101' },
    },
    {
      id: '5',
      type: 'document_added',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      text: 'Document added',
      metadata: { documentId: 'doc-202' },
    },
    {
      id: '6',
      type: 'processing_started',
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
      text: 'Processing started',
      metadata: { documentId: 'doc-303' },
    },
  ]

  /**
   * Handle activity item clicks
   * Navigate to relevant section based on activity metadata
   */
  const handleActivityClick = (activity: ActivityItemProps['activity']) => {
    const { metadata } = activity

    if (metadata?.documentId) {
      router.push(`/read/${metadata.documentId}`)
    } else if (metadata?.connectionId) {
      // TODO: Navigate to connection view when implemented
      console.log('Navigate to connection:', metadata.connectionId)
    } else if (metadata?.annotationId) {
      // TODO: Navigate to annotation when implemented
      console.log('Navigate to annotation:', metadata.annotationId)
    } else if (metadata?.sparkId) {
      // TODO: Navigate to spark view when implemented
      console.log('Navigate to spark:', metadata.sparkId)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with filter buttons */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-sm font-bold">Activity Feed</h3>
        <div className="flex gap-2 text-xs">
          <button className="hover:underline">All▾</button>
          <button className="hover:underline">24h▾</button>
        </div>
      </div>

      {/* Scrollable activity list */}
      <div className="space-y-3 flex-1 overflow-y-auto">
        {mockActivities.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            onClick={handleActivityClick}
          />
        ))}
      </div>

      {/* Load more button */}
      <Button variant="ghost" className="w-full mt-2 text-xs">
        Load more ↓
      </Button>
    </div>
  )
}
