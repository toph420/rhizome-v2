'use client'

import { useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { useChunkStats } from '@/hooks/use-chunk-stats'
import { useSyntheticChunks } from '@/hooks/use-synthetic-chunks'
import { CheckCircle, AlertTriangle, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ChunkQualityPanelProps {
  documentId: string
  onNavigateToChunk?: (chunkId: string) => void
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
 * ChunkQualityPanel displays chunk quality indicators from the local processing pipeline.
 * Shows confidence level statistics and lists synthetic chunks that need validation.
 *
 * **Quality Levels**:
 * - **Exact**: Perfect string match from Layer 1 fuzzy matching
 * - **High**: Embedding or multi-anchor match (>0.95 similarity)
 * - **Medium**: LLM-assisted match or lower embedding similarity (>0.85)
 * - **Synthetic**: Position interpolated from anchors (Layer 4 fallback)
 *
 * **User Actions**:
 * - View synthetic chunks (positions approximate, metadata preserved)
 * - Validate chunk position correctness
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
  const { data: syntheticChunks, isLoading: syntheticLoading } = useSyntheticChunks(documentId)

  const handleValidateChunk = useCallback(async (chunkId: string) => {
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('chunks')
        .update({ position_validated: true })
        .eq('id', chunkId)

      if (error) throw error

      toast.success('Chunk position validated', {
        description: 'Marked as manually verified'
      })
    } catch (err) {
      console.error('[ChunkQualityPanel] Error validating chunk:', err)
      toast.error('Failed to validate chunk', {
        description: 'Please try again'
      })
    }
  }, [])

  const handleShowInDocument = useCallback((chunkId: string) => {
    if (onNavigateToChunk) {
      onNavigateToChunk(chunkId)
    } else {
      toast.info('Navigation not available', {
        description: 'This feature requires onNavigateToChunk callback'
      })
    }
  }, [onNavigateToChunk])

  // Loading state
  if (statsLoading || syntheticLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map(i => (
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
      {/* Quality statistics grid */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Quality Statistics</h3>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Exact" count={stats.exact} color="green" />
          <StatCard label="High" count={stats.high} color="blue" />
          <StatCard label="Medium" count={stats.medium} color="yellow" />
          <StatCard label="Synthetic" count={stats.synthetic} color="orange" />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Total chunks: {stats.total} • {Math.round((stats.synthetic / stats.total) * 100)}% synthetic
        </p>
      </div>

      {/* Synthetic chunks list (needs validation) */}
      {syntheticChunks && syntheticChunks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Synthetic Chunks
            </CardTitle>
            <CardDescription>
              These chunks have interpolated positions. Please validate or review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {syntheticChunks.map(chunk => (
                <AccordionItem key={chunk.id} value={chunk.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                        Synthetic
                      </Badge>
                      <span>Chunk {chunk.chunk_index}</span>
                      {chunk.page_start !== null && (
                        <span className="text-muted-foreground">(Page {chunk.page_start})</span>
                      )}
                      {chunk.section_marker && (
                        <span className="text-muted-foreground text-xs">({chunk.section_marker})</span>
                      )}
                      {chunk.position_validated && (
                        <CheckCircle className="h-3 w-3 text-green-500 ml-auto" />
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {/* Chunk preview */}
                      <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                        <FileText className="h-3 w-3 inline mr-1" />
                        {chunk.content.substring(0, 150)}
                        {chunk.content.length > 150 && '...'}
                      </div>

                      {/* Metadata */}
                      <div className="text-xs space-y-1">
                        <p><span className="font-semibold">Method:</span> {chunk.position_method || 'Layer 4 (interpolation)'}</p>
                        {chunk.page_start !== null && (
                          <p><span className="font-semibold">Pages:</span> {chunk.page_start}{chunk.page_end && chunk.page_end !== chunk.page_start ? `-${chunk.page_end}` : ''}</p>
                        )}
                        {chunk.section_marker && (
                          <p><span className="font-semibold">Section:</span> {chunk.section_marker}</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        {!chunk.position_validated && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleValidateChunk(chunk.id)}
                            className="text-xs"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Position Correct
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleShowInDocument(chunk.id)}
                          className="text-xs"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          View in Document
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* No synthetic chunks - all good! */}
      {syntheticChunks && syntheticChunks.length === 0 && (
        <Card>
          <CardContent className="p-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-semibold">All chunks matched successfully</p>
              <p className="text-xs text-muted-foreground">No synthetic chunks requiring validation</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
