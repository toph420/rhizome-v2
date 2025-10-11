# Zustand State Management Rules for Rhizome

**Last Updated:** 2025-01-15  
**Purpose:** Reference guide for AI coding agents working on Rhizome  
**Scope:** State management patterns, store architecture, and anti-patterns

---

## Core Principles

### 1. Use Zustand When State Needs To:

✅ **Be shared across multiple components**
```typescript
// ✅ GOOD: Scroll position needed by Reader + Sidebar + Heatmap
const scrollPosition = useReaderStore(state => state.scrollPosition)

// ❌ BAD: Button hover state only used by that button
const [isHovered, setIsHovered] = useState(false)  // Use useState instead
```

✅ **Persist across component unmounts**
```typescript
// ✅ GOOD: User's engine weight preferences
const weights = useConnectionStore(state => state.weights)

// ❌ BAD: Temporary "loading" indicator
const [loading, setLoading] = useState(false)  // Use useState instead
```

✅ **Be updated from multiple locations**
```typescript
// ✅ GOOD: Visible chunks updated by scroll, keyboard nav, search results
const setVisibleChunks = useReaderStore(state => state.setVisibleChunks)

// ❌ BAD: Single component's local checkbox state
const [checked, setChecked] = useState(false)  // Use useState instead
```

✅ **Trigger coordinated updates across components**
```typescript
// ✅ GOOD: Scroll triggers → update chunks → fetch connections → update sidebar
const updateScroll = useReaderStore(state => state.updateScroll)
// This automatically recalculates visibleChunks
// Sidebar subscribes to visibleChunks and updates connections
```

---

## Store Architecture

Rhizome uses **4 core stores**. Each has a single, clear responsibility.

### Store 1: Reader Store

**Responsibility:** Document content, scroll state, viewport tracking

```typescript
// stores/useReaderStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Chunk {
  id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
  themes: string[]
  importance_score: number
  embedding?: number[]
}

interface ReaderState {
  // Current document
  documentId: string | null
  documentTitle: string
  markdownContent: string
  chunks: Chunk[]
  
  // Scroll & viewport
  scrollPosition: number  // 0-100 percentage
  viewportOffsets: { start: number; end: number }
  visibleChunks: Chunk[]
  
  // Actions
  loadDocument: (docId: string, title: string, markdown: string, chunks: Chunk[]) => void
  updateScroll: (position: number, offsets: { start: number; end: number }) => void
  clearDocument: () => void
}

export const useReaderStore = create<ReaderState>()(
  persist(
    (set, get) => ({
      // Initial state
      documentId: null,
      documentTitle: '',
      markdownContent: '',
      chunks: [],
      scrollPosition: 0,
      viewportOffsets: { start: 0, end: 0 },
      visibleChunks: [],
      
      // Load a new document
      loadDocument: (docId, title, markdown, chunks) => set({
        documentId: docId,
        documentTitle: title,
        markdownContent: markdown,
        chunks,
        scrollPosition: 0,
        viewportOffsets: { start: 0, end: markdown.length },
        visibleChunks: chunks.slice(0, 3)  // Assume first 3 visible initially
      }),
      
      // Update scroll and automatically recalculate visible chunks
      updateScroll: (position, offsets) => {
        const chunks = get().chunks
        const visible = chunks.filter(c => 
          c.start_offset <= offsets.end && c.end_offset >= offsets.start
        )
        set({ 
          scrollPosition: position, 
          viewportOffsets: offsets,
          visibleChunks: visible
        })
      },
      
      // Clear when navigating away
      clearDocument: () => set({
        documentId: null,
        documentTitle: '',
        markdownContent: '',
        chunks: [],
        scrollPosition: 0,
        viewportOffsets: { start: 0, end: 0 },
        visibleChunks: []
      })
    }),
    {
      name: 'reader-storage',
      // Only persist document ID and scroll position
      partialize: (state) => ({ 
        documentId: state.documentId,
        scrollPosition: state.scrollPosition
      })
    }
  )
)
```

**When to use:**

✅ Loading a document for reading
```typescript
const loadDocument = useReaderStore(state => state.loadDocument)

useEffect(() => {
  async function load() {
    const doc = await fetchDocument(documentId)
    loadDocument(doc.id, doc.title, doc.markdown, doc.chunks)
  }
  load()
}, [documentId])
```

