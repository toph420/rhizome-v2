# PRP: Annotation Resize System

**Status:** Ready for Implementation
**Priority:** High (Blocking Reader Usability)
**Estimated Time:** 12.5 hours (revised from 14-16 hours)
**Created:** 2025-10-15
**Owner:** Development Team

---

## Executive Summary

Implement drag-to-resize functionality for annotations in the document reader, allowing users to adjust annotation boundaries by dragging edges. This feature builds on **70% existing infrastructure** (CSS handles, resize detection utilities, offset calculation) and requires primarily integration work plus a critical bug fix.

**Key Decisions:**
- ✅ Global text selection prevention during resize
- ✅ Optimistic updates with rollback on failure
- ✅ 2-retry pattern with exponential backoff
- ✅ Touch support included (long-press detection)
- ✅ Testing before visual polish
- ✅ Always-on word boundary snapping

**Time Breakdown:**
- Phase 1 (Core Implementation): 5.5 hours
- Phase 2 (Testing & Edge Cases): 4 hours
- Phase 3 (Visual Polish & Touch): 3 hours

**Risk Level:** Low - Proven patterns and existing infrastructure reduce complexity

---

## Problem Statement

Users cannot adjust annotation boundaries after creation. If they accidentally select too much or too little text, they must delete and recreate the annotation, losing any notes or tags attached.

**User Impact:**
- Lost manual work (notes, tags, color choices)
- Frustration with imprecise selection
- Reduced annotation quality

**Business Value:**
- Improved annotation accuracy
- Reduced user friction
- Better knowledge capture quality

---

## Goals & Non-Goals

### Goals
1. Enable drag-to-resize from annotation edges (8px detection zone)
2. Auto-save on mouse release with optimistic updates
3. Maintain 5-chunk limit and 3-character minimum during resize
4. Provide clear visual feedback during drag
5. Support both desktop (mouse) and iPad (touch)
6. Handle network failures gracefully with rollback

### Non-Goals
- Batch resize (multiple annotations at once)
- Undo/Redo system (deferred to future)
- Keyboard-only resize (arrow keys)
- Auto-scroll during drag (nice-to-have)

---

## Architecture Decisions

### 1. Text Selection Prevention Strategy

**Decision:** Global prevention during resize (Option A)

```typescript
// Prevent all text selection while resizing any annotation
document.body.classList.add('annotation-resizing')

// CSS:
.annotation-resizing {
  user-select: none;
  -webkit-user-select: none;
}
```

**Rationale:**
- Matches industry standards (Google Docs, Notion)
- Cleanest UX - no partial selection conflicts
- Simple implementation

### 2. Error Recovery Strategy

**Decision:** Optimistic updates with rollback + 2 retries

```typescript
// 1. Store original state
const original = annotations.find(a => a.id === annotationId)

// 2. Optimistic update (immediate UI)
updateStoreAnnotation(documentId, annotationId, newAnnotation)

// 3. Save with retry
try {
  await saveWithRetry(annotationId, newRange, maxRetries: 2)
  toast.success('Annotation resized')
} catch (error) {
  // 4. Rollback on failure
  updateStoreAnnotation(documentId, annotationId, original)
  toast.error('Failed to save resize', {
    action: { label: 'Retry', onClick: () => retry() }
  })
}
```

**Retry Logic:**
- Exponential backoff: 1s, 2s delays
- Don't retry validation failures (too short, too many chunks)
- Only retry network/server errors

**Rationale:**
- User time investment in manual resizing is high
- Network glitches shouldn't lose work
- Optimistic updates feel instant

### 3. Touch Support

**Decision:** Include in Phase 3 (1 hour investment)

**Implementation:**
- Long-press detection (500ms threshold)
- Touch drag for resize motion
- Haptic feedback on iPad (navigator.vibrate(50))
- Prevent scroll during resize (preventDefault)

**Rationale:**
- User reads on iPad Chrome primarily
- Only 1 hour investment for significant UX improvement
- Touch pattern already partially implemented in resize-detection.ts

### 4. Virtualization Handling

**Decision:** Track by offset, not DOM elements

```typescript
// Store offset, not element reference
const [resizeState, setResizeState] = useState({
  annotationId: 'ann-123',
  edge: 'end',
  currentOffset: 1500, // ← Offset value
  originalStart: 1000,
  originalEnd: 1500
})
```

**Rationale:**
- react-virtuoso unmounts blocks during scroll
- DOM references break when blocks virtualize
- Offsets remain stable across virtualization
- Existing calculateOffsetsFromRange() handles this

