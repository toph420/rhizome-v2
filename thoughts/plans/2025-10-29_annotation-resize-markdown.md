# Annotation Resize - Markdown View Implementation Plan

**Created**: 2025-10-29
**Status**: Ready for Implementation
**Priority**: HIGH - Core reader usability

---

## Overview

Implement annotation resizing in markdown view by allowing users to drag edge handles on highlighted spans. This enables precise boundary adjustments while maintaining bidirectional sync with PDF coordinates using existing PyMuPDF infrastructure.

**Why This Matters**:
- Annotations are referenced in sparks, connections, have notes/tags - resizing is essential
- Initial selections often need boundary adjustment for precision
- Maintaining bidirectional sync ensures highlights remain accurate in both views

---

## Current State Analysis

### What Works ✅
- **Span injection**: `inject.ts` uses `<span>` tags with `data-annotation-id`, `data-annotation-start`, `data-annotation-end`
- **Edge markers**: Visual indicators already in `globals.css:299-343` (resize handle CSS)
- **Offset calculation**: `calculateMultiBlockOffsets()` converts DOM ranges to markdown offsets
- **Word snapping**: `snapToWordBoundaries()` ensures clean selections
- **Bidirectional sync**: PyMuPDF handles markdown→PDF coordinate mapping (95%+ accuracy)
- **ECS updates**: `AnnotationOperations.update()` pattern established
- **Drag patterns**: `QuickCapturePanel.tsx:511-561` shows mousedown/mousemove/mouseup pattern

### What's Missing ❌
- No edge detection for resize initiation (hover detection)
- No drag handler hook for resize operations
- No live preview during drag (visual feedback)
- No Server Action for range updates
- No validation enforcement during resize (3-char min, 5-chunk max)

### Key Discoveries
- `highlight-injector.ts` (old, uses `<mark>`) still used by `block-parser.ts:74`
- Should migrate to `inject.ts` (uses `<span>`) for consistency
- Function name `calculatePdfCoordinatesFromDocling` is misleading (uses PyMuPDF, not Docling charspan)

---

## Desired End State

**Markdown view resize workflow**:
1. User hovers near edge of highlighted span → cursor changes to `col-resize`
2. User drags edge → live preview shows new boundary (blue outline)
3. User releases mouse → auto-saves with validation
4. PDF coordinates automatically recalculated via PyMuPDF
5. Annotation updated in both views with 95%+ accuracy

**Validation enforced**:
- Minimum 3 characters
- Maximum 5 chunks
- Word boundary snapping
- Live visual feedback during drag
- Error toast if validation fails

---

## Rhizome Architecture

- **Module**: Main App only (Next.js)
- **Storage**: Database only (ECS Position component)
- **Migration**: No database changes (uses existing schema)
- **Test Tier**: Stable (fix when broken)
- **Pipeline Stages**: None (reader-only feature)
- **Engines**: None affected

---

## What We're NOT Doing

1. **NOT implementing PDF view resize** - That's Phase 2 (separate plan)
2. **NOT changing database schema** - Uses existing Position component fields
3. **NOT adding undo/redo** - Can be added later if needed
4. **NOT supporting keyboard resize** - Mouse-only for now
5. **NOT adding confirmation dialog** - Auto-save on release (user preference)
6. **NOT implementing multi-select resize** - One annotation at a time

---

## Implementation Approach

### Strategy: Iterative with Cleanup

**Phase 1**: Rename misleading function (quick win, prevents confusion)
**Phase 2**: Migrate legacy `highlight-injector.ts` to `inject.ts` (code health)
**Phase 3**: Core resize hook implementation (main feature)
**Phase 4**: BlockRenderer integration with live preview (UX polish)
**Phase 5**: Server Action and validation (persistence)
**Phase 6**: Testing and edge cases (quality)

**Pattern**: Follow `usePDFSelection` two-phase approach (immediate feedback + enhancement)

---

## Phase 1: Rename Misleading Function

