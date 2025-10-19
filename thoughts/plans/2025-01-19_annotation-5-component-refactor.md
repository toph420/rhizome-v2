# Annotation 5-Component Refactor Implementation Plan

## Overview

Refactor the annotation system from inconsistent 3-component lowercase pattern to consistent 5-component PascalCase pattern, matching the Spark system implementation and establishing a clean foundation for future development.

## Current State Analysis

### Critical Inconsistency Discovered

The codebase has **two parallel annotation implementations**:

**Implementation 1: Production (Server Actions)** - 3 lowercase components
- Location: `src/app/actions/annotations.ts`
- Components: `annotation`, `position`, `source`
- Status: ✅ Active, used by all UI
- Pattern: Direct ECS calls in server actions

**Implementation 2: ECS Library (Unused)** - 5 PascalCase components
- Location: `src/lib/ecs/annotations.ts`
- Components: `Position`, `Visual`, `Content`, `Temporal`, `ChunkRef`
- Status: ❌ Defined but never used
- Pattern: Clean `AnnotationOperations` wrapper class

**Spark System (Reference)** - 4 PascalCase components
- Location: `src/lib/ecs/sparks.ts`
- Components: `Spark`, `Content`, `Temporal`, `ChunkRef`
- Status: ✅ Recently refactored, clean implementation
- Pattern: `SparkOperations` wrapper class

### Key Discoveries

**From codebase-locator:**
- 47 annotation-related files identified
- 12 core implementation files need updates
- 7 server action functions need refactoring
- 8 UI components need component access updates

**From codebase-analyzer:**
- Server actions create entities at `annotations.ts:77` with lowercase components
- Query pattern at `annotations.ts:238` searches for `['annotation', 'position', 'source']`
- Component mapping at `annotations.ts:251-258` uses lowercase `component_type` strings
- Recovery system at `annotations.ts:280-464` depends on lowercase naming

**From codebase-pattern-finder:**
- SparkOperations shows ideal wrapper pattern
- Sparks use PascalCase throughout: `Spark`, `Content`, `Temporal`, `ChunkRef`
- Lowercase duplicates required for ECS filtering: `chunk_id`, `document_id`
- Server actions should instantiate fresh ECS + Operations per request

### Database State

- **Existing annotations**: 0 (deleted in preparation)
- **Migration needed**: No (fresh start)
- **Schema changes**: None (components table is schemaless)

## Desired End State

### Component Structure

All annotations use **5 PascalCase components**:

```typescript
AnnotationEntity {
  components: {
    Position: {
      documentId, document_id,
      startOffset, endOffset,
      originalText, pageLabel,
      textContext, originalChunkIndex,
      recoveryConfidence, recoveryMethod, needsReview
    },
    Visual: {
      type: 'highlight' | 'underline' | 'margin-note' | 'comment',
      color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
    },
    Content: {
      note?: string,
      tags: string[]
    },
    Temporal: {
      createdAt, updatedAt,
      lastViewedAt?, lastRecoveredAt?
    },
    ChunkRef: {
      chunkId, chunk_id,
      chunkIds?, chunkPosition,
      documentId?, document_id?,
      hasSelections?
    }
  }
}
```

### Architecture

```
UI Components
    ↓
Server Actions (thin wrappers)
    ↓
AnnotationOperations (business logic)
    ↓
ECS (persistence layer)
    ↓
Database (components table)
```

### Verification Criteria

**Automated:**
- [ ] Type check: `npm run type-check` (0 errors)
- [ ] Build: `npm run build` (success)
- [ ] Unit tests: `npm test src/lib/ecs/__tests__/annotations.test.ts`

**Manual:**
- [ ] Create annotation in reader (select text, save)
- [ ] Update annotation (change color, add note)
- [ ] Delete annotation
- [ ] Annotations persist across page reload
- [ ] Multi-chunk annotations work
- [ ] Spark-to-annotation linking works

## Rhizome Architecture

- **Module**: Main App only (Next.js)
- **Storage**: Database (ECS components) + Storage (portability)
- **Migration**: No (schemaless components table)
- **Test Tier**: Stable (fix when broken)
- **Pipeline Stages**: None (reader-only feature)
- **Engines**: None (no connection detection for annotations)

## What We're NOT Doing

- ❌ Migrating existing data (deleted all 4 annotations)
- ❌ Changing database schema (components table is schemaless)
- ❌ Modifying ECS core (`ecs.ts`)
- ❌ Touching recovery algorithms (`worker/lib/fuzzy-matching.ts`)
- ❌ Changing UI/UX behavior (only internal structure)
- ❌ Modifying Spark system (already correct)

## Implementation Approach

**Strategy**: Bottom-up refactor
1. Fix foundation (types, AnnotationOperations)
2. Update server actions (use wrapper)
3. Update UI components (access PascalCase components)
4. Update stores and hooks
5. Test thoroughly

**Why bottom-up:**
- TypeScript catches errors as we go
- Each phase builds on previous
- Can test incrementally
- Reduces risk of breaking changes

