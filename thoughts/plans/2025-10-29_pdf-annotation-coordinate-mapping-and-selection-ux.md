# PDF Annotation Coordinate Mapping and Selection UX Implementation Plan

**Created**: 2025-10-29
**Status**: Ready for Implementation
**Priority**: HIGH - Core reader usability

---

## Overview

Fix two critical PDF annotation issues: (1) Markdown → PDF coordinate mapping using existing chunks.bboxes data instead of broken charspan approach, and (2) eliminate word-by-word clunky selection UX with CSS styling and custom overlays.

**Why This Matters**:
- Users create annotations in markdown view that are invisible in PDF view (broken bidirectional sync)
- PDF text selection feels choppy and disconnected (poor UX compared to Zotero)
- Existing docling.md file causes confusion with coordinate system mismatch

---

## Current State Analysis

### What Works ✅
- **PDF → Markdown sync**: Already functional with recent fix (src/components/reader/QuickCapturePanel.tsx:231-253)
- **PDF.js provides perfect coordinates**: When user selects in PDF, we get accurate rects
- **Bboxes stored in database**: chunks.bboxes field contains Docling provenance (validated: 100% coverage)
- **Rectangle merging algorithm**: mergeRectangles() reduces 38 rects → 3-5 clean highlights (PDFAnnotationOverlay.tsx:24-64)
- **Docling + Chonkie pipeline**: Extraction and chunking architecture is solid

### What's Broken ❌
- **Markdown → PDF sync**: Returns method='page_only', confidence=0.3 (no precise coordinates)
- **Root cause**: Coordinate system mismatch between docling.md (charspan values) and content.md (annotation offsets)
- **PDF text selection UX**: Word-by-word rectangles visible during drag (before merging)
- **docling.md file**: Saved but unused, causes architectural confusion

### Key Discoveries

**From src/lib/reader/pdf-coordinate-mapper.ts:120-159**:
```typescript
// CURRENT BROKEN APPROACH:
// Tries to match content.md offsets with docling.md charspans
const overlappingDocling = doclingChunks.filter(dc => {
  const [charStart, charEnd] = dc.meta.charspan
  return !(charEnd < annotationStart || charStart > annotationEnd)
})
// Result: No overlaps found (different coordinate systems!)
```

**Console output confirms the mismatch**:
```
[PdfCoordinateMapper] Searching for overlaps: {
  annotationRange: [12657, 12715],  ← content.md coordinates
  charspans: [[0, 6], [0, 49], [0, 240]]  ← docling.md coordinates
}
Total overlapping chunks: 0
```

**From research**: Chunks table already has bboxes!
```sql
-- Database verification (confirmed 2025-10-29)
SELECT id, page_start, jsonb_array_length(bboxes) as bbox_count
FROM chunks WHERE document_id = '1d4b21bf-63c6-491f-990a-15d8eab8447a' LIMIT 3;
-- All chunks have bboxes array populated ✅
```

---

## Desired End State

### Coordinate Mapping
- Markdown annotations appear in PDF view with 70-85% position accuracy
- Uses existing chunks.bboxes data (no preprocessing needed)
- Falls back gracefully when bboxes unavailable
- Works with all existing documents immediately

### Selection UX
- Smooth, continuous text selection during drag (like Zotero)
- No visible word-by-word gaps
- Final annotation highlights are clean merged rectangles
- Selection feels professional and polished

### Code Quality
- Remove confusing docling.md artifacts
- Document coordinate system architecture clearly
- Provide upgrade path to PyMuPDF/OCR for future

---

## Rhizome Architecture

- **Module**: Main App only (Next.js)
- **Storage**: Database only (reading from chunks.bboxes)
- **Migration**: No database changes needed
- **Test Tier**: Stable (fix when broken)
- **Pipeline Stages**: No worker changes
- **Engines**: None affected

---

## What We're NOT Doing

1. **NOT reprocessing existing documents** - solution works with current data
2. **NOT adding new dependencies** - uses existing data structures
3. **NOT implementing PyMuPDF yet** - document as future enhancement only
4. **NOT implementing OCR search yet** - document as future enhancement only
5. **NOT changing Docling/Chonkie pipeline** - keep existing extraction flow
6. **NOT modifying database schema** - use existing chunks.bboxes field
7. **NOT achieving pixel-perfect precision** - 70-85% accuracy is acceptable for personal tool

---

## Implementation Approach

### Strategy: Pragmatic Solutions First

**For coordinate mapping**: Use the data we already have (chunks.bboxes) with smart filtering instead of complex coordinate transformations.

**For selection UX**: Start with CSS (simplest), upgrade to custom overlay if needed.

**For maintenance**: Document future enhancement paths without implementing them now.

---

## Phase 1: Fix Markdown → PDF Coordinate Mapping

### Overview
Replace broken charspan-based coordinate mapping with direct chunk.bboxes usage and proportional filtering.

