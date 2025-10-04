# Portal-Based QuickCapture + Optimistic Updates Implementation

**Status**: 🟡 In Progress
**Priority**: Critical (Fixes UX issues)
**Created**: 2025-10-04
**Estimated Time**: 2-3 hours remaining

---

## Problem Statement

Two critical UX issues affecting annotation workflow:

1. **Popover Closing Prematurely**: Clicks inside QuickCapturePanel trigger close due to Radix UI Popover's click-capture behavior
2. **Page Reload on Save**: `revalidatePath()` causes full page refresh and scroll jump, losing user's reading position

---

## Solution Architecture

### 1. Portal-Based Panel (No Popover)
- Use React `createPortal()` to render directly to `document.body`
- Implement custom click-outside detection with 100ms delay
- Full control over open/close behavior

### 2. Optimistic Updates Pattern
- Update UI immediately before server response
- Show highlight instantly with temp ID (`temp-${Date.now()}`)
- Close panel immediately for perceived speed
- Replace temp ID with real ID when server responds
- Rollback on error (remove optimistic annotation)

---

## Implementation Progress

### ✅ Phase 1: Portal-Based QuickCapture (COMPLETE)

**File**: `src/components/reader/QuickCapturePanel.tsx`

**Changes Made**:
- ✅ Replaced `Popover` component with `createPortal()`
- ✅ Added custom click-outside handler with `panelRef.contains()`
- ✅ Implemented 100ms delay to prevent immediate close on opening click
- ✅ Added `onAnnotationCreated?: (annotation: any) => void` callback prop
- ✅ Created optimistic annotation object with temp ID
- ✅ Call `onAnnotationCreated()` before server action
- ✅ Call `onClose()` immediately for instant feedback
- ✅ Replace temp ID with real ID on success
- ✅ Send `_deleted: true` flag on error for rollback
- ✅ Updated color options with dark mode variants
- ✅ Improved UI layout (420px width, better spacing)

**Code Pattern**:
```typescript
// Create optimistic annotation
const optimisticAnnotation = {
  id: `temp-${Date.now()}`,
  text: selection.text,
  chunk_ids: selection.range.chunkIds,
  // ... other fields
  created_at: new Date().toISOString(),
}

// Update UI immediately
if (onAnnotationCreated) {
  onAnnotationCreated(optimisticAnnotation)
}

// Close panel
onClose()

// Save in background
const result = await createAnnotation(...)

if (result.success) {
  // Replace temp with real ID
  onAnnotationCreated({ ...optimisticAnnotation, id: result.id })
} else {
  // Rollback
  onAnnotationCreated({ ...optimisticAnnotation, _deleted: true })
}
```

---

### 🔧 Phase 2: Remove revalidatePath (PENDING)

**File**: `src/app/actions/annotations.ts`

**Changes Needed**:
```diff
  })

- // Revalidate document page
- revalidatePath(`/read/${validated.documentId}`)

  return { success: true, id: entityId }
```

**Why**: `revalidatePath()` causes Next.js to re-fetch all server components, triggering a full page refresh and losing scroll position. With optimistic updates, we don't need this.

**Line to Remove**: Line 90-91

---

### 🔧 Phase 3: Optimistic State Management (PENDING)

**File**: `src/components/reader/VirtualizedReader.tsx`

**Changes Needed**:

1. **Add Optimistic State**:
```typescript
const [optimisticAnnotations, setOptimisticAnnotations] = useState<
  Map<string, any>
>(new Map())
```

2. **Merge Server + Optimistic Annotations**:
```typescript
const allAnnotations = useMemo(() => {
  const merged = [...annotations] // Server annotations

  // Add optimistic annotations
  optimisticAnnotations.forEach((annotation) => {
    // Skip deleted (failed) annotations
    if (annotation._deleted) return

    // Replace temp if real exists
    const existingIndex = merged.findIndex((a) => a.id === annotation.id)
    if (existingIndex >= 0) {
      merged[existingIndex] = annotation
    } else {
      merged.push(annotation)
    }
  })

  return merged
}, [annotations, optimisticAnnotations])
```

