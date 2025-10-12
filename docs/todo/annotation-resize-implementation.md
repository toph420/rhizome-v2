# Annotation Resize System - Implementation Plan

**Status:** Ready to implement
**Priority:** High (blocking reader usability)
**Estimated Time:** 14-16 hours (spread over 2 weeks)
**Last Updated:** 2025-10-11

---

## Architecture Decisions ✅

### Mode Switching
**Decision:** Always-on proximity detection (Option A)
- Cursor changes to `col-resize` within 8px of highlight edges
- No modifier keys required
- Matches Google Docs/Notion UX patterns

**Rationale:** Most intuitive and discoverable. Users expect edge handles to be always available.

### Save Behavior
**Decision:** Auto-save on mouse release (Option A)
- Immediate persistence on mouseup/touchend
- No confirmation dialog
- Future: Add Cmd+Z undo in Phase 2

**Rationale:** Faster workflow, fewer clicks. Matches modern annotation tools.

### Touch Support Priority
**Decision:** Desktop-first, touch deferred (Low priority)
- Build mouse support first (Phase 1)
- Add iPad/touch in future iteration when deployed
- Keep touch patterns in mind during design

**Rationale:** Local desktop usage is primary use case now.

### Implementation Approach
**Decision:** Iterative with feedback (Option B)
- Phase 1: Core resize logic (T-008)
- Test and validate
- Phase 2: Visual polish (T-009)
- Test and validate
- Phase 3: Edge cases and tests

**Rationale:** Faster feedback loops, catch issues early.

---

## Current State Assessment

### ✅ What's Already Built

**T-006: Resize Detection** (`src/lib/reader/resize-detection.ts`)
- ✅ 8px edge detection zones
- ✅ Touch/mouse event unification
- ✅ Cursor style updates
- ✅ Helper functions for finding highlights

**T-007: Offset Calculator** (`src/lib/reader/offset-calculator.ts`)
- ✅ Multi-block offset calculation
- ✅ Word boundary snapping
- ✅ Block element traversal
- ✅ Validation helpers

**T-010: Text Selection Hook** (`src/hooks/useTextSelection.ts`)
- ✅ 100ms debouncing
- ✅ DOMRect capture
- ✅ Multi-chunk detection
- ✅ Clean selection clearing

**Supporting Infrastructure:**
- ✅ `highlight-injector.ts` - Injects `<mark>` tags
- ✅ `chunk-utils.ts` - 5-chunk limit enforcement
- ✅ `useAnnotations.ts` - ECS CRUD operations
- ✅ Zustand stores (annotation-store, reader-store)
- ✅ VirtualizedReader with Virtuoso integration

### ❌ What's Missing

**T-008: useHighlightResize Hook** (Core logic)
- ❌ Mouse drag handling
- ❌ Range updating during drag
- ❌ 5-chunk limit enforcement during resize
- ❌ Minimum 3-character validation
- ❌ Save operation on release

**T-009: Resize Preview Overlay** (Visual feedback)
- ❌ Blue ring preview during drag
- ❌ Selection API manipulation
- ❌ Cleanup on completion

---

## Implementation Phases

### Phase 1: Core Resize Logic (T-008) - 6 hours

#### 1.1 Create `useHighlightResize.ts` Hook (2 hours)

**File:** `src/hooks/useHighlightResize.ts`

**Interface:**
```typescript
interface UseHighlightResizeOptions {
  annotations: StoredAnnotation[]
  chunks: Chunk[]
  onResizeComplete: (id: string, newRange: OffsetResult) => Promise<void>
  enabled?: boolean
}

interface UseHighlightResizeReturn {
  isResizing: boolean
  resizingAnnotationId: string | null
  previewRange: OffsetResult | null
}

interface ResizeState {
  annotationId: string | null
  edge: 'start' | 'end' | null
  initialRange: Range | null
  currentRange: Range | null
  startOffset: number
  endOffset: number
}
```

