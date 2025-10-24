# ECS Implementation Guide

**Last Updated**: 2025-10-19

**Implementation Status**:
- ✅ **Core ECS System**: Fully implemented with factory pattern
- ✅ **Annotations**: Complete **5-component pattern** (Position + Visual + Content + Temporal + ChunkRef) with AnnotationOperations wrapper class
- ✅ **Sparks**: Complete **4-component pattern** (Spark + Content + Temporal + ChunkRef) with SparkOperations wrapper class - **v2.0 Production Ready**
- 📋 **Flashcards/Study**: UI placeholder only, backend not implemented

**BREAKING CHANGE** (2025-10-19): Annotation system migrated from 3-component lowercase (annotation, position, source) to 5-component PascalCase (Position, Visual, Content, Temporal, ChunkRef). See `docs/ANNOTATIONS_SYSTEM.md` for details.

## Overview

The Entity Component System (ECS) is the core data architecture for Rhizome V2. It provides maximum flexibility for evolving features without database migrations.

**Core Principles:**
- **Entities** are just UUIDs
- **Components** are bags of data (JSONB)
- **Any entity can have ANY components**
- **No inheritance, only composition**

---

## ⚠️ MANDATORY PATTERN: Operations Wrapper Classes

**CRITICAL FOR CONSISTENCY**: All ECS entities MUST use an operations wrapper class pattern.

### Why This Pattern is Required

**Problem**: Direct ECS calls (`ecs.createEntity()`) scattered across server actions leads to:
- Inconsistent implementation across features
- No type safety at entity level
- Difficult testing (mocking raw ECS vs specific operations)
- Hard to refactor (change ECS = update many files)
- No discoverability of available operations

**Solution**: Operations wrapper class for every entity type

### The Pattern

**File Structure:**
```
src/lib/ecs/
├── ecs.ts                 # Core ECS class
├── components.ts          # Shared component types
├── annotations.ts         # AnnotationOperations wrapper ✅ IMPLEMENTED
├── sparks.ts             # SparkOperations wrapper ✅ IMPLEMENTED
└── flashcards.ts         # FlashcardOperations wrapper (future)
```

**Template:**
```typescript
// src/lib/ecs/{entity-name}.ts
import { ECS } from './ecs'

export interface Create{EntityName}Input {
  // Required fields for creating this entity
}

export interface Update{EntityName}Input {
  // Optional fields for updating
}

export interface {EntityName}Entity {
  // Complete entity with typed components
}

export class {EntityName}Operations {
  constructor(private ecs: ECS, private userId: string) {}

  async create(input: Create{EntityName}Input): Promise<string> {
    return await this.ecs.createEntity(this.userId, {
      // Define components here
    })
  }

  async update(entityId: string, updates: Update{EntityName}Input): Promise<void> {
    // Type-safe update logic
  }

  async delete(entityId: string): Promise<void> {
    await this.ecs.deleteEntity(entityId, this.userId)
  }

  async getRecent(limit: number): Promise<{EntityName}Entity[]> {
    // Query logic
  }

  async search(query: string): Promise<{EntityName}Entity[]> {
    // Search logic
  }
}
```

**Usage in Server Actions:**
```typescript
// src/app/actions/{entity-name}.ts
'use server'

import { createECS } from '@/lib/ecs'
import { {EntityName}Operations } from '@/lib/ecs/{entity-name}'

export async function create{EntityName}(input: Create{EntityName}Input) {
  const user = await getCurrentUser()
  const ops = new {EntityName}Operations(createECS(), user.id)

  const entityId = await ops.create(input)

  // Additional logic: storage, cache, revalidation
  return { success: true, id: entityId }
}
```

### Current State

**✅ Annotations (CORRECT PATTERN - 5-component):**
- Has `src/lib/ecs/annotations.ts` with `AnnotationOperations` class
- Uses 5-component structure: Position, Visual, Content, Temporal, ChunkRef
- Server actions use the wrapper (`src/app/actions/annotations.ts`)
- Clean, type-safe API with full recovery system
- See `docs/ANNOTATIONS_SYSTEM.md` for complete documentation

