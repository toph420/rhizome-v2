# ECS Implementation Guide

## The Simplest Possible ECS

```typescript
// lib/ecs/simple-ecs.ts
import { createClient } from '@supabase/supabase-js'

export class ECS {
  constructor(private supabase: SupabaseClient) {}

  async createEntity(
    userId: string, 
    components: Record<string, any>
  ): Promise<string> {
    // 1. Create entity
    const { data: entity } = await this.supabase
      .from('entities')
      .insert({ user_id: userId })
      .select()
      .single()
    
    // 2. Create components
    const componentInserts = Object.entries(components).map(
      ([type, data]) => ({
        entity_id: entity.id,
        component_type: type,
        data,
        chunk_id: data.chunk_id || null,
        document_id: data.document_id || null
      })
    )
    
    await this.supabase
      .from('components')
      .insert(componentInserts)
    
    return entity.id
  }

  async getEntity(entityId: string) {
    const { data } = await this.supabase
      .from('components')
      .select('*')
      .eq('entity_id', entityId)
    
    return data.reduce((acc, comp) => {
      acc[comp.component_type] = comp.data
      return acc
    }, {})
  }

  async query(
    componentTypes: string[], 
    userId: string,
    filters?: Record<string, any>
  ) {
    let query = this.supabase
      .from('entities')
      .select(`
        id,
        components!inner (
          component_type,
          data
        )
      `)
      .eq('user_id', userId)
      .in('components.component_type', componentTypes)
    
    if (filters?.document_id) {
      query = query.eq('components.document_id', filters.document_id)
    }
    
    const { data } = await query
    return data
  }
}

export const ecs = new ECS(supabase)
```

## Usage Examples

```typescript
// Create flashcard
const cardId = await ecs.createEntity(userId, {
  flashcard: { question, answer },
  study: { due: new Date(), ease: 2.5 },
  source: { chunk_id, document_id }
})

// Create annotation  
const annotationId = await ecs.createEntity(userId, {
  annotation: { text, range },
  source: { chunk_id, document_id }
})

// Create spark
const sparkId = await ecs.createEntity(userId, {
  spark: { idea: "Connection about capitalism" },
  source: { chunk_id, document_id, parent_entity_id }
})

// Query all flashcards for a document
const cards = await ecs.query(
  ['flashcard'], 
  userId,
  { document_id: docId }
)

// Query all studyable items
const studyable = await ecs.query(
  ['study'],
  userId
)
```


# ECS_IMPLEMENTATION.md

## Entity Component System - Simple Implementation Guide

### Core Concept
- **Entities** are just IDs
- **Components** are bags of data
- **ANY entity can have ANY components**
- **No inheritance, only composition**

## Complete Implementation

### 1. Core ECS Class

