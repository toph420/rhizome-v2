# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Rhizome V2 - AI-Powered Document Processing & Knowledge Synthesis

## Project Overview

Rhizome V2 is an **AI-first document processing system** with **3-engine collision detection** for discovering connections between ideas. It transforms documents into structured knowledge through clean markdown, semantic chunking, and aggressive connection synthesis.

**This is a GREENFIELD APP, we are NOT CONCERNED ABOUT BACKWARD COMPATIBILITY!!**

**Core Vision**: Build a personal knowledge tool that actively discovers non-obvious connections across all your reading materials.

**Key Documents**:
- `docs/APP_VISION.md` - Core philosophy and vision
- `docs/USER_FLOW.md` - Core user flow
- `docs/IMPLEMENTATION_STATUS.md` - Current feature status
- `docs/ARCHITECTURE.md` - System architecture

## Project Context

This is a personal tool optimized for aggressive connection detection and knowledge synthesis. Not designed for multi-user or enterprise use. 

## Core Architecture

### 1. Multi-Format Document Processing ✅ COMPLETE
- **6 Input Methods**: PDF, YouTube, Web URLs, Markdown (as-is/clean), Text, Paste
- **AI Pipeline**: Gemini 2.0 for extraction, cleaning, and semantic analysis
- **Modular Processors**: Each format has dedicated processor with error recovery
- **YouTube Enhancement**: Transcript cleaning, fuzzy positioning for annotations

### The 3-Engine System

Dropped from 7 engines to 3. Each does something distinct:

#### 1. Semantic Similarity (Baseline)
- Fast embedding-based search
- Finds "these say the same thing"
- Uses pgvector indexes
- No AI calls, just cosine distance
- Weight: 0.25

#### 2. Contradiction Detection (Enhanced)
- Finds conceptual tensions using metadata
- Same concepts + opposite emotional polarity = tension
- "Paranoia" discussed positively vs negatively
- Uses existing metadata (concepts + polarity), no AI calls
- Falls back to syntax-based detection if metadata insufficient
- Weight: 0.40 (highest priority)

#### 3. Thematic Bridge (AI-Powered)
- Cross-domain concept matching
- "Paranoia in Gravity's Rainbow ↔ surveillance capitalism"
- Aggressive filtering: importance > 0.6, cross-document, different domains
- AI analyzes only ~200 chunk pairs per document
- Weight: 0.35

### 3. User-Configurable Weight System ✅ COMPLETE
- Database table: `user_preferences` (migration 016)
- Dynamic weight adjustment per user
- Preset configurations: balanced, academic, narrative, analytical
- Normalization methods: linear, sigmoid, softmax

### 4. ECS (Entity-Component-System) ✅ COMPLETE
- Everything is an entity with flexible components
- Located in `src/lib/ecs/ecs.ts` (singleton pattern)
- Components: flashcard, annotation, study, source

### 5. Hybrid Storage Strategy ✅ COMPLETE
- **Supabase Storage**: Large files (PDFs, markdown, exports)
- **PostgreSQL**: Chunks, embeddings (pgvector), user data
- **Never mix**: Files in DB or queryable data in Storage

## Tech Stack

```json
{
  "runtime": {
    "next": "15.x",
    "react": "19.x",
    "typescript": "5.x"
  },
  "database": {
    "@supabase/supabase-js": "^2.45.0",
    "pgvector": "0.5.1"
  },
  "ai": {
    "@google/genai": "Native Gemini SDK (document processing)",
    "ai": "^5.x + @ai-sdk/google (embeddings, future features)",
    "model": "gemini-2.5-flash (65K tokens)"
  },
  "ui": {
    "tailwindcss": "^4.0.0",
    "framer-motion": "^11.0.0",
    "@radix-ui/react-*": "latest",
    "shadcn/ui": "Primary component library"
  },
  "state": {
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^5.0.0"
  }
}
```

## Implementation Status

### ✅ COMPLETED FEATURES

