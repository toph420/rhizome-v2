---
name: Rhizome Worker Patterns
description: Worker module patterns for document processing - ProcessorRouter factory for 7 formats, 3-engine orchestrator (Semantic, Contradiction, Thematic), Zod validation for all outputs. NEVER bypass orchestrator, NEVER cross-import with main app. Use when working with worker/ directory.
---

# Rhizome Worker Patterns

Node.js background processing patterns.

## Instructions

### ProcessorRouter Factory

7 formats: PDF, EPUB, YouTube, Web, Markdown (2x), Text, Paste

```typescript
const processor = ProcessorRouter.createProcessor(job.source_type, ai, supabase, job)
await processor.process()
```

### 3-Engine Orchestrator

NEVER bypass orchestrator - always use:

```typescript
await processDocument(documentId, {
  enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
})
```

### Communication

Only via `background_jobs` table, NEVER direct imports between src/ and worker/

## Related Documentation

- `worker/README.md`
- `worker/engines/orchestrator.ts`