**✅ Sparks (CORRECT PATTERN - 4-component):**
- Has `src/lib/ecs/sparks.ts` with `SparkOperations` class
- Uses 4-component structure: Spark, Content, Temporal, ChunkRef
- Server actions use the wrapper (`src/app/actions/sparks.ts`)
- Clean, type-safe API with 2-mode recovery (selection-based + semantic)
- Storage-first with automatic export
- Version 2.0 (Production Ready)
- See `docs/SPARK_SYSTEM.md` for complete documentation

### For Future Entities

When implementing flashcards, study sessions, themes, or any new ECS entity:

1. **Start with the wrapper class** (`src/lib/ecs/{entity-name}.ts`)
2. Define component structure in `src/lib/ecs/components.ts`
3. Create operations class with type-safe methods
4. Use wrapper in server actions
5. **NEVER** use raw `ecs.createEntity()` in server actions

This pattern is non-negotiable for codebase consistency.

## Actual Implementation

### Core ECS Class (`src/lib/ecs/ecs.ts`)

```typescript
import { SupabaseClient } from '@supabase/supabase-js'

// ComponentData uses 'any' for maximum flexibility
export type ComponentData = Record<string, any>

export interface Entity {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  components?: Component[]
}

export interface Component {
  id: string
  entity_id: string
  component_type: string
  data: ComponentData
  chunk_id?: string | null
  document_id?: string | null
  created_at: string
  updated_at: string
}

export class ECS {
  constructor(private supabase: SupabaseClient) {}

  async createEntity(
    userId: string,
    components: Record<string, ComponentData>
  ): Promise<string>

  async query(
    componentTypes: string[],
    userId: string,
    filters?: {
      document_id?: string
      chunk_id?: string
      deck_id?: string
    }
  ): Promise<Entity[]>

  async getEntity(
    entityId: string,
    userId: string
  ): Promise<Entity | null>

  async updateComponent(
    componentId: string,
    data: ComponentData,
    userId: string
  ): Promise<void>

  async deleteEntity(
    entityId: string,
    userId: string
  ): Promise<void>

  async addComponent(
    entityId: string,
    componentType: string,
    data: ComponentData,
    userId: string
  ): Promise<string>

  async removeComponent(
    componentId: string,
    userId: string
  ): Promise<void>
}
```

### Factory Pattern (`src/lib/ecs/index.ts`)

```typescript
import { ECS } from './ecs'
import { getSupabaseClient } from '@/lib/auth'

/**
 * Creates an ECS instance with the current Supabase client.
 * Use this factory function, not a singleton.
 */
export function createECS() {
  const supabase = getSupabaseClient()
  return new ECS(supabase)
}

// Re-export types
export type { Entity, Component, ComponentData } from './ecs'
```

## Usage Patterns

### Server Actions (Recommended Pattern)

```typescript
// app/actions/annotations.ts (REAL EXAMPLE - see full implementation)
'use server'

import { createECS } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const CreateAnnotationSchema = z.object({
  text: z.string().min(1).max(5000),
  chunkIds: z.array(z.string().uuid()),
  documentId: z.string().uuid(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.enum(['yellow', 'green', 'blue', 'red', 'purple', 'orange', 'pink']),
  note: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  textContext: z.object({
    before: z.string(),
    content: z.string(),
    after: z.string(),
  }),
})

export async function createAnnotation(
  data: z.infer<typeof CreateAnnotationSchema>
) {
  try {
    // Validate input
    const validated = CreateAnnotationSchema.parse(data)

    // Get authenticated user (NOT hardcoded!)
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    // Create ECS instance per request
    const ecs = createECS()

    const primaryChunkId = validated.chunkIds[0] || null

    // Create entity with 3 components
    const entityId = await ecs.createEntity(user.id, {
      annotation: {
        text: validated.text,
        note: validated.note,
        tags: validated.tags || [],
        color: validated.color,
        range: {
          startOffset: validated.startOffset,
          endOffset: validated.endOffset,
          chunkIds: validated.chunkIds,
        },
        textContext: validated.textContext,
      },
      position: {
        chunkIds: validated.chunkIds,
        startOffset: validated.startOffset,
        endOffset: validated.endOffset,
        confidence: 1.0,
        method: 'exact',
        textContext: {
          before: validated.textContext.before,
          after: validated.textContext.after,
        },
      },
      source: {
        chunk_id: primaryChunkId,
        chunk_ids: validated.chunkIds,
        document_id: validated.documentId,
      },
    })

    return { success: true, id: entityId }
  } catch (error) {
    console.error('Failed to create annotation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
```

