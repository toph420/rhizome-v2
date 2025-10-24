'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/rhizome/card'
import { Button } from '@/components/rhizome/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/rhizome/select'
import { FlashcardCard } from '@/components/rhizome/flashcard-card'
import { getFlashcardsByDocument } from '@/app/actions/flashcards'
import { useFlashcardStore } from '@/stores/flashcard-store'
import { Brain, Filter } from 'lucide-react'

interface FlashcardsListClientProps {
  documentId: string
}

export function FlashcardsListClient({ documentId }: FlashcardsListClientProps) {
  const {
    dueCount,
    loading,
    getCardsByDocument,
    setCards,
    setLoading,
  } = useFlashcardStore()

  const cards = getCardsByDocument(documentId)
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved'>('all')
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const router = useRouter()

  // Refetch when filter changes
  useEffect(() => {
    async function load() {
      setLoading(documentId, true)
      const filtered = await getFlashcardsByDocument(
        documentId,
        filter === 'all' ? undefined : filter
      )
      setCards(documentId, filtered)
      setLoading(documentId, false)
    }
    load()
  }, [documentId, filter, setCards, setLoading])

  const handleRefetch = async () => {
    const updated = await getFlashcardsByDocument(documentId)
    setCards(documentId, updated)
  }

  if (loading[documentId] && cards.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Loading flashcards...
        </div>
      </Card>
    )
  }

  if (cards.length === 0) {
    return (
      <Card className="p-6 border-dashed">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/20">
              <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-1">No Flashcards Yet</h3>
            <p className="text-sm text-muted-foreground">
              Generate cards from the "Generate" tab
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with filter and study button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cards</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dueCount > 0 && (
          <Button
            size="sm"
            onClick={() => router.push('/flashcards/study')}
          >
            Study ({dueCount})
          </Button>
        )}
      </div>

      {/* Stats summary */}
      <div className="text-xs text-muted-foreground p-3 bg-muted rounded-lg">
        <div className="flex justify-between">
          <span>Total cards:</span>
          <span className="font-medium">{cards.length}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span>Due for review:</span>
          <span className="font-medium">{dueCount}</span>
        </div>
      </div>

      {/* Cards list */}
      <div className="space-y-2">
        {cards.map(card => (
          <FlashcardCard
            key={card.entity_id}
            flashcard={card}
            isActive={activeCardId === card.entity_id}
            onClick={() => setActiveCardId(card.entity_id)}
            onApproved={() => handleRefetch()}
            onDeleted={() => handleRefetch()}
          />
        ))}
      </div>
    </div>
  )
}
