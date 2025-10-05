'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ConnectionsList } from './ConnectionsList'
import { AnnotationsList } from './AnnotationsList'
import { WeightTuning } from './WeightTuning'
import { ConnectionFilters } from './ConnectionFilters'
import { AnnotationReviewTab } from './AnnotationReviewTab'
import type { RecoveryResults } from '../../../worker/types/recovery'

interface RightPanelProps {
  documentId: string
  visibleChunkIds?: string[]
  reviewResults?: RecoveryResults | null
  onHighlightAnnotation?: (annotationId: string) => void
  onNavigateToChunk?: (chunkId: string) => void
}

/**
 * Fixed right panel with Connections, Annotations, Review, and Weights tabs.
 * Follows ProcessingDock.tsx collapse/expand pattern with Framer Motion animations.
 *
 * Auto-switches to review tab when annotation recovery results are available.
 *
 * @param props - Component props.
 * @param props.documentId - Document identifier for filtering connections and annotations.
 * @param props.reviewResults - Recovery results from document reprocessing (triggers review tab).
 * @param props.onHighlightAnnotation - Callback to highlight annotation in document viewer.
 * @returns React element with collapsible right panel.
 */
export function RightPanel({
  documentId,
  visibleChunkIds = [],
  reviewResults = null,
  onHighlightAnnotation,
  onNavigateToChunk
}: RightPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'connections' | 'annotations' | 'review' | 'weights'>('connections')

  // Auto-switch to review tab when recovery results have items needing review
  useEffect(() => {
    if (reviewResults && reviewResults.needsReview.length > 0) {
      setActiveTab('review')
    }
  }, [reviewResults])
  
  return (
    <motion.div
      className="fixed right-0 top-0 bottom-0 border-l z-40 bg-background"
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
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'connections' | 'annotations' | 'review' | 'weights')}
              className="h-full flex flex-col"
            >
              <TabsList className="grid w-full grid-cols-4 m-4">
                <TabsTrigger value="connections">Connections</TabsTrigger>
                <TabsTrigger value="annotations">Annotations</TabsTrigger>
                <TabsTrigger value="review" className="relative">
                  Review
                  {reviewResults && reviewResults.needsReview.length > 0 && (
                    <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs">
                      {reviewResults.needsReview.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="weights">Weights</TabsTrigger>
              </TabsList>
              
              <TabsContent value="connections" className="flex-1 m-0 flex flex-col h-full">
                <div className="border-b flex-shrink-0">
                  <ConnectionFilters />
                </div>
                <div className="flex-1 overflow-auto scrollbar-hide">
                  <ConnectionsList
                    documentId={documentId}
                    visibleChunkIds={visibleChunkIds}
                    onNavigateToChunk={onNavigateToChunk}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="annotations" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <AnnotationsList
                    documentId={documentId}
                    onAnnotationClick={onHighlightAnnotation}
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="review" className="flex-1 overflow-hidden m-0">
                <AnnotationReviewTab
                  documentId={documentId}
                  results={reviewResults}
                  onHighlightAnnotation={onHighlightAnnotation}
                />
              </TabsContent>

              <TabsContent value="weights" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <WeightTuning />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}