# Worker Module - Document Processing System

> **Last Updated**: January 29, 2025  
> **Architecture**: Single Responsibility Principle

## Overview

The worker module is a standalone Node.js service that processes documents asynchronously. It follows a clean architecture with clear separation between data transformation (processors) and I/O operations (handlers).

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
├── processors/           # Document format processors (data transformation only)
│   ├── base.ts         # Abstract base class with shared utilities
│   ├── pdf-processor.ts # PDF document processing
│   ├── youtube-processor.ts # YouTube transcript processing
│   ├── web-processor.ts # Web article extraction
│   ├── markdown-asis-processor.ts # Markdown preservation
│   ├── markdown-clean-processor.ts # Markdown AI cleaning
│   ├── text-processor.ts # Plain text formatting
│   └── paste-processor.ts # Direct paste processing
├── handlers/            # Job orchestration and I/O operations
│   └── process-document.ts # Main document processing handler
├── engines/            # Collision detection engines
│   ├── semantic-similarity.ts # Embedding-based similarity
│   ├── conceptual-density.ts # Concept clustering
│   ├── structural-pattern.ts # Document structure matching
│   ├── citation-network.ts # Reference graph analysis
│   ├── temporal-proximity.ts # Time-based clustering
│   ├── contradiction-detection.ts # Opposing viewpoints
│   └── emotional-resonance.ts # Emotional patterns
├── lib/                # Shared utilities and services
│   ├── ai-clients.ts  # AI service clients (Gemini, embeddings)
│   ├── cache.ts       # Caching layer
│   ├── monitoring.ts  # Performance monitoring
│   └── weight-config.ts # User preference weights
└── index.ts           # Worker entry point

```

## Processing Flow

### 1. Job Pickup
```typescript
// Background job created by main app
{
  job_type: 'process-document',
  input_data: { document_id, source_type }
}
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