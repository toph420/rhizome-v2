# Annotation Resize - Complete Refactoring Plan

**Created**: 2025-10-29
**Status**: READY FOR IMPLEMENTATION
**Priority**: HIGH - Architecture improvement + bug fixes

---

## 🎯 OBJECTIVE

Refactor annotation resize system to:
1. **Fix**: Resize only works on ~10/38 annotations (multi-block + virtualization issue)
2. **Improve**: Eliminate prop drilling, use Zustand store directly
3. **Simplify**: Remove async loading race conditions
4. **Maintain**: Keep all working features (cross-browser, throttling, caching, preview)

---

## 📊 CURRENT STATE ANALYSIS

### What We've Built (Working Features)
✅ **Cross-browser caret positioning** (Safari + Chrome/Firefox)
✅ **60fps throttling** with requestAnimationFrame
✅ **Block data caching** for performance
✅ **Preview overlay system** with smooth transitions
✅ **Edge detection** (8px threshold)
✅ **Validation** (min 3 chars, max 5 chunks)
✅ **Server Action** with bidirectional PDF sync

### What's Broken
❌ **Only 10/38 annotations respond to hover** (diagnostic confirmed)
❌ **Multi-block annotations** only resize from first/last block
❌ **Async loading race** (hook initializes with empty array)
❌ **Preview flashing** (validation removes preview)
❌ **Highlight overlap** (cleanup before React re-render)

### Store Structure (annotation-store.ts)
```typescript
interface AnnotationState {
  annotations: Record<string, StoredAnnotation[]>  // Keyed by documentId!
  setAnnotations: (documentId: string, annotations: StoredAnnotation[]) => void
  updateAnnotation: (documentId, annotationId, updates) => void
  // NO loading state yet
}
```

**Key Insight**: Store uses `Record<documentId, annotations[]>` not flat array!

### Current Flow (VirtualizedReader)
```typescript
// 1. Component mounts
const annotations = useAnnotationStore(state => state.annotations[documentId] || [])

// 2. Load async
useEffect(() => {
  const loadAnnotations = async () => {
    const result = await getAnnotations(documentId)
    setAnnotations(documentId, result)  // Updates store
  }
  loadAnnotations()
}, [documentId])

// 3. Convert to simple format
const annotationsForBlocks = useMemo(() => {
  return annotations.map(ann => ({
    id: ann.id,
    startOffset: ann.components.Position?.startOffset ?? 0,
    endOffset: ann.components.Position?.endOffset ?? 0,
    color: ann.components.Visual?.color ?? 'yellow',
    text: ann.components.Position?.originalText,
  }))
}, [annotations])

// 4. Pass as prop (3 layers deep!)
<useAnnotationResize annotations={annotationsForBlocks} />
```

---

## 🏗️ REFACTORING PLAN

### Phase 1: Store-Direct Reading (CORE FIX) ✅ COMPLETED

**Goal**: Hook reads store directly, eliminating prop passing and stale closures.

**Changes**:

#### 1.1. Update Hook Signature
```typescript
// src/hooks/useAnnotationResize.ts
import { useAnnotationStore } from '@/stores/annotation-store'

export interface AnnotationResizeOptions {
  enabled?: boolean
  documentId: string
  chunks: Chunk[]
  // REMOVED: annotations prop
  onResizeComplete: (annotationId: string, newRange: {...}) => Promise<void>
}

export function useAnnotationResize({
  enabled = true,
  documentId,
  chunks,
  onResizeComplete,
}: AnnotationResizeOptions): UseAnnotationResizeReturn {
  // NEW: Read directly from store (documentId-keyed!)
  const storeAnnotations = useAnnotationStore(
    state => state.annotations[documentId] || []
  )

  // Transform to simple format (same as before)
  const annotations = useMemo(() =>
    storeAnnotations.map(ann => ({
      id: ann.id,
      startOffset: ann.components.Position?.startOffset ?? 0,
      endOffset: ann.components.Position?.endOffset ?? 0,
      text: ann.components.Position?.originalText,
    })),
    [storeAnnotations]
  )

  // Guard: Don't enable until annotations loaded
  const actuallyEnabled = enabled && annotations.length > 0

  // Keep ref synced (existing pattern)
  const annotationsRef = useRef(annotations)
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  // Rest of hook unchanged...
}
```

**Key Points**:
- Store uses `Record<documentId, annotations[]>` so we read with `state.annotations[documentId]`
- Transformation happens in hook, not passed as prop
- Loading guard built-in: `annotations.length > 0`

