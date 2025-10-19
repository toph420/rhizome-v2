/**
 * Recovery Store
 *
 * Manages recovery state for all entity types (annotations, sparks, flashcards).
 * Consolidated recovery UI with filtering.
 *
 * Pattern: Follows background-jobs.ts async pattern
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createClient } from '@/lib/supabase/client'

interface RecoveryItem {
  entityId: string
  entityType: 'annotation' | 'spark' | 'flashcard'
  recoveryConfidence: number
  recoveryMethod: string
  needsReview: boolean

  // Type-specific data
  content?: string
  text?: string
  chunkId?: string
  documentId?: string
  tags?: string[]
  selections?: number
}

interface RecoveryState {
  // Data
  items: Map<string, RecoveryItem>

  // Filters
  typeFilter: 'all' | 'annotation' | 'spark' | 'flashcard'
  confidenceFilter: 'all' | 'high' | 'medium' | 'low'

  // Loading
  loading: boolean

  // Computed
  filteredItems: () => RecoveryItem[]

  // Actions
  loadRecoveryItems: (documentId: string) => Promise<void>
  acceptRecovery: (entityId: string) => Promise<void>
  rejectRecovery: (entityId: string) => Promise<void>
  manuallyRelink: (entityId: string, chunkId: string) => Promise<void>
  setTypeFilter: (type: RecoveryState['typeFilter']) => void
  setConfidenceFilter: (level: RecoveryState['confidenceFilter']) => void
}

export const useRecoveryStore = create<RecoveryState>()(
  devtools(
    (set, get) => ({
      items: new Map(),
      typeFilter: 'all',
      confidenceFilter: 'all',
      loading: false,

      filteredItems: () => {
        const { items, typeFilter, confidenceFilter } = get()
        const allItems = Array.from(items.values())

        let filtered = allItems

        // Filter by type
        if (typeFilter !== 'all') {
          filtered = filtered.filter(item => item.entityType === typeFilter)
        }

        // Filter by confidence
        if (confidenceFilter !== 'all') {
          filtered = filtered.filter(item => {
            if (confidenceFilter === 'high') return item.recoveryConfidence >= 0.85
            if (confidenceFilter === 'medium') return item.recoveryConfidence >= 0.70 && item.recoveryConfidence < 0.85
            if (confidenceFilter === 'low') return item.recoveryConfidence < 0.70
            return true
          })
        }

        // Sort by confidence (lowest first - needs most attention)
        return filtered.sort((a, b) => a.recoveryConfidence - b.recoveryConfidence)
      },

      loadRecoveryItems: async (documentId: string) => {
        set({ loading: true })
        const supabase = createClient()

        try {
          // Get annotations needing review
          const { data: annotationComps } = await supabase
            .from('components')
            .select('entity_id, data, recovery_confidence, recovery_method, needs_review')
            .eq('component_type', 'position')
            .eq('data->>documentId', documentId)
            .eq('needs_review', true)

          // Get sparks needing review
          const { data: sparkComps } = await supabase
            .from('components')
            .select('entity_id, data')
            .eq('component_type', 'spark')
            .eq('data->>needsReview', true)

          // Build items map
          const newItems = new Map<string, RecoveryItem>()

          // Add annotations
          for (const comp of annotationComps || []) {
            newItems.set(comp.entity_id, {
              entityId: comp.entity_id,
              entityType: 'annotation',
              recoveryConfidence: comp.recovery_confidence || 0,
              recoveryMethod: comp.recovery_method || 'unknown',
              needsReview: comp.needs_review,
              text: comp.data.originalText,
              documentId: comp.data.documentId,
            })
          }

          // Add sparks (need to fetch content component for text)
          const sparkEntityIds = (sparkComps || []).map(c => c.entity_id)
          if (sparkEntityIds.length > 0) {
            const { data: contentComps } = await supabase
              .from('components')
              .select('entity_id, data')
              .eq('component_type', 'content')
              .in('entity_id', sparkEntityIds)

            for (const comp of sparkComps || []) {
              const contentComp = contentComps?.find(c => c.entity_id === comp.entity_id)

              newItems.set(comp.entity_id, {
                entityId: comp.entity_id,
                entityType: 'spark',
                recoveryConfidence: comp.data.recoveryConfidence || 0,
                recoveryMethod: comp.data.recoveryMethod || 'unknown',
                needsReview: comp.data.needsReview,
                content: contentComp?.data.note,
                tags: contentComp?.data.tags,
                selections: comp.data.selections?.length || 0,
              })
            }
          }

          set({ items: newItems, loading: false })
        } catch (error) {
          console.error('[Recovery] Failed to load items:', error)
          set({ loading: false })
        }
      },

      acceptRecovery: async (entityId: string) => {
        const supabase = createClient()

        // Update needs_review to false for Position component
        await supabase
          .from('components')
          .update({ needs_review: false })
          .eq('entity_id', entityId)
          .eq('component_type', 'position')

        // For sparks, update Spark component's needsReview field in JSONB
        const { data: sparkComp } = await supabase
          .from('components')
          .select('data')
          .eq('entity_id', entityId)
          .eq('component_type', 'spark')
          .single()

        if (sparkComp) {
          const updatedData = { ...sparkComp.data, needsReview: false }
          await supabase
            .from('components')
            .update({ data: updatedData })
            .eq('entity_id', entityId)
            .eq('component_type', 'spark')
        }

        // Remove from items
        set((state) => {
          const newItems = new Map(state.items)
          newItems.delete(entityId)
          return { items: newItems }
        })
      },

      rejectRecovery: async (entityId: string) => {
        // Mark as lost/orphaned
        const supabase = createClient()

        await supabase
          .from('components')
          .update({
            recovery_method: 'lost',
            recovery_confidence: 0.0,
            needs_review: false
          })
          .eq('entity_id', entityId)

        set((state) => {
          const newItems = new Map(state.items)
          newItems.delete(entityId)
          return { items: newItems }
        })
      },

      manuallyRelink: async (entityId: string, chunkId: string) => {
        const supabase = createClient()

        // Update ChunkRef component
        const { data: chunkRefComp } = await supabase
          .from('components')
          .select('data')
          .eq('entity_id', entityId)
          .eq('component_type', 'chunkRef')
          .single()

        if (chunkRefComp) {
          const updatedData = { ...chunkRefComp.data, chunkId }
          await supabase
            .from('components')
            .update({ data: updatedData })
            .eq('entity_id', entityId)
            .eq('component_type', 'chunkRef')
        }

        // Mark as manually recovered
        await supabase
          .from('components')
          .update({
            recovery_method: 'manual',
            recovery_confidence: 1.0,
            needs_review: false
          })
          .eq('entity_id', entityId)

        set((state) => {
          const newItems = new Map(state.items)
          newItems.delete(entityId)
          return { items: newItems }
        })
      },

      setTypeFilter: (type) => set({ typeFilter: type }),
      setConfidenceFilter: (level) => set({ confidenceFilter: level }),
    }),
    {
      name: 'Recovery',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