**Key Responsibilities:**
1. Listen for `mousemove` on document to detect edge proximity
2. Update cursor style when hovering near edges (8px zone)
3. On `mousedown` within edge zone: initiate resize
4. During drag: update `currentRange` and calculate new offsets
5. On `mouseup`: validate, save, and cleanup
6. Enforce 5-chunk limit during drag
7. Apply word boundary snapping

**Critical Implementation Details:**

**Edge Detection Pattern:**
```typescript
useEffect(() => {
  if (!enabled || isResizing) return

  const handleMouseMove = (e: MouseEvent) => {
    // Find highlight element at mouse position
    const target = e.target as HTMLElement
    const highlightElement = getHighlightFromEvent(e)

    if (!highlightElement) {
      // Reset cursor if not over highlight
      document.body.style.cursor = ''
      return
    }

    // Check proximity to edges
    const handle = detectResizeHandle(e, highlightElement)

    if (handle) {
      // Within 8px - show resize cursor
      highlightElement.style.cursor = 'col-resize'
    } else {
      // Outside zone - reset cursor
      highlightElement.style.cursor = 'pointer'
    }
  }

  document.addEventListener('mousemove', handleMouseMove)
  return () => document.removeEventListener('mousemove', handleMouseMove)
}, [enabled, isResizing])
```

**Drag Initiation Pattern:**
```typescript
const handleMouseDown = useCallback((e: MouseEvent) => {
  // Only handle left clicks
  if (e.button !== 0) return

  const highlightElement = getHighlightFromEvent(e)
  if (!highlightElement) return

  const handle = detectResizeHandle(e, highlightElement)
  if (!handle) return // Not near edge

  // Prevent text selection during resize
  e.preventDefault()

  // Find annotation data
  const annotation = annotations.find(a => a.id === handle.annotationId)
  if (!annotation?.components.position) return

  // Initialize resize state
  setResizeState({
    annotationId: handle.annotationId,
    edge: handle.edge,
    startOffset: annotation.components.position.startOffset,
    endOffset: annotation.components.position.endOffset,
    initialRange: null,
    currentRange: null
  })

  setIsResizing(true)
}, [annotations])
```

**Drag Update Pattern:**
```typescript
const handleMouseMove = useCallback((e: MouseEvent) => {
  if (!isResizing || !resizeState) return

  // Get current selection range
  const selection = window.getSelection()
  if (!selection) return

  // Calculate new range based on mouse position
  // This is the tricky part - need to convert mouse coordinates to text offset
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  if (!range) return

  // Calculate offsets
  const offsetResult = calculateOffsetsFromRange(range, true)

  // Determine new start/end based on which edge is being dragged
  let newStartOffset = resizeState.startOffset
  let newEndOffset = resizeState.endOffset

  if (resizeState.edge === 'start') {
    newStartOffset = offsetResult.startOffset
  } else {
    newEndOffset = offsetResult.endOffset
  }

  // Enforce 5-chunk limit
  const spannedChunks = findSpannedChunks(newStartOffset, newEndOffset, chunks)
  if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
    // Stop at 5-chunk boundary
    if (resizeState.edge === 'end') {
      newEndOffset = spannedChunks[MAX_CHUNKS_PER_ANNOTATION - 1].end_offset
    } else {
      newStartOffset = spannedChunks[spannedChunks.length - MAX_CHUNKS_PER_ANNOTATION].start_offset
    }
  }

  // Enforce minimum 3 characters
  if (newEndOffset - newStartOffset < 3) {
    return // Don't update if too small
  }

  // Update preview state
  setResizeState(prev => ({
    ...prev!,
    currentRange: range
  }))

  setPreviewRange({
    startOffset: newStartOffset,
    endOffset: newEndOffset,
    selectedText: '', // Will be filled by Selection API
    snapped: false
  })
}, [isResizing, resizeState, chunks])
```

