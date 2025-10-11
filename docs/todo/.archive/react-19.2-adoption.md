# React 19.2 Adoption Guide for Rhizome V2

**Date**: October 2, 2025
**React Version**: 19.2 (released October 1, 2025)
**Current Stack**: Next.js 15 + React 19
**Status**: Evaluation & Planning

## Executive Summary

React 19.2 introduces features that align well with Rhizome's architecture, particularly the `<Activity />` component for pre-rendering and `useEffectEvent` for cleaner effect management. No breaking changes identified. Adoption is **optional but recommended** for performance and code quality improvements.

**Key Opportunities**:
- Pre-render connection panels and study interfaces in background
- Simplify event listener effects in reader components
- Automatic SSR improvements via Next.js 15
- Better performance debugging tools

---

## New Features & Rhizome Use Cases

### 1. `<Activity />` Component ⭐ HIGH PRIORITY

**What It Does**:
Allows breaking apps into "activities" with two modes:
- `visible`: Rendered and visible to user
- `hidden`: Pre-rendered in background, ready to show instantly

Resources load in background without blocking main UI.

**Why It Matters for Rhizome**:
Your architecture uses persistent UI (docks, panels, overlays) instead of modals. Activity component makes these panels feel instant by pre-rendering them.

#### Use Case 1: Connection Panel Pre-rendering

**Current Experience**:
```
User clicks "Show Connections"
  → Panel appears
  → Loading spinner shows
  → Fetch connections from DB
  → Render connection cards
  → User waits 500-1000ms
```

**With Activity Component**:
```tsx
// src/components/reader/ConnectionPanel.tsx
<Activity mode={isPanelVisible ? "visible" : "hidden"}>
  <ConnectionPanelContent documentId={documentId} />
</Activity>
```

**New Experience**:
```
While user is reading:
  → Activity pre-renders panel in background
  → Fetches connections
  → Renders cards (hidden)

User clicks "Show Connections"
  → Panel appears instantly (already rendered)
  → No loading state needed
```

**Implementation Location**: `src/components/reader/ConnectionPanel.tsx`

#### Use Case 2: Study Mode Pre-loading

**Scenario**: User is reading a document, might switch to study mode.

```tsx
// src/app/read/[id]/page.tsx
export default function DocumentPage({ params }) {
  const [mode, setMode] = useState<'read' | 'study'>('read')

  return (
    <>
      <Activity mode={mode === 'read' ? 'visible' : 'hidden'}>
        <ReaderView documentId={params.id} />
      </Activity>

      <Activity mode={mode === 'study' ? 'visible' : 'hidden'}>
        <StudyMode documentId={params.id} />
      </Activity>
    </>
  )
}
```

**Benefit**: Study mode pre-loads flashcards while user is reading. Mode switch is instant.

#### Use Case 3: Related Documents Sidebar

**Scenario**: User might want to see related documents while reading.

```tsx
// src/components/reader/RelatedDocumentsSidebar.tsx
<Activity mode={sidebarOpen ? "visible" : "hidden"}>
  <RelatedDocuments
    documentId={currentDoc}
    connections={crossDocConnections}
  />
</Activity>
```

**Benefit**: Sidebar fetches and renders related docs in background. Opens instantly when user needs it.

#### Use Case 4: Annotation Context Panel

**Scenario**: User hovers over an annotation to see full context and connections.

```tsx
// src/components/reader/AnnotationPopover.tsx
<Activity mode={hoveredAnnotationId === annotation.id ? "visible" : "hidden"}>
  <AnnotationContext
    annotationId={annotation.id}
    relatedChunks={annotation.connections}
  />
</Activity>
```

**Benefit**: Rich context pre-renders on hover intent, appears instantly on click.

---

### 2. `useEffectEvent` Hook ⭐ MEDIUM PRIORITY

**What It Does**:
Extracts event-like logic from effects. Events always see latest props/state without re-running effect.

**Why It Matters for Rhizome**:
Your reader has many event listeners (scroll, selection, resize) that need fresh callbacks without re-subscribing.

#### Use Case 1: Scroll Position Tracking

**Current Pattern** (likely):
```tsx
// src/components/reader/ReaderView.tsx
const handleScroll = useCallback((e: Event) => {
  updateScrollPosition(e.target.scrollTop)
  syncAnnotationPositions()
  checkVisibleChunks()
}, [updateScrollPosition, syncAnnotationPositions, checkVisibleChunks])

useEffect(() => {
  const container = scrollRef.current
  container?.addEventListener('scroll', handleScroll)
  return () => container?.removeEventListener('scroll', handleScroll)
}, [handleScroll]) // Re-subscribes when handleScroll changes
```

