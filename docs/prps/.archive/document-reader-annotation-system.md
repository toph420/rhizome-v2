# PRP: Document Reader & Annotation System

**Feature Name**: Document Reader with Inline Annotations & Weight Tuning Interface  
**Version**: 1.0.0  
**Status**: Ready for Implementation  
**Estimated Effort**: 1.5 weeks (Phase 1 + Weight Tuning)  
**Confidence Score**: 9/10 (all infrastructure exists, clear patterns to follow)

---

## Discovery Summary

### Initial Task Analysis

User provided comprehensive 890-line brainstorming document detailing a document reader with annotation system and connection synthesis weight tuning interface. The feature is split into phases:

- **Phase 1**: Core reader (markdown rendering, text selection, annotations, sidebar)
- **Weight Tuning**: Live engine weight interface for synthesis testing (critical addition)
- **Phase 2 Complete**: Keyboard navigation, export, search (deferred after synthesis validation)

**Scope Decision**: Implement Phase 1 + Weight Tuning (Option B from brainstorm) - provides critical synthesis testing infrastructure while shipping 0.9 weeks faster than complete Phase 2.

### User Clarifications Received

- **Question**: How should overlapping highlights on the same text render?
- **Answer**: Option B - Allow overlaps, render as stacked layers (simple CSS z-index)
- **Impact**: Simplifies data model (one range per annotation), rendering engine (CSS overlay), and performance (O(1) per annotation)

### Missing Requirements Identified

None - brainstorming document is exceptionally comprehensive. All other potential gaps (colors, flashcard conversion, search scope, export format) are explicitly addressed or deferred to later phases.

---

## Goal

Build a document reader with inline annotation system and live weight tuning interface to enable:

1. **Flow-state reading** with zero modal interruptions
2. **Quick annotation creation** (<3 seconds from selection to storage)
3. **Position-resilient annotations** that survive document re-processing (>70% confidence)
4. **Real-time synthesis weight tuning** for testing 7 connection engines
5. **Parallel development path** (reader polish + engine implementation simultaneously)

---

## Why

### Business Value

- **Synthesis Testing Infrastructure**: Weight tuning interface is critical for validating connection engines. Without it, testing requires manual SQL updates (terrible DX).
- **Connection Validation Workflow**: Users need to validate 50+ connections per chunk. Filtering by engine type and strength prevents UX disaster.
- **Parallel Development**: Mock connection data enables UI validation immediately, saving 2 weeks vs sequential approach.
- **Annotation Foundation**: Required for Phase 3 flashcard system and Phase 4 knowledge graph features.

### Integration with Existing Features

- **Document Processing Pipeline**: Chunks with embeddings already exist from 7-stage processing (PDFs, YouTube, web, markdown)
- **ECS Architecture**: Annotations follow same entity-component pattern as flashcards
- **Fuzzy Matching**: YouTube processing algorithm (88.52% coverage) reused for annotation positioning
- **UI Patterns**: ProcessingDock.tsx establishes no-modal panel architecture

### Problems This Solves

- **For Synthesis Testing**: Enables real-time weight adjustment, connection filtering, validation capture
- **For Reading**: Preserves flow state with inline annotations, no context switches
- **For Data Safety**: Fuzzy matching prevents annotation loss during document re-processing
- **For Scalability**: Connection filtering prevents UI overload with 50+ connections per chunk

---

## What

### User-Visible Behavior

**Reading Experience**:
1. User opens processed document → markdown renders with syntax highlighting + math
2. User selects text → Quick Capture panel appears (no modal, positioned below selection)
3. User presses hotkey (g/y/r/b/p) → highlight created with color, saved to database
4. User types note → attached to highlight, saved on blur
5. Highlights persist across sessions, survive document re-processing via fuzzy matching

**Connection Exploration**:
1. Right panel shows mock connections grouped by engine type (semantic, thematic, structural, etc.)
2. User adjusts engine weight sliders → connections re-rank in real-time (<100ms)
3. User disables engine → connections filtered out immediately
4. User validates connection (v key) → feedback captured for learning system
5. User clicks connection card → navigates to target chunk with highlight

**Weight Tuning Interface**:
- 7 engine weight sliders (0.0-1.0) with live preview
- Enable/disable toggles per engine
- Preset configurations (Max Friction, Thematic Focus, Balanced, Chaos)
- Strength threshold slider (hide weak connections <threshold)
- Real-time connection re-ranking (<100ms client-side)
- Visual feedback (connection cards re-sort with animation)

### Technical Requirements

**Performance**:
- Markdown streaming: <500ms first paint
- Annotation save: <200ms (Server Action timing)
- Weight re-ranking: <100ms (client-side sort)
- Fuzzy matching: >70% high-confidence (≥0.7) across document re-processing

**Data Integrity**:
- Annotations survive document re-processing (fuzzy matching with confidence scoring)
- Context windows (±5 words) stored for future re-calculation
- Confidence badges shown for <0.7 matches ("Position may have shifted")
- Graceful degradation to approximate positioning (confidence 0.3) if fuzzy matching fails

**Accessibility**:
- All actions keyboard-accessible (g/y/r/b/p for colors, v/r/s for validation)
- No modal interruptions (architectural requirement)
- Keyboard shortcuts help panel (? key)
- ARIA labels on all interactive elements

### Success Criteria

**Week 1 Acceptance Criteria**:
- [ ] Document renders markdown from Storage with signed URLs (<500ms first paint)
- [ ] Text selection shows Quick Capture panel with 5 color options
- [ ] Annotations save to ECS and persist across sessions
- [ ] Highlights render as CSS overlays over markdown
- [ ] Right panel displays mock connections (50 examples across 7 engines)
- [ ] Annotations maintain >70% high-confidence positioning across 10 test documents

**Week 2 Acceptance Criteria**:
- [ ] Weight tuning sliders re-rank connections in real-time (<100ms)
- [ ] Connection filtering by engine type works (collapsible sections)
- [ ] Validation capture stores feedback (v/r/s keys to localStorage)
- [ ] Strength threshold slider filters weak connections
- [ ] Preset configurations apply weights correctly
- [ ] Visual feedback on weight changes (cards re-sort with animation)

**Definition of Done**:
- [ ] All acceptance criteria met
- [ ] `npm run build` passes (TypeScript validation)
- [ ] `npm run lint` passes (JSDoc on all exported functions)
- [ ] Dogfooding test: Read 3 documents, create 10+ annotations, validate 20+ connections
- [ ] No P0/P1 blocking bugs
- [ ] Performance targets met (measured with performance.now())
- [ ] Code reviewed and documented

---

## All Needed Context

### Research Phase Summary

**Codebase patterns found**:
- ProcessingDock.tsx: Panel layout, real-time updates, Framer Motion animations
- ECS implementation (src/lib/ecs/ecs.ts): Component CRUD patterns
- Fuzzy matching (worker/lib/fuzzy-matching.ts): 3-tier positioning algorithm (88.52% coverage)
- Server Actions (src/app/actions/documents.ts): Mutation patterns
- Processing Store (src/stores/processing-store.ts): Zustand patterns
- Reader page (src/app/read/[id]/page.tsx): Markdown streaming with signed URLs