#### Document Processing Pipeline
- Multi-format support (PDF, YouTube, Web, Markdown, Text, Paste)
- Gemini 2.0 integration with Files API
- Semantic chunking with metadata extraction
- YouTube transcript cleaning and fuzzy positioning
- Embeddings generation (768d vectors)
- Background job system with progress tracking
- Comprehensive error handling and recovery

#### Collision Detection System
- 3 specialized engines for connection discovery (refined from 7)
  - Semantic Similarity (embeddings-based, 25% weight)
  - Contradiction Detection (metadata-based, 40% weight)
  - Thematic Bridge (AI-powered cross-domain, 35% weight)
- Orchestrator for engine coordination
- Score normalization and ranking
- User-configurable weights
- Caching layer for performance
- Batch processing optimizations

#### Database & Storage
- 20+ migrations applied (latest: chunk-based connections, timestamp cleanup)
- ECS tables (entities, components)
- Chunks with embeddings and metadata
- User preferences for weight tuning
- Hybrid storage (files + database)
- Background jobs table
- Chunk connections table (3-engine system)

#### Worker Module
- Modular processor architecture
- Processor router by source type
- Performance monitoring
- Cache manager
- Weight configuration system
- Comprehensive test coverage (88-100%)

### 🚧 IN PROGRESS

#### Document Reader & Annotations
- [ ] Markdown renderer
- [ ] Virtual scrolling for performance
- [ ] Text selection → annotation flow
- [ ] Annotation persistence with ECS
- [ ] Right panel for connections display

### 📋 NOT STARTED

#### Study System
- [ ] Flashcard creation from selections
- [ ] FSRS spaced repetition algorithm
- [ ] Study mode interface
- [ ] Progress tracking

#### Export & Portability
- [ ] ZIP bundle generation
- [ ] Markdown + annotations export
- [ ] Import functionality

## Quick Start Guide

### Development Setup
```bash
# Install dependencies
npm install
cd worker && npm install

# Start all services
npm run dev                    # Runs ./scripts/dev.sh - starts Supabase, Edge Functions, Worker, Next.js
npm run stop                   # Runs ./scripts/stop.sh - stops all services
npm run status                 # Check service status

# Individual service control
npm run dev:next               # Next.js only (port 3000)
npm run dev:worker             # Worker module only
cd worker && npm run dev       # Worker with hot reload

# Database operations
npx supabase start             # Start Supabase stack
npx supabase stop              # Stop Supabase stack
npx supabase db reset          # Reset with migrations + seed
npx supabase migration new <name>  # Create migration
npx supabase db diff --schema public  # Generate migration from schema changes
```

### Environment Variables
```bash
# .env.local (main app)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>
GOOGLE_AI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-2.5-flash-lite # Or gemini-1.5-pro

# worker/.env (worker module)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<same as above>
GOOGLE_AI_API_KEY=<same as above>
GEMINI_MODEL=gemini-2.5-flash-lite

# Local development ports (from supabase/config.toml)
# API: 54321, DB: 54322, Studio: 54323, Inbucket: 54324
# Next.js: 3000, Edge Functions: 54321/functions/v1
```

## Code Examples

### Using the ECS System
```typescript
import { ecs } from '@/lib/ecs'

// Create a flashcard entity
const entityId = await ecs.createEntity(userId, {
  flashcard: { question: "What is ECS?", answer: "Entity-Component-System" },
  study: { due: new Date(), ease: 2.5 },
  source: { chunk_id: chunkId, document_id: docId }
})

// Query entities
const flashcards = await ecs.query(
  ['flashcard', 'study'],
  userId,
  { document_id: docId }
)

// Update component
await ecs.updateComponent(componentId, { ease: 3.0 }, userId)
```


## Architecture Patterns

### No Modals - Use Persistent UI
```typescript
// ❌ NEVER
<Dialog open={open}>
  <CreateFlashcard />
</Dialog>

// ✅ ALWAYS  
<ProcessingDock />      // Bottom dock for status
<RightPanel />          // Side panel for connections
<QuickCaptureBar />     // Inline annotation tools
<CommandPalette />      // ⌘K overlay (only allowed overlay)
```