### 5. State Management

**Decision:** Hook local state + VirtualizedReader integration (Hybrid)

```typescript
// In useAnnotationResize.ts
const [dragState, setDragState] = useState<DragState | null>(null)
const [previewRange, setPreviewRange] = useState<OffsetResult | null>(null)

return {
  isResizing: !!dragState,
  resizingAnnotationId: dragState?.annotationId ?? null,
  previewRange,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp
}

// In VirtualizedReader.tsx
const resizeProps = useAnnotationResize({
  annotations,
  chunks,
  onResizeComplete: handleAnnotationResize
})

// Pass to BlockRenderer
<BlockRenderer {...resizeProps} block={block} />
```

**Rationale:**
- Follows existing pattern (editingAnnotation in VirtualizedReader)
- Avoids Zustand store pollution with transient UI state
- Encapsulated in hook for testability

### 6. Performance Optimization

**Decision:** requestAnimationFrame over throttle

```typescript
const rafId = useRef<number | null>(null)

const handleMouseMove = (e: MouseEvent) => {
  if (rafId.current) cancelAnimationFrame(rafId.current)

  rafId.current = requestAnimationFrame(() => {
    updatePreviewOffset(e.clientX, e.clientY)
  })
}
```

**Additional Optimizations:**
- Use refs for drag state (avoid re-renders)
- Only update Zustand on mouseup (not during drag)
- Cache offset calculation if mouse moved < 5px
- 5px movement threshold for click vs drag detection

**Expected Performance:** 60fps smooth dragging

---

## Technical Implementation

### Phase 1: Core Implementation (5.5 hours)

#### 1.1 Fix Critical Bug - MARK → SPAN (30 minutes)

**File:** `src/lib/reader/resize-detection.ts`

**Problem:** Functions check for `MARK` tags but system uses `SPAN` tags with `data-annotation-id`

**Changes:**
```typescript
// Line 88: isHighlightElement()
export function isHighlightElement(element: HTMLElement): boolean {
  return element.tagName === 'SPAN' &&
         element.hasAttribute('data-annotation-id')
}

// Line 106, 111: getHighlightFromEvent()
// Update all MARK checks to SPAN + data-annotation-id checks
if (target.tagName === 'SPAN' && target.hasAttribute('data-annotation-id')) {
  return target
}

// Traverse up DOM tree
while (current && current !== document.body) {
  if (current.tagName === 'SPAN' && current.hasAttribute('data-annotation-id')) {
    return current
  }
  current = current.parentElement
}
```

**Testing:**
- Verify detectResizeHandle() returns correct handle within 8px
- Verify null returned outside 8px zone
- Test with existing CSS handles (::before/::after)

#### 1.2 Create useAnnotationResize Hook (2 hours)

**File:** `src/hooks/useAnnotationResize.ts`

**Interface:**
```typescript
interface UseAnnotationResizeOptions {
  annotations: StoredAnnotation[]
  chunks: Chunk[]
  onResizeComplete: (id: string, newRange: OffsetResult) => Promise<void>
  enabled?: boolean
}

interface UseAnnotationResizeReturn {
  isResizing: boolean
  resizingAnnotationId: string | null
  previewRange: OffsetResult | null
  handleMouseDown: (e: React.MouseEvent) => void
  handleMouseMove: (e: React.MouseEvent) => void
  handleMouseUp: (e: React.MouseEvent) => void
}

interface DragState {
  annotationId: string
  edge: 'start' | 'end'
  originalStartOffset: number
  originalEndOffset: number
  hitChunkLimit: boolean
}
```

**Key Implementation Details:**

**Edge Detection:**
```typescript
const handleMouseDown = useCallback((e: React.MouseEvent) => {
  if (e.button !== 0) return // Only left click

  const target = e.target as HTMLElement
  const annotationSpan = target.closest('[data-annotation-id]')
  if (!annotationSpan) return

  // Check if within 8px edge zone
  const handle = detectResizeHandle(e.nativeEvent, annotationSpan as HTMLElement)
  if (!handle) return

  // Prevent text selection + event bubbling
  e.preventDefault()
  e.stopPropagation()

  // Find annotation data
  const annotation = annotations.find(a => a.id === handle.annotationId)
  if (!annotation?.components.position) return

  // If already resizing different annotation, cancel current
  if (isResizing && dragState?.annotationId !== handle.annotationId) {
    cleanupResize()
    toast.info('Previous resize cancelled')
  }

  // Initialize drag state
  setDragState({
    annotationId: handle.annotationId,
    edge: handle.edge,
    originalStartOffset: annotation.components.position.startOffset,
    originalEndOffset: annotation.components.position.endOffset,
    hitChunkLimit: false
  })

  setIsResizing(true)

  // Add global no-select class
  document.body.classList.add('annotation-resizing')
}, [annotations, isResizing, dragState])
```