#### 1.2. Update VirtualizedReader
```typescript
// src/components/reader/VirtualizedReader.tsx

// REMOVE this entire section:
const annotationsForBlocks = useMemo(() => {
  return annotations.map(ann => ({...}))
}, [annotations])

// UPDATE hook call:
const { isResizing } = useAnnotationResize({
  enabled: !correctionModeActive && !sparkCaptureOpen,
  documentId: documentId || '',
  chunks,
  // REMOVED: annotations prop
  onResizeComplete: handleAnnotationResize,
})

// BlockRenderer still gets annotations for display:
<BlockRenderer
  annotations={annotations}  // Still needed for injection
  // ...
/>
```

**Benefits**:
- No prop passing (hook → store direct)
- No stale closures (always reads fresh store)
- Simpler component tree
- Loading guard automatic

**Estimated Time**: 20 minutes
**Risk**: Low (additive change, doesn't break existing)

---

### Phase 2: Add Loading State to Store (QUALITY IMPROVEMENT)

**Goal**: Prevent empty array initialization, clearer loading state.

**Changes**:

#### 2.1. Update Store Interface
```typescript
// src/stores/annotation-store.ts
interface AnnotationState {
  annotations: Record<string, StoredAnnotation[]>
  loadingStates: Record<string, boolean>  // NEW: Per-document loading

  setAnnotations: (documentId: string, annotations: StoredAnnotation[]) => void
  loadAnnotations: (documentId: string) => Promise<void>  // NEW
  isLoading: (documentId: string) => boolean  // NEW
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  annotations: {},
  loadingStates: {},  // NEW

  // NEW: Async loader with loading state
  loadAnnotations: async (documentId) => {
    // Prevent duplicate loads
    if (get().loadingStates[documentId]) return

    // Set loading
    set(state => ({
      loadingStates: { ...state.loadingStates, [documentId]: true }
    }))

    try {
      const result = await getAnnotations(documentId)
      set(state => ({
        annotations: { ...state.annotations, [documentId]: result },
        loadingStates: { ...state.loadingStates, [documentId]: false }
      }))
    } catch (error) {
      console.error('[AnnotationStore] Load failed:', error)
      set(state => ({
        loadingStates: { ...state.loadingStates, [documentId]: false }
      }))
    }
  },

  // Helper
  isLoading: (documentId) => get().loadingStates[documentId] || false,

  // Existing methods...
}))
```

#### 2.2. Update VirtualizedReader
```typescript
// src/components/reader/VirtualizedReader.tsx

const loadAnnotations = useAnnotationStore(state => state.loadAnnotations)
const isLoading = useAnnotationStore(state => state.isLoading(documentId || ''))

useEffect(() => {
  if (documentId) {
    loadAnnotations(documentId)
  }
}, [documentId, loadAnnotations])

// Optional: Show loading state
if (isLoading) {
  return <div>Loading annotations...</div>
}
```

**Benefits**:
- Clear loading state per document
- Prevents duplicate loads
- Better error handling

**Estimated Time**: 30 minutes
**Risk**: Low (additive, backward compatible)

---

### Phase 3: Fix Multi-Block Edge Detection (BUG FIX)

**Goal**: Allow resizing from ANY visible span of a multi-block annotation.

**Problem**:
```
Block 1: [start marker]  ← Can resize ✓
Block 2: [no markers]    ← Can't resize ✗
Block 3: [end marker]    ← Can resize ✓
```

**Solution**: Detect ALL annotation spans, determine which edge based on position.

```typescript
// src/hooks/useAnnotationResize.ts - handleMouseMove

const spanElement = target.closest('[data-annotation-id]') as HTMLElement | null
if (!spanElement) {
  setHoveredEdge(null)
  return
}

const annotationId = spanElement.getAttribute('data-annotation-id')!
const hasStartMarker = spanElement.hasAttribute('data-annotation-start')
const hasEndMarker = spanElement.hasAttribute('data-annotation-end')

// NEW: If middle span, find ALL spans for this annotation
if (!hasStartMarker && !hasEndMarker) {
  const allSpans = Array.from(
    document.querySelectorAll(`[data-annotation-id="${annotationId}"]`)
  ) as HTMLElement[]

  // Determine which edge based on position in DOM
  const spanIndex = allSpans.indexOf(spanElement)
  const isFirstSpan = spanIndex === 0
  const isLastSpan = spanIndex === allSpans.length - 1

  // Check which edge of THIS span we're near
  const edge = detectEdge(e, spanElement)

  if (edge === 'start' && isFirstSpan) {
    // Left edge of first span = start edge
    console.log('[Edge Detection] Multi-block START edge')
    setHoveredEdge({ annotationId, edge: 'start' })
    document.body.style.cursor = 'col-resize'
    return
  }

  if (edge === 'end' && isLastSpan) {
    // Right edge of last span = end edge
    console.log('[Edge Detection] Multi-block END edge')
    setHoveredEdge({ annotationId, edge: 'end' })
    document.body.style.cursor = 'col-resize'
    return
  }

  // Middle span, not at edges
  console.log('[Edge Detection] Middle span, no resize')
  setHoveredEdge(null)
  document.body.style.cursor = ''
  return
}

// Original logic for marked spans...
```

**Benefits**:
- All visible annotation spans can be resized
- Smart edge detection based on DOM position
- Handles multi-block annotations correctly

**Estimated Time**: 30 minutes
**Risk**: Low (additive logic, doesn't break single-block)

---

## 📋 COMPLETE IMPLEMENTATION CHECKLIST

### Pre-Implementation
- [ ] Read and understand current hook code
- [ ] Read and understand current store code
- [ ] Identify all places where annotations prop is passed
- [ ] Create git branch: `refactor/annotation-resize-store-direct`

### Phase 1: Store-Direct (Core)
- [x] Update useAnnotationResize.ts interface (remove annotations prop)
- [x] Add store import and selector
- [x] Add transformation logic inside hook
- [x] Update VirtualizedReader.tsx (remove prop passing)
- [x] Test: Verify hook still gets annotation data
- [x] Test: Verify resize works on existing annotations
- [x] Commit: "refactor: hook reads annotations from store directly"

### Phase 2: Loading State (Quality)
- [x] Add loadingStates to annotation-store.ts
- [x] Add loadAnnotations async method
- [x] Add isLoading helper
- [x] Update VirtualizedReader to use loadAnnotations
- [x] Test: Verify loading state works
- [x] Test: Verify no duplicate loads
- [x] Commit: "feat: add loading state to annotation store"

### Phase 3: Multi-Block Detection (Bug Fix)
- [x] Add multi-block span detection logic
- [x] Add DOM position-based edge detection
- [x] Add logging for debugging
- [x] Test: Create multi-block annotation
- [x] Test: Hover over middle spans
- [x] Test: Verify start/end edges work
- [x] Commit: "fix: enable resize on all spans of multi-block annotations"

### Phase 4: Fix Direct Click Detection (Critical Bug Fix) ✅ COMPLETED (2025-10-29)
**Problem**: Edge detection only worked when hovering FIRST, then clicking. Direct clicks on handles didn't trigger resize.

**Root Cause**: Mousedown handler checked `hoveredEdgeRef.current` and early-returned if null. Users clicking directly (without hovering first) had null hoveredEdge.

**Solution Implemented**:
- Modified mousedown handler in `useAnnotationResize.ts` (lines 450-485)
- Added fallback edge detection when `hoveredEdgeRef.current` is null or stale
- Now detects edge ON CLICK if not already detected by hover
- Added comprehensive diagnostic logging (`[DIRECT CLICK]` logs)
- Created debugging guide: `claudedocs/annotation-resize-debugging-guide.md`

**Changes**:
```typescript
// Before: Early return if no hover
if (!currentHoveredEdge) return

// After: Detect edge on click if needed
if (!currentHoveredEdge || annotationId !== currentHoveredEdge.annotationId) {
  // Perform edge detection NOW
  const edge = detectEdge(e, spanElement)
  if (edge && validMarkers) {
    currentHoveredEdge = { annotationId, edge }
    hoveredEdgeRef.current = currentHoveredEdge
  }
}
```

**Testing Status**:
- [x] TypeScript compiles (no new errors)
- [x] No new ESLint warnings
- [x] Manual verification started - ISSUES FOUND (see below)

### Phase 5: Address Testing Issues ⚠️ IN PROGRESS (2025-10-29)

**Testing Revealed Multiple Issues**:

#### Issue 1: Edge Detection Zones Not Positioned Correctly
**Problem**:
- Visual debug overlays don't match actual edge positions
- 50px threshold is overly generous, makes UX confusing
- Single-span annotations (both markers) need different handling than multi-span

**Current Behavior**:
- User clicks on annotation, gets "not near edge"
- Console shows `mouseX: 378`, `spanLeft: 32`, `spanRight: 638`
- User was clicking in middle of 606px wide span
- Even 50px threshold didn't cover the middle

**Attempted Fix**:
- Added "center-based detection" for single-span annotations
- Left half of click → resize start edge
- Right half of click → resize end edge

**Status**: Partially working, needs further testing

#### Issue 2: Preview Flashing During Drag
**Problem**: Preview overlay flashes on and off while dragging

**Likely Causes**:
- Preview removal timing conflicts with updates
- Validation failures removing preview mid-drag
- RAF throttling might be removing/re-adding too quickly

**Status**: Not yet investigated/fixed

#### Issue 3: Handle Reliability
**Problem**: Handles (edge detection zones) not reliably in correct spots

**Observations**:
- Visual indicators show blue shadow on right edge
- Clicking on the shadow still fails detection
- Red shadow (start edge) not showing on some annotations

**Possible Causes**:
- CSS box-shadow positioning issues
- Span nesting or positioning problems
- Conflicts between single-span vs multi-span annotations

**Status**: Needs deeper DOM structure investigation

#### Issue 4: Other Unspecified Issues
**Status**: User reported "other issues" - need specific testing checklist

---

### Updated Implementation Status

**What's Working**:
- ✅ Store-direct reading (no prop drilling)
- ✅ Loading state management
- ✅ Multi-block span detection logic
- ✅ Direct click detection (hook executes)
- ✅ Cross-browser compatibility
- ✅ 60fps throttling
- ✅ Block data caching

**What's Broken/Unreliable**:
- ❌ Edge detection threshold too aggressive (50px)
- ❌ Visual debug overlays don't match detection zones
- ❌ Preview flashing during drag
- ❌ Handle positions not reliable
- ❌ Unknown other issues

**Next Steps Required**:
1. Systematic testing with specific test cases
2. Fix preview flashing (investigate RAF + cleanup timing)
3. Rethink edge detection UX (50px is too large, 8px too small?)
4. Consider alternative handle design (explicit resize handles?)
5. DOM structure investigation for visual indicators

### Final Verification
- [ ] Test all 4 original issues:
  - [ ] Resize works on existing annotations
  - [ ] Preview doesn't flash during drag
  - [ ] No highlight overlap after resize
  - [ ] Cross-block resizing works
- [ ] Test edge cases:
  - [ ] Single-block annotations still work
  - [ ] Very long multi-block annotations (5+ blocks)
  - [ ] Annotations at viewport boundaries
- [ ] Performance check:
  - [ ] No lag during drag
  - [ ] 60fps preview updates
  - [ ] Memory usage stable
- [ ] Browser compatibility:
  - [ ] Chrome (caretPositionFromPoint)
  - [ ] Safari (caretRangeFromPoint)
  - [ ] Firefox (caretPositionFromPoint)

### Documentation
- [ ] Update plan with "COMPLETED" status
- [ ] Document any deviations from plan
- [ ] Update IMPLEMENTATION_STATUS.md
- [ ] Remove diagnostic logging (or make it debug-only)

---

## 🔄 ROLLBACK PLAN

If refactor causes issues:

### Phase 1 Rollback
```bash
git revert <commit-hash-phase-1>
# Restores prop-passing pattern
```

### Phase 2 Rollback
```typescript
// annotation-store.ts - Remove loading state
// VirtualizedReader.tsx - Restore original useEffect
```

### Phase 3 Rollback
```typescript
// useAnnotationResize.ts - Remove multi-block logic
// Annotations will only resize from marked spans (original behavior)
```

**Safe Incremental Rollback**: Each phase is independent.

---

## 🎯 SUCCESS METRICS

**Must Have** (Blocking):
- [ ] All 38 annotations respond to hover (not just 10)
- [ ] Multi-block annotations resize from any visible span
- [ ] No async loading issues (hook always has data)
- [ ] TypeScript compiles with no errors

**Nice to Have** (Quality):
- [ ] Loading state prevents empty renders
- [ ] Console logs help debugging
- [ ] Code is simpler and more maintainable

**Performance** (Should not regress):
- [ ] 60fps preview updates maintained
- [ ] No memory leaks from store subscriptions
- [ ] Initial load time unchanged or better

---

## 💡 ALTERNATIVE APPROACHES (If Needed)

### Option A: Selector Optimization
If store reads cause performance issues:
```typescript
// Use shallow equality for better performance
const annotations = useAnnotationStore(
  state => state.annotations[documentId] || [],
  shallow  // From 'zustand/shallow'
)
```

### Option B: Derived Store
If transformations are expensive:
```typescript
// Create derived selector
const useAnnotationsForResize = (documentId: string) =>
  useAnnotationStore(
    state => (state.annotations[documentId] || []).map(ann => ({
      id: ann.id,
      startOffset: ann.components.Position?.startOffset ?? 0,
      endOffset: ann.components.Position?.endOffset ?? 0,
      text: ann.components.Position?.originalText,
    })),
    shallow
  )
```

### Option C: Virtual Spans
If multi-block detection is complex:
```typescript
// Generate "virtual edge spans" at viewport boundaries
// Add data-virtual-start/end attributes
// Simpler edge detection logic
```

---

## 🔍 WHAT WE'RE NOT CHANGING

**Keep Working** (Don't touch):
- ✅ Cross-browser `getCaretRangeFromPoint()` helper
- ✅ RAF throttling (60fps)
- ✅ Block data caching
- ✅ Preview overlay system
- ✅ Validation logic (min chars, max chunks)
- ✅ Server Action (updateAnnotationRange)
- ✅ Cleanup timing (100ms delay)

**Keep Existing** (No refactor):
- BlockRenderer (still receives annotations for injection)
- inject.ts (annotation span generation)
- offset-calculator.ts (range to offset conversion)
- BlockParser (markdown to blocks)

---

## 📚 REFERENCES

**Related Files**:
- `src/hooks/useAnnotationResize.ts` - Main hook (refactor target)
- `src/stores/annotation-store.ts` - Zustand store (add loading state)
- `src/components/reader/VirtualizedReader.tsx` - Remove prop passing
- `src/lib/annotations/inject.ts` - Span generation (unchanged)
- `thoughts/plans/2025-10-29_annotation-resize-markdown.md` - Original plan

**Related Issues**:
- Cross-browser fix (COMPLETED)
- Performance optimization (COMPLETED)
- Preview flashing (COMPLETED)
- Overlap bug (COMPLETED)
- Multi-block detection (IN PROGRESS)

---

## 📊 CURRENT STATUS (2025-10-29 Evening)

**Implementation Progress**: 75% complete
**Testing Progress**: 25% complete
**Overall Status**: ⚠️ PARTIALLY WORKING - Needs continued debugging

### Completed:
- ✅ Phase 1: Store-direct reading (eliminates prop drilling)
- ✅ Phase 2: Loading state (prevents empty renders)
- ✅ Phase 3: Multi-block detection (smart span handling)
- ✅ Phase 4: Direct click detection (no hover required)

### In Progress:
- 🔄 Phase 5: Testing and bug fixes
  - Issue 1: Edge detection positioning ⚠️
  - Issue 2: Preview flashing ❌
  - Issue 3: Handle reliability ❌
  - Issue 4: Other issues (TBD) ❌

### Remaining Work:
1. **Fix preview flashing** - Investigate RAF cleanup timing
2. **Improve edge detection UX** - Current 50px threshold is confusing
3. **Visual handle indicators** - Current box-shadow approach unreliable
4. **Comprehensive testing** - Systematic test of all scenarios
5. **Consider alternative approaches** - May need explicit resize handles

**Time Investment So Far**: ~3 hours (debugging + implementation)
**Estimated Time Remaining**: 2-4 hours (depends on approach chosen)
**Confidence Level**: MEDIUM - Core architecture works, UX needs refinement

---

## 🔄 RECOMMENDED NEXT STEPS

### Option A: Continue Debugging Current Approach (2-3 hours)
**Pros**: Already invested, might be close
**Cons**: Fighting CSS/DOM positioning issues

**Tasks**:
1. Fix preview flashing (highest priority - bad UX)
2. Investigate why box-shadow indicators don't work
3. Test center-based detection thoroughly
4. Add better visual feedback during hover

### Option B: Redesign with Explicit Handles (3-4 hours)
**Pros**: Clearer UX, more reliable
**Cons**: More code, bigger change

**Approach**:
- Add explicit resize handle elements (like `<div class="resize-handle">`)
- Position them with JavaScript at edges
- Clear click targets (no edge detection math needed)
- Similar to how spreadsheet/table resize works

### Option C: Pause and Gather Requirements (30 min)
**Pros**: Step back, think about UX holistically
**Cons**: Delays completion

**Questions to Answer**:
1. What's the expected user workflow? Hover first or click directly?
2. Should handles be always visible or only on hover?
3. Is 8px threshold acceptable if we add visual handles?
4. Are single-span annotations common enough to need special handling?

---

## 💬 RECOMMENDATION

**I recommend Option C → Option A**:
1. First, step back and document the desired UX clearly
2. Then fix the preview flashing (critical for any approach)
3. Then decide whether to continue with edge detection or switch to explicit handles

**Rationale**: We've been debugging incrementally without a clear UX specification. Taking 30 minutes to document exactly how this SHOULD work will save hours of trial-and-error debugging.
