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
| `detect-connections` | `detectConnectionsHandler` | Run 3-engine collision detection |
| `reprocess-document` | `reprocessDocument` | Full reprocessing with annotation recovery |
| `reprocess_connections` | `reprocessConnectionsHandler` | Regenerate connections only (Smart Mode) |
| `import_document` | `importDocumentHandler` | Import from ZIP with conflict resolution |
| `export_documents` | `exportDocumentHandler` | Create portable ZIP exports |
| `obsidian-export` | `exportToObsidian` | Export markdown to Obsidian vault |
| `obsidian-sync` | `syncFromObsidian` | Import edited markdown from vault |
| `readwise-import` | `importReadwiseHighlights` | Import Readwise highlights |
| `continue-processing` | `continueProcessing` | Resume from checkpoint after pause |

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

### 2. Handler Orchestration
The handler (`process-document.ts`) orchestrates the entire flow:

```typescript
async function processDocument(job) {
  // 1. Route to appropriate processor
  const processor = getProcessor(source_type)
  
  // 2. Transform data (no I/O in processor)
  const result = await processor.process()
  
  // 3. Handler performs all I/O operations
  await saveMarkdownToStorage(result.markdown)
  await generateEmbeddings(result.chunks)
  await saveChunksToDatabase(chunks)
  await updateDocumentFlags(true, true)
}
```

### 3. Processor Pattern
Processors ONLY transform data:

```typescript
class PDFProcessor extends BaseProcessor {
  async process(): Promise<ProcessResult> {
    // Extract text from PDF
    const text = await this.extractText()
    
    // Convert to markdown
    const markdown = await this.convertToMarkdown(text)
    
    // Create semantic chunks
    const chunks = await this.createChunks(markdown)
    
    // Return transformed data (NO storage/DB operations)
    return { markdown, chunks, metadata }
  }
}
```

### 4. Data Flow
```
Document → Processor → ProcessResult → Handler → Storage/DB
```

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

| Source Type | Processor | Description |
|-------------|-----------|-------------|
| `pdf` | PDFProcessor | Academic papers, books, reports |
| `youtube` | YouTubeProcessor | Video transcripts with timestamps |
| `web_url` | WebProcessor | News articles, blog posts |
| `markdown_asis` | MarkdownAsIsProcessor | Preserve original markdown |
| `markdown_clean` | MarkdownCleanProcessor | AI-enhanced markdown |
| `txt` | TextProcessor | Plain text formatting |
| `paste` | PasteProcessor | Direct text input |

## Database Flags

The handler sets these flags after successful processing:

- `markdown_available`: Markdown saved to storage
- `embeddings_available`: Chunks with embeddings in database

Both must be `true` for documents to appear in the reader.

## Error Handling

### Error Classification
```typescript
function classifyError(error): 'transient' | 'permanent' {
  // Network errors, rate limits → transient (retry)
  // Invalid format, missing content → permanent (fail)
}
```

### User-Friendly Messages
```typescript
function getUserFriendlyError(error): string {
  // Technical: "ECONNREFUSED at pdf-processor.ts:45"
  // User-friendly: "Unable to process PDF. Please try again."
}
```

## Testing

### Unit Tests
```bash
npm test                    # Run all tests
npm test pdf-processor      # Test specific processor
```

### Integration Tests
```bash
npm run test:integration    # End-to-end processing tests
```

### Manual Testing
1. Upload test file via UI
2. Monitor logs: `npm run dev`
3. Check database flags
4. Verify document in reader

## Performance Targets

- PDF (50 pages): <2 minutes
- YouTube (1 hour): <90 seconds
- Web article: <30 seconds
- Chunk generation: ~1000/minute
- Embedding generation: ~500/second

## Development

### Running Locally
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables
```bash
# Required in .env
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>
GOOGLE_AI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-2.5-flash-lite
```

## Common Issues

### Documents Not Appearing
1. Check `markdown_available` flag in database
2. Check `embeddings_available` flag in database
3. Verify markdown exists in storage
4. Check chunks table for embeddings

### Processing Failures
1. Check worker logs for errors
2. Verify API keys are set
3. Check rate limits
4. Review error classification

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

## Annotation Recovery System

### Overview

The annotation recovery system preserves user annotations when documents are edited (via Obsidian or direct edits). Uses 4-tier fuzzy matching to achieve >90% recovery rate in <2 seconds for 20 annotations.

### Handlers

#### recover-annotations.ts

Recovers annotations after document reprocessing using fuzzy matching.

**Exports:**
- `recoverAnnotations(documentId, newMarkdown, newChunks)` - Main recovery function
- `updateAnnotationPosition(annotationId, match)` - Update annotation after recovery

