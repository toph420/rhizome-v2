'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/rhizome/button'
import { ActivityItem, ActivityItemProps } from '@/components/rhizome/activity-item'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/rhizome/dropdown-menu'
import { ChevronDown } from 'lucide-react'

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
      {/* Header with neobrutalist filter dropdowns */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading text-lg font-black uppercase tracking-tight">
          Activity Feed
        </h3>
        <div className="flex gap-2">
          {/* Activity Type Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2 py-1 text-xs font-medium border-2 border-border rounded-base bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-1">
                All <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-2 border-border shadow-shadow">
              <DropdownMenuItem>All Activities</DropdownMenuItem>
              <DropdownMenuItem>Connections</DropdownMenuItem>
              <DropdownMenuItem>Annotations</DropdownMenuItem>
              <DropdownMenuItem>Documents</DropdownMenuItem>
              <DropdownMenuItem>Sparks</DropdownMenuItem>
              <DropdownMenuItem>Flashcards</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Time Range Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2 py-1 text-xs font-medium border-2 border-border rounded-base bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all flex items-center gap-1">
                24h <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-2 border-border shadow-shadow">
              <DropdownMenuItem>Last Hour</DropdownMenuItem>
              <DropdownMenuItem>Last 24 Hours</DropdownMenuItem>
              <DropdownMenuItem>Last 7 Days</DropdownMenuItem>
              <DropdownMenuItem>Last 30 Days</DropdownMenuItem>
              <DropdownMenuItem>All Time</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scrollable activity list with custom scrollbar */}
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-0">
        {mockActivities.map((activity) => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            onClick={handleActivityClick}
          />
        ))}
      </div>

      {/* Load more button with neobrutalist styling */}
      <Button
        variant="outline"
        className="w-full mt-3 font-bold border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
      >
        Load more ↓
      </Button>
    </div>
  )
}
