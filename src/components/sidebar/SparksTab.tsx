'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { SparkCard } from '@/components/rhizome/spark-card'
import { Zap, Tag, Link, Loader2, GitBranch, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { getRecentSparks } from '@/app/actions/sparks'
import { formatDistanceToNow } from 'date-fns'
import { useUIStore } from '@/stores/ui-store'
import type { SparkConnection, SparkContext } from '@/lib/sparks/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface SparksTabProps {
  documentId: string
}

interface Spark {
  entity_id: string
  content: string
  created_at: string
  tags: string[]
  origin_chunk_id: string
  connections: SparkConnection[] // Added in migration 056
  selections?: any[] // Added in migration 057
  annotation_refs?: string[] // Linked annotations
  storage_path: string
}

// We'll fetch full context from Storage when needed
interface SparkWithContext extends Spark {
  context?: SparkContext
}

/**
 * Sparks tab showing captured thoughts timeline.
 *
 * Displays recent sparks with tags, timestamp, and connection info.
 * Auto-refreshes when new sparks are created.
 */
export function SparksTab({ documentId }: SparksTabProps) {
  const [sparks, setSparks] = useState<Spark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSpark, setExpandedSpark] = useState<string | null>(null)

  const openSparkCapture = useUIStore(state => state.openSparkCapture)
  const setEditingSpark = useUIStore(state => state.setEditingSpark)
  const sparkCaptureOpen = useUIStore(state => state.sparkCaptureOpen)

  useEffect(() => {
    loadSparks() // Initial load with loading state
  }, [documentId])

  // Refetch when spark panel closes (after create/update)
  useEffect(() => {
    if (!sparkCaptureOpen) {
      loadSparks(false) // Refetch without loading state
    }
  }, [sparkCaptureOpen])

  const loadSparks = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }
    setError(null)
    try {
      const data = await getRecentSparks(50, 0, documentId)
      setSparks(data)
    } catch (error) {
      console.error('[Sparks] Failed to load:', error)
      setError('Failed to load sparks. Try refreshing.')
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  const handleSparkClick = (spark: Spark) => {
    setEditingSpark(
      spark.entity_id,
      spark.content,
      spark.selections || [],
      spark.annotation_refs || []
    )
    openSparkCapture()
  }

  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading sparks...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-destructive mb-2">{error}</div>
        <Button size="sm" variant="neutral" onClick={() => loadSparks()}>
          Retry
        </Button>
      </div>
    )
  }

  if (sparks.length === 0) {
    return (
      <div className="p-4 text-center">
        <Zap className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No sparks yet</p>
        <p className="text-xs text-muted-foreground mt-1">Press ⌘K to capture your first thought</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {sparks.map(spark => {
        // Map connections to array of chunk IDs for SparkCard
        const connectionChunkIds = spark.connections?.map(conn => conn.chunkId) || []

        return (
          <SparkCard
            key={spark.entity_id}
            spark={{
              entity_id: spark.entity_id,
              content: spark.content,
              tags: spark.tags,
              created_at: spark.created_at,
              selections: spark.selections,
              connections: connectionChunkIds
            }}
            onJump={() => handleSparkClick(spark)}
          />
        )
      })}
    </div>
  )
}
