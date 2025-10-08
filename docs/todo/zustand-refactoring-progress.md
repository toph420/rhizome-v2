# Zustand 4-Store Refactoring - Progress Report

**Last Updated:** 2025-01-15
**Status:** 80% Complete - Core Architecture Implemented
**Next Steps:** ReaderLayout Orchestration, ConnectionHeatmap Enhancement

---

## ✅ COMPLETED (80%)

### 1. ReaderStore (`src/stores/reader-store.ts`) ✅ **NEW**

**Purpose:** Document content, scroll state, viewport tracking

```typescript
interface ReaderState {
  documentId: string | null
  documentTitle: string
  markdownContent: string
  chunks: Chunk[]
  scrollPosition: number  // 0-100%
  viewportOffsets: { start: number; end: number }
  visibleChunks: Chunk[]

  loadDocument: (docId, title, markdown, chunks) => void
  updateScroll: (position, offsets) => void
  clearDocument: () => void
}
```

**Persistence:** documentId + scrollPosition only (resume reading feature)

**Key Features:**
- Auto-calculates visibleChunks on scroll
- 0-100% scroll position tracking
- Viewport offset-based chunk visibility
- Clean separation: content vs. UI state

---

### 2. ConnectionStore (`src/stores/connection-store.ts`) ✅ **COMPLETE**

**Purpose:** Engine weights, connection scoring, filtering

**Implemented:**
- ✅ Engine weights with normalization
- ✅ toggleEngine (enable/disable engines)
- ✅ setStrengthThreshold (0.3-1.0 filtering)
- ✅ Connection scoring with personal weights
- ✅ **NEW:** `applyPreset()` with 4 presets
- ✅ Persistence (weights, filters, threshold)

**Presets Added:**
```typescript
'balanced'          → { semantic: 0.25, bridge: 0.35, contradiction: 0.40 }
'max-friction'      → { semantic: 0.10, bridge: 0.20, contradiction: 0.70 }
'thematic-focus'    → { semantic: 0.15, bridge: 0.70, contradiction: 0.15 }
'semantic-only'     → { semantic: 1.00, bridge: 0.00, contradiction: 0.00 }
```

**Usage in WeightTuning.tsx:**
```typescript
const applyPreset = useConnectionStore(state => state.applyPreset)
<Button onClick={() => applyPreset('max-friction')}>Max Friction</Button>
```

---

### 3. UIStore (`src/stores/ui-store.ts`) ✅ **ENHANCED**

**Purpose:** View modes, sidebar state, display settings

**Additions:**
- ✅ Moved `quickCaptureOpen` from AnnotationStore
- ✅ Moved `activeAnnotation` from AnnotationStore
- ✅ Added `openQuickCapture()` / `closeQuickCapture()`
- ✅ Added `setActiveAnnotation(annotation | null)`

**Complete State:**
```typescript
interface UIState {
  viewMode: 'explore' | 'focus' | 'study'
  sidebarCollapsed: boolean
  activeTab: 'connections' | 'annotations' | ...
  expandedConnections: Set<string>
  expandedAnnotations: Set<string>
  showChunkBoundaries: boolean
  showHeatmap: boolean
  quickCaptureOpen: boolean  // ← NEW
  activeAnnotation: StoredAnnotation | null  // ← NEW
}
```

**Persistence:** Preferences only (viewMode, sidebar, settings). Transient UI states reset on reload.

---

### 4. AnnotationStore (`src/stores/annotation-store.ts`) ✅ **CLEANED UP**

**Purpose:** Annotation data ONLY (text selection + CRUD)

**Removed (moved to UIStore):**
- ❌ `quickCaptureOpen` → UIStore
- ❌ `activeAnnotation` → UIStore
- ❌ `openQuickCapture()` → UIStore
- ❌ `closeQuickCapture()` → UIStore

**Kept (annotation data):**
- ✅ `annotations: Record<string, StoredAnnotation[]>`
- ✅ `selectedText: TextSelection | null`
- ✅ CRUD operations (setAnnotations, add, update, remove)