### Overview
Rename `calculatePdfCoordinatesFromDocling` to `calculatePdfCoordinatesFromMarkdown` to accurately reflect that it uses PyMuPDF text search, not Docling charspan.

**Time Estimate**: 30 minutes

### Changes Required

#### 1. Rename Function Definition
**File**: `src/lib/reader/pdf-coordinate-mapper.ts`
**Location**: Line 67
**Changes**: Rename function and update documentation

```typescript
/**
 * Calculate PDF coordinates from markdown offsets using PyMuPDF text search.
 *
 * RENAMED from calculatePdfCoordinatesFromDocling to reflect actual implementation.
 * Uses PyMuPDF for 95% accuracy, NOT Docling charspan (which has coordinate mismatch).
 *
 * @param documentId - Document UUID
 * @param markdownOffset - Starting character offset in content.md
 * @param markdownLength - Length of highlighted text
 * @param chunks - Document chunks with page ranges
 * @returns PDF coordinates with confidence and method
 */
export async function calculatePdfCoordinatesFromMarkdown(
  documentId: string,
  markdownOffset: number,
  markdownLength: number,
  chunks: Chunk[]
): Promise<PdfCoordinateResult> {
  // Implementation unchanged
}
```

#### 2. Update All Call Sites
**Files to update**:
- `src/app/actions/annotations.ts:564` - `calculatePdfCoordinates` Server Action
- `src/components/reader/QuickCapturePanel.tsx` (if used)
- Any other imports of this function

**Pattern**:
```typescript
// Before
import { calculatePdfCoordinatesFromDocling } from '@/lib/reader/pdf-coordinate-mapper'
const result = await calculatePdfCoordinatesFromDocling(...)

// After
import { calculatePdfCoordinatesFromMarkdown } from '@/lib/reader/pdf-coordinate-mapper'
const result = await calculatePdfCoordinatesFromMarkdown(...)
```

#### 3. Update Documentation References
**Files**:
- `thoughts/plans/2025-10-29_pdf-annotation-coordinate-mapping-and-selection-ux.md` (this plan)
- Any other docs referencing the function

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`
- [ ] Grep confirms all references updated: `grep -r "calculatePdfCoordinatesFromDocling" src/`

#### Manual Verification:
- [ ] Create annotation in markdown view
- [ ] Switch to PDF view
- [ ] Annotation appears at correct location (function still works)

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 2: Migrate Legacy highlight-injector.ts

### Overview
Replace `highlight-injector.ts` usage with `inject.ts` for consistency. The old system uses `<mark>` tags while the new system uses `<span>` tags with better fuzzy matching (7 strategies vs basic offset-based).

**Time Estimate**: 1-2 hours

### Changes Required

#### 1. Update block-parser.ts
**File**: `src/lib/reader/block-parser.ts`
**Location**: Lines 3-6, 73-79
**Changes**: Replace import and function call

```typescript
// Before (lines 3-6)
import {
  injectHighlights,
  type AnnotationForInjection,
} from './highlight-injector'

// After
import {
  injectAnnotations,
  type AnnotationRange,
} from '@/lib/annotations/inject'
```

```typescript
// Before (lines 73-79)
if (annotations.length > 0) {
  html = injectHighlights({
    html,
    blockStartOffset: offset,
    blockEndOffset: endOffset,
    annotations,
  })
}