**Recovery Strategy:**
1. Fetch all Position components for document
2. For each annotation, try fuzzy matching
3. Classify by confidence:
   - ≥0.85: Auto-recover (update immediately)
   - 0.75-0.85: Flag for review
   - <0.75: Mark as lost (don't delete)

**Performance:** <100ms per annotation with chunk-bounded search

#### remap-connections.ts

Remaps cross-document connections after reprocessing using embedding similarity.

**Exports:**
- `remapConnections(verifiedConnections, newChunks, documentId)` - Main remapping function
- `findBestMatch(embedding, chunks)` - Embedding-based chunk matching

**Strategy:**
1. Only remap verified connections (user_validated: true)
2. Use pgvector similarity search
3. Classify by similarity:
   - Both >0.95: Auto-remap
   - Both >0.85: Flag for review
   - Otherwise: Mark as lost

#### reprocess-document.ts

Main orchestrator for document reprocessing with transaction-safe rollback.

**Exports:**
- `reprocessDocument(documentId)` - Full reprocessing pipeline

**Pipeline:**
1. Set processing_status: 'reprocessing'
2. Mark old chunks as is_current: false
3. Create new chunks with is_current: false
4. Recover annotations
5. If recovery succeeds (>80% rate):
   - Set new chunks is_current: true
   - Delete old chunks
   - Run 3-engine detection
   - Remap connections
6. If recovery fails:
   - Restore old chunks
   - Delete new chunks
   - Rollback all changes

**Safety:** Zero data loss with rollback capability

#### obsidian-sync.ts

Bidirectional sync with Obsidian vault.

**Exports:**
- `exportToObsidian(documentId, userId)` - Export markdown to vault
- `syncFromObsidian(documentId, userId)` - Import edited markdown from vault
- `getObsidianUri(vaultName, filePath)` - Generate Obsidian URI for protocol handling

**Export Flow:**
1. Get user's Obsidian settings (vault path, obsidian_path)
2. Download markdown from storage
3. Write to vault at configured path
4. Optionally export annotations.json alongside

**Sync Flow:**
1. Read edited markdown from vault
2. Compare with current version
3. If changed:
   - Upload to storage
   - Trigger reprocessDocument()
   - Return recovery results

**URI Protocol:** Uses `obsidian://advanced-uri?vault=...&filepath=...` for reliable protocol handling

#### readwise-import.ts

Import highlights from Readwise export JSON with fuzzy matching fallback.

**Exports:**
- `importReadwiseHighlights(documentId, readwiseJson)` - Main import function
- `acceptFuzzyMatch(documentId, reviewItem)` - Accept match from review queue

**Import Strategy:**
1. Try exact text match first
2. If exact fails, use chunk-bounded fuzzy matching
3. Classify by confidence:
   - Exact match: Import immediately
   - Fuzzy >0.8: Add to review queue
   - Fuzzy <0.8: Mark as failed

**Color Mapping:** Maps Readwise colors (yellow/blue/red/green/orange) to our color system

**Cost:** Zero AI calls (uses local fuzzy matching)

### Jobs (Cron)

#### export-annotations.ts

Periodic export of all annotations to portable JSON format.

**Schedule:** Every hour (`0 * * * *`)

**Exports:**
- `runAnnotationExport()` - Export all document annotations
- `startAnnotationExportCron()` - Start cron job

**Process:**
1. Fetch all documents with markdown_path
2. For each document:
   - Get Position components
   - Transform to portable format
   - Upload as `annotations.json` to storage

**Portable Format:**
```typescript
{
  text: string
  note?: string
  color?: string
  type?: string
  position: { start: number, end: number }
  pageLabel?: string
  created_at: string
  recovery?: { method: string, confidence: number }
}
```

**Purpose:**
- Backup annotations separately from database
- Enable Obsidian integration
- Support future import/export workflows

### Extended Fuzzy Matching

The `lib/fuzzy-matching.ts` file has been extended with annotation recovery functions (added ~250 lines after existing 718 lines).

**New Functions:**
- `findAnnotationMatch()` - Main 4-tier entry point
- `findWithLevenshteinContext()` - Context-guided matching
- `findNearChunkLevenshtein()` - Chunk-bounded search (50-75x faster)
- `findLevenshteinInSegment()` - Internal sliding window matcher
- `findFuzzyContext()` - Trigram-based context fallback

**4-Tier Strategy:**
1. **Exact Match**: `markdown.indexOf(text)` (100% confidence)
2. **Context-Guided**: Levenshtein with ±100 char context (95% confidence)
3. **Chunk-Bounded**: Search ±2 chunks (~12.5K chars vs 750K) (85-95% confidence)
4. **Trigram Fallback**: Existing fuzzy-matching system (70-85% confidence)

**Performance:**
- Chunk-bounded: ~5ms per annotation
- Full-text: ~300ms per annotation
- **Speedup: 60x**

### Integration with Worker

The annotation export cron is started in `index.ts`:

```typescript
import { startAnnotationExportCron } from './jobs/export-annotations.js'

async function main() {
  console.log('🚀 Background worker started')

  // Start annotation export cron job (runs hourly)
  startAnnotationExportCron()
  console.log('✅ Annotation export cron started (runs hourly)')

  // ... rest of worker loop
}
```

### Testing Recovery Handlers

**Manual Testing:**
```bash
# Test annotation recovery
npx tsx worker/handlers/recover-annotations.ts <document_id>

# Test Obsidian sync
npx tsx worker/handlers/obsidian-sync.ts <document_id>

# Test Readwise import
npx tsx worker/handlers/readwise-import.ts <document_id> <readwise.json>

# Run annotation export manually
npx tsx worker/jobs/export-annotations.ts
```

**Integration Tests:**
```bash
cd worker && npm run test:integration
```

**Performance Benchmarks:**
```bash
cd worker && npm run benchmark:annotation-recovery
```

## Future Enhancements

- [ ] Parallel chunk processing for large documents
- [ ] Incremental processing for document updates
- [ ] Language detection and translation
- [ ] OCR for scanned PDFs
- [ ] Audio transcription for podcasts

## Contributing

When adding new processors:

1. Extend `BaseProcessor` class
2. Implement `process()` method
3. Return `ProcessResult` object
4. NO storage/database operations in processor
5. Add tests for transformation logic
6. Update this README with new source type

## Support

For issues or questions:
- Check logs: `npm run dev`
- Review error messages in UI
- Check database state
- Review this documentation

---

*This module enforces clean architecture principles. Processors transform data, handlers orchestrate I/O.*