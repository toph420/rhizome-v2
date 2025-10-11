'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Network, Highlighter, Zap, Brain, FileQuestion, Sliders } from 'lucide-react'
import { ConnectionsList } from './ConnectionsList'
import { AnnotationsList } from './AnnotationsList'
import { SparksTab } from './SparksTab'
import { FlashcardsTab } from './FlashcardsTab'
import { TuneTab } from './TuneTab'
import { ConnectionFilters } from './ConnectionFilters'
import { AnnotationReviewTab } from './AnnotationReviewTab'
import type { RecoveryResults } from '../../../worker/types/recovery'
import { cn } from '@/lib/utils'

interface RightPanelProps {
  documentId: string
  visibleChunkIds?: string[]
  reviewResults?: RecoveryResults | null
  onHighlightAnnotation?: (annotationId: string) => void
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
  onNavigateToChunk?: (chunkId: string) => void
  onConnectionsChange?: (connections: Array<{
    id: string
    source_chunk_id: string
    target_chunk_id: string
    strength: number
  }>) => void
  onActiveConnectionCountChange?: (count: number) => void
  chunks?: any[]
}

type TabId = 'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune'

interface Tab {
  id: TabId
  icon: typeof Network
  label: string
}

const TABS: Tab[] = [
  { id: 'connections', icon: Network, label: 'Connections' },
  { id: 'annotations', icon: Highlighter, label: 'Annotations' },
  { id: 'sparks', icon: Zap, label: 'Sparks' },
  { id: 'cards', icon: Brain, label: 'Cards' },
  { id: 'review', icon: FileQuestion, label: 'Review' },
  { id: 'tune', icon: Sliders, label: 'Tune' }
]

/**
 * Fixed right panel with 6 icon-only tabs.
 * Follows "Maximum Intelligence, Minimum Friction" philosophy.
 *
 * Tabs:
 * 1. Connections - 3-engine collision detection results
 * 2. Annotations - Highlights with notes
 * 3. Sparks - Quick captures with context (placeholder)
 * 4. Cards - Flashcards with FSRS (placeholder)
 * 5. Review - Annotation recovery
 * 6. Tune - Engine weights + settings
 *
 * @param props - Component props.
 * @param props.documentId - Document identifier for filtering.
 * @param props.reviewResults - Recovery results from document reprocessing.
 * @param props.onHighlightAnnotation - Callback to highlight annotation.
 * @param props.onNavigateToChunk - Callback to navigate to chunk.
 * @returns React element with collapsible right panel.
 */
export function RightPanel({
  documentId,
  visibleChunkIds = [],
  reviewResults = null,
  onHighlightAnnotation,
  onAnnotationClick,
  onNavigateToChunk,
  onConnectionsChange,
  onActiveConnectionCountChange,
  chunks = []
}: RightPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('connections')

  // Auto-switch to review tab when recovery results have items needing review
  useEffect(() => {
    if (reviewResults && reviewResults.needsReview.length > 0) {
      setActiveTab('review')
    }
  }, [reviewResults])

  // Badge counts (TODO: fetch real counts from database)
  const badgeCounts: Partial<Record<TabId, number>> = {
    // annotations: 0, // Will be populated from database
    // sparks: 0,
    // cards: 0,
    review: reviewResults?.needsReview.length || 0
  }
  
  return (
    <motion.div
      className="fixed right-0 top-14 bottom-0 border-l z-40 bg-background"
      initial={false}
      animate={{
        width: collapsed ? 48 : 384 // w-12 : w-96
      }}
      transition={{
        type: 'spring',
        damping: 25,
        stiffness: 300
      }}
    >
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-4 top-8 z-50 rounded-full border bg-background shadow-md"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      
      {/* Panel content (hidden when collapsed) */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="h-full flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Icon-only tabs (6 columns) */}
            <div className="grid grid-cols-6 border-b p-2 gap-1">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                const badgeCount = badgeCounts[tab.id]

                return (
                  <motion.button
                    key={tab.id}
                    className={cn(
                      'relative p-2 rounded flex flex-col items-center justify-center gap-1 transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Icon className="h-4 w-4" />
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center"
                      >
                        {badgeCount}
                      </Badge>
                    )}
                  </motion.button>
                )
              })}
            </div>

            {/* Active tab content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'connections' && (
                <div className="h-full flex flex-col">
                  <div className="border-b flex-shrink-0">
                    <ConnectionFilters />
                  </div>
                  <div className="flex-1 overflow-auto">
                    <ConnectionsList
                      documentId={documentId}
                      visibleChunkIds={visibleChunkIds}
                      onNavigateToChunk={onNavigateToChunk}
                      onConnectionsChange={onConnectionsChange}
                      onActiveConnectionCountChange={onActiveConnectionCountChange}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'annotations' && (
                <ScrollArea className="h-full">
                  <AnnotationsList
                    documentId={documentId}
                    onAnnotationClick={onAnnotationClick}
                  />
                </ScrollArea>
              )}

              {activeTab === 'sparks' && (
                <ScrollArea className="h-full">
                  <SparksTab documentId={documentId} />
                </ScrollArea>
              )}

              {activeTab === 'cards' && (
                <ScrollArea className="h-full">
                  <FlashcardsTab documentId={documentId} />
                </ScrollArea>
              )}

              {activeTab === 'review' && (
                <AnnotationReviewTab
                  documentId={documentId}
                  results={reviewResults}
                  onHighlightAnnotation={onHighlightAnnotation}
                />
              )}

              {activeTab === 'tune' && (
                <ScrollArea className="h-full">
                  <TuneTab />
                </ScrollArea>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}