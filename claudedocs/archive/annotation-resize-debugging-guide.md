# Annotation Resize Debugging Guide
**Created**: 2025-10-29
**Status**: Active Debugging Session
**Issue**: Edge detection and resize not triggering on handle clicks

---

## 🔴 CRITICAL FINDING: Event Flow Requirement

The hook requires **TWO SEPARATE EVENTS** to work:
1. **Mousemove** (sets hoveredEdge) → MUST happen FIRST
2. **Mousedown** (reads hoveredEdge, starts resize) → MUST happen SECOND

**IF USER CLICKS WITHOUT HOVERING FIRST → hoveredEdge is null → resize doesn't start**

---

## 🧪 Debugging Checklist

### Phase 1: Verify Hook is Running
Open browser console and check for logs:

```
[ ] Hook initialized log appears with:
    - enabled: true
    - documentId: [UUID]
    - annotationCount: > 0
    - chunkCount: > 0
```

**If no log → Hook isn't running at all**
- Check VirtualizedReader.tsx line 417
- Check that documentId is not empty
- Check that annotations have loaded

---

### Phase 2: Verify DOM Structure
Open DevTools Elements tab and inspect an annotation:

```html
[ ] Spans have data-annotation-id attribute
[ ] Start spans have data-annotation-start attribute
[ ] End spans have data-annotation-end attribute
[ ] Block wrappers have data-start-offset and data-end-offset
```

**How to check:**
1. Find a highlighted annotation in the DOM
2. Right-click → Inspect Element
3. Look at the `<span>` tags

**Example correct structure:**
```html
<span
  data-annotation-id="abc123..."
  data-annotation-start="true"
  class="annotation-yellow">
  Text here
</span>
```

---

### Phase 3: Test Edge Detection
**Manual test:**
1. Open console
2. Slowly move mouse OVER an annotation edge
3. Watch for console logs: `[Edge Detection] SUCCESS:`

**Expected logs:**
```
[Edge Detection] SUCCESS: {
  annotationId: "abc123...",
  edge: "start" or "end",
  hasStartMarker: true,
  hasEndMarker: true
}
```

**If no logs appear:**
- Mousemove event isn't firing on the span
- Span doesn't have the correct attributes
- `detectEdge()` is returning null (check 8px threshold)

---

### Phase 4: Test Cursor Change
**Visual test:**
1. Move mouse slowly over annotation edge (within 8px)
2. **Cursor should change to `col-resize` (resize cursor)**

**If cursor doesn't change:**
- Edge detection is failing
- Check that spans exist and have correct attributes
- Try with a VERY SLOW mouse movement (give hover detection time to fire)

---

### Phase 5: Test Mousedown After Hover
**Sequential test:**
1. Hover over edge until cursor changes to col-resize
2. **Then** click (mousedown)
3. Watch console for logs

**Expected flow:**
```
[Edge Detection] SUCCESS: { annotationId, edge }
→ Cursor changes to col-resize
→ Mousedown fires
→ Resize state set
→ body.annotation-resizing class added
```

**If mousedown doesn't work AFTER hovering:**
- Check that hoveredEdge state is being set
- Check that hoveredEdgeRef.current has the value
- Look for preventDefault/stopPropagation issues

---

### Phase 6: Check CSS Interference
**Possible issue:** CSS might be blocking mouse events

```css
/* Check for these in DevTools Computed Styles: */
[ ] pointer-events: none (on annotation spans or parents)
[ ] z-index conflicts (something covering the annotation)
[ ] opacity: 0 (making it invisible but clickable)
```

**How to check:**
1. Inspect annotation span
2. Check Computed tab in DevTools
3. Look for `pointer-events` and `z-index`

---

## 🔧 Quick Fixes to Try

### Fix 1: Add Direct Click Handler
**Problem:** Current implementation requires hover BEFORE click.

**Test this:**
Add this to mousedown handler (line 437 in useAnnotationResize.ts):

```typescript
const handleMouseDown = (e: MouseEvent) => {
  if (e.button !== 0) return

  // NEW: If no hoveredEdge, try to detect it NOW
  if (!hoveredEdgeRef.current) {
    const spanElement = (e.target as HTMLElement).closest('[data-annotation-id]')
    if (spanElement instanceof HTMLElement) {
      const edge = detectEdge(e, spanElement)
      const hasStartMarker = spanElement.hasAttribute('data-annotation-start')
      const hasEndMarker = spanElement.hasAttribute('data-annotation-end')

      if (edge && ((edge === 'start' && hasStartMarker) || (edge === 'end' && hasEndMarker))) {
        const annotationId = spanElement.getAttribute('data-annotation-id')!
        hoveredEdgeRef.current = { annotationId, edge }
        console.log('[DIRECT CLICK] Edge detected on click:', { annotationId: annotationId.substring(0, 8), edge })
      }
    }
  }

  // Rest of handler...
}
```

**This allows click-without-hover to work!**

---

### Fix 2: Increase Edge Detection Threshold
**Problem:** 8px might be too small, users are missing the edge zone.