**Save Pattern:**
```typescript
const handleMouseUp = useCallback(async () => {
  if (!isResizing || !resizeState || !previewRange) return

  try {
    // Validate final range
    if (previewRange.endOffset - previewRange.startOffset < 3) {
      toast.error('Annotation too short', {
        description: 'Annotations must be at least 3 characters',
      })
      cleanupResize()
      return
    }

    // Call resize complete callback
    await onResizeComplete(resizeState.annotationId!, previewRange)

    toast.success('Annotation resized')
  } catch (error) {
    console.error('[useHighlightResize] Save failed:', error)
    toast.error('Failed to resize annotation')
  } finally {
    cleanupResize()
  }
}, [isResizing, resizeState, previewRange, onResizeComplete])
```

**Validation Rules:**
1. Minimum 3 characters
2. Maximum 5 chunks
3. Must be within valid block boundaries
4. Word boundary snapping applied

#### 1.2 Integrate with VirtualizedReader (1.5 hours)

**File:** `src/components/reader/VirtualizedReader.tsx`

**Changes:**
```typescript
// Add resize hook
const {
  isResizing,
  resizingAnnotationId,
  previewRange
} = useHighlightResize({
  annotations,
  chunks,
  onResizeComplete: handleAnnotationResize,
  enabled: !captureSelection // Disable during new annotation creation
})

// Implement resize handler
const handleAnnotationResize = useCallback(async (
  annotationId: string,
  newRange: OffsetResult
) => {
  if (!documentId) return

  // Find annotation in store
  const annotation = annotations.find(a => a.id === annotationId)
  if (!annotation) return

  // Create updated annotation
  const updatedAnnotation: StoredAnnotation = {
    ...annotation,
    components: {
      ...annotation.components,
      annotation: {
        ...annotation.components.annotation!,
        range: {
          startOffset: newRange.startOffset,
          endOffset: newRange.endOffset,
          chunkIds: findSpannedChunks(
            newRange.startOffset,
            newRange.endOffset,
            chunks
          ).map(ch => ch.id)
        }
      },
      position: {
        ...annotation.components.position!,
        startOffset: newRange.startOffset,
        endOffset: newRange.endOffset,
        chunkIds: findSpannedChunks(
          newRange.startOffset,
          newRange.endOffset,
          chunks
        ).map(ch => ch.id)
      }
    }
  }

  // Call server action to persist
  const result = await updateAnnotation(annotationId, {
    startOffset: newRange.startOffset,
    endOffset: newRange.endOffset
  })

  if (result.success) {
    // Update Zustand store
    updateStoreAnnotation(documentId, annotationId, updatedAnnotation)
  } else {
    throw new Error(result.error)
  }
}, [documentId, annotations, chunks, updateStoreAnnotation])
```

**Pass resize state to BlockRenderer:**
```typescript
<BlockRenderer
  block={block}
  annotations={annotationsForBlocks}
  onAnnotationClick={handleAnnotationEdit}
  resizingAnnotationId={resizingAnnotationId} // NEW
  previewRange={previewRange} // NEW
/>
```

#### 1.3 Add Cursor Feedback (1 hour)

**Implementation:**
- Already handled in `useHighlightResize` hook
- Cursor changes to `col-resize` within 8px zone
- Returns to `pointer` outside zone
- No cursor change during drag (shows system drag cursor)

**CSS Support:**
```css
/* In global CSS or Tailwind config */
.annotation-resize-handle {
  cursor: col-resize;
}

mark[data-annotation-id]:hover {
  outline: 1px solid rgba(59, 130, 246, 0.3);
}
```

#### 1.4 Server Action for Updates (1 hour)

**File:** `src/app/actions/annotations.ts`