### Creating Different Entity Types

```typescript
// 1. ANNOTATION (✅ IMPLEMENTED - 5-component pattern with PascalCase)
// See src/app/actions/annotations.ts and src/lib/ecs/annotations.ts
// Use AnnotationOperations wrapper class, NOT raw ecs.createEntity()
import { AnnotationOperations } from '@/lib/ecs/annotations'

const ops = new AnnotationOperations(ecs, userId)
const annotationId = await ops.create({
  documentId: documentId,
  text: "Important insight about system design",
  note: "This relates to my architecture decisions",
  color: "yellow", // yellow|green|blue|red|purple|orange|pink
  tags: ["architecture", "patterns"],
  chunkIds: [chunkId], // Array for multi-chunk annotations
  startOffset: 100,
  endOffset: 250,
  textContext: {
    before: "...context before selected text...",
    after: "...context after selected text..."
  },
  chunkPosition: 0
})

// This creates an entity with 5 components:
// - Position: { startOffset, endOffset, originalText, textContext, recoveryMethod, recoveryConfidence, needsReview }
// - Visual: { color }
// - Content: { note, tags }
// - Temporal: { createdAt, updatedAt }
// - ChunkRef: { documentId, document_id, chunkId, chunk_id, chunkIds, chunkPosition }

// 2. SPARK (✅ IMPLEMENTED - 4-component pattern with SparkOperations)
// Use SparkOperations wrapper class, NOT raw ecs.createEntity()
import { SparkOperations } from '@/lib/ecs/sparks'

const sparkOps = new SparkOperations(ecs, userId)
const sparkId = await sparkOps.create({
  content: "My quick thought",
  selections: [{
    text: "Important insight",
    chunkId: chunkId,
    startOffset: 100,
    endOffset: 200,
    textContext: { before: "...", after: "..." }
  }],
  tags: ["idea", "architecture"],
  connections: [{
    type: 'origin',
    chunkId: chunkId,
    metadata: { relationship: 'origin' },
    strength: 1
  }],
  chunkId: chunkId,
  chunkIds: [chunkId],
  documentId: documentId,
  originChunkContent: "First 500 chars for recovery..."
})



// 3. FLASHCARD (NOT YET IMPLEMENTED - UI placeholder only)
// FlashcardsTab exists in RightPanel but backend is TODO
const flashcardId = await ecs.createEntity(userId, {
  flashcard: {
    question: "What is the ECS pattern?",
    answer: "Entity Component System - composition over inheritance"
  },
  study: {
    due: new Date(),
    ease: 2.5,
    interval: 0,
    reviews: 0,
    lapses: 0
  },
  source: {
    chunk_id: chunkId,
    document_id: documentId
  }
})
```

### Querying Entities

```typescript
const user = await getCurrentUser()
if (!user) throw new Error('Not authenticated')

const ecs = createECS()

// PREFERRED: Use AnnotationOperations wrapper
import { AnnotationOperations } from '@/lib/ecs/annotations'
const ops = new AnnotationOperations(ecs, user.id)
const annotations = await ops.getByDocument(documentId)

// RAW ECS: Get all annotations for a document
// Queries for Position component to exclude Sparks (which have no Position)
const annotationsRaw = await ecs.query(
  ['Position'], // Filter for Position component (annotations only)
  user.id,
  { document_id: documentId }
)
// Returns entities with ALL 5 components: Position, Visual, Content, Temporal, ChunkRef

// Get all sparks (implemented, but needs wrapper class)
const sparks = await ecs.query(
  ['Spark'],  // Sparks have: Spark, Content, Temporal, ChunkRef (no Position)
  user.id,
  { document_id: documentId }
)

// Get all studyable items (PLANNED - flashcards not implemented)
const dueCards = await ecs.query(
  ['flashcard', 'study'], // Must have BOTH
  user.id
)

// Filter and process results
const todaysDue = dueCards.filter(entity => {
  const studyComponent = entity.components?.find(
    c => c.component_type === 'study'
  )
  return studyComponent &&
         new Date(studyComponent.data.due) <= new Date()
})
```

