import { create } from 'zustand'
import { loadChunkDetails, updateChunkMetadata } from '@/app/actions/chunks'
import { toast } from 'sonner'

// Lightweight chunk for list display
interface ChunkListItem {
  id: string
  chunk_index: number
  preview: string
  connections_detected: boolean
  connection_count?: number
}

// Full chunk details for editing (lazy loaded)
interface ChunkDetailed {
  id: string
  content: string
  heading_path: string[]
  page_start?: number
  page_end?: number
  word_count: number
  token_count: number
  themes?: string[]
  importance_score?: number
  summary?: string

  // Metadata (JSONB fields)
  emotional_metadata?: Record<string, any>
  conceptual_metadata?: Record<string, any>
  domain_metadata?: Record<string, any>

  // Detection info
  connections_detected: boolean
  connections_detected_at?: string
  connection_count: number

  // Enrichment info
  enrichments_detected?: boolean
  enrichments_detected_at?: string
  enrichment_skipped_reason?: string

  // Quality info
  position_confidence?: string
  metadata_confidence?: string
  chunker_type: string
}

interface ChunkMetadata {
  title?: string
  domain_metadata?: {
    primaryDomain?: string
    subDomains?: string[]
    confidence?: 'high' | 'medium' | 'low'
  }
  emotional_metadata?: {
    primaryEmotion?: string
    polarity?: number
    intensity?: number
  }
  conceptual_metadata?: {
    concepts?: Array<{ text: string; confidence: number }>
  }
  themes?: string[]
  importance_score?: number
}

interface ChunkStore {
  // Selection for batch operations
  selectedChunks: Set<string>
  toggleSelection: (chunkId: string) => void
  selectMultiple: (chunkIds: string[]) => void
  clearSelection: () => void

  // Detection status (synced with DB via parent component)
  detectionStatus: Map<string, boolean>
  markAsDetected: (chunkId: string) => void

  // Detailed chunk data (lazy loaded on demand)
  detailedChunks: Map<string, ChunkDetailed>
  loadingDetailed: Set<string>
  loadDetailedChunk: (chunkId: string) => Promise<void>

  // Metadata editing with optimistic updates
  updateChunkMetadata: (
    chunkId: string,
    metadata: Partial<ChunkMetadata>
  ) => Promise<void>
}

export const useChunkStore = create<ChunkStore>((set, get) => ({
  selectedChunks: new Set(),
  detectionStatus: new Map(),
  detailedChunks: new Map(),
  loadingDetailed: new Set(),

  toggleSelection: (chunkId) => set((state) => {
    const next = new Set(state.selectedChunks)
    if (next.has(chunkId)) {
      next.delete(chunkId)
    } else {
      next.add(chunkId)
    }
    return { selectedChunks: next }
  }),

  selectMultiple: (chunkIds) => set({
    selectedChunks: new Set(chunkIds)
  }),

  clearSelection: () => set({ selectedChunks: new Set() }),

  markAsDetected: (chunkId) => set((state) => {
    const next = new Map(state.detectionStatus)
    next.set(chunkId, true)
    return { detectionStatus: next }
  }),

  loadDetailedChunk: async (chunkId) => {
    const state = get()

    // Skip if already loaded or loading
    if (state.detailedChunks.has(chunkId) || state.loadingDetailed.has(chunkId)) {
      return
    }

    // Mark as loading
    set((state) => ({
      loadingDetailed: new Set(state.loadingDetailed).add(chunkId)
    }))

    try {
      const details = await loadChunkDetails(chunkId)

      set((state) => {
        const nextDetailed = new Map(state.detailedChunks)
        nextDetailed.set(chunkId, details)

        const nextLoading = new Set(state.loadingDetailed)
        nextLoading.delete(chunkId)

        return {
          detailedChunks: nextDetailed,
          loadingDetailed: nextLoading
        }
      })
    } catch (error) {
      console.error('[ChunkStore] Failed to load details:', error)
      toast.error('Failed to load chunk details')

      set((state) => {
        const nextLoading = new Set(state.loadingDetailed)
        nextLoading.delete(chunkId)
        return { loadingDetailed: nextLoading }
      })
    }
  },

  updateChunkMetadata: async (chunkId, metadata) => {
    // Optimistic update
    set((state) => {
      const chunk = state.detailedChunks.get(chunkId)
      if (!chunk) return state

      const nextDetailed = new Map(state.detailedChunks)
      nextDetailed.set(chunkId, {
        ...chunk,
        domain_metadata: metadata.domain_metadata || chunk.domain_metadata,
        emotional_metadata: metadata.emotional_metadata || chunk.emotional_metadata,
        conceptual_metadata: metadata.conceptual_metadata || chunk.conceptual_metadata,
        themes: metadata.themes || chunk.themes,
        importance_score: metadata.importance_score ?? chunk.importance_score
      })

      return { detailedChunks: nextDetailed }
    })

    try {
      await updateChunkMetadata(chunkId, metadata)
      toast.success('Metadata updated')
    } catch (error) {
      console.error('[ChunkStore] Failed to update metadata:', error)
      toast.error('Failed to save metadata')
      // TODO: Revert optimistic update on error
    }
  }
}))

export type { ChunkListItem, ChunkDetailed, ChunkMetadata }
