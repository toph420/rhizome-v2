---
name: Rhizome Worker Patterns
description: Worker module patterns for document processing - ProcessorRouter factory for 7 formats (PDF, EPUB, YouTube, Web, Markdown, Text, Paste), 3-engine orchestrator (Semantic, Contradiction, Thematic), Zod validation for all outputs. NEVER bypass orchestrator, NEVER cross-import with main app. Use when working with worker/ directory.
---

# Rhizome Worker Patterns

Node.js background processing patterns.

## Instructions

### Core Principle

Worker module (`worker/`) is completely separate from main app (`src/`).
Communication ONLY via `background_jobs` table, NEVER direct imports.

### ProcessorRouter Pattern (Factory)

**File**: `worker/processors/router.ts`

**7 Document Formats**:
- PDF - `PDFProcessor`
- EPUB - `EPUBProcessor`
- YouTube - `YouTubeProcessor`
- Web - `WebProcessor`
- Markdown (as-is) - `MarkdownAsIsProcessor`
- Markdown (clean) - `MarkdownCleanProcessor`
- Text - `TextProcessor`
- Paste - `PasteProcessor`

```typescript
// worker/processors/router.ts
export class ProcessorRouter {
  static createProcessor(
    sourceType: SourceType,
    ai: any,
    supabase: any,
    job: BackgroundJob
  ): SourceProcessor {
    switch (sourceType) {
      case 'pdf':
        return new PDFProcessor(ai, supabase, job)
      case 'epub':
        return new EPUBProcessor(ai, supabase, job)
      case 'youtube':
        return new YouTubeProcessor(ai, supabase, job)
      case 'web_url':
        return new WebProcessor(ai, supabase, job)
      case 'markdown_asis':
        return new MarkdownAsIsProcessor(ai, supabase, job)
      case 'markdown_clean':
        return new MarkdownCleanProcessor(ai, supabase, job)
      case 'txt':
        return new TextProcessor(ai, supabase, job)
      case 'paste':
        return new PasteProcessor(ai, supabase, job)
      default:
        throw new Error(`Unknown source type: ${sourceType}`)
    }
  }
}

// Usage in handler
const processor = ProcessorRouter.createProcessor(
  job.source_type,
  ai,
  supabase,
  job
)
await processor.process()
```

### Base Processor Interface

**All processors extend**: `SourceProcessor`

```typescript
// worker/processors/base.ts
export abstract class SourceProcessor {
  abstract async process(): Promise<void>
  abstract async download(): Promise<string>
  abstract async extract(): Promise<string>
  abstract async cleanup(markdown: string): Promise<string>
}
```

### 3-Engine Orchestrator (MANDATORY)

**File**: `worker/engines/orchestrator.ts`

**NEVER call engines directly** - always through orchestrator.

**3 Engines**:
1. **Semantic Similarity** (25% weight) - Embedding-based, fast
2. **Contradiction Detection** (40% weight) - Metadata-based tensions
3. **Thematic Bridge** (35% weight) - AI cross-domain concepts

```typescript
// worker/engines/orchestrator.ts
export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const {
    enabledEngines = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
    onProgress
  } = config

  const allConnections: ChunkConnection[] = []

  // Run engines (sequential or parallel)
  if (enabledEngines.includes('semantic_similarity')) {
    await onProgress?.(25, 'semantic-similarity', 'Finding similarities')
    const connections = await runSemanticSimilarity(documentId, config.semanticSimilarity)
    allConnections.push(...connections)
  }

  if (enabledEngines.includes('contradiction_detection')) {
    await onProgress?.(50, 'contradiction-detection', 'Detecting contradictions')
    const connections = await runContradictionDetection(documentId, config.contradictionDetection)
    allConnections.push(...connections)
  }

  if (enabledEngines.includes('thematic_bridge')) {
    await onProgress?.(75, 'thematic-bridge', 'Finding thematic bridges')
    const useLocalMode = process.env.PROCESSING_MODE === 'local'
    const connections = useLocalMode
      ? await runThematicBridgeQwen(documentId, config.thematicBridge, onProgress)
      : await runThematicBridge(documentId, config.thematicBridge, onProgress)
    allConnections.push(...connections)
  }

  // Save connections
  await saveChunkConnections(allConnections)

  return {
    totalConnections: allConnections.length,
    byEngine: { /* counts */ },
    executionTime: Date.now() - startTime
  }
}

// ✅ CORRECT - Use orchestrator
await processDocument(documentId, {
  enabledEngines: ['semantic_similarity', 'thematic_bridge']
})

// ❌ WRONG - Bypass orchestrator
await runSemanticSimilarity(documentId)
await runThematicBridge(documentId)
```

### Zod Validation (MANDATORY)

**File**: `worker/types/job-schemas.ts`