**External research needed**: **No**
- All UI components available (shadcn/ui + Radix)
- Text selection is standard Range API
- Markdown rendering is react-markdown (installed)
- Fuzzy matching algorithm exists and is tested
- ECS patterns established
- Only need to install 4 shadcn components: popover, hover-card, tooltip, scroll-area

**Knowledge gaps identified**: None - all infrastructure exists in codebase

### Documentation & References

```yaml
# MUST READ - Codebase Files

- file: /Users/topher/Code/rhizome-v2/src/components/layout/ProcessingDock.tsx
  why: Panel layout pattern (fixed positioning, collapse state, real-time updates)
  critical: Lines 111-156 show Supabase subscription + polling fallback pattern

- file: /Users/topher/Code/rhizome-v2/src/lib/ecs/ecs.ts
  why: Entity-Component-System for annotation storage
  critical: createEntity (lines 36-76), query (lines 88-137), updateComponent (lines 182-215)

- file: /Users/topher/Code/rhizome-v2/worker/lib/fuzzy-matching.ts
  why: Annotation positioning algorithm (3-tier: exact → fuzzy → approximate)
  critical: fuzzyMatchChunkToSource (lines 100-147), context extraction (lines 318-349)

- file: /Users/topher/Code/rhizome-v2/src/stores/processing-store.ts
  why: Zustand store pattern with CRUD operations
  critical: State management pattern (lines 37-77)

- file: /Users/topher/Code/rhizome-v2/src/app/read/[id]/page.tsx
  why: Document reader Server Component, signed URL generation
  critical: Signed URL pattern (lines 38-41), markdown streaming

- file: /Users/topher/Code/rhizome-v2/src/app/actions/documents.ts
  why: Server Action patterns for mutations
  critical: 'use server' directive, error handling (lines 51-193)

- file: /Users/topher/Code/rhizome-v2/docs/UI_PATTERNS.md
  why: UI architecture patterns (no-modal, panel layouts)
  critical: Right Panel (lines 749-810), Quick Capture (lines 822-942), Annotation Layer (lines 1228-1816)

- file: /Users/topher/Code/rhizome-v2/docs/rEACT_GUIDELINES.md
  why: Server vs Client Component rules, Server Action patterns
  critical: Server Component (lines 12-63), Server Action (lines 127-201), Storage rules (lines 204-233)

- file: /Users/topher/Code/rhizome-v2/supabase/migrations/012_youtube_position_context.sql
  why: position_context JSONB column schema
  critical: Context window structure for fuzzy matching

# External Documentation (Standard APIs)

- url: https://developer.mozilla.org/en-US/docs/Web/API/Selection
  why: Text selection API (getSelection(), getRangeAt())
  critical: getBoundingClientRect() for panel positioning

- url: https://developer.mozilla.org/en-US/docs/Web/API/Range
  why: Range API for precise text offsets
  critical: startOffset/endOffset for position tracking

- url: https://github.com/remarkjs/react-markdown
  why: Markdown rendering with custom components
  critical: Custom renderers for highlight overlays

- url: https://ui.shadcn.com/
  why: Component library documentation
  critical: Popover, HoverCard, Tooltip, ScrollArea, Tabs, Badge components
```

### Current Codebase Tree

```bash
rhizome-v2/
├── src/
│   ├── app/
│   │   ├── read/[id]/
│   │   │   └── page.tsx              # EXISTS - Document reader (needs enhancement)
│   │   ├── actions/
│   │   │   └── documents.ts          # EXISTS - Server Actions (reference pattern)
│   │   └── api/                      # API routes (not used - prefer Server Actions)
│   ├── components/
│   │   ├── layout/
│   │   │   └── ProcessingDock.tsx    # EXISTS - Panel pattern reference
│   │   ├── ui/                       # EXISTS - shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── badge.tsx
│   │   │   └── ... (22 components)
│   │   └── (no reader/ or sidebar/ dirs yet)
│   ├── lib/
│   │   ├── ecs/
│   │   │   └── ecs.ts                # EXISTS - Entity-Component-System
│   │   ├── supabase/
│   │   │   ├── client.ts             # EXISTS - Supabase client
│   │   │   └── admin.ts              # EXISTS - Admin client
│   │   └── utils.ts                  # EXISTS - Utilities
│   ├── stores/
│   │   └── processing-store.ts       # EXISTS - Zustand pattern reference
│   └── types/                        # EXISTS - TypeScript types
├── worker/
│   └── lib/
│       └── fuzzy-matching.ts         # EXISTS - Positioning algorithm
├── supabase/
│   └── migrations/
│       └── 012_youtube_position_context.sql  # EXISTS - position_context column
└── docs/
    ├── UI_PATTERNS.md                # EXISTS - UI architecture guide
    └── lib/
        └── REACT_GUIDELINES.md       # EXISTS - Component rules
```

### Desired Codebase Tree (Files to Add)

```bash
rhizome-v2/
├── src/
│   ├── app/
│   │   ├── read/[id]/
│   │   │   └── page.tsx              # ENHANCE - Add chunk query, annotation rendering
│   │   └── actions/
│   │       └── annotations.ts        # CREATE - Server Actions for annotation CRUD
│   ├── components/
│   │   ├── reader/                   # CREATE - Reader components
│   │   │   ├── DocumentViewer.tsx   # CREATE - Markdown renderer with highlights
│   │   │   ├── AnnotationLayer.tsx  # CREATE - Highlight overlay system
│   │   │   ├── QuickCapturePanel.tsx # CREATE - Text selection panel
│   │   │   └── ChunkWrapper.tsx     # CREATE - Chunk-level annotation wrapper
│   │   └── sidebar/                  # CREATE - Sidebar components
│   │       ├── RightPanel.tsx       # CREATE - Tabs container
│   │       ├── ConnectionsList.tsx  # CREATE - Mock connections display
│   │       ├── AnnotationsList.tsx  # CREATE - User annotations list
│   │       ├── WeightTuning.tsx     # CREATE - Engine weight sliders
│   │       └── ConnectionFilters.tsx # CREATE - Filtering UI
│   ├── lib/
│   │   └── annotations/              # CREATE - Annotation utilities
│   │       ├── text-range.ts        # CREATE - Selection API helpers
│   │       ├── fuzzy-restore.ts     # CREATE - Position restoration wrapper
│   │       └── storage.ts           # CREATE - ECS wrapper functions
│   ├── stores/
│   │   └── annotation-store.ts      # CREATE - Annotation client state
│   └── types/
│       └── annotations.ts            # CREATE - Annotation TypeScript interfaces
└── supabase/
    └── migrations/
        └── 013_annotation_components.sql  # CREATE - Component type validation
```

**File Responsibilities**:

1. **page.tsx** (ENHANCE): Server Component fetching document + chunks, passes to DocumentViewer
2. **annotations.ts** (CREATE): `createAnnotation()`, `updateAnnotation()`, `deleteAnnotation()` Server Actions
3. **DocumentViewer.tsx** (CREATE): react-markdown with custom renderers for highlights, handles text selection
4. **AnnotationLayer.tsx** (CREATE): Renders highlight overlays using CSS position absolute
5. **QuickCapturePanel.tsx** (CREATE): Popover-based panel, color picker, note input, creates annotations
6. **RightPanel.tsx** (CREATE): Tabs container (Connections/Annotations), collapsible, resizable
7. **ConnectionsList.tsx** (CREATE): Displays mock connections grouped by engine, handles navigation
8. **WeightTuning.tsx** (CREATE): Sliders + toggles + presets, re-ranks connections client-side
9. **text-range.ts** (CREATE): `captureSelection()`, `restoreRange()`, `extractContext()` helpers
10. **fuzzy-restore.ts** (CREATE): Wrapper around worker/lib/fuzzy-matching.ts for frontend use
11. **annotation-store.ts** (CREATE): Zustand store for active annotation, selected text, panel state

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: Next.js 15 App Router Patterns
// - Server Components are default (no 'use client')
// - Client Components need 'use client' at top
// - Server Actions need 'use server' at top
// - Can't pass functions as props from Server → Client Components

