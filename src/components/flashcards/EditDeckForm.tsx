'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/rhizome/button'
import { Input } from '@/components/rhizome/input'
import { Label } from '@/components/rhizome/label'
import { Textarea } from '@/components/rhizome/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { updateDeck, getDecksWithStats } from '@/app/actions/decks'
import { Loader2 } from 'lucide-react'

interface EditDeckFormProps {
  deck: {
    id: string
    name: string
    description: string | null
    parent_id: string | null
  }
  onSuccess: (deckId: string, deckName: string) => void
  onCancel: () => void
}

interface Deck {
  id: string
  name: string
  is_system: boolean
}

/**
 * EditDeckForm - Edit existing deck
 *
 * Pre-populated form for editing deck details.
 * Self-contained component with no layout wrapper (use with BottomPanel).
 *
 * **Pattern:**
 * - Pre-populates with existing deck data
 * - Calls updateDeck server action
 * - Similar to CreateDeckForm but for updates
 */
export function EditDeckForm({ deck, onSuccess, onCancel }: EditDeckFormProps) {
  const [name, setName] = useState(deck.name)
  const [description, setDescription] = useState(deck.description || '')
  const [parentId, setParentId] = useState<string | undefined>(deck.parent_id || undefined)
  const [availableDecks, setAvailableDecks] = useState<Deck[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load decks for parent dropdown (exclude self and children)
  useEffect(() => {
    async function loadDecks() {
      try {
        const decks = await getDecksWithStats()
        // Filter out system decks and the deck being edited
        setAvailableDecks(
          decks.filter((d) => !d.is_system && d.id !== deck.id)
        )
      } catch (err) {
        console.error('Failed to load decks:', err)
      }
    }
    loadDecks()
  }, [deck.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate
    if (!name.trim()) {
      setError('Deck name is required')
      return
    }

    if (name.length > 100) {
      setError('Deck name must be 100 characters or less')
      return
    }

    if (description.length > 500) {
      setError('Description must be 500 characters or less')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await updateDeck(deck.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        parentId,
      })

      if (result.success && result.deck) {
        onSuccess(result.deck.id, result.deck.name)
      } else {
        setError(result.error || 'Failed to update deck')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Deck Name */}
      <div>
        <Label htmlFor="edit-deck-name" className="text-sm font-medium mb-2">
          Deck Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="edit-deck-name"
          type="text"
          placeholder="e.g., Biology, History, Coding Interview"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
          required
        />
        <p className="text-xs text-muted-foreground mt-1">
          {name.length}/100 characters
        </p>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="edit-deck-description" className="text-sm font-medium mb-2">
          Description (optional)
        </Label>
        <Textarea
          id="edit-deck-description"
          placeholder="What topics does this deck cover?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {description.length}/500 characters
        </p>
      </div>

      {/* Parent Deck */}
      <div>
        <Label htmlFor="edit-parent-deck" className="text-sm font-medium mb-2">
          Parent Deck (optional)
        </Label>
        <Select value={parentId || 'none'} onValueChange={(value) => setParentId(value === 'none' ? undefined : value)}>
          <SelectTrigger>
            <SelectValue placeholder="None (top-level deck)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None (top-level deck)</SelectItem>
            {availableDecks.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Change deck hierarchy
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded">
          {error}
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="neutral"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  )
}