### Server Components by Default
```typescript
// Default: Server Component (no directive)
export default async function DocumentPage({ params }) {
  const doc = await supabase.from('documents').select()
  return <DocumentViewer document={doc} />
}

// Only use 'use client' when needed:
// - Event handlers (onClick, onChange)
// - Browser APIs (window, document)
// - React hooks (useState, useEffect)
'use client'
export function SelectionToolbar() {
  const [selected, setSelected] = useState(null)
  // ...
}
```

### Server Actions for All Mutations
```typescript
// app/actions/annotations.ts
'use server'

export async function createAnnotation(data: AnnotationData) {
  // Direct database access with service role
  const entityId = await ecs.createEntity(userId, {
    annotation: { text: data.text, range: data.range },
    source: { chunk_id: data.chunkId }
  })
  
  revalidatePath(`/read/${data.documentId}`)
  return { success: true, id: entityId }
}
```

## Development Guidelines

### Dual-Module Architecture
This project uses a **dual-module architecture** with distinct testing and dependency management:

**Main App** (`/`) - Next.js 15 with React 19
- Frontend components and pages
- Server Actions for database mutations
- ECS system for entity management
- Jest + jsdom for testing UI logic

**Worker Module** (`/worker/`) - Node.js background processing
- Document processors (PDF, YouTube, Web, etc.)
- 3-engine collision detection system
- Gemini AI integration and embeddings
- Jest + node environment for integration testing

### File Organization
```
src/
├── app/                    # Next.js 15 App Router
│   ├── actions/           # Server Actions ('use server')
│   ├── read/[id]/         # Document reader page
│   └── api/               # API routes (avoid, use actions)
├── components/
│   ├── reader/            # Reading UI components
│   ├── study/             # Study system components
│   ├── layout/            # Docks, panels, persistent UI
│   └── ui/                # shadcn/ui components
├── lib/
│   ├── ecs/              # Entity-Component-System
│   └── supabase/         # Database clients
└── stores/               # Zustand stores (client state)

worker/                   # Document processing module (separate Node.js app)
├── processors/           # Format-specific processors (pdf, youtube, web, etc.)
├── engines/             # 3 collision detection engines (semantic-similarity, contradiction-detection, thematic-bridge)
│   ├── base-engine.ts   # Shared engine interface
│   ├── orchestrator.ts  # Coordinates all engines
│   ├── scoring.ts       # Score normalization
│   └── types.ts         # Shared types
├── handlers/            # Background job handlers
├── lib/                 # Utilities (cache, monitoring, gemini client)
├── tests/               # Comprehensive test suite with validation
└── benchmarks/          # Performance measurement tools

scripts/                 # Development automation
├── dev.sh              # Start all services (Supabase + Worker + Next.js)
├── stop.sh             # Stop all services
└── benchmark-*.ts      # Performance testing scripts
```

### Testing Strategy
Rhizome V2 uses a **development-friendly testing strategy** with categorized tests:

```bash
# 🔴 Critical Tests (must pass - blocks deployment)
npm run test:critical      # E2E + integration smoke tests

# 🟡 Stable Tests (fix when broken - tracked but may not block)  
npm run test:stable        # API contracts + system integration

# 🟢 Flexible Tests (skip during rapid development)
npm run test:flexible      # Component tests + utilities

# 🔵 Experimental Tests (new features only)
npm run test:experimental  # Manual execution only
```

### Development Workflow Patterns

#### Working with Worker Module
```bash
# Always test worker changes locally first
cd worker && npm run test:integration

# For processor changes, test specific source types
cd worker && npm run test:youtube-videos  # Test YouTube changes
cd worker && npm run test:web-articles    # Test web scraping changes

# For engine changes, validate semantic accuracy
cd worker && npm run validate:semantic-accuracy

# Test individual engines (have test scripts for all 3)
npx tsx worker/test-semantic-similarity.ts <document_id>
npx tsx worker/test-contradiction-detection.ts <document_id>
npx tsx worker/test-thematic-bridge.ts <document_id>
npx tsx worker/test-orchestrator.ts <document_id>

# Before committing, run full validation
cd worker && npm run test:full-validation
```

