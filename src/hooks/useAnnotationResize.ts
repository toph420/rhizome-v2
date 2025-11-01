'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'
import type { Chunk } from '@/types/annotations'

// Stable empty array to prevent infinite loops from new references
const EMPTY_STORE_ANNOTATIONS: never[] = []

// TypeScript types for cross-browser caret positioning APIs
interface CaretPosition {
  offsetNode: Node
  offset: number
}

declare global {
  interface Document {
    caretPositionFromPoint(x: number, y: number): CaretPosition | null
    caretRangeFromPoint(x: number, y: number): Range | null
  }
}

export interface AnnotationResizeOptions {
  enabled?: boolean
  documentId: string
  chunks: Chunk[]
  // REMOVED: annotations prop (now read from store directly)
  onResizeComplete: (annotationId: string, newRange: {
    startOffset: number
    endOffset: number
    text: string
  }) => Promise<void>
}

export interface ResizeState {
  annotationId: string
  edge: 'start' | 'end'
  initialStartOffset: number
  initialEndOffset: number
  currentStartOffset: number
  currentEndOffset: number
  text: string
}

export interface UseAnnotationResizeReturn {
  isResizing: boolean
  resizeState: ResizeState | null
}

/**
 * Cross-browser helper for getting caret range at point.
 * Safari uses caretRangeFromPoint(), Chrome/Firefox use caretPositionFromPoint().
 */
function getCaretRangeFromPoint(x: number, y: number): Range | null {
  // Modern browsers (Chrome/Firefox) - returns CaretPosition
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y)
    if (!position) return null

    // Convert CaretPosition to Range
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.setEnd(position.offsetNode, position.offset)
    return range
  }

  // Safari - returns Range directly
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y)
  }

  // Fallback - browser doesn't support either API
  console.error('[useAnnotationResize] Browser does not support caret positioning APIs')
  return null
}

/**
 * Hook for handling annotation resize via edge dragging.
 *
 * Pattern: Similar to QuickCapturePanel drag handler
 * - Detects edge proximity on mousemove (8px threshold)
 * - Initiates drag on mousedown within edge zone
 * - Updates offsets during mousemove (live preview)
 * - Saves on mouseup with validation
 */
export function useAnnotationResize({
  enabled = true,
  documentId,
  chunks,
  onResizeComplete,
}: AnnotationResizeOptions): UseAnnotationResizeReturn {
  // NEW: Read directly from store (documentId-keyed!)
  // CRITICAL: Use stable empty array to prevent infinite loop from new array references
  const storeAnnotations = useAnnotationStore(
    state => state.annotations[documentId] || EMPTY_STORE_ANNOTATIONS
  )

  // Transform to simple format (same as before)
  const annotations = useMemo(() =>
    storeAnnotations.map(ann => ({
      id: ann.id,
      startOffset: ann.components.Position?.startOffset ?? 0,
      endOffset: ann.components.Position?.endOffset ?? 0,
      text: ann.components.Position?.originalText,
    })),
    [storeAnnotations]
  )

  // Guard: Don't enable until annotations loaded
  const actuallyEnabled = enabled && annotations.length > 0

  // NEW: Use Zustand store instead of local state
  const startResize = useAnnotationResizeStore((s) => s.startResize)
  const isResizing = useAnnotationResizeStore((s) => s.isResizing)

  // Keep fresh reference to annotations to avoid closure issues
  const annotationsRef = useRef(annotations)

  // Keep refs in sync with state/props
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  // REMOVED: blockCacheRef - No longer needed (preview handled by useResizePreviewOverlay)
  // REMOVED: updatePreviewOverlay - Now handled by useResizePreviewOverlay hook

  /**
   * Handle mousedown to initiate resize.
   * NEW: Simplified - just check if click is on a resize handle!
   */
  useEffect(() => {
    if (!actuallyEnabled) return

    const handleMouseDown = (e: MouseEvent) => {
      // Only left click
      if (e.button !== 0) return

      // Find if click is on a resize handle
      const handle = (e.target as HTMLElement).closest('.resize-handle') as HTMLElement | null
      if (!handle) return // Not clicking on a handle, ignore

      const edge = handle.getAttribute('data-edge') as 'start' | 'end' | null
      if (!edge) return // Handle without edge attribute, should not happen

      const spanElement = handle.closest('[data-annotation-id]') as HTMLElement | null
      if (!spanElement) return // Handle not inside annotation span, should not happen

      const annotationId = spanElement.getAttribute('data-annotation-id')
      if (!annotationId) return // Span without annotation ID, should not happen

      // CRITICAL: Prevent text selection from starting
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      // Find annotation in the annotations array (use ref for fresh data)
      const currentAnnotations = annotationsRef.current
      const annotation = currentAnnotations.find(ann => ann.id === annotationId)
      if (!annotation) {
        console.warn('[useAnnotationResize] Annotation not found:', annotationId)
        return
      }

      // NEW: Use Zustand action to start resize
      startResize(annotationId, edge, annotation.startOffset, annotation.endOffset)
    }

    // Use capture phase + passive:false to intercept BEFORE text selection hook
    document.addEventListener('mousedown', handleMouseDown, { capture: true, passive: false })
    return () => document.removeEventListener('mousedown', handleMouseDown, { capture: true })
  }, [actuallyEnabled, annotations])

  // REMOVED: mousemove effect - Now handled by useGlobalResizeHandler
  // REMOVED: mouseup effect - Now handled by useGlobalResizeHandler

  return {
    isResizing,
    resizeState: null, // No longer needed - state in Zustand
  }
}