**Drag Update:**
```typescript
const rafId = useRef<number | null>(null)

const handleMouseMove = useCallback((e: React.MouseEvent) => {
  if (!isResizing || !dragState) return

  // Cancel previous frame
  if (rafId.current) {
    cancelAnimationFrame(rafId.current)
  }

  // Schedule update for next frame (60fps)
  rafId.current = requestAnimationFrame(() => {
    // Get range at mouse position
    const range = document.caretRangeFromPoint(
      e.nativeEvent.clientX,
      e.nativeEvent.clientY
    )
    if (!range) return

    // Convert to offset using EXISTING UTILITY
    const offsetResult = calculateOffsetsFromRange(range, true) // true = snap to words

    // Calculate new range based on which edge is being dragged
    let newStart = dragState.originalStartOffset
    let newEnd = dragState.originalEndOffset

    if (dragState.edge === 'start') {
      newStart = offsetResult.startOffset
    } else {
      newEnd = offsetResult.endOffset
    }

    // Enforce 5-chunk limit
    const spannedChunks = findSpannedChunks(newStart, newEnd, chunks)
    let hitLimit = false

    if (spannedChunks.length > MAX_CHUNKS_PER_ANNOTATION) {
      hitLimit = true
      if (dragState.edge === 'end') {
        newEnd = spannedChunks[MAX_CHUNKS_PER_ANNOTATION - 1].end_offset
      } else {
        const validChunks = spannedChunks.slice(-MAX_CHUNKS_PER_ANNOTATION)
        newStart = validChunks[0].start_offset
      }

      // Visual feedback
      document.body.setAttribute('data-chunk-limit-reached', 'true')
    } else {
      document.body.removeAttribute('data-chunk-limit-reached')
    }

    // Enforce minimum 3 characters
    if (newEnd - newStart < 3) {
      return // Don't update preview
    }

    // Update preview state
    setDragState(prev => ({ ...prev!, hitChunkLimit: hitLimit }))
    setPreviewRange({
      startOffset: newStart,
      endOffset: newEnd,
      selectedText: '',
      snapped: true
    })
  })
}, [isResizing, dragState, chunks])
```

**Save on Release:**
```typescript
const abortController = useRef<AbortController | null>(null)

const handleMouseUp = useCallback(async () => {
  if (!isResizing || !dragState || !previewRange) return

  try {
    // Validate final range
    if (previewRange.endOffset - previewRange.startOffset < 3) {
      toast.error('Annotation too short', {
        description: 'Annotations must be at least 3 characters'
      })
      cleanupResize()
      return
    }

    // Create abort controller for cancellation
    abortController.current = new AbortController()

    // Call resize complete callback
    await onResizeComplete(dragState.annotationId, previewRange)

    // Show appropriate toast
    if (dragState.hitChunkLimit) {
      toast.info('Annotation capped at 5 chunks')
    } else {
      toast.success('Annotation resized')
    }
  } catch (error) {
    console.error('[useAnnotationResize] Save failed:', error)
    toast.error('Failed to resize annotation', {
      description: error.message,
      action: {
        label: 'Retry',
        onClick: () => onResizeComplete(dragState.annotationId, previewRange)
      }
    })
  } finally {
    cleanupResize()
  }
}, [isResizing, dragState, previewRange, onResizeComplete])
```

**Escape Cancellation:**
```typescript
useEffect(() => {
  if (!isResizing) return

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()

      // Cancel in-flight request
      if (abortController.current) {
        abortController.current.abort()
      }

      cleanupResize()
      toast.info('Resize cancelled')
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [isResizing, cleanupResize])
```

**Cleanup Logic:**
```typescript
const cleanupResize = useCallback(() => {
  // Clear drag state
  setDragState(null)
  setPreviewRange(null)
  setIsResizing(false)

  // Remove CSS classes
  document.body.classList.remove('annotation-resizing')
  document.body.removeAttribute('data-chunk-limit-reached')

  // Clear Selection API preview
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }

  // Clear RAF
  if (rafId.current) {
    cancelAnimationFrame(rafId.current)
    rafId.current = null
  }

  // Clear abort controller
  abortController.current = null
}, [])
```

