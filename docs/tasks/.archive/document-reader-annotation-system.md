# Document Reader & Annotation System - Task Breakdown

**Feature Name**: Document Reader with Inline Annotations & Weight Tuning Interface  
**Source PRP**: [docs/prps/document-reader-annotation-system.md](/docs/prps/document-reader-annotation-system.md)  
**Version**: 1.0.0  
**Status**: Ready for Implementation  
**Timeline**: 1.5 weeks (Phase 1 + Weight Tuning)  
**Confidence**: 9/10

---

## Executive Summary

### Feature Overview
Build a flow-state document reader with inline annotation system and real-time connection weight tuning interface. Enables users to read processed documents, create position-resilient highlights/notes, explore mock connections across 7 synthesis engines, and tune engine weights for testing.

### Business Value
- **Synthesis Testing Infrastructure**: Weight tuning interface critical for validating 7 connection engines (semantic, thematic, structural, contradiction, emotional, methodological, temporal)
- **Parallel Development Path**: Mock connections enable UI validation while synthesis engines are built
- **Annotation Foundation**: Required for Phase 3 flashcard system and Phase 4 knowledge graph
- **Flow State Preservation**: Zero modal interruptions maintain reading focus

### Technical Complexity Assessment
- **Overall Complexity**: Medium (7/10)
- **Infrastructure Status**: 100% exists (ProcessingDock pattern, ECS, fuzzy matching, Server Actions)
- **Integration Risk**: Low (all patterns tested and documented)
- **Performance Risk**: Medium (weight re-ranking <100ms needs validation)
- **Testing Confidence**: High (fuzzy matching 88.52% coverage, all patterns proven)

---

## Phase Organization

### Phase 1: Core Reader Foundation (Week 1)
**Duration**: 5 days  
**Objective**: Functional document reader with annotations and mock connections

**Deliverables**:
- Markdown rendering with syntax highlighting and math (<500ms first paint)
- Text selection with Quick Capture panel (5 colors: g/y/r/b/p hotkeys)
- Annotation persistence via ECS (>70% fuzzy matching confidence)
- Highlight overlay system with z-index stacking
- Right panel with mock connections (50 examples across 7 engines)
- Connection navigation and basic filtering

**Milestones**:
- Day 1-2: Foundation (types, stores, utilities, Server Actions)
- Day 3-4: Reader UI (DocumentViewer, AnnotationLayer, QuickCapture)
- Day 5: Right panel (connections display, basic navigation)

### Phase 2: Weight Tuning & Validation (Week 2)
**Duration**: 4 days  
**Objective**: Real-time weight tuning interface and connection validation

**Deliverables**:
- 7 engine weight sliders with live preview (<100ms re-ranking)
- Connection filtering by engine type and strength threshold
- Validation capture (v/r/s hotkeys to localStorage)
- 4 preset configurations (Max Friction, Thematic Focus, Balanced, Chaos)
- Performance optimization (memoization, animations)
- Comprehensive testing and dogfooding

**Milestones**:
- Day 1-2: Weight tuning component with sliders and presets
- Day 3: Connection filters and validation capture
- Day 4: Polish, performance validation, dogfooding

---

## Task Breakdown by Phase

### PHASE 1: CORE READER FOUNDATION

---

#### Task T-001: Install Missing ShadCN Components

**Priority**: Critical  
**Dependencies**: None (blocking task)  
**Estimated Time**: 15 minutes

##### Context & Purpose
**As a** developer  
**I need** to install 4 missing shadcn/ui components  
**So that** annotation UI components can render properly

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When components are installed, they shall be available in `src/components/ui/`
- REQ-2: All component imports shall resolve without errors

**Component List**:
- Popover (for Quick Capture panel)
- HoverCard (for connection previews)
- Tooltip (for hotkey hints)
- ScrollArea (for right panel scrolling)

##### Implementation Details

**Installation Command**:
```bash
npx shadcn@latest add popover hover-card tooltip scroll-area
```

**Files Created**:
```
src/components/ui/
├── popover.tsx
├── hover-card.tsx
├── tooltip.tsx
└── scroll-area.tsx
```

##### Acceptance Criteria

**Scenario 1: Components installed successfully**
```gherkin
Given shadcn CLI is available
When I run the installation command
Then 4 new component files are created in src/components/ui/
And npm run build completes without import errors
```

**Checklist**:
- [ ] All 4 components present in `src/components/ui/`
- [ ] TypeScript compilation passes
- [ ] No import resolution errors

##### Manual Testing Steps
1. Run installation command
2. Check for new files in `src/components/ui/`
3. Run `npm run build` to verify no errors
4. Import one component in a test file to verify resolution

---

#### Task T-002: Create Annotation Types & Zustand Store

**Priority**: Critical  
**Dependencies**: T-001  
**Estimated Time**: 2 hours

##### Context & Purpose
**As a** developer  
**I need** comprehensive TypeScript types and client state management  
**So that** annotation operations have type safety and reactive UI state

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When annotation types are defined, they shall match ECS component schema
- REQ-2: When store actions are called, they shall update state reactively
- REQ-3: When weight presets are applied, they shall set all 7 engine weights

**Type Coverage**:
- TextSelection (Range API wrapper)
- AnnotationData (component JSONB structure)
- PositionData (fuzzy matching metadata)
- SourceData (chunk/document linking)
- StoredAnnotation (complete entity from ECS)
- MockConnection (synthesis testing data)
- EngineWeights (7 engine configuration)
- ConnectionFeedback (validation capture)

##### Implementation Details

**Files to Create**:
```
src/
├── types/
│   └── annotations.ts        # CREATE - All TypeScript interfaces
└── stores/
    └── annotation-store.ts   # CREATE - Zustand state management
```

**Code Pattern Reference**:
- **Zustand Pattern**: Follow `src/stores/processing-store.ts` (lines 37-77)
- **Type Structure**: Match ECS component schema from `src/lib/ecs/ecs.ts`

**Store State Structure**:
```typescript
interface AnnotationState {
  // Active annotation
  activeAnnotation: StoredAnnotation | null
  setActiveAnnotation: (annotation: StoredAnnotation | null) => void
  
  // Text selection
  selectedText: TextSelection | null
  setSelectedText: (selection: TextSelection | null) => void
  
  // Quick Capture panel
  quickCaptureOpen: boolean
  openQuickCapture: () => void
  closeQuickCapture: () => void
  
  // Engine weights (for tuning)
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

**Weight Presets**:
```typescript
const presets: Record<WeightPreset, EngineWeights> = {
  'max-friction': { 
    semantic: 0.3, thematic: 0.9, structural: 0.7, 
    contradiction: 1.0, emotional: 0.4, methodological: 0.8, temporal: 0.2 
  },
  'thematic-focus': { 
    semantic: 0.4, thematic: 1.0, structural: 0.5, 
    contradiction: 0.6, emotional: 0.3, methodological: 0.7, temporal: 0.2 
  },
  'balanced': { 
    semantic: 0.5, thematic: 0.5, structural: 0.5, 
    contradiction: 0.5, emotional: 0.5, methodological: 0.5, temporal: 0.5 
  },
  'chaos': { 
    semantic: 0.8, thematic: 0.8, structural: 0.8, 
    contradiction: 0.8, emotional: 0.8, methodological: 0.8, temporal: 0.8 
  }
}
```

##### Acceptance Criteria

**Scenario 1: Types provide complete coverage**
```gherkin
Given annotation types are defined
When I use them in components
Then TypeScript provides full type safety
And no 'any' types are needed
```

**Scenario 2: Store manages state correctly**
```gherkin
Given annotation store is initialized
When I call setWeight('semantic', 0.8)
Then weights.semantic updates to 0.8
And UI components re-render reactively
```

**Scenario 3: Presets apply correctly**
```gherkin
Given annotation store is initialized
When I call applyPreset('max-friction')
Then all 7 engine weights update to preset values
And weights.contradiction equals 1.0
```

**Checklist**:
- [ ] All interfaces exported from `types/annotations.ts`
- [ ] Store created with Zustand pattern
- [ ] 4 weight presets implemented
- [ ] All actions update state correctly
- [ ] TypeScript strict mode passes
- [ ] JSDoc on exported interfaces

##### Manual Testing Steps
1. Create store instance in test file
2. Call `applyPreset('max-friction')`
3. Verify all 7 weights update
4. Call `toggleEngine('semantic')`
5. Verify engine removed from enabledEngines set
6. Call `setStrengthThreshold(0.7)`
7. Verify threshold updates

---

#### Task T-003: Create Text Range Utility Library

**Priority**: High  
**Dependencies**: T-002  
**Estimated Time**: 3 hours

##### Context & Purpose
**As a** developer  
**I need** text selection and Range API utilities  
**So that** annotations can capture and restore precise text positions

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When text is selected, `captureSelection()` shall return TextSelection with offsets
- REQ-2: When selection is collapsed, `captureSelection()` shall return null
- REQ-3: When context is extracted, it shall provide ±5 words around position
- REQ-4: When range is restored, it shall handle text node traversal correctly

**Browser API Dependencies**:
- `window.getSelection()` - Get current text selection
- `Range.getBoundingClientRect()` - Position Quick Capture panel
- `Range.startOffset` / `Range.endOffset` - Character positions

##### Implementation Details

**Files to Create**:
```
src/lib/annotations/
└── text-range.ts    # CREATE - Selection API helpers
```

**Key Functions**:

1. **captureSelection()**:
```typescript
/**
 * Captures current text selection with offsets and bounding rectangle.
 * @returns TextSelection if valid selection exists, null if collapsed
 */
export function captureSelection(): TextSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  
  const text = selection.toString().trim()
  if (text.length === 0) return null
  
  // Extract chunk ID from DOM
  const container = range.commonAncestorContainer
  const chunkElement = findChunkElement(container)
  if (!chunkElement) return null
  
  const chunkId = chunkElement.getAttribute('data-chunk-id')
  if (!chunkId) return null
  
  return {
    text,
    range: {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      chunkId
    },
    rect: range.getBoundingClientRect()
  }
}
```

2. **extractContext()**:
```typescript
/**
 * Extracts context before and after selection (~5 words each).
 * @param fullText - Complete text content
 * @param startOffset - Selection start position
 * @param endOffset - Selection end position
 * @returns Object with before, content, after strings
 */
export function extractContext(
  fullText: string,
  startOffset: number,
  endOffset: number
): { before: string; content: string; after: string } {
  const contextSize = 100 // ~5 words
  
  const beforeStart = Math.max(0, startOffset - contextSize)
  const beforeText = fullText.substring(beforeStart, startOffset)
  const beforeWords = beforeText.trim().split(/\s+/).slice(-5).join(' ')
  
  const content = fullText.substring(startOffset, endOffset)
  
  const afterEnd = Math.min(fullText.length, endOffset + contextSize)
  const afterText = fullText.substring(endOffset, afterEnd)
  const afterWords = afterText.trim().split(/\s+/).slice(0, 5).join(' ')
  
  return {
    before: beforeWords,
    content,
    after: afterWords
  }
}
```

3. **restoreRange()**:
```typescript
/**
 * Restores Range object from offsets within chunk element.
 * @param chunkElement - DOM element containing text
 * @param startOffset - Character start position
 * @param endOffset - Character end position
 * @returns Range if valid, null if offsets invalid
 */
export function restoreRange(
  chunkElement: HTMLElement,
  startOffset: number,
  endOffset: number
): Range | null {
  try {
    const range = document.createRange()
    const textNode = findTextNode(chunkElement, startOffset)
    
    if (!textNode) return null
    
    range.setStart(textNode, startOffset)
    range.setEnd(textNode, endOffset)
    
    return range
  } catch (error) {
    console.error('Failed to restore range:', error)
    return null
  }
}
```

**Code Pattern Reference**:
- **Error Handling**: Try-catch with fallback (MDN Range API examples)
- **Text Node Traversal**: Standard DOM tree walking pattern

##### Acceptance Criteria

**Scenario 1: Text selection captured correctly**
```gherkin
Given user selects "important text" in chunk
When captureSelection() is called
Then TextSelection object is returned
And text equals "important text"
And chunkId is present
And rect contains valid bounding coordinates
```

**Scenario 2: Collapsed selection returns null**
```gherkin
Given user clicks without selecting text
When captureSelection() is called
Then null is returned
And no errors are thrown
```

**Scenario 3: Context extraction works**
```gherkin
Given full text "The quick brown fox jumps over the lazy dog"
And selection from offset 10 to 19 ("brown fox")
When extractContext() is called
Then before equals "The quick"
And content equals "brown fox"
And after equals "jumps over the"
```

**Scenario 4: Range restoration handles invalid offsets**
```gherkin
Given chunk element with 100 characters
When restoreRange() is called with offset 200
Then null is returned
And no errors are thrown
```

**Checklist**:
- [ ] `captureSelection()` returns valid TextSelection
- [ ] Collapsed selection returns null gracefully
- [ ] `extractContext()` provides ±5 words
- [ ] `restoreRange()` handles text node traversal
- [ ] All functions have JSDoc
- [ ] Error handling prevents crashes

##### Manual Testing Steps
1. Open document reader page
2. Select text manually
3. Call `captureSelection()` in console
4. Verify TextSelection object has all fields
5. Click without selection
6. Verify `captureSelection()` returns null
7. Test `extractContext()` with known offsets
8. Verify before/after have ~5 words each

---

#### Task T-004: Create Annotation Storage Server Actions

**Priority**: Critical  
**Dependencies**: T-002, T-003  
**Estimated Time**: 4 hours

##### Context & Purpose
**As a** developer  
**I need** Server Actions for annotation CRUD operations  
**So that** annotations persist securely to ECS with proper validation

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When annotation is created, it shall persist to ECS with 3 components (annotation, position, source)
- REQ-2: When annotation data is invalid, Server Action shall return error without crashing
- REQ-3: When annotation is updated, only the annotation component shall be modified
- REQ-4: When annotation is deleted, the entire entity shall be removed (cascade)
- REQ-5: When annotations are queried, they shall be filtered by document_id

**Security Requirements**:
- All operations require authenticated userId
- Input validation via Zod schemas
- No raw SQL (use ECS abstraction)

**Performance Requirements**:
- Annotation save < 200ms (target from PRP)
- Query all document annotations < 500ms

##### Implementation Details

**Files to Create**:
```
src/app/actions/
└── annotations.ts    # CREATE - Server Actions for CRUD
```

**Code Pattern Reference**:
- **Server Actions**: Follow `src/app/actions/documents.ts` (lines 51-193)
- **Error Handling**: Try-catch with descriptive error messages
- **ECS Operations**: Reference `src/lib/ecs/ecs.ts` patterns

**Key Functions**:

1. **createAnnotation()**:
```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ecs } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/supabase/admin'

const CreateAnnotationSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkId: z.string().uuid(),
  documentId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.enum(['yellow', 'green', 'blue', 'red', 'purple']),
  note: z.string().max(10000).optional(),
  textContext: z.object({
    before: z.string(),
    content: z.string(),
    after: z.string()
  })
})

/**
 * Creates annotation entity with 3 components.
 * @param data - Annotation creation data
 * @returns Success with entity ID or error
 */
export async function createAnnotation(
  data: z.infer<typeof CreateAnnotationSchema>
) {
  try {
    // Validate input
    const validated = CreateAnnotationSchema.parse(data)
    
    // Get authenticated user
    const userId = await getCurrentUser()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Create entity with 3 components
    const entityId = await ecs.createEntity(userId, {
      annotation: {
        text: validated.text,
        note: validated.note,
        color: validated.color,
        range: {
          startOffset: validated.startOffset,
          endOffset: validated.endOffset,
          chunkId: validated.chunkId
        },
        textContext: validated.textContext
      },
      position: {
        chunkId: validated.chunkId,
        startOffset: validated.startOffset,
        endOffset: validated.endOffset,
        confidence: 1.0, // Exact match on creation
        method: 'exact',
        textContext: {
          before: validated.textContext.before,
          after: validated.textContext.after
        }
      },
      source: {
        chunk_id: validated.chunkId,
        document_id: validated.documentId
      }
    })
    
    // Revalidate document page
    revalidatePath(`/read/${validated.documentId}`)
    
    return { success: true, id: entityId }
  } catch (error) {
    console.error('Failed to create annotation:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}
```

2. **updateAnnotation()**:
```typescript
/**
 * Updates annotation component data (note, color).
 * @param entityId - Entity ID
 * @param updates - Partial annotation data
 * @returns Success or error
 */
export async function updateAnnotation(
  entityId: string,
  updates: { note?: string; color?: string }
) {
  try {
    const userId = await getCurrentUser()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }
    
    // Get entity to find annotation component
    const entity = await ecs.getEntity(entityId, userId)
    if (!entity) {
      return { success: false, error: 'Annotation not found' }
    }
    
    const annotationComponent = entity.components?.find(
      c => c.component_type === 'annotation'
    )
    
    if (!annotationComponent) {
      return { success: false, error: 'Annotation component not found' }
    }
    
    // Merge updates with existing data
    const updatedData = {
      ...annotationComponent.data,
      ...updates
    }
    
    await ecs.updateComponent(annotationComponent.id, updatedData, userId)
    
    // Revalidate document page
    const sourceComponent = entity.components?.find(
      c => c.component_type === 'source'
    )
    if (sourceComponent?.data.document_id) {
      revalidatePath(`/read/${sourceComponent.data.document_id}`)
    }
    
    return { success: true }
  } catch (error) {
    console.error('Failed to update annotation:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}
```

3. **deleteAnnotation()**:
```typescript
/**
 * Deletes annotation entity (cascades to all components).
 * @param entityId - Entity ID to delete
 * @returns Success or error
 */
export async function deleteAnnotation(entityId: string) {
  try {
    const userId = await getCurrentUser()
    if (!userId) {
      return { success: false, error: 'Not authenticated' }
    }
    
    await ecs.deleteEntity(entityId, userId)
    
    return { success: true }
  } catch (error) {
    console.error('Failed to delete annotation:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}
```

4. **getAnnotations()**:
```typescript
/**
 * Gets all annotations for a document.
 * @param documentId - Document ID to query
 * @returns Array of StoredAnnotation entities
 */
export async function getAnnotations(documentId: string) {
  try {
    const userId = await getCurrentUser()
    if (!userId) {
      return { success: false, error: 'Not authenticated', data: [] }
    }
    
    const entities = await ecs.query(
      ['annotation', 'position', 'source'],
      userId,
      { document_id: documentId }
    )
    
    // Map to StoredAnnotation interface
    const annotations = entities.map(entity => ({
      id: entity.id,
      user_id: entity.user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      components: {
        annotation: entity.components?.find(c => c.component_type === 'annotation')?.data,
        position: entity.components?.find(c => c.component_type === 'position')?.data,
        source: entity.components?.find(c => c.component_type === 'source')?.data
      }
    }))
    
    return { success: true, data: annotations }
  } catch (error) {
    console.error('Failed to get annotations:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      data: []
    }
  }
}
```

##### Acceptance Criteria

**Scenario 1: Create annotation successfully**
```gherkin
Given valid annotation data
When createAnnotation() is called
Then entity is created with 3 components
And response.success is true
And response.id is a valid UUID
And document page is revalidated
```

**Scenario 2: Invalid input returns error**
```gherkin
Given annotation with empty text
When createAnnotation() is called
Then Zod validation fails
And response.success is false
And response.error contains validation message
And no entity is created
```

**Scenario 3: Update annotation note**
```gherkin
Given existing annotation entity
When updateAnnotation() is called with new note
Then annotation component data is updated
And position/source components unchanged
And response.success is true
```

**Scenario 4: Delete annotation cascades**
```gherkin
Given existing annotation entity
When deleteAnnotation() is called
Then entity is deleted
And all 3 components are removed (cascade)
And response.success is true
```

**Scenario 5: Query returns all document annotations**
```gherkin
Given document with 5 annotations
When getAnnotations(documentId) is called
Then 5 StoredAnnotation objects are returned
And each has annotation/position/source components
And response.success is true
```

**Checklist**:
- [ ] All 4 functions implemented with JSDoc
- [ ] Zod schemas validate input
- [ ] Error handling returns structured responses
- [ ] revalidatePath() called on mutations
- [ ] TypeScript strict mode passes
- [ ] No raw SQL (ECS abstraction only)

##### Manual Testing Steps
1. Start dev server with `npm run dev`
2. Open browser console on reader page
3. Test create: Call `createAnnotation()` with valid data
4. Verify entity created in database
5. Test update: Call `updateAnnotation()` with new note
6. Verify annotation component updated
7. Test query: Call `getAnnotations(documentId)`
8. Verify all annotations returned
9. Test delete: Call `deleteAnnotation(entityId)`
10. Verify entity removed from database

**Performance Validation**:
```typescript
const start = performance.now()
await createAnnotation(data)
const duration = performance.now() - start
console.log(`Save time: ${duration}ms (target: <200ms)`)
```

---

#### Task T-005: Enhance Reader Page with Chunk Queries

**Priority**: High  
**Dependencies**: T-004  
**Estimated Time**: 1.5 hours

##### Context & Purpose
**As a** developer  
**I need** to enhance the existing reader page to query chunks and annotations  
**So that** DocumentViewer component receives all necessary data

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When reader page loads, it shall query chunks ordered by chunk_index
- REQ-2: When chunks are unavailable, page shall show error message
- REQ-3: When annotations are queried, they shall be passed to DocumentViewer
- REQ-4: Existing signed URL generation shall remain unchanged

**Performance Requirements**:
- Page load < 1000ms total (including queries)
- Chunks query < 300ms
- Annotations query < 200ms

##### Implementation Details

**Files to Modify**:
```
src/app/read/[id]/
└── page.tsx    # ENHANCE - Add chunk/annotation queries
```

**Code Pattern Reference**:
- **Existing Pattern**: Lines 38-41 (signed URL generation)
- **Server Component**: No 'use client' directive (keep as Server Component)

**Enhancement Code**:
```typescript
// KEEP EXISTING IMPORTS AND SIGNED URL CODE

// ADD: Query chunks
const { data: chunks, error: chunksError } = await supabase
  .from('chunks')
  .select('id, content, chunk_index, position_context, start_offset, end_offset')
  .eq('document_id', params.id)
  .order('chunk_index', { ascending: true })

if (chunksError) {
  console.error('Failed to load chunks:', chunksError)
  return (
    <div className="p-8 text-center">
      <p className="text-destructive">Failed to load document chunks</p>
      <p className="text-sm text-muted-foreground mt-2">
        {chunksError.message}
      </p>
    </div>
  )
}

if (!chunks || chunks.length === 0) {
  return (
    <div className="p-8 text-center">
      <p className="text-muted-foreground">
        Document has no chunks. Processing may still be in progress.
      </p>
    </div>
  )
}

// ADD: Query annotations
const { data: annotations } = await getAnnotations(params.id)

// MODIFY: Pass data to DocumentViewer
return (
  <DocumentViewer
    documentId={params.id}
    markdownUrl={data.signedUrl}
    chunks={chunks}
    annotations={annotations || []}
  />
)
```

##### Acceptance Criteria

**Scenario 1: Chunks loaded successfully**
```gherkin
Given document has 50 chunks
When reader page loads
Then chunks are queried ordered by chunk_index
And DocumentViewer receives all 50 chunks
And no errors are displayed
```

**Scenario 2: Missing chunks shows error**
```gherkin
Given document has no chunks
When reader page loads
Then error message is displayed
And user sees "Document has no chunks" text
And no crash occurs
```

**Scenario 3: Annotations loaded with chunks**
```gherkin
Given document has 5 annotations
When reader page loads
Then annotations are queried
And DocumentViewer receives 5 annotations
And annotations are rendered over markdown
```

**Checklist**:
- [ ] Chunk query added with correct fields
- [ ] Annotations query integrated
- [ ] Error handling for missing chunks
- [ ] Empty state for no chunks
- [ ] Signed URL generation unchanged
- [ ] Props passed to DocumentViewer correctly

##### Manual Testing Steps
1. Navigate to `/read/{documentId}` with processed document
2. Verify chunks load without errors
3. Check browser console for query performance
4. Test with document that has no chunks
5. Verify error message displays correctly
6. Test with document that has annotations
7. Verify annotations passed to DocumentViewer

**Performance Validation**:
```typescript
// Add temporary logging
const start = performance.now()
const { data: chunks } = await supabase.from('chunks')...
console.log(`Chunks query: ${performance.now() - start}ms`)
```

---

#### Task T-006: Create Document Viewer Component

**Priority**: Critical  
**Dependencies**: T-005  
**Estimated Time**: 6 hours

##### Context & Purpose
**As a** user  
**I need** a document viewer that renders markdown with text selection  
**So that** I can read documents and create annotations seamlessly

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When markdown loads, it shall render with syntax highlighting and math support
- REQ-2: When user selects text, Quick Capture panel shall appear near selection
- REQ-3: When text selection is collapsed, Quick Capture panel shall not appear
- REQ-4: When annotation is created, highlights shall render immediately
- REQ-5: Markdown shall support code blocks, math equations, tables, lists

**Performance Requirements**:
- First paint < 500ms (target from PRP)
- Smooth scrolling with no jank
- Text selection response < 50ms

**Accessibility Requirements**:
- All interactive elements keyboard-accessible
- ARIA labels on buttons
- Focus management for panel transitions

##### Implementation Details

**Files to Create**:
```
src/components/reader/
└── DocumentViewer.tsx    # CREATE - Main reader component
```

**Dependencies**:
- react-markdown (already installed)
- remark-gfm (GitHub Flavored Markdown)
- remark-math / rehype-katex (math rendering)

**Component Structure**:
```typescript
'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { captureSelection } from '@/lib/annotations/text-range'
import { QuickCapturePanel } from './QuickCapturePanel'
import { ChunkWrapper } from './ChunkWrapper'
import type { Chunk, StoredAnnotation } from '@/types/annotations'

interface DocumentViewerProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
}

export function DocumentViewer({
  documentId,
  markdownUrl,
  chunks,
  annotations
}: DocumentViewerProps) {
  const [markdown, setMarkdown] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null)
  
  // Load markdown from signed URL
  useEffect(() => {
    async function loadMarkdown() {
      try {
        const response = await fetch(markdownUrl)
        if (!response.ok) {
          throw new Error('Failed to fetch markdown')
        }
        const text = await response.text()
        setMarkdown(text)
      } catch (error) {
        console.error('Failed to load markdown:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadMarkdown()
  }, [markdownUrl])
  
  // Handle text selection
  function handleMouseUp() {
    const selection = captureSelection()
    if (selection) {
      setSelectedText(selection)
    } else {
      setSelectedText(null)
    }
  }
  
  // Handle Escape key to close panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedText(null)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary" />
      </div>
    )
  }
  
  return (
    <div className="container mx-auto p-8 max-w-4xl" onMouseUp={handleMouseUp}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children, ...props }) => {
            // Wrap paragraphs with ChunkWrapper for annotation support
            const chunkId = getCurrentChunkId(chunks, props)
            return (
              <ChunkWrapper chunkId={chunkId} annotations={annotations}>
                <p {...props}>{children}</p>
              </ChunkWrapper>
            )
          },
          code: ({ inline, className, children, ...props }) => {
            if (inline) {
              return <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
            }
            return (
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                <code className={className} {...props}>{children}</code>
              </pre>
            )
          },
          // Add more custom renderers as needed
        }}
      >
        {markdown}
      </ReactMarkdown>
      
      {selectedText && (
        <QuickCapturePanel
          selection={selectedText}
          documentId={documentId}
          onClose={() => setSelectedText(null)}
        />
      )}
    </div>
  )
}

// Helper to determine current chunk ID from markdown position
function getCurrentChunkId(chunks: Chunk[], props: any): string {
  // Implementation: Track position in markdown and map to chunk
  // For MVP, use heuristic based on rendered order
  return chunks[0]?.id || 'unknown'
}
```

**Code Pattern Reference**:
- **Loading State**: Follow ProcessingDock.tsx loading patterns
- **Event Handlers**: Standard React patterns
- **CSS**: Tailwind utility classes

##### Acceptance Criteria

**Scenario 1: Markdown renders correctly**
```gherkin
Given document with markdown content
When DocumentViewer loads
Then markdown renders with syntax highlighting
And code blocks have proper formatting
And math equations render with KaTeX
And first paint occurs in < 500ms
```

**Scenario 2: Text selection shows Quick Capture**
```gherkin
Given markdown is rendered
When user selects text
Then Quick Capture panel appears near selection
And panel contains 5 color buttons
And panel has note input field
```

**Scenario 3: Collapsed selection hides panel**
```gherkin
Given Quick Capture panel is open
When user clicks outside selection
Then panel disappears
And no errors are thrown
```

**Scenario 4: Escape key closes panel**
```gherkin
Given Quick Capture panel is open
When user presses Escape key
Then panel closes immediately
And selection is cleared
```

**Checklist**:
- [ ] Markdown renders with all features
- [ ] Text selection triggers handleMouseUp
- [ ] Quick Capture panel positioned correctly
- [ ] Escape key closes panel
- [ ] Loading state shows spinner
- [ ] Error handling for fetch failures
- [ ] Performance < 500ms first paint
- [ ] All props typed correctly

##### Manual Testing Steps
1. Open document reader page
2. Verify markdown renders correctly
3. Select text manually
4. Verify Quick Capture panel appears
5. Click outside selection
6. Verify panel disappears
7. Press Escape key
8. Verify panel closes
9. Test with document containing code blocks
10. Verify syntax highlighting works
11. Test with math equations
12. Verify KaTeX renders properly

**Performance Validation**:
```typescript
useEffect(() => {
  const start = performance.now()
  // After markdown renders
  requestAnimationFrame(() => {
    const paintTime = performance.now() - start
    console.log(`First paint: ${paintTime}ms (target: <500ms)`)
  })
}, [markdown])
```

---

#### Task T-007: Create Quick Capture Panel Component

**Priority**: High  
**Dependencies**: T-006  
**Estimated Time**: 4 hours

##### Context & Purpose
**As a** user  
**I need** a quick capture panel for creating annotations  
**So that** I can highlight text and add notes without interrupting reading flow

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When panel opens, it shall position near text selection (not modal)
- REQ-2: When color button clicked, annotation shall be created immediately
- REQ-3: When note is added, it shall attach to annotation
- REQ-4: When annotation saves, toast notification shall appear
- REQ-5: Keyboard hotkeys (g/y/r/b/p) shall create annotations directly

**Performance Requirements**:
- Annotation save < 200ms (target from PRP)
- Panel appearance < 50ms
- No UI blocking during save

**UX Requirements**:
- No modal overlay (architectural requirement)
- Panel positioned below selection (not covering text)
- Visual feedback during save (loading state)
- Success/error toast notifications

##### Implementation Details

**Files to Create**:
```
src/components/reader/
└── QuickCapturePanel.tsx    # CREATE - Annotation creation panel
```

**Dependencies**:
- Popover component (from T-001)
- Textarea component (shadcn/ui)
- Button component (shadcn/ui)
- Toast notifications (shadcn/ui)

**Component Structure**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { createAnnotation } from '@/app/actions/annotations'
import { extractContext } from '@/lib/annotations/text-range'
import type { TextSelection } from '@/types/annotations'

interface QuickCapturePanelProps {
  selection: TextSelection
  documentId: string
  onClose: () => void
}

const COLOR_OPTIONS = [
  { key: 'g', color: 'green', label: 'Green', className: 'bg-green-200 hover:bg-green-300' },
  { key: 'y', color: 'yellow', label: 'Yellow', className: 'bg-yellow-200 hover:bg-yellow-300' },
  { key: 'r', color: 'red', label: 'Red', className: 'bg-red-200 hover:bg-red-300' },
  { key: 'b', color: 'blue', label: 'Blue', className: 'bg-blue-200 hover:bg-blue-300' },
  { key: 'p', color: 'purple', label: 'Purple', className: 'bg-purple-200 hover:bg-purple-300' },
]

export function QuickCapturePanel({
  selection,
  documentId,
  onClose
}: QuickCapturePanelProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const { toast } = useToast()
  
  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      const colorOption = COLOR_OPTIONS.find(opt => opt.key === e.key.toLowerCase())
      if (colorOption) {
        e.preventDefault()
        handleColorSelect(colorOption.color)
      }
    }
    
    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [selection, note])
  
  async function handleColorSelect(color: string) {
    setSelectedColor(color)
    await saveAnnotation(color)
  }
  
  async function saveAnnotation(color: string) {
    setSaving(true)
    
    try {
      // Extract context from full text (you'll need to pass full chunk text)
      const textContext = extractContext(
        selection.text, // Placeholder: need full chunk text
        selection.range.startOffset,
        selection.range.endOffset
      )
      
      const result = await createAnnotation({
        text: selection.text,
        chunkId: selection.range.chunkId,
        documentId,
        startOffset: selection.range.startOffset,
        endOffset: selection.range.endOffset,
        color: color as any,
        note: note || undefined,
        textContext
      })
      
      if (result.success) {
        toast({
          title: 'Annotation saved',
          description: `Highlighted in ${color}`,
        })
        onClose()
      } else {
        toast({
          title: 'Failed to save annotation',
          description: result.error,
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to save annotation:', error)
      toast({
        title: 'Error',
        description: 'Failed to save annotation',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }
  
  return (
    <Popover open={true} onOpenChange={(open) => !open && onClose()}>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-80"
        style={{
          position: 'fixed',
          top: selection.rect.bottom + 10,
          left: selection.rect.left + selection.rect.width / 2,
          transform: 'translateX(-50%)',
          zIndex: 50
        }}
      >
        <div className="space-y-3">
          <div className="flex gap-2 justify-center">
            {COLOR_OPTIONS.map(option => (
              <Button
                key={option.color}
                variant="outline"
                size="sm"
                className={option.className}
                onClick={() => handleColorSelect(option.color)}
                disabled={saving}
                title={`${option.label} (${option.key})`}
              >
                {option.key.toUpperCase()}
              </Button>
            ))}
          </div>
          
          <Textarea
            placeholder="Add a note (optional)..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            className="min-h-[80px]"
          />
          
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleColorSelect(selectedColor || 'yellow')}
              disabled={saving || !selectedColor}
            >
              {saving ? 'Saving...' : 'Save with Note'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Panel positioned correctly**
```gherkin
Given text is selected
When Quick Capture panel opens
Then panel appears below selection
And panel does not cover selected text
And panel has fixed positioning
```

**Scenario 2: Color hotkey creates annotation**
```gherkin
Given panel is open
When user presses 'g' key
Then green annotation is created immediately
And toast notification shows "Highlighted in green"
And panel closes
```

**Scenario 3: Note attached to annotation**
```gherkin
Given panel is open
And user types note "Important insight"
When user clicks "Save with Note"
Then annotation is created with note
And toast notification shows success
And panel closes
```

**Scenario 4: Save error handled gracefully**
```gherkin
Given panel is open
And server action fails
When user selects color
Then error toast appears
And panel remains open
And no crash occurs
```

**Checklist**:
- [ ] Panel positioned with fixed CSS
- [ ] 5 color buttons with hotkeys
- [ ] Note textarea functional
- [ ] createAnnotation() called on save
- [ ] Toast notifications for success/error
- [ ] Loading state during save
- [ ] Keyboard shortcuts work
- [ ] Cancel button closes panel

##### Manual Testing Steps
1. Select text in document
2. Verify panel appears below selection
3. Click green button
4. Verify annotation created
5. Verify toast notification appears
6. Select text again
7. Type note in textarea
8. Click "Save with Note"
9. Verify annotation includes note
10. Select text again
11. Press 'y' key
12. Verify yellow annotation created instantly

**Performance Validation**:
```typescript
const start = performance.now()
await createAnnotation(data)
const duration = performance.now() - start
console.log(`Save time: ${duration}ms (target: <200ms)`)
```

---

### PHASE 2: WEIGHT TUNING & VALIDATION

---

#### Task T-008: Create Chunk Wrapper Component

**Priority**: High  
**Dependencies**: T-007  
**Estimated Time**: 2 hours

##### Context & Purpose
**As a** developer  
**I need** a wrapper component that associates DOM elements with chunk IDs  
**So that** text selection can identify which chunk is being annotated

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When wrapper renders, it shall add data-chunk-id attribute to DOM
- REQ-2: When annotations exist for chunk, they shall be rendered as overlay
- REQ-3: When wrapper has multiple children, it shall preserve layout
- REQ-4: Wrapper shall not interfere with markdown styling

**Performance Requirements**:
- No additional render overhead
- Annotation overlay renders with CSS only (no JS repositioning)

##### Implementation Details

**Files to Create**:
```
src/components/reader/
└── ChunkWrapper.tsx    # CREATE - Chunk-level annotation wrapper
```

**Component Structure**:
```typescript
'use client'

import { ReactNode } from 'react'
import { AnnotationLayer } from './AnnotationLayer'
import type { StoredAnnotation } from '@/types/annotations'

interface ChunkWrapperProps {
  chunkId: string
  children: ReactNode
  annotations: StoredAnnotation[]
}

/**
 * Wraps markdown content with chunk identification and annotation overlays.
 * Provides data-chunk-id attribute for text selection capture.
 */
export function ChunkWrapper({
  chunkId,
  children,
  annotations
}: ChunkWrapperProps) {
  // Filter annotations for this specific chunk
  const chunkAnnotations = annotations.filter(
    annotation => annotation.components.source?.chunk_id === chunkId
  )
  
  return (
    <div 
      data-chunk-id={chunkId} 
      className="relative chunk-wrapper"
      style={{ position: 'relative' }}
    >
      {/* Render annotation highlights as overlay */}
      {chunkAnnotations.length > 0 && (
        <AnnotationLayer 
          annotations={chunkAnnotations} 
          chunkId={chunkId} 
        />
      )}
      
      {/* Original markdown content */}
      {children}
    </div>
  )
}
```

**Code Pattern Reference**:
- **Data Attributes**: Standard HTML pattern for storing metadata
- **Relative Positioning**: Required for absolute-positioned overlays

##### Acceptance Criteria

**Scenario 1: Chunk ID accessible via DOM**
```gherkin
Given ChunkWrapper renders with chunkId="chunk-123"
When DOM element is inspected
Then data-chunk-id attribute equals "chunk-123"
And text selection can extract chunkId
```

**Scenario 2: Annotations render as overlay**
```gherkin
Given chunk has 2 annotations
When ChunkWrapper renders
Then AnnotationLayer renders with 2 highlights
And highlights position over text correctly
```

**Scenario 3: Layout preserved**
```gherkin
Given ChunkWrapper contains paragraph with images
When wrapper renders
Then markdown layout is unchanged
And images display correctly
And text flow is unaffected
```

**Checklist**:
- [ ] data-chunk-id attribute added to DOM
- [ ] AnnotationLayer renders when annotations exist
- [ ] Relative positioning applied
- [ ] Children render without modification
- [ ] No layout interference
- [ ] TypeScript types correct

##### Manual Testing Steps
1. Open document reader with annotations
2. Inspect DOM element for chunk wrapper
3. Verify data-chunk-id attribute present
4. Verify AnnotationLayer renders if annotations exist
5. Test text selection captures chunk ID correctly
6. Verify markdown styling unchanged

---

#### Task T-009: Create Annotation Layer Component

**Priority**: High  
**Dependencies**: T-008  
**Estimated Time**: 4 hours

##### Context & Purpose
**As a** user  
**I need** highlight overlays that render over text  
**So that** I can visually see my annotations while reading

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When annotations exist, they shall render as CSS overlays with position absolute
- REQ-2: When multiple annotations overlap, they shall stack with z-index based on timestamp
- REQ-3: When annotation is clicked, details shall appear in HoverCard
- REQ-4: Colors shall be yellow, green, blue, red, purple with 30% opacity
- REQ-5: When confidence <0.7, confidence badge shall display

**Performance Requirements**:
- Highlight rendering via CSS only (no JavaScript positioning)
- Smooth hover transitions
- No layout thrashing

##### Implementation Details

**Files to Create**:
```
src/components/reader/
└── AnnotationLayer.tsx    # CREATE - Highlight overlay system
```

**Component Structure**:
```typescript
'use client'

import { useState } from 'react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { showConfidenceBadge } from '@/lib/annotations/fuzzy-restore'
import type { StoredAnnotation } from '@/types/annotations'

interface AnnotationLayerProps {
  annotations: StoredAnnotation[]
  chunkId: string
}

/**
 * Renders annotation highlights as CSS overlays using position absolute.
 * Handles overlapping annotations with z-index stacking.
 */
export function AnnotationLayer({ annotations, chunkId }: AnnotationLayerProps) {
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null)
  
  return (
    <>
      {annotations.map(annotation => {
        const { color } = annotation.components.annotation
        const { startOffset, endOffset, confidence } = annotation.components.position
        const timestamp = new Date(annotation.created_at).getTime()
        
        return (
          <HoverCard key={annotation.id}>
            <HoverCardTrigger asChild>
              <div
                data-annotation-id={annotation.id}
                className={`absolute pointer-events-auto cursor-pointer transition-opacity hover:opacity-100 ${getColorClass(color)}`}
                style={{
                  left: 0,
                  right: 0,
                  // Position based on character offsets (simplified for MVP)
                  top: `${calculateTopPosition(startOffset)}px`,
                  height: `${calculateHeight(startOffset, endOffset)}px`,
                  zIndex: timestamp, // Stack by creation time
                  opacity: activeAnnotation === annotation.id ? 1 : 0.3,
                  mixBlendMode: 'multiply' // Better overlapping visual
                }}
                onClick={() => setActiveAnnotation(annotation.id)}
              />
            </HoverCardTrigger>
            
            <HoverCardContent side="right" className="w-80">
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{annotation.components.annotation.text}</p>
                  {confidence && showConfidenceBadge(confidence)}
                </div>
                
                {annotation.components.annotation.note && (
                  <p className="text-sm text-muted-foreground">
                    {annotation.components.annotation.note}
                  </p>
                )}
                
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm">Edit</Button>
                  <Button variant="destructive" size="sm">Delete</Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </>
  )
}

/**
 * Maps annotation color to Tailwind class.
 */
function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    yellow: 'bg-yellow-200',
    green: 'bg-green-200',
    blue: 'bg-blue-200',
    red: 'bg-red-200',
    purple: 'bg-purple-200'
  }
  return colorMap[color] || 'bg-yellow-200'
}

/**
 * Calculates top position based on character offset.
 * Simplified heuristic for MVP (replace with Range.getBoundingClientRect in production).
 */
function calculateTopPosition(startOffset: number): number {
  // Rough approximation: 20px per line, 80 chars per line
  const lineNumber = Math.floor(startOffset / 80)
  return lineNumber * 20
}

/**
 * Calculates highlight height based on text length.
 * Simplified heuristic for MVP.
 */
function calculateHeight(startOffset: number, endOffset: number): number {
  const chars = endOffset - startOffset
  const lines = Math.ceil(chars / 80)
  return lines * 20
}
```

**Code Pattern Reference**:
- **HoverCard Pattern**: Follow shadcn/ui examples
- **Z-index Stacking**: Timestamp-based ordering (earlier = lower layer)

##### Acceptance Criteria

**Scenario 1: Highlights render correctly**
```gherkin
Given chunk has 3 annotations
When AnnotationLayer renders
Then 3 highlight overlays appear
And each has correct color with 30% opacity
And overlays position over corresponding text
```

**Scenario 2: Overlapping annotations stack**
```gherkin
Given two annotations at same position
When AnnotationLayer renders
Then both highlights visible
And newer annotation has higher z-index
And both clickable
```

**Scenario 3: HoverCard shows details**
```gherkin
Given annotation has note
When user hovers over highlight
Then HoverCard appears
And shows annotation text
And shows note content
And shows Edit/Delete buttons
```

**Scenario 4: Confidence badge displays**
```gherkin
Given annotation with confidence 0.6
When AnnotationLayer renders
Then confidence badge shows "Position approximate"
And badge has outline variant
```

**Checklist**:
- [ ] Highlights render with CSS positioning
- [ ] Color classes applied correctly
- [ ] Z-index stacking by timestamp
- [ ] HoverCard integration works
- [ ] Confidence badges display
- [ ] Edit/Delete buttons functional
- [ ] No layout interference

##### Manual Testing Steps
1. Create annotation on document
2. Verify highlight appears over text
3. Create second annotation at same position
4. Verify both highlights visible
5. Hover over highlight
6. Verify HoverCard appears
7. Click Edit button
8. Verify edit functionality works
9. Test with annotation that has low confidence
10. Verify confidence badge displays

---

#### Task T-010: Create Right Panel Container

**Priority**: High  
**Dependencies**: T-008  
**Estimated Time**: 3 hours

##### Context & Purpose
**As a** user  
**I need** a right panel that shows connections and annotations  
**So that** I can explore related content without leaving the reader

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When panel opens, it shall display Tabs (Connections/Annotations)
- REQ-2: When collapsed, panel shall show collapse button only
- REQ-3: When panel animates, it shall use Framer Motion spring animation
- REQ-4: Panel shall be fixed to right edge with z-index 40

**Performance Requirements**:
- Animation duration < 300ms
- No layout shift during animation
- Smooth 60fps transitions

##### Implementation Details

**Files to Create**:
```
src/components/sidebar/
└── RightPanel.tsx    # CREATE - Tabs container
```

**Code Pattern Reference**:
- **Panel Layout**: Follow `src/components/layout/ProcessingDock.tsx` (lines 111-156)
- **Framer Motion**: Use spring animation with damping: 25

**Component Structure**:
```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ConnectionsList } from './ConnectionsList'
import { AnnotationsList } from './AnnotationsList'

interface RightPanelProps {
  documentId: string
}

/**
 * Fixed right panel with Connections and Annotations tabs.
 * Follows ProcessingDock.tsx collapse/expand pattern.
 */
export function RightPanel({ documentId }: RightPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'connections' | 'annotations'>('connections')
  
  return (
    <motion.div
      className="fixed right-0 top-0 bottom-0 border-l z-40 bg-background"
      initial={false}
      animate={{ 
        width: collapsed ? 48 : 384 // w-12 : w-96
      }}
      transition={{ 
        type: 'spring', 
        damping: 25, 
        stiffness: 300 
      }}
    >
      {/* Toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-4 top-8 z-50 rounded-full border bg-background shadow-md"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      
      {/* Panel content (hidden when collapsed) */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 m-4">
                <TabsTrigger value="connections">Connections</TabsTrigger>
                <TabsTrigger value="annotations">Annotations</TabsTrigger>
              </TabsList>
              
              <TabsContent value="connections" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <ConnectionsList documentId={documentId} />
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="annotations" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <AnnotationsList documentId={documentId} />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Panel toggles smoothly**
```gherkin
Given panel is expanded
When user clicks collapse button
Then panel animates to 48px width in <300ms
And button icon changes to ChevronLeft
And content fades out
```

**Scenario 2: Tabs switch correctly**
```gherkin
Given panel is expanded with Connections tab active
When user clicks Annotations tab
Then Annotations tab becomes active
And ConnectionsList unmounts
And AnnotationsList renders
```

**Scenario 3: ScrollArea handles overflow**
```gherkin
Given ConnectionsList has 50 items
When panel renders
Then ScrollArea shows scrollbar
And content scrolls smoothly
And no horizontal overflow
```

**Checklist**:
- [ ] Panel fixed to right edge
- [ ] Collapse/expand animation smooth
- [ ] Tabs switch correctly
- [ ] ScrollArea handles overflow
- [ ] Button positioned correctly
- [ ] No layout shift during animation

##### Manual Testing Steps
1. Open document reader
2. Verify right panel visible
3. Click collapse button
4. Verify panel animates to collapsed state
5. Click expand button
6. Verify panel animates to expanded state
7. Switch between Connections and Annotations tabs
8. Verify tab content switches correctly
9. Scroll content to test ScrollArea
10. Verify smooth scrolling with no jank

---

#### Task T-011: Create Mock Connection Dataset

**Priority**: Medium  
**Dependencies**: None (can work in parallel)  
**Estimated Time**: 2 hours

##### Context & Purpose
**As a** developer  
**I need** realistic mock connection data  
**So that** weight tuning UI can be tested before synthesis engines are built

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When dataset is imported, it shall provide 50 mock connections
- REQ-2: When grouped by engine, each of 7 engines shall have 7+ examples
- REQ-3: Strength distribution shall be: 10 weak (0.3-0.5), 25 medium (0.5-0.7), 15 strong (0.7-1.0)
- REQ-4: Schema shall match real connections table exactly

**Data Requirements**:
- 7 engine types: semantic, thematic, structural, contradiction, emotional, methodological, temporal
- 6 connection types: supports, contradicts, extends, references, parallels, challenges
- Realistic explanations (not placeholder text)
- Diverse target snippets from various domains

##### Implementation Details

**Files to Create**:
```
src/lib/annotations/
└── mock-connections.ts    # CREATE - Mock connection dataset
```

**Data Structure**:
```typescript
import type { MockConnection } from '@/types/annotations'

/**
 * Mock connection dataset for weight tuning UI testing.
 * Schema matches real connections table exactly.
 * 
 * Distribution:
 * - 7 examples per engine type (7 engines × 7 = 49 connections)
 * - Strength: 10 weak (0.3-0.5), 25 medium (0.5-0.7), 15 strong (0.7-1.0)
 * - Diverse connection types and explanations
 */
export const MOCK_CONNECTIONS: MockConnection[] = [
  // ===== SEMANTIC ENGINE (7 examples) =====
  {
    id: 'mock-sem-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc2-chunk12',
    target_document_title: 'Deep Learning Fundamentals',
    target_snippet: 'Neural networks learn hierarchical representations by composing simple features into complex patterns...',
    engine_type: 'semantic',
    connection_type: 'supports',
    strength: 0.92,
    explanation: 'Both discuss hierarchical feature learning in neural architectures'
  },
  {
    id: 'mock-sem-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc3-chunk8',
    target_document_title: 'Information Theory',
    target_snippet: 'Entropy measures the uncertainty in a probability distribution...',
    engine_type: 'semantic',
    connection_type: 'extends',
    strength: 0.78,
    explanation: 'Extends discussion with formal information-theoretic framework'
  },
  {
    id: 'mock-sem-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc4-chunk5',
    target_document_title: 'Cognitive Science Perspectives',
    target_snippet: 'The brain processes information through distributed representations across cortical regions...',
    engine_type: 'semantic',
    connection_type: 'parallels',
    strength: 0.65,
    explanation: 'Parallel concepts between artificial and biological neural processing'
  },
  {
    id: 'mock-sem-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc5-chunk19',
    target_document_title: 'Signal Processing Basics',
    target_snippet: 'Fourier transforms decompose signals into frequency components...',
    engine_type: 'semantic',
    connection_type: 'references',
    strength: 0.58,
    explanation: 'References shared mathematical foundations in signal analysis'
  },
  {
    id: 'mock-sem-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc6-chunk3',
    target_document_title: 'Pattern Recognition Methods',
    target_snippet: 'Template matching compares input against stored prototypes...',
    engine_type: 'semantic',
    connection_type: 'supports',
    strength: 0.71,
    explanation: 'Both address pattern matching mechanisms'
  },
  {
    id: 'mock-sem-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc7-chunk14',
    target_document_title: 'Statistical Learning Theory',
    target_snippet: 'Generalization bounds depend on model complexity and sample size...',
    engine_type: 'semantic',
    connection_type: 'extends',
    strength: 0.45,
    explanation: 'Provides theoretical foundation for generalization concepts'
  },
  {
    id: 'mock-sem-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc8-chunk21',
    target_document_title: 'Quantum Computing Primer',
    target_snippet: 'Superposition allows quantum bits to represent multiple states simultaneously...',
    engine_type: 'semantic',
    connection_type: 'parallels',
    strength: 0.38,
    explanation: 'Weak semantic similarity in information representation concepts'
  },

  // ===== THEMATIC ENGINE (7 examples) =====
  {
    id: 'mock-them-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc9-chunk7',
    target_document_title: 'The Structure of Scientific Revolutions',
    target_snippet: 'Paradigm shifts occur when anomalies accumulate and force reconsideration of foundational assumptions...',
    engine_type: 'thematic',
    connection_type: 'parallels',
    strength: 0.87,
    explanation: 'Both explore how fundamental frameworks evolve through crisis and breakthrough'
  },
  {
    id: 'mock-them-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc10-chunk15',
    target_document_title: 'Innovation and Creativity',
    target_snippet: 'Breakthrough innovations emerge from recombining existing ideas in novel configurations...',
    engine_type: 'thematic',
    connection_type: 'supports',
    strength: 0.79,
    explanation: 'Shared theme of emergence from combinatorial processes'
  },
  {
    id: 'mock-them-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc11-chunk4',
    target_document_title: 'Complex Systems Theory',
    target_snippet: 'Self-organization arises from local interactions without central control...',
    engine_type: 'thematic',
    connection_type: 'extends',
    strength: 0.72,
    explanation: 'Extends theme of emergent properties in distributed systems'
  },
  {
    id: 'mock-them-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc12-chunk9',
    target_document_title: 'Historical Patterns in Technology',
    target_snippet: 'General-purpose technologies transform entire economic sectors over decades...',
    engine_type: 'thematic',
    connection_type: 'parallels',
    strength: 0.64,
    explanation: 'Similar themes of transformative impact across domains'
  },
  {
    id: 'mock-them-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc13-chunk18',
    target_document_title: 'Evolution of Language',
    target_snippet: 'Languages evolve through gradual drift and occasional rapid shifts...',
    engine_type: 'thematic',
    connection_type: 'parallels',
    strength: 0.55,
    explanation: 'Thematic parallel in evolutionary dynamics'
  },
  {
    id: 'mock-them-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc14-chunk6',
    target_document_title: 'Social Network Dynamics',
    target_snippet: 'Information cascades propagate through network structures based on connectivity patterns...',
    engine_type: 'thematic',
    connection_type: 'supports',
    strength: 0.48,
    explanation: 'Weak thematic connection around propagation dynamics'
  },
  {
    id: 'mock-them-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc15-chunk11',
    target_document_title: 'Market Efficiency Debates',
    target_snippet: 'Asset prices reflect all available information in efficient markets...',
    engine_type: 'thematic',
    connection_type: 'references',
    strength: 0.35,
    explanation: 'Tangential thematic link through information processing'
  },

  // ===== STRUCTURAL ENGINE (7 examples) =====
  {
    id: 'mock-struct-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc16-chunk13',
    target_document_title: 'Architectural Patterns in Software',
    target_snippet: 'The Model-View-Controller pattern separates concerns into three interconnected components...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.85,
    explanation: 'Isomorphic structural decomposition into modular components'
  },
  {
    id: 'mock-struct-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc17-chunk2',
    target_document_title: 'Graph Theory Applications',
    target_snippet: 'Tree structures provide hierarchical organization with parent-child relationships...',
    engine_type: 'structural',
    connection_type: 'supports',
    strength: 0.76,
    explanation: 'Both rely on hierarchical tree structures'
  },
  {
    id: 'mock-struct-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc18-chunk20',
    target_document_title: 'Biological Systems Organization',
    target_snippet: 'Organs compose tissues, tissues compose cells, cells compose molecules...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.69,
    explanation: 'Structural similarity in nested compositional hierarchy'
  },
  {
    id: 'mock-struct-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc19-chunk16',
    target_document_title: 'Linguistic Syntax Trees',
    target_snippet: 'Sentences parse into phrase structures with nested constituents...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.61,
    explanation: 'Shared tree-structured parsing approach'
  },
  {
    id: 'mock-struct-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc20-chunk8',
    target_document_title: 'Database Normalization',
    target_snippet: 'Third normal form eliminates transitive dependencies between attributes...',
    engine_type: 'structural',
    connection_type: 'extends',
    strength: 0.53,
    explanation: 'Extends structural organization principles to data modeling'
  },
  {
    id: 'mock-struct-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc21-chunk5',
    target_document_title: 'Mathematical Proof Strategies',
    target_snippet: 'Inductive proofs establish base cases then prove recursive steps...',
    engine_type: 'structural',
    connection_type: 'supports',
    strength: 0.44,
    explanation: 'Similar structural approach to building arguments'
  },
  {
    id: 'mock-struct-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc22-chunk17',
    target_document_title: 'Urban Planning Principles',
    target_snippet: 'Neighborhoods organize around central hubs with radial connections...',
    engine_type: 'structural',
    connection_type: 'parallels',
    strength: 0.32,
    explanation: 'Weak structural analogy in hub-spoke organization'
  },

  // ===== CONTRADICTION ENGINE (7 examples) =====
  {
    id: 'mock-contra-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc23-chunk10',
    target_document_title: 'Critique of Pure Reason',
    target_snippet: 'Empiricism alone cannot generate necessary truths about the world...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.91,
    explanation: 'Direct contradiction on epistemological foundations'
  },
  {
    id: 'mock-contra-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc24-chunk14',
    target_document_title: 'Alternative Perspectives on Learning',
    target_snippet: 'Explicit instruction outperforms discovery learning in novice domains...',
    engine_type: 'contradiction',
    connection_type: 'challenges',
    strength: 0.82,
    explanation: 'Contradicts assumptions about optimal learning approaches'
  },
  {
    id: 'mock-contra-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc25-chunk7',
    target_document_title: 'Counterexamples in Mathematics',
    target_snippet: 'Cantor\'s diagonal argument proves some infinities are larger than others...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.74,
    explanation: 'Provides counterexample to intuitive size assumptions'
  },
  {
    id: 'mock-contra-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc26-chunk19',
    target_document_title: 'Economic Policy Debates',
    target_snippet: 'Evidence suggests minimum wage increases reduce employment opportunities...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.67,
    explanation: 'Contradicts policy assumptions with empirical evidence'
  },
  {
    id: 'mock-contra-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc27-chunk3',
    target_document_title: 'Cognitive Biases Research',
    target_snippet: 'Experts exhibit confirmation bias despite methodological training...',
    engine_type: 'contradiction',
    connection_type: 'challenges',
    strength: 0.56,
    explanation: 'Challenges assumptions about expertise and objectivity'
  },
  {
    id: 'mock-contra-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc28-chunk12',
    target_document_title: 'Historical Revisionism',
    target_snippet: 'New archaeological evidence contradicts previous chronologies...',
    engine_type: 'contradiction',
    connection_type: 'contradicts',
    strength: 0.49,
    explanation: 'Evidence-based contradiction of established timelines'
  },
  {
    id: 'mock-contra-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc29-chunk16',
    target_document_title: 'Alternative Explanatory Models',
    target_snippet: 'Correlation does not imply causation in observational studies...',
    engine_type: 'contradiction',
    connection_type: 'challenges',
    strength: 0.37,
    explanation: 'Challenges inferential assumptions weakly'
  },

  // ===== EMOTIONAL ENGINE (7 examples) =====
  {
    id: 'mock-emot-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc30-chunk9',
    target_document_title: 'The Emotional Brain',
    target_snippet: 'Fear responses bypass conscious processing through amygdala pathways...',
    engine_type: 'emotional',
    connection_type: 'supports',
    strength: 0.68,
    explanation: 'Shared emotional resonance around fear and urgency'
  },
  {
    id: 'mock-emot-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc31-chunk6',
    target_document_title: 'Narrative and Empathy',
    target_snippet: 'Stories activate mirror neurons and foster emotional understanding...',
    engine_type: 'emotional',
    connection_type: 'extends',
    strength: 0.61,
    explanation: 'Extends emotional dimension through narrative mechanisms'
  },
  {
    id: 'mock-emot-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc32-chunk18',
    target_document_title: 'Motivation and Goal-Setting',
    target_snippet: 'Intrinsic motivation sustains effort better than external rewards...',
    engine_type: 'emotional',
    connection_type: 'supports',
    strength: 0.54,
    explanation: 'Connected through emotional satisfaction and drive'
  },
  {
    id: 'mock-emot-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc33-chunk11',
    target_document_title: 'Aesthetic Experience',
    target_snippet: 'Beauty elicits pleasure through harmony and proportion...',
    engine_type: 'emotional',
    connection_type: 'parallels',
    strength: 0.47,
    explanation: 'Parallel emotional responses to structured patterns'
  },
  {
    id: 'mock-emot-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc34-chunk4',
    target_document_title: 'Stress and Performance',
    target_snippet: 'Optimal arousal follows an inverted-U curve...',
    engine_type: 'emotional',
    connection_type: 'references',
    strength: 0.42,
    explanation: 'References emotional state impact on cognition'
  },
  {
    id: 'mock-emot-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc35-chunk15',
    target_document_title: 'Social Connection and Well-being',
    target_snippet: 'Loneliness activates pain circuitry in the brain...',
    engine_type: 'emotional',
    connection_type: 'supports',
    strength: 0.39,
    explanation: 'Weak emotional link through social pain'
  },
  {
    id: 'mock-emot-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc36-chunk8',
    target_document_title: 'Decision-Making Under Uncertainty',
    target_snippet: 'Risk aversion intensifies under emotional duress...',
    engine_type: 'emotional',
    connection_type: 'extends',
    strength: 0.31,
    explanation: 'Tangential emotional dimension in decision contexts'
  },

  // ===== METHODOLOGICAL ENGINE (7 examples) =====
  {
    id: 'mock-method-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc37-chunk13',
    target_document_title: 'Experimental Design Principles',
    target_snippet: 'Randomized controlled trials minimize confounding variables...',
    engine_type: 'methodological',
    connection_type: 'supports',
    strength: 0.89,
    explanation: 'Both apply rigorous experimental methodology'
  },
  {
    id: 'mock-method-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc38-chunk7',
    target_document_title: 'Statistical Power Analysis',
    target_snippet: 'Sample size calculations ensure adequate power to detect effects...',
    engine_type: 'methodological',
    connection_type: 'extends',
    strength: 0.81,
    explanation: 'Extends methodological rigor through power considerations'
  },
  {
    id: 'mock-method-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc39-chunk20',
    target_document_title: 'Qualitative Research Methods',
    target_snippet: 'Grounded theory builds concepts inductively from data patterns...',
    engine_type: 'methodological',
    connection_type: 'parallels',
    strength: 0.73,
    explanation: 'Parallel but different methodological approaches'
  },
  {
    id: 'mock-method-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc40-chunk2',
    target_document_title: 'Meta-Analysis Techniques',
    target_snippet: 'Combining effect sizes across studies increases statistical precision...',
    engine_type: 'methodological',
    connection_type: 'extends',
    strength: 0.66,
    explanation: 'Methodologically extends through synthesis techniques'
  },
  {
    id: 'mock-method-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc41-chunk17',
    target_document_title: 'Measurement Validity',
    target_snippet: 'Construct validity requires convergent and discriminant evidence...',
    engine_type: 'methodological',
    connection_type: 'supports',
    strength: 0.59,
    explanation: 'Supports similar measurement quality concerns'
  },
  {
    id: 'mock-method-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc42-chunk10',
    target_document_title: 'Causal Inference Frameworks',
    target_snippet: 'Potential outcomes clarify causal estimands in observational data...',
    engine_type: 'methodological',
    connection_type: 'extends',
    strength: 0.51,
    explanation: 'Extends causal reasoning methodology'
  },
  {
    id: 'mock-method-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc43-chunk5',
    target_document_title: 'Reproducibility in Science',
    target_snippet: 'Preregistration reduces researcher degrees of freedom...',
    engine_type: 'methodological',
    connection_type: 'supports',
    strength: 0.43,
    explanation: 'Weak methodological alignment on transparency'
  },

  // ===== TEMPORAL ENGINE (7 examples) =====
  {
    id: 'mock-temp-1',
    source_chunk_id: 'current',
    target_chunk_id: 'doc44-chunk12',
    target_document_title: 'Historical Precedents',
    target_snippet: 'The printing press democratized knowledge centuries before the internet...',
    engine_type: 'temporal',
    connection_type: 'parallels',
    strength: 0.77,
    explanation: 'Historical precedent shows similar technological disruption pattern'
  },
  {
    id: 'mock-temp-2',
    source_chunk_id: 'current',
    target_chunk_id: 'doc45-chunk16',
    target_document_title: 'Technological Forecasting',
    target_snippet: 'Moore\'s Law predicted exponential transistor density growth for decades...',
    engine_type: 'temporal',
    connection_type: 'extends',
    strength: 0.69,
    explanation: 'Extends temporal pattern into future projections'
  },
  {
    id: 'mock-temp-3',
    source_chunk_id: 'current',
    target_chunk_id: 'doc46-chunk9',
    target_document_title: 'Evolution of Ideas',
    target_snippet: 'Scientific paradigms evolve through gradual accumulation and sudden shifts...',
    engine_type: 'temporal',
    connection_type: 'parallels',
    strength: 0.62,
    explanation: 'Similar temporal pattern of punctuated equilibrium'
  },
  {
    id: 'mock-temp-4',
    source_chunk_id: 'current',
    target_chunk_id: 'doc47-chunk3',
    target_document_title: 'Historical Cycles',
    target_snippet: 'Economic cycles alternate between expansion and contraction phases...',
    engine_type: 'temporal',
    connection_type: 'references',
    strength: 0.55,
    explanation: 'References cyclical temporal patterns'
  },
  {
    id: 'mock-temp-5',
    source_chunk_id: 'current',
    target_chunk_id: 'doc48-chunk19',
    target_document_title: 'Development Trajectories',
    target_snippet: 'Children acquire language in predictable developmental stages...',
    engine_type: 'temporal',
    connection_type: 'parallels',
    strength: 0.48,
    explanation: 'Parallel staged temporal progression'
  },
  {
    id: 'mock-temp-6',
    source_chunk_id: 'current',
    target_chunk_id: 'doc49-chunk14',
    target_document_title: 'Institutional Evolution',
    target_snippet: 'Organizations ossify as bureaucratic structures accumulate over time...',
    engine_type: 'temporal',
    connection_type: 'extends',
    strength: 0.41,
    explanation: 'Extends temporal degradation pattern to institutions'
  },
  {
    id: 'mock-temp-7',
    source_chunk_id: 'current',
    target_chunk_id: 'doc50-chunk6',
    target_document_title: 'Climate Change Projections',
    target_snippet: 'Temperature increases accelerate nonlinearly with cumulative emissions...',
    engine_type: 'temporal',
    connection_type: 'references',
    strength: 0.34,
    explanation: 'Weak temporal link through nonlinear progression'
  },
]
```

##### Acceptance Criteria

**Scenario 1: Dataset has 50 connections**
```gherkin
Given MOCK_CONNECTIONS is imported
When length is checked
Then it equals 50
And each connection has all required fields
```

**Scenario 2: Engine distribution correct**
```gherkin
Given connections are grouped by engine_type
When counts are calculated
Then each of 7 engines has 7 examples
And all engine types are represented
```

**Scenario 3: Strength distribution correct**
```gherkin
Given connections are grouped by strength
When ranges are checked
Then 10 connections have strength 0.3-0.5
And 25 connections have strength 0.5-0.7
And 15 connections have strength 0.7-1.0
```

**Checklist**:
- [ ] 50 total connections
- [ ] 7 examples per engine type
- [ ] Strength distribution correct
- [ ] Realistic explanations (not placeholders)
- [ ] Schema matches real connections table
- [ ] TypeScript types validate

##### Manual Testing Steps
1. Import MOCK_CONNECTIONS in test file
2. Log length to console
3. Verify equals 50
4. Group by engine_type
5. Verify each engine has 7 examples
6. Check strength distribution
7. Verify realistic explanations

---

#### Task T-012: Create Connections List Component

**Priority**: High  
**Dependencies**: T-010, T-011  
**Estimated Time**: 4 hours

##### Context & Purpose
**As a** user  
**I need** to see connections grouped by engine type  
**So that** I can explore related content organized by connection engine

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When connections load, they shall be grouped by engine_type
- REQ-2: When engine section clicked, it shall expand/collapse
- REQ-3: When connection card clicked, it shall navigate to target chunk
- REQ-4: When weights change, connections shall re-rank in real-time
- REQ-5: Strength shall be visualized with progress bars

**Performance Requirements**:
- Connection filtering and sorting < 100ms (target from PRP)
- Smooth expand/collapse animations
- No layout shift during re-ranking

##### Implementation Details

**Files to Create**:
```
src/components/sidebar/
├── ConnectionsList.tsx    # CREATE - Main connections list
└── ConnectionCard.tsx     # CREATE - Individual connection card
```

**ConnectionsList Component**:
```typescript
'use client'

import { useMemo } from 'react'
import { useAnnotationStore } from '@/stores/annotation-store'
import { MOCK_CONNECTIONS } from '@/lib/annotations/mock-connections'
import { ConnectionCard } from './ConnectionCard'
import { CollapsibleSection } from './CollapsibleSection'
import type { MockConnection } from '@/types/annotations'

interface ConnectionsListProps {
  documentId: string
}

/**
 * Displays mock connections grouped by engine type.
 * Re-ranks connections in real-time based on weight tuning.
 */
export function ConnectionsList({ documentId }: ConnectionsListProps) {
  const { weights, enabledEngines, strengthThreshold } = useAnnotationStore()
  
  // Filter and re-rank connections (CRITICAL: must be <100ms)
  const filteredConnections = useMemo(() => {
    const start = performance.now()
    
    const result = MOCK_CONNECTIONS
      .filter(c => enabledEngines.has(c.engine_type))
      .filter(c => c.strength >= strengthThreshold)
      .map(c => ({
        ...c,
        weightedStrength: c.strength * weights[c.engine_type]
      }))
      .sort((a, b) => b.weightedStrength - a.weightedStrength)
    
    const duration = performance.now() - start
    if (duration > 100) {
      console.warn(`Connection re-ranking took ${duration}ms (target: <100ms)`)
    }
    
    return result
  }, [weights, enabledEngines, strengthThreshold])
  
  // Group by engine type
  const grouped = useMemo(() => {
    return filteredConnections.reduce((acc, conn) => {
      if (!acc[conn.engine_type]) {
        acc[conn.engine_type] = []
      }
      acc[conn.engine_type].push(conn)
      return acc
    }, {} as Record<string, typeof filteredConnections>)
  }, [filteredConnections])
  
  // Engine labels and colors
  const engineMeta: Record<string, { label: string; color: string }> = {
    semantic: { label: 'Semantic', color: 'blue' },
    thematic: { label: 'Thematic', color: 'purple' },
    structural: { label: 'Structural', color: 'green' },
    contradiction: { label: 'Contradiction', color: 'red' },
    emotional: { label: 'Emotional', color: 'pink' },
    methodological: { label: 'Methodological', color: 'orange' },
    temporal: { label: 'Temporal', color: 'yellow' }
  }
  
  if (filteredConnections.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No connections match current filters
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Adjust weights or enable more engines
        </p>
      </div>
    )
  }
  
  return (
    <div className="space-y-2 p-4">
      {Object.entries(grouped).map(([engineType, connections]) => {
        const meta = engineMeta[engineType]
        
        return (
          <CollapsibleSection
            key={engineType}
            title={meta.label}
            count={connections.length}
            color={meta.color}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {connections.map(connection => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  documentId={documentId}
                />
              ))}
            </div>
          </CollapsibleSection>
        )
      })}
    </div>
  )
}
```

**ConnectionCard Component**:
```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ExternalLink } from 'lucide-react'
import type { MockConnection } from '@/types/annotations'

interface ConnectionCardProps {
  connection: MockConnection & { weightedStrength?: number }
  documentId: string
}

/**
 * Individual connection card with strength visualization.
 * Provides navigation to target chunk and validation actions.
 */
export function ConnectionCard({ connection, documentId }: ConnectionCardProps) {
  const strength = connection.weightedStrength || connection.strength
  
  function handleNavigate() {
    // Navigate to target chunk (implement in Phase 2)
    console.log('Navigate to:', connection.target_chunk_id)
  }
  
  return (
    <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {connection.connection_type}
              </Badge>
              <Progress value={strength * 100} className="w-16 h-2" />
              <span className="text-xs text-muted-foreground">
                {(strength * 100).toFixed(0)}%
              </span>
            </div>
            <h4 className="text-sm font-medium">{connection.target_document_title}</h4>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleNavigate}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {connection.target_snippet}
        </p>
        <p className="text-xs text-muted-foreground mt-2 italic">
          {connection.explanation}
        </p>
      </CardContent>
    </Card>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Connections grouped correctly**
```gherkin
Given 50 mock connections
When ConnectionsList renders
Then connections are grouped by engine_type
And each group shows count
And groups are collapsible
```

**Scenario 2: Re-ranking on weight change**
```gherkin
Given ConnectionsList displays 50 connections
When user changes semantic weight from 0.5 to 1.0
Then connections re-rank in <100ms
And semantic connections move higher
And visual feedback shows re-sorting
```

**Scenario 3: Filtering works**
```gherkin
Given all engines enabled
When user disables "emotional" engine
Then emotional connections disappear
And other connections remain
And counts update
```

**Checklist**:
- [ ] Connections grouped by engine
- [ ] Collapsible sections functional
- [ ] Re-ranking <100ms (measured)
- [ ] Strength visualized with progress bars
- [ ] Empty state when no connections
- [ ] Navigation button present

##### Manual Testing Steps
1. Open document reader with right panel
2. Verify connections grouped by engine
3. Click engine section header
4. Verify section expands/collapses
5. Adjust weight slider
6. Verify connections re-rank
7. Check console for performance log
8. Disable engine
9. Verify connections filtered
10. Test with all engines disabled
11. Verify empty state message

---

#### Task T-013: Create Weight Tuning Component

**Priority**: Critical  
**Dependencies**: T-002, T-012  
**Estimated Time**: 4 hours

##### Context & Purpose
**As a** user  
**I need** a weight tuning interface with sliders and presets  
**So that** I can adjust engine weights and test connection synthesis in real-time

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When weight slider changes, connections shall re-rank in <100ms
- REQ-2: When preset applied, all 7 weights shall update simultaneously
- REQ-3: When weight value changes, display shall show current value (0.00-1.00)
- REQ-4: Each engine shall have independent weight control (0.0-1.0 range)
- REQ-5: 4 presets shall be available: Max Friction, Thematic Focus, Balanced, Chaos

**Performance Requirements**:
- Weight updates must trigger re-ranking in <100ms (target from PRP)
- Slider interactions must feel instant (<50ms response)
- No UI blocking during re-ranking calculations

**UX Requirements**:
- Visual feedback on weight changes (connection cards re-sort)
- Current weight value displayed next to each slider
- Clear preset button labels with descriptive names

##### Implementation Details

**Files to Create**:
```
src/components/sidebar/
└── WeightTuning.tsx    # CREATE - Weight sliders and presets
```

**Dependencies**:
- Slider component (shadcn/ui)
- Label component (shadcn/ui)
- Button component (shadcn/ui)
- Separator component (shadcn/ui)
- Zustand annotation store (from T-002)

**Component Structure**:
```typescript
'use client'

import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAnnotationStore } from '@/stores/annotation-store'
import type { EngineWeights, WeightPreset } from '@/types/annotations'

const ENGINE_LABELS: Record<keyof EngineWeights, string> = {
  semantic: 'Semantic',
  thematic: 'Thematic',
  structural: 'Structural',
  contradiction: 'Contradiction',
  emotional: 'Emotional',
  methodological: 'Methodological',
  temporal: 'Temporal'
}

const PRESETS: Record<WeightPreset, EngineWeights> = {
  'max-friction': {
    semantic: 0.3,
    thematic: 0.9,
    structural: 0.7,
    contradiction: 1.0,
    emotional: 0.4,
    methodological: 0.8,
    temporal: 0.2
  },
  'thematic-focus': {
    semantic: 0.4,
    thematic: 1.0,
    structural: 0.5,
    contradiction: 0.6,
    emotional: 0.3,
    methodological: 0.7,
    temporal: 0.2
  },
  'balanced': {
    semantic: 0.5,
    thematic: 0.5,
    structural: 0.5,
    contradiction: 0.5,
    emotional: 0.5,
    methodological: 0.5,
    temporal: 0.5
  },
  'chaos': {
    semantic: 0.8,
    thematic: 0.8,
    structural: 0.8,
    contradiction: 0.8,
    emotional: 0.8,
    methodological: 0.8,
    temporal: 0.8
  }
}

export function WeightTuning() {
  const { weights, setWeight, applyPreset } = useAnnotationStore()
  
  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold">Engine Weights</h3>
      
      {/* Weight Sliders */}
      {(Object.entries(weights) as [keyof EngineWeights, number][]).map(([engine, value]) => (
        <div key={engine} className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor={`weight-${engine}`}>
              {ENGINE_LABELS[engine]}
            </Label>
            <span className="text-sm text-muted-foreground font-mono">
              {value.toFixed(2)}
            </span>
          </div>
          <Slider
            id={`weight-${engine}`}
            value={[value]}
            onValueChange={([newValue]) => setWeight(engine, newValue)}
            min={0}
            max={1}
            step={0.05}
            className="w-full"
          />
        </div>
      ))}
      
      <Separator />
      
      {/* Preset Buttons */}
      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('max-friction')}
          >
            Max Friction
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('thematic-focus')}
          >
            Thematic Focus
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('balanced')}
          >
            Balanced
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('chaos')}
          >
            Chaos
          </Button>
        </div>
      </div>
    </div>
  )
}
```

**Store Integration** (already implemented in T-002):
```typescript
// In annotation-store.ts (reference)
applyPreset: (preset: WeightPreset) => {
  const presetWeights = PRESETS[preset]
  set({ weights: presetWeights })
}
```

##### Acceptance Criteria

**Scenario 1: Weight sliders functional**
```gherkin
Given weight tuning component is rendered
When user drags semantic slider to 0.8
Then weights.semantic updates to 0.8
And display shows "0.80"
And connections re-rank in <100ms
```

**Scenario 2: Presets apply correctly**
```gherkin
Given weight tuning component with custom weights
When user clicks "Max Friction" preset
Then all 7 weights update to preset values
And contradiction weight equals 1.0
And connections re-rank with new weights
```

**Scenario 3: Real-time feedback works**
```gherkin
Given connections displayed in ConnectionsList
When user adjusts thematic weight from 0.5 to 1.0
Then connection cards re-sort immediately
And thematic connections appear higher
And animation shows re-sorting visually
```

**Scenario 4: All engines independent**
```gherkin
Given all weights at 0.5
When user changes only semantic to 0.9
Then semantic weight is 0.9
And all other weights remain 0.5
And only semantic connections boost strength
```

**Checklist**:
- [ ] 7 engine weight sliders rendered
- [ ] Weight values display in real-time (0.00-1.00)
- [ ] Sliders have 0.05 step increment
- [ ] 4 preset buttons functional
- [ ] Preset application updates all weights
- [ ] Weight changes trigger ConnectionsList re-ranking
- [ ] Performance <100ms (measured)
- [ ] Visual feedback on weight changes

##### Manual Testing Steps
1. Open document reader with right panel
2. Navigate to Weight Tuning tab/section
3. Verify 7 sliders visible with labels
4. Drag semantic slider
5. Verify value updates in display
6. Check console for re-ranking performance
7. Click "Max Friction" preset
8. Verify all weights update simultaneously
9. Check contradiction weight is 1.0
10. Switch to Connections tab
11. Verify connections re-sorted
12. Test all 4 presets
13. Verify each preset has distinct weight pattern

**Performance Validation**:
```typescript
// Add to ConnectionsList component
const filteredConnections = useMemo(() => {
  const start = performance.now()
  
  const result = MOCK_CONNECTIONS
    .filter(c => enabledEngines.has(c.engine_type))
    .filter(c => c.strength >= strengthThreshold)
    .map(c => ({
      ...c,
      weightedStrength: c.strength * weights[c.engine_type]
    }))
    .sort((a, b) => b.weightedStrength - a.weightedStrength)
  
  const duration = performance.now() - start
  if (duration > 100) {
    console.warn(`⚠️ Re-ranking took ${duration}ms (target: <100ms)`)
  } else {
    console.log(`✅ Re-ranking: ${duration}ms`)
  }
  
  return result
}, [weights, enabledEngines, strengthThreshold])
```

---

#### Task T-014: Create Connection Filters Component

**Priority**: High  
**Dependencies**: T-002, T-013  
**Estimated Time**: 3 hours

##### Context & Purpose
**As a** user  
**I need** to filter connections by engine type and strength threshold  
**So that** I can focus on relevant connections and avoid UI overload

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When engine toggled off, connections of that type shall disappear immediately
- REQ-2: When strength threshold adjusted, weak connections shall filter out
- REQ-3: Engine toggles shall show enabled/disabled state visually
- REQ-4: Strength threshold shall display current value (0.30-1.00)
- REQ-5: Filters shall persist across component re-renders

**Performance Requirements**:
- Filter updates <50ms
- No UI blocking during filtering
- Smooth animations for connection appearance/disappearance

**UX Requirements**:
- Clear visual distinction between enabled/disabled engines
- Threshold value visible next to slider
- Empty state when all engines disabled or threshold too high

##### Implementation Details

**Files to Create**:
```
src/components/sidebar/
└── ConnectionFilters.tsx    # CREATE - Engine toggles and threshold
```

**Component Structure**:
```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useAnnotationStore } from '@/stores/annotation-store'
import type { EngineWeights } from '@/types/annotations'

