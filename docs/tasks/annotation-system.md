# Annotation System Task Breakdown

**Generated from PRP**: `docs/prps/annotation-system.md`
**Total Estimated Hours**: 23-25 hours
**Number of Tasks**: 24 primary tasks + 6 validation tasks

## Executive Summary

### Phase Overview
- **Phase 1: Foundation** (4-5 hours) - Database schema, types, and utilities
- **Phase 2: Inline Highlights** (5-6 hours) - HTML injection, parsing, CSS
- **Phase 3: Resizable Highlights** (6-8 hours) - Resize detection, touch support, preview
- **Phase 4: Text Selection & Capture** (4-5 hours) - Selection hook, QuickCapture UI
- **Phase 5: Integration** (2-3 hours) - VirtualizedReader updates, dual storage
- **Phase 6: Testing & Validation** (1-2 hours) - E2E tests, performance checks

### Critical Path
The critical path runs through: **T-001 → T-002 → T-003 → T-004 → T-008 → T-010 → T-014 → T-016 → T-018**

This represents the minimum sequence required for a working annotation system. All other tasks can be parallelized or are enhancements.

### Risk Assessment
1. **High Risk**: Range API complexity (T-007, T-010) - Mitigate with early prototyping
2. **Medium Risk**: Touch event handling (T-008, T-022) - Mitigate with device testing
3. **Medium Risk**: Performance with 100+ annotations (T-024) - Mitigate with profiling
4. **Low Risk**: Dual storage sync (T-015) - Simple last-write-wins approach

---

## Detailed Task Breakdown

### Phase 1: Foundation Tasks

---

## Task T-001: Database Migration - Annotation System Indexes

**Priority**: Critical
**Estimate**: 1 hour
**Dependencies**: None
**Assignee**: Backend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 417-424

### Task Purpose
**As a** database system
**I need** optimized indexes for annotation queries
**So that** annotation lookups remain fast even with thousands of annotations

### Technical Requirements
- Create indexes for Position component document/offset lookups
- Add GIN index for ChunkRef array queries
- Ensure backward compatibility with existing schema

### Implementation Details

#### Files to Modify/Create
```
└── supabase/migrations/YYYYMMDDHHMMSS_annotation_system.sql - [Create new migration file]
```

#### Key Implementation Steps
1. Create composite index on Position component fields
2. Add GIN index for ChunkRef.chunkIds array searches
3. Verify existing tables have required columns

#### Code Patterns to Follow
- **Migration Pattern**: supabase/migrations/020_chunk_connections.sql - Index creation syntax
- **Naming Convention**: Use idx_ prefix for all indexes

### Acceptance Criteria

```gherkin
Scenario 1: Migration applies successfully
  Given a fresh Supabase database
  When I run npx supabase db push
  Then the migration completes without errors
  And indexes are visible in pg_indexes

Scenario 2: Query performance improves
  Given 10,000 annotations in the database
  When I query annotations by documentId and offset range
  Then the query uses the new index
  And response time is under 50ms
```

### Rule-Based Criteria
- [x] Migration file follows naming convention
- [x] Indexes have descriptive names
- [x] No breaking changes to existing schema
- [x] Migration is reversible (has DOWN statement)

### Manual Testing Steps
1. Run `npx supabase db push`
2. Check Supabase Studio → Database → Indexes
3. Run EXPLAIN ANALYZE on annotation queries
4. Verify index usage in query plan

### Validation
```bash
npx supabase db diff --schema public  # Check migration changes
npx supabase db push                  # Apply migration
```

---

## Task T-002: Chunk Utilities - Multi-Chunk Support

**Priority**: Critical
**Estimate**: 1.5 hours
**Dependencies**: T-001
**Assignee**: Backend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 426-432

### Task Purpose
**As a** annotation system
**I need** utilities to find and track chunks an annotation spans
**So that** multi-chunk annotations work correctly

### Technical Requirements
- Binary search for chunk lookup (performance)
- Handle edge cases (empty chunks, boundaries)
- Support up to 5-chunk spans

### Implementation Details

#### Files to Modify/Create
```
└── src/lib/reader/chunk-utils.ts - [Create utility functions for chunk operations]
```

#### Key Implementation Steps
1. Implement `findSpannedChunks(startOffset, endOffset, chunks)` - Filter overlapping chunks
2. Create `createChunkRef(startOffset, endOffset, chunks)` - Generate ChunkRefComponent
3. Add `findChunkForOffset(chunks, offset)` - Binary search implementation

#### Code Patterns to Follow
- **Binary Search**: src/lib/reader/block-parser.ts:370-387 - Existing binary search pattern
- **Type Safety**: Use proper TypeScript interfaces for all parameters

### Acceptance Criteria

```gherkin
Scenario 1: Find single chunk annotation
  Given chunks with offsets [0-1000], [1001-2000], [2001-3000]
  When I call findSpannedChunks(500, 700, chunks)
  Then it returns only the first chunk

Scenario 2: Find multi-chunk annotation
  Given chunks with offsets [0-1000], [1001-2000], [2001-3000]
  When I call findSpannedChunks(500, 1500, chunks)
  Then it returns first two chunks in order

Scenario 3: Enforce 5-chunk limit
  Given 10 sequential chunks
  When I call createChunkRef spanning all chunks
  Then it includes only the first 5 chunks
```