**ALL worker outputs MUST be validated** before saving to `background_jobs.output_data`.

```typescript
// Define schema
export const ProcessDocumentOutputSchema = z.object({
  success: z.boolean(),
  chunkCount: z.number().int().min(0),
  connectionCount: z.number().int().min(0),
  processingTimeMs: z.number().int().min(0),
  storageUrl: z.string().url().optional(),
  errors: z.array(z.string()).optional()
})

// In handler
const outputData = {
  success: true,
  chunkCount: chunks.length,
  connectionCount: connections.length,
  processingTimeMs: Date.now() - start,
  storageUrl: signedUrl
}

// ALWAYS validate
validateJobOutput('process_document', outputData)

await supabase.from('background_jobs').update({
  output_data: outputData,
  status: 'completed'
}).eq('id', job.id)
```

## Examples

### ✅ Correct Worker Handler

```typescript
// worker/handlers/process-document.ts
import { ProcessorRouter } from '../processors/router'
import { processDocument } from '../engines/orchestrator'
import { validateJobOutput } from '../types/job-schemas'

export async function processDocumentHandler(job: BackgroundJob) {
  const start = Date.now()

  try {
    // 1. Process document (download, extract, chunk)
    const processor = ProcessorRouter.createProcessor(
      job.source_type,
      ai,
      supabase,
      job
    )
    await processor.process()

    // 2. Run connection detection through orchestrator
    const result = await processDocument(job.document_id, {
      enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
      onProgress: async (percent, engine, message) => {
        await updateJobProgress(job.id, percent, message)
      }
    })

    // 3. Build output data
    const outputData = {
      success: true,
      chunkCount: result.chunkCount,
      connectionCount: result.totalConnections,
      processingTimeMs: Date.now() - start,
      storageUrl: await getStorageUrl(job.document_id)
    }

    // 4. ALWAYS validate
    validateJobOutput('process_document', outputData)

    // 5. Save to database
    await supabase.from('background_jobs').update({
      output_data: outputData,
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', job.id)

  } catch (error) {
    await handleJobError(job.id, error)
  }
}
```

### ❌ Anti-Patterns

```typescript
// WRONG: Main app importing worker code
import { PDFProcessor } from '@/worker/processors/pdf-processor'

// WRONG: Worker importing React components
import { DocumentViewer } from '@/components/reader/DocumentViewer'

// WRONG: Bypassing orchestrator
await runSemanticSimilarity(documentId)
await runContradictionDetection(documentId)
// Should use: processDocument(documentId, { enabledEngines: [...] })

// WRONG: No Zod validation
await supabase.from('background_jobs').update({
  output_data: { chunkCount: 100 }  // No validation!
})

// WRONG: Direct RPC call
await processDocument(docId)  // Should use background_jobs table
```

## Worker Directory Structure

```
worker/
├── processors/         # 7 format processors
│   ├── base.ts        # SourceProcessor abstract class
│   ├── router.ts      # ProcessorRouter factory
│   ├── pdf-processor.ts
│   ├── epub-processor.ts
│   ├── youtube-processor.ts
│   ├── web-processor.ts
│   ├── markdown-processor.ts
│   ├── text-processor.ts
│   └── paste-processor.ts
├── engines/           # 3 collision detection engines
│   ├── orchestrator.ts           # Coordinates all 3 engines
│   ├── semantic-similarity.ts    # Embedding-based
│   ├── contradiction-detection.ts # Metadata-based
│   └── thematic-bridge.ts        # AI-powered
├── handlers/          # Job handlers
│   ├── process-document.ts
│   ├── export-documents.ts
│   └── import-documents.ts
├── types/             # Worker-specific types
│   └── job-schemas.ts # Zod schemas for ALL job outputs
├── lib/               # Worker utilities
│   ├── local-processing.ts
│   └── embeddings.ts
└── tests/             # Worker tests
    ├── critical/
    └── integration/
```

## Communication Pattern

**Main App → Worker**:
```typescript
// src/app/actions/documents.ts
'use server'
export async function triggerProcessing(docId: string) {
  await supabase.from('background_jobs').insert({
    job_type: 'process_document',
    document_id: docId,
    status: 'pending'
  })
}
```

**Worker Polls Jobs**:
```typescript
// worker/index.ts
while (true) {
  const { data: jobs } = await supabase
    .from('background_jobs')
    .select('*')
    .eq('status', 'pending')
    .limit(1)

  for (const job of jobs) {
    const handler = getHandler(job.job_type)
    await handler(job)
  }

  await sleep(5000)
}
```

## Related Documentation

- `worker/README.md` - Worker module overview
- `worker/processors/` - Processor implementations
- `worker/engines/` - Connection detection engines
- `worker/types/job-schemas.ts` - Zod schemas
