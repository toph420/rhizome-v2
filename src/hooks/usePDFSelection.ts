'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getPdfSelectionRects } from '@/lib/python/pymupdf-selection'

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
  // Phase 1.5: Track if using precise PyMuPDF rectangles
  isPrecise?: boolean
  pymupdfMethod?: string
}

interface UsePDFSelectionOptions {
  enabled?: boolean
  pageNumber: number
  scale?: number  // Current PDF scale for coordinate conversion
  documentId?: string  // Phase 1.5: Required for PyMuPDF precision
}

export function usePDFSelection({
  enabled = true,
  pageNumber,
  scale = 1.0,
  documentId,
}: UsePDFSelectionOptions) {
  const [selection, setSelection] = useState<PDFSelection | null>(null)
  const [longPressActive, setLongPressActive] = useState(false)
  const [isEnhancing, setIsEnhancing] = useState(false)  // Track PyMuPDF enhancement
  const lastEnhancedTextRef = useRef<string | null>(null)  // Track last enhanced text to prevent loops
  const enhancementTimeoutRef = useRef<NodeJS.Timeout | null>(null)  // Debounce timer

  useEffect(() => {
    if (!enabled) return

    async function handleSelectionChange() {
      const browserSelection = window.getSelection()
      const selectedText = browserSelection?.toString().trim()

      if (!selectedText || selectedText.length === 0) {
        // Cancel any pending enhancement
        if (enhancementTimeoutRef.current) {
          clearTimeout(enhancementTimeoutRef.current)
          enhancementTimeoutRef.current = null
        }

        setSelection(null)
        setIsEnhancing(false)
        lastEnhancedTextRef.current = null
        return
      }

      // CRITICAL: Prevent infinite loop - don't re-enhance the same text
      if (lastEnhancedTextRef.current === selectedText) {
        console.log('[usePDFSelection] Skipping re-enhancement of same text')
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

      // FALLBACK: Convert client rects to PDF coordinates (screen coords - imprecise)
      const screenPdfRects = Array.from(clientRects)
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

      const screenPdfRect = {
        x: relativeX / scale,
        y: relativeY / scale,
        width: boundingRect.width / scale,
        height: boundingRect.height / scale,
        pageNumber,
      }

      // Set initial selection with screen coordinates (immediate feedback)
      setSelection({
        text: selectedText,
        pageNumber,
        rect: boundingRect,
        pdfRects: screenPdfRects,
        pdfRect: screenPdfRect,
        isPrecise: false,  // Mark as imprecise
      })

      // PHASE 1.5: Enhance with PyMuPDF word-level precision (if documentId provided)
      // DEBOUNCED: Wait 300ms for selection to stabilize before enhancing
      if (documentId && selectedText.length > 0) {
        // Clear any pending enhancement
        if (enhancementTimeoutRef.current) {
          clearTimeout(enhancementTimeoutRef.current)
        }

        // Schedule enhancement after debounce delay
        enhancementTimeoutRef.current = setTimeout(async () => {
          console.log('[usePDFSelection] Enhancing selection with PyMuPDF...')
          setIsEnhancing(true)

          try {
            const pymupdfResult = await getPdfSelectionRects(documentId, pageNumber, selectedText)

          if (pymupdfResult.found && pymupdfResult.rects.length > 0) {
            // Replace screen coords with precise word-level rectangles
            const precisePdfRects = pymupdfResult.rects.map(rect => ({
              ...rect,
              pageNumber,
            }))

            // Create bounding rect from precise rects (for backward compatibility)
            const minX = Math.min(...precisePdfRects.map(r => r.x))
            const minY = Math.min(...precisePdfRects.map(r => r.y))
            const maxX = Math.max(...precisePdfRects.map(r => r.x + r.width))
            const maxY = Math.max(...precisePdfRects.map(r => r.y + r.height))

            const precisePdfRect = {
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
              pageNumber,
            }

            console.log('[usePDFSelection] ✅ Enhanced with PyMuPDF:', {
              method: pymupdfResult.method,
              rectsCount: precisePdfRects.length,
              similarity: pymupdfResult.similarity,
            })

            // Update selection with precise coordinates
            setSelection({
              text: selectedText,
              pageNumber,
              rect: boundingRect,  // Keep DOM rect for UI positioning
              pdfRects: precisePdfRects,  // PRECISE word-level rectangles
              pdfRect: precisePdfRect,
              isPrecise: true,  // Mark as precise
              pymupdfMethod: pymupdfResult.method,
            })

            // Mark this text as enhanced to prevent re-enhancement
            lastEnhancedTextRef.current = selectedText
          } else {
            console.log('[usePDFSelection] ⚠️ PyMuPDF found no match, using screen coords')
            // Keep screen coords (already set above)
            lastEnhancedTextRef.current = selectedText  // Still mark as processed
          }
        } catch (error) {
          console.error('[usePDFSelection] PyMuPDF enhancement failed:', error)
          // Keep screen coords (already set above)
          lastEnhancedTextRef.current = selectedText  // Still mark as processed
        } finally {
          setIsEnhancing(false)
        }
      }, 300) // 300ms debounce delay
      }
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

    // Note: handleSelectionChange is now async
    const handleSelectionChangeSync = () => {
      handleSelectionChange().catch(error => {
        console.error('[usePDFSelection] Selection handler error:', error)
      })
    }

    document.addEventListener('selectionchange', handleSelectionChangeSync)
    document.addEventListener('touchstart', handleTouchStart)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChangeSync)
      document.removeEventListener('touchstart', handleTouchStart)

      // Clean up pending enhancement
      if (enhancementTimeoutRef.current) {
        clearTimeout(enhancementTimeoutRef.current)
      }
    }
  }, [enabled, pageNumber, scale, documentId])

  const clearSelection = useCallback(() => {
    // Cancel any pending enhancement
    if (enhancementTimeoutRef.current) {
      clearTimeout(enhancementTimeoutRef.current)
      enhancementTimeoutRef.current = null
    }

    window.getSelection()?.removeAllRanges()
    setSelection(null)
    setIsEnhancing(false)
    lastEnhancedTextRef.current = null  // Reset enhancement tracking
  }, [])

  return { selection, clearSelection, longPressActive, isEnhancing }
}
