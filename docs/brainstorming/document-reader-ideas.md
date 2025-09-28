# Rhizome Architecture - Personal Knowledge Synthesis Engine Document Reader

**Status:** Personal tool with uncompromising features, built with quality architecture for potential future release.

## Core Architecture Principles

### Maximum Intelligence, Quality Implementation
- **All 7 collision engines run in parallel** - No throttling, but clean async patterns
- **Store every connection** - With proper indexing and query optimization
- **Real-time tuning** - Live weight adjustment with proper state management
- **Ship fast, maintain structure** - Experimental features in feature flags

## Document Reader Architecture

### Design Goals
A Readwise Reader + Zotero hybrid, optimized for synthesis discovery:
- **Annotation-first** - Quick capture panel always accessible
- **Color-coded highlighting** - Semantic meaning through color
- **Flow preservation** - Everything inline or docked, no modals
- **Connection surfacing** - Aggressive but not overwhelming

### Reader Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Document Header (title, author, metadata)                   │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│   Document Content       │   Right Sidebar (Collapsible)    │
│                          │                                  │
│   [Markdown rendered     │   [Tabs: Connections/Annotations]│
│    with chunks           │                                  │
│    streaming from        │   Connections Tab:               │
│    storage]              │   - Live updating as you read    │
│                          │   - Sorted by weight score       │
│   ┌──────────────┐      │   - Click to navigate            │
│   │Selected Text │      │                                  │
│   └──────────────┘      │   Annotations Tab:               │
│         ↓                │   - All highlights/notes         │
│   [Quick Capture]       │   - Filterable by color/tag      │
│                          │   - Jump to location             │
│                          │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

### Quick Capture Panel

Appears on text selection, positioned above/below selection:

```typescript
interface QuickCapturePanel {
  // Color-coded highlights (configurable)
  highlights: {
    green: { label: "Agree/Important", hotkey: "g" },
    yellow: { label: "Notable", hotkey: "y" },
    red: { label: "Disagree/Question", hotkey: "r" },
    blue: { label: "To Research", hotkey: "b" },
    purple: { label: "Connects to...", hotkey: "p" }
  },
  
  // Actions
  actions: {
    note: { icon: "📝", hotkey: "n" },      // Add note to highlight
    spark: { icon: "⚡", hotkey: "s" },      // Create spark
    flashcard: { icon: "🗂️", hotkey: "f" },  // Create flashcard
    tags: { icon: "🏷️", hotkey: "t" }        // Add tags
  }
}
```

### Component Architecture

