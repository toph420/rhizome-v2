'use client'

import { useCallback, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/rhizome/accordion'
import { Skeleton } from '@/components/rhizome/skeleton'
import { useChunkStats } from '@/hooks/use-chunk-stats'
import { useUnvalidatedChunks } from '@/hooks/use-unvalidated-chunks'
import { CheckCircle, AlertTriangle, FileText, Wrench } from 'lucide-react'
import { validateChunkPosition } from '@/app/actions/chunks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ChunkQualityPanelProps {
  documentId: string
  onNavigateToChunk?: (chunkId: string, correctionMode?: boolean) => void
}

interface StatCardProps {
  label: string
  count: number
  color: 'green' | 'blue' | 'yellow' | 'orange'
}

function StatCard({ label, count, color }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    orange: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20'
  }

  return (
    <Card className={cn('border', colorClasses[color])}>
      <CardContent className="p-3">
        <div className="text-2xl font-bold">{count}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

/**
 * ChunkQualityPanel displays chunk quality indicators from the Chonkie integration pipeline.
 * Shows Chonkie metadata confidence statistics and lists unvalidated chunks that need validation.
 *
 * **Chonkie Integration (Migration 050)**:
 * Quality levels now represent Chonkie metadata transfer confidence:
 * - **High**: 3+ Docling overlaps OR >70% coverage (excellent metadata transfer)
 * - **Medium**: 1-2 overlaps with >30% coverage (good metadata transfer)
 * - **Low**: <30% overlap (weak metadata transfer)
 * - **Interpolated**: No Docling overlaps (metadata from nearest neighbors)
 *
 * **User Actions**:
 * - View unvalidated chunks (interpolated, low/medium confidence)
 * - Validate chunk position correctness (mark as OK)
 * - Fix chunk position (enter correction mode)
 * - Navigate to chunk in document
 *
 * @param props - Component props
 * @param props.documentId - Document identifier for fetching chunk stats
 * @param props.onNavigateToChunk - Callback to navigate to a specific chunk
 */
export function ChunkQualityPanel({
  documentId,
  onNavigateToChunk
}: ChunkQualityPanelProps) {
  const { data: stats, isLoading: statsLoading } = useChunkStats(documentId)
  const { data: unvalidatedChunks, isLoading: unvalidatedLoading } = useUnvalidatedChunks(documentId)

  const handleValidateChunk = useCallback(async (chunkId: string) => {
    try {
      const result = await validateChunkPosition(chunkId, documentId)

      if (result.success) {
        toast.success('Chunk position validated', {
          description: 'Marked as manually verified'
        })
      } else {
        throw new Error(result.error || 'Unknown error')
      }
    } catch (err) {
      console.error('[ChunkQualityPanel] Error validating chunk:', err)
      toast.error('Failed to validate chunk', {
        description: err instanceof Error ? err.message : 'Please try again'
      })
    }
  }, [documentId])

  const handleShowInDocument = useCallback((chunkId: string) => {
    if (onNavigateToChunk) {
      onNavigateToChunk(chunkId, false)
    } else {
      toast.info('Navigation not available', {
        description: 'This feature requires onNavigateToChunk callback'
      })
    }
  }, [onNavigateToChunk])

  const handleFixPosition = useCallback((chunkId: string) => {
    if (onNavigateToChunk) {
      onNavigateToChunk(chunkId, true) // true = enter correction mode
      toast.info('Correction mode activated', {
        description: 'Select the correct text span for this chunk in the document'
      })
    } else {
      toast.info('Navigation not available', {
        description: 'This feature requires onNavigateToChunk callback'
      })
    }
  }, [onNavigateToChunk])

  const handleAcceptAll = useCallback(async (chunkIds: string[], categoryName: string) => {
    if (chunkIds.length === 0) return

    try {
      // Validate all chunks in parallel
      const results = await Promise.all(
        chunkIds.map(id => validateChunkPosition(id, documentId))
      )

      const successCount = results.filter(r => r.success).length
      const failCount = results.length - successCount

      if (successCount > 0) {
        toast.success(`Accepted ${successCount} chunk${successCount > 1 ? 's' : ''}`, {
          description: `All ${categoryName} chunks marked as validated${failCount > 0 ? ` (${failCount} failed)` : ''}`
        })
      }

      if (failCount > 0) {
        toast.error(`${failCount} chunk${failCount > 1 ? 's' : ''} failed to validate`)
      }
    } catch (err) {
      console.error('[ChunkQualityPanel] Error accepting all chunks:', err)
      toast.error('Failed to validate chunks', {
        description: 'Please try again'
      })
    }
  }, [documentId])

  // Loading state
  if (statsLoading || unvalidatedLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i}>
              <CardContent className="p-3">
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // No stats available (cloud mode or no chunks)
  if (!stats || stats.total === 0) {
    return (
      <div className="p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Chunk Quality</CardTitle>
            <CardDescription>
              Quality indicators not available. This document may have been processed in cloud mode.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Chonkie metadata confidence statistics */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Metadata Confidence</h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="High" count={stats.high} color="green" />
          <StatCard label="Medium" count={stats.medium} color="yellow" />
          <StatCard label="Low" count={stats.low} color="orange" />
          {stats.interpolated > 0 && (
            <StatCard label="Interpolated" count={stats.interpolated} color="orange" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Total chunks: {stats.total} • {Math.round((stats.high / stats.total) * 100)}% high confidence
          {stats.interpolated > 0 && ` • ${stats.interpolated} interpolated (no overlaps)`}
        </p>
      </div>

      {/* Unvalidated chunks list (needs validation) */}
      {unvalidatedChunks && unvalidatedChunks.all.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Chunks Needing Validation
            </CardTitle>
            <CardDescription>
              These chunks need manual validation or correction. Review warnings and take action.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {/* Interpolated chunks (no Docling overlaps) */}
              {unvalidatedChunks.interpolated.length > 0 && (
                <AccordionItem value="interpolated-category">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                        Interpolated ⚠️
                      </Badge>
                      <span>{unvalidatedChunks.interpolated.length} chunk{unvalidatedChunks.interpolated.length > 1 ? 's' : ''}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 mb-4">
                      <p className="text-xs text-muted-foreground p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded">
                        <strong className="text-orange-900 dark:text-orange-100">⚠️ No Overlaps Found:</strong> These chunks had <strong>no overlapping Docling chunks</strong> during metadata transfer. Metadata was interpolated from nearest neighbors. Please verify accuracy.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptAll(unvalidatedChunks.interpolated.map(c => c.id), 'interpolated')}
                        className="w-full text-xs"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Accept All Interpolated Chunks
                      </Button>
                    </div>
                    <Accordion type="single" collapsible className="pl-2">
                      {unvalidatedChunks.interpolated.map(chunk => (
                        <AccordionItem key={chunk.id} value={chunk.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2 text-sm">
                              <span>Chunk {chunk.chunk_index}</span>
                              {chunk.page_start !== null && (
                                <span className="text-muted-foreground">(Page {chunk.page_start})</span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {/* Warning message */}
                              {chunk.validation_warning && (
                                <div className="text-xs p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded">
                                  <p className="font-semibold text-orange-900 dark:text-orange-100">⚠️ {chunk.validation_warning}</p>
                                </div>
                              )}

                              {/* Chunk preview - full content */}
                              <div className="text-xs text-muted-foreground bg-muted p-2 rounded max-h-[200px] overflow-y-auto">
                                <FileText className="h-3 w-3 inline mr-1" />
                                {chunk.content}
                              </div>

                              {/* Metadata with Chonkie confidence info */}
                              <div className="text-xs space-y-1">
                                {chunk.metadata_confidence && (
                                  <p>
                                    <span className="font-semibold">Confidence:</span>{' '}
                                    <Badge variant={
                                      chunk.metadata_confidence === 'high' ? 'default' :
                                      chunk.metadata_confidence === 'medium' ? 'secondary' :
                                      'destructive'
                                    } className="text-xs">
                                      {chunk.metadata_confidence}
                                    </Badge>
                                  </p>
                                )}
                                {chunk.metadata_overlap_count !== null && chunk.metadata_overlap_count !== undefined && (
                                  <p><span className="font-semibold">Docling Overlaps:</span> {chunk.metadata_overlap_count} {chunk.metadata_overlap_count === 0 ? '(interpolated)' : ''}</p>
                                )}
                                <p><span className="font-semibold">Method:</span> {chunk.position_method || chunk.metadata_confidence ? 'Chonkie + metadata transfer' : 'Unknown'}</p>
                                {chunk.page_start !== null && (
                                  <p><span className="font-semibold">Pages:</span> {chunk.page_start}{chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ''}</p>
                                )}
                                {chunk.start_offset !== null && chunk.end_offset !== null && (
                                  <p><span className="font-semibold">Offsets:</span> {chunk.start_offset} - {chunk.end_offset}</p>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleValidateChunk(chunk.id)}
                                  className="text-xs"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Position OK
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFixPosition(chunk.id)}
                                  className="text-xs"
                                >
                                  <Wrench className="h-3 w-3 mr-1" />
                                  Fix Position
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleShowInDocument(chunk.id)}
                                  className="text-xs"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Low confidence chunks */}
              {unvalidatedChunks.lowConfidence.length > 0 && (
                <AccordionItem value="low-confidence-category">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
                        Low Confidence ⚠️
                      </Badge>
                      <span>{unvalidatedChunks.lowConfidence.length} chunk{unvalidatedChunks.lowConfidence.length > 1 ? 's' : ''}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 mb-4">
                      <p className="text-xs text-muted-foreground p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded">
                        <strong className="text-yellow-900 dark:text-yellow-100">⚠️ Weak Overlaps:</strong> These chunks had <strong>&lt;30% overlap</strong> with Docling chunks during metadata transfer. Metadata may be less accurate. Please verify.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptAll(unvalidatedChunks.lowConfidence.map(c => c.id), 'low-confidence')}
                        className="w-full text-xs"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Accept All Low Confidence Chunks
                      </Button>
                    </div>
                    <Accordion type="single" collapsible className="pl-2">
                      {unvalidatedChunks.lowConfidence.map(chunk => (
                        <AccordionItem key={chunk.id} value={chunk.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2 text-sm">
                              <span>Chunk {chunk.chunk_index}</span>
                              {chunk.page_start !== null && (
                                <span className="text-muted-foreground">(Page {chunk.page_start})</span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {/* Warning message */}
                              {chunk.validation_warning && (
                                <div className="text-xs p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded">
                                  <p className="font-semibold text-yellow-900 dark:text-yellow-100">⚠️ {chunk.validation_warning}</p>
                                </div>
                              )}

                              {/* Validation details */}
                              {chunk.validation_details && (
                                <div className="text-xs space-y-1 p-2 bg-muted rounded">
                                  {chunk.validation_details.original_offsets && chunk.validation_details.adjusted_offsets && (
                                    <>
                                      <p><span className="font-semibold">Original:</span> {chunk.validation_details.original_offsets.start} - {chunk.validation_details.original_offsets.end}</p>
                                      <p><span className="font-semibold">Adjusted:</span> {chunk.validation_details.adjusted_offsets.start} - {chunk.validation_details.adjusted_offsets.end}</p>
                                    </>
                                  )}
                                  {chunk.validation_details.reason && (
                                    <p><span className="font-semibold">Reason:</span> {chunk.validation_details.reason}</p>
                                  )}
                                </div>
                              )}

                              {/* Chunk preview - full content */}
                              <div className="text-xs text-muted-foreground bg-muted p-2 rounded max-h-[200px] overflow-y-auto">
                                <FileText className="h-3 w-3 inline mr-1" />
                                {chunk.content}
                              </div>

                              {/* Metadata with Chonkie confidence info */}
                              <div className="text-xs space-y-1">
                                {chunk.metadata_confidence && (
                                  <p>
                                    <span className="font-semibold">Confidence:</span>{' '}
                                    <Badge variant={
                                      chunk.metadata_confidence === 'high' ? 'default' :
                                      chunk.metadata_confidence === 'medium' ? 'secondary' :
                                      'destructive'
                                    } className="text-xs">
                                      {chunk.metadata_confidence}
                                    </Badge>
                                  </p>
                                )}
                                {chunk.metadata_overlap_count !== null && chunk.metadata_overlap_count !== undefined && (
                                  <p><span className="font-semibold">Docling Overlaps:</span> {chunk.metadata_overlap_count}</p>
                                )}
                                <p><span className="font-semibold">Method:</span> {chunk.position_method || chunk.metadata_confidence ? 'Chonkie + metadata transfer' : 'Unknown'}</p>
                                {chunk.page_start !== null && (
                                  <p><span className="font-semibold">Pages:</span> {chunk.page_start}{chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ''}</p>
                                )}
                                {chunk.start_offset !== null && chunk.end_offset !== null && (
                                  <p><span className="font-semibold">Offsets:</span> {chunk.start_offset} - {chunk.end_offset}</p>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleValidateChunk(chunk.id)}
                                  className="text-xs"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Position OK
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFixPosition(chunk.id)}
                                  className="text-xs"
                                >
                                  <Wrench className="h-3 w-3 mr-1" />
                                  Fix Position
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleShowInDocument(chunk.id)}
                                  className="text-xs"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              )}

              {/* Medium confidence chunks */}
              {unvalidatedChunks.mediumConfidence.length > 0 && (
                <AccordionItem value="medium-confidence-category">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
                        Medium Confidence 📊
                      </Badge>
                      <span>{unvalidatedChunks.mediumConfidence.length} chunk{unvalidatedChunks.mediumConfidence.length > 1 ? 's' : ''}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 mb-4">
                      <p className="text-xs text-muted-foreground p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded">
                        <strong className="text-yellow-900 dark:text-yellow-100">📊 Decent Overlaps:</strong> These chunks had <strong>1-2 Docling overlaps with 30-70% coverage</strong>. Metadata is likely correct but worth verifying.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAcceptAll(unvalidatedChunks.mediumConfidence.map(c => c.id), 'medium-confidence')}
                        className="w-full text-xs"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Accept All Medium Confidence Chunks
                      </Button>
                    </div>
                    <Accordion type="single" collapsible className="pl-2">
                      {unvalidatedChunks.mediumConfidence.map(chunk => (
                        <AccordionItem key={chunk.id} value={chunk.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2 text-sm">
                              <span>Chunk {chunk.chunk_index}</span>
                              {chunk.page_start !== null && (
                                <span className="text-muted-foreground">(Page {chunk.page_start})</span>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {/* Warning message */}
                              {chunk.validation_warning && (
                                <div className="text-xs p-2 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded">
                                  <p className="font-semibold text-yellow-900 dark:text-yellow-100">⚠️ {chunk.validation_warning}</p>
                                </div>
                              )}

                              {/* Chunk preview - full content */}
                              <div className="text-xs text-muted-foreground bg-muted p-2 rounded max-h-[200px] overflow-y-auto">
                                <FileText className="h-3 w-3 inline mr-1" />
                                {chunk.content}
                              </div>

                              {/* Metadata with Chonkie confidence info */}
                              <div className="text-xs space-y-1">
                                {chunk.metadata_confidence && (
                                  <p>
                                    <span className="font-semibold">Confidence:</span>{' '}
                                    <Badge variant={
                                      chunk.metadata_confidence === 'high' ? 'default' :
                                      chunk.metadata_confidence === 'medium' ? 'secondary' :
                                      'destructive'
                                    } className="text-xs">
                                      {chunk.metadata_confidence}
                                    </Badge>
                                  </p>
                                )}
                                {chunk.metadata_overlap_count !== null && chunk.metadata_overlap_count !== undefined && (
                                  <p><span className="font-semibold">Docling Overlaps:</span> {chunk.metadata_overlap_count}</p>
                                )}
                                <p><span className="font-semibold">Method:</span> {chunk.position_method || chunk.metadata_confidence ? 'Chonkie + metadata transfer' : 'Unknown'}</p>
                                {chunk.page_start !== null && (
                                  <p><span className="font-semibold">Pages:</span> {chunk.page_start}{chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ''}</p>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleValidateChunk(chunk.id)}
                                  className="text-xs"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Position OK
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFixPosition(chunk.id)}
                                  className="text-xs"
                                >
                                  <Wrench className="h-3 w-3 mr-1" />
                                  Fix Position
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleShowInDocument(chunk.id)}
                                  className="text-xs"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* All chunks validated - success state */}
      {unvalidatedChunks && unvalidatedChunks.all.length === 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-semibold">All chunks validated</p>
              <p className="text-xs text-muted-foreground">No chunks requiring validation</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
