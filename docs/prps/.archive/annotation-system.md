# PRP: Complete Annotation System with Resizable Highlights

## Discovery Summary

### Initial Task Analysis

Implement a complete annotation system for the document reader enabling users to highlight text, add notes/tags, and resize highlights by dragging edges. System must support annotations spanning multiple chunks (up to 5), work on iPad with touch, and maintain dual storage (portable JSON + queryable database).

### User Clarifications Received

**Priority 1: Storage Strategy**
- **Question**: Where should portable annotations.json be stored?
- **Answer**: Supabase Storage at `{userId}/{documentId}/annotations.json` (Option A)
- **Impact**: Consistent with existing markdown storage pattern, simple export flow, no local sync complexity

**Priority 2: Error Handling**
- **Question**: How to handle annotation save failures?
- **Answer**: Queue with retry + visual indicator (Option A)
- **Impact**: Data loss prevention with yellow "draft" badge, retry on next page load

**Priority 3: Multi-tab Behavior**
- **Question**: How should annotations sync across tabs?
- **Answer**: Last-write-wins, no conflict detection (Option A)
- **Impact**: Simplest implementation, acceptable for single-user tool

**Priority 4: Loading Behavior**
- **Question**: How should annotations appear during loading?
- **Answer**: Progressive loading (Option A)
- **Impact**: Show document immediately, inject highlights as they load

**Priority 5: Connection Integration**
- **Question**: Should connection panel react to annotations?
- **Answer**: No integration initially (Option A)
- **Impact**: Ship core system first, defer connection triggers to Phase 6

### Missing Requirements Identified

None - all critical business logic decisions were clarified through discovery questions.

## Goal

Build a production-ready annotation system that:
1. Allows users to select text and create color-coded highlights with optional notes/tags
2. Supports resizing highlights by dragging edges (mouse + touch)
3. Works seamlessly with multi-chunk text selections (up to 5 chunks)
4. Maintains annotations in both portable JSON format and queryable ECS database
5. Provides visual feedback during resize operations
6. Integrates with existing virtual scrolling and block-based rendering

## Why

- **User Value**: Enable active reading with persistent highlights and notes
- **Knowledge Synthesis**: Annotations create connection points between ideas across documents
- **Data Portability**: JSON export enables backup and migration
- **Integration**: ChunkRef system enables connection discovery for annotated text
- **Platform Support**: iPad touch support enables mobile reading workflows

## What

### User-Visible Behavior

1. **Text Selection Flow**
   - User selects text in document
   - QuickCapture toolbar appears at bottom with color picker, note field, tag input
   - User chooses color, optionally adds note/tags
   - Click "Save" → highlight appears inline with chosen color
   - Selection spanning 3+ chunks shows "Spans N chunks" indicator

2. **Resize Flow**
   - User hovers near highlight edge → cursor changes to col-resize
   - User drags edge → visual preview shows new selection range
   - Release → highlight updates to new boundaries
   - ChunkRef automatically recalculates spanned chunks
   - Max 5 chunks enforced (drag prevented beyond limit)

3. **Visual Design**
   - 7 colors: yellow, green, blue, red, purple, orange, pink
   - Semi-transparent backgrounds (30% opacity, 20% in dark mode)
   - 8px edge detection zones for resize handles
   - Blue ring during resize preview
   - Yellow "draft" badge for unsaved annotations

4. **iPad Touch Support**
   - Long-press near highlight edge to start resize
   - Drag with touch to resize
   - Same visual feedback as desktop

### Technical Requirements

1. **Global Markdown Offsets**: All positions tracked as character offsets in full markdown
2. **Multi-Chunk ChunkRef**: Track all chunks annotation spans (chunkIds array)
3. **Dual Storage**: Write to both annotations.json (Supabase Storage) and ECS database
4. **Block-Based Injection**: Inject `<mark>` tags during block parsing
5. **Word Boundary Snapping**: Trim whitespace, prevent mid-word highlights
6. **Progressive Loading**: Document renders before annotations load
7. **Retry Queue**: Failed saves queued in memory + localStorage backup

### Success Criteria

