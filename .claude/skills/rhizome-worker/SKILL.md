---
name: Rhizome Worker Patterns
description: Worker module patterns for document processing - ProcessorRouter factory for 7 formats, 3-engine orchestrator (Semantic, Contradiction, Thematic), Zod validation for all outputs. NEVER bypass orchestrator, NEVER cross-import with main app. Use when working with worker/ directory. Trigger keywords: worker, ProcessorRouter, orchestrator, processDocument, PDF processor, EPUB processor, semantic_similarity, contradiction_detection, thematic_bridge, worker/processors, worker/engines, background_jobs.
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

## When NOT to Use This Skill

- **Client-side processing**: Keep heavy processing server-side
- **Real-time operations**: Worker is async, use Server Actions for immediate
- **Simple queries**: Direct Supabase queries don't need worker
- **Frontend logic**: Worker is Node.js only, no browser APIs

### ❌ Common Mistakes

```typescript
// Wrong: Bypassing orchestrator
await runSemanticSimilarity(documentId)
await runContradictionDetection(documentId)
await runThematicBridge(documentId)
// Should use: processDocument(documentId, { enabledEngines: [...] })

// Wrong: Direct worker import from main app
import { PDFProcessor } from '@/worker/processors/pdf-processor'
// Should communicate via background_jobs table

// Wrong: Main app code in worker
import { DocumentViewer } from '@/components/reader/DocumentViewer'
// Worker is Node.js, can't import React components

// Wrong: No error handling in handler
export async function handler(job: BackgroundJob) {
  await processor.process()  // What if this fails?
}
// Should wrap in try/catch and update job status

// Wrong: Missing progress updates
await longRunningProcess()  // User sees nothing
// Should: use onProgress callbacks to update job progress
```

## Related Documentation

- `worker/README.md`
- `worker/engines/orchestrator.ts`