✅ Tracking scroll position
```typescript
const updateScroll = useReaderStore(state => state.updateScroll)

const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
  const position = (scrollTop / (scrollHeight - clientHeight)) * 100
  
  // Calculate viewport offsets in markdown
  const offsets = calculateOffsets(scrollTop, clientHeight)
  
  updateScroll(position, offsets)
}
```

✅ Getting visible chunks for connection lookup
```typescript
const visibleChunks = useReaderStore(state => state.visibleChunks)

useEffect(() => {
  async function loadConnections() {
    const connections = await fetchConnectionsForChunks(
      visibleChunks.map(c => c.id)
    )
    setConnections(connections)
  }
  loadConnections()
}, [visibleChunks])
```

❌ **Don't use for:**
- Individual chunk highlighting state (component-local)
- Search query input (form state)
- Temporary loading indicators

---

### Store 2: Connection Store

**Responsibility:** Engine weights, connection scoring, filtering

```typescript
// stores/useConnectionStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Connection {
  id: string
  type: 'semantic' | 'contradiction' | 'thematic_bridge'
  strength: number
  sourceChunkId: string
  targetChunkId: string
  targetDoc: string
  targetDocTitle: string
  reason: string
  metadata: {
    sharedConcepts?: string[]
    polarityDifference?: number
    bridgeType?: string
  }
}

interface EngineWeights {
  semantic: number         // Default: 0.25
  contradiction: number    // Default: 0.40
  thematic_bridge: number  // Default: 0.35
}

interface ConnectionState {
  // Personal engine tuning
  weights: EngineWeights
  
  // Active connections for visible chunks
  connections: Connection[]
  filteredConnections: Connection[]
  
  // Filters
  showTypes: Set<string>
  minStrength: number
  
  // Actions
  setWeight: (engine: keyof EngineWeights, weight: number) => void
  normalizeWeights: () => void
  setConnections: (connections: Connection[]) => void
  toggleType: (type: string) => void
  setMinStrength: (strength: number) => void
  
  // Internal
  applyFilters: () => void
  scoreConnection: (conn: Connection) => number
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      // Initial state - personal defaults from vision doc
      weights: {
        semantic: 0.25,
        contradiction: 0.40,
        thematic_bridge: 0.35
      },
      
      connections: [],
      filteredConnections: [],
      showTypes: new Set(['semantic', 'contradiction', 'thematic_bridge']),
      minStrength: 0.6,
      
      // Update a single weight
      setWeight: (engine, weight) => {
        set(state => ({
          weights: { ...state.weights, [engine]: weight }
        }))
        get().normalizeWeights()
        get().applyFilters()
      },
      
      // Ensure weights sum to 1.0
      normalizeWeights: () => {
        const weights = get().weights
        const total = Object.values(weights).reduce((a, b) => a + b, 0)
        
        if (total === 0) {
          // Reset to defaults if all zero
          set({
            weights: {
              semantic: 0.25,
              contradiction: 0.40,
              thematic_bridge: 0.35
            }
          })
          return
        }
        
        const normalized = Object.fromEntries(
          Object.entries(weights).map(([k, v]) => [k, v / total])
        ) as EngineWeights
        
        set({ weights: normalized })
      },
      
      // Load new connections (from visible chunks)
      setConnections: (connections) => {
        set({ connections })
        get().applyFilters()
      },
      
      // Toggle connection type visibility
      toggleType: (type) => {
        const showTypes = new Set(get().showTypes)
        if (showTypes.has(type)) {
          showTypes.delete(type)
        } else {
          showTypes.add(type)
        }
        set({ showTypes })
        get().applyFilters()
      },
      
      // Update minimum strength threshold
      setMinStrength: (strength) => {
        set({ minStrength: strength })
        get().applyFilters()
      },
      
      // Re-filter and re-score connections
      applyFilters: () => {
        const { connections, showTypes, minStrength, scoreConnection } = get()
        
        const filtered = connections
          .filter(c => showTypes.has(c.type))
          .map(c => ({ ...c, finalScore: scoreConnection(c) }))
          .filter(c => c.finalScore >= minStrength)
          .sort((a, b) => b.finalScore - a.finalScore)
        
        set({ filteredConnections: filtered })
      },
      
      // Score a connection using personal weights
      scoreConnection: (conn) => {
        const weights = get().weights
        const typeWeight = weights[conn.type]
        return conn.strength * typeWeight
      }
    }),
    {
      name: 'connection-storage',
      partialize: (state) => ({
        weights: state.weights,
        showTypes: Array.from(state.showTypes),
        minStrength: state.minStrength
      }),
      // Deserialize Set from array
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.showTypes)) {
          state.showTypes = new Set(state.showTypes)
        }
      }
    }
  )
)
```