- [ ] Can create highlight spanning 1-5 chunks with color/note/tags
- [ ] Can resize highlight by dragging edges (mouse + touch)
- [ ] ChunkRef automatically updates when resize crosses chunk boundary
- [ ] Annotations persist across page reloads
- [ ] annotations.json and database stay in sync
- [ ] 60fps scrolling with 100+ annotations
- [ ] Works on iPad Safari with touch events
- [ ] Failed saves show yellow badge and retry on next load
- [ ] All tests pass, no linting errors, no type errors

## All Needed Context

### Research Phase Summary

**Codebase patterns found:**
- ✅ Complete ECS implementation with 5-component annotation system (`src/lib/ecs/`)
- ✅ Existing annotation operations with Position/Visual/Content/Temporal/ChunkRef components
- ✅ Block parser with offset tracking (`src/lib/reader/block-parser.ts`)
- ✅ Supabase Storage patterns for file operations
- ✅ Fixed UI patterns (ProcessingDock for bottom toolbar)
- ✅ Virtual scrolling with React Virtuoso
- ✅ Server Action patterns with Zod validation
- ✅ shadcn/ui component usage (Button, Input, Badge, Textarea)

**External research needed:** No
- DOM Range/Selection APIs are standard browser APIs
- Touch event abstraction is straightforward (clientX/clientY pattern)
- Implementation plan document contains proven Range API patterns
- All architectural patterns exist in codebase

**Knowledge gaps identified:** None - all patterns available in codebase or implementation plan

### Documentation & References

```yaml
# MUST READ - Include these in your context window

- file: src/lib/ecs/ecs.ts
  why: ECS entity/component creation patterns, query patterns, update patterns

- file: src/lib/ecs/components.ts
  why: Existing component type definitions (Position, Visual, Content, Temporal, ChunkRef)

- file: src/lib/ecs/annotations.ts
  why: 5-component annotation structure, AnnotationOperations class patterns

- file: src/app/actions/annotations.ts
  why: Server Action patterns, Zod validation, error handling, revalidatePath usage

- file: src/lib/reader/block-parser.ts
  why: Block parsing logic, offset tracking, chunk mapping, binary search pattern

- file: src/components/reader/VirtualizedReader.tsx
  why: Virtuoso configuration, block rendering, chunk visibility tracking

- file: src/components/reader/ReaderLayout.tsx
  why: Layout coordination between reader and panels

- file: src/components/layout/ProcessingDock.tsx
  why: Fixed bottom UI pattern, persistent docks

- file: src/lib/auth/index.ts
  why: getCurrentUser() pattern for user context

- file: docs/todo/complete-annotation-system.md
  why: Complete implementation plan with Range API patterns, resize logic, code examples

- file: supabase/migrations/
  why: Database schema patterns, component table structure, indexing patterns
```

### Current Codebase Structure

```bash
src/
├── app/
│   ├── actions/
│   │   └── annotations.ts        # Existing server actions (3-component pattern)
│   └── read/[id]/
│       └── page.tsx              # Reader page
├── components/
│   ├── reader/
│   │   ├── VirtualizedReader.tsx # Main reader with Virtuoso
│   │   ├── DocumentViewer.tsx    # Document viewer wrapper
│   │   └── ReaderLayout.tsx      # Layout coordinator
│   ├── layout/
│   │   └── ProcessingDock.tsx    # Fixed bottom dock pattern
│   ├── sidebar/
│   │   └── ConnectionsList.tsx   # Right panel connections
│   └── ui/                        # shadcn/ui components
├── lib/
│   ├── ecs/
│   │   ├── ecs.ts                # ECS core implementation
│   │   ├── components.ts         # Component type definitions
│   │   └── annotations.ts        # Annotation operations (5-component)
│   ├── reader/
│   │   └── block-parser.ts       # Block parsing with offsets
│   ├── auth/
│   │   └── index.ts              # getCurrentUser()
│   └── supabase/
│       ├── client.ts             # Browser client
│       └── server.ts             # Server client
└── types/
    └── annotations.ts            # Annotation type definitions

supabase/
└── migrations/
    └── [timestamps]_*.sql        # Database schema
```

### Desired Codebase Structure (Files to Add)

