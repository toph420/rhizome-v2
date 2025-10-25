'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Badge } from '@/components/rhizome/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/rhizome/dropdown-menu'
import { MoreVertical, Play, Edit, Trash, Archive } from 'lucide-react'
import { deleteDeck } from '@/app/actions/decks'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DeckCardProps {
  deck: {
    id: string
    name: string
    description: string | null
    is_system: boolean
    parent_id: string | null
    parent_name: string | null
    total_cards: number
    draft_cards: number
    active_cards: number
    due_cards: number
  }
  isActive: boolean
  onClick: () => void
  onStudy: (dueOnly: boolean) => void
  onRefresh: () => void
  onEdit?: () => void
}

/**
 * Feature-rich deck card component
 *
 * **Features**:
 * - Stats display (total, active, draft cards)
 * - Study action button
 * - Dropdown menu (edit, delete, move cards)
 * - System deck protection
 * - Keyboard shortcuts when active
 *
 * **Pattern**: Self-contained like FlashcardCard (no prop drilling)
 */
export function DeckCard({
  deck,
  isActive,
  onClick,
  onStudy,
  onRefresh,
  onEdit,
}: DeckCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 's':
          e.preventDefault()
          // Smart study: use dueOnly if due cards exist
          onStudy(deck.due_cards > 0)
          break
        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            handleDelete()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, deck.id])

  const handleDelete = async () => {
    if (deck.is_system) {
      toast.error('Cannot delete system deck')
      return
    }

    if (!confirm(`Delete deck "${deck.name}"? ${deck.total_cards} cards will be moved to Inbox.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const result = await deleteDeck(deck.id)
      if (result.success) {
        toast.success('Deck deleted')
        onRefresh()
      } else {
        toast.error(result.error || 'Failed to delete deck')
      }
    } catch (error) {
      toast.error('Failed to delete deck')
    } finally {
      setIsDeleting(false)
    }
  }

  const hasDueCards = deck.due_cards > 0
  const hasActiveCards = deck.active_cards > 0

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all',
        isActive && 'ring-2 ring-primary'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold">{deck.name}</h3>
            {deck.parent_name && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Parent: {deck.parent_name}
              </p>
            )}
            {deck.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {deck.description}
              </p>
            )}
          </div>
          {deck.is_system && (
            <Badge variant="neutral" className="ml-2 text-xs">
              System
            </Badge>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="border rounded p-2">
            <div className="text-lg font-bold">{deck.total_cards}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-lg font-bold text-green-600">{deck.active_cards}</div>
            <div className="text-xs text-muted-foreground">Active</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-lg font-bold text-orange-600">{deck.draft_cards}</div>
            <div className="text-xs text-muted-foreground">Draft</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation()
              onStudy(hasDueCards)
            }}
            disabled={!hasActiveCards}
          >
            <Play className="h-3 w-3 mr-1" />
            {hasDueCards
              ? `Study (${deck.due_cards})${isActive ? ' S' : ''}`
              : hasActiveCards
                ? `Study All (${deck.active_cards})${isActive ? ' S' : ''}`
                : 'Study'
            }
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="neutral">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation()
                onEdit?.()
              }}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Deck
              </DropdownMenuItem>
              {!deck.is_system && (
                <DropdownMenuItem
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-red-600"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete Deck
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => {/* TODO: Move cards */}}>
                <Archive className="h-4 w-4 mr-2" />
                Move Cards
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}