### Rule-Based Criteria
- [x] Functions are pure (no side effects)
- [x] All edge cases handled (empty arrays, invalid offsets)
- [x] JSDoc comments on all exported functions
- [x] Unit tests achieve 100% coverage

### Manual Testing Steps
1. Create test file with sample chunks
2. Test single-chunk selection
3. Test multi-chunk selection
4. Test edge boundaries
5. Verify 5-chunk limit enforcement

### Validation
```bash
npm test src/lib/reader/chunk-utils.test.ts
npm run lint src/lib/reader/chunk-utils.ts
npx tsc --noEmit
```

---

## Task T-003: Highlight Injection System

**Priority**: Critical
**Estimate**: 2 hours
**Dependencies**: T-002
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 434-443

### Task Purpose
**As a** document renderer
**I need** to inject highlight markup into HTML blocks
**So that** annotations appear visually in the document

### Technical Requirements
- Preserve HTML structure (no broken tags)
- Handle overlapping highlights gracefully
- Performance: Process 100+ annotations in <50ms

### Implementation Details

#### Files to Modify/Create
```
└── src/lib/reader/highlight-injector.ts - [Create HTML injection system]
```

#### Key Implementation Steps
1. Parse block HTML with DOMParser
2. Find text nodes overlapping with annotations
3. Wrap matched text in `<mark>` tags with data attributes
4. Handle overlapping highlights via sorting

#### Code Patterns to Follow
- **DOM Manipulation**: Use DOMParser API for safe HTML parsing
- **Data Attributes**: Use data-annotation-id and data-color attributes

### Acceptance Criteria

```gherkin
Scenario 1: Simple highlight injection
  Given HTML "<p>Hello world</p>" and annotation at offset 0-5
  When I inject the highlight
  Then HTML becomes "<p><mark data-annotation-id='123' data-color='yellow'>Hello</mark> world</p>"

Scenario 2: Preserve nested HTML
  Given HTML with nested tags like <strong> and <em>
  When I inject highlights
  Then nested tags remain intact
  And only text nodes are wrapped

Scenario 3: Handle overlapping highlights
  Given two overlapping annotations
  When I inject both highlights
  Then both are visible without breaking HTML
```

### Rule-Based Criteria
- [x] Valid HTML output (passes DOMParser)
- [x] No modification of non-text nodes
- [x] Data attributes correctly set
- [x] Performance under 50ms for 100 annotations

### Manual Testing Steps
1. Test with simple paragraph
2. Test with complex nested HTML
3. Test with overlapping highlights
4. Test with 100+ annotations
5. Verify HTML validity

### Validation
```bash
npm test src/lib/reader/highlight-injector.test.ts
npm run lint src/lib/reader/highlight-injector.ts
```

---

## Task T-004: Update Block Parser

**Priority**: Critical
**Estimate**: 0.5 hours
**Dependencies**: T-003
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 445-451

### Task Purpose
**As a** block parser
**I need** to inject highlights during block generation
**So that** annotations appear in rendered blocks

### Technical Requirements
- Maintain backward compatibility
- Optional annotations parameter
- No performance regression

### Implementation Details

#### Files to Modify/Create
```
└── src/lib/reader/block-parser.ts - [Modify to inject highlights]
```

#### Key Implementation Steps
1. Add optional `annotations` parameter to `parseMarkdownToBlocks`
2. Call `injectHighlights` after HTML generation
3. Update block.html with injected markup

#### Code Patterns to Follow
- **Existing Patterns**: Maintain current offset calculation logic
- **Optional Parameters**: Use default empty array for annotations

### Acceptance Criteria

```gherkin
Scenario 1: Parse without annotations
  Given markdown content and no annotations
  When I call parseMarkdownToBlocks(markdown, chunks)
  Then blocks render normally without highlights

Scenario 2: Parse with annotations
  Given markdown content and annotations array
  When I call parseMarkdownToBlocks(markdown, chunks, annotations)
  Then blocks include injected highlight markup
```

### Rule-Based Criteria
- [x] Backward compatible (works without annotations)
- [x] No impact on offset calculations
- [x] Type safety maintained
- [x] Existing tests still pass

### Validation
```bash
npm test src/lib/reader/block-parser.test.ts
npx tsc --noEmit
```

---

## Task T-005: Highlight CSS Styles

**Priority**: High
**Estimate**: 1 hour
**Dependencies**: None
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 453-464

### Task Purpose
**As a** user
**I need** visually distinct highlight colors
**So that** I can categorize my annotations

### Technical Requirements
- 7 distinct colors with dark mode support
- Semi-transparent backgrounds (30% light, 20% dark)
- Resize handle indicators
- Smooth transitions

### Implementation Details

#### Files to Modify/Create
```
└── src/app/globals.css - [Add highlight styles]
```

#### Key Implementation Steps
1. Add @layer components for annotation styles
2. Create data-color attribute selectors
3. Add resize handle pseudo-elements
4. Include dark mode variants

#### Code Patterns to Follow
- **Tailwind Layers**: Use @layer components
- **Color System**: Follow existing color palette

### Acceptance Criteria