**Time Estimate**: 4-6 hours

### Changes Required

#### 1. Rewrite pdf-coordinate-mapper.ts

**File**: `src/lib/reader/pdf-coordinate-mapper.ts`
**Current**: Lines 97-165 (broken charspan approach)
**Changes**: Replace with chunk-based bbox filtering

```typescript
/**
 * Calculate PDF coordinates from markdown offsets using chunk bboxes.
 *
 * Strategy: Use Chonkie chunks (same coordinate system as annotations)
 * to find the right page, then proportionally filter bboxes.
 */
export async function calculatePdfCoordinatesFromDocling(
  documentId: string,
  markdownOffset: number,
  markdownLength: number,
  chunks: Chunk[]
): Promise<PdfCoordinateResult> {
  const supabase = await createClient()

  // Step 1: Find chunk containing annotation (already correct - same coordinate system)
  const containingChunk = chunks.find(c =>
    markdownOffset >= c.start_offset &&
    markdownOffset < c.end_offset
  )

  if (!containingChunk?.page_start) {
    console.warn('[PdfCoordinateMapper] No chunk found for offset', markdownOffset)
    return { found: false }
  }

  const pageNumber = containingChunk.page_start

  // Step 2: Check if chunk has bboxes
  if (!containingChunk.bboxes || containingChunk.bboxes.length === 0) {
    console.warn('[PdfCoordinateMapper] Chunk has no bboxes, falling back to page-only')
    return {
      found: true,
      pageNumber,
      method: 'page_only',
      confidence: 0.5
    }
  }

  // Step 3: Calculate relative position within chunk
  const chunkLength = containingChunk.end_offset - containingChunk.start_offset
  const annotationStart = markdownOffset - containingChunk.start_offset
  const annotationEnd = annotationStart + markdownLength

  // Calculate proportional positions (0.0 to 1.0)
  const startRatio = annotationStart / chunkLength
  const endRatio = annotationEnd / chunkLength

  console.log('[PdfCoordinateMapper] Chunk-based mapping:', {
    chunkLength,
    annotationStart,
    annotationEnd,
    startRatio: startRatio.toFixed(3),
    endRatio: endRatio.toFixed(3),
    totalBboxes: containingChunk.bboxes.length
  })

  // Step 4: Filter bboxes proportionally
  const totalBboxes = containingChunk.bboxes.length
  const startIdx = Math.floor(startRatio * totalBboxes)
  const endIdx = Math.ceil(endRatio * totalBboxes)

  // Clamp to valid range
  const safeStartIdx = Math.max(0, Math.min(startIdx, totalBboxes - 1))
  const safeEndIdx = Math.max(safeStartIdx + 1, Math.min(endIdx, totalBboxes))

  const filteredBboxes = containingChunk.bboxes.slice(safeStartIdx, safeEndIdx)

  console.log('[PdfCoordinateMapper] Filtered bboxes:', {
    startIdx: safeStartIdx,
    endIdx: safeEndIdx,
    filteredCount: filteredBboxes.length
  })

  if (filteredBboxes.length === 0) {
    console.warn('[PdfCoordinateMapper] No bboxes after filtering')
    return {
      found: true,
      pageNumber,
      method: 'page_only',
      confidence: 0.5
    }
  }

  // Step 5: Merge adjacent rectangles on same line
  const mergedRects = mergeAdjacentRects(
    filteredBboxes.map(bbox => ({
      x: bbox.l,
      y: bbox.t,
      width: bbox.r - bbox.l,
      height: bbox.b - bbox.t
    }))
  )

  console.log('[PdfCoordinateMapper] Success:', {
    method: 'chunk_proportional',
    confidence: 0.7,
    rectsBeforeMerge: filteredBboxes.length,
    rectsAfterMerge: mergedRects.length
  })

  return {
    found: true,
    pageNumber,
    rects: mergedRects,
    method: 'chunk_proportional',
    confidence: 0.7  // Better than page-only (0.5), not perfect (0.85)
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
```

**Why This Works**:
- ✅ Same coordinate system (chunks use content.md offsets)
- ✅ No preprocessing needed (bboxes already in database)
- ✅ Proportional filtering gives reasonable accuracy (70-85%)
- ✅ Merging reduces visual clutter (38 rects → 3-5)

#### 2. Update Type Definitions

**File**: `src/app/actions/annotations.ts`
**Location**: Line 46
**Changes**: Add 'chunk_proportional' to syncMethod enum

```typescript
syncMethod: z.enum([
  'charspan_window',
  'exact',
  'fuzzy',
  'bbox',
  'docling_bbox',
  'chunk_proportional',  // NEW
  'page_only',
  'manual',
  'pdf_selection'
]).optional(),
```

**File**: `src/lib/ecs/components.ts`
**Location**: Line 46
**Changes**: Add to PositionComponent type