#### Service Management
```bash
# Use scripts for coordinated service management
npm run dev      # Starts: Supabase → Edge Functions → Worker → Next.js
npm run stop     # Stops all services gracefully

# For individual debugging, run services separately
npx supabase start
cd worker && npm run dev     # Worker with hot reload
npm run dev:next             # Next.js on port 3000
```

### Common Pitfalls to Avoid

1. **Never use modals** - Always use docks/panels/overlays
2. **Never store markdown in DB** - Use Supabase Storage
3. **Never parse PDFs directly** - Use Gemini Files API
4. **Never create service classes** - Use ECS for entities
5. **Never mix storage patterns** - Files OR database, not both
6. **Never skip error handling** - Especially for AI operations
7. **Never test without mocks in CI** - Use `validate:metadata` not `validate:metadata:real`
8. **Never commit node_modules** - Check .gitignore in both root and worker/
9. **Never modify worker deps without testing** - Worker has strict ESM requirements
10. **Never add chunk-level timestamps** - YouTube timestamps are document-level only (see migration 018)
11. **Never bypass the orchestrator** - All 3 engines run through `processDocument()` in orchestrator.ts


## Testing Guidelines

### Testing Philosophy
Rhizome uses a **data-loss-aware, cost-conscious** testing strategy optimized for a single-user personal tool.

#### Core Principles
1. **Data Loss Hierarchy**: Test based on replaceability
   - **Annotations** (manual work) → Test exhaustively, never lose
   - **Documents** (source files) → Test preservation and recovery
   - **Chunks** (cost $0.20 to regenerate) → Test critical algorithms
   - **Connections** (auto-generated) → Light testing, can recompute

2. **Cost-Aware Testing**: Processing costs real money
   - Mock AI API calls in tests
   - Use small fixtures (<20 pages) for integration tests
   - Validate filtering logic prevents cost explosions

3. **Test What's Expensive to Debug**
   - ✅ Stitching (silent corruption)
   - ✅ Fuzzy position recovery (annotation loss)
   - ✅ Chunk remapping (annotation orphaning)
   - ✅ Filtering logic (cost control)
   - ❌ UI rendering (just look at it)
   - ❌ Simple CRUD (breaks obviously)

4. **Use Real Data**: Fake data doesn't catch real bugs
   - Process actual books → export chunks → use as fixtures
   - Test with real embeddings, real metadata, real content

### Test Categories
- **Critical** (`tests/critical/`): Must always pass, blocks deployment
- **Stable** (`tests/stable/`): Fix when broken, tracks quality
- **Flexible** (`tests/flexible/`): Skip during rapid development


### Test Structure
```
tests/
├── critical/      # Must-pass: annotations, stitching, filtering
├── stable/        # Important: API contracts, integration
├── flexible/      # Optional: utilities, components
├── fixtures/      # Real chunks from processed books
├── factories/     # Test data generators
└── mocks/         # MSW handlers

src/lib/ecs/__tests__/    # ECS unit tests
worker/tests/             # Worker tests with real fixtures
```

### Quick Examples

#### Using Test Factories
```typescript
import { factories } from '@/tests/factories'

const doc = factories.document.createProcessed()
const chunks = factories.chunk.createMany(10, 'doc-id')

beforeEach(() => factories.document.reset())
```

#### Using Real Fixtures (Critical Tests)
```typescript
import { realChunks } from '@/tests/fixtures/chunks'

test('finds cross-domain bridge', () => {
  const literary = realChunks.gravityRainbow_chunk0
  const tech = realChunks.surveillanceCapitalism_chunk5
  
  const connection = detectThematicBridge(literary, tech)
  expect(connection.detected).toBe(true)
})
```

