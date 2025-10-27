'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { enrichAllUnenrichedChunks, loadChunkEnrichmentStats } from '@/app/actions/enrichments'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'

interface EnrichmentStats {
  total: number
  enriched: number
  skipped: number
  pending: number
  error: number
}

export function EnrichmentsTab() {
  const params = useParams()
  const documentId = params?.id as string | undefined

  const [isEnriching, setIsEnriching] = useState(false)
  const [stats, setStats] = useState<EnrichmentStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  // Load stats on mount
  useEffect(() => {
    if (documentId) {
      loadStats()
    }
  }, [documentId])

  const loadStats = async () => {
    if (!documentId) {
      toast.error('No document selected')
      return
    }

    setIsLoadingStats(true)
    try {
      const data = await loadChunkEnrichmentStats(documentId)
      if (data) {
        setStats(data)
      } else {
        toast.error('Failed to load enrichment statistics')
      }
    } catch (error) {
      console.error('[EnrichmentsTab] Failed to load stats:', error)
      toast.error('Failed to load statistics')
    } finally {
      setIsLoadingStats(false)
    }
  }

  const handleEnrichAll = async () => {
    if (!documentId) {
      toast.error('No document selected')
      return
    }

    setIsEnriching(true)
    try {
      const result = await enrichAllUnenrichedChunks(documentId)

      if (result.success) {
        toast.success(`Enriching ${result.chunkCount} chunks`, {
          description: 'Check ProcessingDock for progress'
        })
        // Reload stats after starting enrichment
        setTimeout(() => loadStats(), 1000)
      } else {
        toast.info(result.error || 'All chunks already enriched')
      }
    } catch (error) {
      console.error('[EnrichmentsTab] Failed:', error)
      toast.error('Failed to start enrichment')
    } finally {
      setIsEnriching(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Chunk Enrichment</h3>
        <p className="text-sm text-muted-foreground">
          Enrich chunks with metadata (themes, concepts, emotions) using local Ollama models.
          Zero cost enrichment powered by open-source AI.
        </p>
      </div>

      {/* Statistics */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              <p className="text-xs text-muted-foreground">Enriched</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.enriched}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-orange-600" />
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <p className="text-2xl font-bold text-orange-600">{stats.pending}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Info className="h-3 w-3 text-gray-600" />
              <p className="text-xs text-muted-foreground">Skipped</p>
            </div>
            <p className="text-2xl font-bold text-gray-600">{stats.skipped}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-600" />
              <p className="text-xs text-muted-foreground">Errors</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.error}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          {isLoadingStats ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">Loading statistics...</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">No statistics available</span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {stats && stats.total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Enrichment Progress</span>
            <span>{Math.round((stats.enriched / stats.total) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-green-600 transition-all duration-300"
              style={{ width: `${(stats.enriched / stats.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Info callout */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <div className="flex gap-2">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              Local AI Processing
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              Enrichment uses local Ollama models (32B → 14B → 7B fallback) for zero-cost
              metadata extraction. Processing time varies based on chunk count and model availability.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <Button
          onClick={loadStats}
          variant="outline"
          className="w-full"
          disabled={isLoadingStats || !documentId}
        >
          {isLoadingStats ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            'Refresh Statistics'
          )}
        </Button>

        <Button
          onClick={handleEnrichAll}
          disabled={isEnriching || !documentId || !stats || stats.pending === 0}
          className="w-full"
        >
          {isEnriching ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enriching...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Enrich All Pending ({stats?.pending || 0} chunks)
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