### Updating Components

```typescript
// REAL EXAMPLE: Update annotation (see annotations.ts:146-190)
export async function updateAnnotation(
  entityId: string,
  updates: { note?: string; color?: string; tags?: string[] }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: 'Not authenticated' }
    }

    const ecs = createECS()

    // Get entity to find annotation component
    const entity = await ecs.getEntity(entityId, user.id)
    if (!entity) {
      return { success: false, error: 'Annotation not found' }
    }

    const annotationComponent = entity.components?.find(
      (c) => c.component_type === 'annotation'
    )

    if (!annotationComponent) {
      return { success: false, error: 'Annotation component not found' }
    }

    // Merge updates with existing data
    const updatedData = {
      ...annotationComponent.data,
      ...updates,
    }

    await ecs.updateComponent(annotationComponent.id, updatedData, user.id)

    return { success: true }
  } catch (error) {
    console.error('Failed to update annotation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// PLANNED: Update study progress (flashcards not yet implemented)
export async function updateStudyProgress(
  entityId: string,
  rating: number // 1-5 user rating
) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const ecs = createECS()

  // Get current study data
  const entity = await ecs.getEntity(entityId, user.id)
  const studyComponent = entity?.components?.find(
    c => c.component_type === 'study'
  )

  if (!studyComponent) {
    throw new Error('No study component found')
  }

  // Calculate new FSRS values (simplified)
  const newInterval = calculateInterval(
    studyComponent.data.interval,
    studyComponent.data.ease,
    rating
  )

  const newData = {
    ...studyComponent.data,
    interval: newInterval,
    ease: adjustEase(studyComponent.data.ease, rating),
    reviews: studyComponent.data.reviews + 1,
    due: new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000),
    last_review: new Date()
  }

  await ecs.updateComponent(studyComponent.id, newData, user.id)
}
```

### Component Evolution Pattern

```typescript
// Start with simple annotation
const entityId = await ecs.createEntity(userId, {
  annotation: { 
    text: "Key concept",
    note: "Needs further study" 
  },
  source: { chunk_id, document_id }
})

// Later, make it studyable
await ecs.addComponent(
  entityId,
  'study',
  {
    due: new Date(),
    ease: 2.5,
    interval: 0,
    reviews: 0
  },
  userId
)

// Even later, add flashcard data
await ecs.addComponent(
  entityId,
  'flashcard',
  {
    question: "What is the key concept?",
    answer: "The annotated text explains..."
  },
  userId
)

// Now it's an annotation + flashcard + studyable!
```

## Database Schema

```sql
-- Entities table (minimal)
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Components table (all the data)
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  data JSONB NOT NULL,
  -- Denormalized for performance
  chunk_id UUID REFERENCES chunks(id),
  document_id UUID REFERENCES documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_components_entity ON components(entity_id);
CREATE INDEX idx_components_type ON components(component_type);
CREATE INDEX idx_components_document ON components(document_id);
CREATE INDEX idx_components_chunk ON components(chunk_id);
CREATE INDEX idx_entities_user ON entities(user_id);
```

## Component Types (Current & Planned)

### ✅ Implemented Components (PascalCase)

**Annotation Components** (5-component pattern):
- **Position**: Text location with recovery metadata (startOffset, endOffset, originalText, textContext, recoveryMethod, recoveryConfidence, needsReview)
- **Visual**: Display styling (color)
- **Content**: User-provided data (note, tags)
- **Temporal**: Timestamps (createdAt, updatedAt)
- **ChunkRef**: Document/chunk references (documentId, chunkId, chunkIds, chunkPosition)

**Spark Components** (4-component pattern):
- **Spark**: Quick idea/annotation with selections, connections, annotationRefs
- **Content**: Note and tags
- **Temporal**: Timestamps
- **ChunkRef**: Document/chunk references

**Shared Components**:
- **Content**: Used by both Annotations and Sparks for note/tags
- **Temporal**: Used by both for timestamps
- **ChunkRef**: Used by both for document linking