---

## Phase 1: Foundation - Types & AnnotationOperations

### Overview

Update type definitions to use 5-component pattern and enhance `AnnotationOperations` wrapper to support all current features (multi-chunk, recovery metadata, etc.).

### Changes Required

#### 1. Type Definitions

**File**: `src/types/annotations.ts`

**Current state**:
- Defines old 3-component types: `AnnotationData`, `PositionData`, `SourceData`
- `StoredAnnotation` uses lowercase components

**Changes**:
```typescript
/**
 * Annotation system type definitions.
 * Uses 5-component ECS pattern for consistency with Sparks.
 */

// ============================================
// RE-EXPORT ECS TYPES
// ============================================

export type {
  AnnotationEntity,
  PositionComponent,
  VisualComponent,
  ContentComponent,
  TemporalComponent,
  ChunkRefComponent,
} from '@/lib/ecs/components'

// Backwards compatibility alias
export type { AnnotationEntity as StoredAnnotation } from '@/lib/ecs/components'

// ============================================
// UI-SPECIFIC TYPES
// ============================================

export interface TextSelection {
  text: string
  range: {
    startOffset: number
    endOffset: number
    chunkIds: string[]
  }
  rect: DOMRect
}

export interface OptimisticAnnotation {
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
  _deleted?: boolean
}

// Keep existing Chunk, Engine types, etc. (no changes)
```

**Status**: ✅ Already completed

#### 2. AnnotationOperations Enhancement

**File**: `src/lib/ecs/annotations.ts`

**Current state**:
- Has 5-component create method
- Missing: multi-chunk support, recovery metadata, spark refs

**Add to CreateAnnotationInput**:
```typescript
export interface CreateAnnotationInput {
  // Existing fields
  documentId: string
  startOffset: number
  endOffset: number
  originalText: string
  type: VisualComponent['type']
  color?: VisualComponent['color']
  note?: string
  tags?: string[]
  pageLabel?: string

  // NEW: Multi-chunk support
  chunkIds: string[]  // Array instead of singular chunkId

  // NEW: Recovery metadata
  textContext?: {
    before: string
    after: string
  }
  originalChunkIndex?: number

  // NEW: Spark references
  sparkRefs?: string[]
}
```

**Update create() method**:
```typescript
async create(input: CreateAnnotationInput): Promise<string> {
  const now = new Date().toISOString()
  const primaryChunkId = input.chunkIds[0]

  const entityId = await this.ecs.createEntity(this.userId, {
    Position: {
      documentId: input.documentId,
      document_id: input.documentId,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      originalText: input.originalText,
      pageLabel: input.pageLabel,
      textContext: input.textContext,
      originalChunkIndex: input.originalChunkIndex,
      // Recovery fields initialized
      recoveryConfidence: 1.0,
      recoveryMethod: 'exact',
      needsReview: false,
    },
    Visual: {
      type: input.type,
      color: input.color || 'yellow',
    },
    Content: {
      note: input.note,
      tags: input.tags || [],
    },
    Temporal: {
      createdAt: now,
      updatedAt: now,
    },
    ChunkRef: {
      chunkId: primaryChunkId,
      chunk_id: primaryChunkId,  // For ECS filtering
      chunkIds: input.chunkIds,   // Full array
      chunkPosition: 0,
      documentId: input.documentId,
      document_id: input.documentId,  // For ECS filtering
    },
  })

  return entityId
}
```