```typescript
// lib/ecs/simple-ecs.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'

export interface Component {
  entity_id: string
  component_type: string
  data: any
  chunk_id?: string
  document_id?: string
}

export interface Entity {
  id: string
  user_id: string
  created_at: string
  components?: Component[]
}

export class ECS {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create a new entity with components
   */
  async createEntity(
    userId: string, 
    components: Record<string, any>
  ): Promise<string> {
    // Start transaction
    const entityId = nanoid()
    
    // 1. Create entity
    const { data: entity, error: entityError } = await this.supabase
      .from('entities')
      .insert({ 
        id: entityId,
        user_id: userId 
      })
      .select()
      .single()
    
    if (entityError) throw entityError
    
    // 2. Create components
    const componentInserts = Object.entries(components).map(
      ([type, data]) => ({
        entity_id: entity.id,
        component_type: type,
        data: typeof data === 'object' ? data : { value: data },
        // Denormalize for fast queries
        chunk_id: data?.chunk_id || components.source?.chunk_id || null,
        document_id: data?.document_id || components.source?.document_id || null
      })
    )
    
    const { error: componentsError } = await this.supabase
      .from('components')
      .insert(componentInserts)
    
    if (componentsError) throw componentsError
    
    return entity.id
  }

  /**
   * Get a single entity with all its components
   */
  async getEntity(entityId: string): Promise<Entity | null> {
    // Get entity
    const { data: entity, error: entityError } = await this.supabase
      .from('entities')
      .select('*')
      .eq('id', entityId)
      .single()
    
    if (entityError) return null
    
    // Get components
    const { data: components } = await this.supabase
      .from('components')
      .select('*')
      .eq('entity_id', entityId)
    
    return {
      ...entity,
      components
    }
  }

  /**
   * Update a component's data
   */
  async updateComponent(
    entityId: string,
    componentType: string,
    data: any
  ): Promise<void> {
    const { error } = await this.supabase
      .from('components')
      .update({ data })
      .eq('entity_id', entityId)
      .eq('component_type', componentType)
    
    if (error) throw error
  }

  /**
   * Add a new component to existing entity
   */
  async addComponent(
    entityId: string,
    componentType: string,
    data: any
  ): Promise<void> {
    const { error } = await this.supabase
      .from('components')
      .insert({
        entity_id: entityId,
        component_type: componentType,
        data,
        chunk_id: data?.chunk_id || null,
        document_id: data?.document_id || null
      })
    
    if (error) throw error
  }

  /**
   * Remove a component from entity
   */
  async removeComponent(
    entityId: string,
    componentType: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('components')
      .delete()
      .eq('entity_id', entityId)
      .eq('component_type', componentType)
    
    if (error) throw error
  }

  /**
   * Query entities with specific components
   */
  async query(
    componentTypes: string[],
    userId: string,
    filters?: {
      document_id?: string
      chunk_id?: string
      limit?: number
    }
  ): Promise<Entity[]> {
    // Build query
    let query = this.supabase
      .from('entities')
      .select(`
        id,
        user_id,
        created_at,
        components!inner (
          component_type,
          data,
          chunk_id,
          document_id
        )
      `)
      .eq('user_id', userId)
    
    // Must have ALL specified component types
    componentTypes.forEach(type => {
      query = query.eq('components.component_type', type)
    })
    
    // Apply filters
    if (filters?.document_id) {
      query = query.eq('components.document_id', filters.document_id)
    }
    if (filters?.chunk_id) {
      query = query.eq('components.chunk_id', filters.chunk_id)
    }
    if (filters?.limit) {
      query = query.limit(filters.limit)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    return data || []
  }

  /**
   * Delete entity and all its components
   */
  async deleteEntity(entityId: string): Promise<void> {
    // Cascade delete will handle components
    const { error } = await this.supabase
      .from('entities')
      .delete()
      .eq('id', entityId)
    
    if (error) throw error
  }

  /**
   * Find entities with similar embeddings
   */
  async findSimilar(
    embedding: number[],
    threshold: number = 0.8,
    limit: number = 10
  ): Promise<any[]> {
    const { data, error } = await this.supabase.rpc(
      'match_entities_by_embedding',
      {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: limit
      }
    )
    
    if (error) throw error
    return data || []
  }
}

// Singleton instance
let ecsInstance: ECS | null = null

export function getECS(supabase: SupabaseClient): ECS {
  if (!ecsInstance) {
    ecsInstance = new ECS(supabase)
  }
  return ecsInstance
}
```

### 2. TypeScript Types