### 🚧 Partially Implemented (UI Only, Backend TODO)
- **flashcard**: Question/answer pairs (UI placeholder exists, backend not implemented)
- **study**: FSRS spaced repetition data (UI placeholder exists, backend not implemented)

### 📋 Planned Components (Priority Order)
1. **embedding**: Vector embeddings for similarity search
2. **themes**: Extracted themes and concepts from connections
3. **connections**: Links between entities (connection graph)

## Client-Side Usage (React)

### With React Query

**Note**: Rhizome V2 currently uses **optimistic updates** instead of React Query for annotations. The client updates state immediately, and the server action persists changes. No revalidation needed for instant UI feedback.

```typescript
// REAL PATTERN: Optimistic updates (see QuickCapturePanel implementation)
// annotations.ts Server Actions do NOT call revalidatePath()
// Client components handle state updates immediately

// EXAMPLE: If you were to use React Query (not currently implemented)
// hooks/use-annotations.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createAnnotation, getAnnotations } from '@/app/actions/annotations'

export function useAnnotations(documentId: string) {
  return useQuery({
    queryKey: ['annotations', documentId],
    queryFn: () => getAnnotations(documentId),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createAnnotation,
    onSuccess: (data, variables) => {
      // Invalidate queries for the document
      queryClient.invalidateQueries({
        queryKey: ['annotations', variables.documentId]
      })
    }
  })
}

// PLANNED: Flashcards with React Query (not yet implemented)
export function useFlashcards(documentId: string) {
  return useQuery({
    queryKey: ['flashcards', documentId],
    queryFn: () => getFlashcards(documentId),
    staleTime: 5 * 60 * 1000
  })
}
```

### Component Example

```typescript
// REAL EXAMPLE: QuickSparkModal (⌘K quick capture)
// Currently saves as annotations, will become "spark" component
'use client'

import { useState } from 'react'
import { createAnnotation } from '@/app/actions/annotations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function QuickSparkModal({
  documentId,
  onClose,
}: {
  documentId: string
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Create annotation with minimal data
      // TODO: Convert to "spark" component when implemented
      const result = await createAnnotation({
        text,
        chunkIds: [], // No chunk association for quick sparks
        documentId,
        startOffset: 0,
        endOffset: 0,
        color: 'blue',
        note: '',
        tags: ['spark'],
        textContext: {
          before: '',
          content: text,
          after: '',
        },
      })

      if (result.success) {
        setText('')
        onClose()
      }
    } catch (error) {
      console.error('Failed to create spark:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Quick thought or idea..."
        required
        autoFocus
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Spark'}
      </Button>
    </form>
  )
}

// PLANNED: Flashcard creator (not yet implemented)
export function FlashcardCreator({
  chunkId,
  documentId
}: {
  chunkId: string
  documentId: string
}) {
  // TODO: Implement flashcard creation with ECS backend
  return <div>Flashcard creation coming soon...</div>
}
```

## Common Patterns & Best Practices

### DO: Use Composition
```typescript
// ✅ CORRECT: Flexible composition
const entity = await ecs.createEntity(userId, {
  flashcard: { question, answer },
  study: { due, ease },
  source: { chunk_id }
})

// Can add more components later
await ecs.addComponent(entityId, 'themes', { 
  themes: ['architecture', 'patterns'] 
}, userId)
```

### DON'T: Create Type-Specific Services
```typescript
// ❌ WRONG: Separate services per type
class FlashcardService {
  async create() { }
  async update() { }
}

class AnnotationService {
  async create() { }
  async update() { }
}

// ✅ CORRECT: Use ECS for everything
const ecs = createECS()
await ecs.createEntity(userId, { flashcard: data })
await ecs.createEntity(userId, { annotation: data })
```

### DO: Use Server Actions
```typescript
// ✅ CORRECT: Server Action with ECS
'use server'
export async function createAnnotation(data) {
  const ecs = createECS()
  return ecs.createEntity(userId, { annotation: data })
}

// ❌ WRONG: Direct database access from client
'use client'
const supabase = createClientComponentClient()
await supabase.from('annotations').insert(data)
```

### DO: Denormalize for Performance
```typescript
// ✅ CORRECT: Store chunk_id and document_id on component
const componentInserts = Object.entries(components).map(
  ([type, data]) => ({
    entity_id: entity.id,
    component_type: type,
    data,
    chunk_id: data.chunk_id || null,      // Denormalized
    document_id: data.document_id || null // Denormalized
  })
)
```