const ENGINE_LABELS: Record<keyof EngineWeights, string> = {
  semantic: 'Semantic',
  thematic: 'Thematic',
  structural: 'Structural',
  contradiction: 'Contradiction',
  emotional: 'Emotional',
  methodological: 'Methodological',
  temporal: 'Temporal'
}

const ENGINE_COLORS: Record<keyof EngineWeights, string> = {
  semantic: 'bg-blue-500',
  thematic: 'bg-purple-500',
  structural: 'bg-green-500',
  contradiction: 'bg-red-500',
  emotional: 'bg-pink-500',
  methodological: 'bg-orange-500',
  temporal: 'bg-gray-500'
}

export function ConnectionFilters() {
  const {
    weights,
    enabledEngines,
    toggleEngine,
    strengthThreshold,
    setStrengthThreshold
  } = useAnnotationStore()
  
  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold">Filter Connections</h3>
      
      {/* Engine Toggles */}
      <div className="space-y-2">
        <Label>Active Engines</Label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(weights) as (keyof EngineWeights)[]).map(engine => {
            const isEnabled = enabledEngines.has(engine)
            return (
              <Badge
                key={engine}
                variant={isEnabled ? 'default' : 'outline'}
                className={`cursor-pointer transition-all ${
                  isEnabled ? ENGINE_COLORS[engine] : ''
                }`}
                onClick={() => toggleEngine(engine)}
              >
                {ENGINE_LABELS[engine]}
              </Badge>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {enabledEngines.size} of {Object.keys(weights).length} engines active
        </p>
      </div>
      
      {/* Strength Threshold */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="strength-threshold">Strength Threshold</Label>
          <span className="text-sm text-muted-foreground font-mono">
            {strengthThreshold.toFixed(2)}
          </span>
        </div>
        <Slider
          id="strength-threshold"
          value={[strengthThreshold]}
          onValueChange={([value]) => setStrengthThreshold(value)}
          min={0.3}
          max={1}
          step={0.05}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Hide connections with strength below threshold
        </p>
      </div>
    </div>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Engine toggles filter connections**
```gherkin
Given 50 connections displayed
And all engines enabled
When user clicks "Emotional" engine badge
Then emotional engine badge shows outline style
And emotional connections disappear from list
And other connections remain visible
```

**Scenario 2: Strength threshold filters weak connections**
```gherkin
Given connections with strengths ranging 0.3-1.0
When user drags threshold slider to 0.7
Then connections with strength <0.7 disappear
And connections with strength >=0.7 remain
And count updates to reflect filtered results
```

**Scenario 3: Multiple filters combine correctly**
```gherkin
Given all engines enabled and threshold at 0.5
When user disables 3 engines
And adjusts threshold to 0.8
Then only connections matching both filters display
And correct count shown
```

**Scenario 4: Empty state when over-filtered**
```gherkin
Given connections displayed
When user disables all engines
Then empty state message appears
And no connections shown
```

**Checklist**:
- [ ] 7 engine toggle badges rendered
- [ ] Enabled engines show colored background
- [ ] Disabled engines show outline only
- [ ] Threshold slider functional (0.3-1.0)
- [ ] Threshold value displays in real-time
- [ ] Engine count displayed ("X of 7 engines active")
- [ ] Filters combine correctly (AND logic)
- [ ] Empty state for no results

##### Manual Testing Steps
1. Open right panel with connections
2. Navigate to Filters section
3. Verify all 7 engine badges visible
4. Click semantic engine badge
5. Verify badge style changes to outline
6. Check semantic connections disappear
7. Click badge again to re-enable
8. Verify connections reappear
9. Drag strength threshold slider to 0.8
10. Verify weak connections (<0.8) disappear
11. Disable all engines
12. Verify empty state message
13. Test combinations of filters
14. Verify AND logic works correctly

---#### Task T-015: Implement Validation Capture

**Priority**: High  
**Dependencies**: T-012  
**Estimated Time**: 3 hours

##### Context & Purpose
**As a** user  
**I need** to validate connections with keyboard shortcuts  
**So that** I can provide feedback for the learning system while reading

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When 'v' key pressed on active connection, validation feedback shall be captured
- REQ-2: When 'r' key pressed, rejection feedback shall be captured
- REQ-3: When 's' key pressed, star feedback shall be captured
- REQ-4: Feedback shall include connection_id, feedback_type, and context
- REQ-5: Toast notification shall confirm feedback capture
- REQ-6: Visual feedback shall show validation state (border color change)

**Storage Requirements** (MVP):
- Store feedback in localStorage (migrate to database in Phase 3)
- Include context: time_of_day, document_id, reading_mode
- Feedback array shall be retrievable for analysis

**Performance Requirements**:
- Key press response <50ms
- Toast notification appears immediately
- No blocking during feedback capture

##### Implementation Details

**Files to Modify**:
```
src/components/sidebar/
└── ConnectionCard.tsx    # MODIFY - Add validation handlers
```

**Code Pattern**:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, X, Star } from 'lucide-react'
import type { MockConnection, ConnectionFeedback } from '@/types/annotations'

interface ConnectionCardProps {
  connection: MockConnection
  documentId: string
  isActive: boolean
  onClick: () => void
}

export function ConnectionCard({
  connection,
  documentId,
  isActive,
  onClick
}: ConnectionCardProps) {
  const [feedbackType, setFeedbackType] = useState<'validate' | 'reject' | 'star' | null>(null)
  const { toast } = useToast()
  
  // Keyboard validation handler
  useEffect(() => {
    if (!isActive) return
    
    function handleKeyPress(e: KeyboardEvent) {
      if (e.key === 'v') {
        handleValidate()
      } else if (e.key === 'r') {
        handleReject()
      } else if (e.key === 's') {
        handleStar()
      }
    }
    
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, connection.id, documentId])
  
  function handleValidate() {
    captureFeedback('validate')
    setFeedbackType('validate')
    toast({
      title: 'Connection validated',
      description: 'Feedback recorded for learning system',
      duration: 2000
    })
  }
  
  function handleReject() {
    captureFeedback('reject')
    setFeedbackType('reject')
    toast({
      title: 'Connection rejected',
      description: 'Feedback recorded',
      variant: 'destructive',
      duration: 2000
    })
  }
  
  function handleStar() {
    captureFeedback('star')
    setFeedbackType('star')
    toast({
      title: 'Connection starred',
      description: 'Saved to favorites',
      duration: 2000
    })
  }
  
  function captureFeedback(type: 'validate' | 'reject' | 'star') {
    const feedback: ConnectionFeedback = {
      connection_id: connection.id,
      feedback_type: type,
      context: {
        time_of_day: new Date().toISOString(),
        document_id: documentId,
        mode: 'reading' // Could be inferred from user activity
      }
    }
    
    // Store to localStorage (MVP approach)
    const existing = localStorage.getItem('connection_feedback')
    const feedbackArray = existing ? JSON.parse(existing) : []
    feedbackArray.push(feedback)
    localStorage.setItem('connection_feedback', JSON.stringify(feedbackArray))
  }
  
  // Determine border color based on feedback
  const borderClass = feedbackType === 'validate' 
    ? 'border-green-500' 
    : feedbackType === 'reject'
    ? 'border-red-500'
    : feedbackType === 'star'
    ? 'border-yellow-500'
    : isActive 
    ? 'border-primary'
    : 'border-border'
  
  return (
    <Card
      className={`p-3 cursor-pointer transition-all hover:shadow-md ${borderClass} border-2`}
      onClick={onClick}
    >
      <div className=\"flex items-start justify-between mb-2\">
        <Badge variant=\"outline\">{connection.engine_type}</Badge>
        <div className=\"flex gap-1\">
          {feedbackType === 'validate' && <Check className=\"w-4 h-4 text-green-500\" />}
          {feedbackType === 'reject' && <X className=\"w-4 h-4 text-red-500\" />}
          {feedbackType === 'star' && <Star className=\"w-4 h-4 text-yellow-500 fill-yellow-500\" />}
        </div>
      </div>
      
      <p className=\"text-sm font-medium\">{connection.target_document_title}</p>
      <p className=\"text-xs text-muted-foreground mt-1\">{connection.target_snippet}</p>
      
      {isActive && (
        <div className=\"mt-2 pt-2 border-t text-xs text-muted-foreground\">
          Press: <kbd className=\"px-1 bg-muted rounded\">v</kbd> validate • 
          <kbd className=\"px-1 bg-muted rounded\">r</kbd> reject • 
          <kbd className=\"px-1 bg-muted rounded\">s</kbd> star
        </div>
      )}
    </Card>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Validation capture works**
```gherkin
Given active connection card
When user presses 'v' key
Then feedback stored to localStorage
And toast shows "Connection validated"
And card border turns green
And checkmark icon appears
```

**Scenario 2: Rejection capture works**
```gherkin
Given active connection card
When user presses 'r' key
Then feedback stored with type 'reject'
And toast shows "Connection rejected"
And card border turns red
And X icon appears
```

**Scenario 3: Star capture works**
```gherkin
Given active connection card
When user presses 's' key
Then feedback stored with type 'star'
And toast shows "Connection starred"
And card border turns yellow
And filled star icon appears
```

**Scenario 4: Feedback includes context**
```gherkin
Given user validates connection
When feedback is captured
Then localStorage contains feedback object
And feedback has connection_id
And feedback has timestamp
And feedback has document_id
```

**Checklist**:
- [ ] v/r/s keyboard handlers implemented
- [ ] Feedback stored to localStorage
- [ ] Toast notifications appear
- [ ] Visual feedback (border colors)
- [ ] Icons show validation state
- [ ] Context data included in feedback
- [ ] Only active card receives key events
- [ ] Hotkey hints visible on active card

##### Manual Testing Steps
1. Open document reader with connections
2. Click connection card to make active
3. Verify hotkey hints appear at bottom
4. Press 'v' key
5. Verify toast notification appears
6. Verify card border turns green
7. Verify checkmark icon appears
8. Open browser localStorage inspector
9. Verify feedback object stored
10. Press 'r' key on another connection
11. Verify red border and X icon
12. Press 's' key on third connection
13. Verify yellow border and star icon
14. Check localStorage has all feedback entries

---

#### Task T-015: Implement Validation Capture

**Priority**: High  
**Dependencies**: T-012  
**Estimated Time**: 3 hours

##### Context & Purpose
**As a** user  
**I need** to validate connections with keyboard shortcuts  
**So that** I can provide feedback for the learning system while reading

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When 'v' key pressed on active connection, validation feedback shall be captured
- REQ-2: When 'r' key pressed, rejection feedback shall be captured
- REQ-3: When 's' key pressed, star feedback shall be captured
- REQ-4: Feedback shall include connection_id, feedback_type, and context
- REQ-5: Toast notification shall confirm feedback capture
- REQ-6: Visual feedback shall show validation state (border color change)

**Storage Requirements** (MVP):
- Store feedback in localStorage (migrate to database in Phase 3)
- Include context: time_of_day, document_id, reading_mode
- Feedback array shall be retrievable for analysis

**Performance Requirements**:
- Key press response <50ms
- Toast notification appears immediately
- No blocking during feedback capture

##### Implementation Details

**Files to Modify**:
```
src/components/sidebar/
└── ConnectionCard.tsx    # MODIFY - Add validation handlers
```

**Code Pattern**:
```typescript
'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, X, Star } from 'lucide-react'
import type { MockConnection, ConnectionFeedback } from '@/types/annotations'

interface ConnectionCardProps {
  connection: MockConnection
  documentId: string
  isActive: boolean
  onClick: () => void
}

export function ConnectionCard({
  connection,
  documentId,
  isActive,
  onClick
}: ConnectionCardProps) {
  const [feedbackType, setFeedbackType] = useState<'validate' | 'reject' | 'star' | null>(null)
  const { toast } = useToast()
  
  // Keyboard validation handler
  useEffect(() => {
    if (!isActive) return
    
    function handleKeyPress(e: KeyboardEvent) {
      if (e.key === 'v') {
        handleValidate()
      } else if (e.key === 'r') {
        handleReject()
      } else if (e.key === 's') {
        handleStar()
      }
    }
    
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, connection.id, documentId])
  
  function handleValidate() {
    captureFeedback('validate')
    setFeedbackType('validate')
    toast({
      title: 'Connection validated',
      description: 'Feedback recorded for learning system',
      duration: 2000
    })
  }
  
  function handleReject() {
    captureFeedback('reject')
    setFeedbackType('reject')
    toast({
      title: 'Connection rejected',
      description: 'Feedback recorded',
      variant: 'destructive',
      duration: 2000
    })
  }
  
  function handleStar() {
    captureFeedback('star')
    setFeedbackType('star')
    toast({
      title: 'Connection starred',
      description: 'Saved to favorites',
      duration: 2000
    })
  }
  
  function captureFeedback(type: 'validate' | 'reject' | 'star') {
    const feedback: ConnectionFeedback = {
      connection_id: connection.id,
      feedback_type: type,
      context: {
        time_of_day: new Date().toISOString(),
        document_id: documentId,
        mode: 'reading' // Could be inferred from user activity
      }
    }
    
    // Store to localStorage (MVP approach)
    const existing = localStorage.getItem('connection_feedback')
    const feedbackArray = existing ? JSON.parse(existing) : []
    feedbackArray.push(feedback)
    localStorage.setItem('connection_feedback', JSON.stringify(feedbackArray))
  }
  
  // Determine border color based on feedback
  const borderClass = feedbackType === 'validate' 
    ? 'border-green-500' 
    : feedbackType === 'reject'
    ? 'border-red-500'
    : feedbackType === 'star'
    ? 'border-yellow-500'
    : isActive 
    ? 'border-primary'
    : 'border-border'
  
  return (
    <Card
      className={`p-3 cursor-pointer transition-all hover:shadow-md ${borderClass} border-2`}
      onClick={onClick}
    >
      <div className=\"flex items-start justify-between mb-2\">
        <Badge variant=\"outline\">{connection.engine_type}</Badge>
        <div className=\"flex gap-1\">
          {feedbackType === 'validate' && <Check className=\"w-4 h-4 text-green-500\" />}
          {feedbackType === 'reject' && <X className=\"w-4 h-4 text-red-500\" />}
          {feedbackType === 'star' && <Star className=\"w-4 h-4 text-yellow-500 fill-yellow-500\" />}
        </div>
      </div>
      
      <p className=\"text-sm font-medium\">{connection.target_document_title}</p>
      <p className=\"text-xs text-muted-foreground mt-1\">{connection.target_snippet}</p>
      
      {isActive && (
        <div className=\"mt-2 pt-2 border-t text-xs text-muted-foreground\">
          Press: <kbd className=\"px-1 bg-muted rounded\">v</kbd> validate • 
          <kbd className=\"px-1 bg-muted rounded\">r</kbd> reject • 
          <kbd className=\"px-1 bg-muted rounded\">s</kbd> star
        </div>
      )}
    </Card>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Validation capture works**
```gherkin
Given active connection card
When user presses 'v' key
Then feedback stored to localStorage
And toast shows "Connection validated"
And card border turns green
And checkmark icon appears
```

**Scenario 2: Rejection capture works**
```gherkin
Given active connection card
When user presses 'r' key
Then feedback stored with type 'reject'
And toast shows "Connection rejected"
And card border turns red
And X icon appears
```

**Scenario 3: Star capture works**
```gherkin
Given active connection card
When user presses 's' key
Then feedback stored with type 'star'
And toast shows "Connection starred"
And card border turns yellow
And filled star icon appears
```

**Scenario 4: Feedback includes context**
```gherkin
Given user validates connection
When feedback is captured
Then localStorage contains feedback object
And feedback has connection_id
And feedback has timestamp
And feedback has document_id
```

**Checklist**:
- [ ] v/r/s keyboard handlers implemented
- [ ] Feedback stored to localStorage
- [ ] Toast notifications appear
- [ ] Visual feedback (border colors)
- [ ] Icons show validation state
- [ ] Context data included in feedback
- [ ] Only active card receives key events
- [ ] Hotkey hints visible on active card

##### Manual Testing Steps
1. Open document reader with connections
2. Click connection card to make active
3. Verify hotkey hints appear at bottom
4. Press 'v' key
5. Verify toast notification appears
6. Verify card border turns green
7. Verify checkmark icon appears
8. Open browser localStorage inspector
9. Verify feedback object stored
10. Press 'r' key on another connection
11. Verify red border and X icon
12. Press 's' key on third connection
13. Verify yellow border and star icon
14. Check localStorage has all feedback entries

---

#### Task T-016: Add Keyboard Shortcuts Help Panel

**Priority**: Medium  
**Dependencies**: T-007, T-015  
**Estimated Time**: 2 hours

##### Context & Purpose
**As a** user  
**I need** a help panel showing all keyboard shortcuts  
**So that** I can learn and remember available hotkeys without memorization

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When '?' key pressed, help panel shall appear
- REQ-2: Help panel shall list all shortcuts grouped by category
- REQ-3: When Escape pressed, help panel shall close
- REQ-4: Help panel shall be accessible from anywhere in reader
- REQ-5: Shortcuts shall be visually styled as keyboard keys

**Accessibility Requirements**:
- Dialog must be keyboard-navigable
- Focus trap within dialog
- ARIA labels for screen readers
- Clear heading hierarchy

##### Implementation Details

**Files to Create**:
```
src/components/reader/
└── KeyboardHelp.tsx    # CREATE - Help dialog with shortcuts
```

**Component Structure**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Highlighting',
    shortcuts: [
      { keys: ['g'], description: 'Create green highlight' },
      { keys: ['y'], description: 'Create yellow highlight' },
      { keys: ['r'], description: 'Create red highlight' },
      { keys: ['b'], description: 'Create blue highlight' },
      { keys: ['p'], description: 'Create purple highlight' }
    ]
  },
  {
    title: 'Connection Validation',
    shortcuts: [
      { keys: ['v'], description: 'Validate connection (agree)' },
      { keys: ['r'], description: 'Reject connection (disagree)' },
      { keys: ['s'], description: 'Star connection (favorite)' }
    ]
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Escape'], description: 'Close panels and dialogs' },
      { keys: ['?'], description: 'Show this help panel' }
    ]
  }
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)
  
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      if (e.key === '?' && !e.shiftKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    
    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [])
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className=\"max-w-2xl max-h-[80vh] overflow-y-auto\">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Available shortcuts for the document reader
          </DialogDescription>
        </DialogHeader>
        
        <div className=\"space-y-6 mt-4\">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title} className=\"space-y-3\">
              <h3 className=\"font-semibold text-sm text-muted-foreground uppercase tracking-wide\">
                {group.title}
              </h3>
              <div className=\"space-y-2\">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className=\"flex items-center justify-between\">
                    <span className=\"text-sm\">{shortcut.description}</span>
                    <div className=\"flex gap-1\">
                      {shortcut.keys.map(key => (
                        <kbd
                          key={key}
                          className=\"px-2 py-1 text-xs font-mono bg-muted border border-border rounded\">
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className=\"mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground\">
          <p>💡 Tip: Most shortcuts work when the relevant element is active or selected.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Integration** (add to DocumentViewer):
```typescript
// In DocumentViewer.tsx
import { KeyboardHelp } from './KeyboardHelp'

export function DocumentViewer({ ... }) {
  return (
    <>
      {/* Existing content */}
      <KeyboardHelp />
    </>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Help panel opens with '?'**
```gherkin
Given document viewer is open
When user presses '?' key
Then help dialog appears
And shortcuts are grouped by category
And keyboard keys are styled
```

**Scenario 2: Help panel closes with Escape**
```gherkin
Given help dialog is open
When user presses Escape key
Then dialog closes
And focus returns to document
```

**Scenario 3: All shortcuts documented**
```gherkin
Given help dialog is open
Then highlighting shortcuts are listed (g/y/r/b/p)
And validation shortcuts are listed (v/r/s)
And navigation shortcuts are listed (Escape/?)
```

**Checklist**:
- [ ] Dialog opens with '?' key
- [ ] Dialog closes with Escape
- [ ] All shortcuts documented
- [ ] Shortcuts grouped by category
- [ ] Keyboard keys styled as <kbd>
- [ ] Dialog keyboard-accessible
- [ ] Tip section included
- [ ] Scrollable for long content

##### Manual Testing Steps
1. Open document reader
2. Press '?' key
3. Verify dialog appears
4. Verify 3 categories visible
5. Verify keyboard keys styled
6. Press Escape
7. Verify dialog closes
8. Press '?' again
9. Scroll through dialog
10. Verify all shortcuts listed
11. Test keyboard navigation
12. Verify focus trap works



---

#### Task T-016: Add Keyboard Shortcuts Help Panel

**Priority**: Medium  
**Dependencies**: T-007, T-015  
**Estimated Time**: 2 hours

##### Context & Purpose
**As a** user  
**I need** a help panel showing all keyboard shortcuts  
**So that** I can learn and remember available hotkeys without memorization

##### Technical Requirements

**Functional Requirements**:
- REQ-1: When '?' key pressed, help panel shall appear
- REQ-2: Help panel shall list all shortcuts grouped by category
- REQ-3: When Escape pressed, help panel shall close
- REQ-4: Help panel shall be accessible from anywhere in reader
- REQ-5: Shortcuts shall be visually styled as keyboard keys

**Accessibility Requirements**:
- Dialog must be keyboard-navigable
- Focus trap within dialog
- ARIA labels for screen readers
- Clear heading hierarchy

##### Implementation Details

**Files to Create**:
```
src/components/reader/
└── KeyboardHelp.tsx    # CREATE - Help dialog with shortcuts
```

**Component Structure**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Highlighting',
    shortcuts: [
      { keys: ['g'], description: 'Create green highlight' },
      { keys: ['y'], description: 'Create yellow highlight' },
      { keys: ['r'], description: 'Create red highlight' },
      { keys: ['b'], description: 'Create blue highlight' },
      { keys: ['p'], description: 'Create purple highlight' }
    ]
  },
  {
    title: 'Connection Validation',
    shortcuts: [
      { keys: ['v'], description: 'Validate connection (agree)' },
      { keys: ['r'], description: 'Reject connection (disagree)' },
      { keys: ['s'], description: 'Star connection (favorite)' }
    ]
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Escape'], description: 'Close panels and dialogs' },
      { keys: ['?'], description: 'Show this help panel' }
    ]
  }
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)
  
  useEffect(() => {
    function handleKeyPress(e: KeyboardEvent) {
      if (e.key === '?' && !e.shiftKey) {
        e.preventDefault()
        setOpen(true)
      }
    }
    
    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [])
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className=\"max-w-2xl max-h-[80vh] overflow-y-auto\">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Available shortcuts for the document reader
          </DialogDescription>
        </DialogHeader>
        
        <div className=\"space-y-6 mt-4\">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.title} className=\"space-y-3\">
              <h3 className=\"font-semibold text-sm text-muted-foreground uppercase tracking-wide\">
                {group.title}
              </h3>
              <div className=\"space-y-2\">
                {group.shortcuts.map((shortcut, idx) => (
                  <div key={idx} className=\"flex items-center justify-between\">
                    <span className=\"text-sm\">{shortcut.description}</span>
                    <div className=\"flex gap-1\">
                      {shortcut.keys.map(key => (
                        <kbd
                          key={key}
                          className=\"px-2 py-1 text-xs font-mono bg-muted border border-border rounded\">
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className=\"mt-6 p-4 bg-muted rounded-lg text-sm text-muted-foreground\">
          <p>💡 Tip: Most shortcuts work when the relevant element is active or selected.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

**Integration** (add to DocumentViewer):
```typescript
// In DocumentViewer.tsx
import { KeyboardHelp } from './KeyboardHelp'

export function DocumentViewer({ ... }) {
  return (
    <>
      {/* Existing content */}
      <KeyboardHelp />
    </>
  )
}
```

##### Acceptance Criteria

**Scenario 1: Help panel opens with '?'**
```gherkin
Given document viewer is open
When user presses '?' key
Then help dialog appears
And shortcuts are grouped by category
And keyboard keys are styled
```

**Scenario 2: Help panel closes with Escape**
```gherkin
Given help dialog is open
When user presses Escape key
Then dialog closes
And focus returns to document
```

**Scenario 3: All shortcuts documented**
```gherkin
Given help dialog is open
Then highlighting shortcuts are listed (g/y/r/b/p)
And validation shortcuts are listed (v/r/s)
And navigation shortcuts are listed (Escape/?)
```

**Checklist**:
- [ ] Dialog opens with '?' key
- [ ] Dialog closes with Escape
- [ ] All shortcuts documented
- [ ] Shortcuts grouped by category
- [ ] Keyboard keys styled as <kbd>
- [ ] Dialog keyboard-accessible
- [ ] Tip section included
- [ ] Scrollable for long content

##### Manual Testing Steps
1. Open document reader
2. Press '?' key
3. Verify dialog appears
4. Verify 3 categories visible
5. Verify keyboard keys styled
6. Press Escape
7. Verify dialog closes
8. Press '?' again
9. Scroll through dialog
10. Verify all shortcuts listed
11. Test keyboard navigation
12. Verify focus trap works

---
