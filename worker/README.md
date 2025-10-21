# Worker Module - Document Processing System

> **Last Updated**: February 13, 2025
> **Architecture**: Single Responsibility Principle + Clean Architecture

## Overview

The worker module is a standalone Node.js service that processes documents asynchronously with **3-engine collision detection** for discovering connections between ideas. It follows clean architecture with clear separation between data transformation (processors), I/O operations (handlers), and connection detection (engines).

**Key Capabilities**:
- **10 Job Types**: Document processing, connection detection, exports, imports, integrations
- **8 Document Formats**: PDF, EPUB, YouTube, Web, Markdown, Text, Paste, Readwise
- **3 Detection Engines**: Semantic Similarity (25%), Contradiction (40%), Thematic Bridge (35%)
- **Local or Cloud**: 100% local processing (Ollama + Docling) OR cloud (Gemini)
- **Pause & Resume**: Checkpoint-based resumption with SHA-256 validation
- **39 CLI Scripts**: Testing, debugging, validation, import/export utilities

## Architecture Principles

### Single Responsibility Principle

Each component has exactly one responsibility:

- **Processors**: Transform data only (no I/O)
- **Handlers**: Orchestrate I/O operations (storage, database, embeddings)
- **Engines**: Detect connections between chunks
- **Library**: Utility functions and shared services

## Directory Structure

```
worker/
├── processors/           [10 files] Document format processors (data transformation only)
│   ├── base.ts          # Abstract base class (SourceProcessor)
│   ├── router.ts        # Routes by source_type
│   ├── pdf-processor.ts # PDF via Docling/Gemini
│   ├── epub-processor.ts # EPUB ebooks
│   ├── youtube-processor.ts # YouTube transcripts
│   ├── web-processor.ts # Web articles (Jina AI)
│   ├── markdown-processor.ts # Markdown (as-is or AI-cleaned)
│   ├── text-processor.ts # Plain text formatting
│   └── paste-processor.ts # Direct paste input
├── handlers/            [11 files] Job orchestration and I/O operations
│   ├── process-document.ts # Main document processing pipeline
│   ├── detect-connections.ts # Run 3-engine collision detection
│   ├── reprocess-document.ts # Full reprocessing with rollback
│   ├── reprocess-connections.ts # Regenerate connections only
│   ├── recover-annotations.ts # Fuzzy-match annotations after edits
│   ├── remap-connections.ts # Update cross-doc connections
│   ├── obsidian-sync.ts # Bidirectional Obsidian vault sync
│   ├── readwise-import.ts # Import Readwise highlights
│   ├── export-document.ts # Create portable ZIP exports
│   ├── import-document.ts # Import from ZIP with conflict resolution
│   └── continue-processing.ts # Resume from checkpoint after failure
├── engines/             [8 files] 3-engine collision detection system
│   ├── orchestrator.ts  # Coordinates all 3 engines
│   ├── semantic-similarity.ts # Embedding cosine distance (25%)
│   ├── contradiction-detection.ts # Metadata-based tensions (40%)
│   ├── thematic-bridge.ts # AI concept mapping via Gemini (35%)
│   ├── thematic-bridge-qwen.ts # Local Ollama version
│   ├── base-engine.ts   # Abstract base class
│   ├── scoring.ts       # Confidence calculation
│   └── types.ts         # Interface definitions
├── lib/                 [29+ files] Core utilities and services
│   ├── ai-client.ts     # Gemini API client
│   ├── embeddings.ts    # Embedding generation (cloud)
│   ├── storage-helpers.ts # Supabase Storage operations
│   ├── fuzzy-matching.ts # 4-tier annotation recovery
│   ├── weight-config.ts # Engine weight configuration
│   ├── retry-manager.ts # Error classification & retry
│   ├── performance-monitor.ts # Metrics collection
│   ├── chunking/        [7 files] Semantic chunking pipeline
│   ├── epub/            [4 files] EPUB-specific parsing
│   ├── local/           [5 files] Local processing (Ollama + HuggingFace)
│   ├── prompts/         [1 file] AI prompt templates
│   └── validation/      [1 file] Metadata schema validation (Zod)
├── jobs/                [1 file] Periodic cron jobs
│   └── export-annotations.ts # Hourly annotation export to Storage
├── types/               [10 files] TypeScript definitions
│   ├── processor.ts     # ProcessResult, ProcessedChunk
│   ├── metadata.ts      # 8 metadata types
│   ├── multi-format.ts  # SourceType, format interfaces
│   ├── database.ts      # Database schema types
│   ├── chunking.ts      # ChunkingStrategy, ChunkingConfig
│   ├── job-schemas.ts   # Zod schemas for job validation
│   └── ...
├── scripts/             [39 files] CLI utilities for testing & debugging
│   ├── test-*.ts        # Integration tests (local pipeline, PDF, EPUB, etc.)
│   ├── validate-*.ts    # Validation utilities (metadata, matching, etc.)
│   ├── check-*.ts       # Inspection tools (documents, chunks, connections)
│   ├── import-*.ts      # Import utilities (Readwise, etc.)
│   └── ...
├── tests/               Integration test suites
├── __tests__/           [8 files] Unit tests
├── benchmarks/          [4 files] Performance benchmarks
└── index.ts             # Worker entry point + job handlers

```

