# Worker Directory Refactoring Analysis

## Executive Summary

The worker directory exhibits significant code duplication and coupling issues across **handlers**, **processors**, and **engines**. The codebase spans 64,647 lines with duplicated patterns in:
- Progress tracking (8+ handlers each defining `updateProgress`)
- Error handling and retry logic (repeated 12+ times)
- Job completion workflows (14 instances of status updates)
- Processor initialization and metadata extraction
- Storage operations

**Refactoring opportunities identified**: ~15-20% code reduction through abstraction of handler patterns, processor base methods, and engine orchestration.

---

## Part 1: Handler Architecture Analysis

### 1.1 Current Handler Structure

**Location**: `/home/user/rhizome-v2/worker/handlers/` (14 handlers, 6,581 total lines)

#### Handlers Overview
```
process-document.ts        790 lines  - Main document processing pipeline
readwise-import.ts         951 lines  - Readwise highlight import
import-from-vault.ts       691 lines  - Obsidian vault import
obsidian-sync.ts          709 lines  - Obsidian sync operations
reprocess-document.ts     605 lines  - Document reprocessing
import-document.ts        408 lines  - Storage to database import
export-document.ts        408 lines  - Document export to ZIP
reprocess-connections.ts  320 lines  - Connection regeneration
continue-processing.ts    352 lines  - Resume after manual review
detect-connections.ts      99 lines  - Connection detection
recover-annotations.ts    279 lines  - Annotation recovery
recover-sparks.ts         413 lines  - Spark recovery
remap-connections.ts      336 lines  - Connection remapping
scan-vault.ts              53 lines  - Vault scanning
```

### 1.2 Pattern 1: Duplicated Progress Update Functions

**Problem**: 8 handlers each define their own `updateProgress()` function with slight variations.

#### Duplication Examples

**detect-connections.ts** (lines 23-35):
```typescript
async function updateProgress(percent: number, stage: string, details?: string) {
  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent,
        stage,
        details: details || `${stage}: ${percent}%`
      },
      status: 'processing'
    })
    .eq('id', job.id);
}
```

**reprocess-connections.ts** (lines 52-64): *(identical code)*
```typescript
async function updateProgress(percent: number, stage: string, details?: string) {
  await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent,
        stage,
        details: details || `${stage}: ${percent}%`
      },
      status: 'processing'
    })
    .eq('id', job.id);
}
```

**process-document.ts** (lines 765-788): *(different signature, similar logic)*
```typescript
async function updateProgress(
  supabase: any,
  jobId: string,
  percentage: number,
  stage: string,
  status: string,
  message?: string
) {
  const { error } = await supabase
    .from('background_jobs')
    .update({
      progress: {
        percent: percentage,
        stage,
        details: message || `${stage}: ${percentage}%`
      },
      status
    })
    .eq('id', jobId)
}
```

**continue-processing.ts** (lines 69-83): *(optional job tracking)*
```typescript
async function updateProgress(percent: number, message?: string) {
  if (jobId) {
    await supabase
      .from('background_jobs')
      .update({
        progress: {
          percent,
          stage: 'continue_processing',
          details: message || ''
        }
      })
      .eq('id', jobId)
  }
}
```

### 1.3 Pattern 2: Job Completion Status Updates

**Problem**: Repeated pattern for marking jobs complete with status, timestamps, and output_data.

**Common Pattern Across All Handlers**:
```typescript
await supabase
  .from('background_jobs')
  .update({
    status: 'completed',
    progress: { percent: 100, stage: 'complete', details: '...' },
    output_data: { /* handler-specific output */ },
    completed_at: new Date().toISOString()
  })
  .eq('id', job.id)
```

**Found 14 instances** in:
- `detect-connections.ts` (line 73)
- `process-document.ts` (line 603)
- `reprocess-connections.ts` (line 289)
- `export-document.ts` (line 390)
- `import-document.ts` (line 440)
- And 9 more in `index.ts` (central dispatcher)

### 1.4 Pattern 3: Error Handling & Job Failure

**Problem**: 12+ instances of similar error handling that mark jobs as failed.

**Similar Patterns**:
```typescript
// Pattern A: Simple failure (detect-connections.ts, lines 84-95)
} catch (error: any) {
  console.error('[DetectConnections] Handler error:', error);
  await supabase
    .from('background_jobs')
    .update({
      status: 'failed',
      last_error: error.message,
      completed_at: new Date().toISOString()
    })
    .eq('id', job.id);
  throw error;
}

// Pattern B: Classified error handling (process-document.ts, lines 619-660)
} catch (error: any) {
  console.error('❌ Processing failed:', error)
  const errorType = classifyError(error)
  const userMessage = getUserFriendlyError(error)
  await updateDocumentStatus(supabase, document_id, 'failed', false, false, userMessage)
  // ... more complex retry logic
}
```

