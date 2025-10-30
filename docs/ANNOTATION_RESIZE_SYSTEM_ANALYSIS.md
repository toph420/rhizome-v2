# Annotation Resize System - Deep Analysis

**Created**: 2025-10-29
**Status**: ANALYSIS COMPLETE - Issues Identified
**Priority**: CRITICAL - Cross-block functionality broken

---

## 📋 EXECUTIVE SUMMARY

The annotation resize system allows users to adjust annotation boundaries by dragging hover-revealed handles. The system works well for **single-block annotations** but has critical issues with **cross-block annotations** due to virtualized scrolling architecture.

### Key Findings:
- ✅ **Architecture is sound**: Clean separation of concerns, proper coordinate mapping
- ✅ **Single-block resize works**: Handles appear on hover, dragging updates boundaries smoothly
- ❌ **Cross-block creation may fail**: Search-based injection has partial text matching issues
- ❌ **Cross-block resize is broken**: Virtualization prevents handle interaction for off-screen blocks
- ❌ **Preview system incomplete**: Can't show preview on unrendered blocks

---

## 🏗️ SYSTEM ARCHITECTURE

### Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Annotation Lifecycle                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. CREATE: User Selection → calculateMultiBlockOffsets()        │
│     ↓ Markdown offsets + text                                    │
│                                                                   │
│  2. STORE: createAnnotation Server Action                        │
│     ↓ 5-component ECS (Position, Visual, Content, Temporal,      │
│       ChunkRef)                                                   │
│                                                                   │
│  3. SYNC: calculatePdfCoordinatesFromMarkdown()                  │
│     ↓ PyMuPDF search (95% accuracy) → PDF rects                  │
│                                                                   │
│  4. PERSIST: Zustand Store (document-keyed)                      │
│     ↓ annotations[documentId][]                                  │
│                                                                   │
│  5. RENDER: VirtualizedReader → BlockRenderer                    │
│     ↓ Per-block injection                                        │
│                                                                   │
│  6. INJECT: injectAnnotations() → Annotation spans + handles     │
│     ↓ Search-based matching OR offset-based                      │
│                                                                   │
│  7. INTERACT: useAnnotationResize hook                           │
│     ↓ Handle hover/drag → Preview overlay                        │
│                                                                   │
│  8. UPDATE: updateAnnotationRange Server Action                  │
│     ↓ Recalculate PDF coordinates → Persist new offsets          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📐 ANNOTATION INJECTION SYSTEM

**File**: `src/lib/annotations/inject.ts`

### Purpose
Converts annotations (stored as markdown offsets) into visual DOM spans within rendered HTML blocks.

### Key Features

1. **Search-Based Matching (NEW)**:
   - Primary strategy: Search for `annotation.text` in block content
   - Fallback cascade: exact → case-insensitive → whitespace-normalized → aggressive → fuzzy → space-agnostic → word-based
   - Guarantees correct highlighting even if offsets drift
   - **Problem**: For cross-block annotations, searches for full text in each block independently

2. **Offset-Based Matching (LEGACY)**:
   - Falls back when `annotation.text` not provided
   - Calculates block-relative offsets from global offsets
   - Works reliably for single-block annotations

3. **Handle Injection**:
   ```typescript
   // Only inject handles on first and last spans
   if (annotationStartsInThisBlock && isFirstSpan) {
     // Inject start handle
     span.appendChild(startHandle)
   }

   if (annotationEndsInThisBlock && isLastSpan) {
     // Inject end handle (after text content)
     span.appendChild(endHandle)
   }
   ```

### Marker Attributes
- `data-annotation-id`: Unique annotation identifier
- `data-annotation-color`: Highlight color
- `data-annotation-start`: Present on first span (start of annotation)
- `data-annotation-end`: Present on last span (end of annotation)
- `data-edge="start|end"`: On handle elements

---

## 🎯 RESIZE HOOK ARCHITECTURE

**File**: `src/hooks/useAnnotationResize.ts`

### Workflow