## Processing Flow

### 1. Worker Loop & Job Pickup

The worker runs continuously, checking for jobs every 5 seconds and processing them sequentially:

```typescript
// index.ts - Main worker loop
while (!isShuttingDown) {
  await processNextJob()  // Fetch and process 1 job
  await retryLoop()       // Check for retry-eligible jobs every 30s
  await sleep(5000)       // 5-second polling interval
}
```

**Job Selection Priority**:
1. **Pending** jobs (status: 'pending')
2. **Failed** jobs ready for retry (next_retry_at < now)
3. **Stale** processing jobs (started >30 minutes ago, no heartbeat)

### 2. Job Types & Handlers

The worker supports **10 job types**, each mapped to a specific handler:

| Job Type | Handler | Purpose |
|----------|---------|---------|
| `process_document` | `processDocumentHandler` | Full document processing pipeline |
| `detect_connections` | `detectConnectionsHandler` | Run 3-engine collision detection |
| `reprocess_document` | `reprocessDocument` | Full reprocessing with annotation recovery |
| `reprocess_connections` | `reprocessConnectionsHandler` | Regenerate connections only (Smart Mode) |
| `import_document` | `importDocumentHandler` | Import from ZIP with conflict resolution |
| `export_documents` | `exportDocumentHandler` | Create portable ZIP exports |
| `obsidian_export` | `exportToObsidian` | Export markdown to Obsidian vault |
| `obsidian_sync` | `syncFromObsidian` | Import edited markdown from vault |
| `readwise_import` | `importReadwiseHighlights` | Import Readwise highlights |
| `continue_processing` | `continueProcessing` | Resume from checkpoint after pause |

**Job Creation Example**:
```typescript
// Main app creates background job
const { data: job } = await supabase
  .from('background_jobs')
  .insert({
    job_type: 'process_document',
    input_data: { documentId, sourceType },
    status: 'pending',
    user_id: userId
  })
```

### 3. Document Processing Pipeline

The `processDocumentHandler` orchestrates the complete document processing flow:

```typescript
// handlers/process-document.ts
async function processDocumentHandler(supabase, job) {
  const { documentId, sourceType } = job.input_data

  // Stage 1: Route to appropriate processor
  const processor = ProcessorRouter.getProcessor(sourceType)

  // Stage 2: Processor transforms data (NO I/O)
  const result = await processor.process()
  // Returns: { markdown, chunks, metadata, wordCount, outline }

  // Stage 3: Handler performs all I/O operations
  await storage.upload(`${documentId}/content.md`, result.markdown)
  await supabase.from('documents').update({
    title: result.metadata.title,
    word_count: result.wordCount,
    markdown_available: true
  })

  // Stage 4: Generate embeddings (local or cloud)
  const chunksWithEmbeddings = await embeddings.generate(result.chunks)

  // Stage 5: Save chunks to database
  await supabase.from('chunks').insert(chunksWithEmbeddings)
  await supabase.from('documents').update({ embeddings_available: true })

  // Stage 6: Run 3-engine collision detection
  await orchestrator.processDocument(documentId, {
    enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
  })
}
```

**Progress Tracking**: Each stage reports progress to UI via job.progress updates (0-100%)

### 4. Processor Pattern

All processors extend `SourceProcessor` base class and ONLY transform data:

```typescript
// processors/pdf-processor.ts
export class PDFProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    // Download from Storage
    const blob = await this.downloadBlob()

    // Extract via Docling (local) or Gemini (cloud)
    const extracted = await this.extractPDF(blob)

    // Convert to clean markdown
    const markdown = await this.toMarkdown(extracted)

    // Create semantic chunks (via Chonkie)
    const chunks = await this.createChunks(markdown)

    // Extract metadata (title, author, dates, etc.)
    const metadata = await this.extractMetadata(markdown, extracted)

    // Return transformed data (NO storage/DB operations)
    return {
      markdown,
      chunks,      // ProcessedChunk[] with text, metadata, order
      metadata,    // DocumentMetadata
      wordCount: this.countWords(markdown),
      outline: this.generateOutline(markdown)  // Optional
    }
  }
}
```

**Key Rules**:
- ✅ Processors transform data only
- ✅ May call external APIs (Gemini, YouTube, Jina)
- ❌ Never write to Storage or Database
- ❌ Never update document flags
- ✅ Return standardized `ProcessResult` interface

### 5. Data Flow

```
Upload → Processor → ProcessResult → Handler → [Storage + Database + Embeddings] → 3-Engine Detection → Connections
```

**Detailed Flow**:
1. User uploads document → Stored in Supabase Storage
2. Background job created → Worker picks it up
3. Processor extracts → Returns ProcessResult (markdown + chunks)
4. Handler saves → Markdown to Storage, chunks to Database
5. Embeddings generated → Added to chunks (local or cloud)
6. 3-Engine Detection → Discovers connections between chunks
7. Connections saved → Database with confidence scores
8. Document marked complete → Appears in reader

### 6. 3-Engine Collision Detection System

The **orchestrator** coordinates 3 specialized engines to discover connections:

