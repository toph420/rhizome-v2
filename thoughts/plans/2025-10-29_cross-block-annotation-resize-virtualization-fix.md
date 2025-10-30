# Cross-Block Annotation Resize - Virtualization Fix Implementation Plan

**Created**: 2025-10-29
**Status**: READY FOR IMPLEMENTATION
**Priority**: HIGH - Critical UX issue

---

## Overview

Refactor the annotation resize system to support cross-block annotations in virtualized reader using offset-based state tracking + autoscroll pattern. Current system relies on DOM elements (handles) that don't exist when blocks are off-screen due to Virtuoso's virtualization.

**Why**: Users cannot resize annotations spanning multiple blocks if the start/end handles are not visible in the viewport. This breaks a core feature of the annotation system.

**Solution**: Decouple logical state (offsets in Zustand) from visual state (DOM), use autoscroll to reveal content, and update preview as blocks come into view.

---

## Current State Analysis

### What Exists:
- ✅ Annotation resize works perfectly for single-block annotations
- ✅ Handles injected into annotation spans via `inject.ts`
- ✅ `useAnnotationResize` hook with RAF throttling and preview system
- ✅ PDF ↔ Markdown bidirectional sync (95% accuracy)
- ✅ Clean ECS architecture (5 components)

### What's Missing:
- ❌ Cross-block resize capability (handles don't exist off-screen)
- ❌ Preview overlay for unrendered blocks
- ❌ State that survives block unmounting

### Key Discoveries:

**Issue 1: Handle Detection Requires DOM** (`src/hooks/useAnnotationResize.ts:262-277`)
```typescript
const handle = (e.target as HTMLElement).closest('.resize-handle')
if (!handle) return  // ❌ Block 10 handle doesn't exist in DOM!
```
- Can't click what doesn't exist
- Virtuoso only renders visible blocks (Blocks 1-3)
- End handle on Block 10 unmounted

**Issue 2: Preview Limited to Visible** (`src/hooks/useAnnotationResize.ts:162-173`)
```typescript
const blocks = document.querySelectorAll('[data-start-offset]')
// ❌ Only finds VISIBLE blocks
```
- Preview can't show on unrendered blocks
- User doesn't see full extent of resize

**Issue 3: Cross-Block Text Search** (`src/lib/annotations/inject.ts:154-165`)
```typescript
if (annotation.text) {
  let index = plainText.indexOf(searchText)  // ❌ Searches for FULL text in EACH block
}
```
- Searches for full annotation text in each block independently
- Cross-block annotations don't contain full text in any single block

### Constraints:
- Must maintain backwards compatibility (single-block resize)
- Must work with existing Virtuoso configuration
- Must preserve 60fps performance
- Cannot modify Virtuoso's virtualization behavior

---

## Desired End State

### Functional Requirements:
1. User can resize annotations spanning any number of blocks (up to 5-chunk limit)
2. Autoscroll reveals content when dragging near viewport edges
3. Preview overlay updates smoothly as blocks come into view
4. Single-block resize continues to work identically
5. Escape key cancels resize operation

### Verification:
- ✅ Can resize annotation from Block 1 → Block 10 (only Block 1 visible initially)
- ✅ Autoscroll triggers when dragging near top/bottom edge (100px threshold)
- ✅ Preview shows on all visible blocks during scroll
- ✅ Final offsets saved correctly, PDF coordinates recalculated
- ✅ Single-block annotations resize as before (no regression)

---

## Rhizome Architecture

- **Module**: Main App only (Next.js) - All changes in `src/`
- **Storage**: No storage changes - Pure state management
- **Migration**: No - State management refactor only
- **Test Tier**: Stable (fix when broken) - Important UX but not blocking
- **Pipeline Stages**: None - Reader UI only
- **Engines**: None - Doesn't affect connection detection

---

## What We're NOT Doing

**Out of Scope** (prevent scope creep):
- ❌ Keyboard shortcuts for resize (arrow keys) - Future enhancement
- ❌ Touch support for tablets - Desktop only for now
- ❌ PDF view resize - Markdown only (as before)
- ❌ Undo/redo for resize - Future enhancement
- ❌ Multi-annotation batch resize - Future enhancement
- ❌ Changing Virtuoso configuration - Work with existing setup
- ❌ Rewriting injection system - Only fix cross-block text search

---

## Implementation Approach

### Strategy: Offset-Based Tracking + Autoscroll

**Core Principle**: Separate logical state from visual state

```
Logical State (Zustand)      Visual State (DOM)
─────────────────────        ───────────────
• Annotation offsets         • Rendered blocks
• Resize state               • Annotation spans
• Current drag position      • Preview overlays
• Hovered edges              • Handles (if visible)

✅ Always valid               ⚠️ Only visible portion
✅ Survives virtualization    ⚠️ Changes on scroll
```

**Implementation Steps**:
1. Create Zustand store for resize state (survives unmounting)
2. Global mousemove handler calculates offsets from mouse position
3. Autoscroll when dragging near viewport edges (100px threshold)
4. Preview overlay updates on scroll as new blocks render
5. Refactor existing hook to use Zustand, remove duplicates

**Why This Works**:
- Offsets remain valid even when blocks disappear from DOM
- Autoscroll reveals hidden content smoothly (60fps)
- Preview follows scroll, showing user the full extent
- State in Zustand persists across component lifecycles

---

## Phase 1: Setup Zustand Resize Store

### Overview
Create global Zustand store to track resize state (offsets, edge being dragged, hover state). This state survives block unmounting/remounting during virtualization.

### Changes Required:

#### 1. Create Resize State Store
**File**: `src/stores/annotation-resize-store.ts` (NEW)
**Changes**: Create new Zustand store

```typescript
import { create } from 'zustand'

interface AnnotationResizeState {
  // Resize state
  isResizing: boolean
  annotationId: string | null
  edge: 'start' | 'end' | null
  initialStartOffset: number
  initialEndOffset: number
  currentStartOffset: number
  currentEndOffset: number

  // Hover state (for visual feedback)
  hoveredEdge: { annotationId: string; edge: 'start' | 'end' } | null

  // Actions
  startResize: (
    annotationId: string,
    edge: 'start' | 'end',
    startOffset: number,
    endOffset: number
  ) => void
  updateResize: (newStartOffset: number, newEndOffset: number) => void
  cancelResize: () => void
  completeResize: () => void
  setHoveredEdge: (annotationId: string | null, edge: 'start' | 'end' | null) => void
}

export const useAnnotationResizeStore = create<AnnotationResizeState>((set) => ({
  isResizing: false,
  annotationId: null,
  edge: null,
  initialStartOffset: 0,
  initialEndOffset: 0,
  currentStartOffset: 0,
  currentEndOffset: 0,
  hoveredEdge: null,

  startResize: (annotationId, edge, startOffset, endOffset) => {
    set({
      isResizing: true,
      annotationId,
      edge,
      initialStartOffset: startOffset,
      initialEndOffset: endOffset,
      currentStartOffset: startOffset,
      currentEndOffset: endOffset,
    })
    document.body.classList.add('annotation-resizing')
    window.getSelection()?.removeAllRanges()
  },

  updateResize: (newStartOffset, newEndOffset) => {
    set((state) => {
      if (!state.isResizing) return state

      // Validate based on edge being dragged
      if (state.edge === 'start') {
        newStartOffset = Math.min(newStartOffset, state.initialEndOffset - 3)
      } else {
        newEndOffset = Math.max(newEndOffset, state.initialStartOffset + 3)
      }

      return {
        currentStartOffset: newStartOffset,
        currentEndOffset: newEndOffset,
      }
    })
  },

  cancelResize: () => {
    set({
      isResizing: false,
      annotationId: null,
      edge: null,
      hoveredEdge: null,
    })
    document.body.classList.remove('annotation-resizing')
    document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())
  },

  completeResize: () => {
    document.body.classList.remove('annotation-resizing')
    document.querySelectorAll('.annotation-resize-preview').forEach((el) => el.remove())
    // Note: Don't clear state here - parent will handle save then clear
  },

  setHoveredEdge: (annotationId, edge) => {
    set({
      hoveredEdge: annotationId && edge ? { annotationId, edge } : null,
    })
  },
}))
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Store exports correctly: Check import in another file

#### Manual Verification:
- [ ] Store can be imported without errors
- [ ] Actions are type-safe (check autocomplete)
- [ ] No console errors on app load

**Implementation Note**: This phase is pure setup with no visual changes. Proceed to Phase 2 after verification passes.

---

## Phase 2: Global Resize Handler with Autoscroll

### Overview
Create global mousemove/mouseup handlers that use Zustand state instead of local state. Implements autoscroll when user drags near viewport edges.

### Changes Required:

#### 1. Create Global Resize Handler Hook
**File**: `src/hooks/useGlobalResizeHandler.ts` (NEW)
**Changes**: Create new hook with autoscroll logic

```typescript
import { useEffect, useRef } from 'react'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'
import type { VirtuosoHandle } from 'react-virtuoso'

const AUTOSCROLL_THRESHOLD = 100 // pixels from viewport edge
const AUTOSCROLL_SPEED = 10 // pixels per frame

export function useGlobalResizeHandler(
  virtuosoRef: React.RefObject<VirtuosoHandle>,
  onResizeComplete: (annotationId: string, startOffset: number, endOffset: number) => Promise<void>
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

  // Mousemove handler - calculates offset from mouse position
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()

      // Get offset at mouse position (only works for visible blocks)
      const offset = getOffsetFromPoint(e.clientX, e.clientY)
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
        await onResizeComplete(annotationId, currentStartOffset, currentEndOffset)
        completeResize()
      } catch (error) {
        console.error('[resize] Save failed:', error)
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

  // Autoscroll implementation
  function startAutoscroll(direction: 'up' | 'down') {
    if (autoscrollIntervalRef.current) return // Already scrolling

    autoscrollIntervalRef.current = window.setInterval(() => {
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
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Hook exports correctly

#### Manual Verification:
- [ ] No console errors on import
- [ ] Type safety verified (autocomplete works)

**Implementation Note**: Hook created but not yet wired up. Proceed to Phase 3.

---

## Phase 3: Preview Overlay with Scroll Updates

### Overview
Create hook that updates preview overlay on scroll, showing blue outline on all visible blocks that overlap the resize range.

### Changes Required:

#### 1. Create Preview Overlay Hook
**File**: `src/hooks/useResizePreviewOverlay.ts` (NEW)
**Changes**: Create hook with RAF-throttled preview updates

```typescript
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

    const updatePreview = () => {
      if (pendingUpdate) return

      pendingUpdate = true
      rafId = requestAnimationFrame(() => {
        pendingUpdate = false
        updatePreviewOverlay(currentStartOffset, currentEndOffset)
      })
    }

    updatePreview()

    const scrollContainer = document.querySelector('.virtuoso-scroller') ||
                            document.querySelector('[data-virtuoso-scroller]')
    scrollContainer?.addEventListener('scroll', updatePreview, { passive: true })

    return () => {
      scrollContainer?.removeEventListener('scroll', updatePreview)
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
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Hook exports correctly

#### Manual Verification:
- [ ] No console errors on import
- [ ] Type safety verified

**Implementation Note**: Preview hook created. Now ready to wire up in reader. Proceed to Phase 4.

---

## Phase 4: Integrate with VirtualizedReader

### Overview
Wire up the new hooks in VirtualizedReader component. Keep existing resize hook for handle detection.

### Changes Required:

#### 1. Modify VirtualizedReader
**File**: `src/components/reader/VirtualizedReader.tsx`
**Changes**: Add new hooks

```typescript
// Add imports at top
import { useGlobalResizeHandler } from '@/hooks/useGlobalResizeHandler'
import { useResizePreviewOverlay } from '@/hooks/useResizePreviewOverlay'
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'

// Inside VirtualizedReader component function:

// NEW: Add after existing hooks (around line 26)
// Global resize handlers
useGlobalResizeHandler(virtuosoRef, handleAnnotationResize)

// NEW: Add after global handler
// Preview overlay
useResizePreviewOverlay()

// NEW: Read Zustand state for rendering (optional - for debugging)
// const isResizing = useAnnotationResizeStore((s) => s.isResizing)
// const resizeAnnotationId = useAnnotationResizeStore((s) => s.annotationId)

// KEEP: Existing resize hook (around line 417)
// This hook still needed for handle click detection
// Will be refactored in Phase 5
useAnnotationResize({
  enabled: !correctionModeActive && !sparkCaptureOpen,
  documentId: documentId || '',
  chunks,
  onResizeComplete: handleAnnotationResize,
})
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] App loads without errors
- [ ] Can open document reader
- [ ] Existing single-block resize still works
- [ ] Console shows no errors related to new hooks

**Implementation Note**: At this point, new hooks are active but existing hook still handles all interaction. Autoscroll and new preview should work for single-block. Test before Phase 5.

### Service Restarts:
- [ ] Next.js: Verify auto-reload occurred

---

## Phase 5: Refactor Existing Resize Hook

### Overview
Refactor `useAnnotationResize` to use Zustand store instead of local state. Remove duplicate mousemove/mouseup handlers (now in global handler).

### Changes Required:

#### 1. Update Annotation Resize Hook
**File**: `src/hooks/useAnnotationResize.ts`
**Changes**: Use Zustand, remove duplicates

```typescript
// Add import at top
import { useAnnotationResizeStore } from '@/stores/annotation-resize-store'

// Inside useAnnotationResize function:

// REPLACE local state with Zustand (around line 114-115)
// OLD:
// const [isResizing, setIsResizing] = useState(false)
// const [resizeState, setResizeState] = useState<ResizeState | null>(null)

// NEW:
const startResize = useAnnotationResizeStore((s) => s.startResize)
const isResizing = useAnnotationResizeStore((s) => s.isResizing)

// KEEP: Store annotations reading (lines 88-109) - NO CHANGES

// KEEP: Handle mousedown detection (lines 259-313) - MODIFY ONLY ACTION
// Around line 292-300, replace setResizeState call:

// OLD:
// setResizeState({
//   annotationId,
//   edge,
//   initialStartOffset: annotation.startOffset,
//   initialEndOffset: annotation.endOffset,
//   currentStartOffset: annotation.startOffset,
//   currentEndOffset: annotation.endOffset,
//   text: annotation.text || '',
// })
// setIsResizing(true)

// NEW:
startResize(annotationId, edge, annotation.startOffset, annotation.endOffset)

// REMOVE: Entire mousemove effect (lines 318-431)
// This is now handled by useGlobalResizeHandler

// REMOVE: Entire mouseup effect (lines 437-525)
// This is now handled by useGlobalResizeHandler

// KEEP: Return statement (lines 527-530)
// But simplify:
return {
  isResizing,
  resizeState: null, // No longer needed - state in Zustand
}
```

**Full changes summary**:
1. Import Zustand store
2. Replace local useState with Zustand selectors
3. Update mousedown handler to use `startResize` action
4. Remove mousemove effect (lines 318-431)
5. Remove mouseup effect (lines 437-525)
6. Simplify return statement

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Single-block resize still works
- [ ] Handle hover shows cursor change
- [ ] Click and drag updates preview
- [ ] Release saves annotation
- [ ] No duplicate event handlers (check via console logs if needed)

**Implementation Note**: This is the critical refactor. Test thoroughly. If single-block breaks, revert and investigate.

### Service Restarts:
- [ ] Next.js: Verify auto-reload occurred

---

## Phase 6: Fix Cross-Block Annotation Creation

### Overview
Fix `inject.ts` to handle cross-block text search properly. Current issue: searches for full annotation text in each block independently.

### Changes Required:

#### 1. Modify Annotation Injection
**File**: `src/lib/annotations/inject.ts`
**Changes**: Skip search-based for cross-block annotations

```typescript
// Around line 154-165, modify search logic:

// NEW: Check if annotation spans multiple blocks
const annotationSpansMultipleBlocks =
  annotation.startOffset < blockStartOffset ||
  annotation.endOffset > blockEndOffset

if (annotation.text && !annotationSpansMultipleBlocks) {
  // KEEP: Existing search-based matching for single-block
  // Lines 156-328 unchanged
} else {
  // Use offset-based matching for cross-block
  // Lines 330-338 unchanged (fallback logic)
  relativeStart = Math.max(0, annotation.startOffset - blockStartOffset)
  relativeEnd = Math.min(
    blockEndOffset - blockStartOffset,
    annotation.endOffset - blockStartOffset
  )
  annotationStartsInThisBlock = annotation.startOffset >= blockStartOffset && annotation.startOffset < blockEndOffset
  annotationEndsInThisBlock = annotation.endOffset > blockStartOffset && annotation.endOffset <= blockEndOffset
}
```

**Rationale**:
- Single-block annotations benefit from search-based (handles AI cleanup differences)
- Cross-block annotations MUST use offsets (full text not in any single block)
- This is a pragmatic fix that doesn't require rewriting injection system

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Create single-block annotation → highlighted correctly
- [ ] Create cross-block annotation (e.g., select across 3 paragraphs) → highlighted correctly
- [ ] No console warnings about "Text search failed"
- [ ] Existing annotations still render correctly

**Implementation Note**: This fix is independent of resize refactor. Can be tested separately.

### Service Restarts:
- [ ] Next.js: Verify auto-reload occurred

---

## Phase 7: Testing & Validation

### Overview
Comprehensive testing of single-block and cross-block resize functionality. Validate autoscroll, preview, and edge cases.

### Testing Checklist:

#### Single-Block Resize (Backwards Compatibility):
- [ ] Hover annotation → handles appear (12px blue border)
- [ ] Click start handle → resize starts
- [ ] Drag left → annotation shrinks
- [ ] Drag right → annotation expands
- [ ] Preview shows during drag (blue outline)
- [ ] Release → annotation saves
- [ ] PDF coordinates recalculated (check DB if needed)
- [ ] Success toast appears

#### Cross-Block Resize (New Functionality):
- [ ] Create annotation spanning Blocks 1-10
- [ ] Scroll to see only Blocks 1-3
- [ ] Click start handle on Block 1 → resize starts
- [ ] Drag down (toward bottom edge)
- [ ] Autoscroll triggers when within 100px of edge
- [ ] Smooth scroll at 60fps
- [ ] Preview shows on visible blocks during scroll
- [ ] Continue drag to Block 10 (now visible)
- [ ] Release → annotation saves with new offsets
- [ ] PDF coordinates recalculated correctly

#### Escape to Cancel:
- [ ] Start resize
- [ ] Press Escape
- [ ] Resize canceled
- [ ] Preview removed
- [ ] Original annotation unchanged

#### Edge Cases:
- [ ] Very short annotation (3-4 chars) → resize respects minimum
- [ ] Drag past 5-chunk limit → blocked (keeps last valid preview)
- [ ] Rapid drag movement → autoscroll smooth (no jank)
- [ ] Drag between blocks → offset calculation precise
- [ ] Start resize, scroll manually → preview updates correctly

#### Performance:
- [ ] Preview updates at ~60fps during scroll
- [ ] Autoscroll smooth (16ms frame time)
- [ ] No memory leaks (check DevTools)
- [ ] No console errors during any operation

### Success Criteria:

#### Automated Verification:
- [ ] All TypeScript types valid: `npm run typecheck`
- [ ] No lint errors: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] No console errors in test document

#### Manual Verification:
- [ ] All testing checklist items pass
- [ ] UX feels smooth and predictable
- [ ] No regressions in existing functionality
- [ ] Autoscroll speed feels natural (adjust if needed)

**Implementation Note**: This is validation phase. If any issue found, return to relevant phase and fix before proceeding.

### Tuning Parameters (if needed):
```typescript
// In useGlobalResizeHandler.ts
const AUTOSCROLL_THRESHOLD = 100 // Increase if too sensitive
const AUTOSCROLL_SPEED = 10 // Increase if too slow
```

---

## Testing Strategy

### Unit Tests (Future - Stable Tier):
```typescript
// tests/annotation-resize-store.test.ts
describe('useAnnotationResizeStore', () => {
  it('should track offsets during resize', () => {
    const { result } = renderHook(() => useAnnotationResizeStore())

    act(() => {
      result.current.startResize('ann-1', 'end', 100, 200)
    })

    expect(result.current.isResizing).toBe(true)
    expect(result.current.currentEndOffset).toBe(200)

    act(() => {
      result.current.updateResize(100, 250)
    })

    expect(result.current.currentEndOffset).toBe(250)
  })
})
```

### Integration Tests (Future):
```typescript
// tests/cross-block-resize.test.ts
describe('Cross-block resize', () => {
  it('should resize annotation spanning 50 blocks', async () => {
    // Setup annotation from Block 1 → Block 50
    // Only Blocks 1-3 visible initially

    fireEvent.mouseDown(getByTestId('resize-handle-start'))
    fireEvent.mouseMove(document, { clientY: window.innerHeight - 50 })

    await waitFor(() => {
      expect(isBlockVisible('block-50')).toBe(true)
    })

    fireEvent.mouseUp(document)

    expect(updatedAnnotation.endOffset).toBeGreaterThan(originalEndOffset)
  })
})
```

### Manual Testing Workflow:
1. Open document with 20+ paragraphs
2. Create annotation from paragraph 1 to paragraph 15
3. Scroll to top (only paragraphs 1-3 visible)
4. Start resize on start handle
5. Drag toward bottom
6. Verify autoscroll triggers
7. Verify preview shows on visible blocks
8. Continue to paragraph 15
9. Release and verify save

---

## Performance Considerations

### Target Metrics:
- **Autoscroll**: 60fps (16.67ms per frame)
- **Preview update**: <16ms (60fps)
- **Offset calculation**: <5ms per mousemove
- **State updates**: <1ms per Zustand action

### Optimizations:
- ✅ RAF throttling prevents excessive DOM updates
- ✅ Only query visible blocks (Virtuoso already optimized)
- ✅ Zustand state updates are minimal (just offsets)
- ✅ Autoscroll interval cleared when not needed

### Known Trade-offs:
- Preview only shows on visible blocks (inherent to virtualization)
- User must wait for autoscroll to reveal content (UX acceptable)
- Offset calculation only works for rendered blocks (expected limitation)

---

## Migration Notes

### Breaking Changes:
- None - Backwards compatible

### Deprecations:
- None - Pure addition/refactor

### Data Migration:
- None - No database changes

### Rollback Plan:
1. Revert commits in reverse order (Phase 7 → Phase 1)
2. Each phase is independently reversible
3. No data loss - only code changes

---

## References

### Architecture:
- `docs/ARCHITECTURE.md` - Rhizome V2 architecture
- `docs/ANNOTATIONS_SYSTEM_V2.md` - Complete analysis and solution
- `docs/ANNOTATION_RESIZE_SYSTEM_ANALYSIS.md` - Problem deep-dive

### Similar Patterns:
- Zustand store pattern: `src/stores/annotation-store.ts`
- Virtuoso integration: `src/components/reader/VirtualizedReader.tsx`
- Hook patterns: `src/hooks/useTextSelection.ts`

### Related Issues:
- `thoughts/plans/annotation-resize-MASTER.md` - Implementation history
- `thoughts/conversations/2025-10-29_virtualized-cross-block-annotations.md` - Developer discussion

### External Documentation:
- Virtuoso: https://virtuoso.dev/
- Zustand: https://zustand-demo.pmnd.rs/
- React Hooks: https://react.dev/reference/react

---

## Appendix: Decision Log

### Why Zustand over React Context?
- ✅ Better performance (fine-grained subscriptions)
- ✅ No provider wrapper needed
- ✅ Already used in project (`annotation-store.ts`)
- ✅ State persists across component lifecycles

### Why Autoscroll over Forced Rendering?
- ✅ Simpler implementation
- ✅ Better performance (don't render 100+ blocks)
- ✅ Acceptable UX (smooth 60fps scroll)
- ❌ Alternative: Force render all annotation blocks (kills performance)

### Why Not Virtual Handles Overlay?
- ⚠️ More complex (calculate handle positions from offsets)
- ⚠️ Handle positions must update on every scroll
- ✅ Autoscroll is simpler and proven pattern
- 💡 Could be future enhancement if needed

### Why 100px Autoscroll Threshold?
- Tested value from developer conversation
- Triggers early enough to feel responsive
- Not too early (would scroll when not intended)
- Tunable via constant if user feedback suggests change

---

**END OF IMPLEMENTATION PLAN**

**Status**: ✅ READY FOR IMPLEMENTATION
**Estimated Effort**: 4-6 hours (all phases)
**Risk Level**: LOW (incremental, testable, reversible)