// CRITICAL: Supabase Storage Access
// - Use admin client for signed URLs (bypasses RLS)
// - Signed URLs expire (default 1 hour, use 3600)
// - Pattern: const { data } = await adminClient.storage.from('documents').createSignedUrl(path, 3600)

// CRITICAL: ECS Component Data
// - components.data is JSONB (flexible schema, application-level validation)
// - chunk_id and document_id are denormalized for performance (store in both component.data and component columns)
// - Always include source component: { chunk_id, document_id }

// CRITICAL: React 19 + Next.js 15
// - No useState for server data (use React Query)
// - No useEffect for fetching (use Server Components)
// - Server Actions auto-revalidate paths with revalidatePath()

// GOTCHA: Fuzzy Matching Performance
// - Trigram generation is O(n) where n = text length
// - Sliding window is O(n*m) where n = source length, m = chunk length
// - Dynamic stride optimization: 10% for <100 windows, 20% for >=100 windows
// - Early exit on >0.95 similarity (saves 50% comparisons)
// - Don't run on every keystroke (debounce to save on blur/submit)

// GOTCHA: Text Selection API
// - Selection persists across renders (must clear manually)
// - getRangeAt(0) throws if selection is collapsed
// - getBoundingClientRect() returns viewport coordinates (adjust for scroll)
// - Selection lost on DOM manipulation (must restore after render)

// GOTCHA: Overlapping Highlights
// - Confirmed approach: Allow overlaps, render as stacked layers (Option B)
// - Use z-index based on created_at timestamp
// - CSS: position: absolute, pointer-events: none on highlights
// - pointer-events: auto on highlight wrapper for click handling

// CRITICAL: No Modals Allowed
// - Use Popover for Quick Capture (non-blocking, positioned near selection)
// - Use Sheet for mobile only (slide-in drawer)
// - Use Tabs + ScrollArea for right panel (persistent, collapsible)
// - Command palette (⌘K) is allowed exception (cmdk component)

// CRITICAL: Mock Connection Data Structure
// - Must match real connections table schema exactly
// - Include all 7 engine types: semantic, thematic, structural, contradiction, emotional, methodological, temporal
// - Strength range: 0.3-1.0 (filter weak connections <0.3)
// - connection_type: 'supports', 'contradicts', 'extends', 'references', 'parallels', 'challenges'
```

---

## Implementation Blueprint

### Data Models and Structure

```typescript
// ============================================================================
// CORE TYPES - src/types/annotations.ts
// ============================================================================

/** Text selection from Range API */
export interface TextSelection {
  text: string
  range: {
    startOffset: number
    endOffset: number
    chunkId: string
  }
  rect: DOMRect  // For Quick Capture positioning
}

/** Annotation component data (stored in components.data JSONB) */
export interface AnnotationData {
  text: string
  note?: string
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple'
  range: {
    startOffset: number
    endOffset: number
    chunkId: string
  }
  textContext: {
    before: string   // ~5 words before (for fuzzy matching)
    content: string  // Selected text
    after: string    // ~5 words after (for fuzzy matching)
  }
}

/** Position component data (for fuzzy matching metadata) */
export interface PositionData {
  chunkId: string
  startOffset: number
  endOffset: number
  confidence: number  // 0.3-1.0
  method: 'exact' | 'fuzzy' | 'approximate'
  textContext: {
    before: string
    after: string
  }
}

/** Source component data (links to chunk/document) */
export interface SourceData {
  chunk_id: string
  document_id: string
}

/** Complete annotation entity (from ECS query) */
export interface StoredAnnotation {
  id: string  // Entity ID
  user_id: string
  created_at: string
  updated_at: string
  components: {
    annotation: AnnotationData
    position: PositionData
    source: SourceData
  }
}

/** Mock connection for weight tuning UI (Week 1) */
export interface MockConnection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  target_document_title: string
  target_snippet: string  // Preview text
  engine_type: 'semantic' | 'thematic' | 'structural' | 'contradiction' | 'emotional' | 'methodological' | 'temporal'
  connection_type: 'supports' | 'contradicts' | 'extends' | 'references' | 'parallels' | 'challenges'
  strength: number  // 0.3-1.0
  explanation: string  // Why these chunks connect
}

/** Engine weight configuration */
export interface EngineWeights {
  semantic: number
  thematic: number
  structural: number
  contradiction: number
  emotional: number
  methodological: number
  temporal: number
}

/** Weight tuning preset */
export type WeightPreset = 'max-friction' | 'thematic-focus' | 'balanced' | 'chaos'

/** Connection validation feedback */
export interface ConnectionFeedback {
  connection_id: string
  feedback_type: 'validate' | 'reject' | 'star'
  context: {
    time_of_day: string
    document_id: string
    mode: 'reading' | 'research' | 'synthesis'
  }
}

// ============================================================================
// ZUSTAND STORE - src/stores/annotation-store.ts
// ============================================================================

export interface AnnotationState {
  // Active annotation being edited
  activeAnnotation: StoredAnnotation | null
  setActiveAnnotation: (annotation: StoredAnnotation | null) => void
  
  // Text selection state
  selectedText: TextSelection | null
  setSelectedText: (selection: TextSelection | null) => void
  
  // Quick Capture panel state
  quickCaptureOpen: boolean
  openQuickCapture: () => void
  closeQuickCapture: () => void
  
  // Engine weights (for weight tuning)
  weights: EngineWeights
  setWeight: (engine: keyof EngineWeights, value: number) => void
  setWeights: (weights: EngineWeights) => void
  applyPreset: (preset: WeightPreset) => void
  
  // Connection filtering
  strengthThreshold: number
  setStrengthThreshold: (threshold: number) => void
  enabledEngines: Set<keyof EngineWeights>
  toggleEngine: (engine: keyof EngineWeights) => void
}
```

### List of Tasks (Ordered for Implementation)

```yaml
# ============================================================================
# WEEK 1: CORE READER FOUNDATION
# ============================================================================

Task 1: Install Missing ShadCN Components
INSTALL dependencies:
  - ADD: popover, hover-card, tooltip, scroll-area via shadcn CLI
  - COMMAND: npx shadcn@latest add popover hover-card tooltip scroll-area
  - VERIFY: Check src/components/ui/ for new components

Task 2: Create Annotation Types & Store
CREATE src/types/annotations.ts:
  - DEFINE: TextSelection, AnnotationData, PositionData, SourceData, StoredAnnotation
  - DEFINE: MockConnection, EngineWeights, WeightPreset, ConnectionFeedback
  - EXPORT: All interfaces

