---
name: Rhizome ECS Pattern
description: Entity-Component-System for flexible user-generated mutable data (annotations, flashcards, study data). Entities are UUIDs, components are JSONB (annotation, position, source, flashcard, study). Use ECS for user-created content requiring flexible schemas. Use when creating annotations or user-mutable features.
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

## Related Documentation

- `docs/ECS_IMPLEMENTATION.md`
- `src/lib/ecs/ecs.ts`
