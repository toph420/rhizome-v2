'use client'

import { useEffect, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/rhizome/button'
import { Card, CardContent } from '@/components/rhizome/card'
import { DeckCard } from '@/components/rhizome/deck-card'
import { getDecksWithStats } from '@/app/actions/decks'
import { useStudyStore } from '@/stores/study-store'
import { BottomPanel } from '@/components/layout/BottomPanel'
import { CreateDeckForm } from './CreateDeckForm'
import { EditDeckForm } from './EditDeckForm'
import { toast } from 'sonner'

interface DeckGridProps {
  onStudyDeck: (deckId: string, deckName: string, dueOnly: boolean) => void
}

/**
 * Deck Grid Component
 *
 * Displays responsive grid of DeckCard components with stats.
 * Integrates with study store for active deck selection.
 */
export function DeckGrid({ onStudyDeck }: DeckGridProps) {
  const [decks, setDecks] = useState<Array<{
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
  }>>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDeck, setShowCreateDeck] = useState(false)
  const [editingDeck, setEditingDeck] = useState<{
    id: string
    name: string
    description: string | null
    parent_id: string | null
  } | null>(null)
  const { activeDeckId, setActiveDeckId } = useStudyStore()

  useEffect(() => {
    loadDecks()
  }, [])

  const loadDecks = async () => {
    setLoading(true)
    const result = await getDecksWithStats()
    setDecks(result || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (decks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
              <Plus className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-1">No Decks Yet</h3>
            <p className="text-sm text-muted-foreground">
              Create your first deck to organize flashcards
            </p>
          </div>
          <Button onClick={() => setShowCreateDeck(true)}>
            Create Deck
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Create New Deck Button */}
      <div className="flex justify-end">
        <Button
          variant="neutral"
          onClick={() => setShowCreateDeck(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Deck
        </Button>
      </div>

      {/* Deck Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => (
          <DeckCard
            key={deck.id}
            deck={deck}
            isActive={activeDeckId === deck.id}
            onClick={() => setActiveDeckId(deck.id)}
            onStudy={(dueOnly) => onStudyDeck(deck.id, deck.name, dueOnly)}
            onRefresh={loadDecks}
            onEdit={() => setEditingDeck({
              id: deck.id,
              name: deck.name,
              description: deck.description,
              parent_id: deck.parent_id,
            })}
          />
        ))}
      </div>

      {/* Create Deck Panel */}
      <BottomPanel
        open={showCreateDeck}
        onOpenChange={setShowCreateDeck}
        title="Create New Deck"
        description="Organize your flashcards with a new deck"
        size="md"
      >
        <CreateDeckForm
          onSuccess={(_deckId, deckName) => {
            setShowCreateDeck(false)
            loadDecks() // Refresh deck grid
            toast.success('Deck created', {
              description: `"${deckName}" is ready to use`,
            })
          }}
          onCancel={() => setShowCreateDeck(false)}
        />
      </BottomPanel>

      {/* Edit Deck Panel */}
      {editingDeck && (
        <BottomPanel
          open={!!editingDeck}
          onOpenChange={(open) => !open && setEditingDeck(null)}
          title="Edit Deck"
          description="Update deck details"
          size="md"
        >
          <EditDeckForm
            deck={editingDeck}
            onSuccess={(_deckId, deckName) => {
              setEditingDeck(null)
              loadDecks() // Refresh deck grid
              toast.success('Deck updated', {
                description: `"${deckName}" has been updated`,
              })
            }}
            onCancel={() => setEditingDeck(null)}
          />
        </BottomPanel>
      )}
    </div>
  )
}
