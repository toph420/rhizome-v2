import { create } from 'zustand'

interface SessionContext {
  deckId?: string
  deckName?: string
  documentId?: string
  documentTitle?: string
  filters?: CustomStudyFilters
  returnTo: 'management' | { type: 'document'; id: string; title: string }
}

interface CustomStudyFilters {
  deckId?: string
  documentId?: string
  chunkIds?: string[]
  tags?: string[]
  dateRange?: {
    start: Date
    end: Date
    field: 'created_at' | 'last_review' | 'next_review'
  }
  status?: ('draft' | 'active' | 'suspended')[]
  difficulty?: { min: number; max: number }
  notStudiedYet?: boolean
  failedCards?: boolean
  dueOnly?: boolean  // Default: true (only due cards), false = study all
}

interface StudyStore {
  // Current session context
  sessionContext: SessionContext | null
  setSessionContext: (context: SessionContext | null) => void

  // Custom study builder state
  customFilters: CustomStudyFilters
  setCustomFilters: (filters: CustomStudyFilters) => void
  resetCustomFilters: () => void

  // Preview count for custom study
  previewCount: number
  setPreviewCount: (count: number) => void

  // Active deck in grid
  activeDeckId: string | null
  setActiveDeckId: (deckId: string | null) => void
}

/**
 * Study Store
 *
 * Manages study UI state, session context, and custom filters.
 * Pattern: Follows flashcard-store.ts (simple state + setters)
 *
 * State organization:
 * - sessionContext: Tracks where study started (for smart navigation)
 * - customFilters: Advanced filter state for custom study builder
 * - previewCount: Live count for custom filter preview
 * - activeDeckId: Selected deck in deck grid
 */
export const useStudyStore = create<StudyStore>((set) => ({
  sessionContext: null,
  setSessionContext: (context) => set({ sessionContext: context }),

  customFilters: {},
  setCustomFilters: (filters) => set({ customFilters: filters }),
  resetCustomFilters: () => set({ customFilters: {} }),

  previewCount: 0,
  setPreviewCount: (count) => set({ previewCount: count }),

  activeDeckId: null,
  setActiveDeckId: (deckId) => set({ activeDeckId: deckId }),
}))

// Export types for use in components
export type { SessionContext, CustomStudyFilters }
