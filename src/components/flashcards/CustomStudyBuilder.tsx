'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import { Label } from '@/components/rhizome/label'
import { Input } from '@/components/rhizome/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { Badge } from '@/components/rhizome/badge'
import { Filter } from 'lucide-react'
import { useStudyStore } from '@/stores/study-store'
import { startStudySession } from '@/app/actions/study'
import { getDecksWithStats } from '@/app/actions/decks'
import type { CustomStudyFilters } from '@/stores/study-store'

interface Deck {
  id: string
  name: string
  total_cards: number
}

interface CustomStudyBuilderProps {
  onStartSession: (filters: CustomStudyFilters) => void
}

/**
 * Custom Study Builder Component
 *
 * Advanced filter UI with live preview count.
 * Supports 10+ filter types for flexible study sessions.
 */
export function CustomStudyBuilder({ onStartSession }: CustomStudyBuilderProps) {
  const { customFilters, setCustomFilters, resetCustomFilters, previewCount, setPreviewCount } = useStudyStore()
  const [decks, setDecks] = useState<Deck[]>([])
  const [newTag, setNewTag] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)

  // Load decks on mount
  useEffect(() => {
    async function loadDecks() {
      try {
        const deckData = await getDecksWithStats()
        setDecks(deckData)
      } catch (error) {
        console.error('Failed to load decks:', error)
      }
    }
    loadDecks()
  }, [])

  // Debounced preview update
  useEffect(() => {
    const timer = setTimeout(async () => {
      await updatePreview()
    }, 300)
    return () => clearTimeout(timer)
  }, [customFilters])

  const updatePreview = async () => {
    try {
      // Get count without creating session
      // Need to nest filters properly for server action
      const result = await startStudySession({
        deckId: customFilters.deckId,
        limit: 100,
        dueOnly: false,
        filters: {
          tags: customFilters.tags,
          difficulty: customFilters.difficulty,
          notStudiedYet: customFilters.notStudiedYet,
          failedCards: customFilters.failedCards,
        },
      })

      if (result.success && result.cards) {
        setPreviewCount(result.cards.length)
      }
    } catch (error) {
      console.error('Preview update failed:', error)
    }
  }

  const handleStartSession = () => {
    if (previewCount === 0) {
      return
    }
    onStartSession(customFilters)
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4" />
          <h3 className="font-semibold">Advanced Filters</h3>
        </div>

        {/* Deck Filter */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">Deck</Label>
          <Select
            value={customFilters.deckId || 'all'}
            onValueChange={(value) => setCustomFilters({
              ...customFilters,
              deckId: value === 'all' ? undefined : value
            })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Decks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Decks</SelectItem>
              {decks.map((deck) => (
                <SelectItem key={deck.id} value={deck.id}>
                  {deck.name} ({deck.total_cards} cards)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tags Filter */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">Tags</Label>
          <div className="flex flex-wrap gap-2">
            {customFilters.tags?.map((tag) => (
              <Badge
                key={tag}
                variant="neutral"
                className="cursor-pointer"
                onClick={() =>
                  setCustomFilters({
                    ...customFilters,
                    tags: customFilters.tags?.filter((t) => t !== tag),
                  })
                }
              >
                {tag} ×
              </Badge>
            ))}
            {showTagInput ? (
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Enter tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      setCustomFilters({
                        ...customFilters,
                        tags: [...(customFilters.tags || []), newTag.trim()],
                      })
                      setNewTag('')
                      setShowTagInput(false)
                    } else if (e.key === 'Escape') {
                      setNewTag('')
                      setShowTagInput(false)
                    }
                  }}
                  autoFocus
                  className="w-32"
                />
                <Button
                  size="sm"
                  variant="neutral"
                  onClick={() => {
                    setNewTag('')
                    setShowTagInput(false)
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="neutral"
                onClick={() => setShowTagInput(true)}
              >
                + Add Tag
              </Button>
            )}
          </div>
        </div>

        {/* Difficulty Range */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">
            Difficulty: {customFilters.difficulty?.min || 0} - {customFilters.difficulty?.max || 10}
          </Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={10}
              value={customFilters.difficulty?.min || 0}
              onChange={(e) =>
                setCustomFilters({
                  ...customFilters,
                  difficulty: {
                    min: parseInt(e.target.value),
                    max: customFilters.difficulty?.max || 10,
                  },
                })
              }
              className="w-20"
            />
            <Input
              type="number"
              min={0}
              max={10}
              value={customFilters.difficulty?.max || 10}
              onChange={(e) =>
                setCustomFilters({
                  ...customFilters,
                  difficulty: {
                    min: customFilters.difficulty?.min || 0,
                    max: parseInt(e.target.value),
                  },
                })
              }
              className="w-20"
            />
          </div>
        </div>

        {/* Quick Filters */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2">Quick Filters</Label>
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={customFilters.notStudiedYet ? 'default' : 'neutral'}
              className="cursor-pointer"
              onClick={() =>
                setCustomFilters({
                  ...customFilters,
                  notStudiedYet: !customFilters.notStudiedYet,
                })
              }
            >
              Not Studied Yet
            </Badge>
            <Badge
              variant={customFilters.failedCards ? 'default' : 'neutral'}
              className="cursor-pointer"
              onClick={() =>
                setCustomFilters({
                  ...customFilters,
                  failedCards: !customFilters.failedCards,
                })
              }
            >
              Failed Cards
            </Badge>
            <Badge
              variant={customFilters.dueOnly === false ? 'default' : 'neutral'}
              className="cursor-pointer"
              onClick={() =>
                setCustomFilters({
                  ...customFilters,
                  dueOnly: customFilters.dueOnly === false ? undefined : false,
                })
              }
            >
              Ignore Due Date
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-sm text-muted-foreground">
            {previewCount} card{previewCount !== 1 ? 's' : ''} match
          </div>
          <div className="flex gap-2">
            <Button variant="neutral" onClick={resetCustomFilters}>
              Reset
            </Button>
            <Button onClick={handleStartSession} disabled={previewCount === 0}>
              Start Session
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
