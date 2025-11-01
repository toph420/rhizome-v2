# Annotation Resize Testing Checklist
**Created**: 2025-10-29
**Status**: Active - Use this for systematic testing

---

## 🎯 Current Issues to Test

### Issue 1: Preview Flashing ⚠️ CRITICAL
**Symptom**: Blue preview overlay flashes on and off during drag

**Test Steps**:
1. Click on annotation edge to start resize
2. Drag left or right
3. **Observe**: Does blue preview stay visible continuously?

**Expected**: Preview should remain stable during entire drag
**Actual**: Preview flashes/disappears during drag

**Hypothesis**:
- Preview removal in cleanup happening before re-add
- Validation failures removing preview mid-drag
- RAF throttling conflicts with cleanup timing

**To Debug**:
- Add console log in `updatePreviewOverlay()` when removing spans
- Add console log when adding spans
- Check if removal happens every frame

---

### Issue 2: Edge Detection Positioning ⚠️ HIGH PRIORITY
**Symptom**: Clicking on what looks like an edge doesn't trigger resize

**Test Cases**:

#### Test 2A: Single-Span Short Annotation (1-3 words)
- [ ] Click on first word → Should resize start edge
- [ ] Click on last word → Should resize end edge
- [ ] Click in middle → Should auto-detect based on center

#### Test 2B: Single-Span Long Annotation (paragraph)
- [ ] Click within 50px of left edge → Should resize start
- [ ] Click within 50px of right edge → Should resize end
- [ ] Click in middle (>50px from both edges) → Should auto-detect by center

#### Test 2C: Multi-Span Annotation (across multiple lines)
- [ ] Click on first span left edge → Should resize start
- [ ] Click on last span right edge → Should resize end
- [ ] Click on middle span → Should NOT resize (no markers)

**Current Behavior**:
- 50px threshold is very generous but still misses middle clicks
- Center-based detection added for single-span annotations
- Visual indicators (box-shadow) not showing reliably

---

### Issue 3: Visual Indicators ⚠️ MEDIUM PRIORITY
**Symptom**: Box-shadow indicators don't show correctly

**Test Steps**:
1. Find annotation with `data-annotation-start`
2. **Expected**: Red box-shadow on left edge
3. **Actual**: Not showing or barely visible

4. Find annotation with `data-annotation-end`
5. **Expected**: Blue box-shadow on right edge
6. **Actual**: Sometimes shows, sometimes doesn't

**Hypothesis**:
- CSS specificity issues
- `display: inline` vs `inline-block` problems
- Z-index conflicts
- Single-span annotations (both markers) → CSS conflicts (blue overwrites red)

---

### Issue 4: Other Issues ⚠️ UNDEFINED
**Need to Document**:
1. What other specific issues were observed?
2. Step-by-step reproduction for each
3. Expected vs actual behavior

---

## 🧪 Comprehensive Test Matrix

### A. Edge Detection Tests

| Annotation Type | Click Location | Expected Edge | Current Status |
|----------------|---------------|---------------|----------------|
| Short single-span (1-3 words) | First word | start | ❓ |
| Short single-span | Last word | end | ❓ |
| Short single-span | Middle | auto (center) | ❓ |
| Long single-span (paragraph) | Left edge (<50px) | start | ❓ |
| Long single-span | Right edge (<50px) | end | ❓ |
| Long single-span | Middle | auto (center) | ⚠️ Working |
| Multi-span (2+ lines) | First span left | start | ❓ |
| Multi-span | Last span right | end | ❓ |
| Multi-span | Middle span | none (fail) | ❓ |

### B. Resize Operation Tests

| Scenario | Expected | Actual Status |
|----------|----------|---------------|
| Drag start edge left (expand) | Preview expands, saves on release | ❓ |
| Drag start edge right (shrink) | Preview shrinks, saves on release | ❓ |
| Drag end edge left (shrink) | Preview shrinks, saves on release | ❓ |
| Drag end edge right (expand) | Preview expands, saves on release | ❓ |
| Drag beyond min (3 chars) | Blocked, preview stops | ❓ |
| Drag beyond max (5 chunks) | Blocked, preview stops | ❓ |
| Drag start past end | Blocked, preview stops | ❓ |
| Drag end past start | Blocked, preview stops | ❓ |

### C. Visual Feedback Tests

| Element | Expected | Actual Status |
|---------|----------|---------------|
| Cursor changes to col-resize on hover | ↔ cursor | ❓ |
| Preview overlay appears on drag | Blue box | ⚠️ Flashing |
| Original annotation dims during drag | Opacity 0.3 | ❓ |
| Preview updates smoothly (60fps) | Smooth | ⚠️ Flashing |
| Preview removed on release | Disappears | ❓ |
| Annotation updates after save | New boundary | ❓ |

### D. Edge Cases

| Case | Expected | Actual Status |
|------|----------|---------------|
| Annotation at start of document | Works normally | ❓ |
| Annotation at end of document | Works normally | ❓ |
| Very short annotation (single word) | Both edges work | ❓ |
| Very long annotation (multiple paragraphs) | Both edges work | ❓ |
| Adjacent annotations (touching) | Each works independently | ❓ |
| Nested HTML (`<strong>`, `<em>`) | Works through nesting | ❓ |
| Resize during correction mode | Disabled | ❓ |
| Resize during spark capture | Disabled | ❓ |

---

## 🔬 Debugging Tools

### Console Diagnostic Commands

```javascript
// 1. Check hook initialization
// Look for: [useAnnotationResize] Hook initialized

// 2. Check annotation spans exist
document.querySelectorAll('[data-annotation-id]').length
// Should be > 0

// 3. Check markers
document.querySelectorAll('[data-annotation-start]').length
document.querySelectorAll('[data-annotation-end]').length
// Should match number of annotations (or more if multi-span)

// 4. Test click detection on specific annotation
const span = document.querySelector('[data-annotation-id]')
const rect = span.getBoundingClientRect()
console.log({
  left: rect.left,
  right: rect.right,
  width: rect.width,
  hasStart: span.hasAttribute('data-annotation-start'),
  hasEnd: span.hasAttribute('data-annotation-end')
})
// Click and compare mouseX with these values

// 5. Watch for resize events
// Click on edge and look for:
// [DIRECT CLICK] Edge detected on click
// OR
// [DIRECT CLICK] Single-span annotation - auto-detected edge by center
```

---

## 📝 Issue Template

When you find a new issue, document it like this:

```markdown
### Issue X: [Short Description]

**Symptom**: What goes wrong

**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**: What should happen

**Actual Behavior**: What actually happens

**Console Logs**: Copy relevant logs

**Screenshots**: If applicable

**Hypothesis**: Possible causes

**Priority**: Critical / High / Medium / Low
```

---

## ✅ When Testing is Complete

Mark each test as:
- ✅ **PASS**: Works as expected
- ❌ **FAIL**: Doesn't work, issue documented
- ⚠️ **PARTIAL**: Works sometimes or with caveats
- ❓ **NOT TESTED**: Haven't tested yet

Once all tests are ✅ PASS, the feature is ready!
