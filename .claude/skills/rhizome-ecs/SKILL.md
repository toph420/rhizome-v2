---
name: Rhizome ECS Pattern
description: Entity-Component-System for flexible user-generated mutable data (annotations, flashcards, study data). Entities are UUIDs, components are JSONB (annotation, position, source, flashcard, study). Use ECS for user-created content requiring flexible schemas. Use when creating annotations or user-mutable features. Trigger keywords: ECS, entity, component, annotation, flashcard, spark, createEntity, ecs.createEntity, ecs.query, user-generated content, ecs_entities, ecs_components, JSONB components.
---

# Rhizome ECS Pattern

Entity-Component-System for flexible user data.

## Instructions

**Component Types**:
- `annotation` - User text selection with notes
- `position` - Where annotation appears
- `source` - Document references
- `flashcard` - Study cards (future)
- `study` - FSRS spaced repetition (future)

## Examples

```typescript
import { ecs } from '@/lib/ecs'

const entityId = await ecs.createEntity(userId, {
  annotation: { text: 'Selected text', tags: [] },
  position: { chunkIds: [chunkId], startOffset: 0 },
  source: { document_id: docId }
})
```

## When NOT to Use This Skill

- **Immutable system data**: Use regular tables for documents, chunks
- **High-volume generated data**: Use regular tables for connections (auto-generated)
- **Fixed schemas**: Use regular tables for background_jobs
- **Performance-critical paths**: Use pgvector on regular tables, not ECS

### ❌ Common Mistakes

```typescript
// Wrong: Using ECS for immutable data
await ecs.createEntity(userId, {
  document: { title: 'Book.pdf', size: 1024 }  // Use documents table instead
})

// Wrong: Querying without filtering
const all = await ecs.query(['annotation'], userId)
const filtered = all.filter(e => e.source.document_id === docId)  // Inefficient!
// Should use: ecs.query(['annotation', 'source'], userId, { document_id: docId })

// Wrong: Storing large content in components
await ecs.createEntity(userId, {
  annotation: { text: largeMarkdown }  // Should be in Storage
})
```

## Related Documentation

- `docs/ECS_IMPLEMENTATION.md`
- `src/lib/ecs/ecs.ts`
