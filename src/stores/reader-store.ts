import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Chunk type matching the database schema.
 * Contains semantic metadata and offset information.
 */
export interface Chunk {
  id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
  summary?: string
  themes?: string[]
  concepts?: Array<{ text: string; importance: number }>
  importance_score?: number
  polarity?: number
  embedding?: number[]
}

/**
 * Reader store state.
 * Manages document content, scroll position, and visible chunks.
 * Coordinates with ConnectionStore via visibleChunks subscription.
 */
interface ReaderState {
  // Current document
  documentId: string | null
  documentTitle: string
  markdownContent: string
  chunks: Chunk[]

  // Scroll & viewport tracking
  scrollPosition: number  // 0-100 percentage
  viewportOffsets: { start: number; end: number }
  visibleChunks: Chunk[]

  // Actions
  loadDocument: (docId: string, title: string, markdown: string, chunks: Chunk[]) => void
  updateScroll: (position: number, offsets: { start: number; end: number }) => void
  clearDocument: () => void
}

/**
 * Zustand store for document reading state.
 * Handles document loading, scroll tracking, and visible chunk calculation.
 *
 * Persistence: Only documentId and scrollPosition (for resume reading).
 * Content is reloaded from database on mount.
 */
export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      // Initial state
      documentId: null,
      documentTitle: '',
      markdownContent: '',
      chunks: [],
      scrollPosition: 0,
      viewportOffsets: { start: 0, end: 0 },
      visibleChunks: [],

      /**
       * Loads a new document into the reader.
       * Resets scroll position and calculates initial visible chunks.
       *
       * @param docId - Document identifier
       * @param title - Document title for header
       * @param markdown - Full markdown content
       * @param chunks - Semantic chunks with offsets
       */
      loadDocument: (docId, title, markdown, chunks) => {
        // Calculate initial visible chunks (first 5 chunks or first screen)
        const initialVisible = chunks.slice(0, 5)

        set({
          documentId: docId,
          documentTitle: title,
          markdownContent: markdown,
          chunks,
          scrollPosition: 0,
          viewportOffsets: { start: 0, end: markdown.length > 0 ? Math.min(5000, markdown.length) : 0 },
          visibleChunks: initialVisible
        })
      },

      /**
       * Updates scroll position and recalculates visible chunks.
       * Triggers connection fetching in ReaderLayout via subscription.
       *
       * @param position - Scroll percentage (0-100)
       * @param offsets - Viewport character offsets in markdown
       */
      updateScroll: (position, offsets) => {
        const chunks = get().chunks

        // Find chunks that overlap with viewport
        const visible = chunks.filter(chunk =>
          chunk.start_offset <= offsets.end && chunk.end_offset >= offsets.start
        )

        console.log('[ReaderStore] Visible chunks updated:', {
          viewport: `${offsets.start}-${offsets.end}`,
          chunkCount: visible.length,
          chunkIndices: visible.map(c => c.chunk_index).join(', ')
        })

        set({
          scrollPosition: position,
          viewportOffsets: offsets,
          visibleChunks: visible
        })
      },

      /**
       * Clears document state when navigating away.
       * Call this in cleanup to prevent stale state.
       */
      clearDocument: () => set({
        documentId: null,
        documentTitle: '',
        markdownContent: '',
        chunks: [],
        scrollPosition: 0,
        viewportOffsets: { start: 0, end: 0 },
        visibleChunks: []
      })
    }),
    {
      name: 'reader-storage',
      // Only persist document ID and scroll position for "resume reading"
      partialize: (state) => ({
        documentId: state.documentId,
        scrollPosition: state.scrollPosition
      })
    }
  )
)