```gherkin
Scenario 1: Colors display correctly
  Given a highlight with data-color="yellow"
  When rendered in light mode
  Then background is yellow-200 at 30% opacity

Scenario 2: Dark mode support
  Given dark mode is active
  When highlights render
  Then opacity reduces to 20%
  And colors remain visible

Scenario 3: Resize handles appear
  Given a highlight element
  When user hovers near edge
  Then cursor changes to col-resize
  And visual indicator appears
```

### Rule-Based Criteria
- [x] All 7 colors defined
- [x] Dark mode variants included
- [x] Accessible color contrast
- [x] Smooth hover transitions

### Manual Testing Steps
1. Create highlight with each color
2. Toggle dark mode
3. Test hover states
4. Verify resize cursor
5. Check color contrast

### Validation
```bash
npm run build  # Verify CSS compiles
```

---

## Task T-006: Resize Detection

**Priority**: High
**Estimate**: 1 hour
**Dependencies**: T-005
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 466-472

### Task Purpose
**As a** resize system
**I need** to detect when user is near a highlight edge
**So that** resize operations can be initiated

### Technical Requirements
- 8px edge detection zone
- Support mouse and touch events
- Return annotation ID and edge direction

### Implementation Details

#### Files to Modify/Create
```
└── src/lib/reader/resize-detection.ts - [Create edge detection logic]
```

#### Key Implementation Steps
1. Calculate distance from highlight edges
2. Check if within 8px threshold
3. Determine which edge (start/end)
4. Handle both mouse and touch coordinates

#### Code Patterns to Follow
- **Event Abstraction**: Unify mouse/touch event handling
- **Type Guards**: Use TypeScript discriminated unions

### Acceptance Criteria

```gherkin
Scenario 1: Detect near start edge
  Given a highlight from pixels 100-200
  When mouse is at pixel 102 (2px from start)
  Then detectResizeHandle returns { edge: 'start' }

Scenario 2: Detect near end edge
  Given a highlight from pixels 100-200
  When mouse is at pixel 196 (4px from end)
  Then detectResizeHandle returns { edge: 'end' }

Scenario 3: No detection outside zone
  Given a highlight with 8px edge zones
  When mouse is 10px from any edge
  Then detectResizeHandle returns null
```

### Rule-Based Criteria
- [x] Works with mouse events
- [x] Works with touch events
- [x] Returns correct edge direction
- [x] Respects 8px threshold

### Validation
```bash
npm test src/lib/reader/resize-detection.test.ts
```

---

## Task T-007: Offset Calculation from Range

**Priority**: Critical
**Estimate**: 1.5 hours
**Dependencies**: T-002
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 474-484

### Task Purpose
**As a** selection system
**I need** to convert DOM ranges to markdown offsets
**So that** annotations use consistent positioning

### Technical Requirements
- Accurate offset calculation
- Word boundary snapping
- Handle complex HTML structures

### Implementation Details

#### Files to Modify/Create
```
└── src/lib/reader/offset-calculator.ts - [Create offset calculation utilities]
```

#### Key Implementation Steps
1. Clone range and use selectNodeContents pattern
2. Calculate offset via toString().length
3. Add block offset to get global position
4. Implement word boundary snapping

#### Code Patterns to Follow
- **Range Pattern**: docs/todo/complete-annotation-system.md - Proven Range API approach
- **Block Traversal**: Find parent with data-start-offset

### Acceptance Criteria

```gherkin
Scenario 1: Calculate simple selection
  Given a selection in a paragraph block
  When I calculate offsets
  Then start and end offsets are correct
  And match the selected text

Scenario 2: Word boundary snapping
  Given a selection with trailing spaces
  When I snap to word boundaries
  Then spaces are trimmed
  And selection starts/ends on word boundaries

Scenario 3: Cross-block selection
  Given selection spanning multiple blocks
  When I calculate offsets
  Then offsets account for all blocks
```

### Rule-Based Criteria
- [x] Accurate offset calculation
- [x] Word boundaries respected
- [x] Handles nested HTML
- [x] No partial word selections

### Manual Testing Steps
1. Select text in simple paragraph
2. Select across multiple blocks
3. Test with nested HTML
4. Verify word snapping
5. Test edge cases

### Validation
```bash
npm test src/lib/reader/offset-calculator.test.ts
npx tsc --noEmit
```

---

## Task T-008: useHighlightResize Hook

**Priority**: Critical
**Estimate**: 2 hours
**Dependencies**: T-006, T-007
**Assignee**: Fullstack Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 486-502

### Task Purpose
**As a** user interface
**I need** resize interaction logic
**So that** users can adjust highlight boundaries

### Technical Requirements
- Mouse and touch support
- Visual feedback during drag
- 5-chunk limit enforcement
- Minimum 3 character validation

### Implementation Details

#### Files to Modify/Create
```
└── src/hooks/useHighlightResize.ts - [Create resize interaction hook]
```

#### Key Implementation Steps
1. Track resize state (annotation, edge, range)
2. Handle mousedown/touchstart for initiation
3. Update range on mousemove/touchmove
4. Validate and save on mouseup/touchend
5. Add passive: false for touch events

#### Code Patterns to Follow
- **Event Handling**: Use useCallback for stable references
- **Touch Abstraction**: Unify mouse/touch via conditional access

### Acceptance Criteria

