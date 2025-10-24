'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Textarea } from '@/components/rhizome/textarea'
import { Input } from '@/components/rhizome/input'
import { Check, X, Edit, Trash, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateFlashcard, approveFlashcard, deleteFlashcard } from '@/app/actions/flashcards'
import { toast } from 'sonner'

interface FlashcardCardProps {
  flashcard: {
    entity_id: string
    card_type: 'basic' | 'cloze'
    question: string
    answer: string
    status: 'draft' | 'active' | 'suspended'
    tags: string[]
    deck_id: string
    chunk_ids: string[]
    document_id: string | null
  }
  isActive: boolean
  onClick: () => void
  onApproved?: () => void
  onDeleted?: () => void
  onNavigateToChunk?: (chunkId: string) => void
}

/**
 * Feature-rich FlashcardCard with:
 * - Keyboard shortcuts (e/a/d for edit/approve/delete)
 * - Inline editing
 * - Server action integration
 * - Optimistic updates
 * - Neobrutalist theming
 *
 * Pattern: Exactly like ConnectionCard at src/components/rhizome/connection-card.tsx:47-180
 */
export function FlashcardCard({
  flashcard,
  isActive,
  onClick,
  onApproved,
  onDeleted,
  onNavigateToChunk
}: FlashcardCardProps) {
  // Internal state (no prop drilling)
  const [isEditing, setIsEditing] = useState(false)
  const [editQuestion, setEditQuestion] = useState(flashcard.question)
  const [editAnswer, setEditAnswer] = useState(flashcard.answer)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isDraft = flashcard.status === 'draft'

  // Save edits with optimistic update
  const handleSave = useCallback(async () => {
    setIsSubmitting(true)
    const originalQuestion = flashcard.question
    const originalAnswer = flashcard.answer

    // Optimistic update (would update Zustand store here)
    // flashcard.question = editQuestion
    // flashcard.answer = editAnswer

    try {
      const result = await updateFlashcard(flashcard.entity_id, {
        question: editQuestion.trim(),
        answer: editAnswer.trim(),
      })

      if (!result.success) throw new Error(result.error || 'Failed to save')

      setIsEditing(false)
      toast.success('Flashcard updated')
    } catch (error) {
      // Revert on error
      setEditQuestion(originalQuestion)
      setEditAnswer(originalAnswer)
      toast.error('Failed to save flashcard')
      console.error('[FlashcardCard] Save failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [editQuestion, editAnswer, flashcard])

  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditQuestion(flashcard.question)
    setEditAnswer(flashcard.answer)
    setIsEditing(false)
  }, [flashcard])

  // Approve flashcard (draft → active)
  const handleApprove = useCallback(async () => {
    setIsSubmitting(true)

    try {
      const result = await approveFlashcard(flashcard.entity_id)

      if (!result.success) throw new Error(result.error || 'Failed to approve')

      toast.success('Flashcard approved')
      onApproved?.()
    } catch (error) {
      toast.error('Failed to approve flashcard')
      console.error('[FlashcardCard] Approve failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [flashcard, onApproved])

  // Delete flashcard
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this flashcard?')) return

    setIsSubmitting(true)

    try {
      const result = await deleteFlashcard(flashcard.entity_id)

      if (!result.success) throw new Error(result.error || 'Failed to delete')

      toast.success('Flashcard deleted')
      onDeleted?.()
    } catch (error) {
      toast.error('Failed to delete flashcard')
      console.error('[FlashcardCard] Delete failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }, [flashcard, onDeleted])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return // Don't trigger in input fields
      }

      switch(e.key.toLowerCase()) {
        case 'e':  // Edit mode
          if (!isEditing) {
            e.preventDefault()
            setIsEditing(true)
          }
          break
        case 'enter':  // Save with ⌘Enter
          if (isEditing && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSave()
          }
          break
        case 'escape':  // Cancel editing
          if (isEditing) {
            e.preventDefault()
            handleCancel()
          }
          break
        case 'a':  // Approve (drafts only)
          if (!isEditing && isDraft) {
            e.preventDefault()
            handleApprove()
          }
          break
        case 'd':  // Delete with ⌘D
          if (!isEditing && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleDelete()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, isEditing, isDraft, handleSave, handleCancel, handleApprove, handleDelete])

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isActive && "ring-2 ring-primary",
        isDraft && "border-dashed",
        isSubmitting && "opacity-50"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant={isDraft ? "neutral" : "default"}>
            {flashcard.card_type}
          </Badge>
          <div className="flex gap-1">
            {isDraft && (
              <Button
                size="sm"
                variant="noShadow"
                onClick={(e) => {
                  e.stopPropagation()
                  handleApprove()
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="noShadow"
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(!isEditing)
              }}
              disabled={isSubmitting}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="noShadow"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              disabled={isSubmitting}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isEditing ? (
          // Edit mode
          <>
            <div>
              <label className="text-xs text-muted-foreground">Question</label>
              <Input
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                placeholder="Question"
                disabled={isSubmitting}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Answer</label>
              <Textarea
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                placeholder="Answer"
                disabled={isSubmitting}
                onClick={(e) => e.stopPropagation()}
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSave()
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Save
              </Button>
              <Button
                size="sm"
                variant="noShadow"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCancel()
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          // View mode
          <>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Question</div>
              <div className="text-sm font-medium">{flashcard.question}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Answer</div>
              <div className="text-sm">{flashcard.answer}</div>
            </div>
            {flashcard.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {flashcard.tags.map((tag) => (
                  <Badge key={tag} variant="neutral" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}

        {isActive && !isEditing && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            <kbd className="px-1 bg-muted rounded">e</kbd> edit
            {isDraft && (
              <>
                {' · '}
                <kbd className="px-1 bg-muted rounded">a</kbd> approve
              </>
            )}
            {' · '}
            <kbd className="px-1 bg-muted rounded">⌘D</kbd> delete
          </div>
        )}

        {isActive && isEditing && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            <kbd className="px-1 bg-muted rounded">⌘Enter</kbd> save ·{' '}
            <kbd className="px-1 bg-muted rounded">Esc</kbd> cancel
          </div>
        )}
      </CardContent>
    </Card>
  )
}