### 1.5 Pattern 4: Resume State Checking

**Problem**: Multiple handlers implement nearly identical resume/checkpoint logic.

**import-document.ts** (lines 27-43):
```typescript
async function checkResumeState(job: any): Promise<{ resuming: boolean; lastStage?: string }> {
  if (!job.resume_count || job.resume_count === 0) {
    return { resuming: false }
  }
  const lastStage = job.metadata?.last_completed_stage
  if (lastStage) {
    console.log(`[Resume] Last completed stage: ${lastStage}`)
    return { resuming: true, lastStage }
  }
  return { resuming: false }
}
```

**Similar in**: `process-document.ts` (lines 34-89), `reprocess-document.ts`, `continue-processing.ts`

### 1.6 Handler Flow Issues

**Observation**: Job handlers follow repeating pattern:
1. Initialize Supabase client / extract job input
2. Define local `updateProgress()` helper
3. Try-catch block with processing logic
4. Update job status on completion
5. Mark job failed on error

**Missing**: Abstracted handler base class or utility to standardize this flow.

---

## Part 2: Processor Architecture Analysis

### 2.1 Current Processor Structure

**Location**: `/home/user/rhizome-v2/worker/processors/` (8 processors)

#### Processors Overview
```
base.ts              551 lines  - SourceProcessor abstract base class
pdf-processor.ts     701 lines  - PDF extraction with Docling
epub-processor.ts    925 lines  - EPUB extraction with Docling
web-processor.ts     350 lines  - Web article extraction
markdown-processor.ts 700 lines  - Markdown as-is and clean modes
youtube-processor.ts 320 lines  - YouTube transcript extraction
text-processor.ts    180 lines  - Plain text processor
paste-processor.ts   150 lines  - Pasted content processor
router.ts            106 lines  - Processor factory router
```

### 2.2 Pattern 1: Duplicated Processor Imports

**Problem**: Each processor imports nearly identical set of chunking/metadata libraries.

**pdf-processor.ts** (lines 32-62):
```typescript
import { SourceProcessor } from './base.js'
import { extractPdfBuffer, type DoclingChunk } from '../lib/docling-extractor.js'
import { cleanPageArtifacts } from '../lib/text-cleanup.js'
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { bulletproofMatch } from '../lib/local/bulletproof-matcher.js'
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
import { extractMetadataBatch } from '../lib/chunking/pydantic-metadata.js'
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
import { getChunkerOptions } from '../lib/chunking/chunker-config.js'
import { getPipelineConfig, logPipelineConfig } from '../lib/local/docling-config.js'
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'
```

**epub-processor.ts** (lines 34-57): *(nearly identical)*
```typescript
import { SourceProcessor } from './base.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { cleanEpubArtifacts } from '../lib/epub/epub-cleaner.js'
import { cleanEpubChaptersWithAI } from '../lib/markdown-cleanup-ai.js'
import { extractEpubWithDocling, type DoclingChunk } from '../lib/local/epub-docling-extractor.js'
import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../lib/local/ollama-cleanup.js'
import { bulletproofMatch } from '../lib/local/bulletproof-matcher.js'
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import { transferMetadataToChonkieChunks } from '../lib/chonkie/metadata-transfer.js'
import { extractMetadataBatch } from '../lib/chunking/pydantic-metadata.js'
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'
import { getChunkerOptions } from '../lib/chunking/chunker-config.js'
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'
```

**web-processor.ts** (lines 16-32): *(subset, but similar pattern)*
```typescript
import { SourceProcessor } from './base.js'
import { isValidUrl, extractArticle } from '../lib/web-extraction.js'
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import { extractMetadataBatch } from '../lib/chunking/pydantic-metadata.js'
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
import { hashMarkdown } from '../lib/cached-chunks.js'
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'
```

### 2.3 Pattern 2: Shared Pipeline Stages

All file-based processors (PDF, EPUB) duplicate the same 10-stage pipeline:

