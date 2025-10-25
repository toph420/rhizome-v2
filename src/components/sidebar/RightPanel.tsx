'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/rhizome/tabs'
import { Badge } from '@/components/rhizome/badge'
import { ScrollArea } from '@/components/rhizome/scroll-area'
import {
  Network,
  Highlighter,
  Zap,
  Brain,
  Sliders,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Database,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Chunk } from '@/types/annotations'

// Tab components
import { ConnectionsList } from './ConnectionsList'
import { ConnectionFilters } from './ConnectionFilters'
import { AnnotationsTab } from './AnnotationsTab'
import { SparksTab } from './SparksTab'
import { FlashcardsTab } from './FlashcardsTab'
import { TuneTab } from './TuneTab'
import { CompactStudyTab } from './CompactStudyTab'
import { ChunksTab } from './ChunksTab'

type TabId = 'connections' | 'annotations' | 'sparks' | 'cards' | 'tune' | 'study' | 'chunks'

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
  { id: 'tune', icon: Sliders, label: 'Tune' },
  { id: 'study', icon: GraduationCap, label: 'Study' },
  { id: 'chunks', icon: Database, label: 'Chunks' },
]

interface ReviewResults {
  success: Array<{
    id: string
    text: string
    startOffset: number
    endOffset: number
    textContext?: { before: string; after: string }
    originalChunkIndex?: number
  }>
  needsReview: Array<{
    annotation: {
      id: string
      text: string
      startOffset: number
      endOffset: number
      textContext?: { before: string; after: string }
      originalChunkIndex?: number
    }
    suggestedMatch: {
      text: string
      startOffset: number
      endOffset: number
      confidence: number
      method: 'exact' | 'context' | 'chunk_bounded' | 'trigram'
      contextBefore?: string
      contextAfter?: string
    }
  }>
  lost: Array<{
    id: string
    text: string
    startOffset: number
    endOffset: number
    textContext?: { before: string; after: string }
    originalChunkIndex?: number
  }>
}

interface RightPanelV2Props {
  documentId: string
  visibleChunkIds?: string[]
  reviewResults?: ReviewResults | null
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
  chunks?: Chunk[]
}

export function RightPanelV2({
  documentId,
  visibleChunkIds = [],
  reviewResults = null,
  onHighlightAnnotation,
  onAnnotationClick,
  onNavigateToChunk,
  onConnectionsChange,
  onActiveConnectionCountChange,
}: RightPanelV2Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('connections')

  // Fixed position: TopNav (56px h-14) + DocumentHeader (78px with py-4)
  // Total: 134px from top
  const topPosition = 'top-[134px]'

  // Auto-switch to annotations tab when recovery results have items needing review
  useEffect(() => {
    if (reviewResults && reviewResults.needsReview.length > 0) {
      setActiveTab('annotations')
    }
  }, [reviewResults])

  // Badge counts
  const badgeCounts: Partial<Record<TabId, number>> = {
    annotations: reviewResults?.needsReview.length || 0,
  }

  return (
      <motion.div
        className={cn(
          "fixed right-0 bottom-0 border-l-2 border-border z-40 bg-secondary-background",
          topPosition
        )}
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
      {/* COLLAPSED: Vertical icon stack */}
      {collapsed && (
        <motion.div
          className="flex flex-col gap-2 p-2 h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Toggle button as first icon */}
          <motion.button
            className={cn(
              "relative p-2 rounded-base border-2 border-border",
              "hover:translate-x-1 hover:translate-y-1 hover:shadow-none",
              "transition-all shadow-base"
            )}
            onClick={() => setCollapsed(!collapsed)}
            title="Expand panel"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.button>

          {TABS.map((tab) => {
            const Icon = tab.icon
            const badgeCount = badgeCounts[tab.id]

            return (
              <motion.button
                key={tab.id}
                className={cn(
                  "relative p-2 rounded-base",
                  "hover:translate-x-1 hover:translate-y-1 hover:shadow-none",
                  "transition-all shadow-base",
                  activeTab === tab.id && "shadow-none translate-x-1 translate-y-1"
                )}
                onClick={() => {
                  setActiveTab(tab.id)
                  setCollapsed(false) // Expand on click
                }}
                title={tab.label}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Icon className="h-4 w-4" />
                {badgeCount !== undefined && badgeCount > 0 && (
                  <Badge
                    variant="default"
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center"
                  >
                    {badgeCount}
                  </Badge>
                )}
              </motion.button>
            )
          })}
        </motion.div>
      )}

      {/* Collapse button - positioned outside expanded panel */}
      {!collapsed && (
        <motion.button
          className={cn(
            "absolute -left-6 top-4 p-1.5 rounded-base border-2 border-border bg-secondary-background",
            "hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none",
            "transition-all shadow-base z-50"
          )}
          onClick={() => setCollapsed(true)}
          title="Collapse panel"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <ChevronRight className="h-3 w-3" />
        </motion.button>
      )}

      {/* EXPANDED: Horizontal tabs */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="h-full flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.2 }}
          >
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="h-full flex flex-col">
              <TabsList className="grid grid-cols-7 gap-1 p-2 m-4 border-b-2 border-border flex-shrink-0">
                {TABS.map((tab) => {
                  const Icon = tab.icon
                  const badgeCount = badgeCounts[tab.id]

                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center justify-center relative"
                      title={tab.label}
                    >
                      <Icon className="h-4 w-4" />
                      {badgeCount !== undefined && badgeCount > 0 && (
                        <Badge
                          variant="default"
                          className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center"
                        >
                          {badgeCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>

              {/* Tab content - let Tabs component handle switching */}
              <TabsContent value="connections" className="flex-1 flex flex-col overflow-hidden m-0 h-full">
                    <div className="border-b-2 border-border flex-shrink-0">
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
                  </TabsContent>

                  <TabsContent value="annotations" className="flex-1 overflow-hidden m-0 h-full">
                    <AnnotationsTab
                      documentId={documentId}
                      reviewResults={reviewResults}
                      onHighlightAnnotation={onHighlightAnnotation}
                      onAnnotationClick={onAnnotationClick}
                    />
                  </TabsContent>

                  <TabsContent value="sparks" className="flex-1 overflow-hidden m-0 h-full">
                    <ScrollArea className="h-full">
                      <SparksTab documentId={documentId} />
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="cards" className="flex-1 overflow-hidden m-0 h-full">
                    <ScrollArea className="h-full">
                      <FlashcardsTab documentId={documentId} />
                    </ScrollArea>
                  </TabsContent>

              <TabsContent value="tune" className="flex-1 overflow-hidden m-0 h-full">
                <ScrollArea className="h-full">
                  <TuneTab />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="study" className="flex-1 overflow-hidden m-0 h-full">
                <CompactStudyTab documentId={documentId} />
              </TabsContent>

              <TabsContent value="chunks" className="flex-1 overflow-hidden m-0 h-full">
                <ChunksTab
                  documentId={documentId}
                  onNavigateToChunk={onNavigateToChunk}
                />
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