```typescript
// engines/orchestrator.ts
export async function processDocument(documentId: string, config: OrchestratorConfig) {
  const connections: ChunkConnection[] = []

  // Engine 1: Semantic Similarity (25% weight)
  // Fast, embedding-based, finds "says same thing"
  if (enabledEngines.includes('semantic_similarity')) {
    const semantic = await runSemanticSimilarity(documentId, {
      similarityThreshold: 0.82,  // Cosine similarity cutoff
      maxConnectionsPerChunk: 10  // Aggressive filtering
    })
    connections.push(...semantic)
  }

  // Engine 2: Contradiction Detection (40% weight)
  // Metadata-based, finds conceptual tensions
  if (enabledEngines.includes('contradiction_detection')) {
    const contradictions = await runContradictionDetection(documentId, {
      minOpposition: 0.6,  // Require strong opposition
      conceptOverlap: 0.3  // Must share some concepts
    })
    connections.push(...contradictions)
  }

  // Engine 3: Thematic Bridge (35% weight)
  // AI-powered, cross-domain concept mapping
  if (enabledEngines.includes('thematic_bridge')) {
    // Use Qwen (local) or Gemini (cloud)
    const useLocal = process.env.PROCESSING_MODE === 'local'
    const thematic = useLocal
      ? await runThematicBridgeQwen(documentId, config)
      : await runThematicBridge(documentId, config)
    connections.push(...thematic)
  }

  // Save all connections to database
  await saveChunkConnections(connections)

  return { totalConnections: connections.length, byEngine }
}
```

**Engine Characteristics**:

| Engine | Algorithm | Speed | Finds | Weight |
|--------|-----------|-------|-------|--------|
| **Semantic Similarity** | pgvector cosine distance | Fast (~5s) | Similar ideas, related concepts | 25% |
| **Contradiction Detection** | Metadata opposition score | Fast (~3s) | Opposing views, tensions | 40% |
| **Thematic Bridge** | LLM concept mapping | Slow (~30s) | Cross-domain bridges, analogies | 35% |

**Connection Filtering**: Aggressive filtering keeps AI calls <300 per document
- Semantic: Top 10 per chunk, similarity >0.82
- Contradiction: Min opposition 0.6, concept overlap >0.3
- Thematic: Batch processing, cache shared concepts

## Key Components

### ProcessResult Interface
```typescript
interface ProcessResult {
  markdown: string          // Clean markdown content
  chunks: ProcessedChunk[]  // Semantic chunks for embedding
  metadata: DocumentMetadata // Title, author, dates, etc.
  wordCount?: number        // Total word count
  outline?: OutlineSection[] // Document structure
}
```

### ProcessedChunk Interface
```typescript
interface ProcessedChunk {
  text: string             // Chunk content
  metadata: ChunkMetadata  // Position, type, context
  order_index: number      // Sequence in document
  heading?: string         // Associated heading
}
```

## Supported Document Types

| Source Type | Processor | Extraction Method | Description |
|-------------|-----------|-------------------|-------------|
| `pdf` | PDFProcessor | Docling (local) or Gemini Files API (cloud) | Academic papers, books, reports |
| `epub` | EPUBProcessor | HTML-to-Markdown conversion | Ebooks with chapter structure |
| `youtube` | YouTubeProcessor | YouTube Transcript API | Video transcripts with timestamps |
| `web_url` | WebProcessor | Jina AI Reader API | News articles, blog posts |
| `markdown` | MarkdownProcessor | Direct processing | Raw markdown (as-is or AI-cleaned) |
| `txt` | TextProcessor | Simple text processing | Plain text files |
| `paste` | PasteProcessor | Direct input | Copy-pasted text |
| `readwise` | (via import handler) | Readwise Export JSON | Highlights with fuzzy matching |

**Processing Modes**:
- **Local** (`PROCESSING_MODE=local`): Docling + Ollama + HuggingFace embeddings (zero cost)
- **Cloud** (`PROCESSING_MODE=cloud`): Gemini 2.0 Flash + Google AI embeddings (fast, costs $0.20-0.60/book)

**Markdown Modes** (controlled by `clean_with_ai` flag):
- **As-Is**: Preserve original markdown structure
- **AI-Cleaned**: Gemini enhances formatting, fixes headers, improves structure

## Database Flags

The handler sets these flags after successful processing:

- `markdown_available`: Markdown saved to storage
- `embeddings_available`: Chunks with embeddings in database

Both must be `true` for documents to appear in the reader.

## Error Handling & Retry System

### Error Classification (4 Types)

The worker classifies errors into **4 categories** for intelligent retry logic:

```typescript
// lib/retry-manager.ts
export type ErrorType = 'transient' | 'rate_limit' | 'resource' | 'permanent'

function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase()

  // Rate limit errors → backoff 5-30 minutes
  if (message.includes('rate limit') || message.includes('quota exceeded')) {
    return 'rate_limit'
  }

  // Resource errors (OOM, timeout) → retry with degraded settings
  if (message.includes('out of memory') || message.includes('timeout')) {
    return 'resource'
  }

  // Network errors, server issues → retry immediately
  if (message.includes('network') || message.includes('ECONNREFUSED')) {
    return 'transient'
  }

  // All others → permanent (don't retry)
  return 'permanent'
}
```

### Retry Strategy

