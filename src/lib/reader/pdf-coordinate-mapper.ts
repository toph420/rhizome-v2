/**
 * PDF Coordinate Mapper - Markdown → PDF Coordinate Conversion
 *
 * Strategy: Fallback chain for optimal accuracy/performance balance
 * 1. PyMuPDF text search (95% accuracy, 50ms) ← PRIMARY
 * 2. Bbox proportional filtering (70-85% accuracy, instant) ← FALLBACK
 * 3. Page-only positioning (50% accuracy, instant) ← LAST RESORT
 *
 * @see thoughts/plans/2025-10-29_pdf-annotation-coordinate-mapping-and-selection-ux.md
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { findTextInPdfWithPyMuPDF } from '@/lib/python/pymupdf'
import type { Chunk } from '@/types/annotations'

/**
 * Docling chunk structure from cached_chunks table.
 * Contains provenance data (bboxes, charspan) from original extraction.
 */
export interface DoclingChunk {
  content: string
  meta: {
    page_start?: number
    page_end?: number
    charspan?: [number, number]  // Character range in cleaned markdown
    bboxes?: Array<{
      page: number
      l: number  // left
      t: number  // top
      r: number  // right
      b: number  // bottom
    }>
  }
}

/**
 * PDF rectangle for annotation highlighting.
 * Matches the structure used by PDFViewer component.
 */
export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Result from PDF coordinate calculation.
 * Includes confidence scoring and graceful degradation.
 */
export interface PdfCoordinateResult {
  found: boolean
  pageNumber?: number
  rects?: PdfRect[]
  method?: 'pymupdf' | 'bbox_proportional' | 'page_only'
  confidence?: number
}

/**
 * Calculate PDF coordinates from markdown offsets using PyMuPDF text search.
 *
 * Fallback chain:
 * 1. Try PyMuPDF search (95% accuracy)
 * 2. Fallback to bbox proportional filtering (70-85%)
 * 3. Last resort: page-only positioning (50%)
 */
export async function calculatePdfCoordinatesFromDocling(
  documentId: string,
  markdownOffset: number,
  markdownLength: number,
  chunks: Chunk[]
): Promise<PdfCoordinateResult> {

  // Step 1: Find chunk containing annotation
  const containingChunk = chunks.find(c =>
    markdownOffset >= c.start_offset &&
    markdownOffset < c.end_offset
  )

  if (!containingChunk?.page_start) {
    console.warn('[PdfCoordinateMapper] No chunk found for offset', markdownOffset)
    return { found: false }
  }

  const pageNumber = containingChunk.page_start

  // Step 2: Get highlighted text from document
  const supabase = createAdminClient()

  // Get document to find storage path
  const { data: doc, error } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()

  if (error || !doc?.storage_path) {
    console.error('[PdfCoordinateMapper] Error fetching document:', error)
    return await fallbackToBboxProportional(containingChunk, markdownOffset, markdownLength, pageNumber, documentId)
  }

  // Get markdown content from Storage using full storage path
  const { data: contentBlob, error: storageError } = await supabase.storage
    .from('documents')
    .download(`${doc.storage_path}/content.md`)

  if (storageError || !contentBlob) {
    console.error('[PdfCoordinateMapper] Error fetching content.md:', storageError)
    return await fallbackToBboxProportional(containingChunk, markdownOffset, markdownLength, pageNumber, documentId)
  }

  const content = await contentBlob.text()
  const highlightedText = content.slice(markdownOffset, markdownOffset + markdownLength)

  console.log('[PdfCoordinateMapper] Searching for text:', {
    text: highlightedText.substring(0, 50) + '...',
    length: highlightedText.length,
    pageNumber
  })

  // Step 3: PRIMARY APPROACH - PyMuPDF text search (95% accuracy)
  try {
    const pymupdfResult = await findTextInPdfWithPyMuPDF(
      documentId,
      pageNumber,
      highlightedText
    )

    if (pymupdfResult.found && pymupdfResult.rects.length > 0) {
      // Merge adjacent rectangles for cleaner highlighting
      const mergedRects = mergeAdjacentRects(pymupdfResult.rects)

      console.log('[PdfCoordinateMapper] PyMuPDF SUCCESS:', {
        method: 'pymupdf',
        confidence: 0.95,
        rectsBeforeMerge: pymupdfResult.rects.length,
        rectsAfterMerge: mergedRects.length
      })

      return {
        found: true,
        pageNumber,
        rects: mergedRects,
        method: 'pymupdf',
        confidence: 0.95
      }
    }

    console.log('[PdfCoordinateMapper] PyMuPDF found no matches, falling back to bbox')

  } catch (error) {
    console.error('[PdfCoordinateMapper] PyMuPDF error, falling back to bbox:', error)
  }

  // Step 4: FALLBACK 1 - Bbox proportional filtering (70-85% accuracy)
  return await fallbackToBboxProportional(containingChunk, markdownOffset, markdownLength, pageNumber, documentId)
}