```typescript
// lib/ecs/types.ts

// Component type definitions
export type ComponentType = 
  | 'flashcard'
  | 'annotation' 
  | 'spark'
  | 'study'
  | 'embedding'
  | 'source'
  | 'themes'
  | 'position'

// Component data structures
export interface FlashcardComponent {
  question: string
  answer: string
  created_at?: string
}

export interface AnnotationComponent {
  text: string
  note?: string
  color?: string
  range?: {
    start: number
    end: number
  }
}

export interface SparkComponent {
  idea: string
  created_at: string
  tags?: string[]
}

export interface StudyComponent {
  due: Date
  ease: number
  interval: number
  reviews: number
  last_review?: Date
}

export interface EmbeddingComponent {
  vector: number[]
  model?: string
  created_at?: string
}

export interface SourceComponent {
  chunk_id?: string
  document_id?: string
  position?: number
  parent_entity_id?: string
}

export interface ThemesComponent {
  themes: string[]
  entities: {
    people?: string[]
    concepts?: string[]
    places?: string[]
  }
}

// Helper type for component creation
export type ComponentData = {
  flashcard?: FlashcardComponent
  annotation?: AnnotationComponent
  spark?: SparkComponent
  study?: StudyComponent
  embedding?: EmbeddingComponent
  source?: SourceComponent
  themes?: ThemesComponent
  [key: string]: any // Allow custom components
}
```

### 3. React Hooks

```typescript
// lib/ecs/hooks.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSupabase } from '@/lib/supabase/client'
import { getECS } from './simple-ecs'

export function useECS() {
  const supabase = useSupabase()
  return getECS(supabase)
}

export function useCreateEntity() {
  const ecs = useECS()
  const queryClient = useQueryClient()
  const { user } = useUser()
  
  return useMutation({
    mutationFn: async (components: ComponentData) => {
      if (!user) throw new Error('Not authenticated')
      return ecs.createEntity(user.id, components)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entities'] })
    }
  })
}

export function useEntity(entityId: string) {
  const ecs = useECS()
  
  return useQuery({
    queryKey: ['entity', entityId],
    queryFn: () => ecs.getEntity(entityId),
    enabled: !!entityId
  })
}

export function useEntities(
  componentTypes: string[],
  filters?: any
) {
  const ecs = useECS()
  const { user } = useUser()
  
  return useQuery({
    queryKey: ['entities', componentTypes, filters],
    queryFn: () => ecs.query(componentTypes, user!.id, filters),
    enabled: !!user
  })
}

export function useFlashcards(documentId?: string) {
  return useEntities(['flashcard'], { document_id: documentId })
}

export function useAnnotations(documentId?: string) {
  return useEntities(['annotation'], { document_id: documentId })
}

export function useSparks(documentId?: string) {
  return useEntities(['spark'], { document_id: documentId })
}
```

## Usage Examples

### Creating Different Entity Types

```typescript
// 1. FLASHCARD
const flashcardId = await ecs.createEntity(userId, {
  flashcard: {
    question: "What is the capital of France?",
    answer: "Paris"
  },
  study: {
    due: new Date(),
    ease: 2.5,
    interval: 0,
    reviews: 0
  },
  source: {
    chunk_id: "chunk-123",
    document_id: "doc-456"
  }
})

// 2. ANNOTATION
const annotationId = await ecs.createEntity(userId, {
  annotation: {
    text: "This is a key insight",
    note: "Relates to my thesis on urban planning",
    color: "#ffeb3b",
    range: { start: 100, end: 250 }
  },
  source: {
    chunk_id: "chunk-123",
    document_id: "doc-456"
  },
  themes: {
    themes: ["urban planning", "sustainability"],
    entities: {
      concepts: ["smart cities", "green infrastructure"]
    }
  }
})

// 3. SPARK (Idea)
const sparkId = await ecs.createEntity(userId, {
  spark: {
    idea: "Connection between urban density and social capital",
    created_at: new Date().toISOString(),
    tags: ["thesis", "explore"]
  },
  source: {
    parent_entity_id: annotationId,
    chunk_id: "chunk-123",
    document_id: "doc-456"
  }
})

// 4. CHUNK (from document processing)
const chunkId = await ecs.createEntity(userId, {
  chunk: {
    content: "The economic theories of the 19th century...",
    index: 0
  },
  embedding: {
    vector: [0.123, -0.456, ...], // 768 dimensions
    model: "text-embedding-004"
  },
  themes: {
    themes: ["economics", "capitalism"],
    entities: {
      people: ["Adam Smith", "Karl Marx"],
      concepts: ["invisible hand", "labor theory of value"]
    }
  },
  source: {
    document_id: "doc-456"
  }
})
```

