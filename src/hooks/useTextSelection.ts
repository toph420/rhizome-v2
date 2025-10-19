/**
 * UseTextSelection Hook.
 *
 * Tracks text selection state with debouncing for performance.
 * Calculates markdown offsets and captures DOMRect for UI positioning.
 * @module useTextSelection
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateMultiBlockOffsets } from '@/lib/reader/offset-calculator'
import { findSpannedChunks } from '@/lib/reader/chunk-utils'
import type { Chunk } from '@/types/annotations'

/**
 * Text selection state with positioning data.
 */
export interface TextSelectionState {
  text: string
  rect: DOMRect
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[] // Multi-chunk support
  }
}

/**
 * Hook options for configuration.
 */
interface UseTextSelectionOptions {
  /** Debounce delay in milliseconds (default: 100ms). */
  debounceMs?: number
  /** Available chunks for multi-chunk support. */
  chunks?: Chunk[]
  /** Enable/disable selection tracking. */
  enabled?: boolean
}

/**
 * Hook return value with selection state and controls.
 */
interface UseTextSelectionReturn {
  selection: TextSelectionState | null
  clearSelection: () => void
  isSelecting: boolean
}

/**
 * Tracks text selection with debouncing and offset calculation.
 *
 * Features:
 * - 100ms debouncing to prevent excessive recalculation
 * - DOMRect capture for near-selection UI positioning
 * - Multi-chunk selection support via ChunkRef
 * - Automatic cleanup on unmount
 * - Word boundary snapping for clean selections.
 * @param options - Configuration options.
 * @returns Selection state, clear function, and selecting flag.
 * @example
 * ```tsx
 * function DocumentReader({ chunks }) {
 *   const { selection, clearSelection } = useTextSelection({ chunks })
 *
 *   return (
 *     <>
 *       <div>Document content...</div>
 *       {selection && (
 *         <QuickCapture
 *           selection={selection}
 *           onClose={clearSelection}
 *         />
 *       )}
 *     </>
 *   )
 * }
 * ```
 */
export function useTextSelection(
  options: UseTextSelectionOptions = {}
): UseTextSelectionReturn {
  const {
    debounceMs = 100,
    chunks = [],
    enabled = true,
  } = options

  const [selection, setSelection] = useState<TextSelectionState | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const preservedSelectionRef = useRef<{ startOffset: number; endOffset: number; text: string } | null>(null)

  /**
   * Process current selection and update state.
   * Supports multi-block selections (e.g., paragraph 1 → paragraph 3).
   */
  const processSelection = useCallback(() => {
    try {
      const windowSelection = window.getSelection()

      // Clear if no selection or collapsed
      if (!windowSelection || windowSelection.rangeCount === 0 || windowSelection.isCollapsed) {
        setSelection(null)
        setIsSelecting(false)
        return
      }

      const range = windowSelection.getRangeAt(0)
      const selectedText = windowSelection.toString().trim()

      // Ignore empty selections
      if (selectedText.length === 0) {
        setSelection(null)
        setIsSelecting(false)
        return
      }

      // Calculate markdown offsets using multi-block approach
      // This handles selections spanning multiple blocks independently
      // Word snapping trims leading/trailing whitespace for clean selections
      let offsetResult
      try {
        offsetResult = calculateMultiBlockOffsets(range, true) // Re-enabled snapping
      } catch (error) {
        console.warn('[useTextSelection] Selection not within valid blocks:', error)
        setSelection(null)
        setIsSelecting(false)
        return
      }

      // Get DOMRect for QuickCapture positioning
      const rect = range.getBoundingClientRect()

      // Find all chunks overlapping [startOffset, endOffset]
      let chunkIds: string[] = []
      if (chunks.length > 0) {
        try {
          const spannedChunks = findSpannedChunks(
            offsetResult.startOffset,
            offsetResult.endOffset,
            chunks
          )
          chunkIds = spannedChunks.map(ch => ch.id)

          if (chunkIds.length === 0) {
            console.warn('[useTextSelection] No chunks found for offset range')
          } else if (chunkIds.length > 1) {
            console.log(`[useTextSelection] Multi-chunk selection: ${chunkIds.length} chunks`)
          }
        } catch (error) {
          console.error('[useTextSelection] Failed to find spanned chunks:', error)
          // Don't fail - allow selection without chunk mapping
          chunkIds = []
        }
      }

      // Update selection state
      setSelection({
        text: offsetResult.selectedText,
        rect,
        range: {
          startOffset: offsetResult.startOffset,
          endOffset: offsetResult.endOffset,
          chunkIds,
        },
      })
      setIsSelecting(false)
    } catch (error) {
      console.error('[useTextSelection] Error processing selection:', error)
      setSelection(null)
      setIsSelecting(false)
    }
  }, [chunks])

  /**
   * Clear selection state and DOM selection.
   */
  const clearSelection = useCallback(() => {
    setSelection(null)
    setIsSelecting(false)

    // Clear DOM selection
    const windowSelection = window.getSelection()
    if (windowSelection) {
      windowSelection.removeAllRanges()
    }

    // Clear any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
  }, [])

  /**
   * Handle selection events with debouncing.
   */
  useEffect(() => {
    if (!enabled) return

    function handleSelectionChange() {
      setIsSelecting(true)

      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }

      // Debounce processing
      debounceTimeoutRef.current = setTimeout(() => {
        processSelection()
      }, debounceMs)
    }

    // Listen for mouseup (primary selection method)
    document.addEventListener('mouseup', handleSelectionChange)

    // Listen for keyup (keyboard selection)
    document.addEventListener('keyup', handleSelectionChange)

    // Cleanup
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('keyup', handleSelectionChange)

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [enabled, debounceMs, processSelection])

  return {
    selection,
    clearSelection,
    isSelecting,
  }
}