```bash
src/
├── lib/
│   └── reader/
│       ├── highlight-injector.ts    # Inject <mark> tags into blocks
│       ├── chunk-utils.ts           # findSpannedChunks, createChunkRef
│       ├── resize-detection.ts      # detectResizeHandle (8px edge)
│       └── offset-calculator.ts     # calculateOffsetsFromRange, snapToWordBoundaries
├── hooks/
│   ├── useHighlightResize.ts        # Resize logic with touch support
│   ├── useTextSelection.ts          # Selection → offsets + ChunkRef
│   └── useAnnotations.ts            # CRUD operations with retry queue
├── components/
│   └── reader/
│       ├── QuickCapture.tsx         # Bottom toolbar for creation
│       ├── BlockRenderer.tsx        # Render blocks with sanitized HTML
│       └── ColorPicker.tsx          # 7-color inline picker
└── app/
    ├── actions/
    │   └── annotations.ts           # UPDATE to 5-component pattern
    └── globals.css                  # ADD highlight CSS

supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_annotation_system.sql  # Indexes for Position/ChunkRef
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: ECS has TWO annotation patterns in codebase
// ❌ OLD: src/app/actions/annotations.ts uses 3 components (annotation, position, source)
// ✅ NEW: src/lib/ecs/annotations.ts uses 5 components (Position, Visual, Content, Temporal, ChunkRef)
// → Follow the 5-component pattern, update server actions

// CRITICAL: Denormalized fields required for ECS querying
// Components MUST include chunk_id and document_id directly
const component = {
  entity_id: entityId,
  component_type: 'Position',
  data: { startOffset: 100, endOffset: 200, documentId: 'doc_123' },
  chunk_id: 'ch_42',      // ← Required for filtering
  document_id: 'doc_123'  // ← Required for filtering
}

// CRITICAL: Data attributes for colors (not dynamic classes)
// ✅ Use data-color="yellow" with CSS targeting [data-color="yellow"]
// ❌ Don't use dynamic Tailwind classes (safelist issues)
<mark data-color="yellow" data-annotation-id={id}>text</mark>

// CRITICAL: Touch events need { passive: false } for preventDefault
element.addEventListener('touchstart', handler, { passive: false })
element.addEventListener('touchmove', handler, { passive: false })

// CRITICAL: Range API patterns from implementation plan
const beforeRange = range.cloneRange()
beforeRange.selectNodeContents(blockEl)
beforeRange.setEnd(range.startContainer, range.startOffset)
const offset = beforeRange.toString().length  // ← Proven pattern

// CRITICAL: Virtual scrolling with Virtuoso
// Blocks are rendered on-demand, annotations must integrate with itemContent callback
<Virtuoso
  data={blocks}
  itemContent={(index, block) => <BlockRenderer block={block} annotations={annotations} />}
  overscan={2000}  // ← Existing overscan for performance
/>

// CRITICAL: Supabase Storage path pattern
const path = `${userId}/${documentId}/annotations.json`
// Must match existing markdown pattern: {userId}/{documentId}/content.md

// CRITICAL: Auth pattern for server actions
const user = await getCurrentUser()  // From @/lib/auth
// Never hardcode user ID, always use getCurrentUser()

// CRITICAL: Server Action return format
return { success: true, id: entityId }        // ← Success
return { success: false, error: 'message' }   // ← Error
// All server actions follow this pattern

// GOTCHA: React 19 requires stable references for useEffect deps
// Use useCallback for event handlers passed as dependencies
const handleResize = useCallback(() => { /* ... */ }, [deps])
useEffect(() => {
  element.addEventListener('mousedown', handleResize)
  return () => element.removeEventListener('mousedown', handleResize)
}, [handleResize])  // ← Stable reference required

// GOTCHA: DOMPurify sanitization for block HTML
// MUST allow <mark> tag for highlights
const cleanHtml = DOMPurify.sanitize(html, {
  ALLOWED_TAGS: [...existingTags, 'mark'],
  ALLOWED_ATTR: [...existingAttrs, 'data-annotation-id', 'data-color']
})

// GOTCHA: Progressive loading pattern
// First render: parseMarkdownToBlocks(markdown, chunks, [])  ← Empty annotations
// Second render: parseMarkdownToBlocks(markdown, chunks, loadedAnnotations)
// React automatically re-renders when annotations load
```

## Implementation Blueprint

### Data Models and Structure