CREATE src/stores/annotation-store.ts:
  - PATTERN: Follow src/stores/processing-store.ts (Zustand with CRUD)
  - STATE: activeAnnotation, selectedText, quickCaptureOpen, weights, enabledEngines
  - ACTIONS: setActiveAnnotation, openQuickCapture, setWeight, toggleEngine
  - PRESETS: max-friction, thematic-focus, balanced, chaos weight configurations

Task 3: Create Text Range Utility Library
CREATE src/lib/annotations/text-range.ts:
  - FUNCTION: captureSelection() -> TextSelection | null
    - Use window.getSelection(), getRangeAt(0), getBoundingClientRect()
    - Extract text, offsets, chunkId from DOM
    - Return null if selection collapsed
  
  - FUNCTION: extractContext(fullText: string, start: number, end: number) -> { before, content, after }
    - Extract ±100 chars around selection
    - Split by whitespace, take last/first 5 words
    - Used for fuzzy matching context windows
  
  - FUNCTION: restoreRange(chunkElement: HTMLElement, start: number, end: number) -> Range | null
    - Create Range object from offsets
    - Handle text nodes traversal
    - Return null if offsets invalid

Task 4: Create Annotation Storage Server Actions
CREATE src/app/actions/annotations.ts:
  - DIRECTIVE: 'use server' at top
  - PATTERN: Follow src/app/actions/documents.ts error handling
  
  - FUNCTION: createAnnotation(data: { text, chunkId, documentId, startOffset, endOffset, color, note? })
    - VALIDATE: Input with Zod schema
    - GET: userId from getCurrentUser()
    - CREATE: Entity via ecs.createEntity(userId, { annotation, position, source })
    - REVALIDATE: revalidatePath(`/read/${documentId}`)
    - RETURN: { success: true, id: entityId } | { success: false, error }
  
  - FUNCTION: updateAnnotation(entityId: string, data: Partial<AnnotationData>)
    - GET: Entity via ecs.getEntity(entityId, userId)
    - UPDATE: Component via ecs.updateComponent(annotationComponentId, data, userId)
    - REVALIDATE: Path
    - RETURN: Success/error
  
  - FUNCTION: deleteAnnotation(entityId: string)
    - DELETE: Entity via ecs.deleteEntity(entityId, userId)
    - REVALIDATE: Path
    - RETURN: Success/error
  
  - FUNCTION: getAnnotations(documentId: string) -> StoredAnnotation[]
    - QUERY: ecs.query(['annotation', 'position', 'source'], userId, { document_id: documentId })
    - MAP: Results to StoredAnnotation interface
    - RETURN: Array of annotations

Task 5: Enhance Reader Page with Chunk Queries
MODIFY src/app/read/[id]/page.tsx:
  - KEEP: Existing signed URL generation pattern (lines 38-41)
  - ADD: Chunk query before returning component
    ```typescript
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, content, chunk_index, position_context, start_offset, end_offset')
      .eq('document_id', params.id)
      .order('chunk_index')
    ```
  - PASS: chunks prop to DocumentViewer component
  - ERROR: Handle missing chunks gracefully (show message)

Task 6: Create Document Viewer Component
CREATE src/components/reader/DocumentViewer.tsx:
  - DIRECTIVE: 'use client'
  - PATTERN: Use react-markdown with custom renderers
  
  - PROPS: { markdown: string, documentId: string, chunks: Chunk[], annotations: StoredAnnotation[] }
  
  - STATE: const [selectedText, setSelectedText] = useState<TextSelection | null>(null)
  
  - EFFECT: Load annotations on mount
    ```typescript
    useEffect(() => {
      const loadAnnotations = async () => {
        const data = await getAnnotations(documentId)
        setAnnotations(data)
      }
      loadAnnotations()
    }, [documentId])
    ```
  
  - HANDLER: handleMouseUp() -> Detect text selection
    - Call captureSelection() from text-range.ts
    - Update selectedText state
    - Open Quick Capture panel
  
  - RENDER: react-markdown with custom components
    ```typescript
    <ReactMarkdown
      components={{
        p: ({ children, ...props }) => (
          <ChunkWrapper chunkId={getCurrentChunk()}>
            <p {...props} onMouseUp={handleMouseUp}>
              {children}
            </p>
          </ChunkWrapper>
        ),
        // Custom renderers for code, math, etc.
      }}
    >
      {markdown}
    </ReactMarkdown>
    ```
  
  - CONDITIONAL: {selectedText && <QuickCapturePanel selection={selectedText} />}

Task 7: Create Quick Capture Panel Component
CREATE src/components/reader/QuickCapturePanel.tsx:
  - DIRECTIVE: 'use client'
  - PATTERN: Use Popover component, position near selection
  
  - PROPS: { selection: TextSelection, onClose: () => void }
  
  - STATE: const [note, setNote] = useState<string>('')
  - STATE: const [saving, setSaving] = useState<boolean>(false)
  
  - HANDLER: handleColorSelect(color: string)
    - Call createAnnotation Server Action
    - Show toast notification
    - Close panel on success
  
  - HANDLER: handleNoteSubmit()
    - Validate note not empty
    - Call createAnnotation with note
    - Close panel
  
  - RENDER: Popover positioned at selection.rect
    ```tsx
    <Popover open={true} onOpenChange={onClose}>
      <PopoverContent
        side="bottom"
        align="center"
        style={{
          position: 'absolute',
          top: selection.rect.bottom + 10,
          left: selection.rect.left + selection.rect.width / 2,
          transform: 'translateX(-50%)'
        }}
      >
        {/* Color buttons with hotkeys */}
        <div className="flex gap-2">
          <Button onClick={() => handleColorSelect('yellow')} shortcut="y">Yellow</Button>
          <Button onClick={() => handleColorSelect('green')} shortcut="g">Green</Button>
          {/* ... other colors */}
        </div>
        
        {/* Note input */}
        <Textarea
          placeholder="Add a note..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={handleNoteSubmit}
        />
      </PopoverContent>
    </Popover>
    ```
  
  - KEYBOARD: Add hotkey handlers (g/y/r/b/p) using useEffect + addEventListener

Task 8: Create Annotation Layer Component
CREATE src/components/reader/AnnotationLayer.tsx:
  - DIRECTIVE: 'use client'
  - PATTERN: Render highlights as CSS overlays with position absolute
  
  - PROPS: { annotations: StoredAnnotation[], chunkId: string }
  
  - FILTER: const chunkAnnotations = annotations.filter(a => a.components.source.chunk_id === chunkId)
  
  - RENDER: Map annotations to highlight overlays
    ```tsx
    {chunkAnnotations.map(annotation => {
      const { startOffset, endOffset } = annotation.components.position
      const { color } = annotation.components.annotation
      
      return (
        <HighlightOverlay
          key={annotation.id}
          startOffset={startOffset}
          endOffset={endOffset}
          color={color}
          zIndex={new Date(annotation.created_at).getTime()} // Timestamp for stacking
          onClick={() => handleAnnotationClick(annotation)}
        />
      )
    })}
    ```
  
  - COMPONENT: HighlightOverlay
    - Calculate position using Range API (getBoundingClientRect)
    - CSS: `position: absolute, background: ${color}-200/30, pointer-events: none`
    - Wrapper div: `pointer-events: auto` for click handling
  
  - HANDLER: handleAnnotationClick(annotation: StoredAnnotation)
    - Show annotation details in HoverCard
    - Provide edit/delete actions

