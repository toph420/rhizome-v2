'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Progress } from '@/components/rhizome/progress'
import { ExternalLink, Check, X, Star, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateConnectionFeedback } from '@/app/actions/connections'
import { toast } from 'sonner'
import type { SynthesisEngine } from '@/types/annotations'

interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  connection_type: SynthesisEngine
  strength: number
  user_validated?: boolean | null
  user_starred?: boolean | null
  metadata: {
    explanation?: string
    target_document_title?: string
    target_snippet?: string
    [key: string]: unknown
  }
  weightedStrength?: number
}

interface ConnectionCardProps {
  connection: Connection
  documentId: string
  isActive: boolean
  onClick: () => void
  onNavigateToChunk?: (chunkId: string) => void
}

/**
 * Feature-rich ConnectionCard with:
 * - Keyboard shortcuts (v/r/s)
 * - Server action integration
 * - Optimistic updates
 * - Dynamic styling based on feedback
 * - Neobrutalist theming
 */
export function ConnectionCard({
  connection,
  documentId,
  isActive,
  onClick,
  onNavigateToChunk
}: ConnectionCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize from database state
  const getFeedbackType = (): 'validate' | 'reject' | 'star' | null => {
    if (connection.user_starred) return 'star'
    if (connection.user_validated === true) return 'validate'
    if (connection.user_validated === false) return 'reject'
    return null
  }

  const [feedbackType, setFeedbackType] = useState(getFeedbackType())

  const strength = connection.weightedStrength || connection.strength

  // Capture feedback with optimistic update
  const captureFeedback = useCallback(async (type: 'validate' | 'reject' | 'star') => {
    setFeedbackType(type)
    setIsSubmitting(true)

    try {
      const result = await updateConnectionFeedback(connection.id, type)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save feedback')
      }
    } catch (error) {
      console.error('[ConnectionCard] Failed to save feedback:', error)
      setFeedbackType(getFeedbackType()) // Revert on error
      toast.error('Failed to save feedback')
    } finally {
      setIsSubmitting(false)
    }
  }, [connection.id])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // Don't trigger in input fields
      }

      switch(e.key.toLowerCase()) {
        case 'v':
          e.preventDefault()
          captureFeedback('validate')
          break
        case 'x':
        case 'r':
          e.preventDefault()
          captureFeedback('reject')
          break
        case 's':
          e.preventDefault()
          captureFeedback('star')
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, captureFeedback])

  // Border color based on feedback
  const borderClass =
    feedbackType === 'validate'
      ? 'border-green-500'
      : feedbackType === 'reject'
      ? 'border-red-500'
      : feedbackType === 'star'
      ? 'border-yellow-500'
      : isActive
      ? 'border-main'
      : 'border-border'

  // Engine colors
  const engineColors: Record<SynthesisEngine, string> = {
    semantic_similarity: 'bg-blue-500',
    thematic_bridge: 'bg-purple-500',
    contradiction_detection: 'bg-red-500',
  }

  return (
    <Card
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-all border-2',
        borderClass,
        isSubmitting && 'opacity-50'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="default" className={engineColors[connection.connection_type]}>
                {connection.connection_type.replace(/_/g, ' ')}
              </Badge>
              <Progress value={strength * 100} className="w-16 h-2" />
              <span className="text-xs text-muted-foreground font-mono">
                {(strength * 100).toFixed(0)}%
              </span>
              {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
              {!isSubmitting && feedbackType === 'validate' && (
                <Check className="w-4 h-4 text-green-500" />
              )}
              {!isSubmitting && feedbackType === 'reject' && (
                <X className="w-4 h-4 text-red-500" />
              )}
              {!isSubmitting && feedbackType === 'star' && (
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              )}
            </div>
          </div>
          <Button
            variant="noShadow"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              onNavigateToChunk?.(connection.metadata.target_chunk_id as string)
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {connection.metadata.target_snippet || 'No preview available'}
        </p>

        {isActive && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            <kbd className="px-1 bg-muted rounded">v</kbd> validate ·{' '}
            <kbd className="px-1 bg-muted rounded">x</kbd> reject ·{' '}
            <kbd className="px-1 bg-muted rounded">s</kbd> star
          </div>
        )}
      </CardContent>
    </Card>
  )
}