```typescript
// src/lib/ecs/components.ts - ADD these interfaces

export interface ChunkRefComponent {
  chunkIds: string[]          // ALL chunks this annotation spans
  chunk_id: string            // Primary chunk (ECS compatibility)
  primaryChunkId: string      // Where annotation starts
  chunkPositions: number[]    // Chunk indices for ordering
}

export interface PositionComponent {
  documentId: string
  document_id: string         // Denormalized for queries
  startOffset: number         // Global markdown offset
  endOffset: number           // Global markdown offset
  originalText: string        // Captured text at creation
  pageLabel?: string          // PDF page reference (optional)
}

export interface VisualComponent {
  type: 'highlight' | 'underline' | 'margin-note' | 'comment'
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
}

export interface ContentComponent {
  note?: string               // User's annotation note
  tags: string[]              // User-defined tags
}

export interface TemporalComponent {
  createdAt: string           // ISO timestamp
  updatedAt: string           // ISO timestamp
  lastViewedAt?: string       // ISO timestamp
}

export interface AnnotationEntity {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  components: {
    Position: PositionComponent
    Visual: VisualComponent
    Content: ContentComponent
    Temporal: TemporalComponent
    ChunkRef: ChunkRefComponent
  }
}

// src/lib/reader/block-parser.ts - EXISTING Block interface (reference only)
export interface Block {
  id: string
  type: 'heading' | 'paragraph' | 'code' | 'blockquote' | 'list' | 'table'
  level?: number
  html: string
  startOffset: number
  endOffset: number
  chunkId: string
  chunkPosition: number
}

// src/types/annotations.ts - ADD Chunk interface
export interface Chunk {
  id: string
  document_id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
  summary?: string
  themes?: string[]
  importance_score?: number
}

// src/hooks/useAnnotations.ts - ADD retry queue types
interface PendingSave {
  id: string
  input: CreateAnnotationInput
  retryCount: number
  timestamp: number
}

interface CreateAnnotationInput {
  documentId: string
  startOffset: number
  endOffset: number
  originalText: string
  chunkRef: ChunkRefComponent
  type: VisualComponent['type']
  color?: VisualComponent['color']
  note?: string
  tags?: string[]
  pageLabel?: string
}
```

### List of Tasks (In Order)

