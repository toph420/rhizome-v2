import { useEffect } from 'react'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'

export function useResizePreviewOverlay() {
  const isResizing = useAnnotationResizeStore((s) => s.isResizing)
  const currentStartOffset = useAnnotationResizeStore((s) => s.currentStartOffset)
  const currentEndOffset = useAnnotationResizeStore((s) => s.currentEndOffset)

  useEffect(() => {
    if (!isResizing) {
      document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())
      return
    }

    let rafId: number | null = null
    let pendingUpdate = false
    let scrollDebounceTimeout: number | null = null

    const updatePreview = () => {
      if (pendingUpdate) return

      pendingUpdate = true
      rafId = requestAnimationFrame(() => {
        pendingUpdate = false
        updatePreviewOverlay(currentStartOffset, currentEndOffset)
      })
    }

    // Debounced scroll handler to prevent excessive updates during rapid scrolling
    const debouncedScrollUpdate = () => {
      if (scrollDebounceTimeout) clearTimeout(scrollDebounceTimeout)

      scrollDebounceTimeout = window.setTimeout(() => {
        updatePreview()
      }, 50) // 50ms debounce
    }

    updatePreview()

    const scrollContainer = document.querySelector('.virtuoso-scroller') ||
                            document.querySelector('[data-virtuoso-scroller]')
    scrollContainer?.addEventListener('scroll', debouncedScrollUpdate, { passive: true })

    return () => {
      scrollContainer?.removeEventListener('scroll', debouncedScrollUpdate)
      if (scrollDebounceTimeout) clearTimeout(scrollDebounceTimeout)
      if (rafId) cancelAnimationFrame(rafId)
      document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())
    }
  }, [isResizing, currentStartOffset, currentEndOffset])
}

function updatePreviewOverlay(startOffset: number, endOffset: number) {
  document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())

  const visibleBlocks = document.querySelectorAll('[data-start-offset]')

  for (const blockEl of Array.from(visibleBlocks)) {
    const block = blockEl as HTMLElement
    const blockStart = parseInt(block.dataset.startOffset || '0', 10)
    const blockEnd = parseInt(block.dataset.endOffset || '0', 10)

    if (startOffset < blockEnd && endOffset > blockStart) {
      const relativeStart = Math.max(0, startOffset - blockStart)
      const relativeEnd = Math.min(endOffset - blockStart, block.textContent?.length || 0)

      try {
        const range = createRangeInBlock(block, relativeStart, relativeEnd)
        if (!range) continue

        const rects = range.getClientRects()

        for (const rect of Array.from(rects)) {
          if (rect.width === 0 || rect.height === 0) continue

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
      } catch (err) {
        console.warn('[preview] Failed to create range:', err)
      }
    }
  }
}

function createRangeInBlock(blockEl: HTMLElement, startOffset: number, endOffset: number): Range | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT, null)

  let currentOffset = 0
  let startNode: Node | null = null
  let startNodeOffset = 0
  let endNode: Node | null = null
  let endNodeOffset = 0

  while (walker.nextNode()) {
    const textNode = walker.currentNode
    const textLength = textNode.textContent?.length || 0

    if (!startNode && currentOffset + textLength > startOffset) {
      startNode = textNode
      startNodeOffset = startOffset - currentOffset
    }

    if (currentOffset + textLength >= endOffset) {
      endNode = textNode
      endNodeOffset = endOffset - currentOffset
      break
    }

    currentOffset += textLength
  }

  if (!startNode || !endNode) return null

  range.setStart(startNode, startNodeOffset)
  range.setEnd(endNode, endNodeOffset)

  return range
}