```typescript
// app/(main)/read/[id]/page.tsx
export default async function DocumentReader({ params }: { params: { id: string } }) {
  // Server component - fetch initial data
  const document = await getDocument(params.id)
  const markdown = await fetchMarkdownFromStorage(document.storage_path)
  
  return (
    <div className="flex h-screen">
      <ReaderContent 
        documentId={params.id}
        initialMarkdown={markdown}
        storageBasePath={document.storage_path}
      />
      <ReaderSidebar documentId={params.id} />
    </div>
  )
}

// components/reader/reader-content.tsx
'use client'

interface ReaderContentProps {
  documentId: string
  initialMarkdown: string
  storageBasePath: string
}

export function ReaderContent({ documentId, initialMarkdown, storageBasePath }: ReaderContentProps) {
  const [selection, setSelection] = useState<TextSelection | null>(null)
  const [annotations, setAnnotations] = useState<Map<string, Annotation>>(new Map())
  const { engineWeights, connectionThreshold } = useReaderSettings()
  
  // Stream chunks if needed
  const { chunks } = useChunks(documentId)
  
  // Virtual scrolling for performance
  const { visibleChunks, containerRef } = useVirtualScroll(chunks)
  
  // Prefetch connections for visible chunks
  const connections = useConnections(visibleChunks, engineWeights, connectionThreshold)
  
  const handleTextSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    
    setSelection({
      text: sel.toString(),
      range: {
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        startContainer: range.startContainer,
        endContainer: range.endContainer
      },
      position: { x: rect.left, y: rect.top },
      chunkId: findChunkId(range)
    })
  }
  
  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-auto px-8 py-6"
      onMouseUp={handleTextSelection}
    >
      <article className="max-w-3xl mx-auto">
        <MarkdownRenderer 
          content={initialMarkdown}
          annotations={annotations}
          onAnnotationClick={(id) => scrollToAnnotation(id)}
        />
      </article>
      
      {selection && (
        <QuickCapture
          selection={selection}
          onHighlight={(color) => createHighlight(selection, color)}
          onNote={(content) => createNote(selection, content)}
          onSpark={() => createSpark(selection)}
          onFlashcard={() => createFlashcard(selection)}
          onDismiss={() => setSelection(null)}
        />
      )}
    </div>
  )
}

// components/reader/quick-capture.tsx
interface QuickCaptureProps {
  selection: TextSelection
  onHighlight: (color: HighlightColor) => void
  onNote: (content: string) => void
  onSpark: () => void
  onFlashcard: () => void
  onDismiss: () => void
}

export function QuickCapture({ selection, ...handlers }: QuickCaptureProps) {
  const [showNoteInput, setShowNoteInput] = useState(false)
  const { highlightConfig } = useReaderSettings()
  
  // Keyboard shortcuts
  useHotkeys('g', () => handlers.onHighlight('green'))
  useHotkeys('y', () => handlers.onHighlight('yellow'))
  useHotkeys('r', () => handlers.onHighlight('red'))
  useHotkeys('n', () => setShowNoteInput(true))
  useHotkeys('s', handlers.onSpark)
  useHotkeys('escape', handlers.onDismiss)
  
  const position = calculatePosition(selection.position)
  
  return (
    <motion.div
      className="absolute z-50 bg-background border rounded-lg shadow-lg p-2"
      style={{ left: position.x, top: position.y }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {!showNoteInput ? (
        <div className="flex gap-1">
          {/* Highlight colors */}
          {Object.entries(highlightConfig).map(([color, config]) => (
            <Tooltip key={color} content={`${config.label} (${config.hotkey})`}>
              <Button
                size="sm"
                variant="ghost"
                className={`w-8 h-8 p-0`}
                style={{ backgroundColor: color }}
                onClick={() => handlers.onHighlight(color as HighlightColor)}
              >
                <span className="sr-only">{config.label}</span>
              </Button>
            </Tooltip>
          ))}
          
          <div className="w-px bg-border mx-1" />
          
          {/* Actions */}
          <Tooltip content="Add Note (n)">
            <Button size="sm" variant="ghost" onClick={() => setShowNoteInput(true)}>
              📝
            </Button>
          </Tooltip>
          
          <Tooltip content="Create Spark (s)">
            <Button size="sm" variant="ghost" onClick={handlers.onSpark}>
              ⚡
            </Button>
          </Tooltip>
          
          <Tooltip content="Create Flashcard (f)">
            <Button size="sm" variant="ghost" onClick={handlers.onFlashcard}>
              🗂️
            </Button>
          </Tooltip>
        </div>
      ) : (
        <NoteInput
          onSave={(content) => {
            handlers.onNote(content)
            setShowNoteInput(false)
          }}
          onCancel={() => setShowNoteInput(false)}
        />
      )}
    </motion.div>
  )
}
```

### Annotation Storage & Rendering

