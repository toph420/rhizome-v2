'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { AnnotationsList } from './AnnotationsList'
import { AnnotationReviewTab } from './AnnotationReviewTab'
import { List, FileQuestion } from 'lucide-react'
import { Badge } from '@/components/rhizome/badge'

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

interface AnnotationsTabProps {
  documentId: string
  reviewResults?: ReviewResults | null
  onHighlightAnnotation?: (annotationId: string) => void
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
}

/**
 * AnnotationsTab component with two sub-tabs:
 * - All: All annotations in document order
 * - Review: Fuzzy-matched annotations needing review
 */
export function AnnotationsTab({
  documentId,
  reviewResults = null,
  onHighlightAnnotation,
  onAnnotationClick,
}: AnnotationsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'review'>('all')

  // Calculate review count for badge
  const reviewCount = reviewResults?.needsReview.length || 0

  // Auto-switch to review sub-tab when there are items needing review
  useEffect(() => {
    if (reviewCount > 0) {
      setActiveSubTab('review')
    }
  }, [reviewCount])

  return (
    <div className="h-full flex flex-col">
      <Tabs
        value={activeSubTab}
        onValueChange={(value) => setActiveSubTab(value as 'all' | 'review')}
        className="h-full flex flex-col"
      >
        <TabsList className="grid grid-cols-2 gap-1 p-2 m-4 border-b-2 border-border flex-shrink-0">
          <TabsTrigger value="all" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <span className="text-sm">All</span>
          </TabsTrigger>
          <TabsTrigger value="review" className="flex items-center gap-2 relative">
            <FileQuestion className="h-4 w-4" />
            <span className="text-sm">Review</span>
            {reviewCount > 0 && (
              <Badge
                variant="default"
                className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center"
              >
                {reviewCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex-1 overflow-auto m-0">
          <AnnotationsList
            documentId={documentId}
            onAnnotationClick={onAnnotationClick}
          />
        </TabsContent>

        <TabsContent value="review" className="flex-1 overflow-hidden m-0 h-full">
          <AnnotationReviewTab
            documentId={documentId}
            results={reviewResults}
            onHighlightAnnotation={onHighlightAnnotation}
            onAnnotationClick={onAnnotationClick}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
