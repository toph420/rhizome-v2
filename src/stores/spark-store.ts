import { create } from 'zustand'
import type { SparkCacheRow } from '@/lib/sparks/types'

/**
 * Spark Store
 *
 * Manages spark state, optimistic updates, and server action integration.
 * Pattern: Follows annotation-store.ts
 */
interface SparkState {
  // State keyed by documentId for isolation
  sparks: Record<string, SparkCacheRow[]>

  // Loading states
  loading: Record<string, boolean>

  // Actions
  setSparks: (documentId: string, sparks: SparkCacheRow[]) => void
  addSpark: (documentId: string, spark: SparkCacheRow) => void
  updateSpark: (documentId: string, sparkId: string, updates: Partial<SparkCacheRow>) => void
  removeSpark: (documentId: string, sparkId: string) => void
  setLoading: (documentId: string, loading: boolean) => void
}

export const useSparkStore = create<SparkState>((set) => ({
  sparks: {},
  loading: {},

  setSparks: (documentId, sparks) =>
    set((state) => ({
      sparks: { ...state.sparks, [documentId]: sparks }
    })),

  addSpark: (documentId, spark) =>
    set((state) => {
      const existing = state.sparks[documentId] || []

      // Duplicate check
      if (existing.some(s => s.entity_id === spark.entity_id)) {
        console.warn(`[SparkStore] Duplicate spark prevented: ${spark.entity_id}`)
        return state
      }

      return {
        sparks: {
          ...state.sparks,
          [documentId]: [...existing, spark]
        }
      }
    }),

  updateSpark: (documentId, sparkId, updates) =>
    set((state) => ({
      sparks: {
        ...state.sparks,
        [documentId]: state.sparks[documentId]?.map(s =>
          s.entity_id === sparkId ? { ...s, ...updates } : s
        ) || []
      }
    })),

  removeSpark: (documentId, sparkId) =>
    set((state) => ({
      sparks: {
        ...state.sparks,
        [documentId]: state.sparks[documentId]?.filter(s =>
          s.entity_id !== sparkId
        ) || []
      }
    })),

  setLoading: (documentId, loading) =>
    set((state) => ({
      loading: { ...state.loading, [documentId]: loading }
    })),
}))
