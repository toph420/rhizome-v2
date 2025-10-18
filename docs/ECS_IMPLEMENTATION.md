# ECS Implementation Guide

**Last Updated**: 2025-10-18

**Implementation Status**:
- ✅ **Core ECS System**: Fully implemented with factory pattern
- ✅ **Annotations**: Complete 3-component pattern (annotation + position + source)
- 🚧 **Sparks**: UI exists (QuickSparkModal), backend TODO (UP NEXT!)
- 📋 **Flashcards/Study**: UI placeholder only, backend not implemented

## Overview

The Entity Component System (ECS) is the core data architecture for Rhizome V2. It provides maximum flexibility for evolving features without database migrations.

**Core Principles:**
- **Entities** are just UUIDs
- **Components** are bags of data (JSONB)
- **Any entity can have ANY components**
- **No inheritance, only composition**

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
// 1. ANNOTATION (✅ IMPLEMENTED - 3-component pattern)
// See src/app/actions/annotations.ts for full implementation
const annotationId = await ecs.createEntity(userId, {
  annotation: {
    text: "Important insight about system design",
    note: "This relates to my architecture decisions",
    color: "yellow", // yellow|green|blue|red|purple|orange|pink
    tags: ["architecture", "patterns"],
    range: {
      startOffset: 100,
      endOffset: 250,
      chunkIds: [chunkId] // Array for multi-chunk annotations
    },
    textContext: {
      before: "...context before selected text...",
      content: "selected text content",
      after: "...context after selected text..."
    }
  },
  position: {
    chunkIds: [chunkId],
    startOffset: 100,
    endOffset: 250,
    confidence: 1.0, // 1.0 on creation, <1.0 after fuzzy recovery
    method: 'exact', // exact|context|chunk_bounded|trigram
    textContext: {
      before: "...context before...",
      after: "...context after..."
    }
  },
  source: {
    chunk_id: chunkId, // Primary chunk for ECS filtering
    chunk_ids: [chunkId], // All chunks for multi-chunk support
    document_id: documentId
  }
})

// 2. SPARK (UP NEXT - UI exists, backend not implemented)
// QuickSparkModal (⌘K) currently saves as annotations
// TODO: Implement spark component with simplified structure
const sparkId = await ecs.createEntity(userId, {
  spark: {
    idea: "Connection between ECS and functional programming",
    tags: ["architecture", "patterns"],
    color: "blue"
  },
  source: {
    parent_entity_id: annotationId, // Optional link to parent annotation
    chunk_id: chunkId,
    document_id: documentId
  }
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

// Get all annotations for a document (REAL EXAMPLE from annotations.ts:237-243)
const annotations = await ecs.query(
  ['annotation', 'position', 'source'], // Must have ALL THREE
  user.id,
  { document_id: documentId }
)

// Get all sparks (PLANNED - not yet implemented)
const sparks = await ecs.query(
  ['spark', 'source'],
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

### ✅ Implemented Components
- **annotation**: Text highlights with notes, tags, color (see `src/app/actions/annotations.ts:76-107`)
- **position**: Location tracking with fuzzy recovery for annotation remapping (see `src/app/actions/annotations.ts:90-101`)
- **source**: Links to chunks/documents (used across all entity types)

### 🚧 Partially Implemented (UI Only, Backend TODO)
- **flashcard**: Question/answer pairs (UI placeholder exists, backend not implemented)
- **study**: FSRS spaced repetition data (UI placeholder exists, backend not implemented)

### 📋 Planned Components (Priority Order)
1. **spark**: Quick annotations/ideas (UP NEXT - UI exists via QuickSparkModal, needs ECS backend)
2. **embedding**: Vector embeddings for similarity search
3. **themes**: Extracted themes and concepts from connections
4. **connections**: Links between entities (connection graph)

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