**When to use:**

✅ Adjusting engine weights in real-time
```typescript
const setWeight = useConnectionStore(state => state.setWeight)

const handleSliderChange = (engine: string, value: number) => {
  setWeight(engine as keyof EngineWeights, value / 100)
  // Store automatically normalizes and re-filters
}
```

✅ Loading connections for visible chunks
```typescript
const setConnections = useConnectionStore(state => state.setConnections)
const visibleChunks = useReaderStore(state => state.visibleChunks)

useEffect(() => {
  async function load() {
    const connections = await fetchConnectionsForChunks(
      visibleChunks.map(c => c.id)
    )
    setConnections(connections)
  }
  load()
}, [visibleChunks])
```

✅ Filtering by connection type
```typescript
const toggleType = useConnectionStore(state => state.toggleType)
const showTypes = useConnectionStore(state => state.showTypes)

<button onClick={() => toggleType('contradiction')}>
  {showTypes.has('contradiction') ? '✓' : '○'} Contradictions
</button>
```

✅ Displaying filtered connections in sidebar
```typescript
const filteredConnections = useConnectionStore(state => state.filteredConnections)

return (
  <div>
    {filteredConnections.map(conn => (
      <ConnectionCard key={conn.id} connection={conn} />
    ))}
  </div>
)
```

❌ **Don't use for:**
- Expanded state of individual connection cards (UI store)
- Temporary connection preview on hover (useState)
- Connection fetching status (useState in the component)

---

### Store 3: UI Store

**Responsibility:** View modes, sidebar state, display settings

```typescript
// stores/useUIStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ViewMode = 'explore' | 'focus' | 'study'
type SidebarTab = 'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune'

interface UIState {
  // View mode
  viewMode: ViewMode
  
  // Sidebar
  sidebarCollapsed: boolean
  activeTab: SidebarTab
  expandedConnections: Set<string>
  expandedSparks: Set<string>
  
  // Reader display settings
  showChunkBoundaries: boolean
  showHeatmap: boolean
  chaosMode: boolean
  
  // Side-by-side comparison
  comparisonMode: boolean
  comparisonTargetDocId: string | null
  
  // Actions
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveTab: (tab: SidebarTab) => void
  toggleConnectionExpanded: (id: string) => void
  toggleSparkExpanded: (id: string) => void
  toggleSetting: (setting: 'showChunkBoundaries' | 'showHeatmap' | 'chaosMode') => void
  enterComparisonMode: (targetDocId: string) => void
  exitComparisonMode: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      viewMode: 'explore',
      sidebarCollapsed: false,
      activeTab: 'connections',
      expandedConnections: new Set(),
      expandedSparks: new Set(),
      showChunkBoundaries: true,
      showHeatmap: true,
      chaosMode: false,
      comparisonMode: false,
      comparisonTargetDocId: null,
      
      setViewMode: (mode) => {
        set({ viewMode: mode })
        // Auto-collapse sidebar in focus mode
        if (mode === 'focus') {
          set({ sidebarCollapsed: true })
        } else if (get().sidebarCollapsed) {
          // Re-open sidebar when leaving focus mode
          set({ sidebarCollapsed: false })
        }
      },
      
      toggleSidebar: () => set({ 
        sidebarCollapsed: !get().sidebarCollapsed 
      }),
      
      setSidebarCollapsed: (collapsed) => set({ 
        sidebarCollapsed: collapsed 
      }),
      
      setActiveTab: (tab) => set({ activeTab: tab }),
      
      toggleConnectionExpanded: (id) => {
        const expanded = new Set(get().expandedConnections)
        if (expanded.has(id)) {
          expanded.delete(id)
        } else {
          expanded.add(id)
        }
        set({ expandedConnections: expanded })
      },
      
      toggleSparkExpanded: (id) => {
        const expanded = new Set(get().expandedSparks)
        if (expanded.has(id)) {
          expanded.delete(id)
        } else {
          expanded.add(id)
        }
        set({ expandedSparks: expanded })
      },
      
      toggleSetting: (setting) => {
        set({ [setting]: !get()[setting] })
      },
      
      enterComparisonMode: (targetDocId) => set({
        comparisonMode: true,
        comparisonTargetDocId: targetDocId,
        sidebarCollapsed: false  // Ensure sidebar visible for comparison panel
      }),
      
      exitComparisonMode: () => set({
        comparisonMode: false,
        comparisonTargetDocId: null
      })
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarCollapsed: state.sidebarCollapsed,
        activeTab: state.activeTab,
        showChunkBoundaries: state.showChunkBoundaries,
        showHeatmap: state.showHeatmap,
        chaosMode: state.chaosMode
        // Don't persist expandedConnections - reset on page load
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset expanded states on hydration
          state.expandedConnections = new Set()
          state.expandedSparks = new Set()
        }
      }
    }
  )
)
```