**With `useEffectEvent`**:
```tsx
// src/components/reader/ReaderView.tsx
const handleScroll = useEffectEvent((e: Event) => {
  updateScrollPosition(e.target.scrollTop)
  syncAnnotationPositions()
  checkVisibleChunks()
  // Always uses latest functions, no dependencies
})

useEffect(() => {
  const container = scrollRef.current
  container?.addEventListener('scroll', handleScroll)
  return () => container?.removeEventListener('scroll', handleScroll)
}, []) // Never re-subscribes
```

**Benefits**:
- No unnecessary event listener churn
- Cleaner code (no exhaustive dependency lists)
- Better performance (fewer re-subscriptions)

#### Use Case 2: Text Selection Handling

**Current Pattern**:
```tsx
// src/components/reader/SelectionToolbar.tsx
const handleSelection = useCallback(() => {
  const selection = window.getSelection()
  const range = selection?.getRangeAt(0)

  if (isValidSelection(range, documentId)) {
    showAnnotationToolbar(range)
  }
}, [documentId, showAnnotationToolbar, isValidSelection])

useEffect(() => {
  document.addEventListener('selectionchange', handleSelection)
  return () => document.removeEventListener('selectionchange', handleSelection)
}, [handleSelection])
```

**With `useEffectEvent`**:
```tsx
// src/components/reader/SelectionToolbar.tsx
const handleSelection = useEffectEvent(() => {
  const selection = window.getSelection()
  const range = selection?.getRangeAt(0)

  if (isValidSelection(range, documentId)) {
    showAnnotationToolbar(range)
  }
  // Always sees latest documentId, functions
})

useEffect(() => {
  document.addEventListener('selectionchange', handleSelection)
  return () => document.removeEventListener('selectionchange', handleSelection)
}, []) // Stable
```

#### Use Case 3: Annotation Position Updates

**Scenario**: Annotations need to re-position when window resizes, but position calculation uses current scroll state.

```tsx
// src/components/reader/AnnotationLayer.tsx
const updateAnnotationPositions = useEffectEvent(() => {
  const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
  const viewportHeight = window.innerHeight

  annotations.forEach(ann => {
    const newPosition = calculatePosition(ann, scrollTop, viewportHeight)
    updatePosition(ann.id, newPosition)
  })
})

useEffect(() => {
  window.addEventListener('resize', updateAnnotationPositions)
  return () => window.removeEventListener('resize', updateAnnotationPositions)
}, []) // No re-subscription needed
```

---

### 3. SSR Improvements (Automatic via Next.js 15)

**What's New**:
- Partial Pre-rendering
- Web Streams support for Node.js
- Batching Suspense boundaries during SSR
- New `resume` and `prerender` APIs

**Why It Matters for Rhizome**:
Your document reader pages are server-rendered. These improvements happen automatically via Next.js 15.

#### Use Case: Document Reader Page

**Before** (React 19.0):
```
Server renders entire page
  → Waits for all data fetching
  → Sends complete HTML
  → Client hydrates
```

**After** (React 19.2 + Next.js 15):
```
Server pre-renders static shell instantly
  → Streams document content as it loads
  → Client receives shell immediately
  → Content streams in progressively
```

**Benefit**: Faster Time to First Byte (TTFB), better perceived performance for large documents.

#### Potential Optimization: Streaming Large Markdown

```tsx
// src/app/read/[id]/page.tsx
import { Suspense } from 'react'

export default function DocumentPage({ params }) {
  return (
    <div className="reader-layout">
      {/* Pre-rendered shell */}
      <DocumentHeader documentId={params.id} />

      {/* Streams in as markdown loads from storage */}
      <Suspense fallback={<MarkdownSkeleton />}>
        <MarkdownContent documentId={params.id} />
      </Suspense>

      {/* Streams in as connections compute */}
      <Suspense fallback={<ConnectionsSkeleton />}>
        <ConnectionPanel documentId={params.id} />
      </Suspense>
    </div>
  )
}
```

**Benefit**: User sees document shell instantly, content streams in. No full-page loading spinner.

---

### 4. Performance Tracks in Chrome DevTools

**What's New**:
Custom performance tracking for React apps:
- **Scheduler track**: Shows how React prioritizes work
- **Components track**: Shows rendering insights

