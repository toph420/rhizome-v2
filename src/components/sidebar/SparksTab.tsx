'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, Tag, Link, Loader2 } from 'lucide-react'
import { getRecentSparks } from '@/app/actions/sparks'
import { formatDistanceToNow } from 'date-fns'

interface SparksTabProps {
  documentId: string
}

interface Spark {
  entity_id: string
  content: string
  created_at: string
  tags: string[]
  origin_chunk_id: string
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

  useEffect(() => {
    loadSparks() // Initial load with loading state

    // Refresh sparks every 5 seconds to catch new ones (no loading state)
    const interval = setInterval(() => {
      loadSparks(false)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

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
      {sparks.map(spark => (
        <div
          key={spark.entity_id}
          className="p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer transition-colors"
        >
          <p className="text-sm mb-2">{spark.content}</p>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

            {spark.origin_chunk_id && (
              <div className="flex items-center gap-1">
                <Link className="w-3 h-3" />
                <span>Connected</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