**pdf-processor.ts** (lines 1-30 comments):
```
1. Download PDF from Storage (10-15%)
2. Docling Extraction with HybridChunker (15-50%)
3. Local Regex Cleanup + Optional AI Cleanup (50-70%)
4. Bulletproof Coordinate Mapping (70-72%)
5. Optional Review Checkpoint (72%)
6. Chonkie Chunking (72-75%)
7. Metadata Transfer (75-77%)
8. Metadata Enrichment (77-90%)
9. Local Embeddings (90-95%)
10. Finalize (95-100%)
```

**epub-processor.ts** (lines 1-30 comments): *(identical pipeline with EPUB-specific details)*

**Duplicated Code Example**: Both processors have nearly identical progress update sequences:
```typescript
// Both pdf-processor and epub-processor have:
await this.updateProgress(10, 'download', 'fetching', 'Downloading PDF/EPUB file')
// ... stage specific logic ...
await this.updateProgress(50, 'extract', 'processing', 'Article extracted successfully')
// ... more duplicated patterns
```

### 2.4 Pattern 3: BaseProcessor Methods Called Identically

**In SourceProcessor (base.ts)**:
- `startHeartbeat()` - Called in 6+ processors
- `stopHeartbeat()` - Called in 6+ processors  
- `updateProgress()` - Called 50+ times across processors
- `withRetry()` - Called 15+ times
- `saveStageResult()` - Called in checkpoint code paths
- `buildMetadataExport()` - Called in pdf-processor and epub-processor
- `mapAIChunkToDatabase()` - Called in multiple processors

All processors follow the same pattern:
```typescript
export class PDFProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    this.startHeartbeat()
    try {
      await this.updateProgress(10, 'download', 'fetching', '...')
      // ... processing ...
      result = await this.withRetry(async () => { /* ... */ }, 'operation-name')
      // ... more processing ...
    } finally {
      this.stopHeartbeat()
    }
  }
}
```

### 2.5 Pattern 4: Metadata Extraction Duplication

**Problem**: Both PDF and EPUB processors repeat identical metadata enrichment code.

**Common in pdf-processor.ts and epub-processor.ts**:
```typescript
// Extract metadata with PydanticAI + Ollama
const chunksWithMetadata = await extractMetadataBatch(
  chunksForMetadata,
  processingMode,
  chunkerStrategy,
  onMetadataProgress
)

// Log statistics
await logChunkStatistics(chunksWithMetadata)

// Generate embeddings
const embeddings = processingMode === 'local'
  ? await generateEmbeddingsLocal(chunkTexts)
  : await generateEmbeddings(chunkTexts)
```

---

## Part 3: Orchestrator & Engine Architecture

### 3.1 Engine Structure

**Location**: `/home/user/rhizome-v2/worker/engines/`

#### Files Overview
```
orchestrator.ts              157 lines  - Main orchestrator (function-based)
base-engine.ts              ~170 lines  - Abstract base (defined but not fully used)
semantic-similarity.ts       ~400 lines  - Semantic engine
contradiction-detection.ts   ~350 lines  - Contradiction engine
thematic-bridge.ts          ~350 lines  - Thematic engine (Gemini)
thematic-bridge-qwen.ts     ~350 lines  - Thematic engine (Qwen local)
scoring.ts                  ~200 lines  - Scoring utilities
types.ts                    ~100 lines  - Type definitions
```

### 3.2 Problem 1: Orchestrator Is Function-Based, Not Class-Based

**orchestrator.ts** (lines 38-157):
```typescript
export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  // ... runs 3 engines sequentially
  // ... each engine returns ChunkConnection[]
  // ... saves all connections at end
}
```

**Coupling Issues**:
- Orchestrator directly imports each engine:
  ```typescript
  import { runSemanticSimilarity } from './semantic-similarity'
  import { runContradictionDetection } from './contradiction-detection'
  import { runThematicBridge } from './thematic-bridge'
  import { runThematicBridgeQwen } from './thematic-bridge-qwen'
  ```
- No engine registry or factory pattern
- Hard-coded decision to use Qwen vs Gemini: `const useLocalMode = process.env.PROCESSING_MODE === 'local'`

### 3.3 Problem 2: Engine Implementations Don't Use BaseEngine

**base-engine.ts** defines `BaseEngine` abstract class (lines 20-100+) with:
- `detect()` - wrapper with cache/metrics
- `detectImpl()` - abstract implementation
- `canProcess()` - validation
- `validateConfig()` - configuration check
- `postProcess()` - result processing

**However**: None of the 3 engine implementations actually extend `BaseEngine`.