**Test this:**
Change line 53 in useAnnotationResize.ts:
```typescript
const EDGE_DETECTION_THRESHOLD = 16 // Was: 8
```

**Trade-off:** Larger threshold = easier to trigger, but might conflict with middle of annotation

---

### Fix 3: Visual Debug Overlay
**Problem:** Users can't see the 8px edge zone.

**Add this CSS to globals.css:**
```css
/* Show edge zones visually for debugging */
[data-annotation-start]::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 0;
  width: 8px;
  height: 100%;
  background: rgba(255, 0, 0, 0.2); /* Red overlay */
  pointer-events: none;
}

[data-annotation-end]::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 0;
  width: 8px;
  height: 100%;
  background: rgba(0, 0, 255, 0.2); /* Blue overlay */
  pointer-events: none;
}
```

**Now you can SEE the edge zones!**

---

## 📊 Diagnostic Script

**Run this in browser console to get full diagnostic report:**

```javascript
// Annotation Resize Diagnostics
console.group('🔬 Annotation Resize Diagnostics')

// 1. Check hook is enabled
console.log('1. Hook Logs:',
  'Look for [useAnnotationResize] Hook initialized in console above'
)

// 2. Check DOM structure
const annotationSpans = document.querySelectorAll('[data-annotation-id]')
console.log('2. Annotation Spans:', {
  total: annotationSpans.length,
  withStartMarker: document.querySelectorAll('[data-annotation-start]').length,
  withEndMarker: document.querySelectorAll('[data-annotation-end]').length,
  sample: annotationSpans[0] ? {
    id: annotationSpans[0].getAttribute('data-annotation-id')?.substring(0, 8),
    hasStart: annotationSpans[0].hasAttribute('data-annotation-start'),
    hasEnd: annotationSpans[0].hasAttribute('data-annotation-end'),
    text: annotationSpans[0].textContent?.substring(0, 30)
  } : null
})

// 3. Check blocks have offsets
const blocks = document.querySelectorAll('[data-start-offset]')
console.log('3. Blocks with Offsets:', {
  total: blocks.length,
  sample: blocks[0] ? {
    startOffset: blocks[0].getAttribute('data-start-offset'),
    endOffset: blocks[0].getAttribute('data-end-offset')
  } : null
})

// 4. Check CSS interference
if (annotationSpans[0]) {
  const computed = window.getComputedStyle(annotationSpans[0])
  console.log('4. CSS Check (first annotation):', {
    pointerEvents: computed.pointerEvents,
    zIndex: computed.zIndex,
    opacity: computed.opacity,
    cursor: computed.cursor
  })
}

// 5. Test edge detection manually
console.log('5. Manual Edge Detection Test:')
console.log('   → Move mouse over annotation edge')
console.log('   → Look for [Edge Detection] SUCCESS logs above')
console.log('   → Cursor should change to col-resize')

console.groupEnd()
```

---

## 🎯 Expected Working Flow

### Perfect Case (What Should Happen):
```
User moves mouse near edge (within 8px)
  ↓
Mousemove event fires
  ↓
detectEdge() returns 'start' or 'end'
  ↓
setHoveredEdge({ annotationId, edge })
  ↓
Cursor changes to col-resize
  ↓
hoveredEdgeRef.current = { annotationId, edge }
  ↓
User clicks (mousedown)
  ↓
Handler reads hoveredEdgeRef.current
  ↓
setIsResizing(true)
  ↓
Blue preview overlay appears
  ↓
User drags
  ↓
Preview updates
  ↓
User releases (mouseup)
  ↓
Server Action saves changes
  ↓
Annotation updates
```

### Current Issue (What's Happening):
```
User clicks on edge WITHOUT hovering first
  ↓
hoveredEdgeRef.current = null
  ↓
Mousedown handler early returns
  ↓
Nothing happens
```

---

## 🚀 Next Steps

1. **First:** Run the diagnostic script in console
2. **Then:** Try the manual edge detection test (slow mouse movement)
3. **If that works:** Issue is "click-without-hover" - apply Fix 1
4. **If that doesn't work:** Issue is DOM structure or CSS - check Phases 2 & 6

---

## 📝 Report Template

After testing, fill this out:

```
DIAGNOSTIC RESULTS:
─────────────────
1. Hook initialized: YES / NO
2. Annotation spans found: X spans
3. Edge detection on hover: WORKS / DOESN'T WORK
4. Cursor changes: YES / NO
5. Mousedown after hover: WORKS / DOESN'T WORK

ISSUE IDENTIFIED:
─────────────────
[ ] Hook not running
[ ] DOM structure missing attributes
[ ] Edge detection threshold too small
[ ] CSS blocking events
[ ] Click-without-hover issue
[ ] Other: ___________

FIX APPLIED:
────────────
[ ] Fix 1: Direct click handler
[ ] Fix 2: Increased threshold
[ ] Fix 3: Visual debug overlay
[ ] Other: ___________

RESULT:
───────
WORKING / NOT WORKING
```