```yaml
Task 1: Database Migration - Annotation System Indexes
MODIFY: supabase/migrations/
  - CREATE new migration: YYYYMMDDHHMMSS_annotation_system.sql
  - ADD indexes for fast annotation lookups:
    - idx_components_annotation_position on (data->>'documentId', data->>'startOffset', data->>'endOffset') WHERE component_type = 'Position'
    - idx_components_chunk_ref USING GIN on (data->'chunkIds') WHERE component_type = 'ChunkRef'
  - ENSURE documents table has source metadata columns (already exists)
  - ENSURE chunks table has page info columns (already exists)

Task 2: Chunk Utilities - Multi-Chunk Support
CREATE: src/lib/reader/chunk-utils.ts
  - IMPLEMENT findSpannedChunks(startOffset, endOffset, chunks): Filter chunks overlapping range
  - IMPLEMENT createChunkRef(startOffset, endOffset, chunks): Generate ChunkRefComponent
  - IMPLEMENT findChunkForOffset(chunks, offset): Binary search for chunk
  - PATTERN: Binary search from block-parser.ts (lines 370-387)
  - EXPORT all utility functions

Task 3: Highlight Injection System
CREATE: src/lib/reader/highlight-injector.ts
  - IMPLEMENT injectHighlights(block, annotations): Find overlapping annotations
  - IMPLEMENT wrapTextNodes(html, highlights): Walk DOM tree, insert <mark> tags
  - PATTERN: Use DOMParser for HTML manipulation
  - CRITICAL: Handle overlapping highlights via sort-and-process
  - CRITICAL: Preserve HTML structure (don't break nested elements)
  - USE: Block.startOffset/endOffset to map annotations to blocks
  - OUTPUT: Modified HTML string with <mark data-annotation-id={id} data-color={color}>

Task 4: Update Block Parser
MODIFY: src/lib/reader/block-parser.ts
  - FIND: parseMarkdownToBlocks function signature
  - ADD: annotations parameter (default empty array)
  - INJECT: Call injectHighlights(block, annotations) after HTML generation
  - UPDATE: block.html = injectHighlights(block, annotations)
  - PRESERVE: Existing offset calculation and chunk mapping logic

Task 5: Highlight CSS Styles
MODIFY: src/app/globals.css
  - ADD: @layer components for .annotation-highlight
  - ADD: Data attribute selectors for 7 colors
    - [data-color="yellow"] → bg-yellow-200/30 dark:bg-yellow-200/20
    - [data-color="green"] → bg-green-200/30 dark:bg-green-200/20
    - etc. for all 7 colors
  - ADD: Resize handle pseudo-elements (::before, ::after)
    - 8px width, opacity-0 default, opacity-100 on hover
    - cursor: col-resize
    - Linear gradient backgrounds for visual feedback
  - ADD: .resizing-preview styles (blue ring, bg-blue-50/10)

Task 6: Resize Detection
CREATE: src/lib/reader/resize-detection.ts
  - IMPLEMENT detectResizeHandle(e, annotations): Check if mouse near edge
  - LOGIC: Calculate distanceFromStart and distanceFromEnd
  - THRESHOLD: 8px edge detection zone
  - RETURN: { annotationId, edge: 'start' | 'end', element } or null
  - SUPPORT: Both MouseEvent and TouchEvent via type union

Task 7: Offset Calculation from Range
CREATE: src/lib/reader/offset-calculator.ts
  - IMPLEMENT calculateOffsetsFromRange(range, blocks): Convert Range to offsets
  - PATTERN: Use range.cloneRange() and toString().length (from implementation plan)
  - LOGIC:
    - Find block containing range (traverse up to data-start-offset)
    - Clone range, selectNodeContents(block), setEnd(range.start)
    - offsetInBlock = clonedRange.toString().length
    - globalOffset = blockStartOffset + offsetInBlock
  - IMPLEMENT snapToWordBoundaries(start, end, text): Trim whitespace
  - EXPORT both functions

Task 8: useHighlightResize Hook
CREATE: src/hooks/useHighlightResize.ts
  - IMPLEMENT hook(annotations, blocks, chunks, onResize)
  - STATE: resizing = { annotationId, edge, range, initialStart, initialEnd } | null
  - HANDLERS:
    - handleMouseDown: Detect resize handle, set resizing state
    - handleMouseMove: Update range with caretRangeFromPoint
    - handleMouseUp: Calculate new offsets, validate chunk limit, call onResize
  - POINTER ABSTRACTION:
    - const { x, y } = 'touches' in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }
  - VALIDATION:
    - Max 5 chunks (check findSpannedChunks length)
    - Minimum 3 characters
    - Word boundary snapping
  - EVENTS: mousedown/touchstart, mousemove/touchmove, mouseup/touchend
  - CRITICAL: { passive: false } for touch events
  - RETURN: { isResizing: boolean, resizingAnnotationId: string | null }

Task 9: Resize Preview Overlay
MODIFY: src/hooks/useHighlightResize.ts (within handleMouseMove)
  - ADD: Visual feedback during drag
  - LOGIC:
    - Get window.getSelection()
    - selection.removeAllRanges()
    - selection.addRange(resizing.range)
  - ADD: CSS class to preview area
    - Find range.commonAncestorContainer.parentElement
    - Add 'resizing-preview' class (blue ring, defined in globals.css)
  - REMOVE: Preview class on mouseup

Task 10: useTextSelection Hook
CREATE: src/hooks/useTextSelection.ts
  - IMPLEMENT hook(blocks, chunks)
  - STATE: selection = { text, startOffset, endOffset, chunkRef } | null
  - HANDLER: handleSelection (on mouseup, keyup)
    - Get window.getSelection()
    - If collapsed or empty, clear selection
    - Find block containing selection (traverse to data-start-offset)
    - Calculate offsets using range cloning pattern
    - Create ChunkRef with createChunkRef utility
    - Set selection state
  - EXPORT: { selection, clearSelection }
  - CLEAR: clearSelection removes all ranges

Task 11: QuickCapture Component
CREATE: src/components/reader/QuickCapture.tsx
  - PROPS: { selection, onSave, onCancel }
  - STATE: color, note, tagInput, tags[]
  - LAYOUT: Fixed bottom-20, centered, 480px width
  - COMPONENTS:
    - Selected text preview (line-clamp-2)
    - "Spans N chunks" indicator (Sparkles icon)
    - 7 inline color buttons (map over COLORS array)
    - Textarea for note (optional)
    - Tag input with Badge list (Enter to add)
    - Save/Cancel buttons
  - PATTERN: Use shadcn/ui components (Button, Textarea, Input, Badge)
  - ANIMATION: Framer Motion (opacity 0→1, y 10→0)
  - STYLING: bg-background, border, rounded-lg, shadow-2xl, z-50

Task 12: ColorPicker Component (Optional Enhancement)
CREATE: src/components/reader/ColorPicker.tsx
  - PROPS: { value, onChange }
  - LAYOUT: Grid 7 columns (one per color)
  - RENDER: Button for each color with bg class
  - SELECTED: Ring-2 with color-specific ring class
  - CHECK: Show Check icon when selected
  - PATTERN: Use cn() utility for class merging
  - EXPORT: For use in QuickCapture or future modals

Task 13: useAnnotations Hook with Retry Queue
CREATE: src/hooks/useAnnotations.ts
  - STATE: annotations, loading, pendingSaves[]
  - OPERATIONS:
    - create(input): Add to pendingSaves, call server action, remove on success
    - updateOffsets(id, start, end): Optimistic update, call server action
    - remove(id): Call server action
    - refresh(): Re-fetch from database
  - RETRY LOGIC:
    - On mount: Check localStorage for pending_annotations
    - Retry queued saves with exponential backoff
    - Show yellow "draft" badge for pending saves (expose pendingSaves)
  - ERROR HANDLING:
    - Catch server action errors
    - Keep in pendingSaves on failure
    - Write to localStorage as backup
  - PATTERN: Use React Query for caching (optional, or useState + useEffect)
  - EXPORT: { annotations, create, updateOffsets, remove, refresh, pendingSaves, loading }

Task 14: Update Annotation Server Actions
MODIFY: src/app/actions/annotations.ts
  - FIND: createAnnotation function
  - UPDATE: Switch from 3-component to 5-component pattern
    - Position: { documentId, document_id, startOffset, endOffset, originalText, pageLabel }
    - Visual: { type, color }
    - Content: { note, tags }
    - Temporal: { createdAt, updatedAt, lastViewedAt }
    - ChunkRef: { chunkIds, chunk_id, primaryChunkId, chunkPositions }
  - ADD: createAnnotationFromSelection(data) - wrapper for create
  - ADD: updateAnnotationOffsets(annotationId, newStart, newEnd, chunks)
    - Use AnnotationOperations.updateOffsets pattern
    - Update Position component
    - Recalculate ChunkRef with createChunkRef utility
    - Update Temporal.updatedAt
  - PRESERVE: Zod validation, getCurrentUser() pattern, revalidatePath
  - PATTERN: Follow src/lib/ecs/annotations.ts (lines 1042-1147)

Task 15: Dual Storage - annotations.json
CREATE: src/lib/reader/annotation-storage.ts
  - IMPLEMENT writeAnnotationsFile(documentId, userId, annotations)
    - Path: `${userId}/${documentId}/annotations.json`
    - Format: { version: '1.0', document_id, annotations: [...] }
    - Upload to Supabase Storage via storage.from('documents').upload()
  - IMPLEMENT readAnnotationsFile(documentId, userId)
    - Download from Supabase Storage
    - Parse JSON
    - Return AnnotationEntity[]
  - IMPLEMENT syncAnnotations(documentId, userId)
    - Fetch from ECS database
    - Compare with file version
    - Resolve conflicts (last-write-wins)
    - Write updated file
  - ERROR HANDLING: Try/catch with error logging, never throw
  - EXPORT: All functions

Task 16: Update VirtualizedReader
MODIFY: src/components/reader/VirtualizedReader.tsx
  - ADD: useAnnotations hook
  - ADD: useTextSelection hook
  - ADD: useHighlightResize hook
  - STATE: localAnnotations (for optimistic updates)
  - BLOCKS: useMemo to parse with annotations
    - First render: parseMarkdownToBlocks(markdown, chunks, [])
    - After load: parseMarkdownToBlocks(markdown, chunks, localAnnotations)
  - HANDLERS:
    - handleSaveAnnotation: Call create(), clear selection
    - handleResize: Optimistic update, call updateOffsets, refresh
  - RENDER:
    - Virtuoso with BlockRenderer itemContent
    - QuickCapture when selection exists
    - Cursor change when isResizing
  - PROPS: Add onVisibleChunksChange callback for chunk tracking
  - PATTERN: Use AnimatePresence for QuickCapture

Task 17: BlockRenderer Component
CREATE: src/components/reader/BlockRenderer.tsx
  - PROPS: { block, annotations }
  - SANITIZE: Use DOMPurify.sanitize() with ALLOWED_TAGS including 'mark'
  - ATTRIBUTES:
    - data-block-id={block.id}
    - data-chunk-id={block.chunkId}
    - data-start-offset={block.startOffset}
    - data-end-offset={block.endOffset}
  - STYLING: prose classes for typography
  - RENDER: dangerouslySetInnerHTML with sanitized HTML
  - MEMO: React.memo for performance
  - EXPORT: Named export

Task 18: Integration - Run Migration
RUN: npx supabase db push
  - Apply annotation_system migration
  - Verify indexes created
  - Check no errors in Supabase logs

Task 19: Integration - Test Dual Storage
TEST:
  - Create annotation via UI
  - Verify ECS database has entity + 5 components
  - Verify Supabase Storage has annotations.json
  - Verify file and database data match
  - Refresh page → annotations render correctly

Task 20: Integration - Test Multi-Chunk
TEST:
  - Select text spanning 3 chunks
  - Verify ChunkRef.chunkIds has 3 IDs
  - Create annotation
  - Verify all 3 chunk IDs persisted
  - Check sidebar connections (if Phase 6 implemented)

Task 21: Integration - Test Resize
TEST:
  - Create highlight in chunk 42
  - Hover near right edge → cursor changes
  - Drag into chunk 43
  - Verify ChunkRef updates to ['ch_42', 'ch_43']
  - Verify database updated
  - Verify annotations.json updated

Task 22: Integration - Test iPad Touch
TEST:
  - Open document on iPad Safari
  - Long-press text to select
  - QuickCapture appears
  - Create highlight
  - Long-press near highlight edge
  - Drag to resize
  - Verify same behavior as desktop

Task 23: Integration - Test Retry Queue
TEST:
  - Disconnect network
  - Create annotation
  - Verify yellow "draft" badge appears
  - Check localStorage has pending_annotations
  - Reconnect network
  - Refresh page
  - Verify annotation retries and saves
  - Badge disappears

Task 24: Performance Validation
TEST:
  - Load document with 100+ annotations
  - Check parse time in console (<100ms target)
  - Scroll through document
  - Monitor FPS (60fps target)
  - Check memory usage (no leaks)
  - Verify virtual scrolling still working
```