**Why It Matters for Rhizome**:
Debug why document processing or rendering feels slow.

#### Use Case: Debug Slow Markdown Rendering

**Scenario**: 500-page book's markdown takes 3 seconds to render.

**Steps**:
1. Open Chrome DevTools → Performance tab
2. Record while loading document
3. View new "Scheduler" track
4. See React's prioritization decisions

**What You'll Learn**:
- Is React blocking on component rendering?
- Are updates being batched correctly?
- Is virtualization working (Virtuoso library)?
- Which components are slow?

**Implementation**: No code changes, just a debugging tool.

---

## Migration Strategy

### Phase 1: Low-Risk Wins (Week 1)
**Goal**: Adopt features with no refactoring needed

1. **Upgrade `eslint-plugin-react-hooks` to v6.1.0**
   ```bash
   npm install -D eslint-plugin-react-hooks@^6.1.0
   ```

2. **Enable DevTools Performance Tracks**
   - Already available, just use during debugging

3. **Test SSR Improvements**
   - Automatic via Next.js 15, observe performance

### Phase 2: Effect Refactoring (Week 2-3)
**Goal**: Adopt `useEffectEvent` in reader components

**Priority Order**:
1. `src/components/reader/ReaderView.tsx` - Scroll handling
2. `src/components/reader/SelectionToolbar.tsx` - Text selection
3. `src/components/reader/AnnotationLayer.tsx` - Position updates
4. `src/components/reader/VirtualizedContent.tsx` - Viewport tracking

**Pattern**:
- Find effects with event listeners
- Replace `useCallback` + exhaustive deps with `useEffectEvent`
- Test scroll, selection, annotation behaviors

### Phase 3: Activity Component (Week 4-5)
**Goal**: Pre-render panels and modes

**Priority Order**:
1. **Connection Panel** (highest impact)
   - Pre-render while user reads
   - Test with 50+ connections

2. **Study Mode** (medium impact)
   - Pre-load flashcards
   - Test mode switching performance

3. **Related Documents Sidebar** (lower impact)
   - Nice-to-have optimization

**Success Metrics**:
- Connection panel opens in <100ms (vs current ~500-1000ms)
- Study mode switch feels instant
- No regression in initial page load time

---

## Testing Requirements

### Activity Component Testing

**Test 1: Pre-rendering Works**
```tsx
// tests/components/ConnectionPanel.test.tsx
test('pre-renders connections in hidden mode', async () => {
  render(
    <Activity mode="hidden">
      <ConnectionPanel documentId="test-doc" />
    </Activity>
  )

  await waitFor(() => {
    // Should fetch connections even in hidden mode
    expect(fetchConnections).toHaveBeenCalled()
  })
})
```

**Test 2: Instant Visibility Switch**
```tsx
test('switches to visible instantly', async () => {
  const { rerender } = render(
    <Activity mode="hidden">
      <ConnectionPanel documentId="test-doc" />
    </Activity>
  )

  await waitFor(() => expect(fetchConnections).toHaveBeenCalled())

  const startTime = performance.now()

  rerender(
    <Activity mode="visible">
      <ConnectionPanel documentId="test-doc" />
    </Activity>
  )

  const renderTime = performance.now() - startTime
  expect(renderTime).toBeLessThan(50) // Should be near-instant
})
```

### useEffectEvent Testing

**Test 1: Effect Doesn't Re-run**
```tsx
// tests/hooks/useScrollTracking.test.tsx
test('does not re-subscribe on prop changes', () => {
  const addEventListener = jest.spyOn(window, 'addEventListener')
  const removeEventListener = jest.spyOn(window, 'removeEventListener')

  const { rerender } = renderHook(
    ({ documentId }) => useScrollTracking(documentId),
    { initialProps: { documentId: 'doc-1' } }
  )

  expect(addEventListener).toHaveBeenCalledTimes(1)

  rerender({ documentId: 'doc-2' }) // Prop changes

  expect(removeEventListener).not.toHaveBeenCalled()
  expect(addEventListener).toHaveBeenCalledTimes(1) // Still just 1
})
```

**Test 2: Event Sees Latest Props**
```tsx
test('event callback sees latest documentId', () => {
  let capturedDocId: string | null = null

  const { rerender } = renderHook(
    ({ documentId }) => {
      const handleScroll = useEffectEvent(() => {
        capturedDocId = documentId
      })

      useEffect(() => {
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
      }, [])
    },
    { initialProps: { documentId: 'doc-1' } }
  )

  window.dispatchEvent(new Event('scroll'))
  expect(capturedDocId).toBe('doc-1')

  rerender({ documentId: 'doc-2' })
  window.dispatchEvent(new Event('scroll'))
  expect(capturedDocId).toBe('doc-2') // Sees latest
})
```