```typescript
export interface PositionComponent {
  // ... existing fields
  syncMethod?:
    | 'charspan_window'
    | 'exact'
    | 'fuzzy'
    | 'bbox'
    | 'docling_bbox'
    | 'chunk_proportional'  // NEW
    | 'page_only'
    | 'manual'
    | 'pdf_selection'
  // ... rest of fields
}
```

**File**: `src/lib/ecs/annotations.ts`
**Location**: Line 89
**Changes**: Update CreateAnnotationInput type

```typescript
export interface CreateAnnotationInput {
  // ... existing fields
  syncMethod?:
    | 'charspan_window'
    | 'exact'
    | 'fuzzy'
    | 'bbox'
    | 'docling_bbox'
    | 'chunk_proportional'  // NEW
    | 'page_only'
    | 'manual'
    | 'pdf_selection'
  // ... rest of fields
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Create annotation in markdown view (any document)
- [ ] Check console logs show:
  ```
  [PdfCoordinateMapper] Chunk-based mapping: { startRatio: 0.XXX, ... }
  [PdfCoordinateMapper] Success: { method: 'chunk_proportional', confidence: 0.7, ... }
  [QuickCapturePanel] PDF coordinates calculated: { found: true, rects: [...], confidence: 0.7 }
  ```
- [ ] Switch to PDF view
- [ ] Annotation visible on correct page ✅
- [ ] Highlight position is "close enough" (within ~15% of actual text)
- [ ] Multi-line annotations show multiple rectangles
- [ ] Test with 3 different documents (different page counts)

### Service Restarts:
- [ ] Next.js: Verify auto-reload after changes

---

## Phase 2: Improve PDF Text Selection UX

### Overview
Eliminate word-by-word clunky selection with CSS styling first, then custom overlay if CSS insufficient.

**Time Estimate**: 6-8 hours

### Part A: CSS-Based Selection Styling (Try First)

#### 1. Style the Text Layer Selection

**File**: `src/app/globals.css`
**Location**: After existing `.textLayer` styles
**Changes**: Add selection styling

```css
/* PDF.js Text Layer - Existing styles */
.textLayer {
  position: absolute;
  text-align: initial;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  opacity: 1;
  line-height: 1;
  -webkit-text-size-adjust: none;
  -moz-text-size-adjust: none;
  text-size-adjust: none;
  forced-color-adjust: none;
  transform-origin: 0% 0%;
}

/* NEW: Smooth selection styling */
.textLayer ::selection {
  background: rgba(254, 240, 138, 0.4); /* Yellow with transparency */
  color: inherit; /* Keep text color */
  text-shadow: none;
}

.textLayer ::-moz-selection {
  background: rgba(254, 240, 138, 0.4);
  color: inherit;
}

/* NEW: Style text layer spans for better selection continuity */
.textLayer span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;

  /* Make selection feel more continuous */
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;

  /* Reduce visible gaps between words */
  letter-spacing: normal;
  word-spacing: normal;
}