### Integration Points

```yaml
DATABASE:
  - migration: supabase/migrations/YYYYMMDDHHMMSS_annotation_system.sql
  - indexes: Position lookups, ChunkRef GIN index
  - tables: entities (existing), components (existing)

STORAGE:
  - path: {userId}/{documentId}/annotations.json
  - format: JSON with version, document_id, annotations array
  - operations: upload, download via storage.from('documents')

ROUTING:
  - no new routes needed
  - existing: /read/[id] for document reader

STATE_MANAGEMENT:
  - hooks: useAnnotations, useTextSelection, useHighlightResize
  - optimistic updates: localAnnotations state in VirtualizedReader
  - retry queue: pendingSaves in useAnnotations with localStorage backup

STYLES:
  - add to: src/app/globals.css
  - layer: @layer components for .annotation-highlight
  - pattern: Data attribute selectors [data-color="yellow"]
  - theme: Use existing Tailwind colors (yellow-200, green-200, etc.)

COMPONENTS:
  - VirtualizedReader: Add annotation support
  - BlockRenderer: New component for block rendering
  - QuickCapture: New component for annotation creation
  - ColorPicker: Optional enhancement component

SERVER_ACTIONS:
  - update: src/app/actions/annotations.ts to 5-component pattern
  - add: updateAnnotationOffsets action
  - pattern: { success: boolean; data?: T; error?: string }
```