---

## Performance Benchmarks

### Connection Panel Pre-rendering

**Measurement Points**:
```tsx
// Before Activity component
const start = performance.now()
setPanelVisible(true)
// Wait for render + data fetch
const end = performance.now()
console.log('Time to interactive:', end - start)
```

**Target Metrics**:
- **Without Activity**: 500-1000ms (fetch + render)
- **With Activity**: <100ms (already pre-rendered)

### Effect Re-subscription Count

**Measurement**:
```tsx
// Add console.log in useEffect
useEffect(() => {
  console.count('scroll listener subscribed')
  window.addEventListener('scroll', handleScroll)
  return () => window.removeEventListener('scroll', handleScroll)
}, [handleScroll])
```

**Target Metrics**:
- **Without useEffectEvent**: Subscribed 5-10 times per session (on every dependency change)
- **With useEffectEvent**: Subscribed once per mount

---

## Risks & Mitigations

### Risk 1: Activity Component Memory Usage
**Concern**: Pre-rendering panels increases memory usage.

**Mitigation**:
- Only pre-render 1-2 most likely panels (connection + study)
- Don't pre-render heavy components (full document list)
- Monitor memory in Chrome DevTools

**Acceptable Threshold**: <50MB additional memory for pre-rendered panels

### Risk 2: useEffectEvent Adoption Bugs
**Concern**: Incorrect migration causes stale closures or missed updates.

**Mitigation**:
- Start with simple effects (scroll, resize)
- Add comprehensive tests for latest prop access
- Incremental rollout (one component at a time)

**Rollback Strategy**: Keep old `useCallback` pattern in git history, easy to revert

### Risk 3: SSR Streaming Issues
**Concern**: Streaming might break annotation position calculations.

**Mitigation**:
- Annotations are client-side only (after hydration)
- SSR streams markdown content, not annotations
- Test with large documents (500+ pages)

**Monitoring**: Check for hydration mismatches in browser console

---

## Documentation Updates Needed

After adoption, update these docs:

1. **`docs/lib/REACT_GUIDELINES.md`**
   - Add `useEffectEvent` pattern
   - Add `<Activity />` usage guidelines

2. **`docs/UI_PATTERNS.md`**
   - Update "Persistent UI" section with Activity component
   - Show pre-rendering pattern for panels

3. **`docs/CODE_EXAMPLES.md`**
   - Add Activity component examples
   - Add useEffectEvent examples for reader

4. **`README.md`** (if needed)
   - Update React version to 19.2
   - Note performance optimizations

---

## Open Questions

1. **Activity Component Behavior**: How does it handle data fetching in hidden mode? Does React Query cache properly?

2. **useEffectEvent TypeScript Support**: What's the type signature? Need to check React 19.2 type definitions.

3. **Next.js 15 Integration**: Does Next.js 15 automatically enable all SSR improvements, or do we need config changes?

4. **DevTools Performance Tracks**: Are they available in production builds or dev only?

5. **Activity Mode Transitions**: What happens if we rapidly toggle between visible/hidden? Any performance concerns?

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-10-02 | Evaluate React 19.2 adoption | New features align with Rhizome architecture |
| TBD | Approve Activity component adoption | After prototype validation |
| TBD | Approve useEffectEvent migration | After reader component testing |
| TBD | Full rollout decision | After Phase 1-3 testing complete |

---

## Resources

- **React 19.2 Blog Post**: https://react.dev/blog/2025/10/01/react-19-2
- **Activity Component Docs**: https://react.dev/reference/react/Activity (TBD)
- **useEffectEvent Docs**: https://react.dev/reference/react/useEffectEvent (TBD)
- **Next.js 15 SSR Guide**: https://nextjs.org/docs/app/building-your-application/rendering/server-components

---

## Next Steps

1. ✅ **Document created** (this file)
2. ⏳ **Prototype Activity component** with ConnectionPanel
3. ⏳ **Test useEffectEvent** in ReaderView scroll handling
4. ⏳ **Measure performance improvements** vs baselines
5. ⏳ **Decision meeting** on full adoption

**Owner**: TBD
**Timeline**: 4-5 weeks for full adoption (optional)
**Priority**: Medium (optimization, not critical)