// After
if (annotations.length > 0) {
  html = injectAnnotations(
    html,
    offset,           // blockStartOffset
    endOffset,        // blockEndOffset
    annotations.map(ann => ({
      ...ann,
      text: undefined  // Don't use text search for block-parser (offset-based is fine)
    }))
  )
}
```

**Why this works**:
- `injectAnnotations` has same signature: `(html, start, end, annotations)`
- `AnnotationRange` interface matches `AnnotationForInjection` (same fields)
- `inject.ts` handles both offset-based and text-search-based injection
- Setting `text: undefined` uses offset-based mode (same as old behavior)

#### 2. Remove Old Files (Optional Cleanup)
**Files to remove** (after migration tested):
- `src/lib/reader/highlight-injector.ts`
- `src/lib/reader/__tests__/highlight-injector.test.ts`

**Note**: Keep files initially, remove after manual verification passes.

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Open document with annotations in markdown view
- [ ] Annotations appear correctly highlighted (yellow/green/blue spans)
- [ ] Hover shows correct cursor styles
- [ ] Click annotation opens edit panel
- [ ] Multi-chunk annotations display correctly
- [ ] Edge markers visible on start/end spans (`data-annotation-start`, `data-annotation-end`)

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 3: Create useAnnotationResize Hook

### Overview
Core hook implementing drag detection, offset calculation, and live preview state management.

**Time Estimate**: 3-4 hours

### Changes Required

#### 1. Create useAnnotationResize Hook
**File**: `src/hooks/useAnnotationResize.ts` (NEW FILE)
**Purpose**: Handle edge detection, drag operations, and offset recalculation

```typescript
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateMultiBlockOffsets } from '@/lib/reader/offset-calculator'
import { snapToWordBoundaries } from '@/lib/reader/offset-calculator'
import { findSpannedChunks, MAX_CHUNKS_PER_ANNOTATION } from '@/lib/reader/chunk-utils'
import type { Chunk } from '@/types/annotations'

export interface AnnotationResizeOptions {
  enabled?: boolean
  documentId: string
  chunks: Chunk[]
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
  hoveredEdge: { annotationId: string; edge: 'start' | 'end' } | null
}

