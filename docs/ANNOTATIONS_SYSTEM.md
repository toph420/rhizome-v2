# Annotations System Documentation

## Overview

The Rhizome V2 annotations system uses a **5-component ECS (Entity-Component-System) architecture** to provide flexible, recoverable text annotations across multi-format documents.

**Last Updated**: 2025-10-19 (5-component refactor complete)

---

## Architecture

### 5-Component Structure

Every annotation is an **entity** with exactly **5 components**:

| Component | Purpose | Key Fields |
|-----------|---------|------------|
| **Position** | Text location & recovery | `startOffset`, `endOffset`, `originalText`, `textContext`, `recoveryMethod`, `recoveryConfidence`, `needsReview` |
| **Visual** | Display styling | `color` |
| **Content** | User-provided data | `note`, `tags` |
| **Temporal** | Timestamps | `createdAt`, `updatedAt` |
| **ChunkRef** | Document references | `documentId`, `chunkId`, `chunkIds`, `chunkPosition` |

**Why 5 components?**
- **Separation of concerns**: Each component has a single responsibility
- **Flexibility**: Easy to add new components (e.g., `Recovery`, `Metadata`)
- **Recovery**: Position component stores all recovery metadata
- **Performance**: Query only needed components
- **Clarity**: Clear data ownership (Position owns offsets, Visual owns color, etc.)

### Component Details

#### Position Component

```typescript
{
  startOffset: number           // Character offset in markdown (start)
  endOffset: number             // Character offset in markdown (end)
  originalText: string          // The highlighted text
  textContext: {                // Surrounding context for recovery
    before: string              // 50 chars before
    after: string               // 50 chars after
  }
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'trigram' | 'lost'
  recoveryConfidence?: number   // 0.0-1.0
  needsReview?: boolean         // True if confidence < 0.85
}
```

#### Visual Component

```typescript
{
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
}
```

#### Content Component

```typescript
{
  note: string                  // User's annotation note
  tags: string[]                // Tags for categorization
}
```

#### Temporal Component

```typescript
{
  createdAt: string            // ISO timestamp
  updatedAt: string            // ISO timestamp
}
```

#### ChunkRef Component

```typescript
{
  documentId: string           // Document ID
  document_id: string          // For ECS filtering
  chunkId: string              // Primary chunk ID
  chunk_id: string             // For ECS filtering
  chunkIds: string[]           // All overlapping chunks (multi-chunk support)
  chunkPosition: number        // Position within chunk sequence
}
```

---

## File Structure

### Core Files

**ECS Foundation**
- `src/lib/ecs/index.ts` - ECS factory and core query system
- `src/lib/ecs/annotations.ts` - AnnotationOperations class (CRUD + queries)
- `src/lib/ecs/components.ts` - Component type definitions

**Server Actions** (Mutations)
- `src/app/actions/annotations.ts` - All annotation mutations:
  - `createAnnotation()` - Create new annotation
  - `updateAnnotation()` - Update existing annotation
  - `deleteAnnotation()` - Delete annotation
  - `getAnnotationsNeedingReview()` - Recovery workflow

**UI Components**
- `src/components/reader/VirtualizedReader.tsx` - Document reader with annotation rendering
- `src/components/reader/BlockRenderer.tsx` - Per-block markdown + annotation injection
- `src/components/reader/QuickCapturePanel.tsx` - Create/edit annotation panel
- `src/components/sidebar/AnnotationsList.tsx` - Sidebar annotation list

**Utilities**
- `src/lib/annotations/inject.ts` - Inject annotation spans into HTML
- `src/lib/annotations/text-range.ts` - Text selection utilities
- `src/types/annotations.ts` - TypeScript type definitions

**Stores**
- `src/stores/annotation-store.ts` - Document-keyed annotation state
- `src/stores/ui-store.ts` - UI state (selection, panels)
- `src/stores/reader-store.ts` - Reader viewport state

**Worker** (Recovery)
- `worker/handlers/recover-annotations.ts` - Annotation recovery after document edits
- `worker/jobs/export-annotations.ts` - Export annotations to Storage

**Styling**
- `src/app/globals.css` - Annotation highlight styles (lines 145-276)

---

## Usage Examples

### Creating an Annotation

**UI Flow**:
1. User selects text in reader
2. `VirtualizedReader` captures selection → opens `QuickCapturePanel`
3. User adds note, tags, color
4. Click color button → calls `createAnnotation()` server action
5. Optimistic update → instant feedback
6. Server action creates 5-component entity via `AnnotationOperations.create()`

