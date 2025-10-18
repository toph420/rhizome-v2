'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ExternalLink, Check, X, Star, Loader2 } from 'lucide-react'
import type { SynthesisEngine } from '@/types/annotations'
import { updateConnectionFeedback } from '@/app/actions/connections'

/**
 * Real connection interface from database (connections table).
 */
interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  connection_type: SynthesisEngine
  strength: number
  auto_detected: boolean
  discovered_at: string
  user_validated?: boolean | null
  user_starred?: boolean | null
  metadata: {
    explanation?: string
    target_document_title?: string
    target_snippet?: string
    [key: string]: unknown
  }
}

interface ConnectionCardProps {
  connection: Connection & { weightedStrength?: number }
  documentId: string
  isActive: boolean
  onClick: () => void
  onNavigateToChunk?: (chunkId: string) => void
}

/**
 * Individual connection card with strength visualization and validation capture.
 * Displays target document, snippet, explanation, and connection metadata.
 * Provides keyboard shortcuts for validation feedback (v/r/s).
 *
 * **Validation Capture**:
 * - Press 'v': Validate connection (green border, checkmark)
 * - Press 'r': Reject connection (red border, X icon)
 * - Press 's': Star connection (yellow border, filled star)
 *
 * Feedback persisted to database via server action with optimistic updates.
 *
 * @param props - Component props.
 * @param props.connection - Connection data with optional weighted strength.
 * @param props.documentId - Current document ID for navigation context.
 * @param props.isActive - Whether this card is currently active for keyboard input.
 * @param props.onClick - Handler to make this card active.
 * @returns Connection card component.
 */
export function ConnectionCard({ connection, documentId, isActive, onClick, onNavigateToChunk }: ConnectionCardProps) {
  const strength = connection.weightedStrength || connection.strength

  // Initialize feedback type from database state
  const getInitialFeedbackType = (): 'validate' | 'reject' | 'star' | null => {
    if (connection.user_starred) return 'star'
    if (connection.user_validated === true) return 'validate'
    if (connection.user_validated === false) return 'reject'
    return null
  }

  const [feedbackType, setFeedbackType] = useState<'validate' | 'reject' | 'star' | null>(getInitialFeedbackType())
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  /**
   * Captures feedback to database via server action with optimistic updates.
   * @param type - Type of feedback.
   * @returns Void.
   */
  const captureFeedback = useCallback(async (type: 'validate' | 'reject' | 'star') => {
    // Optimistic update - immediate UI feedback
    setFeedbackType(type)
    setIsSubmitting(true)

    try {
      const result = await updateConnectionFeedback(connection.id, type)

      if (!result.success) {
        throw new Error(result.error || 'Failed to save feedback')
      }
    } catch (error) {
      console.error('[ConnectionCard] Failed to save feedback:', error)
      // Revert optimistic update on error
      setFeedbackType(getInitialFeedbackType())
      toast.error('Failed to save feedback', {
        description: error instanceof Error ? error.message : 'Please try again',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [connection.id])
  
  /**
   * Handles validation feedback (v key).
   * @returns Void.
   */
  const handleValidate = useCallback(async () => {
    await captureFeedback('validate')
    toast.success('Connection validated', {
      description: 'Will be preserved during document reprocessing',
      duration: 2000
    })
  }, [captureFeedback])

  /**
   * Handles rejection feedback (r key).
   * @returns Void.
   */
  const handleReject = useCallback(async () => {
    await captureFeedback('reject')
    toast.error('Connection rejected', {
      description: 'Marked as invalid',
      duration: 2000
    })
  }, [captureFeedback])

  /**
   * Handles star feedback (s key).
   * @returns Void.
   */
  const handleStar = useCallback(async () => {
    await captureFeedback('star')
    toast.success('Connection starred', {
      description: 'Validated and marked as important',
      duration: 2000
    })
  }, [captureFeedback])
  
  // Keyboard validation handler (only active when card is focused)
  useEffect(() => {
    if (!isActive) return

    /**
     * Handles keyboard shortcuts for validation feedback.
     * Only triggers when user is NOT typing in input fields.
     * @param e - Keyboard event.
     * @returns Void.
     */
    function handleKeyPress(e: KeyboardEvent) {
      // Don't capture shortcuts if user is typing in input/textarea
      const activeElement = document.activeElement
      const isTyping =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement

      if (isTyping) return

      if (e.key === 'v') {
        e.preventDefault()
        handleValidate()
      } else if (e.key === 'r') {
        e.preventDefault()
        handleReject()
      } else if (e.key === 's') {
        e.preventDefault()
        handleStar()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, handleValidate, handleReject, handleStar])
  
  /**
   * Handles navigation to target chunk.
   * Delegates to parent handler which will scroll to chunk if in current document,
   * or show message if cross-document connection.
   * @returns Void.
   */
  function handleNavigate() {
    if (onNavigateToChunk) {
      onNavigateToChunk(connection.target_chunk_id)
    } else {
      console.warn('No navigation handler provided')
    }
  }
  
  // Determine border color based on feedback and active state
  const borderClass = feedbackType === 'validate' 
    ? 'border-green-500' 
    : feedbackType === 'reject'
    ? 'border-red-500'
    : feedbackType === 'star'
    ? 'border-yellow-500'
    : isActive 
    ? 'border-primary'
    : 'border-border'
  
  return (
    <Card 
      className={`cursor-pointer hover:bg-muted/50 transition-all ${borderClass} border-2`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {connection.connection_type}
              </Badge>
              <Progress value={strength * 100} className="w-16 h-2" />
              <span className="text-xs text-muted-foreground">
                {(strength * 100).toFixed(0)}%
              </span>
              {/* Validation icons with loading state */}
              <div className="flex gap-1 ml-auto">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                {!isSubmitting && feedbackType === 'validate' && <Check className="w-4 h-4 text-green-500" />}
                {!isSubmitting && feedbackType === 'reject' && <X className="w-4 h-4 text-red-500" />}
                {!isSubmitting && feedbackType === 'star' && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
              </div>
            </div>
            <h4 className="text-sm font-medium">{connection.metadata.target_document_title || 'Unknown Document'}</h4>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation()
              handleNavigate()
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {connection.metadata.target_snippet || 'No snippet available'}
        </p>
        {connection.metadata.explanation && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            {connection.metadata.explanation}
          </p>
        )}
        
        {/* Hotkey hints (only visible when active) */}
        {isActive && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            Press: <kbd className="px-1 bg-muted rounded">v</kbd> validate • 
            <kbd className="px-1 bg-muted rounded ml-1">r</kbd> reject • 
            <kbd className="px-1 bg-muted rounded ml-1">s</kbd> star
          </div>
        )}
      </CardContent>
    </Card>
  )
}