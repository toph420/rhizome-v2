'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import { X, Loader2 } from 'lucide-react'
import { startStudySession, updateSessionStats, endStudySession } from '@/app/actions/study'
import { reviewCard } from '@/app/actions/flashcards'
import { toast } from 'sonner'

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

/**
 * Fullscreen study interface with FSRS-powered review
 * Keyboard shortcuts: Space (reveal), 1/2/3/4 (ratings), Esc (exit)
 */
export default function StudyPage() {
  const router = useRouter()
  const [session, setSession] = useState<{ id: string; cards: CachedFlashcard[] } | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reviewStartTime, setReviewStartTime] = useState(Date.now())

  useEffect(() => {
    initSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initSession = async () => {
    try {
      const result = await startStudySession({})
      if (result.success && result.sessionId && result.cards && result.cards.length > 0) {
        setSession({ id: result.sessionId, cards: result.cards as CachedFlashcard[] })
        console.log(`[Study] Session started: ${result.cards.length} cards`)
      } else {
        toast.info('No cards due for review')
        router.push('/flashcards')
      }
    } catch (error) {
      toast.error('Failed to start study session')
      console.error('[Study] Init failed:', error)
      router.push('/flashcards')
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

      console.log(`[Study] Reviewed card ${currentIndex + 1}/${session.cards.length}, rating: ${rating}`)

      // 3. Move to next card or finish session
      if (currentIndex < session.cards.length - 1) {
        setCurrentIndex(i => i + 1)
        setRevealed(false)
        setReviewStartTime(Date.now())
      } else {
        // Session complete
        await endStudySession(session.id)
        toast.success(`Study session complete! Reviewed ${session.cards.length} cards`)
        router.push('/flashcards')
      }
    } catch (error) {
      toast.error('Failed to save review')
      console.error('[Study] Review failed:', error)
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
    router.push('/flashcards')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session || session.cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-lg text-muted-foreground">No cards to review</p>
        <Button onClick={() => router.push('/flashcards')}>
          Back to Flashcards
        </Button>
      </div>
    )
  }

  const currentCard = session.cards[currentIndex]
  const remaining = session.cards.length - currentIndex

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
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
            {/* Question */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">Question</p>
              <p className="text-lg font-medium">{currentCard.question}</p>
            </div>

            {/* Answer (revealed) */}
            {revealed ? (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Answer</p>
                  <p className="text-base">{currentCard.answer}</p>
                </div>

                {/* Rating buttons - Using rhizome variants */}
                <div className="grid grid-cols-4 gap-2 pt-4">
                  <Button
                    variant="reverse"
                    onClick={() => handleRate(1)}
                    disabled={submitting}
                    className="flex flex-col h-auto py-3 bg-red-500 hover:bg-red-600 text-white border-red-700"
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
                    onClick={() => handleRate(2)}
                    disabled={submitting}
                    className="flex flex-col h-auto py-3"
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
                    onClick={() => handleRate(3)}
                    disabled={submitting}
                    className="flex flex-col h-auto py-3"
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
                    onClick={() => handleRate(4)}
                    disabled={submitting}
                    className="flex flex-col h-auto py-3 bg-green-500 hover:bg-green-600 text-white border-green-700"
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
                size="lg"
                className="w-full"
                onClick={() => setRevealed(true)}
              >
                Show Answer (Space)
              </Button>
            )}

            {/* Context (if available) */}
            {currentCard.chunk_ids && currentCard.chunk_ids.length > 0 && (
              <div className="pt-4 border-t-2 border-border">
                <p className="text-xs text-muted-foreground mb-2">Source</p>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" className="text-xs">
                    {currentCard.chunk_ids.length} chunk{currentCard.chunk_ids.length > 1 ? 's' : ''}
                  </Badge>
                  {currentCard.tags && currentCard.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {currentCard.tags.map((tag) => (
                        <Badge key={tag} variant="neutral" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