#### 1.3 Integrate with VirtualizedReader (1 hour)

**File:** `src/components/reader/VirtualizedReader.tsx`

**Changes:**
```typescript
// Import hook
import { useAnnotationResize } from '@/hooks/useAnnotationResize'

// Add resize hook (after useTextSelection)
const resizeProps = useAnnotationResize({
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

  // Store original for rollback
  const originalAnnotation = { ...annotation }

  // Calculate new chunk IDs
  const spannedChunks = findSpannedChunks(
    newRange.startOffset,
    newRange.endOffset,
    chunks
  )

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
          chunkIds: spannedChunks.map(ch => ch.id)
        }
      },
      position: {
        ...annotation.components.position!,
        startOffset: newRange.startOffset,
        endOffset: newRange.endOffset,
        chunkIds: spannedChunks.map(ch => ch.id)
      }
    }
  }

  // Optimistic update
  updateStoreAnnotation(documentId, annotationId, updatedAnnotation)

  try {
    // Save with retry (2 attempts, exponential backoff)
    await saveAnnotationResizeWithRetry(
      annotationId,
      {
        startOffset: newRange.startOffset,
        endOffset: newRange.endOffset,
        chunkIds: spannedChunks.map(ch => ch.id)
      },
      2 // maxRetries
    )
  } catch (error) {
    // Rollback optimistic update
    updateStoreAnnotation(documentId, annotationId, originalAnnotation)
    throw error // Re-throw for hook's error handler
  }
}, [documentId, annotations, chunks, updateStoreAnnotation])

// Retry helper
async function saveAnnotationResizeWithRetry(
  annotationId: string,
  range: { startOffset: number; endOffset: number; chunkIds: string[] },
  maxRetries: number
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await updateAnnotation(annotationId, { range })

      if (result.success) {
        return
      }

      // Don't retry validation failures
      if (result.error?.includes('too short') ||
          result.error?.includes('too many chunks') ||
          result.error?.includes('Invalid offset')) {
        throw new Error(result.error)
      }

      // Network/server error - retry with exponential backoff
      if (attempt < maxRetries) {
        await new Promise(resolve =>
          setTimeout(resolve, 1000 * Math.pow(2, attempt))
        )
        continue
      }

      throw new Error(result.error || 'Failed to save annotation resize')
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
    }
  }
}

// Pass resize props to BlockRenderer
<BlockRenderer
  block={block}
  annotations={annotationsForBlocks}
  onAnnotationClick={handleAnnotationEdit}
  {...resizeProps} // NEW
/>
```

#### 1.4 Integrate with BlockRenderer (1 hour)

**File:** `src/components/reader/BlockRenderer.tsx`

**Changes:**
```typescript
interface BlockRendererProps {
  block: Block
  annotations: StoredAnnotation[]
  onAnnotationClick: (annotationId: string, element: HTMLElement) => void
  // NEW: Resize props
  isResizing?: boolean
  resizingAnnotationId?: string | null
  previewRange?: OffsetResult | null
  handleMouseDown?: (e: React.MouseEvent) => void
  handleMouseMove?: (e: React.MouseEvent) => void
  handleMouseUp?: (e: React.MouseEvent) => void
}

export const BlockRenderer = memo(({
  block,
  annotations,
  onAnnotationClick,
  isResizing = false,
  resizingAnnotationId = null,
  previewRange = null,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp
}: BlockRendererProps) => {
  // Track mousedown position for click vs drag detection
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)

  // Handle mousedown - check for resize first
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY }

    if (handleMouseDown) {
      handleMouseDown(e)
    }
  }, [handleMouseDown])

  // Handle click - only if not dragging
  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!mouseDownPos.current) return

    // Calculate distance moved
    const distance = Math.hypot(
      e.clientX - mouseDownPos.current.x,
      e.clientY - mouseDownPos.current.y
    )

    // If moved < 5px, treat as click
    if (distance < 5) {
      const target = e.target as HTMLElement
      const annotationSpan = target.closest('[data-annotation-id]')

      if (annotationSpan && !isResizing) {
        const annotationId = annotationSpan.getAttribute('data-annotation-id')
        if (annotationId) {
          onAnnotationClick(annotationId, annotationSpan as HTMLElement)
        }
      }
    }

    mouseDownPos.current = null
  }, [onAnnotationClick, isResizing])

  return (
    <div
      data-block-id={block.id}
      data-start-offset={block.start_offset}
      data-end-offset={block.end_offset}
      className="block"
      onMouseDown={onMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={onClick}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={customComponents}
      >
        {annotatedMarkdown}
      </ReactMarkdown>
    </div>
  )
})
```