3. **Handle Annotation Updates**:
```typescript
const handleAnnotationCreated = useCallback((annotation: any) => {
  setOptimisticAnnotations((prev) => {
    const next = new Map(prev)

    // Handle deletion (error rollback)
    if (annotation._deleted) {
      next.delete(annotation.id)
      return next
    }

    // Add/update annotation
    next.set(annotation.id, annotation)

    // Clean up temp when real ID arrives
    if (!annotation.id.startsWith('temp-')) {
      Array.from(next.entries()).forEach(([id, ann]) => {
        if (
          id.startsWith('temp-') &&
          ann.start_offset === annotation.start_offset &&
          ann.end_offset === annotation.end_offset
        ) {
          next.delete(id) // Remove temp
        }
      })
    }

    return next
  })
}, [])
```

4. **Pass to QuickCapture**:
```typescript
<QuickCapturePanel
  selection={selection}
  documentId={documentId}
  chunks={chunks}
  onClose={handleCloseCapture}
  onAnnotationCreated={handleAnnotationCreated} // NEW
/>
```

5. **Use Merged Annotations**:
```typescript
// Pass allAnnotations to BlockRenderer or parseMarkdownToBlocks
const annotationsForBlocks = useMemo(() => {
  return allAnnotations // Instead of just 'annotations'
    .filter(ann => ann.components.annotation && ann.components.position)
    .map(ann => ({
      id: ann.id,
      startOffset: ann.components.annotation!.range.startOffset,
      endOffset: ann.components.annotation!.range.endOffset,
      color: ann.components.annotation!.color,
    }))
}, [allAnnotations])
```

---

### 🔧 Phase 4: Type Definitions (PENDING)

**Check if needed**: Verify `Annotation` type exists in `src/types/annotations.ts`

If missing, add:
```typescript
export interface Annotation {
  id: string
  text: string
  chunk_ids: string[]
  document_id: string
  start_offset: number
  end_offset: number
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
  note?: string
  tags?: string[]
  text_context?: {
    before: string
    content: string
    after: string
  }
  created_at: string
  updated_at?: string
}
```

---

### 🧪 Phase 5: Testing & Validation (PENDING)

#### Panel Behavior Tests
- [ ] Click color button → Saves without premature close
- [ ] Click in textarea → Stays focused, doesn't close
- [ ] Click in tag input → Stays focused, doesn't close
- [ ] Type note + click color → Saves with note intact
- [ ] Click outside panel → Closes correctly
- [ ] Press Escape → Closes correctly
- [ ] Rapid color clicks → Only saves once (saving state prevents)

#### Optimistic Update Tests
- [ ] Create annotation → Highlight appears instantly (< 100ms)
- [ ] Page doesn't reload (scroll position preserved)
- [ ] Panel closes immediately after color click
- [ ] Toast notification appears
- [ ] After server response, temp ID replaced with real ID
- [ ] Temp annotation removed from Map
- [ ] No duplicate highlights

#### Error Handling Tests
- [ ] Network failure → Highlight appears then disappears
- [ ] Error toast with retry button shown
- [ ] Retry button works correctly
- [ ] Validation error → Highlight never appears
- [ ] Error toast shows correct message

#### Edge Cases
- [ ] Create annotation, immediately create another → Both work
- [ ] Rapid selection changes → Panel updates correctly
- [ ] Multi-chunk annotation → "Spans X chunks" indicator shows
- [ ] Refresh page → Optimistic annotations cleared, server loads
- [ ] Multiple temp annotations → All cleaned up on success

---

## Technical Decisions

### Why Portal over Popover?
- **Popover**: Built for tooltips, has automatic click-outside capture
- **Portal**: Direct DOM rendering to `document.body`, full event control
- Portal allows precise click-outside logic with delay