```gherkin
Scenario 1: Mouse resize flow
  Given a highlight exists
  When user drags the edge
  Then visual preview updates
  And release saves new boundaries

Scenario 2: Touch resize flow
  Given iPad Safari browser
  When user long-presses and drags
  Then same behavior as mouse
  And touch events work correctly

Scenario 3: 5-chunk limit enforcement
  Given annotation spans 4 chunks
  When user tries to extend to 6 chunks
  Then resize stops at 5-chunk boundary
```

### Rule-Based Criteria
- [x] Mouse events work
- [x] Touch events work
- [x] Visual feedback shown
- [x] Chunk limit enforced
- [x] Minimum size validated

### Manual Testing Steps
1. Test mouse resize on desktop
2. Test touch resize on iPad
3. Verify visual feedback
4. Test chunk limit
5. Test minimum size

### Validation
```bash
npm test src/hooks/useHighlightResize.test.ts
npm run lint src/hooks/useHighlightResize.ts
```

---

## Task T-009: Resize Preview Overlay

**Priority**: Medium
**Estimate**: 1 hour
**Dependencies**: T-008
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 504-514

### Task Purpose
**As a** user
**I need** visual feedback during resize
**So that** I can see the new selection before committing

### Technical Requirements
- Blue ring preview style
- Selection API manipulation
- Clean up on completion

### Implementation Details

#### Files to Modify/Create
```
└── src/hooks/useHighlightResize.ts - [Extend with preview logic]
```

#### Key Implementation Steps
1. Manipulate window.getSelection() during drag
2. Add CSS class for visual preview
3. Remove preview on completion
4. Handle preview cleanup

#### Code Patterns to Follow
- **Selection API**: Use removeAllRanges() and addRange()
- **CSS Classes**: Add/remove dynamically

### Acceptance Criteria

```gherkin
Scenario 1: Preview appears during drag
  Given user is resizing a highlight
  When dragging the edge
  Then blue preview ring appears
  And selection visually updates

Scenario 2: Preview cleans up
  Given resize operation completes
  When user releases mouse/touch
  Then preview styles are removed
  And only final highlight remains
```

### Rule-Based Criteria
- [x] Preview appears during drag
- [x] Selection updates visually
- [x] Cleanup on completion
- [x] No visual artifacts

### Validation
```bash
# Visual testing required
npm run dev
# Manual test resize preview
```

---

## Task T-010: useTextSelection Hook

**Priority**: Critical
**Estimate**: 1.5 hours
**Dependencies**: T-007
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 516-529

### Task Purpose
**As a** selection system
**I need** to track text selections
**So that** users can create annotations

### Technical Requirements
- Track selection state
- Calculate offsets and ChunkRef
- Handle selection clearing
- Detect empty selections

### Implementation Details

#### Files to Modify/Create
```
└── src/hooks/useTextSelection.ts - [Create text selection tracking hook]
```

#### Key Implementation Steps
1. Listen for mouseup/keyup events
2. Get window.getSelection()
3. Calculate offsets if not collapsed
4. Create ChunkRef for selection
5. Provide clear function

#### Code Patterns to Follow
- **Event Listeners**: Use useEffect with cleanup
- **State Management**: Use useState for selection

### Acceptance Criteria

```gherkin
Scenario 1: Detect text selection
  Given user selects text
  When mouseup occurs
  Then selection state updates
  And offsets are calculated

Scenario 2: Clear empty selection
  Given a selection exists
  When user clicks elsewhere
  Then selection state clears

Scenario 3: Multi-chunk selection
  Given selection spans 3 chunks
  When selection is processed
  Then ChunkRef contains all 3 chunk IDs
```

### Rule-Based Criteria
- [x] Selection detected on mouseup
- [x] Offsets calculated correctly
- [x] ChunkRef created properly
- [x] Clear function works

### Manual Testing Steps
1. Select text in document
2. Verify selection tracked
3. Test multi-chunk selection
4. Test clearing selection
5. Test keyboard selection

### Validation
```bash
npm test src/hooks/useTextSelection.test.ts
```

---

## Task T-011: QuickCapture Component

**Priority**: High
**Estimate**: 2 hours
**Dependencies**: T-010
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 531-545

### Task Purpose
**As a** user
**I need** an interface to add notes and tags to highlights
**So that** I can enrich my annotations

### Technical Requirements
- Fixed bottom positioning
- Color picker integration
- Note and tag inputs
- Animation on appear/dismiss

### Implementation Details

#### Files to Modify/Create
```
└── src/components/reader/QuickCapture.tsx - [Create annotation UI component]
```

#### Key Implementation Steps
1. Create fixed bottom-20 layout
2. Show selected text preview
3. Add color picker buttons
4. Include note textarea and tag input
5. Add save/cancel actions

#### Code Patterns to Follow
- **UI Components**: Use shadcn/ui components
- **Animation**: Use Framer Motion for transitions

### Acceptance Criteria

```gherkin
Scenario 1: Component appears on selection
  Given text is selected
  When QuickCapture renders
  Then it shows at bottom of screen
  And displays selected text preview

Scenario 2: Color selection works
  Given QuickCapture is open
  When user clicks a color
  Then color is selected
  And visual feedback shown

Scenario 3: Save creates annotation
  Given user fills in details
  When clicking Save
  Then annotation is created
  And component dismisses
```