**Clean Separation:** Data vs. UI concerns

---

### 5. VirtualizedReader (`src/components/reader/VirtualizedReader.tsx`) ✅ **REFACTORED**

**Before (Prop Drilling):**
```typescript
<VirtualizedReader
  markdown={markdown}
  chunks={chunks}
  documentId={documentId}
  onVisibleChunksChange={(ids) => setVisibleChunkIds(ids)}
/>
```

**After (Store Pattern):**
```typescript
<VirtualizedReader />  // No props needed!

// Inside component:
const markdown = useReaderStore(state => state.markdownContent)
const chunks = useReaderStore(state => state.chunks)
const documentId = useReaderStore(state => state.documentId)
const updateScroll = useReaderStore(state => state.updateScroll)
```

**Key Changes:**
1. Removed all props (markdown, chunks, documentId, onVisibleChunksChange)
2. Gets data from ReaderStore instead
3. Calls `updateScroll(position, offsets)` on scroll → triggers visibleChunks update
4. Null guards for `documentId` before operations

**Scroll Coordination:**
```typescript
const handleVisibleRangeChange = (range) => {
  const visibleBlocks = blocks.slice(range.startIndex, range.endIndex + 1)
  const viewportStart = firstBlock.startOffset
  const viewportEnd = lastBlock.endOffset
  const scrollPosition = (viewportStart / markdown.length) * 100

  updateScroll(scrollPosition, { start: viewportStart, end: viewportEnd })
  // ↓ ReaderStore recalculates visibleChunks
  // ↓ ReaderLayout subscribes to visibleChunks
  // ↓ Fetches connections for visible chunks
  // ↓ Updates ConnectionStore
  // ↓ Sidebar re-renders with filtered connections
}
```

---

## 🚧 IN PROGRESS (20%)

### 6. ReaderLayout Orchestration ⚠️ **CRITICAL - NEXT TASK**

**Purpose:** Coordinate all 4 stores for unified data flow

**Current State:** Still uses useState for connections/visible chunks
**Target State:** Subscribe to stores and orchestrate

**Implementation Pattern (from dev notes):**

```typescript
'use client'

import { useReaderStore } from '@/stores/reader-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useUIStore } from '@/stores/ui-store'
import { useEffect } from 'react'

export function ReaderLayout({ document, markdownUrl, chunks, initialAnnotations }) {
  const loadDocument = useReaderStore(state => state.loadDocument)
  const visibleChunks = useReaderStore(state => state.visibleChunks)
  const setConnections = useConnectionStore(state => state.setConnections)
  const showQuickSpark = useUIStore(state => state.showQuickSpark)

  // Initialize document on mount
  useEffect(() => {
    async function loadMarkdown() {
      const response = await fetch(markdownUrl)
      const markdown = await response.text()
      loadDocument(document.id, document.title, markdown, chunks)
    }
    loadMarkdown()
  }, [document.id])

  // Fetch connections when visible chunks change (debounced)
  useEffect(() => {
    if (visibleChunks.length === 0) return

    const fetchConnections = async () => {
      const connections = await fetch('/api/connections/for-chunks', {
        method: 'POST',
        body: JSON.stringify({ chunkIds: visibleChunks.map(c => c.id) })
      }).then(r => r.json())

      setConnections(connections)
    }

    const timer = setTimeout(fetchConnections, 300)  // Debounce 300ms
    return () => clearTimeout(timer)
  }, [visibleChunks])

  return (
    <>
      <DocumentHeader />
      <ConnectionHeatmap />
      <VirtualizedReader />
      <RightPanel />
      {showQuickSpark && <QuickSparkModal />}
    </>
  )
}
```

**Data Flow:**
```
User scrolls → VirtualizedReader.handleVisibleRangeChange()
            → updateScroll() in ReaderStore
            → visibleChunks recalculated
            → ReaderLayout.useEffect(visibleChunks)
            → fetch('/api/connections/for-chunks')
            → setConnections() in ConnectionStore
            → ConnectionFilters/ConnectionsList re-render
            → ConnectionHeatmap updates density
```