```
┌──────────────────────────────────────────────────────────────┐
│                   Resize Operation Flow                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. HOVER: User hovers over annotation                       │
│     → CSS: [data-annotation-id]:hover .resize-handle         │
│     → Handles appear (12px wide, blue border)                │
│                                                               │
│  2. MOUSEDOWN: User clicks handle                            │
│     → Event listener (capture phase, passive: false)         │
│     → Find handle via: e.target.closest('.resize-handle')    │
│     → Read edge: handle.getAttribute('data-edge')            │
│     → Find annotation span: handle.closest('[data-annotation-id]')
│     → Set resizeState + isResizing = true                    │
│     → Prevent text selection: e.preventDefault()             │
│                                                               │
│  3. MOUSEMOVE: User drags                                    │
│     → RAF throttling (60fps max)                             │
│     → getCaretRangeFromPoint(x, y) - cross-browser           │
│     → calculateMultiBlockOffsets(range, snapToWord=true)     │
│     → Validate: min 3 chars, max 5 chunks                    │
│     → updatePreviewOverlay(newStart, newEnd)                 │
│     → Update resizeState with new offsets                    │
│                                                               │
│  4. PREVIEW: updatePreviewOverlay()                          │
│     → Query all visible blocks: [data-start-offset]          │
│     → For each block overlapping new range:                  │
│       - Walk DOM tree to find text nodes                     │
│       - Create Range, get ClientRects                        │
│       - Inject preview spans (fixed position, blue border)   │
│                                                               │
│  5. MOUSEUP: User releases                                   │
│     → Extract final text from visible blocks                 │
│     → Validate final range (3 chars min, 5 chunks max)       │
│     → Call updateAnnotationRange Server Action               │
│     → Server recalculates PDF coordinates (PyMuPDF)          │
│     → Cleanup: remove preview, reset state                   │
│     → Toast notification                                      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Key Implementation Details

**Handle Detection** (simplified after refactor):
```typescript
const handleMouseDown = (e: MouseEvent) => {
  const handle = e.target.closest('.resize-handle')
  if (!handle) return  // Not a handle click

  const edge = handle.getAttribute('data-edge')  // 'start' | 'end'
  const span = handle.closest('[data-annotation-id]')
  const annotationId = span.getAttribute('data-annotation-id')

  // No edge detection math! Handle IS the click target
  setResizeState({ annotationId, edge, ... })
}
```

**Validation**:
- Minimum length: 3 characters
- Maximum chunks: 5 chunks
- Prevents start from going past end (and vice versa)
- If validation fails, keeps last valid preview

**Performance**:
- RAF throttling prevents excessive DOM updates
- Block data cached on resize start
- Preview updates at 60fps max

---

## 🔄 BIDIRECTIONAL COORDINATE SYNC

### Markdown → PDF
**File**: `src/lib/reader/pdf-coordinate-mapper.ts`
**Function**: `calculatePdfCoordinatesFromMarkdown()`

**Strategy**: Fallback chain for optimal accuracy
1. **PyMuPDF text search** (95% accuracy, 50ms) - PRIMARY
2. **Bbox proportional filtering** (70-85% accuracy, instant) - FALLBACK
3. **Page-only positioning** (50% accuracy, instant) - LAST RESORT

```typescript
// After resize, recalculate PDF coordinates
const pdfResult = await calculatePdfCoordinatesFromMarkdown(
  documentId,
  newStartOffset,
  newEndOffset - newStartOffset,
  chunks
)

// Update Position component with new PDF rects
Position: {
  startOffset: newStart,
  endOffset: newEnd,
  pdfPageNumber: pdfResult.pageNumber,
  pdfRects: pdfResult.rects,  // Multiple rects for multi-line
  syncMethod: pdfResult.method,  // 'pymupdf' | 'bbox_proportional' | 'page_only'
  syncConfidence: pdfResult.confidence,
}
```

### PDF → Markdown
**File**: `src/lib/reader/text-offset-calculator.ts`
**Function**: `calculateMarkdownOffsets()`

Used for bidirectional sync when user creates annotation in PDF view.

---

## 🧱 BLOCK-LEVEL RENDERING

### VirtualizedReader
**File**: `src/components/reader/VirtualizedReader.tsx`

**Key Responsibilities**:
1. Parse markdown into blocks via `parseMarkdownToBlocks()`
2. Merge store annotations with optimistic annotations
3. Pass merged annotations to BlockRenderer
4. Handle viewport tracking (visible block range)
5. Enable resize hook (runs once for entire reader)

**Virtualization**: Powered by `react-virtuoso`
- Only renders visible blocks (overscan: 2000px)
- Blocks mounted/unmounted as user scrolls
- Performance optimization for large documents

### BlockRenderer
**File**: `src/components/reader/BlockRenderer.tsx`

**Per-Block Rendering**:
```typescript
// Filter annotations overlapping THIS block
const overlappingAnnotations = annotations.filter(
  ann => ann.endOffset > block.startOffset &&
         ann.startOffset < block.endOffset
)