### Rule-Based Criteria
- [x] All 7 colors available
- [x] Note field optional
- [x] Tags can be added
- [x] Smooth animations
- [x] Responsive design

### Manual Testing Steps
1. Select text to trigger UI
2. Test each color button
3. Add note text
4. Add multiple tags
5. Test save and cancel

### Validation
```bash
npm run lint src/components/reader/QuickCapture.tsx
npx tsc --noEmit
```

---

## Task T-012: ColorPicker Component

**Priority**: Low
**Estimate**: 0.5 hours
**Dependencies**: None
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 547-555

### Task Purpose
**As a** UI system
**I need** a reusable color picker
**So that** color selection is consistent

### Technical Requirements
- 7 color options
- Selected state indication
- Accessible keyboard navigation

### Implementation Details

#### Files to Modify/Create
```
└── src/components/reader/ColorPicker.tsx - [Create color picker component]
```

#### Key Implementation Steps
1. Create 7-column grid layout
2. Render color buttons
3. Show selection state
4. Handle onChange callback

#### Code Patterns to Follow
- **Component Pattern**: Controlled component with value/onChange
- **Styling**: Use cn() utility for classes

### Acceptance Criteria

```gherkin
Scenario 1: Display all colors
  Given ColorPicker renders
  When viewing the component
  Then all 7 colors are visible
  And layout is consistent

Scenario 2: Selection feedback
  Given a color is selected
  When viewing the picker
  Then selected color has ring
  And check icon is visible
```

### Rule-Based Criteria
- [x] All colors rendered
- [x] Selection state clear
- [x] Keyboard accessible
- [x] Reusable component

### Validation
```bash
npm run lint src/components/reader/ColorPicker.tsx
```

---

## Task T-013: useAnnotations Hook with Retry Queue

**Priority**: High
**Estimate**: 2 hours
**Dependencies**: T-014
**Assignee**: Fullstack Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 557-574

### Task Purpose
**As a** data layer
**I need** annotation CRUD with retry logic
**So that** annotations persist reliably

### Technical Requirements
- CRUD operations for annotations
- Retry queue for failures
- localStorage backup
- Optimistic updates

### Implementation Details

#### Files to Modify/Create
```
└── src/hooks/useAnnotations.ts - [Create annotation data hook]
```

#### Key Implementation Steps
1. Implement create with retry queue
2. Add update operations
3. Handle failures with localStorage
4. Provide pending state visibility
5. Load retry queue on mount

#### Code Patterns to Follow
- **Error Handling**: Catch and queue failures
- **Storage Pattern**: Use localStorage for persistence

### Acceptance Criteria

```gherkin
Scenario 1: Successful save
  Given network is available
  When creating annotation
  Then save completes
  And annotation appears

Scenario 2: Failed save queued
  Given network is offline
  When creating annotation
  Then save queued
  And yellow badge appears

Scenario 3: Retry on reconnect
  Given pending saves exist
  When page reloads
  Then retries are attempted
  And successful saves clear queue
```

### Rule-Based Criteria
- [x] Create operation works
- [x] Update operation works
- [x] Delete operation works
- [x] Retry queue functions
- [x] localStorage backup works

### Manual Testing Steps
1. Create annotation online
2. Create annotation offline
3. Verify queue indicator
4. Reload and verify retry
5. Test update and delete

### Validation
```bash
npm test src/hooks/useAnnotations.test.ts
```

---

## Task T-014: Update Annotation Server Actions

**Priority**: Critical
**Estimate**: 1.5 hours
**Dependencies**: T-001
**Assignee**: Backend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 576-592

### Task Purpose
**As a** server API
**I need** updated annotation actions
**So that** 5-component pattern is used

### Technical Requirements
- Switch to 5-component pattern
- Add offset update action
- Maintain validation
- Follow existing patterns

### Implementation Details

#### Files to Modify/Create
```
└── src/app/actions/annotations.ts - [Update to 5-component pattern]
```

#### Key Implementation Steps
1. Update createAnnotation to use 5 components
2. Add updateAnnotationOffsets action
3. Update validation schemas
4. Maintain revalidatePath calls

#### Code Patterns to Follow
- **ECS Pattern**: src/lib/ecs/annotations.ts:1042-1147
- **Server Action Pattern**: Return { success, data, error }

### Acceptance Criteria

```gherkin
Scenario 1: Create with 5 components
  Given annotation data provided
  When createAnnotation called
  Then 5 components created
  And all data persisted

Scenario 2: Update offsets
  Given annotation exists
  When updateAnnotationOffsets called
  Then Position component updated
  And ChunkRef recalculated
```

### Rule-Based Criteria
- [x] 5-component pattern used
- [x] Validation works
- [x] Error handling present
- [x] Path revalidation occurs

### Manual Testing Steps
1. Create annotation via action
2. Verify 5 components in DB
3. Update annotation offsets
4. Verify changes persisted
5. Check error cases

### Validation
```bash
npm test src/app/actions/annotations.test.ts
npx tsc --noEmit
```

---

## Task T-015: Dual Storage - annotations.json

**Priority**: High
**Estimate**: 1.5 hours
**Dependencies**: T-014
**Assignee**: Backend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 594-609

### Task Purpose
**As a** storage system
**I need** JSON file backup of annotations
**So that** annotations are portable

