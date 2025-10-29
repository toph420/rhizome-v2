---
date: 2025-10-28T23:45:00-08:00
commit: f561a58c8d8c68158ffd8fea926915b3f27ff2ad
branch: feature/pdf-viewer
topic: "PDF Annotation Capture Panel Simplification"
tags: [pdf-viewer, annotations, ecs, bidirectional-sync]
status: blocked
---

# Handoff: PDF Annotation Capture Panel - Separate from Markdown

## Task(s)

**Goal**: Simplify PDF annotation creation by using a specialized `PDFCapturePanel` instead of trying to make `QuickCapturePanel` work for both PDF and markdown views.

**Status**: ⚠️ **BLOCKED** - Implementation complete but NOT WORKING

### Tasks Completed
1. ✅ Created `PDFCapturePanel` (`src/components/rhizome/pdf-viewer/PDFCapturePanel.tsx`)
2. ✅ Added Server Action `calculatePdfOffsets` (`src/app/actions/annotations.ts:596-659`)
3. ✅ Fixed selection completion tracking in `usePDFSelection.ts` (ref-based)
4. ✅ Fixed infinite loop in PDFViewer auto-fit logic
5. ✅ Reverted `QuickCapturePanel` to clean state (markdown-only)
6. ✅ Fixed TypeScript compilation errors

### Tasks Incomplete
- ❌ **CRITICAL ISSUE 1**: Selection is wonky - multi-line selections intermittently select ALL text on page
- ❌ **CRITICAL ISSUE 2**: Save button does nothing - no network request, no console logs, appears to not fire at all

## Critical Rhizome References
- **PDF Annotation Sync Plan**: `thoughts/plans/2025-10-27_pdf-annotation-sync.md`
- **Architecture**: `docs/ARCHITECTURE.md` - ECS pattern, Server Actions only
- **Annotations System**: `docs/ANNOTATIONS_SYSTEM.md` - 5-component ECS pattern
- **React Guidelines**: `docs/rEACT_GUIDELINES.md` - Server/Client component rules

## Recent Changes

### Files Created
- `src/components/rhizome/pdf-viewer/PDFCapturePanel.tsx` (426 lines)
  - Specialized panel for PDF annotations only
  - Simple props: `{ selection: PDFSelection, documentId, onClose, onAnnotationCreated, chunks }`
  - Handles bidirectional sync internally via Server Action
  - Same UI as QuickCapturePanel (colors, tags, notes, draggable)

### Files Modified

**1. `src/hooks/usePDFSelection.ts`**
- Lines 141-164: Replaced closure variable with `selectingRef` object for reliable state tracking
- Line 247: Changed to `!selectingRef.current` for completion detection
- **Why**: Closure variable `isSelecting` was unreliable across event handlers

**2. `src/app/actions/annotations.ts`**
- Lines 9, 596-659: Added `calculatePdfOffsets()` Server Action
- Loads `docling.md` from Supabase Storage for charspan matching
- Calls `calculateMarkdownOffsets()` from text-offset-calculator
- Returns `{ startOffset, endOffset, confidence, method, matchedChunkId }`
- Converts `'not_found'` method to `undefined` for schema compatibility

**3. `src/components/rhizome/pdf-viewer/PDFViewer.tsx`**
- Lines 17, 166-171: Replaced `PDFAnnotationButton` with `PDFCapturePanel`
- Lines 38-40: Added refs for auto-fit tracking (`hasManuallyZoomedRef`, `hasAutoFittedRef`)
- Lines 155-166: Fixed infinite loop - removed `handleFitPage` from dependency array, use refs instead
- Lines 199-212: Render `PDFCapturePanel` only when `selection.isComplete`
- Removed imports: `createAnnotation`, `toast`, `calculateMarkdownOffsets`, `getConfidenceLevel`

**4. `src/components/reader/QuickCapturePanel.tsx`**
- **REVERTED** to clean state (removed PDF-specific logic)
- Now markdown-only, no `pdfCoordinates` prop, no conversion logic

## Rhizome Architecture Decisions