| Error Type | Max Retries | Backoff | Action |
|------------|-------------|---------|--------|
| `transient` | 5 | Exponential (30s, 1m, 2m, 4m, 8m) | Retry with same settings |
| `rate_limit` | 3 | Fixed (5m, 15m, 30m) | Wait for rate limit reset |
| `resource` | 3 | Exponential (2m, 5m, 10m) | Retry with reduced settings |
| `permanent` | 0 | None | Mark failed, notify user |

### Automatic Retry Loop

The worker checks for retry-eligible jobs every 30 seconds:

```typescript
// Runs in main loop
async function retryLoop(supabase) {
  // Find failed jobs ready for retry
  const jobs = await supabase
    .from('background_jobs')
    .select('*')
    .eq('status', 'failed')
    .lte('next_retry_at', 'now()')
    .lt('retry_count', 5)

  for (const job of jobs) {
    // Reset to pending → worker will pick it up
    await supabase
      .from('background_jobs')
      .update({ status: 'pending' })
      .eq('id', job.id)
  }
}
```

### Pause & Resume System (Migration 052)

Long-running jobs can be **paused** and **resumed** from checkpoints:

```typescript
// During processing, save checkpoints
await saveCheckpoint(documentId, {
  stage: 'chunking',
  chunkProgress: 234,
  totalChunks: 500,
  intermediateData: { ... },
  checksum: sha256(intermediateData)  // Validate on resume
})

// User pauses job via UI
await supabase
  .from('background_jobs')
  .update({ status: 'paused' })
  .eq('id', jobId)

// Resume from last checkpoint
const checkpoint = await loadCheckpoint(documentId)
if (checkpoint && checkpoint.checksum === sha256(data)) {
  // Resume from saved progress
  await continueProcessing(documentId, checkpoint.stage)
} else {
  // Checksum mismatch → restart from beginning
  console.warn('Checkpoint invalid, restarting')
}
```

**Benefits**:
- Pause expensive AI processing to save costs
- Resume after system restarts or crashes
- SHA-256 validation prevents corrupted state
- UI shows "Paused at Chunk 234 of 500"

### User-Friendly Error Messages

```typescript
// lib/errors.ts
function getUserFriendlyError(error: Error): string {
  // Technical: "ECONNREFUSED at pdf-processor.ts:45"
  // User-friendly: "Unable to connect to processing server. Please try again."

  const friendly = {
    'out of memory': 'Document too large. Try a smaller file or local processing mode.',
    'rate limit exceeded': 'API quota reached. Processing will resume automatically in a few minutes.',
    'invalid pdf': 'PDF file is corrupted or password-protected.',
    'timeout': 'Processing took too long. Try enabling local processing mode.'
  }

  return friendly[error.type] || 'An unexpected error occurred. Please try again.'
}
```

## Testing

### NPM Test Scripts

```bash
# Unit Tests
npm test                          # Run all unit tests (__tests__/)
npm run test:watch                # Watch mode for development

# Integration Tests
npm run test:integration          # Full integration test suite
npm run test:full-validation      # Comprehensive validation (run before commits)

# Metadata Validation
npm run validate:metadata         # Validate metadata extraction (mock mode)
npm run validate:metadata:real    # Real API calls (costs ~$0.05)
npm run validate:ai-metadata      # AI-powered metadata quality checks

# Specialized Tests
npm run test:orchestrator         # Test 3-engine orchestration
npm run test:semantic             # Semantic similarity engine only
npm run test:contradiction        # Contradiction detection only
npm run test:local-pipeline       # Local processing (Docling + Ollama)
npm run test:recovery             # Annotation recovery system

# Benchmarks
npm run benchmark:orchestration   # Engine performance benchmarks
npm run benchmark:annotation-recovery  # Fuzzy matching performance
```

### Manual Testing with Scripts

The `scripts/` directory contains **39 CLI utilities** for testing and debugging:

```bash
# Document Processing Tests
npx tsx scripts/test-local-pipeline.ts              # Test full local pipeline
npx tsx scripts/test-pdf-storage-integration.ts     # PDF processing end-to-end
npx tsx scripts/test-epub-storage-integration.ts    # EPUB processing end-to-end
npx tsx scripts/test-metadata-transfer.ts           # Metadata preservation

# Connection Testing
npx tsx scripts/test-remap-connections.ts           # Connection remapping logic
npx tsx scripts/verify-remap-connections.ts         # Verify remapping results
npx tsx scripts/debug-connection-data.ts <doc_id>   # Inspect connection state

# Annotation & Recovery
npx tsx scripts/validate-chunk-matching.ts          # Fuzzy matching accuracy
npx tsx scripts/test-readwise-export-import.ts      # Readwise workflow

# Database Operations
npx tsx scripts/check-documents.ts                  # List all documents
npx tsx scripts/check-chunk-status.ts <doc_id>      # Verify chunk data
npx tsx scripts/check-verified-connections.ts       # Review verified connections
npx tsx scripts/restore-chunks.ts <doc_id>          # Recover from storage backup

# Import/Export
npx tsx scripts/import-readwise.ts <file.json>      # Import Readwise highlights
npx tsx scripts/validate-storage-export.ts          # Validate export integrity

# Maintenance
npx tsx scripts/fix-document-status.ts <doc_id>     # Repair document flags
npx tsx scripts/reprocess-cli.ts <doc_id>           # Reprocess from CLI
npx tsx scripts/list-testable-documents.ts          # Find test candidates
```

