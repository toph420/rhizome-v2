'use client'

import { useState, useEffect, useCallback } from 'react'

export interface PDFSelection {
  text: string
  pageNumber: number
  rect: DOMRect  // Bounding rect (for positioning UI elements)
  // PDF.js coordinates - support multiple rects for multi-line selections
  pdfRects: Array<{
    x: number
    y: number
    width: number
    height: number
    pageNumber: number
  }>
  // Legacy single rect (for backward compatibility)
  pdfRect: {
    x: number
    y: number
    width: number
    height: number
    pageNumber: number
  }
}

interface UsePDFSelectionOptions {
  enabled?: boolean
  pageNumber: number
  scale?: number  // Current PDF scale for coordinate conversion
}

export function usePDFSelection({
  enabled = true,
  pageNumber,
  scale = 1.0,
}: UsePDFSelectionOptions) {
  const [selection, setSelection] = useState<PDFSelection | null>(null)
  const [longPressActive, setLongPressActive] = useState(false)

  useEffect(() => {
    if (!enabled) return

    function handleSelectionChange() {
      const browserSelection = window.getSelection()
      const selectedText = browserSelection?.toString().trim()

      if (!selectedText || selectedText.length === 0) {
        setSelection(null)
        return
      }

      // Get selection rects (multiple for multi-line)
      const range = browserSelection!.getRangeAt(0)
      const clientRects = range.getClientRects()
      const boundingRect = range.getBoundingClientRect()

      // Find PDF page element to get viewport transform
      const pageElement = range.commonAncestorContainer.parentElement?.closest('.react-pdf__Page')

      if (!pageElement) {
        console.warn('[usePDFSelection] Could not find PDF page element')
        return
      }

      // Get page canvas to calculate PDF coordinates
      const canvas = pageElement.querySelector('canvas')
      if (!canvas) return

      const canvasRect = canvas.getBoundingClientRect()

      // Convert all client rects to PDF coordinates
      const pdfRects = Array.from(clientRects)
        .filter(rect => rect.width > 0 && rect.height > 0) // Filter out zero-size rects
        .map(rect => {
          const relativeX = rect.left - canvasRect.left
          const relativeY = rect.top - canvasRect.top

          return {
            x: relativeX / scale,
            y: relativeY / scale,
            width: rect.width / scale,
            height: rect.height / scale,
            pageNumber,
          }
        })

      // Also create bounding rect for backward compatibility
      const relativeX = boundingRect.left - canvasRect.left
      const relativeY = boundingRect.top - canvasRect.top

      const pdfRect = {
        x: relativeX / scale,
        y: relativeY / scale,
        width: boundingRect.width / scale,
        height: boundingRect.height / scale,
        pageNumber,
      }

      setSelection({
        text: selectedText,
        pageNumber,
        rect: boundingRect,
        pdfRects,
        pdfRect,
      })
    }

    // Mobile: Long-press detection
    function handleTouchStart(e: TouchEvent) {
      const timeout = setTimeout(() => {
        setLongPressActive(true)
        console.log('[usePDFSelection] Long-press detected - selection mode active')
      }, 500)

      function handleTouchEnd() {
        clearTimeout(timeout)
        setLongPressActive(false)
      }

      e.target?.addEventListener('touchend', handleTouchEnd, { once: true })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('touchstart', handleTouchStart)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('touchstart', handleTouchStart)
    }
  }, [enabled, pageNumber, scale])

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }, [])

  return { selection, clearSelection, longPressActive }
}
