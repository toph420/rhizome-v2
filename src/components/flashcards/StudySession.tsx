'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { X, Loader2 } from 'lucide-react'
import { startStudySession, updateSessionStats, endStudySession } from '@/app/actions/study'
import { reviewCard } from '@/app/actions/flashcards'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CachedFlashcard {
  entity_id: string
  card_type: 'basic' | 'cloze'
  question: string
  answer: string
  content?: string
  cloze_index?: number
  cloze_count?: number
  status: 'draft' | 'active' | 'suspended'
  tags: string[]
  chunk_ids: string[]
  document_id: string | null
  next_review: string | null
}

export interface StudySessionProps {
  // Context Filtering
  deckId?: string              // Study specific deck
  documentId?: string          // Study cards from this document
  chunkIds?: string[]          // Study cards linked to these chunks
  tags?: string[]              // Filter by tags

  // Session Control
  limit?: number               // Max cards per session
  dueOnly?: boolean           // Only show due cards (default: true)

  // Display Mode
  mode: 'fullscreen' | 'compact'

  // Callbacks
  onComplete?: (stats: {
    reviewedCount: number
    timeSpentMs: number
  }) => void
  onExit?: () => void
}

/**
 * Reusable study session component with FSRS-powered review
 *
 * **Features**:
 * - Context-aware filtering (deck, document, chunks, tags)
 * - Fullscreen or compact display modes
 * - Keyboard shortcuts (Space, 1/2/3/4, Esc)
 * - FSRS spaced repetition
 * - Session tracking
 *
 * **Usage**:
 * ```tsx
 * // Fullscreen study (global)
 * <StudySession mode="fullscreen" onExit={() => router.push('/flashcards')} />
 *
 * // Compact in sidebar (document-aware)
 * <StudySession
 *   mode="compact"
 *   documentId={documentId}
 *   limit={10}
 *   onComplete={(stats) => console.log(stats)}
 * />
 *
 * // Study visible chunks
 * <StudySession
 *   mode="compact"
 *   chunkIds={visibleChunks.map(c => c.id)}
 *   dueOnly={false}
 * />
 * ```
 */
export function StudySession({
  deckId,
  documentId,
  chunkIds,
  tags,
  limit = 50,
  dueOnly = true,
  mode,
  onComplete,
  onExit,
}: StudySessionProps) {
  const [session, setSession] = useState<{ id: string; cards: CachedFlashcard[] } | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reviewStartTime, setReviewStartTime] = useState(Date.now())
  const [totalTimeSpent, setTotalTimeSpent] = useState(0)

  useEffect(() => {
    initSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initSession = async () => {
    try {
      const result = await startStudySession({
        deckId,
        documentId,
        chunkIds,
        limit,
        dueOnly,
        filters: { tags },
      })

      if (result.success && result.sessionId && result.cards && result.cards.length > 0) {
        setSession({ id: result.sessionId, cards: result.cards as CachedFlashcard[] })
        console.log(`[StudySession] Started: ${result.cards.length} cards`)
      } else {
        toast.info('No cards available for review')
        onExit?.()
      }
    } catch (error) {
      toast.error('Failed to start study session')
      console.error('[StudySession] Init failed:', error)
      onExit?.()
    } finally {
      setLoading(false)
    }
  }

  const handleRate = async (rating: 1 | 2 | 3 | 4) => {
    if (!session || !session.cards[currentIndex] || submitting) return

    setSubmitting(true)
    const card = session.cards[currentIndex]
    const timeSpent = Date.now() - reviewStartTime

    try {
      // 1. Update FSRS schedule via ECS
      const reviewResult = await reviewCard(card.entity_id, {
        rating,
        timeSpentMs: timeSpent,
      })

      if (!reviewResult.success) {
        throw new Error(reviewResult.error || 'Review failed')
      }

      // 2. Update session stats
      await updateSessionStats(session.id, rating, timeSpent)

      console.log(`[StudySession] Reviewed ${currentIndex + 1}/${session.cards.length}, rating: ${rating}`)

      // Track total time
      const newTotalTime = totalTimeSpent + timeSpent
      setTotalTimeSpent(newTotalTime)

      // 3. Move to next card or finish session
      if (currentIndex < session.cards.length - 1) {
        setCurrentIndex(i => i + 1)
        setRevealed(false)
        setReviewStartTime(Date.now())
      } else {
        // Session complete
        await endStudySession(session.id)
        toast.success(`Study session complete! Reviewed ${session.cards.length} cards`)
        onComplete?.({
          reviewedCount: session.cards.length,
          timeSpentMs: newTotalTime,
        })
        onExit?.()
      }
    } catch (error) {
      toast.error('Failed to save review')
      console.error('[StudySession] Review failed:', error)
    } finally {
      setSubmitting(false)
    }
  }

  // Keyboard shortcuts: Space, 1-4 ratings, Escape to exit
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if (submitting) return  // Ignore during submission

      switch(e.key) {
        case ' ':  // Space: reveal answer
          if (!revealed) {
            e.preventDefault()
            setRevealed(true)
          }
          break
        case '1':  // Again
          if (revealed) {
            e.preventDefault()
            handleRate(1)
          }
          break
        case '2':  // Hard
          if (revealed) {
            e.preventDefault()
            handleRate(2)
          }
          break
        case '3':  // Good
          if (revealed) {
            e.preventDefault()
            handleRate(3)
          }
          break
        case '4':  // Easy
          if (revealed) {
            e.preventDefault()
            handleRate(4)
          }
          break
        case 'Escape':
          e.preventDefault()
          handleExit()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, submitting])

  const handleExit = async () => {
    if (session) {
      await endStudySession(session.id)
    }
    onExit?.()
  }

  if (loading) {
    return (
      <div className={cn(
        "flex items-center justify-center",
        mode === 'fullscreen' ? "h-screen" : "h-full min-h-[400px]"
      )}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session || session.cards.length === 0) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center gap-4",
        mode === 'fullscreen' ? "h-screen" : "h-full min-h-[400px]"
      )}>
        <p className="text-lg text-muted-foreground">No cards to review</p>
        {onExit && (
          <Button onClick={onExit}>
            Back
          </Button>
        )}
      </div>
    )
  }

  const currentCard = session.cards[currentIndex]
  const remaining = session.cards.length - currentIndex

  // Fullscreen mode
  if (mode === 'fullscreen') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col z-50">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-border">
          <div className="flex items-center gap-4">
            <Badge>{remaining} remaining</Badge>
            <p className="text-sm text-muted-foreground">
              Card {currentIndex + 1} of {session.cards.length}
            </p>
          </div>
          <Button
            size="sm"
            variant="noShadow"
            onClick={handleExit}
          >
            <X className="h-4 w-4 mr-1" />
            Exit (Esc)
          </Button>
        </div>

        {/* Card display */}
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-2xl">
            <CardContent className="p-8 space-y-6">
              <CardDisplay
                card={currentCard}
                revealed={revealed}
                submitting={submitting}
                onReveal={() => setRevealed(true)}
                onRate={handleRate}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Compact mode
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{remaining} left</Badge>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1}/{session.cards.length}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleExit}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Card display */}
      <div className="flex-1 overflow-y-auto p-4">
        <CardDisplay
          card={currentCard}
          revealed={revealed}
          submitting={submitting}
          onReveal={() => setRevealed(true)}
          onRate={handleRate}
          compact
        />
      </div>
    </div>
  )
}