#### 1.5 Add Server-Side Validation (30 minutes)

**File:** `src/app/actions/annotations.ts`

**Changes to updateAnnotation function:**
```typescript
export async function updateAnnotation(
  annotationId: string,
  updates: Partial<AnnotationComponent>
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // NEW: Validate range updates
    if (updates.range) {
      const { startOffset, endOffset, chunkIds } = updates.range

      // Validate minimum length
      if (endOffset - startOffset < 3) {
        return {
          success: false,
          error: 'Annotation too short (minimum 3 characters)'
        }
      }

      // Validate chunk limit
      if (chunkIds.length > 5) {
        return {
          success: false,
          error: 'Annotation spans too many chunks (maximum 5 chunks)'
        }
      }

      // Validate offsets are positive and ordered
      if (startOffset < 0 || endOffset < 0 || startOffset >= endOffset) {
        return {
          success: false,
          error: 'Invalid offset range'
        }
      }
    }

    // Rest of existing updateAnnotation logic...
    const supabase = createServerClient()
    const ecs = new ECS(supabase)
    const ops = new AnnotationOperations(ecs, user.id)

    const annotation = await ops.getById(annotationId)
    if (!annotation) {
      return { success: false, error: 'Annotation not found' }
    }

    await ops.update(annotationId, updates)

    // NOTE: No revalidatePath - client handles updates

    return { success: true, data: undefined }
  } catch (error) {
    console.error('[updateAnnotation] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

#### 1.6 Basic Manual Testing (30 minutes)

**Test Checklist:**
- [ ] Cursor changes to col-resize within 8px of edges
- [ ] Cursor returns to default outside edge zone
- [ ] Mousedown on edge initiates resize
- [ ] Mousemove updates annotation preview
- [ ] Mouseup saves new boundaries
- [ ] Toast confirmation on success
- [ ] Error toast on validation failure
- [ ] Escape cancels resize
- [ ] Resize works from start edge
- [ ] Resize works from end edge

---

### Phase 2: Testing & Edge Cases (4 hours)

#### 2.1 Unit Tests (2 hours)

**File:** `src/hooks/__tests__/useAnnotationResize.test.ts`

**Test Suite:**
```typescript
import { renderHook, act } from '@testing-library/react'
import { useAnnotationResize } from '../useAnnotationResize'

describe('useAnnotationResize', () => {
  const mockAnnotations: StoredAnnotation[] = [
    {
      id: 'ann-1',
      components: {
        position: { startOffset: 1000, endOffset: 1500, chunkIds: ['chunk-1'] }
      }
    }
  ]

  const mockChunks: Chunk[] = [
    { id: 'chunk-1', start_offset: 0, end_offset: 2000 },
    { id: 'chunk-2', start_offset: 2000, end_offset: 4000 },
    { id: 'chunk-3', start_offset: 4000, end_offset: 6000 },
    { id: 'chunk-4', start_offset: 6000, end_offset: 8000 },
    { id: 'chunk-5', start_offset: 8000, end_offset: 10000 },
    { id: 'chunk-6', start_offset: 10000, end_offset: 12000 }
  ]

  it('initiates resize when mousedown within 8px edge zone', () => {
    const onResizeComplete = jest.fn()
    const { result } = renderHook(() => useAnnotationResize({
      annotations: mockAnnotations,
      chunks: mockChunks,
      onResizeComplete
    }))

    // Mock detectResizeHandle to return edge
    // Simulate mousedown
    // Assert isResizing = true
  })

  it('does not initiate resize when mousedown outside edge zone', () => {
    // Test no resize when clicking annotation body
  })

  it('enforces 5-chunk limit during resize', () => {
    // Test that dragging beyond 5 chunks caps at 5th chunk boundary
  })

  it('prevents resize below 3 characters', () => {
    // Test minimum length validation
  })

  it('applies word boundary snapping', () => {
    // Test that offsets snap to word boundaries
  })

  it('calls onResizeComplete with correct offsets', async () => {
    // Test save callback receives updated offsets
  })

  it('cancels resize on Escape key', () => {
    // Test Escape cleanup
  })

  it('cancels current resize when starting new resize', () => {
    // Test concurrent resize prevention
  })

  it('cleans up on unmount', () => {
    // Test cleanup hook
  })
})
```

#### 2.2 Integration Tests (2 hours)

**File:** `tests/integration/annotation-resize-flow.test.ts`

**Test Suite:**
```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VirtualizedReader } from '@/components/reader/VirtualizedReader'