**When to use:**

✅ View mode switching
```typescript
const viewMode = useUIStore(state => state.viewMode)
const setViewMode = useUIStore(state => state.setViewMode)

<button 
  className={viewMode === 'explore' ? 'active' : ''}
  onClick={() => setViewMode('explore')}
>
  <Compass />
</button>
```

✅ Sidebar tab navigation
```typescript
const activeTab = useUIStore(state => state.activeTab)
const setActiveTab = useUIStore(state => state.setActiveTab)

<button onClick={() => setActiveTab('connections')}>
  Connections
</button>
```

✅ Connection card expansion
```typescript
const expanded = useUIStore(state => 
  state.expandedConnections.has(connection.id)
)
const toggleExpanded = useUIStore(state => 
  state.toggleConnectionExpanded
)

<button onClick={() => toggleExpanded(connection.id)}>
  <ChevronDown className={expanded ? 'rotate-180' : ''} />
</button>
```

✅ Display settings
```typescript
const showChunkBoundaries = useUIStore(state => state.showChunkBoundaries)
const toggleSetting = useUIStore(state => state.toggleSetting)

<label>
  <input 
    type="checkbox" 
    checked={showChunkBoundaries}
    onChange={() => toggleSetting('showChunkBoundaries')}
  />
  Show chunk boundaries
</label>
```

✅ Entering side-by-side comparison
```typescript
const enterComparisonMode = useUIStore(state => state.enterComparisonMode)

<button onClick={() => enterComparisonMode(connection.targetDocId)}>
  Open Side-by-Side
</button>
```

❌ **Don't use for:**
- Modal open/closed state (useState in the component)
- Form input values (useState or form library)
- Animation states (useState with CSS)

---

### Store 4: Annotation Store

**Responsibility:** Text selection, annotation creation, display