### Integration Test Structure

```
tests/
├── integration/
│   ├── validate-orchestrator.ts    # 7-phase validation
│   │   └── Phases: Setup → Process → Chunks → Metadata → Engines → Connections → Cleanup
│   ├── test-semantic-engine.ts     # Semantic similarity tests
│   ├── test-contradiction-engine.ts # Contradiction detection tests
│   └── test-processor-integration.ts # Processor pipeline tests
└── fixtures/
    ├── test-documents/              # Real document samples
    ├── expected-outputs/            # Known-good outputs
    └── readwise-exports/            # Readwise test data
```

### Test Philosophy

**Test based on replaceability, not coverage**:
- **Annotations** (manual work) → Test exhaustively ✅
- **Documents** (source files) → Test preservation ✅
- **Chunks** (cost $0.20) → Test critical algorithms ✅
- **Connections** (auto-generated) → Light testing ⚡

**Real Fixtures Required**:
- Use actual processed chunks, not Lorem Ipsum
- Test with real document structure (headings, lists, tables)
- Validate against known-good outputs

### Critical Tests (Must Pass)

Run before every commit:
```bash
npm run test:critical
npm run test:full-validation
```

**Critical Test Categories**:
1. ✅ Annotation recovery (>90% success rate)
2. ✅ Chunk metadata preservation (100% accuracy)
3. ✅ Connection deduplication (zero duplicates)
4. ✅ Processor output validation (all fields present)
5. ✅ Error classification (correct retry strategy)

## Performance Targets

**Document Processing** (M1 Max 64GB, Local Mode):
- Small PDF (<50 pages): 3-5 minutes
- Medium PDF (~200 pages): 15-25 minutes
- Large PDF (500 pages): 60-80 minutes
- EPUB ebook: 5-10 minutes (depends on images)
- YouTube (1 hour): 60-90 seconds
- Web article: 20-30 seconds

**Chunking Strategies** (Speed vs Quality):
| Strategy | Small | Medium | Large | Quality |
|----------|-------|--------|-------|---------|
| Token | 2-3 min | 8-12 min | 30-40 min | Basic |
| Sentence | 3-4 min | 10-15 min | 35-50 min | Good |
| **Recursive** ⭐ | 3-5 min | 15-25 min | 60-80 min | High |
| Semantic | 8-15 min | 30-45 min | 120-180 min | Very High |
| Late Chunking | 10-20 min | 40-60 min | 150-200 min | Very High |

**Connection Detection** (per engine):
- Semantic Similarity: ~5 seconds (pgvector query)
- Contradiction Detection: ~3 seconds (metadata query)
- Thematic Bridge: ~30 seconds (AI analysis)
- **Total**: ~40-60 seconds for 3 engines

**Cost Targets** (Cloud Mode):
- Small document: $0.10-0.20
- Medium document: $0.30-0.50
- Large document: $0.50-0.80
- **Local Mode**: $0.00 (zero cost)

## Development

### Running Locally

```bash
# Install dependencies
npm install

# Start worker in development mode
npm run dev

# Build for production
npm run build

# Start production worker
npm start

# Check worker status
ps aux | grep "node.*worker"

# View worker logs
tail -f worker.log
```

### Environment Variables

```bash
# worker/.env (or parent .env.local)

# === Required: Supabase ===
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>

# === Cloud Processing Mode (Optional) ===
PROCESSING_MODE=cloud              # or 'local' for zero-cost processing
GOOGLE_AI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-2.5-flash      # or gemini-2.0-flash-lite

# === Local Processing Mode (Optional) ===
PROCESSING_MODE=local
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M
OLLAMA_TIMEOUT=600000              # 10 minutes

# === Python Environment (for Docling) ===
PYTHON_PATH=/opt/homebrew/bin/python3  # or your Python 3.10+ path

# === Optional: Advanced Settings ===
MAX_CONCURRENT_JOBS=1              # Process one job at a time
HEARTBEAT_INTERVAL=300000          # 5 minutes (prevents stale job detection)
RETRY_BASE_DELAY=30000             # 30 seconds initial retry delay
MAX_RETRIES=5                      # Max retry attempts per job
```

### Local Processing Mode Setup

For **100% local, zero-cost** processing:

```bash
# 1. Install Ollama (if not installed)
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull Qwen model (32B recommended, 7B also works)
ollama pull qwen2.5:32b-instruct-q4_K_M
# Alternative: ollama pull qwen2.5:7b-instruct-q4_K_M

# 3. Verify Ollama is running
curl http://127.0.0.1:11434/api/version
# Should return: {"version":"0.x.x"}

# 4. Install Python dependencies (for Docling)
pip install docling transformers sentence-transformers torch

# 5. Set environment variables
export PROCESSING_MODE=local
export OLLAMA_HOST=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M

# 6. Test local pipeline
npx tsx scripts/test-local-pipeline.ts
```

**Local Mode Benefits**:
- ✅ Zero API costs ($0.00 per document)
- ✅ Complete privacy (no data leaves your machine)
- ✅ No rate limits
- ✅ Works offline
- ⚠️ Slower than cloud (2-3x processing time)
- ⚠️ Requires 16GB+ RAM for Qwen 32B