#### Cost-Aware Testing
```typescript
test('stays under budget', async () => {
  const costTracker = new CostTracker()
  await processDocument(smallTestDoc, { costTracker })
  
  expect(costTracker.totalCost).toBeLessThan(0.60) // $0.60 budget
})
```

### Critical Test Checklist
When implementing features, ensure these are tested:
- [ ] Annotation position recovery after edits
- [ ] Chunk remapping after reprocessing
- [ ] Batch stitching with fuzzy matching
- [ ] ThematicBridge filtering (<300 AI calls per book)
- [ ] Connection scoring with personal weights
- [ ] Cost tracking per processing stage

### Quick Test Commands
```bash
# Main app tests
npm test                       # Run all main app tests
npm run test:watch             # Run tests in watch mode
npm test -- ecs.test.ts        # Run specific test file
npm run test:e2e               # Playwright E2E tests
npm run test:e2e:ui            # Playwright with UI mode
npm run test:e2e:debug         # Playwright debug mode

# Worker module tests (cd worker && ...)
npm test                       # All worker tests
npm run test:watch             # Worker tests in watch mode
npm run test:unit              # Unit tests only (__tests__ directory)
npm run test:integration       # Integration tests only (tests/integration)

# Specialized worker testing
npm run test:all-sources       # Test all 6 document processor types
npm run test:youtube-videos    # YouTube processing tests
npm run test:web-articles      # Web article processing tests
npm run test:text-processing   # Text/paste processing tests
npm run test:retry-scenarios   # Error recovery and retry logic
npm run test:database-batching # Database batch operations
npm run test:cache-metrics     # Cache performance tests
npm run test:backwards-compatibility  # Backwards compatibility tests

# Validation and benchmarking
npm run test:validate          # Integration validation suite
npm run test:full-validation   # Build + lint + integration + validation
npm run validate:metadata      # Metadata extraction validation
npm run validate:metadata:real # Use real AI (not mocks)
npm run validate:semantic-accuracy  # Semantic engine accuracy tests

# Benchmarking
npm run benchmark:all          # All performance benchmarks
npm run benchmark:pdf          # PDF processing benchmarks
npm run benchmark:semantic-engine  # Semantic similarity benchmarks
npm run benchmark:cache        # Cache performance benchmarks
npm run benchmark:report       # Detailed benchmark report
```


### Testing Documentation
- **[docs/testing/TESTING_RULES.md](docs/testing/TESTING_RULES.md)** - Primary testing rules for ai agents
- **[docs/testing/critical-patterns.md](docs/testing/critical-patterns.md)** - Code examples and testing patterns
- **[docs/testing/general-patterns.md](docs/testing/general-patterns.md)** - Code examples and testing patterns
- **[docs/testing/TESTING_README.md](docs/testing/TESTING_README.md)** - Primary testing guide and quick start



## Monitoring & Performance

### Philosophy
For a personal tool, "performance" means:
1. **Does processing annoy me?** (subjective wait time)
2. **Am I spending too much?** (cost per book)
3. **Did I lose work?** (data integrity)

Production metrics (p95 latency, cache hit rates) don't matter for one user.

### Processing Time Targets
**Goal**: Process a book while making coffee (~15-25 minutes)

- **Small PDFs (<50 pages)**: <5 minutes
  - Single-pass extraction
  - Local or AI chunking
  - ~$0.10 cost

- **Large PDFs (500 pages)**: <25 minutes
  - Batched extraction (6 batches)
  - Batched metadata (10 batches)
  - ~$0.55 cost

**Why batching**: Gemini 2.0 Flash has 65k output token limit. 500-page book = 200k tokens of output. Must batch.

### Cost Budget (Primary Performance Metric)
```typescript
// Target: <$0.60 per 500-page book
const budget = {
  extraction: 0.12,      // 6 batches @ $0.02
  metadata: 0.20,        // 10 batches @ $0.02
  embeddings: 0.02,      // 382 chunks
  thematicBridge: 0.20,  // <300 AI calls
  total: 0.54            // Under budget ✓
}

// Red flags
if (cost > 1.00) throw new Error('Processing too expensive')
if (aiCalls > 500) throw new Error('Filtering failed')
```