### Querying Entities

```typescript
// Get all flashcards for a document
const flashcards = await ecs.query(
  ['flashcard'],
  userId,
  { document_id: 'doc-123' }
)

// Get all study-able items (flashcards OR annotations with study)
const studyItems = await ecs.query(
  ['study'],
  userId
)

// Get all items for a specific chunk
const chunkItems = await ecs.query(
  [],  // Any components
  userId,
  { chunk_id: 'chunk-789' }
)

// Get annotations with themes
const themedAnnotations = await ecs.query(
  ['annotation', 'themes'],
  userId
)
```

### Modifying Entities

```typescript
// Add study component to existing annotation
await ecs.addComponent(
  annotationId,
  'study',
  {
    due: new Date(),
    ease: 2.5,
    interval: 0,
    reviews: 0
  }
)

// Update flashcard content
await ecs.updateComponent(
  flashcardId,
  'flashcard',
  {
    question: "What is the capital of France?",
    answer: "Paris, the City of Light"  // Enhanced answer
  }
)

// Remove study component (no longer studyable)
await ecs.removeComponent(entityId, 'study')

// Delete entire entity
await ecs.deleteEntity(entityId)
```

### React Component Examples

```typescript
// components/flashcard-creator.tsx
import { useCreateEntity } from '@/lib/ecs/hooks'

export function FlashcardCreator({ chunkId, documentId }) {
  const createEntity = useCreateEntity()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  
  const handleCreate = async () => {
    await createEntity.mutateAsync({
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
    
    // Clear form
    setQuestion('')
    setAnswer('')
  }
  
  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Question..."
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <Textarea
        placeholder="Answer..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <Button onClick={handleCreate}>
        Create Flashcard
      </Button>
    </div>
  )
}

// components/document-annotations.tsx
import { useAnnotations } from '@/lib/ecs/hooks'

export function DocumentAnnotations({ documentId }) {
  const { data: annotations, isLoading } = useAnnotations(documentId)
  
  if (isLoading) return <Spinner />
  
  return (
    <div className="space-y-2">
      {annotations?.map(entity => {
        const annotation = entity.components?.find(
          c => c.component_type === 'annotation'
        )?.data
        
        return (
          <div key={entity.id} className="p-2 border rounded">
            <p className="font-medium">{annotation?.text}</p>
            {annotation?.note && (
              <p className="text-sm text-muted-foreground">
                {annotation.note}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

## Database Functions

```sql
-- supabase/migrations/002_ecs_functions.sql