**Add new action:**
```typescript
'use server'

export async function updateAnnotationRange(
  annotationId: string,
  newRange: {
    startOffset: number
    endOffset: number
    chunkIds: string[]
  }
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const supabase = createServerClient()
    const ecs = new ECS(supabase)
    const ops = new AnnotationOperations(ecs, user.id)

    // Get current annotation
    const annotation = await ops.getById(annotationId)
    if (!annotation) {
      return { success: false, error: 'Annotation not found' }
    }

    // Update both annotation and position components
    await ops.update(annotationId, {
      range: newRange,
      // Position component gets updated automatically by ECS
    })

    revalidatePath(`/read/[id]`, 'page')

    return { success: true, data: undefined }
  } catch (error) {
    console.error('[updateAnnotationRange] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

#### 1.5 Testing Phase 1 (30 minutes)

**Manual Testing Checklist:**
- [ ] Cursor changes to `col-resize` when hovering near edges (within 8px)
- [ ] Cursor returns to `pointer` when outside 8px zone
- [ ] Mousedown within edge zone initiates resize
- [ ] Drag updates annotation preview (visual feedback in Phase 2)
- [ ] Mouseup saves new annotation boundaries
- [ ] Toast confirmation on successful resize
- [ ] Error toast if validation fails (< 3 chars)
- [ ] 5-chunk limit enforced (error toast if exceeded)
- [ ] Resize works from start edge
- [ ] Resize works from end edge
- [ ] Multi-chunk annotation resizes correctly
- [ ] Word boundary snapping applied
- [ ] Works with nested HTML (bold, italic, links)

---

### Phase 2: Visual Preview (T-009) - 3 hours

#### 2.1 Selection API Preview (1.5 hours)

**File:** `src/hooks/useHighlightResize.ts` (extend existing hook)

**Add preview logic to drag handler:**
```typescript
const updateResizePreview = useCallback((range: Range) => {
  const selection = window.getSelection()
  if (!selection) return

  // Clear existing selection
  selection.removeAllRanges()

  // Add new range for preview
  selection.addRange(range)

  // Add visual class to body for CSS styling
  document.body.classList.add('annotation-resizing')
}, [])

// Call during mousemove
const handleMouseMove = useCallback((e: MouseEvent) => {
  if (!isResizing) return

  // ... existing offset calculation ...

  // Update visual preview
  if (range) {
    updateResizePreview(range)
  }
}, [isResizing, updateResizePreview])
```

**Cleanup logic:**
```typescript
const cleanupResizePreview = useCallback(() => {
  // Remove visual class
  document.body.classList.remove('annotation-resizing')

  // Clear selection
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }
}, [])

// Call in handleMouseUp and on unmount
useEffect(() => {
  return () => {
    cleanupResizePreview()
  }
}, [cleanupResizePreview])
```

#### 2.2 CSS Styling (30 minutes)

**File:** `src/app/globals.css` or component CSS

**Add blue ring preview style:**
```css
/* Blue ring preview during resize */
body.annotation-resizing ::selection {
  background-color: rgba(59, 130, 246, 0.2);
  outline: 2px solid rgb(59, 130, 246);
  border-radius: 2px;
}