- [x] **Module**: Main App only (no worker changes)
- [x] **Storage**: Uses Supabase Storage (`docling.md`) + Database (annotations table)
- [x] **Migration**: No schema changes required (uses existing `annotations` table)
- [x] **Test Tier**: Not tested yet (blocked by issues)
- [x] **Pipeline Stage**: N/A (reader-side feature)
- [x] **Engines**: N/A (annotation creation, not connection detection)
- [x] **Pattern**: ECS 5-component (Position, Visual, Content, Temporal, ChunkRef)
- [x] **Sync**: Bidirectional (PDF ↔ Markdown via text-offset-calculator)

## Implementation Strategy (What We Tried)

### Architecture Choice: Separate Panels

**Old approach (failed)**:
```
QuickCapturePanel handles BOTH PDF and markdown
  → Complex props (pdfCoordinates optional)
  → Conversion logic inside component
  → Conditional rendering based on source
  → Too many code paths, hard to debug
```

**New approach (implemented but broken)**:
```
QuickCapturePanel → Markdown view only (clean, simple)
PDFCapturePanel → PDF view only (specialized)

PDFCapturePanel flow:
1. Takes raw PDF selection (text, pageNumber, rects)
2. Calls calculatePdfOffsets() Server Action
3. Server Action loads docling.md + calculates markdown offsets
4. Creates annotation with BOTH representations
5. ECS annotation visible in both views
```

### Key Design Decisions

**1. Server Action for Offset Calculation**
- **Why**: Client components can't import server-only utilities (next/headers)
- **Pattern**: Client → Server Action → Server utility
- **Location**: `src/app/actions/annotations.ts:596-659`

**2. Ref-Based Selection Tracking**
- **Why**: Closure variable `isSelecting` caused race conditions
- **Pattern**: `const selectingRef = { current: false }`
- **Location**: `src/hooks/usePDFSelection.ts:141-164`

**3. Single Responsibility**
- **Why**: One panel, one purpose - easier to debug
- **PDFCapturePanel**: Only PDF annotations
- **QuickCapturePanel**: Only markdown annotations

## 🚨 CRITICAL ISSUES (BLOCKING)

### Issue #1: Wonky Multi-Line Selection

**Symptom**: When selecting text across multiple lines in PDF, it intermittently selects ALL text on the entire page instead of just the selected range.

**Suspected Root Cause**:
- `usePDFSelection.ts:handleSelectionChange()` fires on every mouse movement
- `window.getSelection()` may return incorrect range during drag
- `getBoundingClientRect()` might be calculating wrong coordinates
- React PDF's text layer DOM structure may be causing issues

**Investigation Needed**:
- Add debug logging to `handleSelectionChange()`
- Check `browserSelection.rangeCount` - should be 1
- Verify `range.commonAncestorContainer` is within `.react-pdf__Page`
- Check if `clientRects` array has unexpected length
- Test with single-line selections (do they work?)

**Relevant Code**:
- `src/hooks/usePDFSelection.ts:164-250` - Selection detection logic
- `src/hooks/usePDFSelection.ts:17-104` - Rectangle merging (may be buggy)

### Issue #2: Save Button Does Nothing

**Symptom**: Clicking color buttons or "Save" button has zero effect - no console logs, no network requests, panel stays open.

**Suspected Root Cause**:
- Event handler not firing at all (dead code?)
- TypeScript compilation succeeded but runtime errors?
- Server Action not exported correctly?
- Missing dependency in `useCallback`?
- React portal rendering issue?

**Investigation Needed**:
1. Check browser console for ANY errors
2. Add `console.log` at TOP of `saveAnnotation()` function
3. Verify `calculatePdfOffsets` is actually exported from annotations.ts
4. Check Network tab - any requests to `/actions/annotations`?
5. Verify button `onClick` is actually bound (inspect React DevTools)
6. Check if `savingColor` state is getting stuck (prevents multiple saves)