```typescript
// stores/useAnnotationStore.ts
import { create } from 'zustand'

interface Annotation {
  id: string
  position: { start: number; end: number }  // Global position in markdown
  chunkId: string  // For connection lookups
  content: { 
    note: string
    tags: string[]
    color: 'yellow' | 'blue' | 'green' | 'red' | 'purple'
  }
  created_at: string
}

interface AnnotationState {
  // Current selection
  selectedText: string
  selectionRange: { start: number; end: number } | null
  
  // Creating annotation
  creatingAnnotation: boolean
  annotationDraft: Partial<Annotation> | null
  
  // All annotations for current document
  annotations: Annotation[]
  
  // Actions
  setSelection: (text: string, range: { start: number; end: number }) => void
  clearSelection: () => void
  startAnnotation: (chunkId: string) => void
  cancelAnnotation: () => void
  updateDraft: (content: Partial<Annotation['content']>) => void
  saveAnnotation: (documentId: string) => Promise<void>
  loadAnnotations: (annotations: Annotation[]) => void
  deleteAnnotation: (id: string) => Promise<void>
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  selectedText: '',
  selectionRange: null,
  creatingAnnotation: false,
  annotationDraft: null,
  annotations: [],
  
  setSelection: (text, range) => set({ 
    selectedText: text, 
    selectionRange: range 
  }),
  
  clearSelection: () => set({
    selectedText: '',
    selectionRange: null
  }),
  
  startAnnotation: (chunkId) => {
    const { selectedText, selectionRange } = get()
    if (!selectionRange) return
    
    set({
      creatingAnnotation: true,
      annotationDraft: {
        position: selectionRange,
        chunkId,
        content: { 
          note: '', 
          tags: [], 
          color: 'yellow' 
        }
      }
    })
  },
  
  cancelAnnotation: () => set({
    creatingAnnotation: false,
    annotationDraft: null,
    selectedText: '',
    selectionRange: null
  }),
  
  updateDraft: (content) => {
    const draft = get().annotationDraft
    if (!draft) return
    
    set({
      annotationDraft: {
        ...draft,
        content: { ...draft.content, ...content }
      }
    })
  },
  
  saveAnnotation: async (documentId) => {
    const draft = get().annotationDraft
    if (!draft || !draft.position || !draft.chunkId || !draft.content) return
    
    const annotation: Annotation = {
      id: `ann_${Date.now()}`,
      position: draft.position,
      chunkId: draft.chunkId,
      content: draft.content as Annotation['content'],
      created_at: new Date().toISOString()
    }
    
    // Save to file system via API
    const response = await fetch(`/api/documents/${documentId}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annotation)
    })
    
    if (!response.ok) {
      throw new Error('Failed to save annotation')
    }
    
    set({
      annotations: [...get().annotations, annotation],
      creatingAnnotation: false,
      annotationDraft: null,
      selectedText: '',
      selectionRange: null
    })
  },
  
  loadAnnotations: (annotations) => set({ annotations }),
  
  deleteAnnotation: async (id) => {
    const annotation = get().annotations.find(a => a.id === id)
    if (!annotation) return
    
    // Delete from file system via API
    const response = await fetch(`/api/annotations/${id}`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error('Failed to delete annotation')
    }
    
    set({
      annotations: get().annotations.filter(a => a.id !== id)
    })
  }
}))
```

**When to use:**

✅ Capturing text selection
```typescript
const setSelection = useAnnotationStore(state => state.setSelection)

const handleMouseUp = () => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return
  
  const text = selection.toString()
  const range = getSelectionOffsets(selection)  // Helper to get offsets
  
  setSelection(text, range)
}
```

✅ Starting annotation creation
```typescript
const selectedText = useAnnotationStore(state => state.selectedText)
const startAnnotation = useAnnotationStore(state => state.startAnnotation)
const visibleChunks = useReaderStore(state => state.visibleChunks)

const handleAnnotateClick = () => {
  if (!selectedText) return
  
  // Find which chunk contains the selection
  const chunkId = findChunkForSelection(visibleChunks, selectionRange)
  
  startAnnotation(chunkId)
}
```

✅ Annotation creation UI
```typescript
const creatingAnnotation = useAnnotationStore(state => state.creatingAnnotation)
const annotationDraft = useAnnotationStore(state => state.annotationDraft)
const updateDraft = useAnnotationStore(state => state.updateDraft)
const saveAnnotation = useAnnotationStore(state => state.saveAnnotation)
const cancelAnnotation = useAnnotationStore(state => state.cancelAnnotation)

if (creatingAnnotation) {
  return (
    <div className="annotation-modal">
      <textarea 
        value={annotationDraft?.content?.note || ''}
        onChange={(e) => updateDraft({ note: e.target.value })}
        placeholder="Add a note..."
      />
      <button onClick={() => saveAnnotation(documentId)}>
        Save
      </button>
      <button onClick={cancelAnnotation}>
        Cancel
      </button>
    </div>
  )
}
```

✅ Displaying annotations
```typescript
const annotations = useAnnotationStore(state => state.annotations)