### Technical Requirements
- Write annotations to Supabase Storage
- Read and parse JSON files
- Sync between storage and database
- Handle conflicts (last-write-wins)

### Implementation Details

#### Files to Modify/Create
```
└── src/lib/reader/annotation-storage.ts - [Create storage utilities]
```

#### Key Implementation Steps
1. Implement writeAnnotationsFile to Storage
2. Implement readAnnotationsFile from Storage
3. Add sync logic with conflict resolution
4. Handle errors gracefully

#### Code Patterns to Follow
- **Storage Pattern**: Use existing markdown storage approach
- **Path Pattern**: `${userId}/${documentId}/annotations.json`

### Acceptance Criteria

```gherkin
Scenario 1: Write to storage
  Given annotations exist
  When writeAnnotationsFile called
  Then JSON file created in Storage
  And format matches specification

Scenario 2: Read from storage
  Given annotations.json exists
  When readAnnotationsFile called
  Then annotations parsed correctly
  And returned as entities

Scenario 3: Sync conflicts
  Given database and file differ
  When sync called
  Then last-write-wins applied
  And both sources updated
```

### Rule-Based Criteria
- [x] JSON format correct
- [x] Path convention followed
- [x] Error handling present
- [x] Sync logic works

### Manual Testing Steps
1. Create annotations
2. Check Storage for JSON
3. Modify JSON manually
4. Run sync
5. Verify resolution

### Validation
```bash
npm test src/lib/reader/annotation-storage.test.ts
```

---

## Task T-016: Update VirtualizedReader

**Priority**: Critical
**Estimate**: 2 hours
**Dependencies**: T-008, T-010, T-011, T-013
**Assignee**: Fullstack Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 611-628

### Task Purpose
**As a** document reader
**I need** annotation support integrated
**So that** users can create and resize annotations

### Technical Requirements
- Integrate all annotation hooks
- Progressive annotation loading
- Optimistic updates
- QuickCapture integration

### Implementation Details

#### Files to Modify/Create
```
└── src/components/reader/VirtualizedReader.tsx - [Add annotation support]
```

#### Key Implementation Steps
1. Add useAnnotations hook
2. Add useTextSelection hook
3. Add useHighlightResize hook
4. Parse blocks with annotations
5. Render QuickCapture conditionally

#### Code Patterns to Follow
- **Progressive Loading**: First render without, then with annotations
- **Optimistic Updates**: Update local state immediately

### Acceptance Criteria

```gherkin
Scenario 1: Progressive loading
  Given document loads
  When annotations fetch
  Then document renders immediately
  And annotations appear when loaded

Scenario 2: Create annotation flow
  Given text selected
  When QuickCapture saved
  Then annotation appears immediately
  And persists to database

Scenario 3: Resize annotation flow
  Given annotation exists
  When user resizes
  Then preview shows
  And changes save on release
```

### Rule-Based Criteria
- [x] Hooks integrated properly
- [x] Progressive loading works
- [x] Create flow complete
- [x] Resize flow complete
- [x] Performance maintained

### Manual Testing Steps
1. Load document
2. Select text
3. Create annotation
4. Resize annotation
5. Verify persistence

### Validation
```bash
npm run dev
# Full manual testing required
```

---

## Task T-017: BlockRenderer Component

**Priority**: High
**Estimate**: 1 hour
**Dependencies**: T-003
**Assignee**: Frontend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 630-642

### Task Purpose
**As a** rendering system
**I need** block component with sanitization
**So that** highlights render safely

### Technical Requirements
- Sanitize HTML with DOMPurify
- Allow mark tags and data attributes
- Set block data attributes
- Memoize for performance

### Implementation Details

#### Files to Modify/Create
```
└── src/components/reader/BlockRenderer.tsx - [Create block renderer]
```

#### Key Implementation Steps
1. Sanitize HTML allowing mark tags
2. Set data attributes for offsets
3. Apply prose styles
4. Use React.memo

#### Code Patterns to Follow
- **Sanitization**: Configure DOMPurify for mark tags
- **Performance**: Use React.memo

### Acceptance Criteria

```gherkin
Scenario 1: Render with highlights
  Given block with injected marks
  When BlockRenderer renders
  Then highlights appear
  And HTML is sanitized

Scenario 2: Data attributes set
  Given block with offsets
  When rendered
  Then data-start-offset present
  And data-chunk-id present
```

### Rule-Based Criteria
- [x] HTML sanitized
- [x] Mark tags preserved
- [x] Data attributes set
- [x] Component memoized

### Validation
```bash
npm run lint src/components/reader/BlockRenderer.tsx
```

---

## Phase 5: Integration Tasks

---

## Task T-018: Run Migration

**Priority**: Critical
**Estimate**: 0.5 hours
**Dependencies**: T-001
**Assignee**: Backend Developer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 644-648

### Task Purpose
**As a** deployment process
**I need** to apply database migration
**So that** indexes are created

### Technical Requirements
- Apply migration successfully
- Verify indexes created
- No errors in logs

### Implementation Details

#### Key Implementation Steps
1. Run `npx supabase db push`
2. Check Supabase Studio for indexes
3. Review logs for errors

### Acceptance Criteria