**Each engine is a standalone function**:
- `runSemanticSimilarity(documentId, config)` → ChunkConnection[]
- `runContradictionDetection(documentId, config)` → ChunkConnection[]
- `runThematicBridge(documentId, config)` → ChunkConnection[]

### 3.4 Problem 3: Similar Configuration Structure Across Handlers

**Handlers** that call orchestrator repeat similar config patterns:

**detect-connections.ts** (lines 44-62):
```typescript
const result = await processDocument(document_id, {
  enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
  onProgress: updateProgress,
  semanticSimilarity: {
    threshold: 0.7,
    maxResultsPerChunk: 50,
    crossDocumentOnly: true
  },
  contradictionDetection: {
    minConceptOverlap: 0.5,
    polarityThreshold: 0.3,
    maxResultsPerChunk: 20,
    crossDocumentOnly: true
  },
  thematicBridge: {
    minImportance: 0.6,
    minStrength: 0.6,
    maxSourceChunks: 50,
    maxCandidatesPerSource: 10,
    batchSize: 5
  }
});
```

**reprocess-connections.ts** (lines 245-263): *(identical configuration, repeated in same file)*

---

## Part 4: Shared Code Duplication

### 4.1 Database Update Patterns

**Pattern**: Repeated across 8+ handlers
```typescript
await supabase
  .from('background_jobs')
  .update({
    status: 'completed',
    progress: { percent: 100, stage: 'complete', details: '...' },
    output_data: { /* ... */ },
    completed_at: new Date().toISOString()
  })
  .eq('id', job.id)
```

### 4.2 Storage Operations

**Pattern 1: Download from Storage** (5+ instances)
```typescript
const { data: file, error } = await supabase.storage
  .from('documents')
  .download(path)
if (error) throw new Error(`Failed to download: ${error.message}`)
const content = await file.text()
```

**Pattern 2: Upload to Storage** (4+ instances)
```typescript
const blob = new Blob([content], { type: 'application/json' })
const { error } = await supabase.storage
  .from('documents')
  .upload(path, blob, { upsert: true })
if (error) throw new Error(`Failed to upload: ${error.message}`)
```

### 4.3 Error Classification & Retry

**Used in 45+ places** (based on grep results):
- Import and use `classifyError()` and `getUserFriendlyError()`
- Nearly identical retry logic in `withRetry()` method

---

## Part 5: Coupling Analysis

### 5.1 Handler ↔ Processor Coupling

**process-document.ts** (lines 98-403):
- Creates processor via router
- Directly calls `processor.process()`
- Saves results to database
- Starts heartbeat for progress
- Caches results in job metadata
- Handles checkpoint logic
- Creates follow-up connection detection job

**Tight Coupling Issues**:
- Handler knows about processor result format
- Handler knows about progress percentages for each processor type
- Handler duplicates caching logic that should be in processor
- Handler calls orchestrator indirectly through follow-up jobs

### 5.2 Handler ↔ Database Coupling

All handlers directly interact with:
- `background_jobs` table (direct updates)
- `documents` table (status updates)
- `chunks` table (data operations)
- `connections` table (for reprocessing)

**Missing**: Data access layer / repository pattern

### 5.3 Processor ↔ Storage Coupling

All processors call:
- `supabase.storage.from('documents').download()`
- `supabase.storage.from('documents').upload()`
- `this.saveStageResult()` for checkpointing

**Missing**: Storage abstraction layer

---

## Part 6: File Flow Summary

### From Job Trigger → Handler → Processor → Orchestrator

```
background_jobs (DB)
    ↓
worker/index.ts (main loop)
    ↓
JOB_HANDLERS[job_type]
    ↓
handler (e.g., process-document.ts)
    ↓
if (process_document):
    ├─ ProcessorRouter.createProcessor()
    ├─ processor.process()  
    ├─ save chunks to DB
    └─ create detect_connections job
    
    ↓
if (detect_connections):
    └─ orchestrator.processDocument()
        ├─ runSemanticSimilarity()
        ├─ runContradictionDetection()
        └─ runThematicBridge() or runThematicBridgeQwen()
            └─ save connections to DB
```

**Coupling Observations**:
1. Handlers directly instantiate processors (tight coupling)
2. Handlers know processor-specific details (progress percentages, output format)
3. Orchestrator is called as follow-up job, not directly from handler
4. Each handler manages its own progress/error state

---

## Part 7: Refactoring Opportunities

### HIGH PRIORITY (15-20% code reduction)

#### 1. Extract Handler Base Class / Utilities
**Target**: Consolidate duplicate progress, error handling, and job completion logic