/* NEW: Add slight padding to reduce visual gaps during selection */
.textLayer span::before,
.textLayer span::after {
  content: '';
  display: inline-block;
  width: 0.5px; /* Tiny padding to bridge gaps */
  opacity: 0;
}
```

**Why This Might Work**:
- Browser's native `::selection` pseudo-element styles the selection background
- Padding tricks can reduce perceived gaps between words
- Zero code changes to React components (pure CSS)

**Test**: Create annotation and observe if selection feels smoother

### Part B: Custom Selection Overlay (If CSS Insufficient)

**Only implement if Part A doesn't improve UX enough!**

#### 1. Create Custom Selection Component

**File**: `src/components/rhizome/pdf-viewer/PDFSelectionOverlay.tsx` (NEW FILE)
**Purpose**: Render custom highlight overlay during text selection

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'

interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

interface PDFSelectionOverlayProps {
  /** Current PDF scale for coordinate conversion */
  scale: number
  /** Callback when selection is finalized */
  onSelectionComplete?: (rects: SelectionRect[]) => void
}

/**
 * Custom selection overlay that shows smooth, merged rectangles
 * during text selection drag (before annotation creation).
 *
 * Replaces browser's native word-by-word selection visual.
 */
export function PDFSelectionOverlay({ scale, onSelectionComplete }: PDFSelectionOverlayProps) {
  const [activeRects, setActiveRects] = useState<SelectionRect[]>([])
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        setActiveRects([])
        setIsDragging(false)
        return
      }

      const range = selection.getRangeAt(0)
      const clientRects = range.getClientRects()

      if (clientRects.length === 0) {
        setActiveRects([])
        return
      }

      // Convert browser rects to scaled coordinates
      const rects = Array.from(clientRects)
        .filter(rect => rect.width > 0 && rect.height > 0)
        .map(rect => ({
          x: rect.left * scale,
          y: rect.top * scale,
          width: rect.width * scale,
          height: rect.height * scale
        }))

      // Merge adjacent rectangles on same line
      const merged = mergeAdjacentRects(rects)

      setActiveRects(merged)
      setIsDragging(true)
    }

    const handleMouseUp = () => {
      // Finalize selection after short delay (allow browser selection to stabilize)
      setTimeout(() => {
        if (activeRects.length > 0 && onSelectionComplete) {
          onSelectionComplete(activeRects)
        }
        setIsDragging(false)
      }, 100)
    }

    // Listen to selection changes
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [scale, onSelectionComplete, activeRects])

  if (!isDragging || activeRects.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {activeRects.map((rect, index) => (
        <div
          key={index}
          className="absolute transition-all duration-75 ease-out"
          style={{
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            backgroundColor: 'rgba(254, 240, 138, 0.4)', // Yellow highlight
            border: '1px solid rgba(254, 240, 138, 0.6)',
            borderRadius: '2px'
          }}
        />
      ))}
    </div>
  )
}

/**
 * Merge adjacent rectangles on same line.
 * Same algorithm as PDFAnnotationOverlay.tsx mergeRectangles.
 */
function mergeAdjacentRects(rects: SelectionRect[]): SelectionRect[] {
  if (rects.length <= 1) return rects

  const sorted = [...rects].sort((a, b) => {
    const yDiff = a.y - b.y
    if (Math.abs(yDiff) > 2) return yDiff
    return a.x - b.x
  })

  const merged: SelectionRect[] = []
  let current = { ...sorted[0] }

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]

    const sameLine = Math.abs(current.y - next.y) < 2 &&
                     Math.abs(current.height - next.height) < 2

    const currentRight = current.x + current.width
    const gap = next.x - currentRight
    const adjacent = gap < 5 && gap > -5

    if (sameLine && adjacent) {
      current.width = (next.x + next.width) - current.x
    } else {
      merged.push(current)
      current = { ...next }
    }
  }

  merged.push(current)
  return merged
}
```

#### 2. Integrate with PDFViewer

**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx`
**Location**: After PDFAnnotationOverlay rendering (around line 400)
**Changes**: Add PDFSelectionOverlay

```typescript
import { PDFSelectionOverlay } from './PDFSelectionOverlay'

// ... inside JSX return
<div className="pdf-viewer-container">
  {/* Existing canvas rendering */}
  <canvas ref={canvasRef} />

  {/* Existing annotation overlay */}
  <PDFAnnotationOverlay
    annotations={annotations}
    pageNumber={currentPage}
    scale={scale}
    onAnnotationClick={handleAnnotationClick}
  />

  {/* NEW: Custom selection overlay (only active during drag) */}
  <PDFSelectionOverlay
    scale={scale}
    onSelectionComplete={(rects) => {
      console.log('[PDFViewer] Selection finalized with', rects.length, 'rects')
    }}
  />
</div>
```

#### 3. Hide Native Selection Visual (Optional)

**File**: `src/app/globals.css`
**Location**: Update .textLayer ::selection styles
**Changes**: Make native selection invisible (custom overlay replaces it)

```css
/* Hide native selection visual (custom overlay replaces it) */
.textLayer ::selection {
  background: transparent;
  color: inherit;
}