// Inject annotations into block HTML
const annotatedHtml = injectAnnotations(
  block.html,
  block.startOffset,
  block.endOffset,
  overlappingAnnotations
)
```

**Key Point**: Each block processes annotations **independently**

---

## ⚠️ IDENTIFIED ISSUES

### Issue 1: Cross-Block Annotation Creation (PARTIAL FAILURE)

**Scenario**: User selects text spanning Block 5 → Block 8

**What Works**:
- ✅ `calculateMultiBlockOffsets()` correctly calculates global offsets
- ✅ Server Action creates annotation with correct offsets
- ✅ Each block filters and finds overlapping annotation
- ✅ Start marker placed on Block 5, end marker on Block 8

**What Fails**:
- ❌ **Search-based injection issue**: If `annotation.text` provided, `injectAnnotations` searches for **full text** in **each block independently**
  - Block 5 content: "Gothic Materialism argues that..."
  - Block 8 content: "...of representation precisely by..."
  - Annotation text: "Gothic Materialism argues... of representation precisely by..."
  - **Neither block contains the full text!**
  - Search fails → annotation.text not found warning → No highlight rendered

**Root Cause**: Search-based matching doesn't account for text split across blocks

**Workaround**: Offset-based fallback should work, but requires `annotation.text` to be `undefined`

---

### Issue 2: Cross-Block Resize (BROKEN - CRITICAL)

**Scenario**: User wants to resize annotation spanning Block 1 → Block 10, but only Block 1-3 are visible

**Virtualization Problem**:
```
Visible Blocks (in DOM):     Block 1, Block 2, Block 3
Annotation Spans:            Block 1 ─────────────────► Block 10
Handles Exist:               START handle ✅            END handle ❌
```

**Why It Fails**:
1. **Virtuoso unmounts off-screen blocks** (Block 4-10 not in DOM)
2. **End handle doesn't exist** (Block 10 not rendered)
3. **Can't click what's not there** (DOM element required for event)
4. **Hover CSS won't work** (`:hover` requires element in DOM)

**Impact**:
- User can resize start (Block 1 visible)
- User **cannot resize end** (Block 10 off-screen)
- Asymmetric functionality confusing

**Code Reference**:
```typescript
// In useAnnotationResize.ts:258
const handleMouseDown = (e: MouseEvent) => {
  const handle = e.target.closest('.resize-handle')
  if (!handle) return  // ❌ Block 10 handle doesn't exist in DOM

  // This code never runs for off-screen handles
}
```

---

### Issue 3: Incomplete Preview Overlay

**Problem**: Preview can only show on rendered (visible) blocks

**Code Analysis**:
```typescript
// In useAnnotationResize.ts:158
const updatePreviewOverlay = (startOffset, endOffset) => {
  // Query ALL blocks with offset data
  const blocks = document.querySelectorAll('[data-start-offset]')

  // ❌ Only finds VISIBLE blocks (virtualization)
  // Blocks 4-10 don't exist in DOM → no preview there

  for (const block of blocks) {
    // Only loops over visible blocks
    if (annotationOverlapsBlock) {
      // Create preview span
    }
  }
}
```

**Impact**:
- Preview shows correctly on visible portion
- Preview **missing** on off-screen portion
- User doesn't see full extent of resize

---

### Issue 4: Handle Positioning Edge Cases

**Current CSS**:
```css
.resize-handle {
  position: absolute;
  width: 12px;
  height: 20px;  /* ⚠️ Fixed height */
  top: 0;        /* ⚠️ Fixed to top/bottom */
}