/* Prevent text selection during resize */
body.annotation-resizing {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* Hide existing highlight during resize */
body.annotation-resizing mark[data-annotation-id] {
  background-color: transparent;
  outline: none;
}

/* Smooth transitions */
mark[data-annotation-id] {
  transition: outline 0.15s ease;
}
```

#### 2.3 Testing Phase 2 (1 hour)

**Visual Testing Checklist:**
- [ ] Blue ring appears during drag
- [ ] Preview updates smoothly during mousemove
- [ ] Original highlight hides during resize
- [ ] Preview cleans up on mouseup
- [ ] Preview cleans up on Escape key
- [ ] No visual artifacts after completion
- [ ] Selection API resets properly
- [ ] Works across multiple blocks
- [ ] Performance is smooth (60fps)

---

### Phase 3: Edge Cases & Polish - 5 hours

#### 3.1 Validation & Error Handling (2 hours)

**Scenarios to handle:**

**1. Minimum Length Validation:**
```typescript
if (newEndOffset - newStartOffset < 3) {
  toast.error('Annotation too short', {
    description: 'Annotations must be at least 3 characters'
  })
  return
}
```

**2. 5-Chunk Limit:**
```typescript
const spannedChunks = findSpannedChunks(newStartOffset, newEndOffset, chunks)
if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
  toast.warning('Chunk limit reached', {
    description: `Annotations can span maximum ${MAX_CHUNKS_PER_ANNOTATION} chunks`
  })
  // Auto-cap at 5th chunk boundary
  newEndOffset = spannedChunks[MAX_CHUNKS_PER_ANNOTATION - 1].end_offset
}
```

**3. Network Error Rollback:**
```typescript
try {
  await onResizeComplete(annotationId, newRange)
} catch (error) {
  toast.error('Failed to save resize', {
    description: 'Your changes were not saved. Please try again.',
    action: {
      label: 'Retry',
      onClick: () => onResizeComplete(annotationId, newRange)
    }
  })
  // Revert optimistic update
  cleanupResize()
}
```

**4. Zero-Length Attempt:**
```typescript
// Prevent collapsing to zero
if (newStartOffset >= newEndOffset) {
  return // Don't update
}
```

**5. Out-of-Bounds:**
```typescript
// Ensure within document bounds
const maxOffset = markdown.length
newEndOffset = Math.min(newEndOffset, maxOffset)
newStartOffset = Math.max(0, newStartOffset)
```

#### 3.2 Keyboard Support (1 hour)

**Add Escape to cancel:**
```typescript
useEffect(() => {
  if (!isResizing) return

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanupResize()
      toast.info('Resize cancelled')
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [isResizing, cleanupResize])
```

**Add arrow keys for fine-tuning (optional):**
```typescript
if (e.key === 'ArrowLeft' && resizeState?.edge === 'end') {
  // Move end edge left by 1 word
  adjustEndOffset(-1)
} else if (e.key === 'ArrowRight' && resizeState?.edge === 'end') {
  // Move end edge right by 1 word
  adjustEndOffset(1)
}
```

#### 3.3 Unit Tests (1.5 hours)

**File:** `src/hooks/__tests__/useHighlightResize.test.ts`

**Test cases:**
```typescript
describe('useHighlightResize', () => {
  it('initiates resize when mousedown within 8px edge zone', () => {
    // Test setup...
    const { result } = renderHook(() => useHighlightResize(options))

    // Simulate mousedown at edge
    fireEvent.mouseDown(highlightElement, { clientX: 198 })

    expect(result.current.isResizing).toBe(true)
  })

  it('does not initiate resize when mousedown outside 8px zone', () => {
    // Test setup...
    const { result } = renderHook(() => useHighlightResize(options))

    // Simulate mousedown away from edge
    fireEvent.mouseDown(highlightElement, { clientX: 150 })

    expect(result.current.isResizing).toBe(false)
  })

  it('enforces 5-chunk limit during resize', async () => {
    // Test with 10 chunks available
    const chunks = createMockChunks(10)
    const { result } = renderHook(() => useHighlightResize({
      ...options,
      chunks
    }))

    // Simulate drag that would span 7 chunks
    act(() => {
      // Start resize...
      // Drag to offset in chunk 7...
    })

    // Should cap at chunk 5
    expect(result.current.previewRange?.endOffset)
      .toBe(chunks[4].end_offset)
  })

  it('prevents resize below 3 characters', () => {
    // Test minimum length validation
  })

  it('applies word boundary snapping', () => {
    // Test word snapping behavior
  })

  it('calls onResizeComplete with correct offsets', async () => {
    const mockCallback = jest.fn()
    // Test save callback
  })

  it('cleans up preview on mouseup', () => {
    // Test cleanup logic
  })

  it('cancels resize on Escape key', () => {
    // Test keyboard cancel
  })
})
```

#### 3.4 Integration Tests (30 minutes)

**File:** `tests/integration/annotation-resize-flow.test.ts`

**Test full resize flow:**
```typescript
describe('Annotation Resize Flow', () => {
  it('completes full resize with auto-save', async () => {
    // Setup mocks
    const mockUpdateAnnotation = jest.fn().mockResolvedValue({
      success: true
    })

    // Render reader
    render(<VirtualizedReader />)

    // Wait for annotations to load
    await waitFor(() => {
      expect(screen.getByTestId('annotation-mark')).toBeInTheDocument()
    })

    // Find existing annotation
    const highlight = screen.getByTestId('annotation-mark')

    // Hover near edge
    await userEvent.hover(highlight, { clientX: 198 })
    expect(highlight).toHaveStyle({ cursor: 'col-resize' })

    // Drag to resize
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: highlight, coords: { x: 198 } },
      { coords: { x: 250 } }, // Drag 52px
      { keys: '[/MouseLeft]' }
    ])

    // Verify save called
    await waitFor(() => {
      expect(mockUpdateAnnotation).toHaveBeenCalledWith(
        'ann-1',
        expect.objectContaining({
          startOffset: expect.any(Number),
          endOffset: expect.any(Number)
        })
      )
    })

    // Verify UI updated
    expect(screen.getByText('Annotation resized')).toBeInTheDocument()
  })

  it('shows error toast when chunk limit exceeded', async () => {
    // Test 5-chunk limit error
  })

  it('shows error toast when too short', async () => {
    // Test minimum length error
  })
})
```

---

## File Structure

```
src/
├── hooks/
│   ├── useHighlightResize.ts          # NEW - Core resize logic
│   ├── useTextSelection.ts            # EXISTING - Selection tracking
│   └── __tests__/
│       └── useHighlightResize.test.ts # NEW - Unit tests
├── lib/reader/
│   ├── resize-detection.ts            # EXISTING - Edge detection
│   ├── offset-calculator.ts           # EXISTING - Offset calculation
│   ├── chunk-utils.ts                 # EXISTING - Chunk operations
│   └── highlight-injector.ts          # EXISTING - Mark injection
├── components/reader/
│   ├── VirtualizedReader.tsx          # MODIFY - Add resize hook
│   └── BlockRenderer.tsx              # MODIFY - Pass resize state
├── app/actions/
│   └── annotations.ts                 # MODIFY - Add updateAnnotationRange
├── app/
│   └── globals.css                    # MODIFY - Add resize preview CSS
└── tests/integration/
    └── annotation-resize-flow.test.ts # NEW - Integration tests
