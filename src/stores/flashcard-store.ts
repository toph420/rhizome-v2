import { create } from 'zustand'
import type { FlashcardCacheRow, PromptTemplate, Deck } from '@/lib/flashcards/types'

/**
 * Flashcard Store
 *
 * Manages flashcard state, optimistic updates, and server action integration.
 * Pattern: Follows spark-store.ts and annotation-store.ts
 *
 * State organization:
 * - cards: Keyed by documentId for per-document isolation
 * - prompts: Global prompt templates
 * - decks: Global deck list with stats
 * - dueCount: Global due cards count
 */
interface FlashcardState {
  // Cards state keyed by documentId for isolation
  cards: Record<string, FlashcardCacheRow[]>

  // Global state (not document-specific)
  prompts: PromptTemplate[]
  decks: Deck[]
  dueCount: number

  // Loading states
  loading: Record<string, boolean>
  globalLoading: boolean

  // Card actions (per-document)
  setCards: (documentId: string, cards: FlashcardCacheRow[]) => void
  addCard: (documentId: string, card: FlashcardCacheRow) => void
  updateCard: (documentId: string, cardId: string, updates: Partial<FlashcardCacheRow>) => void
  removeCard: (documentId: string, cardId: string) => void

  // Global actions
  setPrompts: (prompts: PromptTemplate[]) => void
  setDecks: (decks: Deck[]) => void
  setDueCount: (count: number) => void

  // Loading actions
  setLoading: (documentId: string, loading: boolean) => void
  setGlobalLoading: (loading: boolean) => void

  // Computed selectors
  getCardsByDocument: (documentId: string) => FlashcardCacheRow[]
  getCardById: (documentId: string, cardId: string) => FlashcardCacheRow | undefined
}

export const useFlashcardStore = create<FlashcardState>((set, get) => ({
  // Initial state
  cards: {},
  prompts: [],
  decks: [],
  dueCount: 0,
  loading: {},
  globalLoading: false,

  // Card actions
  setCards: (documentId, cards) =>
    set((state) => ({
      cards: { ...state.cards, [documentId]: cards }
    })),

  addCard: (documentId, card) =>
    set((state) => {
      const existing = state.cards[documentId] || []

      // Duplicate check
      if (existing.some(c => c.entity_id === card.entity_id)) {
        console.warn(`[FlashcardStore] Duplicate card prevented: ${card.entity_id}`)
        return state
      }

      return {
        cards: {
          ...state.cards,
          [documentId]: [...existing, card]
        }
      }
    }),

  updateCard: (documentId, cardId, updates) =>
    set((state) => ({
      cards: {
        ...state.cards,
        [documentId]: state.cards[documentId]?.map(c =>
          c.entity_id === cardId ? { ...c, ...updates } : c
        ) || []
      }
    })),

  removeCard: (documentId, cardId) =>
    set((state) => ({
      cards: {
        ...state.cards,
        [documentId]: state.cards[documentId]?.filter(c =>
          c.entity_id !== cardId
        ) || []
      }
    })),

  // Global actions
  setPrompts: (prompts) => set({ prompts }),
  setDecks: (decks) => set({ decks }),
  setDueCount: (count) => set({ dueCount: count }),

  // Loading actions
  setLoading: (documentId, loading) =>
    set((state) => ({
      loading: { ...state.loading, [documentId]: loading }
    })),

  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  // Computed selectors
  getCardsByDocument: (documentId) => {
    return get().cards[documentId] || []
  },

  getCardById: (documentId, cardId) => {
    return get().cards[documentId]?.find(c => c.entity_id === cardId)
  },
}))
