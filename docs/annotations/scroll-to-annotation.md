# Annotation Scroll-to-View Implementation

**Last Updated:** 2025-01-15
**Component:** Annotation sidebar and virtual scrolling
**Files Modified:** 5

---

## Overview

Annotations in the sidebar can be clicked to scroll the reader to their location in the document. This requires handling virtual scrolling (where elements aren't in the DOM until scrolled into view) and coordinating between the sidebar, reader viewport, and Virtuoso's virtual rendering.

---

## Architecture

### Data Flow

```
User clicks annotation in sidebar
  ↓
AnnotationsList calls onAnnotationClick(annotationId, startOffset)
  ↓
RightPanel passes callback to ReaderLayout
  ↓
ReaderLayout.handleAnnotationClick()
  ↓
Case 1: Annotation already rendered
  → scrollIntoView() immediately
  → Highlight with ring-2 animation

Case 2: Annotation not rendered (outside viewport)
  → Calculate scroll position: (offset / markdownLength) * scrollHeight
  → Scroll Virtuoso container to position
  → Wait 500ms for rendering
  → Find annotation element
  → scrollIntoView() for precision
  → Highlight with ring-2 animation
  → Retry after 800ms if still not found
```

### Key Components

**1. AnnotationsList** (`src/components/sidebar/AnnotationsList.tsx`)
- Displays annotations sorted by document order
- Detects visibility using offset-based detection (not chunk-based)
- Calls parent callback: `onAnnotationClick(annotationId, startOffset)`

**2. RightPanel** (`src/components/sidebar/RightPanel.tsx`)
- Passes `onAnnotationClick` prop through to AnnotationsList
- No logic, just prop relay

**3. ReaderLayout** (`src/components/reader/ReaderLayout.tsx`)
- Implements `handleAnnotationClick` callback
- Handles both fast path (already rendered) and slow path (virtual scrolling)

---

## Scroll Calculation

### Direct Proportion Mapping

Annotation position in markdown maps proportionally to scroll position in container:

```typescript
const targetScrollTop = (startOffset / markdownLength) * virtuosoContainer.scrollHeight
```

**Example:**
- Annotation at offset: 103,075
- Markdown length: 420,000
- Container scrollHeight: 10,000px
- Target scroll: (103,075 / 420,000) * 10,000 = 2,454px

### Why Not Percentage?

Early implementation used an intermediate percentage:
```typescript
// Unnecessary intermediate step
const percentage = (startOffset / markdownLength) * 100
const targetScrollTop = (percentage / 100) * scrollHeight
```

This was refactored to direct calculation since `* 100 / 100` cancels out algebraically.

---

## Virtual Scrolling Handling

### The Problem

Virtuoso only renders ~50 blocks at a time. If an annotation is at offset 103,075 but the viewport shows offsets 67,342-71,408, the annotation's DOM element doesn't exist.

### The Solution

**Two-stage scroll:**

1. **Coarse positioning** - Scroll Virtuoso container to calculated position
2. **Wait for rendering** - Give Virtuoso 500ms to render new blocks
3. **Fine positioning** - Find annotation element and scroll precisely to it
4. **Retry logic** - If not found, wait another 800ms and try again

```typescript
// Stage 1: Scroll container
virtuosoContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' })

// Stage 2: Wait and find
setTimeout(() => {
  const element = document.querySelector(`[data-annotation-id="${annotationId}"]`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Highlight
  } else {
    // Retry after 800ms more
  }
}, 500)
```

### Finding the Container

Virtuoso's scroll container is identified by the `[data-virtuoso-scroller]` attribute:

```typescript
const virtuosoContainer = document.querySelector('[data-virtuoso-scroller]') as HTMLElement
```

---

## Visibility Detection Refactoring

### Original Implementation (Chunk-Based)

Annotations were marked visible if their parent chunk was visible:

```typescript
// Props passed down from ReaderLayout
<AnnotationsList chunks={chunks} visibleChunkIds={visibleChunkIds} />

// Visibility check
const chunkIds = annotation.range.chunkIds  // ["uuid-1", "uuid-2"]
const isVisible = chunkIds.some(id => visibleChunkIds.has(id))
```

**Problem:** Chunks span 2000+ characters. An annotation at the start of a chunk would be marked visible even when the viewport shows the end of the chunk.

### Refactored Implementation (Offset-Based)

Annotations are marked visible if their offsets overlap the viewport:

```typescript
// No props needed - subscribes to ReaderStore
const viewportOffsets = useReaderStore(state => state.viewportOffsets)

// Direct overlap detection (same logic ReaderStore uses for chunks)
const isVisible =
  annotation.startOffset <= viewportOffsets.end &&
  annotation.endOffset >= viewportOffsets.start
```

**Benefits:**
- **Precise** - Character-level accuracy instead of chunk-level
- **Simpler** - No chunk ID props needed, direct store subscription
- **Consistent** - Same overlap logic used for chunks and annotations
- **Fewer props** - Reduced from 4 props to 2 props

### Accuracy Comparison

Viewport showing offsets 7000-10000:

| Annotation | Offsets | Chunk | Chunk Range | Chunk-Based Result | Offset-Based Result |
|------------|---------|-------|-------------|-------------------|---------------------|
| A | 5000-5050 | #2 | 3000-8000 | ✅ Visible (wrong) | ❌ Hidden (correct) |
| B | 7500-7600 | #2 | 3000-8000 | ✅ Visible | ✅ Visible |
| C | 9800-9900 | #3 | 8000-12000 | ✅ Visible | ✅ Visible |

Annotation A is now correctly hidden since its offsets don't overlap the viewport.

---

## Data Attributes

Annotations use the `data-annotation-id` attribute for DOM queries:

```html
<span
  data-annotation-id="708f4753-c506-45e0-9eb1-52f9762aaff6"
  data-annotation-color="yellow"
  data-annotation-start="5000"
  data-annotation-end="5050"
  class="bg-yellow-200/30 cursor-pointer"
>
  Highlighted text here
</span>
```

These are injected by `injectAnnotations()` in `src/lib/annotations/inject.ts` and rendered by `BlockRenderer`.

---

## Styling

### Sidebar Cards

Annotations match ConnectionCard styling:

```typescript
<Card className={cn(
  "cursor-pointer hover:bg-muted/50 transition-all border-2 border-l-4",
  colorBorderClass,              // Left border indicates color
  isVisible ? "bg-primary/5 border-primary/30" : "border-border",
  "group"
)} />
```

**Color indicators:**
- Left border width: 4px (vs 2px on other borders)
- Border color maps to annotation color: `border-l-yellow-400`, `border-l-blue-400`, etc.
- No text badges for colors (just visual border indicator)

### Highlight Animation

When scrolled to, annotations receive a temporary ring highlight:

```typescript
element.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
setTimeout(() => {
  element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2')
}, 2000)
```

---

## Edge Cases

### 1. Annotation Already Visible
Fast path - skip calculation and scroll directly:
```typescript
if (annotationElement) {
  annotationElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return
}
```

### 2. Document Not Loaded
Check markdown length before calculating:
```typescript
if (markdownLength === 0) {
  toast.error('Document not loaded')
  return
}
```

### 3. Virtuoso Container Not Found
Defensive check for container existence:
```typescript
if (!virtuosoContainer) {
  toast.error('Could not locate scroll container')
  return
}
```

### 4. Annotation Still Not Rendered After 500ms
Retry logic with longer timeout:
```typescript
setTimeout(() => {
  // Try finding annotation again
  if (annotationElement) {
    // Success
  } else {
    toast.info('Scrolled to approximate location')
  }
}, 800)
```

---

## UI/UX Improvements

### Issues Fixed

1. **Scroll-into-view not working** - Fixed attribute name mismatch (`data-block-start` → `data-start-offset`)
2. **Virtual scrolling blockers** - Implemented two-stage scroll with calculated positioning
3. **Sidebar styling mismatch** - Matched ConnectionCard design with border-2, hover effects, animations
4. **Edit form overflow** - Constrained width with `max-w-full` and `flex-wrap`
5. **Color badge clutter** - Replaced text badges with left border color indicator
6. **Duplicate annotations** - Added duplicate detection in `addAnnotation()` store action
7. **Visibility inaccuracy** - Refactored from chunk-based to offset-based detection

### Current Behavior

- Click annotation in sidebar → smooth scroll to location
- Annotation highlights with ring animation for 2 seconds
- Works for annotations anywhere in document (near or far)
- Sidebar shows "In view" badge for currently visible annotations
- Visual feedback via color-coded left border
- Inline edit form constrained to sidebar width

---

## Debugging

### Console Logging

Three layers of logging track the scroll/visibility pipeline:

**1. VirtualizedReader**
```javascript
console.log('[VirtualizedReader] Visible range:', {
  blocks: '254-306',
  offsets: '67342-71408',
  scrollPercent: '16.0%'
})
```

**2. ReaderStore**
```javascript
console.log('[ReaderStore] Visible chunks updated:', {
  viewport: '67342-71408',
  chunkCount: 1,
  chunkIndices: '18'
})
```

**3. AnnotationsList**
```javascript
console.log('[AnnotationsList] Offset-based visibility:', {
  viewport: '67342-71408',
  totalAnnotations: 18,
  visibleAnnotations: 2,
  sampleAnnotations: [
    { id: '708f4753', offsets: '5000-5050', visible: false },
    { id: 'b6db303b', offsets: '68234-68456', visible: true }
  ]
})
```

### Verification

To verify visibility detection is working:

1. Scroll through document
2. Check console for visibility updates
3. Verify `visibleAnnotations` count matches highlighted cards in sidebar
4. Check `sampleAnnotations` to see offset-based visibility calculations

---

## Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `src/components/sidebar/AnnotationsList.tsx` | Offset-based visibility, removed chunks/visibleChunkIds props, left border styling | ~150 |
| `src/components/sidebar/RightPanel.tsx` | Added onAnnotationClick prop, removed chunks prop from AnnotationsList | ~10 |
| `src/components/reader/ReaderLayout.tsx` | Implemented handleAnnotationClick with two-stage scroll | ~110 |
| `src/stores/annotation-store.ts` | Added duplicate detection in addAnnotation() | ~20 |
| `src/stores/reader-store.ts` | Added console logging for visible chunks | ~10 |
| `src/components/reader/VirtualizedReader.tsx` | Added console logging for visible range | ~10 |

**Total:** ~310 lines changed across 6 files

---

## Future Enhancements

### Potential Improvements

1. **Scroll position persistence** - Remember annotation scroll positions across sessions
2. **Keyboard navigation** - Arrow keys to jump between annotations
3. **Bulk operations** - Select multiple annotations for batch actions
4. **Filter by visibility** - Toggle to show only in-viewport annotations
5. **Performance optimization** - Debounce visibility calculations during rapid scrolling

### Known Limitations

- Scroll calculation assumes uniform content density (works well for prose, less accurate for code blocks or images)
- 500ms + 800ms timeout is fixed (could be adaptive based on document size)
- No indication of scroll progress during the 500ms wait
- Multiple rapid clicks may queue conflicting scroll operations

---

## Related Documentation

- `docs/ZUSTAND_RULES.md` - Store architecture and patterns
- `docs/ZUSTAND_PATTERN.md` - Zustand usage patterns
- `src/lib/annotations/inject.ts` - Annotation HTML injection logic
- `src/components/reader/BlockRenderer.tsx` - Annotation rendering with data attributes