## Testing

```typescript
// __tests__/ecs.test.ts
import { ECS } from '@/lib/ecs/ecs'
import { createMockSupabaseClient } from '@/test/utils'

describe('ECS', () => {
  let ecs: ECS
  let mockSupabase: any
  const userId = 'test-user-123'
  
  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
    ecs = new ECS(mockSupabase)
  })
  
  it('creates entity with multiple components', async () => {
    // Mock successful insert
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { id: 'entity-1', user_id: userId },
            error: null
          })
        })
      })
    })
    
    const entityId = await ecs.createEntity(userId, {
      flashcard: { question: 'Q', answer: 'A' },
      study: { due: new Date(), ease: 2.5 }
    })
    
    expect(entityId).toBe('entity-1')
    expect(mockSupabase.from).toHaveBeenCalledWith('entities')
    expect(mockSupabase.from).toHaveBeenCalledWith('components')
  })
  
  it('rolls back entity on component failure', async () => {
    // Mock entity success, component failure
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'entities') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: 'entity-1' },
                error: null
              })
            })
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null })
          })
        }
      } else {
        return {
          insert: jest.fn().mockResolvedValue({
            error: { message: 'Component insert failed' }
          })
        }
      }
    })
    
    await expect(
      ecs.createEntity(userId, { flashcard: {} })
    ).rejects.toThrow('Failed to create components')
    
    // Verify rollback was called
    expect(mockSupabase.from('entities').delete).toHaveBeenCalled()
  })
})
```

## Troubleshooting

### Common Issues

**Issue**: "Failed to create entity"
```typescript
// Check user authentication - must be authenticated
const user = await getCurrentUser()
if (!user) {
  return { success: false, error: 'Not authenticated' }
}

// Verify user exists in database
-- Run in Supabase SQL editor
SELECT * FROM auth.users;

// Verify RLS is disabled (for MVP)
ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE components DISABLE ROW LEVEL SECURITY;
```

**Issue**: Components not returned with entity
```typescript
// Ensure proper query structure
const entity = await ecs.getEntity(entityId, userId)
// components should be in entity.components array
```

**Issue**: Query not finding entities
```typescript
// Check component type spelling
await ecs.query(['annotation'], user.id) // Exact match required

// Verify filters - entity must have ALL specified components
await ecs.query(
  ['annotation', 'position', 'source'], // Must have ALL THREE
  user.id,
  { document_id: docId } // Must match exactly
)

// Common mistake: missing required components
await ecs.query(['annotation'], user.id) // May return partial entities
await ecs.query(['annotation', 'position', 'source'], user.id) // ✅ Better - ensures complete data
```

## Migration Notes

If you have existing type-specific tables (flashcards, annotations), migrate to ECS:

```sql
-- Example: Migrate flashcards table to ECS
BEGIN;

-- Create entities for existing flashcards
INSERT INTO entities (id, user_id, created_at)
SELECT id, user_id, created_at FROM flashcards;

-- Create flashcard components
INSERT INTO components (entity_id, component_type, data, document_id)
SELECT 
  id,
  'flashcard',
  jsonb_build_object(
    'question', question,
    'answer', answer
  ),
  document_id
FROM flashcards;

-- Create study components
INSERT INTO components (entity_id, component_type, data)
SELECT 
  id,
  'study',
  jsonb_build_object(
    'due', due_date,
    'ease', ease_factor,
    'interval', interval,
    'reviews', review_count
  )
FROM flashcards;

COMMIT;

-- After verification, drop old table
-- DROP TABLE flashcards;
```

## Key Takeaways

1. **Use the factory pattern**: Always use `createECS()`, not a singleton
2. **Server Actions preferred**: Keep ECS operations on the server
3. **Composition over inheritance**: Add/remove components as needed
4. **Denormalize for queries**: Store document_id and chunk_id on components
5. **Start simple**: Don't over-engineer, add components as features grow
6. **Test the rollback**: Ensure entity creation is atomic with rollback

The ECS architecture provides unlimited flexibility for Rhizome's evolution without database migrations or breaking changes.