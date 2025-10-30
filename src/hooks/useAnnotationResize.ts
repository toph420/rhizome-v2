'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { calculateMultiBlockOffsets } from '@/lib/reader/offset-calculator'
import { findSpannedChunks, MAX_CHUNKS_PER_ANNOTATION } from '@/lib/reader/chunk-utils'
import { useAnnotationStore } from '@/stores/annotation-store'
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

  const [isResizing, setIsResizing] = useState(false)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)

  // Keep fresh reference to annotations to avoid closure issues
  const annotationsRef = useRef(annotations)

  // Cache block data to avoid repeated DOM queries
  const blockCacheRef = useRef<Array<{
    element: HTMLElement
    startOffset: number
    endOffset: number
    textContent: string
  }> | null>(null)

  // Keep refs in sync with state/props
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  // Build block cache when starting resize
  useEffect(() => {
    if (!isResizing) {
      blockCacheRef.current = null
      return
    }

    // Build cache once at start of resize
    const blocks = document.querySelectorAll('[data-start-offset]')
    blockCacheRef.current = Array.from(blocks).map(blockEl => {
      const block = blockEl as HTMLElement
      return {
        element: block,
        startOffset: parseInt(block.dataset.startOffset || '0', 10),
        endOffset: parseInt(block.dataset.endOffset || '0', 10),
        textContent: block.textContent || '',
      }
    })
  }, [isResizing])

  /**
   * Update preview overlay to show new annotation boundary in real-time.
   * Uses Range.getClientRects() to position overlay spans precisely.
   * Uses cached block data for performance.
   */
  const updatePreviewOverlay = useCallback((startOffset: number, endOffset: number) => {
    // Remove old preview spans
    document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())

    // Use cached blocks if available, otherwise query DOM
    const blocks = blockCacheRef.current ||
      Array.from(document.querySelectorAll('[data-start-offset]')).map(blockEl => {
        const block = blockEl as HTMLElement
        return {
          element: block,
          startOffset: parseInt(block.dataset.startOffset || '0', 10),
          endOffset: parseInt(block.dataset.endOffset || '0', 10),
          textContent: block.textContent || '',
        }
      })

    for (const blockData of blocks) {
      const { element: block, startOffset: blockStart, endOffset: blockEnd, textContent } = blockData

      // Check if this block overlaps with new annotation range
      if (startOffset < blockEnd && endOffset > blockStart) {
        // Calculate relative offsets within this block
        const relativeStart = Math.max(0, startOffset - blockStart)
        const relativeEnd = Math.min(endOffset - blockStart, textContent.length)

        try {
          // Walk the DOM tree to find text nodes and build range
          const range = document.createRange()
          const walker = document.createTreeWalker(
            block,
            NodeFilter.SHOW_TEXT,
            null
          )

          let currentOffset = 0
          let startNode: Node | null = null
          let startNodeOffset = 0
          let endNode: Node | null = null
          let endNodeOffset = 0

          // Find start and end nodes
          while (walker.nextNode()) {
            const textNode = walker.currentNode
            const textLength = textNode.textContent?.length || 0

            // Find start node
            if (!startNode && currentOffset + textLength > relativeStart) {
              startNode = textNode
              startNodeOffset = relativeStart - currentOffset
            }

            // Find end node
            if (currentOffset + textLength >= relativeEnd) {
              endNode = textNode
              endNodeOffset = relativeEnd - currentOffset
              break
            }

            currentOffset += textLength
          }

          if (startNode && endNode) {
            range.setStart(startNode, startNodeOffset)
            range.setEnd(endNode, endNodeOffset)

            // Get bounding rects for the range (handles multi-line selections)
            const rects = range.getClientRects()

            // Create preview spans for each rect
            for (const rect of Array.from(rects)) {
              if (rect.width === 0 || rect.height === 0) continue // Skip empty rects

              const previewSpan = document.createElement('span')
              previewSpan.className = 'annotation-resize-preview'
              previewSpan.style.cssText = `
                position: fixed;
                left: ${rect.left}px;
                top: ${rect.top}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                border: 2px solid rgb(59, 130, 246);
                background: rgba(59, 130, 246, 0.15);
                pointer-events: none;
                z-index: 9999;
                box-sizing: border-box;
              `
              document.body.appendChild(previewSpan)
            }
          }
        } catch (err) {
          console.warn('[useAnnotationResize] Preview overlay failed:', err)
          // Continue without preview - non-critical
        }
      }
    }
  }, [])

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

      setResizeState({
        annotationId,
        edge,
        initialStartOffset: annotation.startOffset,
        initialEndOffset: annotation.endOffset,
        currentStartOffset: annotation.startOffset,
        currentEndOffset: annotation.endOffset,
        text: annotation.text || '',
      })
      setIsResizing(true)

      // Add body class for CSS styling
      document.body.classList.add('annotation-resizing')

      // Clear any existing selection to prevent interference
      window.getSelection()?.removeAllRanges()
    }

    // Use capture phase + passive:false to intercept BEFORE text selection hook
    document.addEventListener('mousedown', handleMouseDown, { capture: true, passive: false })
    return () => document.removeEventListener('mousedown', handleMouseDown, { capture: true })
  }, [actuallyEnabled, annotations])

  /**
   * Handle mousemove during resize - Calculate new offsets and show preview overlay
   * Uses requestAnimationFrame for 60fps throttling
   */
  useEffect(() => {
    if (!isResizing || !resizeState) {
      // Clean up any stale previews when not resizing
      document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
      return
    }

    // Dim original annotation
    const annotationSpans = document.querySelectorAll(`[data-annotation-id="${resizeState.annotationId}"]`)
    annotationSpans.forEach(span => span.classList.add('resizing-active'))

    // Throttling with requestAnimationFrame (60fps max)
    let rafId: number | null = null
    let pendingUpdate = false

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // If we already have a pending update, skip this event
      if (pendingUpdate) return

      pendingUpdate = true
      rafId = requestAnimationFrame(() => {
        pendingUpdate = false

        // Get new selection range at mouse position (cross-browser)
        const range = getCaretRangeFromPoint(e.clientX, e.clientY)
        if (!range) {
          // Just skip this update, keep last valid preview
          return
        }

        try {
          // Calculate offsets from range
          const offsetResult = calculateMultiBlockOffsets(range, true) // snapToWord = true

          // Determine new start/end based on which edge is being dragged
          let newStartOffset = resizeState.initialStartOffset
          let newEndOffset = resizeState.initialEndOffset

          if (resizeState.edge === 'start') {
            newStartOffset = offsetResult.startOffset
            // Prevent start from going past end
            if (newStartOffset >= resizeState.initialEndOffset) {
              // Keep last valid preview, just skip this update
              return
            }
          } else {
            newEndOffset = offsetResult.endOffset
            // Prevent end from going before start
            if (newEndOffset <= resizeState.initialStartOffset) {
              // Keep last valid preview, just skip this update
              return
            }
          }

          // Validate minimum length (3 characters)
          if (newEndOffset - newStartOffset < 3) {
            // Keep last valid preview, just skip this update
            return
          }

          // Validate maximum chunks (5)
          const spannedChunks = findSpannedChunks(newStartOffset, newEndOffset, chunks)
          if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
            // Keep last valid preview, just skip this update
            console.warn('[useAnnotationResize] Too many chunks:', spannedChunks.length)
            return
          }

          // Update resize state with new offsets
          setResizeState(prev => ({
            ...prev!,
            currentStartOffset: newStartOffset,
            currentEndOffset: newEndOffset,
            text: offsetResult.selectedText,
          }))

          // Update preview overlay to show new boundary
          updatePreviewOverlay(newStartOffset, newEndOffset)

        } catch (error) {
          console.error('[useAnnotationResize] Offset calculation error:', {
            error,
            edge: resizeState.edge,
            mousePos: { x: e.clientX, y: e.clientY },
            initialRange: {
              start: resizeState.initialStartOffset,
              end: resizeState.initialEndOffset
            }
          })
          // Keep last valid preview on error, just skip this update
        }
      })
    }

    // Capture phase + passive: false for maximum control
    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true)

      // Cancel any pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      annotationSpans.forEach(span => span.classList.remove('resizing-active'))
      // CRITICAL: Remove all preview overlays when effect cleans up
      document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())
    }
  }, [isResizing, chunks, updatePreviewOverlay]) // Removed resizeState to prevent flashing on every update

  /**
   * Handle mouseup to complete resize and save.
   * This is where we do expensive text extraction and validation.
   */
  useEffect(() => {
    if (!isResizing) return

    const handleMouseUp = async () => {
      if (!resizeState) return

      try {
        // Final validation
        const newStartOffset = resizeState.currentStartOffset
        const newEndOffset = resizeState.currentEndOffset
        const length = newEndOffset - newStartOffset

        if (length < 3) {
          console.error('[useAnnotationResize] Annotation too short:', length)
          return
        }

        const spannedChunks = findSpannedChunks(newStartOffset, newEndOffset, chunks)
        if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
          console.error('[useAnnotationResize] Too many chunks:', spannedChunks.length)
          return
        }

        // NOW extract text (expensive operation, only once at the end)
        // Use cached blocks if available, otherwise query DOM
        const blocks = blockCacheRef.current ||
          Array.from(document.querySelectorAll('[data-start-offset]')).map(blockEl => {
            const block = blockEl as HTMLElement
            return {
              element: block,
              startOffset: parseInt(block.dataset.startOffset || '0', 10),
              endOffset: parseInt(block.dataset.endOffset || '0', 10),
              textContent: block.textContent || '',
            }
          })

        let extractedText = ''

        for (const blockData of blocks) {
          const { startOffset: blockStart, endOffset: blockEnd, textContent: blockText } = blockData

          // Check if this block overlaps with annotation
          if (newStartOffset < blockEnd && newEndOffset > blockStart) {
            const relativeStart = Math.max(0, newStartOffset - blockStart)
            const relativeEnd = Math.min(blockText.length, newEndOffset - blockStart)
            extractedText += blockText.substring(relativeStart, relativeEnd)
          }
        }

        // Validate we extracted text
        if (!extractedText || extractedText.length < 3) {
          console.error('[useAnnotationResize] No text extracted')
          return
        }

        // Call save callback (this triggers Server Action and revalidation)
        await onResizeComplete(resizeState.annotationId, {
          startOffset: newStartOffset,
          endOffset: newEndOffset,
          text: extractedText,
        })

        // Wait a bit for React to revalidate and re-render with new annotation data
        // This prevents the preview from being removed before the new highlight appears
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (error) {
        console.error('[useAnnotationResize] Save failed:', error)
      } finally {
        // Cleanup
        setIsResizing(false)
        setResizeState(null)
        document.body.style.cursor = ''
        document.body.classList.remove('annotation-resizing')

        // Remove preview overlay
        document.querySelectorAll('.annotation-resize-preview').forEach(el => el.remove())

        // Remove visual feedback from all annotation spans
        if (resizeState) {
          const annotationSpans = document.querySelectorAll(`[data-annotation-id="${resizeState.annotationId}"]`)
          annotationSpans.forEach(span => span.classList.remove('resizing-active'))
        }
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [isResizing, resizeState, chunks, onResizeComplete])

  return {
    isResizing,
    resizeState,
  }
}