```typescript
// lib/annotations/create-annotation.ts
export async function createAnnotation({
  selection,
  color,
  note,
  tags
}: CreateAnnotationParams) {
  // Use ECS for flexibility
  const entityId = await ecs.createEntity(userId, {
    annotation: {
      text: selection.text,
      color,
      note,
      tags
    },
    position: {
      chunk_id: selection.chunkId,
      start_offset: selection.range.startOffset,
      end_offset: selection.range.endOffset,
      text_content: selection.text // For fuzzy matching
    },
    source: {
      document_id: documentId,
      chunk_id: selection.chunkId
    }
  })
  
  // If it's a "connects to" highlight, find connections immediately
  if (color === 'purple') {
    await findAndSurfaceConnections(entityId, selection.text)
  }
  
  return entityId
}

// components/reader/markdown-renderer.tsx
export function MarkdownRenderer({ content, annotations }) {
  // Apply annotations as overlays
  const processedContent = useMemo(() => {
    return applyAnnotationOverlays(content, annotations)
  }, [content, annotations])
  
  return (
    <div className="prose prose-lg dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeShiki]}
        components={{
          // Custom rendering for annotated spans
          mark: ({ node, className, ...props }) => {
            const color = className?.replace('highlight-', '')
            const annotationId = props['data-annotation-id']
            
            return (
              <mark
                className={cn(
                  'cursor-pointer transition-opacity hover:opacity-80',
                  `bg-${color}-200 dark:bg-${color}-900`
                )}
                onClick={() => showAnnotationDetails(annotationId)}
                {...props}
              />
            )
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
```

### Connection Surfacing

```typescript
// components/reader/reader-sidebar.tsx
export function ReaderSidebar({ documentId }) {
  const [activeTab, setActiveTab] = useState<'connections' | 'annotations'>('connections')
  const { visibleChunks } = useReaderContext()
  const { engineWeights } = useReaderSettings()
  
  return (
    <div className="w-96 border-l bg-muted/10 flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="connections" className="flex-1">
            Connections
          </TabsTrigger>
          <TabsTrigger value="annotations" className="flex-1">
            Annotations
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="connections" className="flex-1 overflow-auto">
          <ConnectionsPanel
            documentId={documentId}
            visibleChunks={visibleChunks}
            engineWeights={engineWeights}
          />
        </TabsContent>
        
        <TabsContent value="annotations" className="flex-1 overflow-auto">
          <AnnotationsPanel documentId={documentId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// components/reader/connections-panel.tsx
export function ConnectionsPanel({ documentId, visibleChunks, engineWeights }) {
  const connections = useConnections(visibleChunks, engineWeights)
  
  // Group by connection type
  const grouped = useMemo(() => {
    return groupBy(connections, 'connection_type')
  }, [connections])
  
  return (
    <div className="p-4 space-y-4">
      {/* Live weight tuning */}
      <div className="pb-4 border-b">
        <p className="text-sm font-medium mb-2">Connection Weights</p>
        <WeightTuner 
          weights={engineWeights}
          onChange={(newWeights) => updateEngineWeights(newWeights)}
        />
      </div>
      
      {/* Connections by type */}
      {Object.entries(grouped).map(([type, connections]) => (
        <div key={type}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium capitalize">
              {type.replace('_', ' ')}
            </span>
            <Badge variant="secondary">{connections.length}</Badge>
          </div>
          
          <div className="space-y-2">
            {connections.slice(0, 5).map(conn => (
              <ConnectionCard
                key={conn.id}
                connection={conn}
                onClick={() => navigateToConnection(conn)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Reader Settings & Customization

```typescript
// stores/reader-settings-store.ts
interface ReaderSettings {
  // Highlight colors and meanings
  highlightConfig: {
    green: { label: string, hotkey: string },
    yellow: { label: string, hotkey: string },
    red: { label: string, hotkey: string },
    blue: { label: string, hotkey: string },
    purple: { label: string, hotkey: string }
  }
  
  // Connection engine weights (live-tunable)
  engineWeights: {
    semantic: number
    thematic: number
    structural: number
    contradiction: number
    emotional: number
    methodological: number
    temporal: number
  }
  