```

---

## Performance Considerations

### 1. Throttle Mousemove Events
```typescript
import { throttle } from 'lodash-es'

const throttledMouseMove = throttle((e: MouseEvent) => {
  handleMouseMove(e)
}, 16) // 60fps
```

### 2. Debounce Offset Calculation
```typescript
import { debounce } from 'lodash-es'

const debouncedOffsetCalc = debounce((range: Range) => {
  const offsets = calculateOffsetsFromRange(range)
  setPreviewRange(offsets)
}, 50)
```

### 3. Optimize Chunk Lookups
- `findSpannedChunks` uses O(n) filtering - acceptable for <1000 chunks
- Consider binary search if chunk count grows large
- Cache chunk lookups during drag (same chunks per annotation)

### 4. Minimize Re-renders
```typescript
// Use refs for values that don't need to trigger re-renders
const dragStateRef = useRef<ResizeState | null>(null)

// Only update state when preview needs to change
const [previewRange, setPreviewRange] = useState<OffsetResult | null>(null)
```

---

## Testing Strategy

### Unit Tests (Critical)
- ✅ Edge detection within 8px
- ✅ Edge detection outside zone returns null
- ✅ Resize initiation on mousedown
- ✅ 5-chunk limit enforcement
- ✅ Minimum 3-character validation
- ✅ Word boundary snapping
- ✅ Cleanup on mouseup
- ✅ Cancel on Escape key

### Integration Tests (Stable)
- ✅ Full resize flow with save
- ✅ Error handling for validation failures
- ✅ Multi-chunk annotation resize
- ✅ Optimistic update + server sync
- ✅ Network error rollback

### Manual Testing (Required)
- [ ] Visual preview appearance
- [ ] Smooth cursor transitions
- [ ] Performance with large documents
- [ ] Cross-browser compatibility
- [ ] Edge cases (document boundaries, nested HTML)

---

## Risks & Mitigations

### Risk 1: Event Conflicts with Text Selection
**Mitigation:** Proximity-based mode switching (8px zone)
- Within zone = resize mode
- Outside zone = selection mode
- `preventDefault()` during resize to avoid conflicts

### Risk 2: Performance with Large Documents
**Mitigation:** Throttle/debounce + efficient chunk lookups
- Throttle mousemove to 60fps (16ms)
- Debounce offset calculation (50ms)
- Cache chunk references during drag

### Risk 3: Multi-Chunk Boundary Calculations
**Mitigation:** Comprehensive testing + clear limit messaging
- Test with 1, 3, 5, and 7-chunk selections
- Show toast when limit reached
- Auto-cap at 5th chunk boundary (don't error)

### Risk 4: Browser Selection API Quirks
**Mitigation:** Careful cleanup + cross-browser testing
- Clear ranges on completion
- Remove CSS classes
- Test in Chrome, Firefox, Safari

---

## Future Enhancements (Deferred)

### Touch Support (Phase 4)
When iPad deployment is needed:
- Long-press detection (500ms)
- Touch event handling with `passive: false`
- Prevent scroll during resize
- Touch-specific visual feedback

### Undo/Redo (Phase 5)
- Cmd+Z to undo resize
- Cmd+Shift+Z to redo
- Store resize history in Zustand

### Batch Resize (Phase 6)
- Select multiple annotations
- Resize all at once
- Useful for fixing batch imports

### Keyboard-Only Resize (Phase 7)
- Arrow keys for fine-tuning
- Enter to confirm
- Accessibility improvement

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Cursor changes to `col-resize` within 8px
- ✅ Drag from edge resizes annotation
- ✅ Auto-save on mouseup
- ✅ Toast confirmation on success
- ✅ Error toast on validation failure
- ✅ 5-chunk limit enforced
- ✅ Minimum 3 characters enforced
- ✅ Word boundary snapping applied

### Phase 2 Complete When:
- ✅ Blue ring preview appears during drag
- ✅ Preview updates smoothly
- ✅ Original highlight hides during resize
- ✅ Cleanup is complete after release
- ✅ No visual artifacts

### Phase 3 Complete When:
- ✅ All unit tests pass
- ✅ Integration tests pass
- ✅ Manual testing checklist complete
- ✅ Error handling tested
- ✅ Edge cases validated

---

## Next Steps

### Immediate (Now)
1. ✅ Architecture decisions finalized
2. ✅ Plan saved to `docs/todo/`
3. 🔄 **Start Phase 1.1:** Create `useHighlightResize.ts` hook

### After Phase 1.1 Complete
- Test cursor feedback and edge detection
- Validate drag initiation
- Verify state management

### After Phase 1 Complete
- Full manual testing of resize flow
- Fix any bugs discovered
- Gather user feedback

### After Phase 2 Complete
- Visual testing of preview
- Performance validation
- Polish interactions

### After Phase 3 Complete
- Deploy for testing
- Monitor for edge cases
- Plan Phase 4 (touch support) if needed

---

## Questions & Notes

### Unanswered Questions
- None currently - all architecture decisions made

### Implementation Notes
- Keep touch patterns in mind during design (easier to add later)
- Consider performance from the start (throttle/debounce)
- Test with large documents (500+ pages)
- Validate across different markdown structures

### Gotchas to Remember
- `window.getSelection()` can be null in some contexts
- DOMRect changes when viewport scrolls (use relative positioning)
- Virtuoso re-renders blocks - don't break event listeners
- Word boundary snapping may change offset by several characters
- Multi-block selections need independent start/end block resolution

---

**Ready to start Phase 1.1: Create useHighlightResize hook**