Task 9: Create Chunk Wrapper Component
CREATE src/components/reader/ChunkWrapper.tsx:
  - DIRECTIVE: 'use client'
  - PURPOSE: Associate DOM elements with chunk IDs for text selection
  
  - PROPS: { chunkId: string, children: ReactNode }
  
  - RENDER: Wrapper div with data attribute
    ```tsx
    <div data-chunk-id={chunkId} className="relative">
      <AnnotationLayer annotations={annotations} chunkId={chunkId} />
      {children}
    </div>
    ```

Task 10: Create Right Panel Container
CREATE src/components/sidebar/RightPanel.tsx:
  - DIRECTIVE: 'use client'
  - PATTERN: Follow ProcessingDock.tsx collapse/expand pattern
  
  - STATE: const [collapsed, setCollapsed] = useState(false)
  - STATE: const [activeTab, setActiveTab] = useState<'connections' | 'annotations'>('connections')
  
  - RENDER: Fixed right panel with Tabs
    ```tsx
    <motion.div
      className="fixed right-0 top-0 bottom-0 border-l z-40 bg-background"
      animate={{ width: collapsed ? 48 : 384 }} // w-96 = 384px
      transition={{ type: 'spring', damping: 25 }}
    >
      {!collapsed && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="annotations">Annotations</TabsTrigger>
          </TabsList>
          
          <TabsContent value="connections">
            <ScrollArea className="h-full">
              <ConnectionsList />
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="annotations">
            <ScrollArea className="h-full">
              <AnnotationsList />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      )}
      
      <Button
        className="absolute -left-4 top-8"
        size="icon"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronLeft /> : <ChevronRight />}
      </Button>
    </motion.div>
    ```

Task 11: Create Mock Connection Dataset
CREATE src/lib/annotations/mock-connections.ts:
  - EXPORT: const MOCK_CONNECTIONS: MockConnection[] (50 examples)
  
  - STRUCTURE: 7 examples per engine type (semantic, thematic, structural, contradiction, emotional, methodological, temporal)
  
  - STRENGTH: Range 0.3-1.0 (distribute: 10 weak 0.3-0.5, 25 medium 0.5-0.7, 15 strong 0.7-1.0)
  
  - CONTENT: Realistic explanations, varied connection_type, diverse target snippets
  
  - EXAMPLE:
    ```typescript
    {
      id: 'mock-1',
      source_chunk_id: 'current',
      target_chunk_id: 'doc2-chunk5',
      target_document_title: 'The Structure of Scientific Revolutions',
      target_snippet: 'Paradigm shifts occur when anomalies accumulate...',
      engine_type: 'thematic',
      connection_type: 'parallels',
      strength: 0.87,
      explanation: 'Both discuss foundational changes in understanding'
    }
    ```

Task 12: Create Connections List Component
CREATE src/components/sidebar/ConnectionsList.tsx:
  - DIRECTIVE: 'use client'
  - PATTERN: Display mock connections grouped by engine
  
  - STATE: const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  
  - COMPUTED: Filter and re-rank connections
    ```typescript
    const filteredConnections = useMemo(() => {
      return MOCK_CONNECTIONS
        .filter(c => enabledEngines.has(c.engine_type))
        .filter(c => c.strength >= strengthThreshold)
        .map(c => ({
          ...c,
          weightedStrength: c.strength * weights[c.engine_type]
        }))
        .sort((a, b) => b.weightedStrength - a.weightedStrength)
    }, [weights, enabledEngines, strengthThreshold])
    ```
  
  - RENDER: Group by engine_type with collapsible sections
    ```tsx
    {Object.entries(groupByEngine(filteredConnections)).map(([engine, connections]) => (
      <CollapsibleSection key={engine} title={engineLabels[engine]} count={connections.length}>
        {connections.map(connection => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            onClick={() => handleNavigate(connection.target_chunk_id)}
          />
        ))}
      </CollapsibleSection>
    ))}
    ```
  
  - COMPONENT: ConnectionCard
    - Badge with engine_type color
    - Strength indicator (progress bar or color intensity)
    - Target snippet preview
    - Explanation tooltip
    - Validation buttons (v/r/s hotkeys)

# ============================================================================
# WEEK 2: WEIGHT TUNING & CONNECTION FILTERING
# ============================================================================

Task 13: Create Weight Tuning Component
CREATE src/components/sidebar/WeightTuning.tsx:
  - DIRECTIVE: 'use client'
  - PATTERN: Sliders with live preview
  
  - STATE: const { weights, setWeight, setWeights, applyPreset } = useAnnotationStore()
  
  - RENDER: 7 engine weight sliders
    ```tsx
    <div className="space-y-4 p-4">
      <h3>Engine Weights</h3>
      
      {Object.entries(weights).map(([engine, value]) => (
        <div key={engine} className="space-y-2">
          <div className="flex justify-between">
            <Label>{engineLabels[engine]}</Label>
            <span className="text-sm text-muted-foreground">{value.toFixed(2)}</span>
          </div>
          <Slider
            value={[value]}
            onValueChange={([newValue]) => setWeight(engine as keyof EngineWeights, newValue)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>
      ))}
      
      <Separator />
      
      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => applyPreset('max-friction')}>
            Max Friction
          </Button>
          <Button variant="outline" onClick={() => applyPreset('thematic-focus')}>
            Thematic Focus
          </Button>
          <Button variant="outline" onClick={() => applyPreset('balanced')}>
            Balanced
          </Button>
          <Button variant="outline" onClick={() => applyPreset('chaos')}>
            Chaos
          </Button>
        </div>
      </div>
    </div>
    ```
  
  - PRESETS: Define weight configurations
    ```typescript
    const presets: Record<WeightPreset, EngineWeights> = {
      'max-friction': { semantic: 0.3, thematic: 0.9, structural: 0.7, contradiction: 1.0, emotional: 0.4, methodological: 0.8, temporal: 0.2 },
      'thematic-focus': { semantic: 0.4, thematic: 1.0, structural: 0.5, contradiction: 0.6, emotional: 0.3, methodological: 0.7, temporal: 0.2 },
      'balanced': { semantic: 0.5, thematic: 0.5, structural: 0.5, contradiction: 0.5, emotional: 0.5, methodological: 0.5, temporal: 0.5 },
      'chaos': { semantic: 0.8, thematic: 0.8, structural: 0.8, contradiction: 0.8, emotional: 0.8, methodological: 0.8, temporal: 0.8 }
    }
    ```

Task 14: Create Connection Filters Component
CREATE src/components/sidebar/ConnectionFilters.tsx:
  - DIRECTIVE: 'use client'
  - PURPOSE: Engine toggles + strength threshold slider
  
  - STATE: const { enabledEngines, toggleEngine, strengthThreshold, setStrengthThreshold } = useAnnotationStore()
  
  - RENDER: Toggle buttons + threshold slider
    ```tsx
    <div className="space-y-4 p-4">
      <h3>Filter Connections</h3>
      
      <div className="space-y-2">
        <Label>Active Engines</Label>
        <div className="flex flex-wrap gap-2">
          {Object.keys(weights).map(engine => (
            <Badge
              key={engine}
              variant={enabledEngines.has(engine) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => toggleEngine(engine as keyof EngineWeights)}
            >
              {engineLabels[engine]}
            </Badge>
          ))}
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label>Strength Threshold</Label>
          <span className="text-sm text-muted-foreground">{strengthThreshold.toFixed(2)}</span>
        </div>
        <Slider
          value={[strengthThreshold]}
          onValueChange={([value]) => setStrengthThreshold(value)}
          min={0.3}
          max={1}
          step={0.05}
        />
      </div>
    </div>
    ```