### Batched Processing Strategy
```typescript
// Small documents: Single pass
if (pages < 200) {
  return singlePassExtraction(pdf)
}

// Large documents: Batch with overlap
const BATCH_SIZE = 100
const OVERLAP = 10

for (let start = 0; start < totalPages; start += BATCH_SIZE - OVERLAP) {
  const end = Math.min(start + BATCH_SIZE, totalPages)
  batches.push(await extractBatch(pdf, start, end))
}

// Stitch with fuzzy matching
const stitched = stitchBatches(batches)
```

### Performance Patterns

#### Storage Access
```typescript
// ✅ Stream large files from storage
const url = await getSignedUrl(markdownPath)
const response = await fetch(url)
const reader = response.body.getReader()

// ❌ Don't load into memory
const { markdown } = await supabase
  .from('documents')
  .select('markdown_content')  // NO! 150k words in DB
```

#### Vector Search
```typescript
// ✅ Use pgvector for large corpus (>1000 chunks)
const similar = await supabase.rpc('match_chunks', {
  query_embedding: embedding,
  match_threshold: 0.7,
  match_count: 50
})

// ✅ Filter in-memory when corpus is small (<500 chunks) AND already loaded
const importantChunks = loadedChunks.filter(c => c.importance_score > 0.6)
// Avoids extra DB query, chunks already in memory

// ❌ Don't fetch all chunks to filter in JS
const allChunks = await supabase.from('chunks').select('*') // 100k chunks!
const filtered = allChunks.filter(c => c.similarity > 0.7)
```

#### AI Call Batching
```typescript
// ✅ Batch AI calls (5 at a time)
const batches = chunk(candidates, 5)
for (const batch of batches) {
  const results = await Promise.all(
    batch.map(c => analyzeBridge(source, c))
  )
}

// ❌ Don't call AI sequentially
for (const candidate of candidates) {
  await analyzeBridge(source, candidate) // Slow! 300 seconds for 300 calls
}

// ❌ Don't call AI without filtering
// 382 chunks × 382 candidates = 145,924 AI calls = $145
for (const chunk of allChunks) {
  for (const candidate of allChunks) {
    await analyzeBridge(chunk, candidate) // NEVER DO THIS
  }
}
```

### What to Monitor in Dev

#### Subjective Metrics (Most Important)
- Does processing feel slow? (**> 30 minutes = annoying**)
- Does the app feel laggy? (**> 1 second wait = annoying**)
- Did I lose data? (**ANY data loss = critical**)

#### Cost Metrics (Track These)
```bash
# Log cost breakdown after processing
console.log(`
Extraction: $${extractionCost.toFixed(2)}
Metadata: $${metadataCost.toFixed(2)}
Embeddings: $${embeddingCost.toFixed(2)}
Connections: $${connectionCost.toFixed(2)}
Total: $${totalCost.toFixed(2)}
`)
```

#### Failure Metrics (Only These Matter)
- Stitching failures (corrupted documents)
- Annotation recovery failures (data loss)
- Filtering failures (cost explosion)
- Batch failures (incomplete processing)

### Performance Anti-Patterns

```typescript
// ❌ Premature optimization
// Don't optimize until it personally annoys you

// ❌ Caching without measurement
// Only cache after you've measured that retrieval is slow

// ❌ Production metrics
// No need for p95, p99, cache hit rates for one user

// ✅ Optimize when it hurts
if (processingTime > 30 * 60 * 1000) {
  // Only optimize if > 30 minutes
}
```

### When to Optimize

**Optimize when:**
- Processing takes >30 minutes (annoying during coffee break)
- Cost exceeds $1 per book (monthly budget concern)
- Data loss occurs (critical bug)

**Don't optimize when:**
- Theoretical performance concerns
- Production best practices say you should
- Code doesn't look "clean" but works fine