describe('Annotation Resize Flow', () => {
  it('completes full resize with auto-save', async () => {
    // Mock server action
    const mockUpdateAnnotation = jest.fn().mockResolvedValue({
      success: true
    })

    // Render reader with annotation
    render(<VirtualizedReader documentId="doc-1" />)

    // Wait for annotations to load
    await waitFor(() => {
      expect(screen.getByTestId('annotation-span')).toBeInTheDocument()
    })

    // Find annotation element
    const annotation = screen.getByTestId('annotation-span')

    // Simulate resize drag
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: annotation, coords: { x: 198 } }, // Edge
      { coords: { x: 250 } }, // Drag 52px
      { keys: '[/MouseLeft]' } // Release
    ])

    // Verify save called
    await waitFor(() => {
      expect(mockUpdateAnnotation).toHaveBeenCalledWith(
        'ann-1',
        expect.objectContaining({
          range: expect.objectContaining({
            startOffset: expect.any(Number),
            endOffset: expect.any(Number)
          })
        })
      )
    })

    // Verify success toast
    expect(screen.getByText('Annotation resized')).toBeInTheDocument()
  })

  it('shows error toast when chunk limit exceeded', async () => {
    // Test 5-chunk limit error handling
  })

  it('shows error toast when too short', async () => {
    // Test minimum length validation
  })

  it('rolls back on network failure', async () => {
    // Test optimistic update rollback
  })

  it('handles Escape cancellation', async () => {
    // Test Escape during resize
  })
})
```

---

### Phase 3: Visual Polish & Touch Support (3 hours)

#### 3.1 Selection API Preview (1 hour)

**File:** `src/hooks/useAnnotationResize.ts`

**Add to handleMouseMove:**
```typescript
const updateVisualPreview = useCallback((range: Range) => {
  const selection = window.getSelection()
  if (!selection) return

  // Clear existing selection
  selection.removeAllRanges()

  // Add new range for preview
  selection.addRange(range)

  // Dim original annotation
  const originalSpans = document.querySelectorAll(
    `[data-annotation-id="${dragState.annotationId}"]`
  )
  originalSpans.forEach(span => {
    span.classList.add('resizing-dim')
  })
}, [dragState])