Task 15: Implement Validation Capture
MODIFY src/components/sidebar/ConnectionCard.tsx:
  - ADD: Keyboard event handler for v/r/s keys
    ```typescript
    useEffect(() => {
      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'v') handleValidate()
        if (e.key === 'r') handleReject()
        if (e.key === 's') handleStar()
      }
      
      if (isActive) {
        window.addEventListener('keydown', handleKeyPress)
        return () => window.removeEventListener('keydown', handleKeyPress)
      }
    }, [isActive])
    ```
  
  - HANDLER: handleValidate() / handleReject() / handleStar()
    ```typescript
    const handleValidate = () => {
      const feedback: ConnectionFeedback = {
        connection_id: connection.id,
        feedback_type: 'validate',
        context: {
          time_of_day: new Date().toISOString(),
          document_id: documentId,
          mode: 'reading' // Infer from user activity
        }
      }
      
      // Store to localStorage for MVP (migrate to DB in Week 3)
      const existing = JSON.parse(localStorage.getItem('connection_feedback') || '[]')
      localStorage.setItem('connection_feedback', JSON.stringify([...existing, feedback]))
      
      // Show toast notification
      toast.success('Connection validated')
    }
    ```
  
  - UI: Show visual feedback (card border color change, checkmark icon)

Task 16: Add Keyboard Shortcuts Help Panel
CREATE src/components/reader/KeyboardHelp.tsx:
  - DIRECTIVE: 'use client'
  - TRIGGER: ? key opens help panel
  
  - RENDER: Dialog with keyboard shortcuts table
    ```tsx
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <ShortcutGroup title="Highlighting">
            <Shortcut keys="g">Green highlight</Shortcut>
            <Shortcut keys="y">Yellow highlight</Shortcut>
            <Shortcut keys="r">Red highlight</Shortcut>
            <Shortcut keys="b">Blue highlight</Shortcut>
            <Shortcut keys="p">Purple highlight</Shortcut>
          </ShortcutGroup>
          
          <ShortcutGroup title="Validation">
            <Shortcut keys="v">Validate connection</Shortcut>
            <Shortcut keys="r">Reject connection</Shortcut>
            <Shortcut keys="s">Star connection</Shortcut>
          </ShortcutGroup>
          
          <ShortcutGroup title="Navigation">
            <Shortcut keys="Escape">Close panels</Shortcut>
            <Shortcut keys="?">Show this help</Shortcut>
          </ShortcutGroup>
        </div>
      </DialogContent>
    </Dialog>
    ```

Task 17: Create Fuzzy Restore Wrapper
CREATE src/lib/annotations/fuzzy-restore.ts:
  - PURPOSE: Frontend wrapper around worker/lib/fuzzy-matching.ts
  
  - FUNCTION: restoreAnnotationPosition(annotation: StoredAnnotation, sourceMarkdown: string) -> PositionData
    ```typescript
    import { fuzzyMatchChunkToSource } from '../../../worker/lib/fuzzy-matching'
    
    export async function restoreAnnotationPosition(
      annotation: StoredAnnotation,
      sourceMarkdown: string
    ): Promise<PositionData> {
      const { text, textContext } = annotation.components.annotation
      const { startOffset, endOffset } = annotation.components.position
      
      // Try exact match first
      const exactIndex = sourceMarkdown.indexOf(text)
      if (exactIndex !== -1) {
        return {
          chunkId: annotation.components.source.chunk_id,
          startOffset: exactIndex,
          endOffset: exactIndex + text.length,
          confidence: 1.0,
          method: 'exact',
          textContext: {
            before: textContext.before,
            after: textContext.after
          }
        }
      }
      
      // Fallback to fuzzy matching
      const result = fuzzyMatchChunkToSource(
        text,
        sourceMarkdown,
        0, // chunkIndex not needed here
        1, // totalChunks not needed
        { trigramThreshold: 0.75 }
      )
      
      return {
        chunkId: annotation.components.source.chunk_id,
        startOffset: result.start_offset,
        endOffset: result.end_offset,
        confidence: result.confidence,
        method: result.method,
        textContext: result.position_context
      }
    }
    ```
  
  - FUNCTION: showConfidenceBadge(confidence: number) -> ReactNode
    ```typescript
    export function showConfidenceBadge(confidence: number): ReactNode {
      if (confidence >= 0.7) return null // No badge needed
      
      if (confidence >= 0.5) {
        return <Badge variant="outline">Position approximate</Badge>
      }
      
      return (
        <Badge variant="destructive">
          Position may have shifted - click to verify
        </Badge>
      )
    }
    ```

Task 18: Add Loading States & Error Handling
MODIFY src/components/reader/DocumentViewer.tsx:
  - ADD: Loading state for markdown fetch
    ```tsx
    {!markdown && <Skeleton className="h-screen" />}
    ```
  
  - ADD: Error boundary for annotation rendering
    ```tsx
    <ErrorBoundary
      fallback={<div>Failed to load annotations. <Button onClick={retry}>Retry</Button></div>}
    >
      <AnnotationLayer annotations={annotations} chunkId={chunkId} />
    </ErrorBoundary>
    ```
  
  - ADD: Toast notifications for annotation save errors
    ```typescript
    try {
      await createAnnotation(data)
      toast.success('Annotation saved')
    } catch (error) {
      toast.error('Failed to save annotation. Please try again.')
    }
    ```

Task 19: Performance Optimization - Connection Re-ranking
MODIFY src/components/sidebar/ConnectionsList.tsx:
  - OPTIMIZE: Memoize connection filtering/sorting
    ```typescript
    const filteredConnections = useMemo(() => {
      const startTime = performance.now()
      
      const result = MOCK_CONNECTIONS
        .filter(c => enabledEngines.has(c.engine_type))
        .filter(c => c.strength >= strengthThreshold)
        .map(c => ({
          ...c,
          weightedStrength: c.strength * weights[c.engine_type]
        }))
        .sort((a, b) => b.weightedStrength - a.weightedStrength)
      
      const duration = performance.now() - startTime
      if (duration > 100) {
        console.warn(`Connection re-ranking took ${duration}ms (target: <100ms)`)
      }
      
      return result
    }, [weights, enabledEngines, strengthThreshold])
    ```
  
  - ANIMATION: Add layout animation for card re-sorting
    ```tsx
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <ConnectionCard connection={connection} />
    </motion.div>
    ```

Task 20: Database Migration for Annotation Components
CREATE supabase/migrations/013_annotation_components.sql:
  - ADD: Component type validation (optional - JSONB is flexible by design)
    ```sql
    -- Add comment for documentation
    COMMENT ON COLUMN components.component_type IS 
      'Valid types: annotation, flashcard, study, source, position';
    
    -- Add indexes for annotation queries
    CREATE INDEX IF NOT EXISTS idx_components_annotation_type 
      ON components(component_type) 
      WHERE component_type = 'annotation';
    
    CREATE INDEX IF NOT EXISTS idx_components_position_type 
      ON components(component_type) 
      WHERE component_type = 'position';
    
    -- Add index for document-level annotation queries
    CREATE INDEX IF NOT EXISTS idx_components_document_annotation 
      ON components(document_id, component_type) 
      WHERE component_type IN ('annotation', 'position');
    ```