```gherkin
Scenario 1: Migration success
  Given migration file exists
  When npx supabase db push runs
  Then migration applies
  And indexes visible in Studio
```

### Manual Testing Steps
1. Run migration command
2. Check Studio indexes
3. Review error logs
4. Test queries use indexes

### Validation
```bash
npx supabase db push
npx supabase db diff --schema public
```

---

## Task T-019: Test Dual Storage

**Priority**: High
**Estimate**: 0.5 hours
**Dependencies**: T-015, T-016
**Assignee**: QA Engineer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 650-656

### Task Purpose
**As a** quality assurance
**I need** to verify dual storage works
**So that** data consistency is maintained

### Manual Testing Steps
1. Create annotation via UI
2. Check database for 5 components
3. Check Storage for JSON file
4. Verify data matches
5. Reload and verify render

### Acceptance Criteria

```gherkin
Scenario 1: Storage consistency
  Given annotation created
  When checking both stores
  Then database has entity
  And JSON file exists
  And data matches exactly
```

---

## Task T-020: Test Multi-Chunk

**Priority**: High
**Estimate**: 0.5 hours
**Dependencies**: T-016
**Assignee**: QA Engineer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 658-664

### Task Purpose
**As a** quality assurance
**I need** to verify multi-chunk support
**So that** cross-chunk annotations work

### Manual Testing Steps
1. Select text across 3 chunks
2. Create annotation
3. Verify ChunkRef has 3 IDs
4. Check database persistence
5. Reload and verify

### Acceptance Criteria

```gherkin
Scenario 1: Multi-chunk annotation
  Given selection spans 3 chunks
  When annotation created
  Then ChunkRef.chunkIds has 3 entries
  And all chunks persisted
```

---

## Task T-021: Test Resize

**Priority**: High
**Estimate**: 0.5 hours
**Dependencies**: T-016
**Assignee**: QA Engineer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 666-673

### Task Purpose
**As a** quality assurance
**I need** to verify resize functionality
**So that** boundary adjustment works

### Manual Testing Steps
1. Create single-chunk highlight
2. Hover near edge for cursor
3. Drag into next chunk
4. Verify ChunkRef updates
5. Check persistence

### Acceptance Criteria

```gherkin
Scenario 1: Resize across chunks
  Given highlight in chunk 42
  When resized to chunk 43
  Then ChunkRef updates to both
  And changes persist
```

---

## Task T-022: Test iPad Touch

**Priority**: High
**Estimate**: 1 hour
**Dependencies**: T-016
**Assignee**: QA Engineer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 675-683

### Task Purpose
**As a** quality assurance
**I need** to verify iPad support
**So that** touch interactions work

### Manual Testing Steps
1. Open on iPad Safari
2. Long-press to select
3. Create annotation
4. Long-press highlight edge
5. Drag to resize
6. Verify behavior matches desktop

### Acceptance Criteria

```gherkin
Scenario 1: Touch selection
  Given iPad Safari
  When long-press selection
  Then QuickCapture appears
  And annotation creates

Scenario 2: Touch resize
  Given existing highlight
  When long-press and drag
  Then resize works
  And matches desktop behavior
```

---

## Task T-023: Test Retry Queue

**Priority**: High
**Estimate**: 0.5 hours
**Dependencies**: T-013
**Assignee**: QA Engineer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 685-694

### Task Purpose
**As a** quality assurance
**I need** to verify retry queue
**So that** failed saves recover

### Manual Testing Steps
1. Disconnect network
2. Create annotation
3. Verify yellow badge
4. Check localStorage
5. Reconnect and reload
6. Verify retry succeeds

### Acceptance Criteria

```gherkin
Scenario 1: Offline queue
  Given network offline
  When annotation created
  Then yellow badge shows
  And localStorage has queue

Scenario 2: Retry on reload
  Given pending saves exist
  When page reloads online
  Then saves retry
  And queue clears
```

---

## Task T-024: Performance Validation

**Priority**: Medium
**Estimate**: 1 hour
**Dependencies**: All tasks
**Assignee**: Performance Engineer

### Source PRP Document
**Reference**: docs/prps/annotation-system.md - Lines 696-703

### Task Purpose
**As a** quality assurance
**I need** to verify performance targets
**So that** user experience is smooth

### Manual Testing Steps
1. Create 100+ annotations
2. Measure parse time
3. Scroll entire document
4. Monitor FPS
5. Check memory usage
6. Verify virtual scrolling

### Acceptance Criteria

```gherkin
Scenario 1: Parse performance
  Given 100+ annotations
  When document parses
  Then completes under 100ms

Scenario 2: Scroll performance
  Given rendered document
  When scrolling
  Then maintains 60fps
  And no memory leaks
```

### Validation
```bash
# Use Chrome DevTools Performance tab
# Monitor rendering performance
# Check memory profiler
```

---

## Implementation Recommendations

### Suggested Team Structure
- **Backend Developer** (1): T-001, T-002, T-014, T-015, T-018
- **Frontend Developer** (2): T-003, T-004, T-005, T-006, T-007, T-010, T-011, T-012, T-017
- **Fullstack Developer** (1): T-008, T-009, T-013, T-016
- **QA Engineer** (1): T-019 through T-024

### Optimal Task Sequencing