**Code Example**:
```typescript
import { AnnotationOperations } from '@/lib/ecs/annotations'
import { createECS } from '@/lib/ecs'

const ecs = createECS()
const ops = new AnnotationOperations(ecs, userId)

const entityId = await ops.create({
  documentId: 'doc-123',
  text: 'Selected text',
  note: 'My thoughts',
  color: 'yellow',
  tags: ['important'],
  chunkIds: ['chunk-456'],
  startOffset: 100,
  endOffset: 150,
  textContext: { before: '...', after: '...' },
  chunkPosition: 0,
})
```

### Updating an Annotation

```typescript
await ops.update('entity-id', {
  note: 'Updated note',
  tags: ['important', 'architecture'],
  color: 'green'
})
```

### Deleting an Annotation

```typescript
await ops.delete('entity-id')
```

### Querying Annotations

```typescript
// Get all annotations for a document
const annotations = await ops.getByDocument('doc-123')

// Get annotations in a specific range
const visible = await ops.getInRange('doc-123', 1000, 2000)

// Get annotations on a specific page
const pageAnnotations = await ops.getByPage('doc-123', 'page-5')
```

---

## Recovery System

When a document is reprocessed (e.g., after editing markdown or changing chunker), annotations need to be recovered to their new positions.

### Recovery Workflow

1. **Detect Need**: Document reprocessed → chunks change
2. **Run Recovery Job**: `worker/handlers/recover-annotations.ts`
3. **4-Tier Matching**:
   - **Exact match** (100% confidence) - originalText found at expected offset
   - **Context match** (90% confidence) - Use textContext to locate
   - **Chunk-bounded** (80% confidence) - Within chunk boundaries
   - **Trigram fuzzy** (75% confidence) - Fuzzy string matching
   - **Lost** (0% confidence) - Cannot recover

4. **Update Position Component**:
   ```typescript
   {
     startOffset: newStart,
     endOffset: newEnd,
     originalText: matchedText,
     recoveryMethod: 'exact',
     recoveryConfidence: 1.0,
     needsReview: false
   }
   ```

5. **Review UI**: Annotations with `needsReview: true` shown in AnnotationsList

### Recovery Metadata

All recovery information is stored **directly in the Position component**:

```typescript
Position: {
  // ... regular fields
  recoveryMethod: 'exact' | 'context' | 'chunk_bounded' | 'trigram' | 'lost',
  recoveryConfidence: 0.0 - 1.0,
  needsReview: true/false
}
```

**Why in Position?** Recovery is fundamentally about *position*, so metadata lives with position data.

---

## Multi-Chunk Annotations

Annotations can span multiple chunks (e.g., a highlight across 3 paragraphs).

**Implementation**:
- `ChunkRef.chunkIds` stores all overlapping chunk IDs
- `Position.startOffset` and `endOffset` are global markdown offsets
- `BlockRenderer` checks if annotation overlaps each block:
  ```typescript
  const overlapping = annotations.filter(
    ann => ann.endOffset > block.startOffset && ann.startOffset < block.endOffset
  )
  ```

**Rendering**: Each block injects its portion of the annotation using block-relative offsets.

---

## Styling System

Annotations use **data attributes** for styling (no inline styles):

```html
<span data-annotation-id="ent-123" data-annotation-color="yellow">
  Highlighted text
</span>
```

**CSS** (`src/app/globals.css`):
```css
[data-annotation-color="yellow"] {
  background-color: rgba(254, 240, 138, 0.4);
  border-bottom: 2px solid rgba(234, 179, 8, 0.5);
}

[data-annotation-id] {
  cursor: pointer;
}

[data-annotation-start]::before {
  /* Left edge indicator */
  user-select: none;
  pointer-events: none;
}

[data-annotation-end]::after {
  /* Right edge indicator */
  user-select: none;
  pointer-events: none;
}
```

**7 Colors**: yellow, green, blue, red, purple, orange, pink

---

## State Management

### Stores

**annotation-store.ts** - Document-keyed annotation state
```typescript
{
  annotations: {
    [documentId]: AnnotationEntity[]
  }
}
```

**ui-store.ts** - UI state
```typescript
{
  selectedText: TextSelection | null
  quickCaptureOpen: boolean
  sparkCaptureOpen: boolean
  linkedAnnotationIds: string[]
}
```

**reader-store.ts** - Viewport tracking
```typescript
{
  viewportOffsets: { start: number, end: number }
}
```

### Store Actions

```typescript
// annotation-store
addAnnotation(documentId, annotation)
updateAnnotation(documentId, annotationId, updates)
removeAnnotation(documentId, annotationId)

// ui-store
setSelectedText(selection)
setQuickCaptureOpen(open)
addLinkedAnnotation(annotationId)
```