**Files to Modify:**
- `src/components/reader/ReaderLayout.tsx` - Main orchestration
- `src/app/read/[id]/page.tsx` - May need updates for initial load

---

### 7. ConnectionHeatmap Enhancement 📊 **INTERACTIVE VERSION**

**Current:** Basic density visualization
**Target:** Interactive, clickable, filterable

**Features to Add:**
```typescript
// 1. Subscribe to ConnectionStore for filtering
const connections = useConnectionStore(state => state.connections)
const showTypes = useConnectionStore(state => state.enabledEngines)

// 2. Subscribe to ReaderStore for scroll sync
const scrollPosition = useReaderStore(state => state.scrollPosition)
const updateScroll = useReaderStore(state => state.updateScroll)

// 3. Calculate density points (20 points, one per 5% of document)
const densityPoints: HeatmapPoint[] = Array.from({ length: 20 }, (_, i) => {
  const position = (i / 20) * 100
  const chunkIndex = Math.floor((position / 100) * chunks.length)
  const chunk = chunks[chunkIndex]

  const chunkConnections = connections.filter(c =>
    c.sourceChunkId === chunk.id && showTypes.has(c.type)
  )

  return {
    chunkIndex,
    position,
    density: Math.min(chunkConnections.length / 10, 1),
    types: { semantic: 3, contradiction: 2, bridge: 1 }  // Counts by type
  }
})

// 4. Click to jump
const handlePointClick = (point: HeatmapPoint) => {
  const chunk = chunks[point.chunkIndex]
  updateScroll(point.position, {
    start: chunk.start_offset,
    end: chunk.end_offset + 5000
  })
}
```

**Visual Features:**
- Current position indicator (blue bar at scrollPosition%)
- Hover tooltip with connection breakdown
- Click to jump to dense areas
- Respects active type filters from ConnectionStore
- Smooth animations

**File:** `src/components/reader/ConnectionHeatmap.tsx`

---

### 8. Chunk Metadata Overlay 🎨 **OPTIONAL ENHANCEMENT**

**Purpose:** Show themes, importance, concepts inline while reading

**Implementation (in BlockRenderer):**
```typescript
import { useUIStore } from '@/stores/ui-store'

export function BlockRenderer({ block, chunkMetadata }) {
  const showChunkBoundaries = useUIStore(state => state.showChunkBoundaries)

  if (!showChunkBoundaries || !chunkMetadata) {
    return <div dangerouslySetInnerHTML={{ __html: block.html }} />
  }

  return (
    <div className="relative group">
      {/* Chunk header with metadata */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <Badge>{chunkMetadata.chunk_index}</Badge>
        <span className="truncate">{chunkMetadata.themes.join(', ')}</span>
        <span>Importance: {(chunkMetadata.importance_score * 100).toFixed(0)}%</span>
      </div>

      {/* Content with importance highlighting */}
      <div
        className={chunkMetadata.importance_score > 0.8 ? 'bg-yellow-50/30' : ''}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />

      {/* Hover: Top concepts */}
      <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100">
        {chunkMetadata.concepts?.slice(0, 3).map(c => (
          <div key={c.text}>{c.text} ({(c.importance * 100).toFixed(0)}%)</div>
        ))}
      </div>
    </div>
  )
}
```

**Controlled by:** UIStore.showChunkBoundaries
**File:** `src/components/reader/BlockRenderer.tsx`

---

## 📋 REMAINING TASKS

### Priority 1: ReaderLayout Orchestration
- [ ] Read current ReaderLayout implementation
- [ ] Replace useState with store subscriptions
- [ ] Implement connection fetching on visibleChunks change
- [ ] Add 300ms debounce for connection fetching
- [ ] Test scroll → chunks → connections flow

### Priority 2: ConnectionHeatmap Enhancement
- [ ] Add ConnectionStore subscription (connections, enabledEngines)
- [ ] Add ReaderStore subscription (scrollPosition, updateScroll)
- [ ] Calculate 20 density points
- [ ] Implement click-to-jump functionality
- [ ] Add hover tooltips with connection breakdown
- [ ] Test filter synchronization