### Why Map for Optimistic State?
- **Map**: O(1) lookup, update, delete by ID
- **Array**: O(n) for finding/replacing
- Map handles temp→real ID transitions cleanly
- Easy to check `.has(id)` and `.delete(id)`

### Why 100ms Delay?
- Prevents the click that opens the panel from immediately triggering close
- User has time to see panel appear before click-outside detection activates
- Standard pattern in high-quality UIs (Notion, Linear, etc.)

### Why Optimistic Updates?
- **Instant feedback**: Highlight appears in < 100ms
- **No scroll jump**: No page reload from `revalidatePath()`
- **Graceful errors**: Can rollback on failure
- **Better UX**: Matches user mental model (click → see result)

---

## Files Modified

### Completed
1. ✅ `src/components/reader/QuickCapturePanel.tsx` - Rewritten with Portal

### Pending
2. 🔧 `src/app/actions/annotations.ts` - Remove `revalidatePath()` (1 line)
3. 🔧 `src/components/reader/VirtualizedReader.tsx` - Add optimistic state (~60 lines)
4. 🔧 `src/types/annotations.ts` - Verify/add `Annotation` type (if needed)

---

## Acceptance Criteria

### Must Have
- ✅ Panel doesn't close when clicking inside
- [ ] Highlights appear instantly (< 100ms perceived latency)
- [ ] No page reload or scroll jump
- [ ] Panel closes immediately after save action
- [ ] Success toast appears
- [ ] Temp ID replaced with real ID
- [ ] Error handling with rollback

### Nice to Have
- [ ] Loading state for individual color buttons
- [ ] Animations for highlight appearance
- [ ] Keyboard shortcuts documented in UI
- [ ] Retry button on error toasts

---

## Next Steps

1. **Remove revalidatePath** (~2 minutes)
   - Delete line 90-91 in `src/app/actions/annotations.ts`
   - Test that server action still returns ID

2. **Implement optimistic state** (~30 minutes)
   - Add state management to VirtualizedReader
   - Implement merge logic
   - Add callback handler
   - Update annotation rendering

3. **Type checking** (~10 minutes)
   - Run `npx tsc --noEmit`
   - Fix any type errors
   - Verify callback signatures

4. **Manual testing** (~30 minutes)
   - Test all panel behaviors
   - Test optimistic updates
   - Test error scenarios
   - Test edge cases

5. **Polish** (~20 minutes)
   - Fix any UI issues discovered
   - Improve error messages
   - Add loading states if needed

---

## Architecture Benefits

### Optimistic Update Flow
```
User clicks color
  ↓
Create temp annotation (id: "temp-123")
  ↓
Call onAnnotationCreated(optimistic)
  ↓
Add to optimisticAnnotations Map
  ↓
Highlight renders immediately
  ↓
Panel closes
  ↓
Server action executes (background)
  ↓
Success: Replace temp ID with real ID
  ↓
Clean up temp from Map
  ↓
Toast: "Highlight saved"
```

### Error Flow
```
User clicks color
  ↓
Create temp annotation
  ↓
onAnnotationCreated(optimistic)
  ↓
Highlight appears
  ↓
Panel closes
  ↓
Server action fails
  ↓
onAnnotationCreated({ ...temp, _deleted: true })
  ↓
Remove from Map
  ↓
Highlight disappears
  ↓
Toast: "Failed to save" + Retry button
```

---

## Known Issues (Post-Implementation)

*None yet - to be filled during testing*

---

## Future Enhancements

- [ ] Offline queue with localStorage backup
- [ ] Batch save multiple annotations
- [ ] Undo/redo for annotation actions
- [ ] Optimistic updates for edit/delete operations
- [ ] Animation for highlight appearance/removal
- [ ] Keyboard-only workflow improvements

---

## References

- [React Portal Docs](https://react.dev/reference/react-dom/createPortal)
- [Optimistic UI Pattern](https://www.patterns.dev/posts/optimistic-ui)
- [Next.js revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