.resize-handle-start { left: -14px; }
.resize-handle-end { bottom: 0; right: -14px; }
```

**Problems**:
1. **Fixed height**: 20px doesn't adapt to actual text line height
2. **Multi-line spans**: End handle positioned at bottom, but what if span wraps to 3 lines?
3. **Inline positioning**: Absolute positioning within inline `<span>` can be unpredictable

**Minor Issue**: Handles work but positioning could be more robust

---

## 🎯 ROOT CAUSE ANALYSIS

### Architectural Conflict

```
Virtuoso (Performance)          vs.      DOM Manipulation (Interaction)
─────────────────────────              ───────────────────────────────
✓ Only render visible blocks            ✗ Handles must exist in DOM
✓ Instant scrolling                     ✗ Can't click unmounted elements
✓ Memory efficient                      ✗ CSS :hover requires element
```

### Design Assumptions
The annotation system was designed with these assumptions:
1. ✅ Annotations can span multiple blocks (correct)
2. ✅ Each block independently injects its portion (correct for rendering)
3. ❌ **Handles on first/last block always available** (INCORRECT with virtualization)
4. ❌ **All blocks queryable for preview** (INCORRECT with virtualization)

### Why This Wasn't Caught Earlier
- Single-block annotations work perfectly (common case)
- Short cross-block annotations (2-3 blocks) often have both ends visible
- Long cross-block annotations (5+ blocks spanning pages) expose the issue

---

## 💡 POTENTIAL SOLUTIONS

### Solution A: Virtual Handle Overlay (RECOMMENDED)

**Concept**: Decouple handles from annotation spans; render as fixed-position overlays

**Implementation**:
```typescript
// New component: <AnnotationHandleOverlay />
function AnnotationHandleOverlay() {
  const annotations = useAnnotationStore(...)
  const visibleRange = useReaderStore(state => state.viewportOffsets)

  // For each annotation, calculate handle positions
  // based on scroll position and annotation offsets

  return annotations.map(ann => {
    const startPos = calculateHandlePosition(ann.startOffset, 'start')
    const endPos = calculateHandlePosition(ann.endOffset, 'end')

    return (
      <>
        {isHandleVisible(startPos) && (
          <div
            style={{ position: 'fixed', left: startPos.x, top: startPos.y }}
            className="virtual-resize-handle"
            data-annotation-id={ann.id}
            data-edge="start"
          />
        )}
        {isHandleVisible(endPos) && (
          <div
            style={{ position: 'fixed', left: endPos.x, top: endPos.y }}
            className="virtual-resize-handle"
            data-annotation-id={ann.id}
            data-edge="end"
          />
        )}
      </>
    )
  })
}
```

**Advantages**:
- ✅ Handles always available (not dependent on block rendering)
- ✅ Works across any distance
- ✅ Can show handles even if blocks not rendered
- ✅ Preview system can be extended similarly

**Challenges**:
- Need to calculate screen positions from markdown offsets
- Handle positions must update on scroll
- Performance: recalculate on every scroll event (RAF throttled)

---

### Solution B: Forced Block Rendering

**Concept**: Always keep first and last block of annotations in DOM

**Implementation**:
```typescript
// Modify Virtuoso configuration
<Virtuoso
  increaseViewportBy={({ top, bottom }) => {
    // Calculate if any annotation spans beyond viewport
    const annotationExtents = getAnnotationBlockExtents()

    // Force render blocks containing annotation starts/ends
    return {
      top: Math.max(top, annotationExtents.topExtension),
      bottom: Math.max(bottom, annotationExtents.bottomExtension)
    }
  }}