const EDGE_DETECTION_THRESHOLD = 8 // pixels

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
  const [isResizing, setIsResizing] = useState(false)
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [hoveredEdge, setHoveredEdge] = useState<{ annotationId: string; edge: 'start' | 'end' } | null>(null)

  // Track mouse position for edge detection
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * Detect if mouse is near edge of annotation span.
   * Returns edge type if within threshold, null otherwise.
   */
  const detectEdge = useCallback((e: MouseEvent, spanElement: HTMLElement): 'start' | 'end' | null => {
    const rect = spanElement.getBoundingClientRect()
    const mouseX = e.clientX

    // Check start edge (left side)
    if (Math.abs(mouseX - rect.left) <= EDGE_DETECTION_THRESHOLD) {
      return 'start'
    }

    // Check end edge (right side)
    if (Math.abs(mouseX - rect.right) <= EDGE_DETECTION_THRESHOLD) {
      return 'end'
    }

    return null
  }, [])

  /**
   * Handle mousemove for edge detection (when not resizing).
   */
  useEffect(() => {
    if (!enabled || isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY }

      // Find annotation span at mouse position
      const target = e.target as HTMLElement
      const spanElement = target.closest('[data-annotation-id]') as HTMLElement | null

      if (!spanElement) {
        setHoveredEdge(null)
        document.body.style.cursor = ''
        return
      }

      // Check if this is a start or end span
      const hasStartMarker = spanElement.hasAttribute('data-annotation-start')
      const hasEndMarker = spanElement.hasAttribute('data-annotation-end')

      if (!hasStartMarker && !hasEndMarker) {
        // Middle span - no resize handles
        setHoveredEdge(null)
        document.body.style.cursor = ''
        return
      }

      const annotationId = spanElement.getAttribute('data-annotation-id')!
      const edge = detectEdge(e, spanElement)

      if (edge) {
        // Validate edge matches marker
        if ((edge === 'start' && hasStartMarker) || (edge === 'end' && hasEndMarker)) {
          setHoveredEdge({ annotationId, edge })
          document.body.style.cursor = 'col-resize'
        } else {
          setHoveredEdge(null)
          document.body.style.cursor = ''
        }
      } else {
        setHoveredEdge(null)
        document.body.style.cursor = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.body.style.cursor = ''
    }
  }, [enabled, isResizing, detectEdge])

  /**
   * Handle mousedown to initiate resize.
   */
  useEffect(() => {
    if (!enabled || !hoveredEdge) return

    const handleMouseDown = (e: MouseEvent) => {
      // Only left click
      if (e.button !== 0) return

      e.preventDefault()
      e.stopPropagation()

      // Get annotation data from DOM
      const spanElement = (e.target as HTMLElement).closest('[data-annotation-id]') as HTMLElement
      if (!spanElement) return

      const annotationId = spanElement.getAttribute('data-annotation-id')!

      // Get current offsets from data attributes
      const startOffset = parseInt(spanElement.getAttribute('data-start-offset') || '0', 10)
      const endOffset = parseInt(spanElement.getAttribute('data-end-offset') || '0', 10)
      const text = spanElement.textContent || ''

      setResizeState({
        annotationId,
        edge: hoveredEdge.edge,
        initialStartOffset: startOffset,
        initialEndOffset: endOffset,
        currentStartOffset: startOffset,
        currentEndOffset: endOffset,
        text,
      })
      setIsResizing(true)
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [enabled, hoveredEdge])

  /**
   * Handle mousemove during resize to update offsets.
   */
  useEffect(() => {
    if (!isResizing || !resizeState) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()

      // Get new selection range at mouse position
      const selection = window.getSelection()
      if (!selection) return

      // Create range at current mouse position
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (!range) return

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
            return // Don't update
          }
        } else {
          newEndOffset = offsetResult.endOffset
          // Prevent end from going before start
          if (newEndOffset <= resizeState.initialStartOffset) {
            return // Don't update
          }
        }

        // Validate minimum length (3 characters)
        if (newEndOffset - newStartOffset < 3) {
          return // Don't update if too small
        }

        // Validate maximum chunks (5)
        const spannedChunks = findSpannedChunks(newStartOffset, newEndOffset, chunks)
        if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
          return // Don't update if exceeds limit
        }

        // Update resize state with new offsets
        setResizeState(prev => ({
          ...prev!,
          currentStartOffset: newStartOffset,
          currentEndOffset: newEndOffset,
          text: offsetResult.selectedText,
        }))

      } catch (error) {
        console.warn('[useAnnotationResize] Offset calculation failed:', error)
        // Continue with existing offsets
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [isResizing, resizeState, chunks])

  /**
   * Handle mouseup to complete resize and save.
   */
  useEffect(() => {
    if (!isResizing) return

    const handleMouseUp = async () => {
      if (!resizeState) return

      try {
        // Final validation
        const length = resizeState.currentEndOffset - resizeState.currentStartOffset
        if (length < 3) {
          console.error('[useAnnotationResize] Annotation too short:', length)
          return
        }

        const spannedChunks = findSpannedChunks(
          resizeState.currentStartOffset,
          resizeState.currentEndOffset,
          chunks
        )
        if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
          console.error('[useAnnotationResize] Too many chunks:', spannedChunks.length)
          return
        }

        // Call save callback
        await onResizeComplete(resizeState.annotationId, {
          startOffset: resizeState.currentStartOffset,
          endOffset: resizeState.currentEndOffset,
          text: resizeState.text,
        })

      } catch (error) {
        console.error('[useAnnotationResize] Save failed:', error)
      } finally {
        // Cleanup
        setIsResizing(false)
        setResizeState(null)
        setHoveredEdge(null)
        document.body.style.cursor = ''
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [isResizing, resizeState, chunks, onResizeComplete])

  return {
    isResizing,
    resizeState,
    hoveredEdge,
  }
}
```

**Key aspects**:
- 8px edge detection threshold (same as plan)
- Two-phase: hover detection → drag operation
- Live preview via `resizeState.currentStartOffset/EndOffset`
- Word boundary snapping (via `calculateMultiBlockOffsets`)
- Validation during drag (min 3 chars, max 5 chunks)
- Auto-save on mouseup (user preference)

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Hook exports correct interface
- [ ] Edge detection logic compiles
- [ ] Drag handlers structured correctly

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 4: BlockRenderer Integration

### Overview
Integrate `useAnnotationResize` hook into `BlockRenderer` component and add live preview visual feedback.

**Time Estimate**: 2-3 hours

### Changes Required

#### 1. Update BlockRenderer Component
**File**: `src/components/reader/BlockRenderer.tsx`
**Location**: Add hook usage and pass resize state to injection

```typescript
'use client'

import { useMemo } from 'react'
import { injectAnnotations } from '@/lib/annotations/inject'
import { useAnnotationResize } from '@/hooks/useAnnotationResize'
import type { Block } from '@/lib/reader/block-parser'
import type { AnnotationEntity, Chunk } from '@/types/annotations'

interface BlockRendererProps {
  block: Block
  annotations: AnnotationEntity[]
  chunks: Chunk[]
  documentId: string
  onAnnotationClick?: (annotationId: string) => void
  onAnnotationUpdate?: (annotationId: string, newRange: {
    startOffset: number
    endOffset: number
    text: string
  }) => Promise<void>
}

export function BlockRenderer({
  block,
  annotations,
  chunks,
  documentId,
  onAnnotationClick,
  onAnnotationUpdate,
}: BlockRendererProps) {

  // Resize hook
  const { isResizing, resizeState, hoveredEdge } = useAnnotationResize({
    enabled: true,
    documentId,
    chunks,
    onResizeComplete: onAnnotationUpdate || (async () => {}),
  })

  // Convert annotations to injection format
  const annotationRanges = useMemo(() => {
    return annotations.map(ann => ({
      id: ann.id,
      startOffset: ann.components.Position?.startOffset ?? 0,
      endOffset: ann.components.Position?.endOffset ?? 0,
      color: ann.components.Visual?.color ?? 'yellow',
      text: ann.components.Position?.originalText, // For text-search-based injection
    }))
  }, [annotations])

  // Inject annotations into HTML
  const annotatedHtml = useMemo(() => {
    let html = block.html

    // Add data attributes for offset tracking
    const wrapper = `<div data-start-offset="${block.startOffset}" data-end-offset="${block.endOffset}">${html}</div>`

    if (annotationRanges.length > 0) {
      return injectAnnotations(
        wrapper,
        block.startOffset,
        block.endOffset,
        annotationRanges
      )
    }

    return wrapper
  }, [block.html, block.startOffset, block.endOffset, annotationRanges])

  // Add resize preview class if resizing
  const className = useMemo(() => {
    const classes = ['block-content']

    if (isResizing) {
      classes.push('annotation-resizing')
    }

    if (hoveredEdge) {
      classes.push('annotation-hover-edge')
    }

    return classes.join(' ')
  }, [isResizing, hoveredEdge])

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: annotatedHtml }}
      onClick={(e) => {
        // Handle annotation clicks (existing logic)
        const target = e.target as HTMLElement
        const annotationSpan = target.closest('[data-annotation-id]')
        if (annotationSpan && onAnnotationClick) {
          const annotationId = annotationSpan.getAttribute('data-annotation-id')
          if (annotationId) {
            onAnnotationClick(annotationId)
          }
        }
      }}
    />
  )
}
```

#### 2. Add Live Preview CSS
**File**: `src/app/globals.css`
**Location**: After existing annotation styles (around line 365)
**Changes**: Add resize preview and live selection feedback

```css
/* ============================================
   Annotation Resize Live Preview
   Shows blue outline during drag operation
   ============================================ */