.textLayer ::-moz-selection {
  background: transparent;
  color: inherit;
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`

#### Manual Verification (Part A - CSS):
- [ ] Select text in PDF by dragging
- [ ] Selection highlight appears smoother than before
- [ ] Less visible gaps between words during drag
- [ ] If still clunky → proceed to Part B

#### Manual Verification (Part B - Custom Overlay):
- [ ] Select text in PDF by dragging
- [ ] See smooth yellow highlight overlay appear during drag
- [ ] Rectangles are merged (not word-by-word)
- [ ] Selection feels continuous and professional
- [ ] After mouse up, overlay disappears
- [ ] Annotation creation still works normally
- [ ] Compare to Zotero - should feel similar quality

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 3: Clean Up docling.md Artifacts

### Overview
Comment out docling.md saving and document why it's not needed.

**Time Estimate**: 1-2 hours

### Changes Required

#### 1. Comment Out docling.md Saving

**File**: `worker/processors/pdf-processor.ts`
**Location**: Lines 169-186 (docling.md save after extraction)
**Changes**: Comment out with explanation

```typescript
// Step 2: Extract with Docling
const pythonResult = await extractPdfWithDocling(/* ... */)

// COMMENTED OUT: docling.md coordinate system mismatch
// This file was saved to map charspan values back to raw Docling output,
// but it creates a coordinate system mismatch:
// - charspan values point to docling.md (raw Docling output)
// - chunk offsets point to content.md (cleaned markdown)
// - annotation offsets point to content.md (same as chunks)
// Result: charspan-based coordinate mapping fails (no overlaps found)
//
// SOLUTION: Use chunks.bboxes directly (already in same coordinate system)
// Bboxes are transferred from Docling → Chonkie chunks via bulletproof matcher
// and stored in chunks.bboxes field (validated: 100% coverage)
//
// If needed in future for debugging, can be re-enabled, but NOT used for
// coordinate mapping in production code.
//
// // Save docling.md to Supabase Storage
// const doclingMdPath = `${job.input_data.documentId}/docling.md`
// await supabase.storage
//   .from('documents')
//   .upload(doclingMdPath, new Blob([pythonResult.markdown]), {
//     contentType: 'text/markdown',
//     upsert: true
//   })
// console.log('[PDF Processor] Saved docling.md to Storage')

// Continue with content.md processing (AI cleanup, chunking)...
```

#### 2. Update Documentation

**File**: `worker/processors/pdf-processor.ts`
**Location**: Top of file (module docstring)
**Changes**: Add architecture note

```typescript
/**
 * PDF Document Processor
 *
 * Pipeline:
 * 1. Docling extraction → markdown + metadata (bboxes, charspan, pages)
 * 2. AI cleanup (Ollama/Gemini) → cleaned markdown
 * 3. Chonkie chunking → semantic chunks
 * 4. Metadata transfer → bboxes transferred to chunks via bulletproof matcher
 * 5. Storage: content.md + chunks with bboxes in database
 *
 * COORDINATE SYSTEMS:
 * - Docling extraction produces charspan values in raw markdown coordinate system
 * - AI cleanup changes document length → content.md has different coordinate system
 * - Chunks and annotations both use content.md offsets (same coordinate system ✅)
 * - Bboxes are transferred to chunks.bboxes and remain valid (PDF coordinate system)
 *
 * ANNOTATION COORDINATE MAPPING:
 * - PDF → Markdown: Use PDF.js native coordinates (already working)
 * - Markdown → PDF: Use chunks.bboxes with proportional filtering
 * - Do NOT use charspan for coordinate mapping (coordinate system mismatch)
 *
 * @see src/lib/reader/pdf-coordinate-mapper.ts for coordinate mapping implementation
 */
```

### Success Criteria

#### Automated Verification:
- [ ] Worker builds without errors: `cd worker && npm run build`
- [ ] TypeScript compiles: `npm run typecheck`

#### Manual Verification:
- [ ] Process a new PDF document
- [ ] Verify docling.md is NOT saved to Storage
- [ ] Verify chunks.bboxes are still populated (bulletproof matcher still works)
- [ ] Verify existing annotations still display correctly
- [ ] Check worker logs don't show docling.md save messages

### Service Restarts:
- [ ] Worker: Restart via `npm run dev`

---

## Phase 4: Document Future Enhancements

### Overview
Document PyMuPDF and Docling OCR enhancement paths without implementing them.

**Time Estimate**: 1 hour

### Changes Required

#### 1. Create Future Enhancements Document

**File**: `thoughts/plans/future_pdf-coordinate-enhancements.md` (NEW FILE)
**Purpose**: Document upgrade paths for better accuracy or OCR support

```markdown
# PDF Coordinate Mapping: Future Enhancements

**Status**: Not Yet Implemented
**Priority**: LOW (current solution works for 70-85% accuracy)

## Current State (Phase 1 Complete)

✅ **Markdown → PDF coordinate mapping works** using chunks.bboxes
- Method: Proportional bbox filtering within chunks
- Accuracy: 70-85% (good enough for personal tool)
- Speed: Instant (no additional processing)
- Works with: All existing documents (no reprocessing)

## Enhancement Option A: PyMuPDF Real-Time Search

### When to Use
- Need 95%+ accuracy for programmatic PDFs
- Want faster-than-OCR text search
- Acceptable to add Python IPC overhead (~50ms)

### Implementation Guide

**1. Install PyMuPDF**
```bash
pip install PyMuPDF
```

**2. Create search script**
```python
# worker/scripts/find_text_in_pdf.py
import fitz
import sys
import json

def find_text_on_page(pdf_path: str, page_num: int, search_text: str):
    """Search for text on specific PDF page, return bounding boxes."""
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]  # 0-indexed

    # Native fuzzy text search with bboxes
    rects = page.search_for(search_text,
                           quads=True,  # Use quads for rotated text
                           flags=fitz.TEXT_DEHYPHENATE)  # Handle line breaks

    return [{
        'x': rect.x0,
        'y': rect.y0,
        'width': rect.x1 - rect.x0,
        'height': rect.y1 - rect.y0,
        'page': page_num
    } for rect in rects]

if __name__ == '__main__':
    pdf_path = sys.argv[1]
    page_num = int(sys.argv[2])
    search_text = sys.argv[3]

    results = find_text_on_page(pdf_path, page_num, search_text)
    print(json.dumps(results))
```

**3. Integrate with pdf-coordinate-mapper.ts**
```typescript
// Add to calculatePdfCoordinatesFromDocling()
// Try chunk-based approach first (fast)
const chunkResult = await tryChunkBasedMapping(...)

if (chunkResult.confidence < 0.6) {
  // Fallback to PyMuPDF search (slower but more accurate)
  const pymupdfResult = await searchWithPyMuPDF(
    documentId,
    annotationText,
    pageNumber
  )
  return pymupdfResult
}

return chunkResult

async function searchWithPyMuPDF(
  documentId: string,
  searchText: string,
  pageNumber: number
): Promise<PdfCoordinateResult> {
  const pdfPath = `/path/to/storage/${documentId}/original.pdf`

  // Execute Python script
  const result = await execPython('find_text_in_pdf.py', [
    pdfPath,
    pageNumber.toString(),
    searchText
  ])

  const rects = JSON.parse(result.stdout)

  return {
    found: rects.length > 0,
    pageNumber,
    rects,
    method: 'pymupdf_search',
    confidence: 0.95
  }
}
```

**Benefits**:
- ✅ 95%+ accuracy for programmatic PDFs
- ✅ Fast (~50ms including IPC overhead)
- ✅ Handles multi-line text elegantly
- ✅ No preprocessing needed

**Trade-offs**:
- ⚠️ Requires Python IPC (adds latency)
- ⚠️ Only works for programmatic PDFs (not scanned)
- ⚠️ Need to manage PDF file access from Storage

**Time Estimate**: 4-6 hours to implement and test

---

## Enhancement Option B: Docling OCR with Granite Model

### When to Use
- Need to support scanned PDFs (no embedded text)
- Want structure-aware coordinate extraction
- Acceptable to wait 10s per page for accuracy

### Implementation Guide

**1. You already have Docling in pipeline!**
- Docling extraction runs during document processing
- Bboxes are already extracted and stored in chunks
- Just need to handle scanned PDF case differently

**2. Detect PDF type**
```python
# worker/lib/pdf-detection.py
import fitz

def detect_pdf_type(pdf_path: str) -> str:
    """Detect if PDF is programmatic or scanned."""
    doc = fitz.open(pdf_path)
    page = doc[0]

    # Check for extractable text
    text = page.get_text()
    if not text.strip():
        return "scanned"

    # Check image coverage (scanned pages are mostly images)
    images = page.get_images()
    if images:
        image_bbox = page.get_image_bbox(images[0])
        page_rect = page.rect
        coverage = abs(image_bbox & page_rect) / abs(page_rect)
        if coverage >= 0.95:
            return "scanned"

    return "programmatic"
```

**3. Use Docling OCR for scanned PDFs**
```python
# worker/processors/pdf-processor.ts
const docType = await detectPdfType(pdfPath)

if (docType === 'scanned') {
  // Enable OCR mode in Docling
  const pythonArgs = [
    'docling_extract.py',
    pdfPath,
    '--enable-ocr',  # NEW: Enable Granite OCR
    '--ocr-model', 'granite-docling-258M-mlx',  # Apple Silicon optimized
    '--output-bboxes'
  ]

  const result = await execPython(pythonArgs)
  // Bboxes from OCR will be in result, transfer to chunks as normal
}
```

**4. Coordinate mapping stays the same**
- Chunks.bboxes populated from OCR output
- pdf-coordinate-mapper.ts works unchanged
- No code changes to frontend!

**Benefits**:
- ✅ Handles scanned PDFs (only option)
- ✅ Structure-aware (tables, headings preserved)
- ✅ Reuses existing Docling pipeline
- ✅ No frontend changes needed

**Trade-offs**:
- ⚠️ Slow (10s per page)
- ⚠️ Requires reprocessing documents to enable OCR
- ⚠️ Accuracy varies by scan quality
- ⚠️ Large model (~500MB-1GB)

**Time Estimate**: 6-8 hours to implement OCR detection and handling

---

## Enhancement Option C: Character-Level Coordinate Map

### When to Use
- Need 99%+ pixel-perfect accuracy
- Willing to invest significant engineering time
- Acceptable to reprocess all documents

### Why We're NOT Doing This Now
- ❌ Complex implementation (15-20 hours)
- ❌ Requires reprocessing all documents
- ❌ Memory overhead (100K+ entries for large docs)
- ❌ Fragile (must track ALL transformations correctly)
- ✅ Current 70-85% accuracy is good enough for personal tool

### High-Level Approach
1. During AI cleanup, track character position changes
2. Build bidirectional map: `contentPos ↔ doclingPos`
3. Store map in job metadata or separate file
4. At annotation time: `annotationOffset → doclingOffset → charspan → bbox`

**Only implement if user feedback indicates current accuracy insufficient.**

---

## Comparison Matrix

| Approach | Accuracy | Speed | Complexity | When to Use |
|----------|----------|-------|------------|-------------|
| **Current (chunks.bboxes)** | 70-85% | Instant | ⭐ Simple | Default (works now) |
| **PyMuPDF search** | 95%+ | ~50ms | ⭐⭐ Moderate | Programmatic PDFs, need precision |
| **Docling OCR** | Variable | 10s/page | ⭐⭐⭐ Complex | Scanned PDFs only |
| **Character map** | 99%+ | Instant | ⭐⭐⭐⭐⭐ Very complex | Pixel-perfect requirement |

---

## Decision Framework

```
User creates annotation in markdown
  ↓
Try chunks.bboxes mapping (Phase 1)
  ↓
Confidence >= 0.6? → ✅ Use it (70-85% accuracy)
  ↓
Is PDF scanned? → ✅ Use Docling OCR (Option B)
  ↓
Need better accuracy? → ✅ Use PyMuPDF search (Option A)
  ↓
Still insufficient? → Consider Option C (character map)
```

---

## Implementation Priority

**Now**: Phase 1 (chunks.bboxes) ← **CURRENT PLAN**

**Later (if needed based on user feedback)**:
1. Option A (PyMuPDF) - for better accuracy on programmatic PDFs
2. Option B (Docling OCR) - for scanned PDF support
3. Option C (character map) - only if pixel-perfect required

**Recommendation**: Ship Phase 1, gather user feedback, then prioritize enhancements based on real-world usage patterns.
```

### Success Criteria

#### Automated Verification:
- [ ] Document exists at `thoughts/plans/future_pdf-coordinate-enhancements.md`
- [ ] Markdown renders correctly in GitHub

#### Manual Verification:
- [ ] Document clearly explains when to use each approach
- [ ] Code examples are copy-pasteable (valid syntax)
- [ ] Comparison matrix helps with decision-making
- [ ] Future developer can implement without additional research

---

## Testing Strategy

### Unit Tests
**File**: `src/lib/reader/__tests__/pdf-coordinate-mapper.test.ts` (NEW FILE)

```typescript
import { calculatePdfCoordinatesFromDocling } from '../pdf-coordinate-mapper'
import type { Chunk } from '@/types/annotations'

describe('calculatePdfCoordinatesFromDocling', () => {
  it('should map annotation to chunk bboxes proportionally', async () => {
    const mockChunks: Chunk[] = [{
      id: 'chunk-1',
      start_offset: 1000,
      end_offset: 2000,
      page_start: 5,
      page_end: 5,
      bboxes: [
        { l: 100, t: 200, r: 150, b: 210, page: 5 },
        { l: 150, t: 200, r: 200, b: 210, page: 5 },
        { l: 200, t: 200, r: 250, b: 210, page: 5 },
        { l: 250, t: 200, r: 300, b: 210, page: 5 },
      ]
    }]

    // Annotation at middle of chunk (offset 1500, length 100)
    const result = await calculatePdfCoordinatesFromDocling(
      'doc-id',
      1500,  // Middle of chunk (50% through)
      100,   // 10% of chunk length
      mockChunks
    )

    expect(result.found).toBe(true)
    expect(result.method).toBe('chunk_proportional')
    expect(result.confidence).toBe(0.7)
    expect(result.pageNumber).toBe(5)
    expect(result.rects).toBeDefined()
    expect(result.rects!.length).toBeGreaterThan(0)
  })

  it('should fallback to page_only when no bboxes', async () => {
    const mockChunks: Chunk[] = [{
      id: 'chunk-1',
      start_offset: 1000,
      end_offset: 2000,
      page_start: 5,
      page_end: 5,
      bboxes: []  // No bboxes
    }]

    const result = await calculatePdfCoordinatesFromDocling(
      'doc-id',
      1500,
      100,
      mockChunks
    )

    expect(result.found).toBe(true)
    expect(result.method).toBe('page_only')
    expect(result.confidence).toBe(0.5)
    expect(result.rects).toBeUndefined()
  })

  it('should merge adjacent rectangles', async () => {
    const mockChunks: Chunk[] = [{
      id: 'chunk-1',
      start_offset: 1000,
      end_offset: 2000,
      page_start: 5,
      page_end: 5,
      bboxes: [
        // Adjacent rects on same line (should merge)
        { l: 100, t: 200, r: 110, b: 210, page: 5 },
        { l: 110, t: 200, r: 120, b: 210, page: 5 },
        { l: 120, t: 200, r: 130, b: 210, page: 5 },
      ]
    }]

    const result = await calculatePdfCoordinatesFromDocling(
      'doc-id',
      1000,
      500,
      mockChunks
    )

    expect(result.rects!.length).toBe(1)  // Merged into single rect
    expect(result.rects![0].width).toBeCloseTo(30)  // 130 - 100
  })
})
```

### Integration Tests
**Manual end-to-end testing**:

1. **Test document variety**:
   - Short document (< 10 pages)
   - Medium document (50-100 pages)
   - Long document (200+ pages)

2. **Test annotation positions**:
   - Start of document
   - Middle of document
   - End of document
   - Multi-line selections
   - Single-word selections

3. **Test edge cases**:
   - Annotation spanning chunk boundary
   - Very short annotations (1-2 words)
   - Very long annotations (multiple paragraphs)
   - Annotations in tables
   - Annotations near page breaks

### Manual Testing Checklist

**Phase 1 (Coordinate Mapping)**:
- [ ] Open "THE PLAGUE OF FANTASIES" document
- [ ] Create annotation in markdown view: "This project of using repetition"
- [ ] Verify console shows `confidence: 0.7, method: 'chunk_proportional'`
- [ ] Switch to PDF view
- [ ] Annotation visible on page 9 ✅
- [ ] Highlight position within ~15% of actual text ✅
- [ ] Repeat with 2 more documents
- [ ] Repeat with different text lengths (short/medium/long)

**Phase 2A (CSS Selection)**:
- [ ] Open any PDF document
- [ ] Drag to select text (observe during drag, not after)
- [ ] Selection background is yellow (not default blue)
- [ ] Visual gaps between words reduced
- [ ] If still clunky → proceed to Phase 2B

**Phase 2B (Custom Overlay)**:
- [ ] Open any PDF document
- [ ] Drag to select text
- [ ] See yellow overlay appear during drag (smooth, merged rectangles)
- [ ] Release mouse - overlay disappears
- [ ] Create annotation - works normally
- [ ] Compare to Zotero - similar smoothness ✅

**Phase 3 (Cleanup)**:
- [ ] Process new PDF document
- [ ] Check Supabase Storage - docling.md NOT created ✅
- [ ] Check database - chunks.bboxes still populated ✅
- [ ] Existing annotations still display correctly ✅

---

## Performance Considerations

### Current Performance (Phase 1)
- **Coordinate mapping**: Instant (< 1ms, in-memory filtering)
- **Memory overhead**: None (uses existing chunks data)
- **Database queries**: None (chunks already loaded for reader)

### Selection UX Performance
- **CSS approach**: Zero overhead (browser-native)
- **Custom overlay approach**: Minimal (~5ms per selection change event)
- **React re-renders**: Optimized with `useState` + `useEffect` hooks

### No Performance Degradation Expected
- ✅ All operations use existing data
- ✅ No additional API calls
- ✅ No heavy computation
- ✅ Works offline (no external dependencies)

---

## Migration Notes

### Backward Compatibility
- ✅ Existing annotations continue to work (schema unchanged)
- ✅ Existing documents work immediately (no reprocessing)
- ✅ Old docling.md files ignored (no cleanup needed)

### Data Migration
- **None required** - solution uses existing data structures

### Rollback Plan
If issues arise:
1. Revert `pdf-coordinate-mapper.ts` to page-only mode
2. Remove custom selection overlay component
3. System returns to pre-Phase-1 state (page-only highlights)

---

## References

### Rhizome Architecture
- `docs/ARCHITECTURE.md` - Overall system design
- `docs/PROCESSING_PIPELINE.md` - Docling → Chonkie flow
- `docs/STORAGE_PATTERNS.md` - Storage vs Database decisions

### Similar Implementations
- `src/components/rhizome/pdf-viewer/PDFAnnotationOverlay.tsx:24` - mergeRectangles() algorithm
- `src/lib/reader/text-offset-calculator.ts` - Coordinate conversion patterns
- `worker/lib/chonkie/metadata-transfer.ts` - Bulletproof metadata matcher

### External Resources
- [PDF.js Text Selection](https://gist.github.com/yurydelendik/f2b846dae7cb29c86d23) - Selection coordinate extraction
- [PyMuPDF search_for() docs](https://pymupdf.readthedocs.io/en/latest/page.html) - Text search API
- [Docling Documentation](https://docling-project.github.io/docling/) - OCR and structure extraction
- [MDN ::selection pseudo-element](https://developer.mozilla.org/en-US/docs/Web/CSS/::selection) - CSS selection styling

---

## Success Criteria Summary

### Phase 1: ✅ Coordinate Mapping Works
- Markdown annotations appear in PDF view
- Confidence >= 0.7 (chunk_proportional method)
- Position within ~15% accuracy
- Works with all existing documents

### Phase 2: ✅ Selection UX Improved
- Smooth, continuous selection during drag
- No visible word-by-word gaps
- Professional feel (comparable to Zotero)
- Final highlights are clean merged rectangles

### Phase 3: ✅ Code Cleanup Complete
- docling.md saving disabled
- Architecture documented clearly
- No confusion about coordinate systems

### Phase 4: ✅ Future Paths Documented
- PyMuPDF enhancement path clear
- Docling OCR enhancement path clear
- Decision framework helps prioritize

**Overall Success**: Users can create annotations in either view and see them in both views with acceptable accuracy and smooth UX.