### Priority 3: Testing & Validation
- [ ] Test persistence (refresh page, weights preserved?)
- [ ] Test scroll position restoration
- [ ] Verify no infinite loops (stable selectors)
- [ ] Test coordinated updates (scroll → connections → sidebar)
- [ ] Verify all 4 stores work independently

---

## 🎯 Architecture Summary

**4-Store System:**
```
ReaderStore      → Document content + scroll + visible chunks
ConnectionStore  → Engine weights + filtering + scoring
UIStore          → View modes + sidebar + display settings
AnnotationStore  → Annotation data + text selection
```

**Data Flow:**
```
Scroll Event
  ↓
VirtualizedReader.handleVisibleRangeChange()
  ↓
ReaderStore.updateScroll(position, offsets)
  ↓
ReaderStore.visibleChunks recalculated
  ↓
ReaderLayout.useEffect(visibleChunks) [subscription]
  ↓
fetch('/api/connections/for-chunks')
  ↓
ConnectionStore.setConnections(connections)
  ↓
ConnectionStore.applyFilters() [auto]
  ↓
ConnectionsList renders filteredConnections
ConnectionHeatmap updates density
```

**No Prop Drilling:**
```
✅ Before: DocumentViewer → ReaderLayout → VirtualizedReader → BlockRenderer
✅ After:  Each component subscribes directly to relevant store(s)
```

---

## 🔧 Key Implementation Patterns

### Pattern 1: Selective Subscriptions (Prevent Re-renders)
```typescript
// ✅ GOOD - only re-renders when documentTitle changes
const documentTitle = useReaderStore(state => state.documentTitle)

// ❌ BAD - re-renders on ANY reader state change
const { documentTitle } = useReaderStore()
```

### Pattern 2: Document-Keyed Data (Isolation)
```typescript
// Annotations keyed by documentId
annotations: Record<string, StoredAnnotation[]>

// Access with selector
const annotations = useAnnotationStore(
  state => documentId ? state.annotations[documentId] : []
)
```

### Pattern 3: Coordinated Updates (Zustand Chain)
```typescript
// Update scroll → triggers visibleChunks → triggers connections
updateScroll(position, offsets)  // ReaderStore
// Automatic: visibleChunks recalculated

// ReaderLayout subscribes and fetches
useEffect(() => {
  fetchConnections(visibleChunks)
}, [visibleChunks])

setConnections(connections)  // ConnectionStore
// Automatic: applyFilters() called
```

### Pattern 4: Persistence Configuration
```typescript
// Persist user preferences, NOT data
partialize: (state) => ({
  weights: state.weights,           // User tuning
  viewMode: state.viewMode,         // User preference
  showChunkBoundaries: state.showChunkBoundaries,  // Display setting
  // DON'T persist: connections, annotations (load from DB)
  // DON'T persist: expandedConnections (transient UI state)
})
```

---

## 🚨 Critical Notes for Next Developer

1. **VirtualizedReader is now self-contained** - No props needed, gets everything from ReaderStore
2. **ReaderLayout is the orchestrator** - Subscribes to visibleChunks and fetches connections
3. **ConnectionStore.applyFilters() is automatic** - Called after setConnections, setWeight, toggleEngine
4. **Persistence is selective** - Only user preferences, not data or transient UI state
5. **Null guards required** - documentId can be null during initial load

---

## 📚 Reference Documents

- **Zustand Patterns:** `docs/ZUSTAND_PATTERN.md`
- **Zustand Rules:** `docs/ZUSTAND_RULES.md`
- **Architecture Vision:** `docs/APP_VISION.md`
- **Implementation Status:** `docs/IMPLEMENTATION_STATUS.md`

---

**Generated:** 2025-01-15
**Ready for:** ReaderLayout orchestration + ConnectionHeatmap enhancement
**Estimated Completion:** 2-3 hours for remaining 20%