**Local Mode Components**:
- **Docling**: PDF/EPUB extraction with HybridChunker
- **Ollama + Qwen**: Local LLM for cleanup and metadata
- **HuggingFace Transformers**: Local embeddings (768d vectors)
- **Chonkie**: 9 chunking strategies (all work locally)

## Common Issues

### Documents Not Appearing in Reader
1. Check `markdown_available` flag in database
   ```sql
   SELECT id, title, markdown_available, embeddings_available FROM documents WHERE id = '<doc_id>';
   ```
2. Check `embeddings_available` flag in database (both must be `true`)
3. Verify markdown exists in Storage: `<user_id>/<doc_id>/content.md`
4. Check chunks table for embeddings:
   ```sql
   SELECT COUNT(*), AVG(array_length(embedding, 1)) FROM chunks WHERE document_id = '<doc_id>';
   ```

### Processing Failures
1. **Check worker logs**: `tail -f worker/worker.log`
2. **Verify API keys are set**:
   ```bash
   echo $GOOGLE_AI_API_KEY  # Should not be empty
   ```
3. **Check rate limits**: Look for "rate limit exceeded" in logs
4. **Review error classification**: Failed jobs show error type in `background_jobs.last_error`
5. **Check Ollama status** (if local mode):
   ```bash
   curl http://127.0.0.1:11434/api/version
   ```

### Slow Processing
1. **Check processing mode**: Local is 2-3x slower than cloud
2. **Review chunking strategy**: Semantic/Late are slower but higher quality
3. **Monitor memory usage**: Large PDFs (500+ pages) may need 8GB+ RAM
4. **Check for stuck jobs**: Jobs stuck >30 minutes are reset automatically

### Connection Detection Issues
1. **No connections found**: Check if document has embeddings
   ```sql
   SELECT COUNT(*) FROM chunks WHERE document_id = '<doc_id>' AND embedding IS NOT NULL;
   ```
2. **Too many connections**: Adjust engine weights in Settings → Tune
3. **Duplicate connections**: Shouldn't happen (orchestrator deduplicates), report if found

### Annotation Recovery Failures
1. **Low recovery rate (<80%)**: Document likely heavily edited
   - Check `recovery_results.json` in Storage for details
   - Review `import_pending` table for fuzzy matches
2. **Checksum validation failed**: Resume checkpoint is corrupted
   - Job will restart from beginning automatically

---

## Advanced Features

### Annotation Recovery System

When documents are reprocessed (after Obsidian edits, chunking strategy changes, etc.), user annotations must be recovered and mapped to new chunk positions. The recovery system uses **4-tier fuzzy matching** to achieve >90% success rates.

**4-Tier Matching Strategy**:

| Tier | Method | Speed | Confidence | Use Case |
|------|--------|-------|------------|----------|
| 1 | **Exact Match** | <1ms | 100% | Text unchanged |
| 2 | **Context-Guided Levenshtein** | ~5ms | 95% | Minor edits |
| 3 | **Chunk-Bounded Search** | ~5ms | 85-95% | Structural changes (60x faster than full-text) |
| 4 | **Trigram Fallback** | ~50ms | 70-85% | Heavy edits |

**Handler**: `handlers/recover-annotations.ts`

```typescript
export async function recoverAnnotations(
  documentId: string,
  newMarkdown: string,
  newChunks: ProcessedChunk[]
): Promise<RecoveryResults> {
  // Fetch all Position components for document
  const annotations = await ecs.query('position', { document_id: documentId })

  const results = { recovered: 0, needsReview: 0, lost: 0 }

  for (const annotation of annotations) {
    // Try 4-tier matching
    const match = await findAnnotationMatch(
      annotation.text,
      newMarkdown,
      newChunks,
      annotation.chunk_id  // Hint for chunk-bounded search
    )

    if (match.confidence >= 0.85) {
      // Auto-recover (update immediately)
      await updateAnnotationPosition(annotation.id, match)
      results.recovered++
    } else if (match.confidence >= 0.75) {
      // Flag for review
      await flagForReview(annotation.id, match)
      results.needsReview++
    } else {
      // Mark as lost (don't delete)
      await markAsLost(annotation.id)
      results.lost++
    }
  }

  return results
}
```

**Performance**:
- 20 annotations recovered in <2 seconds
- Chunk-bounded search is 60x faster than full-text
- >90% success rate on typical edits

**Integration**: Runs automatically in `reprocess-document.ts` handler
- If recovery rate >80%: Accept reprocessing
- If recovery rate <80%: Rollback and restore old chunks

### Obsidian Integration

**Bidirectional sync** with Obsidian vault for external editing workflow.

