import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'
import type { VirtuosoHandle } from 'react-virtuoso'

const AUTOSCROLL_THRESHOLD = 100 // pixels from viewport edge
const AUTOSCROLL_SPEED = 10 // pixels per frame

// Performance monitoring interface
interface PerformanceMetrics {
  autoscrollFrameTimes: number[]
  offsetCalculationTimes: number[]
}

export function useGlobalResizeHandler(
  virtuosoRef: React.RefObject<VirtuosoHandle | null>,
  onResizeComplete: (annotationId: string, newRange: { startOffset: number; endOffset: number; text: string }) => Promise<void>
) {
  const isResizing = useAnnotationResizeStore((s) => s.isResizing)
  const annotationId = useAnnotationResizeStore((s) => s.annotationId)
  const edge = useAnnotationResizeStore((s) => s.edge)
  const updateResize = useAnnotationResizeStore((s) => s.updateResize)
  const cancelResize = useAnnotationResizeStore((s) => s.cancelResize)
  const completeResize = useAnnotationResizeStore((s) => s.completeResize)
  const currentStartOffset = useAnnotationResizeStore((s) => s.currentStartOffset)
  const currentEndOffset = useAnnotationResizeStore((s) => s.currentEndOffset)

  const autoscrollIntervalRef = useRef<number | null>(null)
  const performanceMetrics = useRef<PerformanceMetrics>({
    autoscrollFrameTimes: [],
    offsetCalculationTimes: [],
  })

  // Mousemove handler - calculates offset from mouse position
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()

      // Performance monitoring: Track offset calculation time
      const startTime = performance.now()
      const offset = getOffsetFromPoint(e.clientX, e.clientY)
      const calcTime = performance.now() - startTime

      performanceMetrics.current.offsetCalculationTimes.push(calcTime)

      // Log warning if calculation exceeds 5ms target
      if (calcTime > 5) {
        console.warn(`[perf] Offset calculation slow: ${calcTime.toFixed(2)}ms`)
      }

      if (offset === null) return

      // Update resize state
      if (edge === 'start') {
        updateResize(offset, currentEndOffset)
      } else {
        updateResize(currentStartOffset, offset)
      }

      // Check if near viewport edge - trigger autoscroll
      const viewportHeight = window.innerHeight
      const mouseY = e.clientY

      if (mouseY < AUTOSCROLL_THRESHOLD) {
        startAutoscroll('up')
      } else if (mouseY > viewportHeight - AUTOSCROLL_THRESHOLD) {
        startAutoscroll('down')
      } else {
        stopAutoscroll()
      }
    }

    document.addEventListener('mousemove', handleMouseMove, { capture: true, passive: false })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove, true)
      stopAutoscroll()
    }
  }, [isResizing, edge, currentStartOffset, currentEndOffset, updateResize])

  // Mouseup handler - saves resize
  useEffect(() => {
    if (!isResizing) return

    const handleMouseUp = async () => {
      if (!annotationId) return

      stopAutoscroll()

      try {
        // Extract text from DOM blocks
        const blocks = document.querySelectorAll('[data-start-offset]')
        let extractedText = ''

        for (const blockEl of Array.from(blocks)) {
          const block = blockEl as HTMLElement
          const blockStart = parseInt(block.dataset.startOffset || '0', 10)
          const blockEnd = parseInt(block.dataset.endOffset || '0', 10)
          const blockText = block.textContent || ''

          // Check if this block overlaps with annotation
          if (currentStartOffset < blockEnd && currentEndOffset > blockStart) {
            const relativeStart = Math.max(0, currentStartOffset - blockStart)
            const relativeEnd = Math.min(blockText.length, currentEndOffset - blockStart)
            extractedText += blockText.substring(relativeStart, relativeEnd)
          }
        }

        if (!extractedText || extractedText.length < 3) {
          console.error('[resize] No text extracted')
          cancelResize()
          return
        }

        // CRITICAL: Clear resize state BEFORE reloading annotations
        // This ensures preview overlay stops and DOM is clean before new annotations render
        completeResize()

        // Small delay to let React cleanup run before fetching new annotations
        await new Promise(resolve => setTimeout(resolve, 50))

        await onResizeComplete(annotationId, {
          startOffset: currentStartOffset,
          endOffset: currentEndOffset,
          text: extractedText,
        })
      } catch (error) {
        console.error('[resize] Save failed:', error)
        toast.error('Failed to save annotation resize')
        cancelResize()
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [isResizing, annotationId, currentStartOffset, currentEndOffset, onResizeComplete, completeResize, cancelResize])

  // Escape to cancel
  useEffect(() => {
    if (!isResizing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelResize()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isResizing, cancelResize])

  // Autoscroll implementation with performance tracking
  function startAutoscroll(direction: 'up' | 'down') {
    if (autoscrollIntervalRef.current) return // Already scrolling

    autoscrollIntervalRef.current = window.setInterval(() => {
      const frameStart = performance.now()

      if (!virtuosoRef.current) return

      virtuosoRef.current.getState((state) => {
        const scrollTop = state.scrollTop || 0
        const newScrollTop =
          direction === 'up' ? scrollTop - AUTOSCROLL_SPEED : scrollTop + AUTOSCROLL_SPEED

        virtuosoRef.current?.scrollTo({
          top: newScrollTop,
          behavior: 'auto',
        })
      })

      const frameTime = performance.now() - frameStart
      performanceMetrics.current.autoscrollFrameTimes.push(frameTime)

      // Warn if exceeding 16ms (60fps threshold)
      if (frameTime > 16) {
        console.warn(`[perf] Autoscroll frame slow: ${frameTime.toFixed(2)}ms`)
      }
    }, 16) // ~60fps
  }

  function stopAutoscroll() {
    if (autoscrollIntervalRef.current) {
      clearInterval(autoscrollIntervalRef.current)
      autoscrollIntervalRef.current = null
    }
  }
}

function getOffsetFromPoint(x: number, y: number): number | null {
  const range = getCaretRangeFromPoint(x, y)
  if (!range) return null

  let node: Node | null = range.startContainer
  while (node && node.nodeType !== Node.ELEMENT_NODE) {
    node = node.parentNode
  }

  let blockEl = node as HTMLElement | null
  while (blockEl && !blockEl.dataset.startOffset) {
    blockEl = blockEl.parentElement
  }

  if (!blockEl) return null

  const blockStart = parseInt(blockEl.dataset.startOffset || '0', 10)
  const relativeOffset = getRelativeOffsetInBlock(range, blockEl)

  return blockStart + relativeOffset
}

function getRelativeOffsetInBlock(range: Range, blockEl: HTMLElement): number {
  let offset = 0

  function walk(node: Node): boolean {
    if (node === range.startContainer) {
      offset += range.startOffset
      return true
    }

    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length || 0
    }

    for (const child of node.childNodes) {
      if (walk(child)) return true
    }

    return false
  }

  walk(blockEl)
  return offset
}

function getCaretRangeFromPoint(x: number, y: number): Range | null {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y)
    if (!position) return null
    const range = document.createRange()
    range.setStart(position.offsetNode, position.offset)
    range.collapse(true)
    return range
  }

  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y)
  }

  return null
}
