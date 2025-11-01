import { create } from 'zustand'

interface AnnotationResizeState {
  // Resize state
  isResizing: boolean
  annotationId: string | null
  edge: 'start' | 'end' | null
  initialStartOffset: number
  initialEndOffset: number
  currentStartOffset: number
  currentEndOffset: number

  // Hover state (for visual feedback)
  hoveredEdge: { annotationId: string; edge: 'start' | 'end' } | null

  // Actions
  startResize: (
    annotationId: string,
    edge: 'start' | 'end',
    startOffset: number,
    endOffset: number
  ) => void
  updateResize: (newStartOffset: number, newEndOffset: number) => void
  cancelResize: () => void
  completeResize: () => void
  setHoveredEdge: (annotationId: string | null, edge: 'start' | 'end' | null) => void
}

export const useAnnotationResizeStore = create<AnnotationResizeState>((set) => ({
  isResizing: false,
  annotationId: null,
  edge: null,
  initialStartOffset: 0,
  initialEndOffset: 0,
  currentStartOffset: 0,
  currentEndOffset: 0,
  hoveredEdge: null,

  startResize: (annotationId, edge, startOffset, endOffset) => {
    set({
      isResizing: true,
      annotationId,
      edge,
      initialStartOffset: startOffset,
      initialEndOffset: endOffset,
      currentStartOffset: startOffset,
      currentEndOffset: endOffset,
    })
    document.body.classList.add('annotation-resizing')
    window.getSelection()?.removeAllRanges()
  },

  updateResize: (newStartOffset, newEndOffset) => {
    set((state) => {
      if (!state.isResizing) return state

      // Validate based on edge being dragged
      if (state.edge === 'start') {
        newStartOffset = Math.min(newStartOffset, state.initialEndOffset - 3)
      } else {
        newEndOffset = Math.max(newEndOffset, state.initialStartOffset + 3)
      }

      return {
        currentStartOffset: newStartOffset,
        currentEndOffset: newEndOffset,
      }
    })
  },

  cancelResize: () => {
    set({
      isResizing: false,
      annotationId: null,
      edge: null,
      hoveredEdge: null,
    })
    document.body.classList.remove('annotation-resizing')
    document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())
  },

  completeResize: () => {
    document.body.classList.remove('annotation-resizing')
    document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())
    set({
      isResizing: false,
      annotationId: null,
      edge: null,
      hoveredEdge: null,
    })
  },

  setHoveredEdge: (annotationId, edge) => {
    set({
      hoveredEdge: annotationId && edge ? { annotationId, edge } : null,
    })
  },
}))