#### Week 1 (Parallel Work Possible)
**Backend Track:**
- Day 1: T-001 (Migration) → T-002 (Chunk Utils)
- Day 2-3: T-014 (Server Actions) → T-015 (Dual Storage)

**Frontend Track:**
- Day 1: T-005 (CSS) + T-012 (ColorPicker)
- Day 2: T-003 (Injector) → T-004 (Parser Update)
- Day 3: T-006 (Detection) + T-007 (Offset Calc)

#### Week 2 (Integration Focus)
**Fullstack Track:**
- Day 4: T-010 (Selection) → T-011 (QuickCapture)
- Day 5: T-008 (Resize Hook) → T-009 (Preview)
- Day 6: T-013 (Annotations Hook)

**Integration:**
- Day 7: T-016 (Reader Update) + T-017 (BlockRenderer)
- Day 8: T-018 (Migration) → T-019-T-024 (Testing)

### Parallelization Opportunities

**Can Be Done in Parallel:**
- T-001, T-005, T-012 (No dependencies)
- T-002 and T-006 (After T-001)
- T-003 and T-007 (After T-002)
- T-011 and T-014 (Different layers)

**Must Be Sequential:**
- T-003 → T-004 (Parser needs injector)
- T-008 → T-009 (Preview extends resize)
- T-016 → T-018 → T-019+ (Integration then test)

### Resource Allocation Suggestions
- Assign most experienced developer to T-008 (useHighlightResize) - most complex
- Assign UI specialist to T-011 (QuickCapture) - user-facing
- Assign backend specialist to T-014 (Server Actions) - critical data layer
- Have QA prepare test plans during development phases

---

## Critical Path Analysis

### Tasks on Critical Path
These tasks must be completed sequentially and determine minimum completion time:

1. **T-001** → **T-002** → **T-003** → **T-004** (Foundation → Rendering)
2. **T-007** → **T-010** (Selection System)
3. **T-014** (Server Actions)
4. **T-016** → **T-018** (Integration)

**Minimum Time**: 11.5 hours (if no parallelization on critical path)

### Potential Bottlenecks
1. **T-008 (useHighlightResize)**: Complex logic with touch support - allocate senior developer
2. **T-016 (VirtualizedReader Update)**: Integration point for all features - requires coordination
3. **T-022 (iPad Testing)**: Requires physical device - ensure availability

### Schedule Optimization Suggestions
1. Start T-001, T-005, T-012 immediately (no dependencies)
2. Fast-track critical path tasks with senior developers
3. Prepare test environments early (especially iPad)
4. Run integration tests continuously, not just at end
5. Keep T-024 (Performance) as ongoing validation

---

## Risk Mitigation Strategies

### High Risk: Range API Complexity (T-007, T-010)
**Mitigation:**
- Create prototype early in sprint
- Reference implementation plan patterns
- Prepare test fixtures with complex HTML
- Have fallback to simpler selection if needed

### Medium Risk: Touch Event Handling (T-008, T-022)
**Mitigation:**
- Test on real iPad early
- Use Safari remote debugging
- Implement mouse first, then add touch
- Have iOS developer available for consultation

### Medium Risk: Performance with 100+ Annotations (T-024)
**Mitigation:**
- Profile during development, not after
- Implement virtual rendering from start
- Use React.memo aggressively
- Consider pagination if needed

### Low Risk: Dual Storage Sync (T-015)
**Mitigation:**
- Simple last-write-wins strategy
- Manual sync trigger if auto-sync fails
- Clear error messages to user
- Storage file is backup, database is primary

---

## Testing Strategy per Phase

### Phase 1: Foundation Testing
- Unit tests for all utilities
- Migration rollback test
- Type checking on all new files

### Phase 2: Inline Highlights Testing
- HTML injection unit tests
- Visual regression tests
- Performance benchmarks

### Phase 3: Resizable Highlights Testing
- Mouse interaction tests
- Touch simulation tests
- Visual feedback validation

### Phase 4: Text Selection Testing
- Selection accuracy tests
- Multi-chunk validation
- QuickCapture UI tests

### Phase 5: Integration Testing
- End-to-end user flows
- Data persistence validation
- Cross-browser testing

### Phase 6: Final Validation
- Performance profiling
- iPad device testing
- Stress testing with many annotations
- User acceptance testing

---

## Notes for Implementation Team

### Quick Reference Commands
```bash
# Development
npm run dev                    # Start development server
npx supabase db push          # Apply migrations
npm test [file]               # Run specific tests
npm run lint                  # Check code quality
npx tsc --noEmit             # Type checking

# Testing
npm run test:critical         # Must-pass tests
npm run test:e2e             # End-to-end tests
npm run build                # Production build test
```

### Critical Files to Review Before Starting
1. `src/lib/ecs/annotations.ts` - 5-component pattern reference
2. `src/lib/reader/block-parser.ts` - Offset calculation patterns
3. `docs/todo/complete-annotation-system.md` - Implementation patterns
4. `src/components/layout/ProcessingDock.tsx` - Fixed UI pattern

### Common Pitfalls to Avoid
- Don't use dynamic Tailwind classes for colors (use data attributes)
- Don't forget `{ passive: false }` for touch events
- Don't mix 3-component and 5-component patterns
- Don't skip word boundary snapping
- Always write to both storage locations

---

**End of Task Breakdown Document**