---

## Integration Points

### Reader Integration

**VirtualizedReader.tsx** responsibilities:
- Track text selection
- Manage annotation highlight rendering
- Handle annotation clicks
- Coordinate viewport-based visibility

**BlockRenderer.tsx** responsibilities:
- Inject annotation spans into markdown HTML
- Handle click events on annotations
- Render chunk metadata icons

### Sidebar Integration

**AnnotationsList.tsx** features:
- Sort annotations by document order (startOffset)
- Highlight visible annotations
- Auto-scroll to first visible annotation
- Inline edit mode
- Link to Spark (Phase 6b)
- Delete annotation button

### Spark Integration (Phase 6b)

Annotations can be linked to Sparks via `annotationRefs`:

```typescript
// In Spark component
{
  annotationRefs: ['annotation-entity-id-1', 'annotation-entity-id-2']
}
```

UI shows link button when Spark capture panel is open.

---

## Performance Optimizations

1. **Document-keyed stores** - O(1) lookup by documentId
2. **Viewport filtering** - Only render visible annotations
3. **Optimistic updates** - Instant UI feedback
4. **Memoization** - useMemo for sorted/filtered lists
5. **Ref-based scrolling** - Direct DOM manipulation for scroll coordination

---

## Testing

**Critical Tests** (must pass):
- Annotation creation across chunks
- Annotation recovery after document edit
- Multi-chunk annotation rendering
- Position component update propagation

**Test Files**:
- `__tests__/recover-annotations.test.ts` - Recovery system
- `src/lib/ecs/__tests__/annotations.test.ts` - ECS operations

---

## Common Patterns

### Server Action Pattern

```typescript
'use server'

export async function createAnnotation(input: CreateAnnotationInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const ecs = createECS()
  const ops = new AnnotationOperations(ecs, user.id)

  const entityId = await ops.create(input)

  revalidatePath(`/read/${input.documentId}`)
  return { success: true, id: entityId }
}
```

### Optimistic Update Pattern

```typescript
// 1. Create optimistic annotation
const optimistic: OptimisticAnnotation = {
  id: 'temp-' + Date.now(),
  start_offset: selection.range.startOffset,
  end_offset: selection.range.endOffset,
  color: 'yellow',
  // ...
}

// 2. Add to store immediately
onAnnotationCreated?.(optimistic)

// 3. Call server action
const result = await createAnnotation(input)

// 4. Replace optimistic with real annotation (handled by store)
```

---

## Migration from Old System

**Old Structure** (3 components, lowercase):
- `annotation` → split into `Position`, `Visual`, `Content`
- `position` → `Position` (PascalCase)
- `source` → `ChunkRef` + `Temporal`

**Migration Steps**:
1. Delete all old annotations (Phase 1)
2. Update all queries to use PascalCase components
3. Update recovery handler to write to Position component
4. Update export job to read 5 components

**No database migration needed** - component_type values changed at application level.

---

## Troubleshooting

### Issue: Annotations not showing

**Check**:
1. Are annotations in store? `console.log(useAnnotationStore.getState())`
2. Are components PascalCase? `Position`, `Visual`, `Content`, `Temporal`, `ChunkRef`
3. Is `getByDocument()` filtering for Position component?

### Issue: Sparks showing as annotations

**Fix**: `AnnotationOperations.getByDocument()` must filter for `['Position']` component.

Sparks have `Spark`, `Content`, `Temporal`, `ChunkRef` but **no Position**, so filtering on Position excludes them.

### Issue: Delete not working

**Check**:
1. `deleteAnnotation` server action imported?
2. Store `removeAnnotation()` called after success?
3. Component cascade delete enabled in database?

---

## Future Enhancements

**Planned**:
- [ ] Annotation threads/replies
- [ ] Shared annotations (multi-user)
- [ ] Annotation export to Obsidian/Readwise
- [ ] Annotation search
- [ ] Bulk annotation operations

**Maybe**:
- Annotation versioning
- Annotation merge/split
- Custom annotation types (e.g., question, insight, critique)

---

## Key Takeaways

✅ **5-component ECS** - Position, Visual, Content, Temporal, ChunkRef
✅ **Recovery in Position** - All recovery metadata in Position component
✅ **PascalCase** - Component types use PascalCase (Position, not position)
✅ **Sparks ≠ Annotations** - Filter by Position component to exclude Sparks
✅ **Multi-chunk support** - chunkIds array + global offsets
✅ **Optimistic updates** - Instant UI feedback
✅ **Document-keyed stores** - Fast lookup, no prop drilling