**Relevant Code**:
- `src/components/rhizome/pdf-viewer/PDFCapturePanel.tsx:99-180` - `saveAnnotation()` function
- `src/components/rhizome/pdf-viewer/PDFCapturePanel.tsx:287-306` - Color button rendering
- `src/app/actions/annotations.ts:596` - Server Action export (check 'use server')

**Quick Debug Steps**:
```typescript
// Add to PDFCapturePanel.tsx:99
const saveAnnotation = useCallback(async (color, shouldClose) => {
  console.log('🔥 SAVE CLICKED!', { color, shouldClose, savingColor }) // ADD THIS
  if (savingColor) {
    console.log('🔥 BLOCKED - already saving')
    return
  }
  // ... rest
}, [savingColor, /* ... */])
```

## Learnings

### 1. Closure Variables Don't Work for Event Handlers
**File**: `src/hooks/usePDFSelection.ts:141`

**Problem**:
```typescript
let isSelecting = false // ❌ Unreliable!

function handleMouseDown() {
  isSelecting = true
}

function handleMouseUp() {
  if (isSelecting) { // May be stale value!
    // ...
  }
}
```

**Solution**: Use ref object
```typescript
const selectingRef = { current: false } // ✅ Reliable

function handleMouseDown() {
  selectingRef.current = true
}

function handleMouseUp() {
  if (selectingRef.current) { // Always current
    // ...
  }
}
```

### 2. Infinite Loops from useEffect Dependencies
**File**: `src/components/rhizome/pdf-viewer/PDFViewer.tsx:155-166`

**Problem**:
```typescript
const handleFitPage = useCallback(() => {
  setScale(...) // Causes re-render
}, [pageHeight])

useEffect(() => {
  handleFitPage() // Triggers setScale
}, [pageHeight, handleFitPage]) // ❌ Both deps change!
```

**Solution**: Remove function from deps, use refs to prevent re-runs
```typescript
const hasAutoFittedRef = useRef(false)

useEffect(() => {
  if (pageHeight > 0 && !hasAutoFittedRef.current) {
    setScale(...)
    hasAutoFittedRef.current = true // Only runs once
  }
}, [pageHeight]) // ✅ Only pageHeight dep
```

### 3. Type Enum Mismatches Break at Runtime
**File**: `src/app/actions/annotations.ts:634-641`

**Problem**: `calculateMarkdownOffsets()` returns `method: 'not_found'` but schema only allows `['exact', 'fuzzy', 'charspan_window', ...]`

**Solution**: Convert to `undefined` when not found
```typescript
if (result.method === 'not_found') {
  return { method: undefined, ... } // ✅ undefined is allowed (optional)
}
```

### 4. Complex Components Are Debugging Nightmares
**Decision**: Split `QuickCapturePanel` into two separate panels

**Why**:
- One purpose per component = easier debugging
- Clear boundaries = less cognitive load
- Isolated logic = faster iteration
- Single code path = predictable behavior

## Artifacts

### Files Created
- `src/components/rhizome/pdf-viewer/PDFCapturePanel.tsx`

### Files Modified (with line numbers)
- `src/hooks/usePDFSelection.ts:141-164,247` - Ref-based selection tracking
- `src/app/actions/annotations.ts:9,596-659` - Server Action for PDF offsets
- `src/components/rhizome/pdf-viewer/PDFViewer.tsx:3,17,38-40,155-166,199-212` - Integration
- `src/components/reader/QuickCapturePanel.tsx` - **REVERTED** (git checkout HEAD)

### Files Read (for context)
- `thoughts/plans/2025-10-27_pdf-annotation-sync.md` (2000+ lines, truncated)
- `docs/ANNOTATIONS_SYSTEM.md` (context)
- Various component files for pattern matching

## Service Restart Requirements
- [x] Supabase: Not needed (no schema changes)
- [x] Worker: Not needed (no worker changes)
- [x] Next.js: Auto-reloaded during development

## Context Usage
- Files read: ~15
- Tokens used: ~160,000 / 200,000 (80%)
- Compaction needed: NO (plenty of room)

## Next Steps (For Next Session)

### Immediate Priorities

