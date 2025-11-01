import { renderHook, act } from '@testing-library/react'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'

describe('Cross-Block Annotation Resize', () => {
  beforeEach(() => {
    // Reset store between tests
    const { result } = renderHook(() => useAnnotationResizeStore())
    act(() => result.current.cancelResize())
  })

  describe('State Persistence', () => {
    it('should maintain offset state across component unmount/remount cycles', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'end', 100, 200)
      })

      expect(result.current.isResizing).toBe(true)
      expect(result.current.currentEndOffset).toBe(200)

      // Simulate component unmount (happens during Virtuoso scroll)
      // State should persist in Zustand
      const { result: result2 } = renderHook(() => useAnnotationResizeStore())

      // State survived "unmount"
      expect(result2.current.isResizing).toBe(true)
      expect(result2.current.currentEndOffset).toBe(200)
    })

    it('should update offsets during resize', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'end', 100, 200)
      })

      act(() => {
        result.current.updateResize(100, 250)
      })

      expect(result.current.currentEndOffset).toBe(250)
      expect(result.current.currentStartOffset).toBe(100)
    })

    it('should clear state on cancel', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'end', 100, 200)
        result.current.cancelResize()
      })

      expect(result.current.isResizing).toBe(false)
      expect(result.current.annotationId).toBe(null)
    })
  })

  describe('Edge Validation', () => {
    it('should enforce minimum annotation length (3 chars)', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'start', 100, 110)
      })

      // Try to make annotation too small (< 3 chars)
      act(() => {
        result.current.updateResize(109, 110)
      })

      // Should enforce minimum: 110 - 3 = 107
      expect(result.current.currentStartOffset).toBe(107)
    })

    it('should prevent start from exceeding end', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'start', 100, 200)
      })

      // Try to drag start past end
      act(() => {
        result.current.updateResize(250, 200)
      })

      // Should be clamped to end - 3
      expect(result.current.currentStartOffset).toBe(197)
    })

    it('should maintain edge being dragged', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'start', 100, 200)
      })

      expect(result.current.edge).toBe('start')

      // Starting new resize should update edge
      act(() => {
        result.current.startResize('ann-2', 'end', 150, 250)
      })

      expect(result.current.edge).toBe('end')
    })
  })

  describe('Hover State', () => {
    it('should track hovered edge', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.setHoveredEdge('ann-1', 'start')
      })

      expect(result.current.hoveredEdge).toEqual({
        annotationId: 'ann-1',
        edge: 'start',
      })
    })

    it('should clear hovered edge', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.setHoveredEdge('ann-1', 'start')
        result.current.setHoveredEdge(null, null)
      })

      expect(result.current.hoveredEdge).toBe(null)
    })
  })

  describe('Resize Lifecycle', () => {
    it('should preserve initial offsets during resize', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('ann-1', 'end', 100, 200)
      })

      // Initial values preserved
      expect(result.current.initialStartOffset).toBe(100)
      expect(result.current.initialEndOffset).toBe(200)

      // Update current offsets
      act(() => {
        result.current.updateResize(100, 250)
      })

      // Initial values unchanged
      expect(result.current.initialStartOffset).toBe(100)
      expect(result.current.initialEndOffset).toBe(200)

      // Current values updated
      expect(result.current.currentEndOffset).toBe(250)
    })

    it('should store annotation ID during resize', () => {
      const { result } = renderHook(() => useAnnotationResizeStore())

      act(() => {
        result.current.startResize('test-annotation-123', 'start', 50, 150)
      })

      expect(result.current.annotationId).toBe('test-annotation-123')
      expect(result.current.isResizing).toBe(true)
    })
  })
})