  // Display preferences
  connectionThreshold: number  // 0-1, only show above this strength
  maxConnectionsPerType: number
  fontSize: 'small' | 'medium' | 'large'
  theme: 'light' | 'dark' | 'system'
}

export const useReaderSettings = create<ReaderSettingsStore>()(
  persist(
    (set) => ({
      highlightConfig: {
        green: { label: 'Agree/Important', hotkey: 'g' },
        yellow: { label: 'Notable', hotkey: 'y' },
        red: { label: 'Disagree/Question', hotkey: 'r' },
        blue: { label: 'To Research', hotkey: 'b' },
        purple: { label: 'Connects to...', hotkey: 'p' }
      },
      engineWeights: {
        semantic: 0.3,
        thematic: 0.9,
        structural: 0.7,
        contradiction: 1.0,
        emotional: 0.4,
        methodological: 0.8,
        temporal: 0.2
      },
      connectionThreshold: 0.5,
      maxConnectionsPerType: 10,
      
      updateHighlightConfig: (color, config) => set(state => ({
        highlightConfig: { ...state.highlightConfig, [color]: config }
      })),
      
      updateEngineWeights: (weights) => set({ engineWeights: weights }),
      
      updateConnectionThreshold: (threshold) => set({ connectionThreshold: threshold })
    }),
    {
      name: 'reader-settings'
    }
  )
)
```

### Keyboard Navigation

```typescript
// hooks/use-reader-hotkeys.ts
export function useReaderHotkeys() {
  const { currentChunk, navigate } = useReaderNavigation()
  const { createQuickAnnotation } = useAnnotations()
  
  // Navigation
  useHotkeys('j', () => navigate('next'))        // Next chunk
  useHotkeys('k', () => navigate('previous'))    // Previous chunk
  useHotkeys('g g', () => navigate('top'))       // Go to top
  useHotkeys('G', () => navigate('bottom'))      // Go to bottom
  
  // Quick annotations (no selection needed)
  useHotkeys('m', () => createQuickAnnotation(currentChunk, 'bookmark'))
  useHotkeys('!', () => createQuickAnnotation(currentChunk, 'important'))
  
  // View modes
  useHotkeys('1', () => setViewMode('read'))
  useHotkeys('2', () => setViewMode('annotate'))
  useHotkeys('3', () => setViewMode('connections'))
  
  // Connection weights (quick adjust)
  useHotkeys('shift+t', () => adjustWeight('thematic', 0.1))
  useHotkeys('shift+c', () => adjustWeight('contradiction', 0.1))
  useHotkeys('shift+s', () => adjustWeight('semantic', 0.1))
}
```

## Implementation Plan

### Phase 1: Core Reader (This Week)
- [ ] Markdown streaming from storage
- [ ] Basic highlighting with color coding
- [ ] Quick capture panel
- [ ] Annotation storage via ECS
- [ ] Simple connection sidebar

### Phase 2: Advanced Features (Next Week)
- [ ] Live weight tuning interface
- [ ] Connection filtering and grouping
- [ ] Keyboard navigation
- [ ] Annotation search and filters
- [ ] Export annotations

### Phase 3: Polish & Optimization
- [ ] Virtual scrolling for long documents
- [ ] Chunk prefetching
- [ ] Annotation conflict resolution
- [ ] Settings persistence
- [ ] Hotkey customization

## Technical Decisions

### Why Streaming from Storage?
- Markdown files can be large (10+ MB)
- Storage CDN is fast, database is for queries
- Enables progressive loading
- Preserves original formatting perfectly

### Why ECS for Annotations?
- Flexible schema evolution
- Can add new annotation types without migration
- Enables complex queries (annotations with sparks, etc)
- Clean separation of concerns

### Why Color-Coded Highlights?
- Visual semantic layer while reading
- Quick mental categorization
- Personal meaning system (green = agree, red = disagree)
- Enables quick filtering in annotation view

---

Ready to build a reader that aggressively surfaces connections while preserving reading flow.