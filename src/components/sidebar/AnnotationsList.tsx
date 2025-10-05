'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getAnnotations } from '@/app/actions/annotations'
import type { StoredAnnotation } from '@/types/annotations'
import { formatDistanceToNow } from 'date-fns'
import { Loader2 } from 'lucide-react'

interface AnnotationsListProps {
  documentId: string
  onAnnotationClick?: (annotationId: string) => void
}

/**
 * Displays all annotations for the current document.
 * Shows annotation text, note, color, and creation timestamp.
 * Fetches data from getAnnotations Server Action.
 *
 * @param props - Component props.
 * @param props.documentId - Document identifier for annotation filtering.
 * @param props.onAnnotationClick - Optional callback when annotation is clicked.
 * @returns React element with annotations list.
 */
export function AnnotationsList({ documentId, onAnnotationClick }: AnnotationsListProps) {
  const [annotations, setAnnotations] = useState<StoredAnnotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAnnotations() {
      try {
        setLoading(true)
        setError(null)

        const result = await getAnnotations(documentId)

        if (!result.success) {
          setError(result.error || 'Failed to load annotations')
          return
        }

        setAnnotations(result.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchAnnotations()
  }, [documentId])

  /**
   * Get color badge styling based on annotation color
   */
  function getColorBadge(color: string) {
    const colorMap: Record<string, { bg: string; text: string; label: string }> = {
      yellow: { bg: 'bg-yellow-200', text: 'text-yellow-900', label: 'Yellow' },
      green: { bg: 'bg-green-200', text: 'text-green-900', label: 'Green' },
      blue: { bg: 'bg-blue-200', text: 'text-blue-900', label: 'Blue' },
      red: { bg: 'bg-red-200', text: 'text-red-900', label: 'Red' },
      purple: { bg: 'bg-purple-200', text: 'text-purple-900', label: 'Purple' },
      orange: { bg: 'bg-orange-200', text: 'text-orange-900', label: 'Orange' },
      pink: { bg: 'bg-pink-200', text: 'text-pink-900', label: 'Pink' }
    }

    const colorData = colorMap[color] || colorMap.yellow
    return (
      <Badge className={`${colorData.bg} ${colorData.text} border-0`}>
        {colorData.label}
      </Badge>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <Card className="p-4 border-destructive">
          <p className="text-sm text-destructive">Error loading annotations</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </Card>
      </div>
    )
  }

  // Empty state
  if (annotations.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-sm text-muted-foreground mb-4">
          Annotations for this document
        </div>

        <Card className="p-4 border-dashed">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No annotations yet
            </p>
            <p className="text-xs text-muted-foreground">
              Select text in the document to create your first annotation
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // Annotations list
  return (
    <div className="p-4 space-y-3">
      <div className="text-sm text-muted-foreground mb-4">
        {annotations.length} {annotations.length === 1 ? 'annotation' : 'annotations'}
      </div>

      {annotations.map((annotation) => {
        const annotationData = annotation.components.annotation
        const positionData = annotation.components.position

        if (!annotationData) return null

        return (
          <Card
            key={annotation.id}
            className="p-3 hover:bg-accent cursor-pointer transition-colors"
            onClick={() => onAnnotationClick?.(annotation.id)}
          >
            <div className="space-y-2">
              {/* Header: Color badge and tags */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {getColorBadge(annotationData.color)}
                  {annotationData.tags?.filter(tag => tag !== 'readwise-import').map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {annotationData.tags?.includes('readwise-import') && (
                    <Badge variant="secondary" className="text-xs">
                      Readwise
                    </Badge>
                  )}
                </div>
              </div>

              {/* Annotation text */}
              <div>
                <p className="text-sm leading-tight line-clamp-3">
                  {annotationData.text}
                </p>
              </div>

              {/* Note (if exists) */}
              {annotationData.note && (
                <div className="bg-muted/50 p-2 rounded-sm">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Note: </span>
                    {annotationData.note}
                  </p>
                </div>
              )}

              {/* Metadata footer */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {formatDistanceToNow(new Date(annotation.created_at), { addSuffix: true })}
                </span>
                {positionData?.method && positionData.method !== 'exact' && (
                  <Badge variant="outline" className="text-xs">
                    {positionData.method} ({(positionData.confidence * 100).toFixed(0)}%)
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