## Validation Loop

### Level 1: Syntax & Style

```bash
# Run these FIRST - fix any errors before proceeding

npm run lint              # ESLint with JSDoc validation
# Expected: No errors. If errors, READ the error and fix.

npx tsc --noEmit         # TypeScript type checking
# Expected: No type errors. If errors, understand the type mismatch and fix.

# Format check (if applicable)
# Project uses Prettier/ESLint auto-fix
```

### Level 2: Unit Tests

```bash
# Run tests for modified/new files

npm test src/lib/reader/chunk-utils.test.ts
npm test src/lib/reader/highlight-injector.test.ts
npm test src/hooks/useHighlightResize.test.ts
npm test src/hooks/useTextSelection.test.ts

# Expected: All tests pass. If failures, fix the logic.
```

### Level 3: Integration Tests

```bash
# Run critical path tests

npm run test:critical
# Tests: ECS entity creation, annotation server actions, block parsing

# Expected: All critical tests pass. If failures, check integration points.
```

### Level 4: E2E Tests

```bash
# Run Playwright tests for annotation flow

npm run test:e2e -- annotation-flow.spec.ts
# Tests: Create annotation, resize annotation, multi-chunk annotation

# Expected: All E2E tests pass. If failures, check UI interactions.
```

## Final Validation Checklist

- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] Manual test: Create annotation with color/note/tags → appears inline
- [ ] Manual test: Resize annotation by dragging edge → updates correctly
- [ ] Manual test: Select text spanning 3 chunks → ChunkRef has 3 IDs
- [ ] Manual test: Reload page → annotations persist
- [ ] Manual test: Check Supabase Storage → annotations.json exists
- [ ] Manual test: Check database → ECS components match file
- [ ] Manual test: iPad Safari → touch resize works
- [ ] Manual test: Disconnect network → failed save queued
- [ ] Error cases: Save failure → yellow badge, retry queue
- [ ] Performance: Scroll with 100+ annotations → 60fps
- [ ] Logs: No excessive console.log or warnings
- [ ] Documentation: Add JSDoc comments to all exported functions
- [ ] Dependencies: All imports properly declared in package.json

---

## Anti-Patterns to Avoid

- ❌ Don't use dynamic Tailwind classes for colors (use data attributes)
- ❌ Don't skip DOMPurify sanitization (security risk)
- ❌ Don't forget { passive: false } for touch events (prevents default broken)
- ❌ Don't mix 3-component and 5-component patterns (use 5 everywhere)
- ❌ Don't write to database without also writing to annotations.json (sync breaks)
- ❌ Don't hardcode user ID (always use getCurrentUser())
- ❌ Don't skip word boundary snapping (mid-word highlights look bad)
- ❌ Don't exceed 5-chunk limit (performance degrades)
- ❌ Don't forget to update Temporal.updatedAt on edits
- ❌ Don't ignore retry queue on mount (data loss risk)
- ❌ Don't block document rendering waiting for annotations (progressive load)
- ❌ Don't forget revalidatePath after mutations (stale data)
- ❌ Don't use API routes instead of Server Actions (pattern violation)
- ❌ Don't skip useCallback for event handlers in useEffect deps (infinite loops)
- ❌ Don't forget to clean up event listeners (memory leaks)

---

## PRP Confidence Score

**9/10** - High confidence for one-pass implementation

**Reasoning:**
- ✅ All patterns exist in codebase (ECS, block parsing, storage, UI)
- ✅ Implementation plan has proven Range API patterns
- ✅ Clear task breakdown with file-by-file instructions
- ✅ All business logic clarified (no ambiguity)
- ✅ Comprehensive validation gates (tests, lint, type-check)
- ✅ Known gotchas documented (data attributes, touch events, ECS patterns)
- ✅ Integration points clearly defined
- ⚠️ Range API can be tricky (edge cases with nested HTML) - needs careful testing
- ⚠️ Touch events on iPad may have Safari-specific quirks - needs device testing

**Risk Mitigation:**
- Start with Phase 1-2 (highlights only) to validate injection approach
- Test Range API with complex HTML fixtures early
- Test on iPad Safari before marking complete

---

## Related Documentation

- **Task Breakdown**: `docs/tasks/annotation-system.md` - 30 detailed implementation tasks with dependencies, acceptance criteria, and validation steps
- **Implementation Plan**: `docs/todo/complete-annotation-system.md` - 30-page detailed plan with code examples
- **ECS Guide**: `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System patterns
- **React Guidelines**: `docs/rEACT_GUIDELINES.md` - Server/Client component patterns
- **UI Patterns**: `docs/UI_PATTERNS.md` - No modals, persistent UI philosophy
- **Testing Strategy**: `docs/testing/TESTING_README.md` - Test categorization and patterns