/**
 * Shared card display component for both modes
 */
function CardDisplay({
  card,
  revealed,
  submitting,
  onReveal,
  onRate,
  compact = false,
}: {
  card: CachedFlashcard
  revealed: boolean
  submitting: boolean
  onReveal: () => void
  onRate: (rating: 1 | 2 | 3 | 4) => void
  compact?: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Question */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Question</p>
        <p className={cn(
          "font-medium",
          compact ? "text-base" : "text-lg"
        )}>
          {card.question}
        </p>
      </div>

      {/* Answer (revealed) */}
      {revealed ? (
        <>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Answer</p>
            <p className={cn(
              compact ? "text-sm" : "text-base"
            )}>
              {card.answer}
            </p>
          </div>

          {/* Rating buttons */}
          <div className={cn(
            "grid gap-2 pt-2",
            compact ? "grid-cols-2" : "grid-cols-4"
          )}>
            <Button
              variant="reverse"
              onClick={() => onRate(1)}
              disabled={submitting}
              className={cn(
                "flex flex-col bg-red-500 hover:bg-red-600 text-white border-red-700",
                compact ? "h-auto py-2" : "h-auto py-3"
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Again</span>
                  <span className="text-xs mt-1">1</span>
                </>
              )}
            </Button>
            <Button
              variant="neutral"
              onClick={() => onRate(2)}
              disabled={submitting}
              className={cn(
                "flex flex-col",
                compact ? "h-auto py-2" : "h-auto py-3"
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Hard</span>
                  <span className="text-xs mt-1">2</span>
                </>
              )}
            </Button>
            <Button
              variant="default"
              onClick={() => onRate(3)}
              disabled={submitting}
              className={cn(
                "flex flex-col",
                compact ? "h-auto py-2" : "h-auto py-3"
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Good</span>
                  <span className="text-xs mt-1">3</span>
                </>
              )}
            </Button>
            <Button
              variant="noShadow"
              onClick={() => onRate(4)}
              disabled={submitting}
              className={cn(
                "flex flex-col bg-green-500 hover:bg-green-600 text-white border-green-700",
                compact ? "h-auto py-2" : "h-auto py-3"
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Easy</span>
                  <span className="text-xs mt-1">4</span>
                </>
              )}
            </Button>
          </div>

          {/* Keyboard hints */}
          <div className="pt-2 text-xs text-muted-foreground text-center">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded">1</kbd> Again ·{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded">2</kbd> Hard ·{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded">3</kbd> Good ·{' '}
            <kbd className="px-1.5 py-0.5 bg-muted rounded">4</kbd> Easy
          </div>
        </>
      ) : (
        <Button
          size={compact ? "default" : "lg"}
          className="w-full"
          onClick={onReveal}
        >
          Show Answer (Space)
        </Button>
      )}

      {/* Context (if available) */}
      {card.chunk_ids && card.chunk_ids.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">Source</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="neutral" className="text-xs">
              {card.chunk_ids.length} chunk{card.chunk_ids.length > 1 ? 's' : ''}
            </Badge>
            {card.tags && card.tags.length > 0 && (
              <>
                {card.tags.map((tag) => (
                  <Badge key={tag} variant="neutral" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