**Export to Obsidian** (`obsidian_export` job):
```typescript
export async function exportToObsidian(documentId: string, userId: string) {
  // 1. Get user's Obsidian settings (vault path)
  const settings = await getUserSettings(userId)

  // 2. Download markdown from Storage
  const markdown = await storage.download(`${userId}/${documentId}/content.md`)

  // 3. Write to vault at configured path
  const filePath = `${settings.obsidianPath}/${documentTitle}.md`
  await fs.writeFile(filePath, markdown)

  // 4. Optionally export annotations.json alongside
  if (settings.exportAnnotations) {
    await exportAnnotationsJSON(documentId, filePath)
  }

  // 5. Return obsidian:// URI for protocol handling
  return {
    success: true,
    uri: `obsidian://open?vault=${settings.vaultName}&file=${documentTitle}.md`,
    path: filePath
  }
}
```

**Sync from Obsidian** (`obsidian-sync` job):
```typescript
export async function syncFromObsidian(documentId: string, userId: string, jobId: string) {
  // 1. Read edited markdown from vault
  const settings = await getUserSettings(userId)
  const editedMarkdown = await fs.readFile(`${settings.obsidianPath}/${documentTitle}.md`)

  // 2. Compare with current version in Storage
  const currentMarkdown = await storage.download(`${userId}/${documentId}/content.md`)

  if (editedMarkdown === currentMarkdown) {
    return { success: true, changed: false }
  }

  // 3. Upload to Storage
  await storage.upload(`${userId}/${documentId}/content.md`, editedMarkdown)

  // 4. Trigger reprocessDocument() with annotation recovery
  const recovery = await reprocessDocument(documentId, supabase, jobId)

  return { success: true, changed: true, recovery }
}
```

**URI Protocol**: Uses `obsidian://advanced-uri?vault=...&filepath=...` for reliable protocol handling

### Readwise Import

Import highlights from Readwise export JSON with **fuzzy matching fallback** for texts that don't match exactly.

**Handler**: `handlers/readwise-import.ts`

```typescript
export async function importReadwiseHighlights(
  documentId: string,
  readwiseData: ReadwiseExport
): Promise<ImportResults> {
  const results = { imported: 0, needsReview: [], failed: [] }

  // Get document chunks
  const chunks = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)

  for (const highlight of readwiseData.highlights) {
    // Try exact text match first
    const exactMatch = chunks.find(c => c.content.includes(highlight.text))

    if (exactMatch) {
      // Import immediately
      await createAnnotationFromReadwise(highlight, exactMatch.id)
      results.imported++
    } else {
      // Try chunk-bounded fuzzy matching
      const fuzzyMatch = await findFuzzyMatch(highlight.text, chunks)

      if (fuzzyMatch.confidence > 0.8) {
        // Add to review queue
        await addToImportPending(highlight, fuzzyMatch)
        results.needsReview.push({ highlight, match: fuzzyMatch })
      } else {
        // Mark as failed
        results.failed.push({ highlight, reason: 'no match found' })
      }
    }
  }

  return results
}
```

**Color Mapping**: Maps Readwise colors (yellow/blue/red/green/orange) to ECS color system
**Cost**: Zero AI calls (uses local fuzzy matching only)

### Background Jobs & Cron System

The worker runs **periodic cron jobs** for maintenance tasks.

**Hourly Annotation Export** (`jobs/export-annotations.ts`):

```typescript
import cron from 'node-cron'

export function startAnnotationExportCron() {
  // Run every hour: 0 * * * *
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Starting hourly annotation export')

    // Fetch all documents with markdown_path
    const documents = await supabase
      .from('documents')
      .select('id, user_id')
      .not('markdown_path', 'is', null)

    for (const doc of documents) {
      // Get Position components for this document
      const annotations = await ecs.query('position', {
        document_id: doc.id
      })

      // Transform to portable format
      const portable = annotations.map(a => ({
        text: a.text,
        note: a.note,
        color: a.color,
        position: { start: a.startOffset, end: a.endOffset },
        created_at: a.created_at,
        recovery: a.recovery  // Include recovery metadata
      }))

      // Upload as annotations.json to Storage
      await storage.upload(
        `${doc.user_id}/${doc.id}/annotations.json`,
        JSON.stringify(portable, null, 2)
      )
    }

    console.log(`[Cron] Exported annotations for ${documents.length} documents`)
  })
}

// Started in index.ts at worker initialization
```

**Portable Format Benefits**:
- Backup annotations separately from database
- Enable Obsidian integration (annotations.json alongside markdown)
- Support future import/export workflows
- Preserve recovery metadata for debugging

---

## Architecture Decisions

### Why Separate Processors and Handlers?

1. **Single Responsibility**: Each component does one thing well
2. **Testability**: Processors can be tested without I/O mocks
3. **Maintainability**: Clear boundaries make debugging easier
4. **Scalability**: Processors can be parallelized independently
5. **Flexibility**: Easy to add new document types

### Why Not Store Markdown in Database?

1. **Size**: Markdown files can be large (>1MB)
2. **Performance**: Database queries become slow
3. **Cost**: Storage is cheaper than database rows
4. **Streaming**: Files can be streamed to client

## Library Reference

The `lib/` directory contains **29+ utility files** organized into specialized subdirectories.

### Core Services

- **ai-client.ts**: Gemini API client with caching and rate limiting
- **embeddings.ts**: Cloud embedding generation (Google AI)
- **storage-helpers.ts**: Supabase Storage operations (upload, download, list)
- **fuzzy-matching.ts**: 4-tier annotation recovery with chunk-bounded search (60x speedup)
- **weight-config.ts**: Engine weight configuration (user preferences)
- **retry-manager.ts**: 4-type error classification with exponential backoff
- **performance-monitor.ts**: Metrics collection and logging