**1. Debug Issue #2 First (Easier)**
- Add `console.log('🔥 SAVE CLICKED')` at top of `saveAnnotation()`
- Verify button click actually fires the function
- Check if `savingColor` state is stuck
- Verify `calculatePdfOffsets` is exported as Server Action
- Check browser Network tab for requests

**2. Then Debug Issue #1 (Harder)**
- Add logging to `handleSelectionChange()` to see what's selected
- Check `browserSelection.rangeCount` and `clientRects.length`
- Test single-line selections vs multi-line
- May need to rewrite selection detection logic entirely

### Alternative Approaches if Blocked

**Option A: Revert to PDFAnnotationButton**
- The old `PDFAnnotationButton` was working fine
- Just showed a button that called `createAnnotation()` directly
- No fancy panel, but it WORKED
- Can add panel later once selection is stable

**Option B: Disable Multi-Line Selection**
- Detect multi-line selections and show warning
- Only allow single-line highlights until fixed
- Better than broken experience

**Option C: Use Existing QuickCapturePanel Pattern**
- Investigate why the OLD way was working
- Maybe the conversion logic wasn't the problem?
- Could simplify instead of rewriting

### Testing Checklist (Once Working)
- [ ] Single-line PDF selection → highlight saved
- [ ] Multi-line PDF selection → highlight saved
- [ ] Annotation appears in PDF view immediately
- [ ] Annotation appears in markdown view (bidirectional sync)
- [ ] Offset calculation uses charspan when available
- [ ] Fallback to fuzzy matching works
- [ ] PDF-only annotations work (zero offsets)
- [ ] Color picker responds to keyboard shortcuts (y/g/b/r/p/o/k)
- [ ] Panel can be dragged
- [ ] Cmd+Enter saves and closes
- [ ] Escape closes without saving

## Other Notes

### Code Smells to Investigate

**1. Selection Merging Logic** (`usePDFSelection.ts:17-104`)
- Complex rectangle merging algorithm (38 rects → 3-5 merged)
- May have off-by-one errors or incorrect overlap detection
- Works for single line, fails for multi-line?

**2. Portal Rendering** (`PDFCapturePanel.tsx:448`)
- Uses `createPortal(panelContent, document.body)`
- Could this cause event handler issues?
- Try rendering in-place instead of portal?

**3. useCallback Dependencies** (`PDFCapturePanel.tsx:176-180`)
- Large dependency array: `[savingColor, selection, documentId, note, tags, chunks, onAnnotationCreated, onClose]`
- Missing dependencies could cause stale closures
- Add ESLint exhaustive-deps check

### Useful Debug Commands

```bash
# Check TypeScript errors
npx tsc --noEmit

# Check for console errors in browser
# Open DevTools → Console → filter "PDFCapture" or "usePDFSelection"

# Check git status
git status
git diff src/components/rhizome/pdf-viewer/

# Revert to working state if needed
git checkout HEAD -- src/components/rhizome/pdf-viewer/PDFCapturePanel.tsx
```

### Related Documents
- `thoughts/plans/2025-10-27_pdf-annotation-sync.md` - Master plan for PDF annotation sync
- `docs/ANNOTATIONS_SYSTEM.md` - ECS pattern, recovery, text-based highlighting
- `docs/UI_PATTERNS.md` - No modals rule, persistent UI patterns
- `docs/rEACT_GUIDELINES.md` - Server/Client component boundaries

### Git Commits During Session
```bash
# Before session
f561a58 - docs: update PDF annotation sync plan with Phase 1A completion

# Changes made (not committed)
- Created PDFCapturePanel
- Modified usePDFSelection (ref fix)
- Modified PDFViewer (integration + infinite loop fix)
- Modified annotations.ts (Server Action)
- Reverted QuickCapturePanel
```

---

**Resume with**: `/rhizome:resume-handoff thoughts/handoffs/2025-10-28_pdf-annotation-capture-panel.md`

**Status**: 🔴 **BLOCKED** - Need to debug selection wonkiness and save button not firing before proceeding.
