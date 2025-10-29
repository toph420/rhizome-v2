# Annotation Resize - Root Cause Analysis & Diagnostic Plan

**Created**: 2025-10-29
**Status**: DIAGNOSTIC MODE
**Priority**: CRITICAL - System not working as expected

---

## 🔴 REPORTED ISSUES (All Still Present)

1. **Resize only triggers on new annotations, not existing ones**
2. **Preview flashing on/off during drag**
3. **Resized highlight overlaps old until refresh**
4. **Cross-block resizing completely non-functional**

---

## 🔬 ROOT CAUSE HYPOTHESES

### Hypothesis 1: Data Attribute Mismatch

**Theory**: Existing annotations missing `data-annotation-start` and `data-annotation-end` attributes.

**Evidence Needed**:
```javascript
// In browser console when hovering over annotation
const span = document.querySelector('[data-annotation-id]')
console.log({
  hasId: span.hasAttribute('data-annotation-id'),
  hasStart: span.hasAttribute('data-annotation-start'),
  hasEnd: span.hasAttribute('data-annotation-end'),
  allAttrs: Array.from(span.attributes).map(a => `${a.name}=${a.value}`)
})
```

**Root Cause**:
- If existing annotations have `data-annotation-id` but NOT `data-annotation-start/end`, edge detection will fail
- This happens when `annotationStartsInThisBlock` or `annotationEndsInThisBlock` is false
- Could occur if annotation spans multiple blocks OR if offset calculation is wrong

---

### Hypothesis 2: Annotation Text Field Missing

**Theory**: New annotations have `text` field populated, existing ones don't.

**Evidence Needed**:
```javascript
// Check what's passed to hook
console.log('[Resize Hook] Annotations:', annotations.map(a => ({
  id: a.id,
  hasText: !!a.text,
  textPreview: a.text?.substring(0, 50),
  startOffset: a.startOffset,
  endOffset: a.endOffset
})))
```

**Impact**:
- `inject.ts` has two code paths: search-based (if text exists) vs offset-based (fallback)
- Search-based ALWAYS sets `annotationStartsInThisBlock = true` and `annotationEndsInThisBlock = true`
- Offset-based calculates these booleans, which might be false for edge cases

**Fix**: Ensure ALL annotations have `text` field populated from Position component.

---

### Hypothesis 3: React Key Not Forcing Re-render

**Theory**: BlockRenderer key doesn't change when annotation offsets change.

**Current Key Logic**:
```typescript
const annotationKey = blockAnnotations
  .map(ann => `${ann.id}:${ann.color}:${ann.startOffset}-${ann.endOffset}`)
  .join(',')

key={`${block.startOffset}-${annotationKey}`}
```

**Verification**:
```javascript
// Before and after resize
console.log('[BlockRenderer Key]:', `${block.startOffset}-${annotationKey}`)
```

**Expected**: Key should be different after resize (offsets changed).
**If Same**: React won't re-render, old HTML persists.

---

### Hypothesis 4: Preview Removal Too Early

**Theory**: Preview removed before React completes revalidation.

**Current Flow**:
```
1. User releases mouse (mouseup)
2. Server Action called → updateAnnotationRange()
3. revalidatePath() called
4. Wait 100ms
5. Remove preview + cleanup
6. [ASYNC] React revalidates and re-renders
```

**Problem**: Step 6 might happen AFTER step 5, causing gap with no highlight.

**Better Approach**: Don't remove preview until annotation data actually updates.

---

### Hypothesis 5: Cross-Block DOM Structure Issue

**Theory**: `calculateMultiBlockOffsets` can't handle ranges spanning multiple block wrappers.

**Current DOM Structure**:
```html
<div data-start-offset="0" data-end-offset="100">
  <p>Text in first block</p>
</div>
<div data-start-offset="100" data-end-offset="200">
  <p>Text in second block</p>
</div>
```