<div className="annotations-list">
  {annotations.map(ann => (
    <div key={ann.id} className={`annotation annotation-${ann.content.color}`}>
      <p>{ann.content.note}</p>
      <div className="tags">
        {ann.content.tags.map(tag => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
    </div>
  ))}
</div>
```

❌ **Don't use for:**
- Color picker open state (useState)
- Tag input value (useState)
- Hover preview (useState)

---

## Common Patterns

### Pattern 1: Coordinated State Updates

**Problem:** Scroll triggers multiple state changes across stores

**Solution:** Chain updates through store subscriptions

```typescript
// In Reader component
const updateScroll = useReaderStore(state => state.updateScroll)
const setConnections = useConnectionStore(state => state.setConnections)

const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
  const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
  const position = (scrollTop / (scrollHeight - clientHeight)) * 100
  const offsets = calculateViewportOffsets(e.currentTarget)
  
  // Step 1: Update scroll state
  updateScroll(position, offsets)
  
  // Step 2: Get newly visible chunks
  const visibleChunks = useReaderStore.getState().visibleChunks
  
  // Step 3: Fetch connections for visible chunks
  const connections = await fetchConnectionsForChunks(
    visibleChunks.map(c => c.id)
  )
  
  // Step 4: Update connection state
  setConnections(connections)
  
  // Sidebar automatically re-renders with filtered connections
}
```

### Pattern 2: Selective Re-renders

**Problem:** Component re-renders when unrelated state changes

**Solution:** Subscribe to only the state you need

```typescript
// ✅ GOOD: Only re-renders when scroll position changes
function ScrollIndicator() {
  const scrollPosition = useReaderStore(state => state.scrollPosition)
  
  return <div>Reading: {scrollPosition.toFixed(0)}%</div>
}

// ❌ BAD: Re-renders when ANY reader state changes
function ScrollIndicator() {
  const state = useReaderStore()  // Subscribes to entire store
  
  return <div>Reading: {state.scrollPosition.toFixed(0)}%</div>
}
```

```typescript
// ✅ GOOD: Only re-renders when this specific connection expands
function ConnectionCard({ connection }) {
  const expanded = useUIStore(state => 
    state.expandedConnections.has(connection.id)
  )
  const toggleExpanded = useUIStore(state => 
    state.toggleConnectionExpanded
  )
  
  return (
    <div onClick={() => toggleExpanded(connection.id)}>
      {expanded && <ConnectionDetails />}
    </div>
  )
}

// ❌ BAD: Re-renders when ANY connection expands
function ConnectionCard({ connection }) {
  const expandedConnections = useUIStore(state => state.expandedConnections)
  const toggleExpanded = useUIStore(state => state.toggleConnectionExpanded)
  
  const expanded = expandedConnections.has(connection.id)
  // Re-renders every time expandedConnections Set changes
}
```

### Pattern 3: Computed Values

**Problem:** Need derived state based on store values

**Solution:** Compute in the selector or in the store itself

```typescript
// ✅ GOOD: Compute in selector
function Sidebar() {
  const connectionCount = useConnectionStore(state => 
    state.filteredConnections.length
  )
  
  return <div>{connectionCount} connections</div>
}

// ✅ ALSO GOOD: Compute in store action
interface ConnectionState {
  // ... other state
  getConnectionCount: () => number
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // ... other state
  
  getConnectionCount: () => {
    return get().filteredConnections.length
  }
}))

// Usage
const getConnectionCount = useConnectionStore(state => state.getConnectionCount)
const count = getConnectionCount()
```

### Pattern 4: Async Actions

**Problem:** Need to perform async operations and update state

**Solution:** Define async actions in the store

```typescript
interface ReaderState {
  // ... other state
  
  loadDocumentById: (docId: string) => Promise<void>
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  // ... other state
  
  loadDocumentById: async (docId) => {
    try {
      const response = await fetch(`/api/documents/${docId}`)
      const doc = await response.json()
      
      set({
        documentId: doc.id,
        documentTitle: doc.title,
        markdownContent: doc.markdown,
        chunks: doc.chunks,
        scrollPosition: 0,
        visibleChunks: doc.chunks.slice(0, 3)
      })
    } catch (error) {
      console.error('Failed to load document:', error)
      // Could set error state here
    }
  }
}))

// Usage in component
const loadDocumentById = useReaderStore(state => state.loadDocumentById)