/>
```

**Advantages**:
- ✅ Simpler - reuses existing handle system
- ✅ No new overlay component needed

**Challenges**:
- May render many extra blocks (performance hit)
- Doesn't solve preview problem for middle blocks
- Complex coordination with Virtuoso's internal state

---

### Solution C: Auto-Scroll to Reveal Handles

**Concept**: When user starts resize, auto-scroll to ensure both handles visible

**Implementation**:
```typescript
const handleMouseDown = (e: MouseEvent) => {
  const annotationId = ...
  const annotation = findAnnotation(annotationId)

  // Check if both start and end are in viewport
  if (!isBothEndsVisible(annotation)) {
    // Scroll to make both visible
    virtuosoRef.current?.scrollToIndex({
      index: calculateBlockIndex(annotation.startOffset),
      align: 'start'
    })

    // Wait for scroll, then allow resize
    await waitForBlocks()
  }

  // Proceed with resize
}
```

**Advantages**:
- ✅ Simple implementation
- ✅ User sees what they're resizing

**Challenges**:
- ❌ Jarring UX (sudden scroll)
- ❌ For very long annotations, can't show both ends simultaneously
- ❌ Doesn't solve the discoverability problem (user doesn't know where handles are)

---

### Solution D: Disable Cross-Block Resize

**Concept**: Only allow resize when both ends are visible

**Implementation**:
```typescript
const handleMouseDown = (e: MouseEvent) => {
  const annotation = ...
  const bothEndsVisible = checkIfBothEndsInViewport(annotation)

  if (!bothEndsVisible) {
    toast.error('Please scroll to see both ends to resize')
    return
  }

  // Proceed with resize
}
```

**Advantages**:
- ✅ Extremely simple
- ✅ No performance impact
- ✅ No architectural changes

**Challenges**:
- ❌ Degrades functionality
- ❌ May not be possible for very long annotations
- ❌ Feels like a limitation, not a feature

---

## 🔍 RECOMMENDATIONS

### Immediate Actions

1. **Document the limitation**: Add warning in UI/docs that cross-block resize requires both ends visible
2. **Add validation**: Disable handles or show tooltip when ends not visible
3. **Fix search-based injection**: Modify `injectAnnotations` to handle cross-block text search

### Long-term Solution

**Implement Solution A: Virtual Handle Overlay**

**Reasoning**:
- Most robust solution
- Scales to any annotation length
- Provides best UX (handles always available)
- Enables future enhancements (handle-specific tooltips, drag preview across all blocks)

**Implementation Plan**:
1. Create `<AnnotationHandleOverlay />` component
2. Calculate handle positions from annotation offsets + scroll position
3. Render handles as fixed-position overlays
4. Keep existing handle-based interaction in `useAnnotationResize`
5. Extend preview system to query annotation data, not DOM blocks

---

## 📊 COMPARISON MATRIX

| Solution | Complexity | Performance | UX Quality | Scalability | Recommendation |
|----------|-----------|-------------|-----------|-------------|----------------|
| A. Virtual Handles | High | Good | Excellent | Excellent | ⭐⭐⭐⭐⭐ BEST |
| B. Forced Rendering | Medium | Poor | Good | Poor | ⭐⭐ |
| C. Auto-Scroll | Low | Good | Fair | Fair | ⭐⭐ |
| D. Disable | Very Low | Excellent | Poor | Poor | ⭐ TEMPORARY |

---

## 📝 ADDITIONAL OBSERVATIONS

### What Works Well
- ✅ Clean ECS architecture (5 components, proper separation)
- ✅ Bidirectional PDF ↔ Markdown sync (95% accuracy)
- ✅ Search-based injection for single-block (robust matching)
- ✅ RAF-throttled preview updates (smooth 60fps)
- ✅ Server Action pattern (clean mutation flow)
- ✅ Block caching during resize (performance optimization)

### Technical Debt
- Multi-strategy text matching has high complexity (7 fallback strategies)
- CSS handle positioning could be more robust (fixed height)
- Preview system coupled to DOM queries (should use annotation data)

### Future Enhancements
- Keyboard shortcuts for resize (arrow keys)
- Resize preview shows character count
- Undo/redo for resize operations
- Multi-annotation batch resize
- Touch support for tablets

---

## 🎓 KEY INSIGHTS

### Design Pattern: Handle Injection

**Current (DOM-embedded)**:
```html
<span data-annotation-id="abc">
  <span class="resize-handle resize-handle-start"></span>
  Annotation text
  <span class="resize-handle resize-handle-end"></span>
</span>
```

**Proposed (Overlay)**:
```html
<!-- Annotation span (no handles) -->
<span data-annotation-id="abc">Annotation text</span>

<!-- Separate overlay layer -->
<div class="annotation-handles-overlay">
  <div class="virtual-handle" style="position:fixed; left:100px; top:200px" />
  <div class="virtual-handle" style="position:fixed; left:500px; top:400px" />
</div>
```

### Virtualization Trade-off

Virtualization is critical for performance but requires careful consideration for interactive features:
- **Read-only** features work great (highlighting, display)
- **Interactive** features need special handling (resize, drag, context menus)
- **Solution**: Decouple interaction from rendered content

---

**END OF ANALYSIS**
