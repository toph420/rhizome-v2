---
name: Rhizome ECS Pattern
description: Entity-Component-System for flexible user-generated mutable data. Uses PascalCase components (Position, Visual, Content, Temporal, ChunkRef, Spark). MANDATORY Operations wrapper pattern (AnnotationOperations, SparkOperations). Use for annotations, sparks, flashcards. Trigger keywords: ECS, AnnotationOperations, SparkOperations, Position, Visual, Content, Temporal, ChunkRef, Spark, annotation, spark, user-generated content.
---

# Rhizome ECS Pattern

Entity-Component-System with **mandatory Operations wrapper pattern**.

## ⚠️ CRITICAL: Use Operations Wrappers, NOT Raw ECS

**NEVER use `ecs.createEntity()` directly in server actions.** Always use Operations wrapper classes:

## Current Component Types (PascalCase)

**Annotations** (5-component pattern):
- `Position` - Text location with recovery (startOffset, endOffset, originalText, textContext)
- `Visual` - Display styling (color)
- `Content` - User notes and tags (note, tags)
- `Temporal` - Timestamps (createdAt, updatedAt)
- `ChunkRef` - Document references (documentId, chunkId, chunkIds)

**Sparks** (4-component pattern):
- `Spark` - Quick ideas with selections, connections
- `Content` - Note and tags (shared with Annotations)
- `Temporal` - Timestamps (shared)
- `ChunkRef` - Document references (shared)

**Planned**:
- `Flashcard` - Study cards (UI placeholder only)
- `Study` - FSRS spaced repetition (UI placeholder only)

## Examples

```typescript
// ✅ CORRECT: Use AnnotationOperations wrapper
import { createECS } from '@/lib/ecs'
import { AnnotationOperations } from '@/lib/ecs/annotations'

const ecs = createECS()
const ops = new AnnotationOperations(ecs, userId)

const annotationId = await ops.create({
  documentId: documentId,
  text: 'Selected text',
  note: 'My thoughts',
  color: 'yellow',
  tags: ['important'],
  chunkIds: [chunkId],
  startOffset: 100,
  endOffset: 150,
  textContext: { before: '...', after: '...' },
  chunkPosition: 0
})
// Creates 5 components: Position, Visual, Content, Temporal, ChunkRef

// ✅ CORRECT: Use SparkOperations wrapper
import { SparkOperations } from '@/lib/ecs/sparks'

const sparkOps = new SparkOperations(ecs, userId)
const sparkId = await sparkOps.create({
  content: 'Quick thought',
  selections: [{ text: '...', chunkId, startOffset: 0, endOffset: 10 }],
  tags: ['idea'],
  connections: [],
  chunkId,
  chunkIds: [chunkId],
  documentId,
  originChunkContent: 'First 500 chars...'
})
// Creates 4 components: Spark, Content, Temporal, ChunkRef

// ❌ WRONG: Never use raw ecs.createEntity() in server actions
const entityId = await ecs.createEntity(userId, {
  Position: { ... }, // Don't do this!
  Visual: { ... }
})
```

## When NOT to Use This Skill

- **Immutable system data**: Use regular tables for documents, chunks
- **High-volume generated data**: Use regular tables for connections (auto-generated)
- **Fixed schemas**: Use regular tables for background_jobs
- **Performance-critical paths**: Use pgvector on regular tables, not ECS

### ❌ Common Mistakes

```typescript
// ❌ WRONG: Using raw ecs.createEntity() instead of Operations wrapper
await ecs.createEntity(userId, {
  Position: { startOffset: 0, endOffset: 10 },
  Visual: { color: 'yellow' }
})
// ✅ CORRECT: Use AnnotationOperations.create()

// ❌ WRONG: Using lowercase component names (old pattern)
await ecs.createEntity(userId, {
  annotation: { text: '...' },  // Should be Position/Visual/Content/Temporal/ChunkRef
  position: { ... },
  source: { ... }
})

// ❌ WRONG: Using ECS for immutable system data
await ecs.createEntity(userId, {
  document: { title: 'Book.pdf', size: 1024 }  // Use documents table instead
})

// ❌ WRONG: Querying without proper component filters
const all = await ecs.query(['Content'], userId)  // Gets both annotations AND sparks!
const filtered = all.filter(e => e.ChunkRef.documentId === docId)  // Inefficient!
// ✅ CORRECT: Query for Position to get annotations only
const annotations = await ecs.query(['Position'], userId, { document_id: docId })

// ❌ WRONG: Storing large content in components
await ops.create({
  text: largeMarkdownContent  // Should be in Storage, not JSONB
})
```

## Related Documentation

- `docs/ECS_IMPLEMENTATION.md` - Complete ECS guide with Operations wrapper pattern
- `docs/ANNOTATIONS_SYSTEM.md` - 5-component annotation architecture
- `docs/SPARK_SYSTEM.md` - 4-component spark system
- `src/lib/ecs/annotations.ts` - AnnotationOperations wrapper class
- `src/lib/ecs/sparks.ts` - SparkOperations wrapper class
- `src/lib/ecs/components.ts` - Shared component type definitions