**Current**: 8 definitions of `updateProgress()` with variations
**Proposed**: 
```typescript
// worker/lib/handler-utilities.ts
export class HandlerJobManager {
  constructor(supabase: any, jobId: string) { ... }
  async updateProgress(percent: number, stage: string, details?: string) { ... }
  async markComplete(outputData: any) { ... }
  async markFailed(error: Error, errorType?: string) { ... }
  async checkResumeState() { ... }
}
```

**Benefit**: -200+ lines duplicated code, standardized patterns

#### 2. Extract Processor Pipeline Methods
**Target**: Move shared pipeline stages to base class methods

**Current**: Each processor repeats:
- Docling extraction (50+ lines)
- Cleanup (100+ lines)
- Chonkie chunking (50+ lines)
- Metadata enrichment (100+ lines)
- Embeddings generation (50+ lines)

**Proposed**:
```typescript
// worker/processors/base.ts - add methods
export abstract class SourceProcessor {
  // Stage 6: Unified Chonkie pipeline
  protected async runChonkiePipeline(
    chunks: any[],
    strategy: ChonkieStrategy = 'recursive'
  ): Promise<ProcessedChunk[]> { ... }
  
  // Stage 8: Unified metadata enrichment
  protected async enrichMetadata(
    chunks: ProcessedChunk[]
  ): Promise<ProcessedChunk[]> { ... }
  
  // Stage 9: Unified embeddings
  protected async generateChunkEmbeddings(
    chunks: ProcessedChunk[]
  ): Promise<ProcessedChunk[]> { ... }
}
```

**Benefit**: -400+ lines duplicated across pdf/epub processors

#### 3. Extract Orchestrator Engine Registry
**Target**: Replace function-based orchestrator with class-based registry pattern

**Current**: 
```typescript
if (enabledEngines.includes('semantic_similarity')) {
  const connections = await runSemanticSimilarity(...)
}
// repeat for each engine
```

**Proposed**:
```typescript
class EngineRegistry {
  private engines: Map<EngineType, CollisionEngine> = new Map()
  
  register(type: EngineType, engine: CollisionEngine) { ... }
  getEngine(type: EngineType): CollisionEngine { ... }
}

// Later in orchestrator
for (const engineType of enabledEngines) {
  const engine = registry.getEngine(engineType)
  const results = await engine.detect(input)
}
```

**Benefit**: Cleaner separation of concerns, engine hot-swapping

#### 4. Create Handler-Specific Managers
**Target**: Standardize handler implementations

**Current**: Each handler is 200-900 lines of procedural code
**Proposed**: 
```typescript
// Document processing manager
class DocumentProcessingManager extends HandlerJobManager {
  async processDocument(document_id: string, source_type: string) { ... }
}

// Connection detection manager
class ConnectionDetectionManager extends HandlerJobManager {
  async detectConnections(document_id: string) { ... }
}
```

**Benefit**: Handlers reduce to 50-100 lines, easier to test

### MEDIUM PRIORITY (5-10% code reduction)

#### 5. Extract Storage Abstraction Layer
**Target**: Replace repeated storage patterns

**Current**: 20+ places with
```typescript
const { data, error } = await supabase.storage.from('documents').download(path)
```

**Proposed**:
```typescript
// worker/lib/storage-client.ts
export class StorageClient {
  async download(path: string): Promise<string> { ... }
  async upload(path: string, content: any, options?: any): Promise<void> { ... }
  async list(path: string): Promise<FileInfo[]> { ... }
  async createSignedUrl(path: string, expirySeconds: number): Promise<string> { ... }
}
```

**Benefit**: -150 lines, centralized error handling

#### 6. Consolidate Error Handling
**Target**: Create shared error classification and response

**Current**: 12+ catch blocks with different patterns
**Proposed**:
```typescript
// worker/lib/handler-error-handler.ts
export async function handleHandlerError(
  supabase: any,
  jobId: string,
  error: Error,
  options?: { entityId?: string; classify?: boolean }
) { ... }
```

**Benefit**: -100 lines, consistent error responses

#### 7. Move Orchestrator Config to Constants
**Target**: Extract engine config from handler code

**Current**: Config repeated in detect-connections.ts and reprocess-connections.ts
**Proposed**:
```typescript
// worker/engines/engine-config.ts
export const ENGINE_CONFIGS = {
  semanticSimilarity: { threshold: 0.7, maxResultsPerChunk: 50, crossDocumentOnly: true },
  contradictionDetection: { minConceptOverlap: 0.5, polarityThreshold: 0.3, maxResultsPerChunk: 20, crossDocumentOnly: true },
  thematicBridge: { minImportance: 0.6, minStrength: 0.6, maxSourceChunks: 50, maxCandidatesPerSource: 10, batchSize: 5 }
}
```