**Problem**: If range starts in first div and ends in second div, `calculateMultiBlockOffsets` might:
- Only see first block's text
- Get confused by multiple `data-start-offset` wrappers
- Return incorrect offsets

**Fix Needed**: Enhanced offset calculator that handles multi-block ranges.

---

## 🧪 DIAGNOSTIC STEPS (Run These First)

### Step 1: Verify Data Attributes

```javascript
// Browser console
document.querySelectorAll('[data-annotation-id]').forEach(span => {
  const id = span.getAttribute('data-annotation-id')
  const start = span.hasAttribute('data-annotation-start')
  const end = span.hasAttribute('data-annotation-end')
  console.log(`Annotation ${id.substring(0, 8)}:`, { start, end })
})
```

**Expected**: Each annotation should have at least one span with `data-annotation-start` and one with `data-annotation-end`.

---

### Step 2: Check Annotation Data Structure

Add logging to `VirtualizedReader.tsx`:
```typescript
console.log('[VirtualizedReader] Annotations passed to hook:', {
  count: annotationsForBlocks.length,
  sample: annotationsForBlocks[0],
  allHaveText: annotationsForBlocks.every(a => a.text),
})
```

---

### Step 3: Monitor Edge Detection

Add logging to `useAnnotationResize.ts`:
```typescript
// In handleMouseMove (edge detection)
if (hoveredEdge) {
  console.log('[Edge Detection]:', {
    annotationId: hoveredEdge.annotationId,
    edge: hoveredEdge.edge,
    spanAttributes: Array.from(spanElement.attributes).map(a => a.name)
  })
}
```

---

### Step 4: Track Preview Lifecycle

```typescript
// When creating preview
console.log('[Preview] Created:', { startOffset, endOffset, rectCount: rects.length })

// When removing preview
console.log('[Preview] Removing:', { reason: 'cleanup/validation/error' })
```

---

### Step 5: Verify Block Re-render

```typescript
// In BlockRenderer
useEffect(() => {
  console.log('[BlockRenderer] Rendered:', {
    blockStart: block.startOffset,
    annotations: overlappingAnnotations.map(a => ({
      id: a.id.substring(0, 8),
      start: a.startOffset,
      end: a.endOffset
    }))
  })
}, [block.startOffset, overlappingAnnotations])
```

---

## 💡 PROPOSED FIXES

### Fix 1: Ensure Text Field Always Populated

**Location**: `VirtualizedReader.tsx` (when converting annotations)

```typescript
const annotationsForBlocks = useMemo(() => {
  return allAnnotations.map(ann => ({
    id: ann.id,
    startOffset: ann.components.Position?.startOffset ?? 0,
    endOffset: ann.components.Position?.endOffset ?? 0,
    color: ann.components.Visual?.color ?? 'yellow',
    // CRITICAL: Always include text for search-based injection
    text: ann.components.Position?.originalText ?? undefined
  }))
}, [allAnnotations])
```

**Impact**: Forces search-based path in `inject.ts`, ensuring start/end markers are always set.

---

### Fix 2: Smarter Preview Cleanup

**Location**: `useAnnotationResize.ts` mouseup handler

```typescript
// Don't use setTimeout - use a Promise that resolves when annotation updates
const waitForAnnotationUpdate = new Promise<void>(resolve => {
  const checkInterval = setInterval(() => {
    // Check if annotation with new offsets exists in DOM
    const updated = document.querySelector(
      `[data-annotation-id="${resizeState.annotationId}"][data-start-offset="${newStartOffset}"]`
    )
    if (updated) {
      clearInterval(checkInterval)
      resolve()
    }
  }, 50)

  // Timeout after 2 seconds
  setTimeout(() => {
    clearInterval(checkInterval)
    resolve()
  }, 2000)
})

await waitForAnnotationUpdate
// Now safe to remove preview
```

---

### Fix 3: Enhanced Cross-Block Offset Calculation

**Location**: New utility function