Task 21: Integration Testing Checklist
CREATE tests/integration/annotation-flow.test.ts:
  - TEST: Full flow: select text → create annotation → persist → render
  - TEST: Fuzzy matching maintains >70% confidence across re-processing
  - TEST: Weight tuning re-ranks connections in <100ms
  - TEST: Validation capture stores to localStorage
  - SKIP: Component unit tests (focus on critical path only)

Task 22: Performance Benchmarking
CREATE scripts/benchmark-annotations.ts:
  - MEASURE: First paint time (<500ms target)
    ```typescript
    const start = performance.now()
    // Render DocumentViewer
    const paintTime = performance.now() - start
    console.log(`First paint: ${paintTime}ms (target: <500ms)`)
    ```
  
  - MEASURE: Annotation save time (<200ms target)
    ```typescript
    const start = performance.now()
    await createAnnotation(data)
    const saveTime = performance.now() - start
    console.log(`Save time: ${saveTime}ms (target: <200ms)`)
    ```
  
  - MEASURE: Weight re-ranking time (<100ms target)
    ```typescript
    const start = performance.now()
    const filtered = filterAndRankConnections(connections, weights)
    const rankTime = performance.now() - start
    console.log(`Re-ranking: ${rankTime}ms (target: <100ms)`)
    ```

Task 23: Dogfooding Test Plan
CREATE docs/testing/annotation-dogfooding.md:
  - DOCUMENT: Test protocol for Week 2 Day 7
  - CHECKLIST:
    - [ ] Read 3 full documents (PDF, YouTube, Web) with annotations
    - [ ] Create 10+ annotations with different colors and notes
    - [ ] Validate 20+ mock connections with v/r/s keys
    - [ ] Adjust engine weights and observe connection re-ranking
    - [ ] Apply all 4 presets and verify behavior
    - [ ] Test keyboard shortcuts (g/y/r/b/p for highlights, ? for help)
    - [ ] Verify flow state preserved (no modal interruptions)
    - [ ] Document any UX friction points for Phase 2

Task 24: Final Polish & Bug Fixes
REVIEW all components:
  - FIX: Any P0/P1 blocking bugs discovered during dogfooding
  - POLISH: Loading states, error messages, empty states
  - VERIFY: JSDoc on all exported functions (eslint requirement)
  - VERIFY: TypeScript strict mode passes (npm run build)
  - VERIFY: No console errors in browser
  - VERIFY: Accessibility (keyboard navigation, ARIA labels)
  - VERIFY: Mobile responsiveness (defer full mobile to Phase 4, but test tablet)
```

### Integration Points

```yaml
# Backend Integration Points
DATABASE:
  - migration: supabase/migrations/013_annotation_components.sql
  - indexes: component_type, document_id + component_type (for fast annotation queries)
  - schema: No changes (JSONB is flexible, application-level validation)

ECS:
  - createEntity: src/lib/ecs/ecs.ts (lines 36-76)
  - query: src/lib/ecs/ecs.ts (lines 88-137)
  - updateComponent: src/lib/ecs/ecs.ts (lines 182-215)
  - deleteEntity: src/lib/ecs/ecs.ts (lines 222-232)

STORAGE:
  - signed URLs: src/app/read/[id]/page.tsx (lines 38-41)
  - pattern: adminClient.storage.from('documents').createSignedUrl(path, 3600)

FUZZY_MATCHING:
  - algorithm: worker/lib/fuzzy-matching.ts (lines 100-147)
  - wrapper: src/lib/annotations/fuzzy-restore.ts (create new)
  - context: worker/lib/fuzzy-matching.ts (lines 318-349)

# Frontend Integration Points
ROUTING:
  - reader page: src/app/read/[id]/page.tsx (enhance existing)
  - no new routes needed

STATE_MANAGEMENT:
  - Zustand: src/stores/annotation-store.ts (create new)
  - pattern: src/stores/processing-store.ts (reference)
  - React Query: Not used in MVP (may add for server state in Phase 2)

COMPONENTS:
  - shadcn/ui: src/components/ui/ (22 components exist)
  - add: popover, hover-card, tooltip, scroll-area (npx shadcn@latest add ...)
  - register: No registry needed (direct imports)

ANIMATIONS:
  - Framer Motion: Already installed (^11.18.2)
  - pattern: src/components/layout/ProcessingDock.tsx (lines 111-156)
  - use: Spring animations (damping: 25), layout animations for re-sorting

STYLES:
  - Tailwind: Already configured (v4)
  - pattern: Use existing utility classes
  - colors: bg-yellow-200/30, bg-green-200/30, etc. (30% opacity for highlights)
```

---

## Validation Loop

### Level 1: Syntax & Style

```bash
# Run FIRST after each task - fix errors before proceeding

# TypeScript type checking
npm run build
# Expected: No type errors

# Linting (JSDoc validation)
npm run lint
# Expected: No linting errors, all exported functions have JSDoc

# Auto-fix formatting issues
npm run lint -- --fix
```

### Level 2: Unit Tests (Critical Path Only)

```bash
# Run after Week 1 Day 5 (annotation storage complete)
npm test src/app/actions/__tests__/annotations.test.ts

# Run after Week 1 Day 7 (annotation rendering complete)
npm test src/components/reader/__tests__/AnnotationLayer.test.ts

# Run after Week 2 Day 3 (weight tuning complete)
npm test src/components/sidebar/__tests__/WeightTuning.test.ts

# Expected: All tests pass, >80% coverage on critical paths
```

### Level 3: Performance Benchmarks

```bash
# Run after Week 1 Day 2 (markdown rendering complete)
# Measure: First paint time
# Open DevTools → Performance → Record → Load /read/[id]
# Expected: DOMContentLoaded < 500ms

# Run after Week 1 Day 5 (annotation save complete)
# Measure: createAnnotation() duration
# Add: performance.now() logging in Server Action
# Expected: Save time < 200ms

# Run after Week 2 Day 1 (weight tuning complete)
# Measure: Connection re-ranking time
# Add: performance.now() logging in ConnectionsList.tsx
# Expected: Re-ranking < 100ms

# Run after Week 2 Day 5 (fuzzy matching integrated)
# Measure: Annotation positioning confidence
# Query: SELECT (position_context->>'confidence')::float FROM components WHERE component_type='position'
# Expected: >70% have confidence >= 0.7
```

### Level 4: Dogfooding Test (Week 2 Day 7)

```bash
# Manual testing protocol (docs/testing/annotation-dogfooding.md)

# Test 1: Read 3 documents with annotations
# - PDF: Technical paper with math equations
# - YouTube: 30-minute video with AI-cleaned transcript
# - Web: News article with images

# Test 2: Create 10+ annotations
# - Use all 5 colors (green/yellow/red/blue/purple)
# - Add notes to 5 annotations
# - Verify persistence across browser refresh

# Test 3: Validate 20+ mock connections
# - Press v/r/s keys on different connections
# - Verify feedback stored to localStorage
# - Check toast notifications appear

