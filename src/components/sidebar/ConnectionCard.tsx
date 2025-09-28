'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { ExternalLink, Check, X, Star } from 'lucide-react'
import type { MockConnection, ConnectionFeedback } from '@/types/annotations'

interface ConnectionCardProps {
  connection: MockConnection & { weightedStrength?: number }
  documentId: string
  isActive: boolean
  onClick: () => void
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
 * Feedback stored to localStorage for learning system analysis.
 *
 * @param props - Component props.
 * @param props.connection - Mock connection data with optional weighted strength.
 * @param props.documentId - Current document ID for navigation context.
 * @param props.isActive - Whether this card is currently active for keyboard input.
 * @param props.onClick - Handler to make this card active.
 * @returns Connection card component.
 */
export function ConnectionCard({ connection, documentId, isActive, onClick }: ConnectionCardProps) {
  const strength = connection.weightedStrength || connection.strength
  const [feedbackType, setFeedbackType] = useState<'validate' | 'reject' | 'star' | null>(null)
  
  /**
   * Captures feedback to localStorage for learning system.
   * @param type - Type of feedback.
   * @returns Void.
   */
  const captureFeedback = useCallback((type: 'validate' | 'reject' | 'star') => {
    const feedback: ConnectionFeedback = {
      connection_id: connection.id,
      feedback_type: type,
      context: {
        time_of_day: new Date().toISOString(),
        document_id: documentId,
        mode: 'reading' // Could be inferred from user activity in future
      }
    }
    
    // Store to localStorage (MVP approach, migrate to database in Phase 3)
    const existing = localStorage.getItem('connection_feedback')
    const feedbackArray = existing ? JSON.parse(existing) : []
    feedbackArray.push(feedback)
    localStorage.setItem('connection_feedback', JSON.stringify(feedbackArray))
  }, [connection.id, documentId])
  
  /**
   * Handles validation feedback (v key).
   * @returns Void.
   */
  const handleValidate = useCallback(() => {
    captureFeedback('validate')
    setFeedbackType('validate')
    toast.success('Connection validated', {
      description: 'Feedback recorded for learning system',
      duration: 2000
    })
  }, [captureFeedback])
  
  /**
   * Handles rejection feedback (r key).
   * @returns Void.
   */
  const handleReject = useCallback(() => {
    captureFeedback('reject')
    setFeedbackType('reject')
    toast.error('Connection rejected', {
      description: 'Feedback recorded',
      duration: 2000
    })
  }, [captureFeedback])
  
  /**
   * Handles star feedback (s key).
   * @returns Void.
   */
  const handleStar = useCallback(() => {
    captureFeedback('star')
    setFeedbackType('star')
    toast.success('Connection starred', {
      description: 'Saved to favorites',
      duration: 2000
    })
  }, [captureFeedback])
  
  // Keyboard validation handler (only active when card is focused)
  useEffect(() => {
    if (!isActive) return
    
    /**
     * Handles keyboard shortcuts for validation feedback.
     * @param e - Keyboard event.
     * @returns Void.
     */
    function handleKeyPress(e: KeyboardEvent) {
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
   * TODO: Implement actual navigation in Phase 2.
   * @returns Void.
   */
  function handleNavigate() {
    // Navigate to target chunk (implement in Phase 2)
    console.log('Navigate to:', connection.target_chunk_id)
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
              {/* Validation icons */}
              <div className="flex gap-1 ml-auto">
                {feedbackType === 'validate' && <Check className="w-4 h-4 text-green-500" />}
                {feedbackType === 'reject' && <X className="w-4 h-4 text-red-500" />}
                {feedbackType === 'star' && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
              </div>
            </div>
            <h4 className="text-sm font-medium">{connection.target_document_title}</h4>
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
          {connection.target_snippet}
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          {connection.explanation}
        </p>
        
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