// Call in RAF handler
rafId.current = requestAnimationFrame(() => {
  // ... offset calculation ...

  // Update visual preview
  if (range) {
    updateVisualPreview(range)
  }
})
```

**Add to cleanupResize:**
```typescript
// Remove dimming class
const dimmedSpans = document.querySelectorAll('.resizing-dim')
dimmedSpans.forEach(span => span.classList.remove('resizing-dim'))
```

#### 3.2 CSS Styling (30 minutes)

**File:** `src/app/globals.css`

**Add preview styles:**
```css
/* Prevent text selection during resize */
body.annotation-resizing {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* Blue ring preview during resize */
body.annotation-resizing ::selection {
  background-color: rgba(59, 130, 246, 0.2);
  outline: 2px solid rgb(59, 130, 246);
  border-radius: 2px;
}

/* Dim original annotation during resize */
.resizing-dim {
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

/* Chunk limit visual feedback */
body[data-chunk-limit-reached="true"] {
  cursor: not-allowed !important;
}

/* Smooth transitions on handles */
[data-annotation-start]::before,
[data-annotation-end]::after {
  transition: width 0.15s ease, opacity 0.15s ease;
}
```

#### 3.3 Touch Support (1 hour)

**File:** `src/hooks/useAnnotationResize.ts`

**Add touch handlers:**
```typescript
const longPressTimer = useRef<NodeJS.Timeout | null>(null)
const touchStartPos = useRef<{ x: number; y: number } | null>(null)

const handleTouchStart = useCallback((e: React.TouchEvent) => {
  const touch = e.touches[0]
  touchStartPos.current = { x: touch.clientX, y: touch.clientY }

  const target = e.target as HTMLElement
  const annotationSpan = target.closest('[data-annotation-id]')
  if (!annotationSpan) return

  // Check if near edge
  const handle = detectResizeHandle(
    { clientX: touch.clientX, clientY: touch.clientY } as MouseEvent,
    annotationSpan as HTMLElement
  )
  if (!handle) return

  // Prevent scroll during long-press
  e.preventDefault()

  // Start long-press timer (500ms)
  longPressTimer.current = setTimeout(() => {
    // Haptic feedback on iPad
    if ('vibrate' in navigator) {
      navigator.vibrate(50)
    }

    // Initiate resize (same as mouse)
    const annotation = annotations.find(a => a.id === handle.annotationId)
    if (!annotation?.components.position) return

    setDragState({
      annotationId: handle.annotationId,
      edge: handle.edge,
      originalStartOffset: annotation.components.position.startOffset,
      originalEndOffset: annotation.components.position.endOffset,
      hitChunkLimit: false
    })

    setIsResizing(true)
    document.body.classList.add('annotation-resizing')
  }, 500)
}, [annotations])

const handleTouchMove = useCallback((e: React.TouchEvent) => {
  if (!isResizing || !dragState) return

  // Prevent scroll during resize
  e.preventDefault()

  const touch = e.touches[0]

  // Same logic as handleMouseMove but with touch coordinates
  // ... (reuse mouse logic with touch.clientX, touch.clientY)
}, [isResizing, dragState])

const handleTouchEnd = useCallback(() => {
  // Cancel long-press if released early
  if (longPressTimer.current) {
    clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  if (isResizing) {
    // Same logic as handleMouseUp
    // ...
  }
}, [isResizing])

// Return touch handlers along with mouse handlers
return {
  isResizing,
  resizingAnnotationId,
  previewRange,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd
}
```

**Update BlockRenderer:**
```typescript
<div
  onMouseDown={onMouseDown}
  onMouseMove={handleMouseMove}
  onMouseUp={handleMouseUp}
  onTouchStart={handleTouchStart}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
>
```

#### 3.4 Performance Optimization (30 minutes)

**Implement all optimizations:**

1. **RAF throttling** (already done in Phase 1)
2. **Movement threshold:**
```typescript
const lastMousePos = useRef({ x: 0, y: 0 })

if (Math.abs(e.clientX - lastMousePos.current.x) < 5 &&
    Math.abs(e.clientY - lastMousePos.current.y) < 5) {
  return // Don't recalculate
}

lastMousePos.current = { x: e.clientX, y: e.clientY }
```

3. **Ref-based drag state:**
```typescript
const dragStateRef = useRef<DragState | null>(null)
// Use for internal tracking, only setState for UI updates
```

4. **Zustand update batching:**
```typescript
// Only update store on mouseup, not during drag
```

---

## File Structure

```
src/
├── hooks/
│   ├── useAnnotationResize.ts              # NEW - Core resize hook
│   └── __tests__/
│       └── useAnnotationResize.test.ts     # NEW - Unit tests
├── lib/reader/
│   └── resize-detection.ts                 # MODIFY - Fix MARK → SPAN bug
├── components/reader/
│   ├── VirtualizedReader.tsx               # MODIFY - Add resize hook
│   └── BlockRenderer.tsx                   # MODIFY - Add event handlers
├── app/
│   ├── actions/
│   │   └── annotations.ts                  # MODIFY - Add validation
│   └── globals.css                         # MODIFY - Add resize CSS
└── tests/integration/
    └── annotation-resize-flow.test.ts      # NEW - Integration tests
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
- ✅ Concurrent resize prevention

### Integration Tests (Stable)
- ✅ Full resize flow with save
- ✅ Error handling for validation failures
- ✅ Multi-chunk annotation resize
- ✅ Optimistic update + server sync
- ✅ Network error rollback

### Manual Testing (Required with User)
- [ ] Visual preview appearance
- [ ] Smooth cursor transitions
- [ ] Performance with large documents (500+ pages)
- [ ] Cross-browser compatibility (Chrome, Safari, Firefox)
- [ ] Touch support on iPad Chrome
- [ ] Edge cases (document boundaries, nested HTML)

---

## Risk Assessment

### High Risks
**None** - All major risks mitigated

### Medium Risks

1. **Selection API Browser Quirks** (Impact: Medium)
   - **Mitigation:** Cross-browser testing, CSS-only fallback
   - **Contingency:** If Selection API fails, use CSS overlay instead

2. **Touch Long-Press Conflicts** (Impact: Low)
   - **Mitigation:** 500ms threshold, preventDefault on touch
   - **Contingency:** Increase threshold to 750ms if needed

### Low Risks

3. **Performance with Large Documents** (Impact: Medium)
   - **Mitigation:** RAF throttling, offset caching
   - **Validation:** Test with 500+ page document

4. **Network Failures** (Impact: Low)
   - **Mitigation:** 2-retry pattern, rollback on failure
   - **Validation:** Mock network errors in tests

---

## Success Criteria

### Phase 1 Complete When:
- ✅ MARK → SPAN bug fixed and verified
- ✅ Cursor changes to col-resize within 8px
- ✅ Drag updates offsets correctly
- ✅ Auto-save on mouseup works
- ✅ Validation enforced (3 chars min, 5 chunks max)
- ✅ Escape cancels resize
- ✅ Global text selection prevented

### Phase 2 Complete When:
- ✅ All unit tests pass (>90% coverage)
- ✅ All integration tests pass
- ✅ Edge cases handled (concurrent, network failure)
- ✅ No console errors or warnings

### Phase 3 Complete When:
- ✅ Visual preview smooth (60fps)
- ✅ Touch support working on iPad
- ✅ Haptic feedback implemented
- ✅ CSS animations polished
- ✅ Performance validated

### Manual Testing Complete When:
- ✅ User confirms intuitive resize behavior
- ✅ Visual feedback clear and responsive
- ✅ No unexpected behavior in edge cases
- ✅ Cross-browser compatibility verified

---

## Implementation Schedule

### Week 1
- **Day 1-2:** Phase 1 (5.5 hours)
  - Fix bug, create hook, integrate components
  - Basic manual testing

- **Day 3-4:** Phase 2 (4 hours)
  - Write unit tests
  - Write integration tests
  - Fix any issues discovered

### Week 2
- **Day 1:** Phase 3 (3 hours)
  - Add visual preview
  - Implement touch support
  - Performance optimization

- **Day 2:** Manual testing with user
  - Walk through test scenarios together
  - Address any UX feedback
  - Cross-browser testing

**Total Calendar Time:** ~2 weeks (12.5 dev hours spread across testing/feedback cycles)

---

## Dependencies

### External Libraries
- ✅ react-virtuoso (already installed)
- ✅ zustand (already installed)
- ✅ All utilities exist (no new dependencies)

### Internal Systems
- ✅ ECS annotation system
- ✅ Supabase server actions
- ✅ Zustand annotation store
- ✅ Offset calculation utilities
- ✅ Chunk utilities

### Browser APIs
- ✅ document.caretRangeFromPoint()
- ✅ window.getSelection()
- ✅ requestAnimationFrame()
- ✅ navigator.vibrate() (optional - graceful degradation)

---

## Future Enhancements (Deferred)

### Phase 4: Undo/Redo (Future)
- Cmd+Z to undo resize
- Cmd+Shift+Z to redo
- Store resize history in Zustand

### Phase 5: Batch Resize (Future)
- Select multiple annotations
- Resize all at once
- Useful for fixing batch imports

### Phase 6: Auto-Scroll (Future)
- Scroll viewport when dragging near edges
- Smooth auto-scroll behavior
- Configurable scroll speed

### Phase 7: Keyboard-Only Resize (Future)
- Arrow keys for fine-tuning
- Enter to confirm
- Accessibility improvement

---

## Appendix

### Key Existing Infrastructure

**CSS Handles (globals.css:232-276):**
```css
[data-annotation-start]::before {
  position: absolute;
  left: -2px;
  width: 2px;
  background: currentColor;
  opacity: 0.3;
  height: 20px;
}

[data-annotation-start]:hover::before {
  width: 4px;
  opacity: 0.6;
  cursor: ew-resize;
}
```

**Resize Detection (resize-detection.ts):**
- detectResizeHandle() - 8px edge detection
- getHighlightFromEvent() - Find highlight from event
- updateResizeCursor() - Cursor style management

**Offset Calculation (offset-calculator.ts):**
- calculateOffsetsFromRange() - Range → offset conversion
- calculateMultiBlockOffsets() - Multi-block handling
- snapToWordBoundaries() - Word boundary snapping

**Server Action (annotations.ts:146-191):**
- updateAnnotation() - Supports range updates
- ECS component updates
- Returns ActionResult<void>

### Related Documentation
- `docs/ARCHITECTURE.md` - System architecture
- `docs/UI_PATTERNS.md` - No modals, persistent UI
- `docs/ZUSTAND_RULES.md` - State management patterns
- `docs/testing/TESTING_RULES.md` - Testing philosophy

---

**Document Version:** 1.0
**Last Updated:** 2025-10-15
**Status:** Ready for Implementation
