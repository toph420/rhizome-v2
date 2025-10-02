# ECS Implementation Guide

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
// app/actions/flashcards.ts
'use server'

import { createECS } from '@/lib/ecs'

export async function createFlashcard(formData: FormData) {
  const ecs = createECS() // Create instance per request
  const userId = 'dev-user-123' // MVP hardcode
  
  const question = formData.get('question') as string
  const answer = formData.get('answer') as string
  const chunkId = formData.get('chunkId') as string
  const documentId = formData.get('documentId') as string
  
  const entityId = await ecs.createEntity(userId, {
    flashcard: { question, answer },
    study: { 
      due: new Date(), 
      ease: 2.5,
      interval: 0,
      reviews: 0
    },
    source: { 
      chunk_id: chunkId, 
      document_id: documentId 
    }
  })
  
  revalidatePath(`/read/${documentId}`)
  return { success: true, id: entityId }
}
```

### Creating Different Entity Types

```typescript
// 1. FLASHCARD with Study Component
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

// 2. ANNOTATION (Not yet implemented in UI)
const annotationId = await ecs.createEntity(userId, {
  annotation: {
    text: "Important insight about system design",
    note: "This relates to my architecture decisions",
    color: "#ffeb3b",
    range: {
      start: 100,
      end: 250
    }
  },
  source: {
    chunk_id: chunkId,
    document_id: documentId
  }
})

// 3. SPARK (Idea/Connection - Not yet implemented)
const sparkId = await ecs.createEntity(userId, {
  spark: {
    idea: "Connection between ECS and functional programming",
    tags: ["architecture", "patterns"]
  },
  source: {
    parent_entity_id: annotationId,
    chunk_id: chunkId,
    document_id: documentId
  }
})
```

### Querying Entities

```typescript
const ecs = createECS()

// Get all flashcards for a document
const flashcards = await ecs.query(
  ['flashcard'],
  userId,
  { document_id: documentId }
)

// Get all studyable items (anything with study component)
const dueCards = await ecs.query(
  ['flashcard', 'study'], // Must have BOTH
  userId
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
// Update after study session
export async function updateStudyProgress(
  entityId: string,
  componentId: string,
  rating: number // 1-5 user rating
) {
  const ecs = createECS()
  const userId = 'dev-user-123'
  
  // Get current study data
  const entity = await ecs.getEntity(entityId, userId)
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
  
  await ecs.updateComponent(componentId, newData, userId)
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

### Implemented Components
- **flashcard**: Question/answer pairs (used in UI)
- **study**: FSRS spaced repetition data (partially used)
- **source**: Links to chunks/documents (used)

### Planned Components
- **annotation**: Text highlights with notes
- **spark**: Ideas and connections
- **embedding**: Vector embeddings for similarity
- **themes**: Extracted themes and concepts
- **position**: Location in document
- **connections**: Links between entities

## Client-Side Usage (React)

### With React Query
```typescript
// hooks/use-flashcards.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFlashcard, getFlashcards } from '@/app/actions/flashcards'

export function useFlashcards(documentId: string) {
  return useQuery({
    queryKey: ['flashcards', documentId],
    queryFn: () => getFlashcards(documentId),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

export function useCreateFlashcard() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: createFlashcard,
    onSuccess: (data, variables) => {
      // Invalidate queries for the document
      const documentId = variables.get('documentId')
      queryClient.invalidateQueries({ 
        queryKey: ['flashcards', documentId] 
      })
    }
  })
}
```

### Component Example
```typescript
// components/flashcard-creator.tsx
'use client'

import { useCreateFlashcard } from '@/hooks/use-flashcards'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function FlashcardCreator({ 
  chunkId, 
  documentId 
}: { 
  chunkId: string
  documentId: string 
}) {
  const createMutation = useCreateFlashcard()
  
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.append('chunkId', chunkId)
    formData.append('documentId', documentId)
    
    await createMutation.mutateAsync(formData)
    e.currentTarget.reset()
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Textarea
        name="question"
        placeholder="Enter your question..."
        required
      />
      <Textarea
        name="answer"
        placeholder="Enter the answer..."
        required
      />
      <Button 
        type="submit" 
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? 'Creating...' : 'Create Flashcard'}
      </Button>
    </form>
  )
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
// Check user authentication
const userId = 'dev-user-123' // Must exist in database

// Verify RLS is disabled (for MVP)
-- Run in Supabase SQL editor
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
await ecs.query(['flashcard'], userId) // Exact match required

// Verify filters
await ecs.query(
  ['flashcard', 'study'], // Must have BOTH
  userId,
  { document_id: docId } // Must match exactly
)
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