# Test 4: Weight tuning
# - Adjust all 7 engine weights (0.0-1.0 range)
# - Apply 4 presets (Max Friction, Thematic Focus, Balanced, Chaos)
# - Verify connections re-rank in real-time (<100ms)
# - Verify visual feedback (cards re-sort with animation)

# Test 5: Connection filtering
# - Disable 3 engines, verify connections filtered
# - Adjust strength threshold (0.3-1.0), verify weak connections hidden
# - Verify collapsible sections work per engine

# Test 6: Keyboard shortcuts
# - Press g/y/r/b/p during text selection
# - Press ? to show help panel
# - Press Escape to close panels

# Success Criteria:
# - Flow state preserved (no modal interruptions)
# - Annotation save < 3 seconds (selection → storage)
# - Weight re-ranking feels instant (<100ms)
# - No blocking bugs (P0/P1)
```

---

## Final Validation Checklist

- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run build`
- [ ] First paint < 500ms (measured with DevTools)
- [ ] Annotation save < 200ms (measured with performance.now())
- [ ] Weight re-ranking < 100ms (measured with performance.now())
- [ ] Fuzzy matching >70% confidence (SQL query on position_context)
- [ ] Dogfooding test completed (3 documents, 10+ annotations, 20+ validations)
- [ ] No P0/P1 bugs in GitHub issues
- [ ] JSDoc on all exported functions
- [ ] Keyboard shortcuts work (g/y/r/b/p, v/r/s, ?, Escape)
- [ ] No modal interruptions (architectural requirement validated)
- [ ] Mock connection dataset realistic (50 examples across 7 engines)
- [ ] Code reviewed and approved

---

## Anti-Patterns to Avoid

### Architecture Anti-Patterns

- ❌ **Don't use modal dialogs** - Use panels, popovers, sheets (mobile only)
  - Violation example: `<Dialog>` for annotation details
  - Correct: `<Popover>` or `<HoverCard>` for inline display

- ❌ **Don't store markdown in database** - Use Supabase Storage
  - Violation example: Saving annotation text in components.data as full markdown
  - Correct: Store annotation metadata, reference chunks, stream markdown from Storage

- ❌ **Don't create new ECS patterns** - Follow existing flashcard patterns
  - Violation example: Custom annotation table outside ECS
  - Correct: Use entities + components tables with JSONB data

- ❌ **Don't bypass Server Actions** - Use Server Actions for all mutations
  - Violation example: API routes for annotation CRUD
  - Correct: Server Actions in src/app/actions/annotations.ts

### Performance Anti-Patterns

- ❌ **Don't run fuzzy matching on every keystroke** - Debounce to save/blur
  - Violation example: onChange handler calling fuzzy matching
  - Correct: onBlur or explicit save button

- ❌ **Don't re-rank connections on every weight change** - Use useMemo
  - Violation example: Filtering connections in render function without memoization
  - Correct: useMemo with weights as dependency

- ❌ **Don't query database for every chunk** - Batch load annotations on mount
  - Violation example: useEffect per chunk querying annotations
  - Correct: Load all document annotations once, filter client-side

### React Anti-Patterns

- ❌ **Don't use useState for server data** - Use React Query or Server Components
  - Violation example: `useState` for annotations loaded from database
  - Correct: Server Component fetches annotations, passes as props

- ❌ **Don't use useEffect for fetching** - Use Server Components
  - Violation example: useEffect(() => { fetch('/api/annotations') }, [])
  - Correct: Server Component async function fetches data

- ❌ **Don't forget 'use client' directive** - Add when needed
  - Violation example: Component with onClick missing 'use client'
  - Correct: 'use client' at top of file for interactive components

### Security Anti-Patterns

- ❌ **Don't skip input validation** - Validate in Server Actions
  - Violation example: Directly inserting user input without Zod validation
  - Correct: Zod schema validation before database insert

- ❌ **Don't expose service role key** - Use admin client server-side only
  - Violation example: Service role key in client-side code
  - Correct: Admin client in Server Components/Actions only

### UI/UX Anti-Patterns

- ❌ **Don't block reading with overlays** - Use non-blocking panels
  - Violation example: Full-screen overlay for annotation details
  - Correct: Side panel or inline popover

- ❌ **Don't hide keyboard shortcuts** - Show help panel (? key)
  - Violation example: Hotkeys work but no documentation
  - Correct: Help panel with all shortcuts listed

- ❌ **Don't ignore accessibility** - Add ARIA labels, keyboard nav
  - Violation example: Click-only buttons without keyboard alternatives
  - Correct: All actions keyboard-accessible

---

`★ Insight ─────────────────────────────────────`

**Key Architectural Strengths:**
1. **Complete Infrastructure**: All patterns exist in codebase (ProcessingDock.tsx, ECS, fuzzy matching). No external research needed saves 2+ days.
2. **Mock-First Approach**: Mock connection data enables parallel UI development while engines are built. Reduces risk and accelerates iteration.
3. **Fuzzy Matching Reuse**: YouTube processing algorithm (88.52% coverage) solves annotation positioning. Tested, battle-hardened code prevents reinventing the wheel.
4. **Weight Tuning Criticality**: Real-time synthesis testing interface is non-negotiable. Without it, testing requires manual SQL (terrible DX). +0.5 weeks for this feature pays for itself in faster iteration.
5. **No-Modal Discipline**: Architectural constraint forces creative solutions (popovers, panels, overlays) that actually preserve flow state better than traditional modals.

`─────────────────────────────────────────────────`

---

## PRP Quality Self-Assessment

**Confidence Score**: 9/10 for one-pass implementation

**Strengths**:
- ✅ All infrastructure exists (concrete file paths provided)
- ✅ Clear pseudocode with pattern references
- ✅ Executable validation gates with measurable targets
- ✅ Risk mitigation strategies documented
- ✅ Mock-first approach reduces integration risk
- ✅ Performance benchmarks defined (<500ms, <200ms, <100ms)
- ✅ Dogfooding protocol ensures real-world validation

**Potential Risks** (-1 point):
- ⚠️ react-markdown may need custom renderers (medium complexity, 2-day migration path to MDX if needed)
- ⚠️ Weight re-ranking performance unknown until tested (fallback: Web Workers or 500ms debounce)
- ⚠️ Mock connection data may not match real engine output (mitigation: schema matches connections table exactly)

**Mitigation Strategies**:
- Test react-markdown with custom renderers on Day 2 (block if insufficient, migrate to MDX)
- Benchmark weight re-ranking with 100+ connections on Week 2 Day 1 (add Web Workers if >100ms)
- Validate mock schema against real connections table on Week 1 Day 6 (adjust if misalignment found)

---

## Next Steps

1. **Install shadcn components**: `npx shadcn@latest add popover hover-card tooltip scroll-area`
2. **Create feature branch**: `git checkout -b feature/document-reader-phase1`
3. **Start with Task 1**: Create annotation types and store (foundation for all other work)
4. **Validate early**: Run `npm run build` after every 2-3 tasks to catch type errors
5. **Benchmark continuously**: Add performance.now() logging from Day 1 to track progress against targets

---

**Task Breakdown Document**: See `docs/tasks/document-reader-annotation-system.md` for detailed WBS with acceptance criteria and dependencies.

**Reference**: Original brainstorming document at `docs/brainstorming/2025-09-28-document-reader-annotation-system.md`