useEffect(() => {
  loadDocumentById(documentId)
}, [documentId])
```

### Pattern 5: Resetting State

**Problem:** Need to clear state when navigating away

**Solution:** Define reset actions

```typescript
interface ReaderState {
  // ... other state
  
  reset: () => void
}

export const useReaderStore = create<ReaderState>((set) => ({
  // ... other state
  
  reset: () => set({
    documentId: null,
    documentTitle: '',
    markdownContent: '',
    chunks: [],
    scrollPosition: 0,
    viewportOffsets: { start: 0, end: 0 },
    visibleChunks: []
  })
}))

// Usage when leaving document view
const reset = useReaderStore(state => state.reset)

useEffect(() => {
  return () => {
    // Clean up when component unmounts
    reset()
  }
}, [])
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Storing Props in State

**Problem:** Duplicating props in Zustand

```typescript
// ❌ BAD
function ConnectionCard({ connection }) {
  const setCurrentConnection = useConnectionStore(state => state.setCurrentConnection)
  
  useEffect(() => {
    setCurrentConnection(connection)
  }, [connection])
  
  // Why is this bad? Connection is already available as a prop
}

// ✅ GOOD: Just use the prop
function ConnectionCard({ connection }) {
  // Use connection directly
  return <div>{connection.reason}</div>
}
```

### ❌ Anti-Pattern 2: Over-Subscribing

**Problem:** Subscribing to the entire store

```typescript
// ❌ BAD: Re-renders on ANY state change
function MyComponent() {
  const store = useReaderStore()
  
  return <div>{store.documentTitle}</div>
}

// ✅ GOOD: Only re-renders when documentTitle changes
function MyComponent() {
  const documentTitle = useReaderStore(state => state.documentTitle)
  
  return <div>{documentTitle}</div>
}
```

### ❌ Anti-Pattern 3: Mutating State Directly

**Problem:** Modifying state without using `set`

```typescript
// ❌ BAD: Direct mutation
const weights = useConnectionStore(state => state.weights)
weights.semantic = 0.5  // This won't trigger re-renders!

// ✅ GOOD: Use the action
const setWeight = useConnectionStore(state => state.setWeight)
setWeight('semantic', 0.5)
```

### ❌ Anti-Pattern 4: Multiple Stores for Same Domain

**Problem:** Creating separate stores for related state

```typescript
// ❌ BAD: Fragmenting connection state
const useConnectionDataStore = create(...)
const useConnectionUIStore = create(...)
const useConnectionFilterStore = create(...)

// ✅ GOOD: Single store for connection domain
const useConnectionStore = create(...)
```

### ❌ Anti-Pattern 5: Using Zustand for Everything

**Problem:** Putting local UI state in Zustand

```typescript
// ❌ BAD: Button hover in Zustand
const useUIStore = create((set) => ({
  buttonHovered: false,
  setButtonHovered: (hovered) => set({ buttonHovered: hovered })
}))

// ✅ GOOD: Use useState for local state
function MyButton() {
  const [hovered, setHovered] = useState(false)
  
  return (
    <button 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  )
}
```

---

## Testing Stores

### Testing Individual Actions

```typescript
// stores/__tests__/useConnectionStore.test.ts
import { renderHook, act } from '@testing-library/react'
import { useConnectionStore } from '../useConnectionStore'

describe('useConnectionStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useConnectionStore())
    act(() => {
      result.current.reset()
    })
  })
  
  it('normalizes weights to sum to 1.0', () => {
    const { result } = renderHook(() => useConnectionStore())
    
    act(() => {
      result.current.setWeight('semantic', 0.5)
      result.current.setWeight('contradiction', 0.3)
      result.current.setWeight('thematic_bridge', 0.2)
    })
    
    const weights = result.current.weights
    const sum = weights.semantic + weights.contradiction + weights.thematic_bridge
    
    expect(sum).toBeCloseTo(1.0)
  })
  
  it('filters connections by type', () => {
    const { result } = renderHook(() => useConnectionStore())
    
    const mockConnections = [
      { id: '1', type: 'semantic', strength: 0.8 },
      { id: '2', type: 'contradiction', strength: 0.9 },
      { id: '3', type: 'thematic_bridge', strength: 0.7 }
    ]
    
    act(() => {
      result.current.setConnections(mockConnections)
      result.current.toggleType('semantic')  // Hide semantic
    })
    
    expect(result.current.filteredConnections).toHaveLength(2)
    expect(result.current.filteredConnections[0].type).not.toBe('semantic')
  })
})
```

