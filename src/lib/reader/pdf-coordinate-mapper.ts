/**
 * PDF Coordinate Mapper - Markdown → PDF Coordinate Conversion
 *
 * Maps markdown text selections to PDF bounding boxes using cached Docling provenance.
 * Enables bidirectional annotation sync without re-parsing PDFs.
 *
 * Architecture:
 * 1. Find chunk containing markdown offset
 * 2. Load Docling chunks from cached_chunks table
 * 3. Find overlapping Docling chunks by charspan
 * 4. Extract and aggregate bboxes
 * 5. Calculate precise positioning with character ratios
 *
 * @see thoughts/plans/2025-10-27_pdf-annotation-sync.md - Phase 2
 */

import { createClient } from '@/lib/supabase/server'
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
  method?: 'docling_bbox' | 'page_only'
  confidence?: number
}

/**
 * Calculate PDF coordinates from markdown offsets using Docling provenance.
 *
 * Strategy:
 * - Uses cached Docling chunks (no PDF re-parsing)
 * - Maps markdown offsets → charspan overlaps → bbox aggregation
 * - Graceful degradation: precise bbox → page-only → not found
 *
 * @param documentId - Document UUID
 * @param markdownOffset - Start offset in markdown content
 * @param markdownLength - Length of selected text
 * @param chunks - Chonkie chunks from database (have page numbers)
 * @returns PDF coordinate result with confidence scoring
 */
export async function calculatePdfCoordinatesFromDocling(
  documentId: string,
  markdownOffset: number,
  markdownLength: number,
  chunks: Chunk[]
): Promise<PdfCoordinateResult> {
  const supabase = await createClient()

  // Step 1: Find chunk containing markdown offset (already has pageNumber!)
  const containingChunk = chunks.find(c =>
    markdownOffset >= c.start_offset &&
    markdownOffset < c.end_offset
  )

  if (!containingChunk?.page_start) {
    return { found: false }
  }

  const pageNumber = containingChunk.page_start

  // STRATEGY: Use Chonkie chunks to find bboxes from cached_chunks
  // Chonkie chunks have start_offset/end_offset in SAME coordinate system as annotations
  // We use them to find which page number, then get ALL bboxes for that page

  const annotationStart = markdownOffset
  const annotationEnd = markdownOffset + markdownLength

  console.log('[PdfCoordinateMapper] Using Chonkie chunks for coordinate mapping:', {
    chunkCount: chunks.length,
    annotationRange: [annotationStart, annotationEnd],
    annotationLength: markdownLength,
    pageNumber,
  })

  // Step 2: Load Docling chunks from cached_chunks table (for bboxes)
  const { data, error } = await supabase
    .from('cached_chunks')
    .select('chunks')
    .eq('document_id', documentId)
    .single()

  if (error || !data?.chunks) {
    console.warn('[PdfCoordinateMapper] No cached chunks found:', error?.message)
    // Fallback: page-only positioning
    return {
      found: true,
      pageNumber,
      method: 'page_only',
      confidence: 0.5
    }
  }

  const doclingChunks = data.chunks as DoclingChunk[]

  // Step 3: Get ALL bboxes for this page from Docling chunks
  // Since we already know the page from containingChunk, just grab all bboxes on that page
  const pageBboxes = doclingChunks
    .flatMap(dc => dc.meta.bboxes || [])
    .filter(bbox => bbox.page === pageNumber)

  console.log('[PdfCoordinateMapper] Found bboxes for page', pageNumber, ':', pageBboxes.length)

  if (pageBboxes.length === 0) {
    console.warn('[PdfCoordinateMapper] No bboxes found for page', pageNumber)
    return {
      found: true,
      pageNumber,
      method: 'page_only',
      confidence: 0.5
    }
  }

  // Step 4: Return page-level highlighting (all bboxes on the page)
  // This is a page-level fallback - shows highlight exists on this page but not precise position
  // Better than nothing, allows user to see annotation exists in PDF view
  console.log('[PdfCoordinateMapper] Returning page-level bboxes (imprecise but visible)')
  return {
    found: true,
    pageNumber,
    rects: pageBboxes.map(bbox => ({
      x: bbox.l,
      y: bbox.t,
      width: bbox.r - bbox.l,
      height: bbox.b - bbox.t
    })),
    method: 'page_only', // Honest about precision level
    confidence: 0.3  // Low confidence - page-level only
  }
}