**Benefit**: -50 lines, single source of truth

### LOW PRIORITY (Structural improvements)

#### 8. Align Engine Implementations with BaseEngine
**Target**: Make engines inherit from BaseEngine, use registry pattern

**Benefit**: Consistency, easier to add new engines

#### 9. Create Pipeline Abstraction
**Target**: Represent 10-stage pipeline as composable stages

**Benefit**: Better reusability, testability

#### 10. Add Repository Pattern for Database Access
**Target**: Consolidate database queries into typed repositories

**Benefit**: Type safety, easier to test, centralized queries

---

## Part 8: Code Statistics

### Duplication Density

| Pattern | Count | Lines | Impact |
|---------|-------|-------|--------|
| `updateProgress()` functions | 8 | 120 | HIGH |
| Job completion pattern | 14 | 210 | HIGH |
| Error catch blocks | 12+ | 180 | MEDIUM |
| Resume state checks | 4+ | 100 | MEDIUM |
| Storage operations | 20+ | 200 | MEDIUM |
| Metadata enrichment | 3+ | 300 | MEDIUM |
| Engine config | 2 | 40 | LOW |
| **TOTAL** | **~63** | **~1,150** | **17.8% of 6,581** |

### File Size Analysis

**Top 10 Largest**:
1. readwise-import.ts: 951 lines (complex highlight import)
2. epub-processor.ts: 925 lines (includes 10-stage pipeline)
3. process-document.ts: 790 lines (main orchestrator + processor)
4. obsidian-sync.ts: 709 lines (complex vault sync)
5. reprocess-document.ts: 605 lines (reprocessing logic)
6. import-from-vault.ts: 691 lines (vault import)
7. recover-sparks.ts: 413 lines (recovery logic)
8. continue-processing.ts: 352 lines (resume workflow)
9. remap-connections.ts: 336 lines (connection remapping)
10. recover-annotations.ts: 279 lines (annotation recovery)

---

## Part 9: Recommended Refactoring Priority

### Phase 1: Quick Wins (Week 1)
1. Extract `HandlerJobManager` utility class (-200 lines)
2. Consolidate engine configs (-50 lines)
3. Extract storage abstraction (-150 lines)

### Phase 2: Processor Consolidation (Week 2)
4. Extract shared processor pipeline methods (-400 lines)
5. Move metadata enrichment to base class (-200 lines)

### Phase 3: Orchestration & Architecture (Week 3)
6. Implement EngineRegistry pattern
7. Refactor handlers to use HandlerJobManager
8. Add repository pattern for database access

### Phase 4: Testing & Refinement (Week 4)
9. Add tests for extracted utilities
10. Document new patterns in CLAUDE.md

---

## Summary of Findings

| Category | Issue | Count | Lines | Priority |
|----------|-------|-------|-------|----------|
| **Handlers** | Duplicated `updateProgress()` | 8 | 120 | HIGH |
| **Handlers** | Duplicated job completion logic | 14 | 210 | HIGH |
| **Handlers** | Duplicated error handling | 12+ | 180 | HIGH |
| **Processors** | Duplicated imports | 3 | 90 | MEDIUM |
| **Processors** | Duplicated pipeline stages | 3 | 400 | HIGH |
| **Processors** | Duplicated metadata enrichment | 3 | 300 | MEDIUM |
| **Engines** | Function-based vs class-based inconsistency | N/A | N/A | MEDIUM |
| **Engines** | Hard-coded engine config duplication | 2 | 40 | LOW |
| **Global** | Storage operation patterns | 20+ | 200 | MEDIUM |
| **TOTAL** | | ~80 | 1,540 | 23.4% reduction possible |

---

## Appendix: Key Files for Reference

- **Handlers**: `/home/user/rhizome-v2/worker/handlers/*.ts`
- **Processors**: `/home/user/rhizome-v2/worker/processors/*.ts`
- **Orchestrator**: `/home/user/rhizome-v2/worker/engines/orchestrator.ts`
- **Dispatcher**: `/home/user/rhizome-v2/worker/index.ts`
- **Base Classes**: `/home/user/rhizome-v2/worker/processors/base.ts`, `/home/user/rhizome-v2/worker/engines/base-engine.ts`