-- Function to find similar entities by embedding
CREATE OR REPLACE FUNCTION match_entities_by_embedding(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  entity_id uuid,
  similarity float,
  data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.entity_id,
    1 - (c.data->>'vector')::vector <=> query_embedding as similarity,
    c.data
  FROM components c
  WHERE c.component_type = 'embedding'
    AND 1 - (c.data->>'vector')::vector <=> query_embedding > match_threshold
  ORDER BY (c.data->>'vector')::vector <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get entities with all components
CREATE OR REPLACE FUNCTION get_entity_with_components(entity_id_param uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', e.id,
    'user_id', e.user_id,
    'created_at', e.created_at,
    'components', jsonb_agg(
      jsonb_build_object(
        'type', c.component_type,
        'data', c.data
      )
    )
  ) INTO result
  FROM entities e
  LEFT JOIN components c ON c.entity_id = e.id
  WHERE e.id = entity_id_param
  GROUP BY e.id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
```

## Common Patterns

### Pattern: Studyable Annotations
```typescript
// Start with annotation
const entityId = await ecs.createEntity(userId, {
  annotation: { text: "Important concept" }
})

// Later, make it studyable
await ecs.addComponent(entityId, 'study', {
  due: new Date(),
  ease: 2.5
})

// Later, convert to flashcard
await ecs.addComponent(entityId, 'flashcard', {
  question: "What is the important concept?",
  answer: "The text from annotation"
})
```

### Pattern: Evolving Sparks
```typescript
// Start as simple spark
const sparkId = await ecs.createEntity(userId, {
  spark: { idea: "Interesting connection" }
})

// Add themes as understanding develops
await ecs.addComponent(sparkId, 'themes', {
  themes: ["philosophy", "economics"]
})

// Connect to other entities
await ecs.addComponent(sparkId, 'connections', {
  related_entities: [entity1, entity2]
})
```

### Pattern: Rich Chunks
```typescript
// Document processing creates rich chunks
const chunkId = await ecs.createEntity(userId, {
  chunk: { content: "text", index: 0 },
  embedding: { vector: [...] },
  themes: { themes: [...] },
  source: { document_id: "doc-123" }
})
```

## Anti-Patterns to Avoid

```typescript
// ❌ WRONG: Type-specific services
class FlashcardService {
  create() { /* ... */ }
}
class AnnotationService {
  create() { /* ... */ }
}

// ✅ RIGHT: Use ECS for everything
ecs.createEntity(userId, { flashcard: {...} })
ecs.createEntity(userId, { annotation: {...} })

// ❌ WRONG: Inheritance hierarchies
class StudyableItem extends Entity { }
class Flashcard extends StudyableItem { }

// ✅ RIGHT: Composition with components
entity + flashcard component + study component

// ❌ WRONG: Hard-coded relationships
flashcard.annotation_id = "123"

// ✅ RIGHT: Flexible source component
source: { parent_entity_id: "123" }
```

## Testing

```typescript
// tests/ecs.test.ts
import { createClient } from '@supabase/supabase-js'
import { ECS } from '@/lib/ecs/simple-ecs'

describe('ECS', () => {
  let ecs: ECS
  let userId: string
  
  beforeEach(() => {
    const supabase = createClient(url, key)
    ecs = new ECS(supabase)
    userId = 'test-user-123'
  })
  
  it('creates flashcard entity', async () => {
    const entityId = await ecs.createEntity(userId, {
      flashcard: { question: 'Q', answer: 'A' },
      study: { due: new Date(), ease: 2.5 }
    })
    
    expect(entityId).toBeTruthy()
    
    const entity = await ecs.getEntity(entityId)
    expect(entity.components).toHaveLength(2)
  })
  
  it('queries by component type', async () => {
    // Create mixed entities
    await ecs.createEntity(userId, {
      flashcard: { question: 'Q1', answer: 'A1' }
    })
    await ecs.createEntity(userId, {
      annotation: { text: 'Note' }
    })
    
    // Query only flashcards
    const flashcards = await ecs.query(['flashcard'], userId)
    expect(flashcards).toHaveLength(1)
  })
})
```

## Migration from Basic to Full ECS

If you start without ECS and need to migrate:

```sql
-- Migration: Convert flashcards table to ECS
INSERT INTO entities (id, user_id, created_at)
SELECT id, user_id, created_at FROM flashcards;

INSERT INTO components (entity_id, component_type, data, document_id)
SELECT 
  id, 
  'flashcard',
  jsonb_build_object('question', question, 'answer', answer),
  document_id
FROM flashcards;

INSERT INTO components (entity_id, component_type, data)
SELECT 
  id,
  'study', 
  jsonb_build_object('due', due, 'ease', ease, 'interval', interval)
FROM flashcards;

-- Drop old table
DROP TABLE flashcards;
```

## Key Principles

1. **Entities are just IDs** - No data on entity itself
2. **Components are data** - All data lives in components
3. **Composition over inheritance** - Add/remove components dynamically
4. **Query by components** - Find entities by what components they have
5. **Flexible relationships** - Use source component for any relationship
6. **Start simple** - Add components as needed, don't over-engineer

This ECS will scale with your app without requiring migrations or refactoring.

This comprehensive guide gives Claude Code everything needed to implement the ECS correctly from day one. The key is the simplicity - just two tables, one class, and clear patterns to follow.