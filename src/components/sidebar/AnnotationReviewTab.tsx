'use client'

import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { RecoveryResults, ReviewItem } from '../../worker/types/recovery'
import { getPendingImports, acceptImport, rejectImport, type PendingImport } from '@/app/actions/import-review'
import { acceptAnnotationMatch, rejectAnnotationMatch } from '@/app/actions/annotations'

interface AnnotationReviewTabProps {
  documentId: string
  results: RecoveryResults | null
  onHighlightAnnotation?: (annotationId: string) => void
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
}

/**
 * Review tab for fuzzy-matched annotations after document reprocessing
 *
 * Features:
 * - Stats summary (3 columns: Restored, Review, Lost)
 * - Review queue with confidence scores
 * - Accept/Discard individual items
 * - Batch operations (Accept All, Discard All)
 * - Lost annotations in collapsible section
 */
export function AnnotationReviewTab({
  documentId,
  results,
  onHighlightAnnotation,
  onAnnotationClick
}: AnnotationReviewTabProps) {
  const [showLost, setShowLost] = useState(false)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([])
  const [loadingImports, setLoadingImports] = useState(true)

  // Fetch pending imports on mount
  useEffect(() => {
    async function fetchPendingImports() {
      setLoadingImports(true)
      const result = await getPendingImports(documentId)
      if (result.success) {
        setPendingImports(result.data)
      }
      setLoadingImports(false)
    }

    fetchPendingImports()
  }, [documentId])

  // Check if there's anything to review
  const hasRecovery = results && results.needsReview.length > 0
  const hasImports = pendingImports.length > 0

  if (!hasRecovery && !hasImports && !loadingImports) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No annotations need review</p>
        <p className="text-sm mt-2">All annotations were automatically processed</p>
      </div>
    )
  }

  const { success, needsReview, lost } = results || { success: [], needsReview: [], lost: [] }

  /**
   * Accept a single fuzzy match suggestion
   */
  async function handleAccept(item: ReviewItem) {
    setProcessingIds((prev) => new Set(prev).add(item.annotation.id))

    try {
      const result = await acceptAnnotationMatch(item.annotation.id, {
        startOffset: item.suggestedMatch.startOffset,
        endOffset: item.suggestedMatch.endOffset,
        text: item.suggestedMatch.text,
        confidence: item.suggestedMatch.confidence,
        method: item.suggestedMatch.method,
      })

      if (!result.success) {
        throw new Error(result.error || 'Accept failed')
      }

      toast.success('Annotation Accepted', {
        description: `Confidence: ${(item.suggestedMatch.confidence * 100).toFixed(1)}%`
      })

      // Remove from needsReview list (no page reload needed)
      if (results) {
        results.needsReview = results.needsReview.filter(r => r.annotation.id !== item.annotation.id)
        // Move to success list
        results.success.push({
          id: item.annotation.id,
          text: item.suggestedMatch.text,
          confidence: item.suggestedMatch.confidence,
          method: item.suggestedMatch.method,
        })
      }

    } catch (error) {
      toast.error('Accept Failed', {
        description: error instanceof Error ? error.message : 'Failed to accept match'
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.annotation.id)
        return next
      })
    }
  }

  /**
   * Discard a single annotation (mark as lost)
   */
  async function handleDiscard(item: ReviewItem) {
    setProcessingIds((prev) => new Set(prev).add(item.annotation.id))

    try {
      const result = await rejectAnnotationMatch(item.annotation.id)

      if (!result.success) {
        throw new Error(result.error || 'Reject failed')
      }

      toast.success('Annotation Discarded')

      // Remove from needsReview list (no page reload needed)
      if (results) {
        results.needsReview = results.needsReview.filter(r => r.annotation.id !== item.annotation.id)
        // Move to lost list
        results.lost.push({
          id: item.annotation.id,
          text: item.annotation.text,
          confidence: 0,
          method: 'lost',
        })
      }

    } catch (error) {
      toast.error('Discard Failed', {
        description: error instanceof Error ? error.message : 'Failed to discard annotation'
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.annotation.id)
        return next
      })
    }
  }

  /**
   * Accept all pending matches at once
   */
  async function handleAcceptAll() {
    try {
      // Process all accepts in parallel
      const results = await Promise.all(
        needsReview.map((item) =>
          acceptAnnotationMatch(item.annotation.id, {
            startOffset: item.suggestedMatch.startOffset,
            endOffset: item.suggestedMatch.endOffset,
            text: item.suggestedMatch.text,
            confidence: item.suggestedMatch.confidence,
            method: item.suggestedMatch.method,
          })
        )
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        throw new Error(`${failed.length} annotations failed to accept`)
      }

      toast.success('All Accepted', {
        description: `Accepted ${needsReview.length} annotations`
      })

      // Clear needsReview list (no page reload needed)
      if (results) {
        results.success.push(...needsReview.map(item => ({
          id: item.annotation.id,
          text: item.suggestedMatch.text,
          confidence: item.suggestedMatch.confidence,
          method: item.suggestedMatch.method,
        })))
        results.needsReview = []
      }

    } catch (error) {
      toast.error('Batch Accept Failed', {
        description: error instanceof Error ? error.message : 'Failed to accept all'
      })
    }
  }

  /**
   * Discard all pending matches at once
   */
  async function handleDiscardAll() {
    try {
      // Process all rejects in parallel
      const results = await Promise.all(
        needsReview.map((item) => rejectAnnotationMatch(item.annotation.id))
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        throw new Error(`${failed.length} annotations failed to discard`)
      }

      toast.success('All Discarded', {
        description: `Discarded ${needsReview.length} annotations`
      })

      // Clear needsReview list (no page reload needed)
      if (results) {
        results.lost.push(...needsReview.map(item => ({
          id: item.annotation.id,
          text: item.annotation.text,
          confidence: 0,
          method: 'lost',
        })))
        results.needsReview = []
      }

    } catch (error) {
      toast.error('Batch Discard Failed', {
        description: error instanceof Error ? error.message : 'Failed to discard all'
      })
    }
  }

  /**
   * Accept a pending import
   */
  async function handleAcceptImport(pending: PendingImport) {
    setProcessingIds((prev) => new Set(prev).add(pending.id))

    try {
      const result = await acceptImport(pending.id)

      if (!result.success) {
        throw new Error(result.error || 'Failed to accept import')
      }

      toast.success('Import Accepted', {
        description: `Confidence: ${(pending.confidence * 100).toFixed(1)}%`
      })

      // Remove from pending list
      setPendingImports(prev => prev.filter(p => p.id !== pending.id))

    } catch (error) {
      toast.error('Accept Failed', {
        description: error instanceof Error ? error.message : 'Failed to accept import'
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(pending.id)
        return next
      })
    }
  }

  /**
   * Reject a pending import
   */
  async function handleRejectImport(pending: PendingImport) {
    setProcessingIds((prev) => new Set(prev).add(pending.id))

    try {
      const result = await rejectImport(pending.id)

      if (!result.success) {
        throw new Error(result.error || 'Failed to reject import')
      }

      toast.success('Import Rejected')

      // Remove from pending list
      setPendingImports(prev => prev.filter(p => p.id !== pending.id))

    } catch (error) {
      toast.error('Reject Failed', {
        description: error instanceof Error ? error.message : 'Failed to reject import'
      })
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev)
        next.delete(pending.id)
        return next
      })
    }
  }

  /**
   * Get confidence color based on score
   */
  function getConfidenceColor(confidence: number): 'default' | 'secondary' | 'destructive' {
    if (confidence >= 0.85) return 'default'
    if (confidence >= 0.75) return 'secondary'
    return 'destructive'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats Summary */}
      <div className="p-4 grid grid-cols-3 gap-2 border-b">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-semibold text-lg">{success.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">Restored</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-yellow-600">
            <AlertCircle className="h-4 w-4" />
            <span className="font-semibold text-lg">{needsReview.length + pendingImports.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">Review</p>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="font-semibold text-lg">{lost.length}</span>
          </div>
          <p className="text-xs text-muted-foreground">Lost</p>
        </div>
      </div>

      {/* Review Queue */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {needsReview.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-4">
              No annotations need review
            </p>
          ) : (
            <>
              {needsReview.map((item, index) => (
                <Card
                  key={item.annotation.id}
                  className="p-3 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => {
                    // Prefer onAnnotationClick for scroll coordination (like AnnotationsList)
                    if (onAnnotationClick) {
                      onAnnotationClick(item.annotation.id, item.annotation.startOffset)
                    } else {
                      onHighlightAnnotation?.(item.annotation.id)
                    }
                  }}
                >
                  <div className="space-y-2">
                    {/* Confidence badge */}
                    <div className="flex items-center justify-between">
                      <Badge variant={getConfidenceColor(item.suggestedMatch.confidence)}>
                        {(item.suggestedMatch.confidence * 100).toFixed(1)}% confidence
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.suggestedMatch.method}
                      </span>
                    </div>

                    {/* Original text */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Original:</p>
                      <p className="text-sm line-clamp-2">{item.annotation.text}</p>
                    </div>

                    {/* Suggested match */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Suggested:</p>
                      <p className="text-sm line-clamp-2 text-green-700 dark:text-green-400">
                        {item.suggestedMatch.text}
                      </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAccept(item)
                        }}
                        disabled={processingIds.has(item.annotation.id)}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDiscard(item)
                        }}
                        disabled={processingIds.has(item.annotation.id)}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Discard
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}

          {/* Readwise Import Reviews */}
          {pendingImports.length > 0 && (
            <>
              {needsReview.length > 0 && <Separator className="my-4" />}
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Readwise Imports</h3>
                <Badge variant="secondary">{pendingImports.length}</Badge>
              </div>

              {pendingImports.map((pending) => (
                <Card
                  key={pending.id}
                  className="p-3 hover:bg-accent transition-colors"
                >
                  <div className="space-y-2">
                    {/* Confidence badge */}
                    <div className="flex items-center justify-between">
                      <Badge variant={getConfidenceColor(pending.confidence)}>
                        {(pending.confidence * 100).toFixed(1)}% confidence
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {pending.suggestedMatch.method}
                      </span>
                    </div>

                    {/* Original text */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Readwise Highlight:</p>
                      <p className="text-sm line-clamp-2">{pending.highlightData.text}</p>
                    </div>

                    {/* Suggested match */}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Matched Position:</p>
                      <p className="text-sm line-clamp-2 text-green-700 dark:text-green-400">
                        {pending.suggestedMatch.text}
                      </p>
                    </div>

                    {/* Note if exists */}
                    {pending.highlightData.note && (
                      <div className="bg-muted/50 p-2 rounded-sm">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Note: </span>
                          {pending.highlightData.note}
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="flex-1"
                        onClick={() => handleAcceptImport(pending)}
                        disabled={processingIds.has(pending.id)}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => handleRejectImport(pending)}
                        disabled={processingIds.has(pending.id)}
                      >
                        <XCircle className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          )}

          {/* Lost annotations (collapsible) */}
          {lost.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <button
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
                  onClick={() => setShowLost(!showLost)}
                >
                  {showLost ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Lost Annotations ({lost.length})
                </button>

                {showLost && (
                  <div className="mt-2 space-y-2">
                    {lost.map((annotation) => (
                      <Card key={annotation.id} className="p-3 opacity-50">
                        <p className="text-sm line-clamp-2">{annotation.text}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Could not recover (confidence &lt;75%)
                        </p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Batch operations footer */}
      {needsReview.length > 0 && (
        <div className="border-t p-4 space-y-2">
          <Button
            className="w-full"
            onClick={handleAcceptAll}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Accept All ({needsReview.length})
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={handleDiscardAll}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Discard All
          </Button>
        </div>
      )}
    </div>
  )
}
