'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Progress } from '@/components/rhizome/progress'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { loadChunkDetectionStats, detectAllUndetectedChunks } from '@/app/actions/connections'
import { toast } from 'sonner'

interface ChunkDetectionStats {
  total_chunks: number
  detected_chunks: number
  undetected_chunks: number
  detection_rate: number
  avg_connections_per_chunk: number
}

export function ChunkStatsOverview({ documentId }: { documentId: string }) {
  const [stats, setStats] = useState<ChunkDetectionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDetecting, setIsDetecting] = useState(false)

  useEffect(() => {
    loadChunkDetectionStats(documentId)
      .then((data) => setStats(data as ChunkDetectionStats))
      .catch(err => {
        console.error('[ChunkStatsOverview] Failed to load stats:', err)
        toast.error('Failed to load detection stats')
      })
      .finally(() => setLoading(false))
  }, [documentId])

  const handleDetectAllUndetected = async () => {
    if (!stats || stats.undetected_chunks === 0) return

    setIsDetecting(true)
    try {
      const result = await detectAllUndetectedChunks(documentId)
      toast.success(`Detection started for ${result.chunkCount} chunks`, {
        description: 'Check ProcessingDock for progress'
      })
    } catch (error) {
      console.error('[ChunkStatsOverview] Detection failed:', error)
      toast.error('Failed to start detection')
    } finally {
      setIsDetecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!stats) {
    return <div className="p-4 text-sm text-muted-foreground">No stats available</div>
  }

  return (
    <div className="space-y-4 p-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detection Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.detected_chunks} / {stats.total_chunks}
            </div>
            <Progress
              value={stats.detection_rate}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {stats.detection_rate.toFixed(1)}% complete
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Avg Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.avg_connections_per_chunk.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              per detected chunk
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Batch Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Batch Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleDetectAllUndetected}
            disabled={stats.undetected_chunks === 0 || isDetecting}
            className="w-full"
          >
            {isDetecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Detecting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Detect All Undetected Chunks
                <Badge variant="secondary" className="ml-2">
                  {stats.undetected_chunks}
                </Badge>
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            {process.env.NEXT_PUBLIC_PROCESSING_MODE === 'local' ? (
              <>
                <AlertCircle className="h-3 w-3 inline mr-1" />
                LOCAL mode: ~{estimateLocalDetectionTime(stats.undetected_chunks)} minutes
              </>
            ) : (
              <>
                Estimated cost: ~${estimateCloudCost(stats.undetected_chunks).toFixed(2)}
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function estimateLocalDetectionTime(chunkCount: number): number {
  // ~2 seconds per chunk in LOCAL mode (3 engines)
  return Math.ceil((chunkCount * 2) / 60)
}

function estimateCloudCost(chunkCount: number): number {
  // ~$0.001 per chunk for Gemini API calls
  return chunkCount * 0.001
}