## Engine Architecture (3-Engine System)

### Recent Refactoring (Sept 2024)
The collision detection system was simplified from 7 engines to 3 focused engines:

**Removed Engines**: Conceptual Density, Structural Pattern, Citation Network, Temporal Proximity, Emotional Resonance
**Kept**: Semantic Similarity, Contradiction Detection, Thematic Bridge

### Engine Coordination Pattern

All engines follow the same interface:
```typescript
// Every engine implements this pattern
export async function run<EngineName>(
  documentId: string,
  config?: Config
): Promise<ChunkConnection[]>

// Shared save function (from semantic-similarity.ts)
export async function saveChunkConnections(
  connections: ChunkConnection[]
): Promise<void>
```

### Orchestrator Flow
```typescript
// worker/engines/orchestrator.ts
// 1. Run all 3 engines sequentially (can be parallelized later)
// 2. Aggregate results
// 3. Save to database via saveChunkConnections()
// 4. Return stats (totalConnections, byEngine, executionTime)

import { processDocument } from './engines/orchestrator'

const result = await processDocument(documentId, {
  enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
})
// result.byEngine = { semantic_similarity: 47, contradiction_detection: 23, thematic_bridge: 15 }
```

### Integration Point
Orchestrator is called from `worker/handlers/detect-connections.ts` after document processing completes.

### Querying Connections
```typescript
// Get all connections for a document
const { data: connections } = await supabase
  .from('chunk_connections')
  .select(`
    *,
    source_chunk:chunks!source_chunk_id(id, content, summary),
    target_chunk:chunks!target_chunk_id(id, content, summary)
  `)
  .eq('source_chunk.document_id', documentId)
  .order('strength', { ascending: false })

// Get by engine type
const { data: semantic } = await supabase
  .from('chunk_connections')
  .select('*')
  .eq('connection_type', 'semantic_similarity')
  .gte('strength', 0.7)

// Get cross-document connections only
const { data: crossDoc } = await supabase
  .from('chunk_connections')
  .select('*')
  .neq('source_chunk.document_id', 'target_chunk.document_id')
```

## Next Steps

1. **Continue Reader UI**: Markdown renderer, virtual scrolling, selection system
2. **Implement Annotations**: Text selection → ECS persistence
3. **Build Connection Panel**: Display collision detection results from 3 engines
4. **Add Study System**: Flashcards with FSRS algorithm
5. **Create Export System**: ZIP bundles with markdown + annotations

## Documentation Reference

### Core Documentation
- **Project Vision**: `docs/APP_VISION.md` - Philosophy and long-term vision
- **Implementation Status**: `docs/IMPLEMENTATION_STATUS.md` - What's built vs planned
- **Architecture**: `docs/ARCHITECTURE.md` - Complete system design
- **Code Examples**: `docs/CODE_EXAMPLES.md` - Practical implementation patterns

### Development Guides
- **React Guidelines**: `docs/lib/REACT_GUIDELINES.md` - Server/Client components, patterns
- **UI Patterns**: `docs/UI_PATTERNS.md` - No modals, persistent UI patterns
- **ECS Implementation**: `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System guide
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy

### Authentication & Setup
- **Auth Rules**: `docs/SUPABASE_AUTH_RULES.md` - Personal project auth approach
- **AI Documentation**: `docs/AI_DOCUMENTATION.md` - Gemini & Vercel AI SDK usage

### Product Planning
- **PRPs Index**: `docs/prps/README.md` - Product requirement documents status
- **Active PRP**: `docs/prps/connection-synthesis-system.md` - Current development

### Module Documentation
- **Worker Module**: `worker/README.md` - Document processing system
- **Gemini Processing**: `docs/GEMINI_PROCESSING.md` - AI processing patterns

## Other Docs

- Virtuoso - Virtual Scrolling for our reader - https://virtuoso.dev/

Remember: This is an AI-first personal tool. Prioritize connection discovery and knowledge synthesis over traditional features.