### Chunking (`lib/chunking/`)

- **chonkie-ipc.ts**: Python IPC bridge for Chonkie library
- **bulletproof-matcher.ts**: 5-layer character offset validation (100% accuracy)
- **metadata-transfer.ts**: Docling → Chonkie metadata preservation
- **validate-overlap.ts**: Chunk overlap quality checks (70-90% expected)

### Local Processing (`lib/local/`)

- **ollama-client.ts**: Ollama LLM client (Qwen integration)
- **embeddings-local.ts**: HuggingFace Transformers.js embeddings (768d)
- **OOMError**: Custom error for out-of-memory fallback

### EPUB Support (`lib/epub/`)

- **epub-parser.ts**: EPUB extraction with chapter structure
- **epub-cleaner.ts**: Cleanup and markdown conversion
- **html-to-markdown.ts**: HTML to markdown transformation
- **type-inference.ts**: Content type detection

---

## Summary

The worker module is a **production-ready** document processing system with:

✅ **10 Job Types**: Full document lifecycle (process, detect, reprocess, import, export, sync)
✅ **8 Input Formats**: PDF, EPUB, YouTube, Web, Markdown, Text, Paste, Readwise
✅ **3 Detection Engines**: Semantic (25%), Contradiction (40%), Thematic (35%)
✅ **Local or Cloud**: Zero-cost local processing OR fast cloud processing
✅ **Pause & Resume**: Checkpoint-based resumption with SHA-256 validation
✅ **Annotation Recovery**: 4-tier fuzzy matching (>90% success rate in <2s)
✅ **Error Handling**: 4-type classification with intelligent retry
✅ **39 CLI Scripts**: Comprehensive testing and debugging utilities
✅ **Hourly Cron**: Automatic annotation backup to Storage

**Processing Modes**:
- **Cloud** (`PROCESSING_MODE=cloud`): Gemini 2.0 Flash, fast, $0.20-0.60/book
- **Local** (`PROCESSING_MODE=local`): Docling + Ollama + HuggingFace, slow, $0.00/book

**Architecture Strengths**:
- Clean separation of concerns (processors, handlers, engines)
- Transaction-safe reprocessing with rollback
- Comprehensive test coverage (unit + integration + benchmarks)
- Real-time progress tracking for UI
- Graceful error recovery and degradation

---

## Future Enhancements

**Processing**:
- [ ] Parallel chunk processing for large documents (3-5x speedup potential)
- [ ] Incremental processing for document updates (avoid full reprocessing)
- [ ] OCR for scanned PDFs (via Tesseract or cloud services)
- [ ] Audio transcription for podcasts (via Whisper or AssemblyAI)

**Connection Detection**:
- [ ] User feedback loop for engine tuning (learn from verified/rejected connections)
- [ ] Cross-language connections (detect similar ideas across languages)
- [ ] Temporal analysis (track idea evolution across time)

**Import/Export**:
- [ ] Notion import support
- [ ] Zotero integration
- [ ] Apple Books highlights import
- [ ] Kindle highlights import

---

## Contributing

When adding new processors:

1. Extend `SourceProcessor` base class (not `BaseProcessor`)
2. Implement `process()` method returning `ProcessResult`
3. NO storage/database operations in processor (data transformation only)
4. Add entry to `ProcessorRouter.getProcessor()` with source type
5. Add tests to `tests/` directory with real fixtures
6. Update this README with new source type in table
7. Run `npm run test:full-validation` before committing

When adding new handlers:

1. Create handler in `handlers/` directory
2. Add to `JOB_HANDLERS` map in `index.ts`
3. Define Zod schema in `types/job-schemas.ts` for output validation
4. Implement progress tracking via job.progress updates
5. Add error classification logic (transient vs permanent)
6. Document in this README under "Job Types & Handlers"

When adding new engines:

1. Extend `BaseEngine` class (if needed)
2. Implement connection detection algorithm
3. Add to orchestrator in `engines/orchestrator.ts`
4. Define default weight (must sum to 100% across all engines)
5. Add performance benchmarks
6. Document algorithm, speed, and use cases

---

## Support & Troubleshooting

**Logs**:
```bash
# Worker logs
tail -f worker/worker.log

# Database queries (psql)
psql -h localhost -p 54322 -U postgres -d postgres

# Storage inspection
ls -la ~/Library/Application\ Support/supabase/storage/
```

**Common Commands**:
```bash
# Check worker status
ps aux | grep "node.*worker"

# Restart worker
pkill -f "node.*worker" && npm run dev

# Check database flags
psql -c "SELECT id, title, markdown_available, embeddings_available FROM documents;"

# Check job queue
psql -c "SELECT id, job_type, status, last_error FROM background_jobs ORDER BY created_at DESC LIMIT 10;"
```

**Getting Help**:
1. Check this README for answers
2. Review worker logs for errors (`tail -f worker.log`)
3. Check database state (document flags, job status)
4. Run diagnostic scripts (`scripts/check-*.ts`)
5. Review error classification in `background_jobs.last_error`

---

*This module enforces clean architecture principles: **Processors transform data, Handlers orchestrate I/O, Engines detect connections**.*