/* During resize, show preview selection */
body.annotation-resizing [data-annotation-id] {
  /* Dim existing highlight slightly */
  opacity: 0.6;
  transition: opacity 0.15s ease;
}

/* Show blue outline on currently resized annotation */
body.annotation-resizing [data-annotation-id].resizing-active {
  outline: 2px solid rgb(59, 130, 246); /* Blue-500 */
  outline-offset: 1px;
  opacity: 1;
  background-color: rgba(59, 130, 246, 0.15); /* Blue with low opacity */
  transition: all 0.1s ease;
}

/* Prevent text selection during resize */
body.annotation-resizing {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* Edge hover feedback - enhance existing styles */
[data-annotation-start]:hover::before,
[data-annotation-end]:hover::after {
  width: 4px;
  opacity: 0.8;
  background: rgb(59, 130, 246); /* Blue when hovering */
}
```

#### 3. Update VirtualizedReader to Pass Callbacks
**File**: `src/components/reader/VirtualizedReader.tsx`
**Location**: Add `onAnnotationUpdate` handler

```typescript
// Add resize handler
const handleAnnotationResize = useCallback(async (
  annotationId: string,
  newRange: { startOffset: number; endOffset: number; text: string }
) => {
  if (!documentId) return

  try {
    // Call Server Action to update
    const result = await updateAnnotationRange(annotationId, newRange)

    if (result.success) {
      // Show success toast
      toast.success('Annotation resized')

      // Revalidate to refresh UI
      // (Next.js auto-revalidates after Server Action)
    } else {
      toast.error('Failed to resize annotation', {
        description: result.error
      })
    }
  } catch (error) {
    console.error('[VirtualizedReader] Resize failed:', error)
    toast.error('Failed to resize annotation')
  }
}, [documentId])

// Pass to BlockRenderer
<BlockRenderer
  block={block}
  annotations={annotationsForBlock}
  chunks={chunks}
  documentId={documentId}
  onAnnotationClick={handleAnnotationClick}
  onAnnotationUpdate={handleAnnotationResize}  // NEW
/>
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Hover near annotation edge → cursor changes to `col-resize`
- [ ] Cursor returns to normal when moving away from edge
- [ ] Drag edge → visual preview appears (blue outline)
- [ ] Release mouse → preview disappears
- [ ] No console errors during drag

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 5: Server Action and Validation

### Overview
Create `updateAnnotationRange` Server Action to persist resize changes with bidirectional sync.

**Time Estimate**: 2-3 hours

### Changes Required

#### 1. Add Server Action
**File**: `src/app/actions/annotations.ts`
**Location**: After existing `createAnnotation` function (around line 130)

```typescript
/**
 * Update annotation range after resize operation.
 *
 * Recalculates PDF coordinates using PyMuPDF to maintain bidirectional sync.
 * Validates minimum length (3 chars) and maximum chunks (5).
 */
export async function updateAnnotationRange(
  annotationId: string,
  newRange: {
    startOffset: number
    endOffset: number
    text: string
  }
): Promise<ActionResult<void>> {
  try {
    // Get authenticated user
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Validate inputs
    const schema = z.object({
      annotationId: z.string().uuid(),
      newRange: z.object({
        startOffset: z.number().int().min(0),
        endOffset: z.number().int().min(0),
        text: z.string().min(3).max(5000),
      }),
    })

    const validated = schema.parse({ annotationId, newRange })

    // Validate length
    const length = validated.newRange.endOffset - validated.newRange.startOffset
    if (length < 3) {
      return { success: false, error: 'Annotation must be at least 3 characters' }
    }

    // Get annotation to find document
    const supabase = await createClient()
    const ecs = createECS(supabase)
    const ops = new AnnotationOperations(ecs, user.id)

    const annotation = await ops.getById(annotationId)
    if (!annotation) {
      return { success: false, error: 'Annotation not found' }
    }

    const documentId = annotation.components.Position?.documentId
    if (!documentId) {
      return { success: false, error: 'Document ID not found' }
    }

    // Load chunks to validate chunk limit
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, start_offset, end_offset, page_start, page_end')
      .eq('document_id', documentId)
      .eq('is_current', true)
      .order('start_offset')

    if (chunksError || !chunks) {
      return { success: false, error: 'Failed to load chunks' }
    }

    // Find spanned chunks
    const spannedChunks = chunks.filter(c =>
      validated.newRange.startOffset < c.end_offset &&
      validated.newRange.endOffset > c.start_offset
    )

    if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
      return {
        success: false,
        error: `Annotation spans too many chunks (max ${MAX_CHUNKS_PER_ANNOTATION})`
      }
    }

    // Recalculate PDF coordinates using PyMuPDF
    const pdfResult = await calculatePdfCoordinatesFromMarkdown(
      documentId,
      validated.newRange.startOffset,
      length,
      chunks
    )

    // Update annotation via ECS
    await ops.update(annotationId, {
      // Markdown offsets
      startOffset: validated.newRange.startOffset,
      endOffset: validated.newRange.endOffset,
      originalText: validated.newRange.text,

      // PDF coordinates (recalculated)
      pdfPageNumber: pdfResult.pageNumber,
      pdfRects: pdfResult.rects,
      pdfX: pdfResult.rects?.[0]?.x,
      pdfY: pdfResult.rects?.[0]?.y,
      pdfWidth: pdfResult.rects?.[0]?.width,
      pdfHeight: pdfResult.rects?.[0]?.height,

      // Sync metadata
      syncMethod: pdfResult.method,
      syncConfidence: pdfResult.confidence,
      syncNeedsReview: pdfResult.confidence ? pdfResult.confidence < 0.85 : false,

      // Update chunk references
      chunkIds: spannedChunks.map(c => c.id),
    })

    // Revalidate reader page
    revalidatePath(`/read/${documentId}`)

    return { success: true, data: undefined }

  } catch (error) {
    console.error('[updateAnnotationRange] Error:', error)

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Validation failed: ${error.errors.map(e => e.message).join(', ')}`
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

**Key aspects**:
- Zod validation for all inputs
- Minimum 3 characters enforced
- Maximum 5 chunks enforced
- PDF coordinates recalculated via `calculatePdfCoordinatesFromMarkdown`
- Sync metadata tracked (method, confidence, needsReview)
- Revalidates page for UI update

#### 2. Export New Action
**File**: `src/app/actions/annotations.ts`
**Location**: Top of file with other exports

```typescript
export { updateAnnotationRange } from './annotations'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`
- [ ] Zod schema validates correctly

#### Manual Verification:
- [ ] Server Action is callable from client
- [ ] Validation errors return proper messages
- [ ] Success case returns `{ success: true }`

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Phase 6: Testing and Edge Cases

### Overview
Comprehensive manual testing and edge case validation.

**Time Estimate**: 2-3 hours

### Testing Checklist

#### Basic Functionality:
- [ ] **Hover detection**:
  - Cursor changes to `col-resize` within 8px of edge
  - Cursor returns to normal outside edge zone
  - Works on both start and end edges

- [ ] **Drag initiation**:
  - Mousedown within edge zone starts resize
  - Mousedown outside edge zone doesn't start resize
  - Only left-click initiates resize

- [ ] **Live preview**:
  - Blue outline appears during drag
  - Preview updates smoothly during mousemove
  - Original highlight dims during resize
  - Preview disappears on mouseup

- [ ] **Auto-save**:
  - Mouseup triggers save
  - Success toast appears
  - Annotation updates in UI
  - PDF coordinates recalculated

#### Validation:
- [ ] **Minimum length (3 chars)**:
  - Drag that would create <3 chars is rejected
  - Error toast appears
  - Annotation reverts to original size

- [ ] **Maximum chunks (5)**:
  - Drag that would span >5 chunks is rejected
  - Error toast appears
  - Annotation reverts to original size

- [ ] **Word boundary snapping**:
  - Selection snaps to word boundaries
  - No partial words selected
  - Leading/trailing whitespace trimmed

#### Edge Cases:
- [ ] **Multi-chunk annotations**:
  - Resize works across multiple chunks
  - Chunk boundaries respected

- [ ] **Nested HTML**:
  - Resize works inside `<strong>`, `<em>`, `<a>` tags
  - HTML structure preserved

- [ ] **Long selections**:
  - Resize works on multi-paragraph annotations
  - Performance acceptable

- [ ] **Adjacent annotations**:
  - Can resize annotation next to another
  - Edge detection doesn't conflict

- [ ] **Bidirectional sync**:
  - After resize, switch to PDF view
  - Annotation appears at correct location
  - Highlight coordinates accurate

#### Error Handling:
- [ ] **Network errors**:
  - Failed save shows error toast
  - Annotation reverts to original

- [ ] **Invalid selections**:
  - Selection outside document bounds rejected
  - Proper error message shown

- [ ] **Concurrent operations**:
  - Can't resize two annotations simultaneously
  - Second drag is ignored until first completes

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] No linting errors: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] All testing checklist items pass
- [ ] No console errors during normal usage
- [ ] Performance acceptable (smooth 60fps drag)
- [ ] Works across different browsers (Chrome, Firefox, Safari)

