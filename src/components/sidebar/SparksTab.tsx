'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  }, [])

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
      const data = await getRecentSparks(50, 0)
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
        <Button size="sm" variant="outline" onClick={() => loadSparks()}>
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
        // Count connections by type
        const connectionsByType = spark.connections?.reduce((acc, conn) => {
          acc[conn.type] = (acc[conn.type] || 0) + 1
          return acc
        }, {} as Record<string, number>) || {}

        const totalConnections = spark.connections?.length || 0
        const isExpanded = expandedSpark === spark.entity_id

        return (
          <div
            key={spark.entity_id}
            className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
          >
            {/* Main Content - Clickable to edit */}
            <div
              onClick={() => handleSparkClick(spark)}
              className="cursor-pointer"
            >
              <p className="text-sm mb-2">{spark.content}</p>

              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                <span>{formatDistanceToNow(new Date(spark.created_at), { addSuffix: true })}</span>

                {spark.tags.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    {spark.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="h-4 text-xs px-1.5">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {totalConnections > 0 && (
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    <span>{totalConnections} connection{totalConnections !== 1 ? 's' : ''}</span>
                    {/* Show breakdown if multiple types */}
                    {Object.keys(connectionsByType).length > 1 && (
                      <span className="text-muted-foreground/70">
                        ({Object.entries(connectionsByType).map(([type, count]) => `${count} ${type}`).join(', ')})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Expandable Context Info */}
            <Collapsible
              open={isExpanded}
              onOpenChange={() => setExpandedSpark(isExpanded ? null : spark.entity_id)}
            >
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 h-6 text-xs justify-start"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 mr-1" />
                  ) : (
                    <ChevronRight className="w-3 h-3 mr-1" />
                  )}
                  <Info className="w-3 h-3 mr-1" />
                  {isExpanded ? 'Hide' : 'Show'} capture context
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="space-y-2 text-xs bg-muted/30 rounded p-2 border">
                  {/* Origin Chunk */}
                  {spark.origin_chunk_id && (
                    <div>
                      <span className="font-medium text-muted-foreground">Origin Chunk:</span>
                      <code className="ml-2 text-xs bg-muted px-1 rounded">
                        {spark.origin_chunk_id.substring(0, 8)}...
                      </code>
                    </div>
                  )}

                  {/* Connections Detail */}
                  {spark.connections && spark.connections.length > 0 && (
                    <div>
                      <span className="font-medium text-muted-foreground">Connections:</span>
                      <div className="mt-1 space-y-1 pl-2">
                        {spark.connections.map((conn, idx) => (
                          <div key={idx} className="text-xs">
                            <Badge variant="outline" className="h-4 text-xs mr-2">
                              {conn.type}
                            </Badge>
                            <code className="text-xs bg-muted px-1 rounded">
                              {conn.chunkId.substring(0, 8)}...
                            </code>
                            <span className="ml-2 text-muted-foreground">
                              ({(conn.strength * 100).toFixed(0)}% strength)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Storage Path */}
                  <div>
                    <span className="font-medium text-muted-foreground">Storage:</span>
                    <code className="ml-2 text-xs bg-muted px-1 rounded break-all">
                      {spark.storage_path}
                    </code>
                  </div>

                  {/* Created/Cached Timestamps */}
                  <div className="pt-1 border-t text-muted-foreground/70">
                    <div>Created: {new Date(spark.created_at).toLocaleString()}</div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )
      })}
    </div>
  )
}
