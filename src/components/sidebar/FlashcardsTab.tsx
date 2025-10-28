'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/rhizome/tabs'
import { GenerationPanelClient } from '@/components/flashcards/GenerationPanelClient'
import { FlashcardsListClient } from '@/components/flashcards/FlashcardsListClient'
import { useEffect } from 'react'
import { useFlashcardStore } from '@/stores/flashcard-store'
import { getPromptTemplates } from '@/app/actions/prompts'
import { getDecksWithStats } from '@/app/actions/decks'
import { getFlashcardsByDocument, getDueFlashcards } from '@/app/actions/flashcards'

/**
 * FlashcardsTab Component
 *
 * Tabbed interface for flashcard features:
 * - Generate: Create flashcards from document using AI
 * - Cards: Browse and manage flashcards for this document
 *
 * Pattern: Client Component using Zustand store (matches spark-store, annotation-store)
 * Fetches data on mount and stores in global state
 */

interface FlashcardsTabProps {
  documentId: string
}

export function FlashcardsTab({ documentId }: FlashcardsTabProps) {
  const {
    prompts,
    decks,
    dueCount,
    loading,
    globalLoading,
    setPrompts,
    setDecks,
    setCards,
    setDueCount,
    setLoading,
    setGlobalLoading,
    getCardsByDocument,
  } = useFlashcardStore()

  useEffect(() => {
    async function loadData() {
      setLoading(documentId, true)
      setGlobalLoading(true)
      try {
        const [promptsData, decksData, cardsData, dueCardsData] = await Promise.all([
          getPromptTemplates(),
          getDecksWithStats(),
          getFlashcardsByDocument(documentId),
          getDueFlashcards(),
        ])
        setPrompts(promptsData)
        setDecks(decksData)
        setCards(documentId, cardsData)
        setDueCount(dueCardsData.length)
      } finally {
        setLoading(documentId, false)
        setGlobalLoading(false)
      }
    }
    loadData()
  }, [documentId, setPrompts, setDecks, setCards, setDueCount, setLoading, setGlobalLoading])

  if (globalLoading && getCardsByDocument(documentId).length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="text-sm text-muted-foreground">Loading flashcards...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <Tabs defaultValue="generate" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4">
          <GenerationPanelClient documentId={documentId} />
        </TabsContent>

        <TabsContent value="cards" className="mt-4">
          <FlashcardsListClient documentId={documentId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