### Service Restarts:
- [ ] Next.js: Verify auto-reload

---

## Testing Strategy

### Unit Tests (Future - Optional)
```typescript
// src/hooks/__tests__/useAnnotationResize.test.ts
describe('useAnnotationResize', () => {
  it('detects edge within 8px threshold', () => {})
  it('initiates resize on mousedown within edge zone', () => {})
  it('enforces 3-character minimum', () => {})
  it('enforces 5-chunk maximum', () => {})
  it('calls onResizeComplete with correct offsets', () => {})
  it('cleans up on mouseup', () => {})
})
```

### Integration Tests (Future - Optional)
```typescript
// tests/integration/annotation-resize.test.ts
describe('Annotation Resize Flow', () => {
  it('completes full resize with auto-save', () => {})
  it('shows error toast when validation fails', () => {})
  it('maintains bidirectional sync with PDF', () => {})
})
```

### Manual Testing (Current Focus)
- Comprehensive checklist above (Phase 6)
- Test with real documents (3+ different PDFs)
- Verify across different annotation lengths
- Test edge cases systematically

---

## Performance Considerations

### Optimization Strategies

**1. Debouncing (if needed)**:
```typescript
// Throttle mousemove to 60fps (16ms)
const throttledMouseMove = throttle(handleMouseMove, 16)
```