---

## Migration Guide

### Converting from useState to Zustand

**Before:**
```typescript
function DocumentReader() {
  const [scrollPosition, setScrollPosition] = useState(0)
  const [visibleChunks, setVisibleChunks] = useState([])
  
  const handleScroll = (position) => {
    setScrollPosition(position)
    // Calculate visible chunks...
    setVisibleChunks(newVisibleChunks)
  }
  
  return (
    <>
      <Reader onScroll={handleScroll} />
      <Sidebar visibleChunks={visibleChunks} />
    </>
  )
}
```

**After:**
```typescript
// Store handles the state
function DocumentReader() {
  const updateScroll = useReaderStore(state => state.updateScroll)
  
  return (
    <>
      <Reader onScroll={updateScroll} />
      <Sidebar />  {/* Gets visibleChunks from store */}
    </>
  )
}

function Sidebar() {
  const visibleChunks = useReaderStore(state => state.visibleChunks)
  // ...
}
```

---

## Performance Tips

### 1. Use Selectors to Minimize Re-renders

```typescript
// ✅ GOOD: Component only re-renders when documentTitle changes
const documentTitle = useReaderStore(state => state.documentTitle)

// ❌ BAD: Component re-renders when ANY reader state changes
const { documentTitle } = useReaderStore()
```

### 2. Memoize Selectors for Expensive Computations

```typescript
import { useMemo } from 'react'

function Sidebar() {
  const connections = useConnectionStore(state => state.filteredConnections)
  
  // Only recalculate when connections change
  const connectionsByType = useMemo(() => {
    return connections.reduce((acc, conn) => {
      if (!acc[conn.type]) acc[conn.type] = []
      acc[conn.type].push(conn)
      return acc
    }, {})
  }, [connections])
  
  return <div>{/* Render by type */}</div>
}
```

### 3. Batch State Updates

```typescript
// ✅ GOOD: Single set() call
const loadDocument = (doc) => {
  set({
    documentId: doc.id,
    documentTitle: doc.title,
    markdownContent: doc.markdown,
    chunks: doc.chunks
  })
}

// ❌ BAD: Multiple set() calls trigger multiple re-renders
const loadDocument = (doc) => {
  set({ documentId: doc.id })
  set({ documentTitle: doc.title })
  set({ markdownContent: doc.markdown })
  set({ chunks: doc.chunks })
}
```

---

## Summary Checklist

### ✅ Use Zustand for:
- [ ] State shared across multiple components
- [ ] State that persists across unmounts
- [ ] State updated from multiple locations
- [ ] Complex state requiring coordinated updates
- [ ] Personal preferences (engine weights, UI settings)

### ❌ Don't use Zustand for:
- [ ] Component-local UI state (hover, focus)
- [ ] Form inputs and validation
- [ ] Temporary loading indicators
- [ ] Animation states
- [ ] Props that don't need to be shared

### 🎯 Best Practices:
- [ ] Subscribe to minimal state slices
- [ ] Normalize complex state (weights sum to 1.0)
- [ ] Define actions for all state mutations
- [ ] Use persist middleware for user preferences
- [ ] Batch related state updates
- [ ] Test store actions independently
- [ ] Reset state when appropriate

---

## Quick Reference

### Import Statements
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
```

### Basic Store Template
```typescript
interface MyState {
  value: number
  setValue: (value: number) => void
}

export const useMyStore = create<MyState>((set, get) => ({
  value: 0,
  setValue: (value) => set({ value })
}))
```

### Usage in Components
```typescript
// Subscribe to specific value
const value = useMyStore(state => state.value)

// Get action
const setValue = useMyStore(state => state.setValue)

// Get state outside React
const currentValue = useMyStore.getState().value
```

### Persistence
```typescript
export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({ /* store definition */ }),
    {
      name: 'my-storage',
      partialize: (state) => ({ value: state.value })
    }
  )
)
```

---

**Last Updated:** 2025-01-15  
**For Questions:** Reference APP_VISION.md for architectural decisions