**Add new methods**:
```typescript
/**
 * Add spark reference to annotation
 */
async addSparkRef(annotationId: string, sparkId: string): Promise<void> {
  const entity = await this.ecs.getEntity(annotationId, this.userId)
  if (!entity) throw new Error('Annotation not found')

  const components = this.extractComponents(entity)
  const annotationComponent = components.find(c => c.component_type === 'Annotation')

  if (annotationComponent) {
    const currentRefs = annotationComponent.data.sparkRefs || []
    if (currentRefs.includes(sparkId)) return

    await this.ecs.updateComponent(
      annotationComponent.id,
      {
        ...annotationComponent.data,
        sparkRefs: [...currentRefs, sparkId],
      },
      this.userId
    )
  }

  // Update Temporal.updatedAt
  const temporalComponent = components.find(c => c.component_type === 'Temporal')
  if (temporalComponent) {
    await this.ecs.updateComponent(
      temporalComponent.id,
      { ...temporalComponent.data, updatedAt: new Date().toISOString() },
      this.userId
    )
  }
}

/**
 * Update annotation after recovery process
 */
async updateAfterRecovery(
  entityId: string,
  chunkId: string,
  confidence: number,
  method: string
): Promise<void> {
  const entity = await this.ecs.getEntity(entityId, this.userId)
  if (!entity) throw new Error('Annotation not found')

  const components = this.extractComponents(entity)
  const positionComponent = components.find(c => c.component_type === 'Position')

  if (positionComponent) {
    await this.ecs.updateComponent(
      positionComponent.id,
      {
        ...positionComponent.data,
        recoveryConfidence: confidence,
        recoveryMethod: method,
        needsReview: confidence >= 0.70 && confidence < 0.85,
      },
      this.userId
    )
  }

  // Update ChunkRef if chunk changed
  const chunkRefComponent = components.find(c => c.component_type === 'ChunkRef')
  if (chunkRefComponent && chunkRefComponent.data.chunkId !== chunkId) {
    await this.ecs.updateComponent(
      chunkRefComponent.id,
      {
        ...chunkRefComponent.data,
        chunkId,
        chunk_id: chunkId,
        chunkIds: [chunkId],  // Update array too
      },
      this.userId
    )
  }

  // Update Temporal.lastRecoveredAt
  const temporalComponent = components.find(c => c.component_type === 'Temporal')
  if (temporalComponent) {
    await this.ecs.updateComponent(
      temporalComponent.id,
      {
        ...temporalComponent.data,
        lastRecoveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      this.userId
    )
  }
}

/**
 * Mark annotation as orphaned (recovery failed)
 */
async markOrphaned(entityId: string): Promise<void> {
  await this.updateAfterRecovery(entityId, '', 0, 'lost')
}

/**
 * Get annotations needing review
 */
async getNeedingReview(documentId: string): Promise<AnnotationEntity[]> {
  const allAnnotations = await this.getByDocument(documentId)

  return allAnnotations.filter(ann => {
    const position = this.getComponent<PositionComponent>(ann, 'Position')
    return position.needsReview === true
  })
}
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npx tsc --noEmit src/lib/ecs/annotations.ts src/types/annotations.ts`
- [ ] No TypeScript errors in these files
- [ ] Exports compile correctly

#### Manual Verification:
- [ ] `AnnotationEntity` type has 5 components
- [ ] All component types are PascalCase
- [ ] `CreateAnnotationInput` accepts `chunkIds` array
- [ ] New methods exist: `addSparkRef`, `updateAfterRecovery`, `markOrphaned`, `getNeedingReview`

---

## Phase 2: Server Actions Refactor

### Overview

Replace direct ECS calls in server actions with `AnnotationOperations` wrapper. Maintain backwards-compatible API for UI.

### Changes Required

#### 1. Update Imports

**File**: `src/app/actions/annotations.ts`

**Current imports**:
```typescript
import { createECS } from '@/lib/ecs'
import type { StoredAnnotation, AnnotationData, PositionData, SourceData } from '@/types/annotations'
```

**New imports**:
```typescript
import { createECS } from '@/lib/ecs'
import { AnnotationOperations } from '@/lib/ecs/annotations'
import type { AnnotationEntity } from '@/types/annotations'
```

#### 2. Refactor createAnnotation()

**Before** (lines 39-135):
```typescript
export async function createAnnotation(data) {
  // ... validation ...
  const ecs = createECS()

  // Manual chunk index lookup (lines 59-74)
  let chunkIndex = -1
  if (primaryChunkId) {
    const { data: chunks } = await supabase.from('chunks').select(...)
    chunkIndex = chunks?.findIndex(c => c.id === primaryChunkId) ?? -1
  }

  // Manual entity creation with 3 lowercase components (lines 77-107)
  const entityId = await ecs.createEntity(user.id, {
    annotation: { text, note, tags, color, range, textContext },
    position: { chunkIds, startOffset, endOffset, confidence, method, textContext, originalChunkIndex },
    source: { chunk_id, chunk_ids, document_id }
  })

  // Manual position component update (lines 110-124)
  if (chunkIndex >= 0) {
    const { data: positionComponent } = await supabase.from('components')...
    await supabase.from('components').update({ original_chunk_index: chunkIndex })...
  }

  return { success: true, id: entityId }
}
```