```typescript
/**
 * Calculate offsets for range that may span multiple blocks.
 * Handles the case where range starts in one block and ends in another.
 */
function calculateCrossBlockOffsets(
  range: Range
): { startOffset: number; endOffset: number; text: string } {
  // Find all block wrappers that intersect with range
  const blocks: Array<{
    element: HTMLElement
    startOffset: number
    endOffset: number
  }> = []

  // Walk up from startContainer to find enclosing block
  let node: Node | null = range.startContainer
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.hasAttribute('data-start-offset')) {
        blocks.push({
          element: el,
          startOffset: parseInt(el.dataset.startOffset || '0', 10),
          endOffset: parseInt(el.dataset.endOffset || '0', 10)
        })
        break
      }
    }
    node = node.parentNode
  }

  // Similarly for endContainer
  node = range.endContainer
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.hasAttribute('data-start-offset')) {
        const blockStart = parseInt(el.dataset.startOffset || '0', 10)
        // Only add if different from start block
        if (!blocks.find(b => b.startOffset === blockStart)) {
          blocks.push({
            element: el,
            startOffset: blockStart,
            endOffset: parseInt(el.dataset.endOffset || '0', 10)
          })
        }
        break
      }
    }
    node = node.parentNode
  }

  // Calculate offsets for each block, then sum
  // Implementation details...
}
```

---

## 🎯 RECOMMENDED ACTION PLAN

### Phase 1: Diagnostics (30 min)
1. Run all diagnostic steps above
2. Collect browser console logs
3. Identify which hypothesis is correct

### Phase 2: Targeted Fix (1-2 hours)
Based on diagnostics:
- If Hypothesis 1/2: Implement Fix 1 (ensure text field)
- If Hypothesis 3: Force block keys to be more specific
- If Hypothesis 4: Implement Fix 2 (smarter cleanup)
- If Hypothesis 5: Implement Fix 3 (cross-block offsets)

### Phase 3: Verification (30 min)
- Test all 4 reported issues
- Verify fix doesn't break existing functionality
- Test on Chrome, Safari, Firefox

---

## 🚨 ALTERNATIVE APPROACH: Complete Rewrite

If targeted fixes don't work, consider architectural change:

### Option A: React-Based Preview
- Store resize state in React state
- Render preview as React component overlay
- Let React handle updates (no manual DOM manipulation)
- Pros: More "React-y", easier to reason about
- Cons: Might impact performance, harder with virtualization

### Option B: CSS-Only Preview
- Add `.resizing` class to annotation during drag
- Use CSS custom properties to show new bounds
- No DOM manipulation, pure CSS
- Pros: Simpler, no flashing issues
- Cons: Harder to show precise preview

### Option C: Optimistic Update Pattern
- Immediately update annotation in store (optimistic)
- Show updated annotation right away
- Rollback if Server Action fails
- Pros: Instant feedback, no overlap
- Cons: More complex state management

---

## 📊 SUCCESS CRITERIA

**Must Work**:
- [ ] Hover existing annotation edge → cursor changes
- [ ] Drag existing annotation edge → smooth preview
- [ ] Release → clean transition, no overlap
- [ ] Cross-block resize → works correctly

**Performance**:
- [ ] Preview updates at 60fps (no lag)
- [ ] No flashing during drag
- [ ] Cleanup happens smoothly

**Architecture**:
- [ ] Code is maintainable
- [ ] No race conditions
- [ ] Works with React's rendering model
- [ ] Handles edge cases gracefully

---

## 🔧 DEVELOPER NOTES

**Key Insight**: The system has two separate concerns that might be conflicting:
1. **Injection** (inject.ts) - Adds data attributes based on annotation data
2. **Resize** (useAnnotationResize.ts) - Reads data attributes to enable resizing

If injection doesn't add the right attributes, resize can't work. Must ensure:
- Text field is always present (triggers search-based path)
- Search-based path sets start/end markers on every annotation
- React re-renders blocks when offsets change
- Cleanup timing aligns with React's render cycle

**Next Steps**: Run diagnostics first before implementing fixes!