**2. Memoization**:
```typescript
// Cache chunk lookups during drag
const chunksRef = useRef(chunks)
const spannedChunksCache = useMemo(() => new Map(), [chunks])
```

**3. RAF for smooth updates**:
```typescript
// Use requestAnimationFrame for visual updates
requestAnimationFrame(() => {
  setResizeState(newState)
})
```

**Current approach**: Start simple, optimize if performance issues arise.

---

## Migration Notes

### Backward Compatibility
- ✅ Existing annotations work unchanged (no schema changes)
- ✅ Old `<mark>` tags migrated to `<span>` (Phase 2)
- ✅ PDF coordinates recalculated on first resize
- ✅ No data migration required

### Rollback Plan
If issues arise:
1. Remove resize hook integration from BlockRenderer
2. Keep existing annotation display (read-only)
3. Revert to create-delete workflow for adjustments

---

## References

### Rhizome Documentation
- `docs/ANNOTATIONS_SYSTEM.md` - Annotation architecture
- `docs/ECS_IMPLEMENTATION.md` - ECS pattern
- `docs/UI_PATTERNS.md` - Feature-rich components

### Implementation Examples
- `src/hooks/usePDFSelection.ts:50-239` - Two-phase selection pattern
- `src/components/reader/QuickCapturePanel.tsx:511-561` - Drag handler pattern
- `src/hooks/useTextSelection.ts:198-230` - Debounced selection
- `src/lib/reader/offset-calculator.ts:186-242` - Offset calculation
- `src/lib/reader/pdf-coordinate-mapper.ts:67-187` - Bidirectional sync

### External Resources
- [MDN Range API](https://developer.mozilla.org/en-US/docs/Web/API/Range)
- [MDN getBoundingClientRect](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
- [MDN Mouse Events](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent)