**After**:
```typescript
export async function createAnnotation(
  data: z.infer<typeof CreateAnnotationSchema>
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const validated = CreateAnnotationSchema.parse(data)

    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const supabase = await createClient()

    // Get chunk index for recovery optimization
    const primaryChunkId = validated.chunkIds[0]
    let chunkIndex = -1

    if (primaryChunkId) {
      const { data: chunks } = await supabase
        .from('chunks')
        .select('id, chunk_index')
        .eq('document_id', validated.documentId)
        .eq('is_current', true)
        .order('chunk_index')

      chunkIndex = chunks?.findIndex(c => c.id === primaryChunkId) ?? -1
    }

    // Use AnnotationOperations wrapper
    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    const entityId = await ops.create({
      documentId: validated.documentId,
      startOffset: validated.startOffset,
      endOffset: validated.endOffset,
      originalText: validated.text,
      chunkIds: validated.chunkIds,
      type: 'highlight',  // Default type
      color: validated.color,
      note: validated.note,
      tags: validated.tags,
      textContext: {
        before: validated.textContext.before,
        after: validated.textContext.after,
      },
      originalChunkIndex: chunkIndex >= 0 ? chunkIndex : undefined,
    })

    console.log(`[Annotations] ✓ Created: ${entityId}`)

    return { success: true, id: entityId }
  } catch (error) {
    console.error('[Annotations] Create failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

**Key changes**:
- ✅ Uses `AnnotationOperations` wrapper
- ✅ PascalCase components created internally
- ✅ Chunk index logic preserved
- ✅ Same external API (backwards compatible)
- ✅ Cleaner, less code (135 lines → ~50 lines)

#### 3. Refactor updateAnnotation()

**Before** (lines 146-189):
```typescript
export async function updateAnnotation(entityId, updates) {
  const ecs = createECS()
  const entity = await ecs.getEntity(entityId, user.id)

  // Find annotation component manually
  const components = entity.components || []
  const annotationComponent = components.find(c => c.component_type === 'annotation')

  // Manual merge and update
  await ecs.updateComponent(
    annotationComponent.id,
    { ...annotationComponent.data, note: updates.note, tags: updates.tags, color: updates.color },
    user.id
  )

  return { success: true }
}
```

**After**:
```typescript
export async function updateAnnotation(
  entityId: string,
  updates: { note?: string; tags?: string[]; color?: string; type?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    await ops.update(entityId, {
      note: updates.note,
      tags: updates.tags,
      color: updates.color as any,  // Type assertion for color enum
      type: updates.type as any,    // Type assertion for type enum
    })

    console.log(`[Annotations] ✓ Updated: ${entityId}`)

    return { success: true }
  } catch (error) {
    console.error('[Annotations] Update failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

#### 4. Refactor deleteAnnotation()

**Before** (lines 196-219):
```typescript
export async function deleteAnnotation(entityId) {
  const ecs = createECS()
  await ecs.deleteEntity(entityId, user.id)
  return { success: true }
}
```

**After**:
```typescript
export async function deleteAnnotation(
  entityId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const ecs = createECS()
    const ops = new AnnotationOperations(ecs, user.id)

    await ops.delete(entityId)

    console.log(`[Annotations] ✓ Deleted: ${entityId}`)

    return { success: true }
  } catch (error) {
    console.error('[Annotations] Delete failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

#### 5. Refactor getAnnotations() and getAnnotationsByDocument()

**Before** (manual component queries):
```typescript
export async function getAnnotations(documentId) {
  const entities = await ecs.query(
    ['annotation', 'position', 'source'],
    user.id,
    { document_id: documentId }
  )

  // Manual mapping (lines 245-258)
  return entities.map(entity => {
    const annotationComponent = entity.components?.find(c => c.component_type === 'annotation')
    const positionComponent = entity.components?.find(c => c.component_type === 'position')
    const sourceComponent = entity.components?.find(c => c.component_type === 'source')

    return {
      id: entity.id,
      components: {
        annotation: annotationComponent?.data,
        position: positionComponent?.data,
        source: sourceComponent?.data,
      }
    }
  })
}
```

**After**:
```typescript
export async function getAnnotations(
  documentId: string
): Promise<AnnotationEntity[]> {
  const user = await getCurrentUser()
  if (!user) return []

  const ecs = createECS()
  const ops = new AnnotationOperations(ecs, user.id)

  return await ops.getByDocument(documentId)
}
```

**Simplification**: 60 lines → 10 lines

#### 6. Refactor getAnnotationsByIds()

**Status**: ✅ Already partially fixed (uses PascalCase components)

**Needs**:
- Change component names from lowercase to PascalCase
- Use correct component structure

**After**:
```typescript
export async function getAnnotationsByIds(
  ids: string[]
): Promise<AnnotationEntity[]> {
  try {
    const user = await getCurrentUser()
    if (!user) return []

    const ecs = createECS()
    const annotations: AnnotationEntity[] = []

    for (const entityId of ids) {
      const entity = await ecs.getEntity(entityId, user.id)
      if (!entity) continue

      const components = entity.components || []

      // Use PascalCase component names
      const position = components.find(c => c.component_type === 'Position')
      const visual = components.find(c => c.component_type === 'Visual')
      const content = components.find(c => c.component_type === 'Content')
      const temporal = components.find(c => c.component_type === 'Temporal')
      const chunkRef = components.find(c => c.component_type === 'ChunkRef')

      // Only include complete annotations (all 5 components)
      if (position && visual && content && temporal && chunkRef) {
        annotations.push({
          id: entityId,
          user_id: user.id,
          created_at: entity.created_at,
          updated_at: entity.updated_at,
          components: {
            Position: position.data,
            Visual: visual.data,
            Content: content.data,
            Temporal: temporal.data,
            ChunkRef: chunkRef.data,
          }
        })
      }
    }

    return annotations
  } catch (error) {
    console.error('[getAnnotationsByIds] Failed:', error)
    return []
  }
}
```

#### 7. Refactor getAnnotationsNeedingReview()

**Before** (lines 280-464 - complex manual queries):
```typescript
export async function getAnnotationsNeedingReview(documentId) {
  // 60+ lines of manual component queries and filtering
  // Queries source, position, annotation separately
  // Manual categorization logic
}
```

**After**:
```typescript
export async function getAnnotationsNeedingReview(
  documentId: string
) {
  const user = await getCurrentUser()
  if (!user) return { success: [], needsReview: [], lost: [] }

  const ecs = createECS()
  const ops = new AnnotationOperations(ecs, user.id)

  const allAnnotations = await ops.getByDocument(documentId)

  const success: any[] = []
  const needsReview: any[] = []
  const lost: any[] = []

  for (const annotation of allAnnotations) {
    const position = annotation.components.Position
    const content = annotation.components.Content
    const visual = annotation.components.Visual

    const confidence = position.recoveryConfidence ?? 0
    const method = position.recoveryMethod

    if (method === 'lost' || confidence === 0) {
      lost.push({
        entityId: annotation.id,
        originalText: position.originalText,
        note: content.note,
        color: visual.color,
        confidence: 0,
        method: 'lost',
      })
    } else if (position.needsReview) {
      needsReview.push({
        entityId: annotation.id,
        originalText: position.originalText,
        note: content.note,
        color: visual.color,
        confidence,
        method,
        suggestedMatch: {
          text: position.originalText,  // Would come from recovery process
          context: position.textContext,
        },
      })
    } else {
      success.push({
        entityId: annotation.id,
        text: position.originalText,
        note: content.note,
        color: visual.color,
        confidence,
        method,
      })
    }
  }

  return { success, needsReview, lost }
}
```

**Simplification**: 184 lines → ~60 lines, clearer logic

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npx tsc --noEmit src/app/actions/annotations.ts`
- [ ] No TypeScript errors
- [ ] All imports resolve correctly

#### Manual Verification:
- [ ] All 7 server actions use `AnnotationOperations`
- [ ] No direct `ecs.createEntity()` calls with lowercase components
- [ ] All functions have proper error handling
- [ ] Console logs include `[Annotations]` prefix
- [ ] Return types match existing API (backwards compatible)

---

## Phase 3: UI Component Updates

### Overview

Update all UI components to access 5 PascalCase components instead of 3 lowercase components.

### Changes Required

#### 1. QuickCapturePanel.tsx

**File**: `src/components/reader/QuickCapturePanel.tsx`

**Current access pattern** (lines 68-75):
```typescript
const [note, setNote] = useState(existingAnnotation?.components.annotation?.note || '')
const [tags, setTags] = useState<string[]>(existingAnnotation?.components.annotation?.tags || [])
const [selectedColor, setSelectedColor] = useState<HighlightColor>(
  existingAnnotation?.components.annotation?.color || 'yellow'
)
```

**Updated access pattern**:
```typescript
const [note, setNote] = useState(existingAnnotation?.components.Content?.note || '')
const [tags, setTags] = useState<string[]>(existingAnnotation?.components.Content?.tags || [])
const [selectedColor, setSelectedColor] = useState<HighlightColor>(
  existingAnnotation?.components.Visual?.color || 'yellow'
)
```

**Update optimistic annotation creation** (lines 172-189):
```typescript
// Before
const optimisticAnnotation: OptimisticAnnotation = {
  id: `temp-${Date.now()}`,
  text: selection.text,
  chunk_ids: selection.range.chunkIds,
  // ... flat structure
}

// After - Keep OptimisticAnnotation flat (it's for UI state)
// Just ensure server action transforms it correctly
```

#### 2. VirtualizedReader.tsx

**File**: `src/components/reader/VirtualizedReader.tsx`

**Find annotation rendering logic** (likely uses `highlight-injector.ts`)

**Update component access**:
```typescript
// Before
const color = annotation.components.annotation?.color
const startOffset = annotation.components.position?.startOffset
const endOffset = annotation.components.position?.endOffset

// After
const color = annotation.components.Visual?.color
const startOffset = annotation.components.Position?.startOffset
const endOffset = annotation.components.Position?.endOffset
```

#### 3. AnnotationsList.tsx

**File**: `src/components/sidebar/AnnotationsList.tsx`

**Update display logic**:
```typescript
// Before
const note = annotation.components.annotation?.note
const tags = annotation.components.annotation?.tags
const color = annotation.components.annotation?.color
const text = annotation.components.annotation?.text

// After
const note = annotation.components.Content?.note
const tags = annotation.components.Content?.tags
const color = annotation.components.Visual?.color
const text = annotation.components.Position?.originalText
```

#### 4. QuickSparkCapture.tsx

**File**: `src/components/reader/QuickSparkCapture.tsx`

**Status**: ✅ Already fixed (lines 414-469)

**Verify** PascalCase component access for linked annotations

#### 5. AnnotationReviewTab.tsx

**File**: `src/components/sidebar/AnnotationReviewTab.tsx`

**Update recovery UI**:
```typescript
// Before
const confidence = annotation.components.position?.recoveryConfidence
const method = annotation.components.position?.recoveryMethod
const needsReview = annotation.components.position?.needsReview

// After
const confidence = annotation.components.Position?.recoveryConfidence
const method = annotation.components.Position?.recoveryMethod
const needsReview = annotation.components.Position?.needsReview
```

#### 6. fuzzy-restore.tsx

**File**: `src/lib/annotations/fuzzy-restore.tsx`

**Update component access throughout**:
```typescript
// Before
annotation.components.position?.originalText
annotation.components.annotation?.note

// After
annotation.components.Position?.originalText
annotation.components.Content?.note
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npx tsc --noEmit src/components/reader/*.tsx src/components/sidebar/*.tsx`
- [ ] Build: `npm run build` (no errors)
- [ ] No TypeScript errors about missing properties

#### Manual Verification:
- [ ] QuickCapturePanel opens and displays correctly
- [ ] Existing annotation data loads when editing
- [ ] Color picker shows correct selected color
- [ ] Tags display correctly
- [ ] Note text displays correctly
- [ ] Annotation highlights render in reader
- [ ] AnnotationsList shows all annotations
- [ ] Review tab shows recovery states correctly

---

## Phase 4: Stores & Hooks Updates

### Overview

Update Zustand stores and React hooks to use `AnnotationEntity` type.

### Changes Required

#### 1. annotation-store.ts

**File**: `src/stores/annotation-store.ts`

**Current** (line 88-89):
```typescript
console.log('[AnnotationStore] updateAnnotation called:', {
  newColor: updates.components?.annotation?.color,
  existingAnnotation: state.annotations[documentId]?.find(a => a.id === annotationId)?.components.annotation?.color
})
```

**After**:
```typescript
console.log('[AnnotationStore] updateAnnotation called:', {
  newColor: updates.components?.Visual?.color,
  existingAnnotation: state.annotations[documentId]?.find(a => a.id === annotationId)?.components.Visual?.color
})
```

**Type import**:
```typescript
// Before
import type { StoredAnnotation } from '@/types/annotations'

// After (StoredAnnotation is now alias for AnnotationEntity)
import type { AnnotationEntity } from '@/types/annotations'
// OR keep StoredAnnotation (it's aliased)
```

#### 2. useAnnotations.ts

**File**: `src/hooks/useAnnotations.ts`

**Status**: ✅ Already uses `AnnotationOperations`

**Verify**: No changes needed (already correct!)

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npx tsc --noEmit src/stores/annotation-store.ts src/hooks/useAnnotations.ts`
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] Store properly stores annotations
- [ ] Updates propagate to UI
- [ ] No console errors about component access

---

## Phase 5: Worker & Recovery System

### Overview

Update worker jobs and recovery system to use 5-component pattern.

### Changes Required

#### 1. export-annotations.ts

**File**: `worker/jobs/export-annotations.ts`

**Update component access**:
```typescript
// Before
const text = annotation.components.annotation?.text
const note = annotation.components.annotation?.note
const tags = annotation.components.annotation?.tags
const color = annotation.components.annotation?.color

// After
const text = annotation.components.Position?.originalText
const note = annotation.components.Content?.note
const tags = annotation.components.Content?.tags
const color = annotation.components.Visual?.color
```

#### 2. recover-annotations.ts

**File**: `worker/handlers/recover-annotations.ts`

**Update recovery metadata writes**:
```typescript
// Before - update 'position' component
await supabase
  .from('components')
  .update({
    data: {
      ...positionData,
      recoveryConfidence: confidence,
      recoveryMethod: method,
      needsReview: needsReview,
    }
  })
  .eq('entity_id', entityId)
  .eq('component_type', 'position')

// After - update 'Position' component
await supabase
  .from('components')
  .update({
    data: {
      ...positionData,
      recoveryConfidence: confidence,
      recoveryMethod: method,
      needsReview: needsReview,
    }
  })
  .eq('entity_id', entityId)
  .eq('component_type', 'Position')  // ✅ PascalCase
```

### Success Criteria

#### Automated Verification:
- [ ] Type check: `npx tsc --noEmit worker/handlers/recover-annotations.ts worker/jobs/export-annotations.ts`
- [ ] Worker builds: `cd worker && npm run build`

#### Manual Verification:
- [ ] Export annotations job works
- [ ] Recovery handler processes annotations correctly
- [ ] Recovery metadata updates Position component

---

## Phase 6: Final Testing & Validation

### Overview

Comprehensive end-to-end testing to ensure all functionality works.

### Test Scenarios

#### 1. Create Annotation Flow

**Steps**:
1. Navigate to `/read/{documentId}`
2. Select text in reader
3. QuickCapturePanel opens
4. Enter note: "Test annotation"
5. Add tag: "testing"
6. Select color: blue
7. Click save

**Expected**:
- [ ] Annotation created in database with 5 components
- [ ] Components use PascalCase names
- [ ] Highlight appears in reader with blue color
- [ ] Note displays in AnnotationsList
- [ ] Tag shows in AnnotationsList

**Verify in database**:
```sql
SELECT
  entity_id,
  component_type,
  data
FROM components
WHERE entity_id = (SELECT id FROM entities ORDER BY created_at DESC LIMIT 1)
ORDER BY component_type;
```

**Should see**:
- `ChunkRef` component
- `Content` component
- `Position` component
- `Temporal` component
- `Visual` component

#### 2. Update Annotation Flow

**Steps**:
1. Click existing annotation in reader
2. QuickCapturePanel opens in edit mode
3. Change color to red
4. Update note to "Updated note"
5. Add tag "updated"
6. Click save

**Expected**:
- [ ] Visual component updated (color changed)
- [ ] Content component updated (note and tags changed)
- [ ] Temporal component updated (updatedAt timestamp)
- [ ] Highlight color changes in reader
- [ ] AnnotationsList shows new data

#### 3. Delete Annotation Flow

**Steps**:
1. Click delete on annotation
2. Confirm deletion

**Expected**:
- [ ] Entity deleted from database
- [ ] All 5 components cascade deleted
- [ ] Highlight removed from reader
- [ ] Removed from AnnotationsList

#### 4. Multi-Chunk Annotation

**Steps**:
1. Select text spanning 2 chunks
2. Create annotation

**Expected**:
- [ ] ChunkRef.chunkIds contains both chunk IDs
- [ ] ChunkRef.chunkId is first chunk (primary)
- [ ] Position component has correct offsets
- [ ] Highlight spans both chunks correctly

#### 5. Spark-to-Annotation Linking

**Steps**:
1. Open spark panel (Cmd+K)
2. Select text in reader
3. Click "Create Annotation" in spark panel
4. Create annotation
5. Click "Link to Spark"

**Expected**:
- [ ] Annotation created
- [ ] Spark.annotationRefs contains annotation ID
- [ ] Link appears in spark UI

#### 6. Recovery Workflow (Manual Test)

**Steps**:
1. Create annotation
2. Edit document markdown (minor change)
3. Trigger reprocessing
4. Check recovery results

**Expected**:
- [ ] Position.recoveryConfidence set
- [ ] Position.recoveryMethod set
- [ ] Position.needsReview set correctly
- [ ] Temporal.lastRecoveredAt updated
- [ ] AnnotationReviewTab shows correct status

### Success Criteria

#### Automated Verification:
- [ ] Full type check: `npm run type-check` (0 errors)
- [ ] Build: `npm run build` (success)
- [ ] Unit tests: `npm test src/lib/ecs/__tests__/`
- [ ] Worker builds: `cd worker && npm run build`

#### Manual Verification:
- [ ] All 6 test scenarios pass
- [ ] No console errors during testing
- [ ] Performance acceptable (create <1s)
- [ ] UI feels responsive
- [ ] No data loss
- [ ] Backwards compatible (existing UI workflows work)

---

## Testing Strategy

### Unit Tests

**Create**: `src/lib/ecs/__tests__/annotations-5-component.test.ts`

```typescript
import { ECS } from '../ecs'
import { AnnotationOperations } from '../annotations'
import { createClient } from '@/lib/supabase/server'

describe('AnnotationOperations - 5 Component Pattern', () => {
  let ecs: ECS
  let ops: AnnotationOperations
  const testUserId = 'test-user-123'

  beforeEach(() => {
    const supabase = createClient()
    ecs = new ECS(supabase)
    ops = new AnnotationOperations(ecs, testUserId)
  })

  test('create() creates 5 PascalCase components', async () => {
    const entityId = await ops.create({
      documentId: 'doc-123',
      startOffset: 0,
      endOffset: 10,
      originalText: 'test text',
      chunkIds: ['chunk-1'],
      type: 'highlight',
      color: 'yellow',
      note: 'test note',
      tags: ['test'],
    })

    const entity = await ecs.getEntity(entityId, testUserId)
    const componentTypes = entity.components?.map(c => c.component_type).sort()

    expect(componentTypes).toEqual([
      'ChunkRef',
      'Content',
      'Position',
      'Temporal',
      'Visual',
    ])
  })

  test('Position component has recovery fields', async () => {
    const entityId = await ops.create({ /* ... */ })
    const entity = await ecs.getEntity(entityId, testUserId)
    const position = entity.components?.find(c => c.component_type === 'Position')

    expect(position?.data).toMatchObject({
      recoveryConfidence: 1.0,
      recoveryMethod: 'exact',
      needsReview: false,
    })
  })

  test('ChunkRef has dual naming for ECS filtering', async () => {
    const entityId = await ops.create({
      documentId: 'doc-123',
      chunkIds: ['chunk-1'],
      /* ... */
    })

    const entity = await ecs.getEntity(entityId, testUserId)
    const chunkRef = entity.components?.find(c => c.component_type === 'ChunkRef')

    expect(chunkRef?.data).toMatchObject({
      chunkId: 'chunk-1',      // camelCase for application
      chunk_id: 'chunk-1',     // lowercase for ECS filtering
      documentId: 'doc-123',
      document_id: 'doc-123',
    })
  })

  test('multi-chunk annotation stores chunkIds array', async () => {
    const entityId = await ops.create({
      chunkIds: ['chunk-1', 'chunk-2'],
      /* ... */
    })

    const entity = await ecs.getEntity(entityId, testUserId)
    const chunkRef = entity.components?.find(c => c.component_type === 'ChunkRef')

    expect(chunkRef?.data.chunkIds).toEqual(['chunk-1', 'chunk-2'])
    expect(chunkRef?.data.chunkId).toBe('chunk-1') // Primary chunk
  })

  test('updateAfterRecovery() updates Position component', async () => {
    const entityId = await ops.create({ /* ... */ })

    await ops.updateAfterRecovery(entityId, 'new-chunk', 0.85, 'context')

    const entity = await ecs.getEntity(entityId, testUserId)
    const position = entity.components?.find(c => c.component_type === 'Position')

    expect(position?.data).toMatchObject({
      recoveryConfidence: 0.85,
      recoveryMethod: 'context',
      needsReview: true, // 0.85 is in review range
    })
  })

  test('getNeedingReview() filters correctly', async () => {
    // Create 3 annotations with different recovery states
    await ops.create({ /* high confidence */ })
    const needsReviewId = await ops.create({ /* ... */ })
    await ops.updateAfterRecovery(needsReviewId, 'chunk', 0.75, 'trigram')
    const lostId = await ops.create({ /* ... */ })
    await ops.markOrphaned(lostId)

    const needingReview = await ops.getNeedingReview('doc-123')

    expect(needingReview).toHaveLength(1)
    expect(needingReview[0].id).toBe(needsReviewId)
  })
})
```

### Integration Tests

**Location**: `tests/integration/annotation-5-component-flow.test.ts`

Test full CRUD flow with database.

### Manual Testing Checklist

**Copy this for manual testing sessions:**

```markdown
## Annotation 5-Component Manual Test

### Create Flow
- [ ] Select text in reader
- [ ] Panel opens with correct selection
- [ ] Enter note, tags, color
- [ ] Save creates 5 PascalCase components
- [ ] Highlight appears in reader
- [ ] Shows in AnnotationsList

### Update Flow
- [ ] Click existing annotation
- [ ] Edit mode loads correct data
- [ ] Change color, note, tags
- [ ] Save updates components
- [ ] UI reflects changes

### Delete Flow
- [ ] Delete annotation
- [ ] Cascade deletes all 5 components
- [ ] UI updates correctly

### Multi-Chunk
- [ ] Select across chunks
- [ ] Creates with chunkIds array
- [ ] Renders correctly

### Spark Linking
- [ ] Open spark panel
- [ ] Create annotation
- [ ] Link to spark
- [ ] Link persists

### Recovery (if time permits)
- [ ] Create annotation
- [ ] Edit markdown
- [ ] Reprocess document
- [ ] Recovery metadata correct
```

---

## Performance Considerations

### Current Performance
- Annotation creation: <1s (network + DB)
- Query all annotations: <500ms (typical doc with 20 annotations)
- Recovery: <30s per document (100 annotations)

### Expected Impact
- **No performance regression** (same number of DB queries)
- Slightly faster server actions (less manual component mapping)
- Same UI rendering performance

### Monitoring
```typescript
// Add timing logs in server actions
console.time('[Annotations] Create')
await ops.create({ /* ... */ })
console.timeEnd('[Annotations] Create')
// Should be <500ms for single annotation
```

---

## Migration Notes

**Not applicable** - We deleted all existing annotations.

If we had data:
```sql
-- Would need migration to transform components:
-- annotation → Position, Visual, Content
-- position → Position (merge recovery fields)
-- source → ChunkRef

-- Example (not needed now):
UPDATE components
SET component_type = 'Position'
WHERE component_type = 'position';
-- etc.
```

---

## Rollback Plan

If critical issues found after deployment:

1. **Revert server actions** to use direct ECS calls
2. **Revert UI components** to lowercase component access
3. **No database changes needed** (schemaless)
4. **Git revert** to commit before Phase 1

**Recovery time**: <10 minutes (git revert + deploy)

---

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **ECS Implementation**: `docs/ECS_IMPLEMENTATION.md`
- **Spark System**: `docs/SPARK_SYSTEM.md`
- **Testing Rules**: `docs/testing/TESTING_RULES.md`
- **Similar Implementation**: `src/lib/ecs/sparks.ts:60-547` (SparkOperations)
- **Component Definitions**: `src/lib/ecs/components.ts:16-219`

---

## Implementation Timeline

**Estimated time**: 2-3 hours

- Phase 1 (Foundation): 30 minutes
- Phase 2 (Server Actions): 45 minutes
- Phase 3 (UI Components): 45 minutes
- Phase 4 (Stores & Hooks): 15 minutes
- Phase 5 (Worker): 15 minutes
- Phase 6 (Testing): 30 minutes

**Approach**: Execute phases sequentially, test after each phase.

---

**Plan Status**: Ready for implementation
**Created**: 2025-01-19
**Last Updated**: 2025-01-19