/**
 * Fallback to bbox proportional filtering when PyMuPDF fails.
 */
async function fallbackToBboxProportional(
  chunk: Chunk,
  markdownOffset: number,
  markdownLength: number,
  pageNumber: number,
  documentId: string
): Promise<PdfCoordinateResult> {

  // Check if chunk has bboxes
  if (!chunk.bboxes || chunk.bboxes.length === 0) {
    console.warn('[PdfCoordinateMapper] No bboxes available, page-only fallback')
    return {
      found: true,
      pageNumber,
      method: 'page_only',
      confidence: 0.5
    }
  }

  // Calculate relative position within chunk
  const chunkLength = chunk.end_offset - chunk.start_offset
  const annotationStart = markdownOffset - chunk.start_offset
  const annotationEnd = annotationStart + markdownLength

  // Calculate proportional positions (0.0 to 1.0)
  const startRatio = annotationStart / chunkLength
  const endRatio = annotationEnd / chunkLength

  console.log('[PdfCoordinateMapper] Bbox proportional mapping:', {
    startRatio: startRatio.toFixed(3),
    endRatio: endRatio.toFixed(3),
    totalBboxes: chunk.bboxes.length
  })

  // Filter bboxes proportionally
  const totalBboxes = chunk.bboxes.length
  const startIdx = Math.floor(startRatio * totalBboxes)
  const endIdx = Math.ceil(endRatio * totalBboxes)

  // Clamp to valid range
  const safeStartIdx = Math.max(0, Math.min(startIdx, totalBboxes - 1))
  const safeEndIdx = Math.max(safeStartIdx + 1, Math.min(endIdx, totalBboxes))

  const filteredBboxes = chunk.bboxes.slice(safeStartIdx, safeEndIdx)

  if (filteredBboxes.length === 0) {
    console.warn('[PdfCoordinateMapper] No bboxes after filtering, page-only fallback')
    return {
      found: true,
      pageNumber,
      method: 'page_only',
      confidence: 0.5
    }
  }

  // Merge adjacent rectangles
  const mergedRects = mergeAdjacentRects(
    filteredBboxes.map(bbox => ({
      x: bbox.l,
      y: bbox.t,
      width: bbox.r - bbox.l,
      height: bbox.b - bbox.t
    }))
  )

  console.log('[PdfCoordinateMapper] Bbox proportional SUCCESS:', {
    method: 'bbox_proportional',
    confidence: 0.75,
    rectsBeforeMerge: filteredBboxes.length,
    rectsAfterMerge: mergedRects.length
  })

  return {
    found: true,
    pageNumber,
    rects: mergedRects,
    method: 'bbox_proportional',
    confidence: 0.75
  }
}

/**
 * Merge adjacent rectangles on same line for cleaner highlights.
 * Ported from PDFAnnotationOverlay.tsx mergeRectangles logic.
 */
function mergeAdjacentRects(rects: PdfRect[]): PdfRect[] {
  if (rects.length <= 1) return rects

  // Sort by Y (top to bottom), then X (left to right)
  const sorted = [...rects].sort((a, b) => {
    const yDiff = a.y - b.y
    if (Math.abs(yDiff) > 2) return yDiff  // Different lines (2px tolerance)
    return a.x - b.x  // Same line, sort left to right
  })

  const merged: PdfRect[] = []
  let current = { ...sorted[0] }

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]

    // Check if on same line (Y position + height similar)
    const sameLine = Math.abs(current.y - next.y) < 2 &&
                     Math.abs(current.height - next.height) < 2

    // Check if horizontally adjacent (gap < 5px)
    const currentRight = current.x + current.width
    const gap = next.x - currentRight
    const adjacent = gap < 5 && gap > -5

    if (sameLine && adjacent) {
      // Merge by extending width
      current.width = (next.x + next.width) - current.x
    } else {
      // Different line or not adjacent
      merged.push(current)
      current = { ...next }
    }
  }

  merged.push(current)
  return merged
}
