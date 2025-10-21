# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Rhizome V2 - AI-Powered Document Processing & Knowledge Synthesis

## Project Overview

Rhizome V2 is an **AI-first document processing system** with **3-engine collision detection** for discovering connections between ideas. It transforms documents into structured knowledge through clean markdown, semantic chunking, and aggressive connection synthesis.

**This is a GREENFIELD APP, we are NOT CONCERNED ABOUT BACKWARD COMPATIBILITY!!**

**Core Vision**: Build a personal knowledge tool that actively discovers non-obvious connections across all your reading materials.

**This is a personal tool** optimized for aggressive connection detection and knowledge synthesis. Not designed for multi-user or enterprise use.

---

## Quick Reference

**Latest Migration**: `052_job_pause_resume.sql`
**Input Formats**: 7 (PDF, EPUB, YouTube, Web, Markdown, Text, Paste)
**Chunking Strategies**: 9 (Default: recursive, 3-5 min)
**Connection Engines**: 3 (Semantic 25%, Contradiction 40%, Thematic 35%)
**Processing Mode**: LOCAL (zero cost) or CLOUD (Gemini)

**Processing Times** (M1 Max 64GB):
- Small (<50p): 3-5 min
- Medium (200p): 15-25 min
- Large (500p): 60-80 min

**Key Shortcuts**:
- `Cmd+Shift+A`: Admin Panel
- `Cmd+K`: Quick Capture (Sparks)

**Key Docs**:
- `docs/APP_VISION.md` - Core philosophy
- `docs/PROCESSING_PIPELINE.md` - Full 10-stage pipeline
- `docs/ARCHITECTURE.md` - System architecture

---

## Implementation Status

### ✅ COMPLETE

#### Document Processing Pipeline
- **7 Input Methods**: PDF, EPUB, YouTube, Web, Markdown (as-is/clean), Text, Paste
- **Chonkie Integration**: 9 chunking strategies (token, sentence, **recursive**, semantic, late, code, neural, slumber, table)
- **Local Processing Pipeline**: Docling + Ollama + Transformers.js (zero API cost)
- **Cloud Processing**: Gemini 2.0 Flash for extraction and cleaning

#### Connection Detection System
- **3 Engines**: Semantic Similarity (25%), Contradiction Detection (40%), Thematic Bridge (35%)
- **Orchestrator**: Coordinates all 3 engines via `worker/engines/orchestrator.ts`
- **User-Configurable Weights**: Personal preference tuning
- **Filtering**: Aggressive filtering (<300 AI calls per document)

#### Document Reader (90% Complete)
- VirtualizedReader with react-virtuoso
- BlockRenderer for markdown (react-markdown + KaTeX)
- 3 view modes (Focus, Read, Explore)
- ConnectionHeatmap (left margin density visualization)
- QuickSparkModal (⌘K quick capture)
- CorrectionModePanel (chunk quality workflow)

#### Annotations System (5-Component ECS)
- 5-component pattern: Position, Visual, Content, Temporal, ChunkRef
- Text selection → ECS persistence
- AnnotationsList with fuzzy matching recovery
- Server actions in `src/app/actions/annotations.ts`
- Annotation review with validation workflow
- PascalCase component naming

#### Spark System (4-Component ECS)
- 4-component pattern: Spark, Content, Temporal, ChunkRef
- Quick capture (Cmd+K) with QuickSparkCapture component
- Multiple text selections per spark
- Automatic connections to chunks
- 2-mode recovery (selection-based + semantic)
- Server actions in `src/app/actions/sparks.ts`
- SparkOperations class in `src/lib/ecs/sparks.ts`
- Storage-first with automatic export
- Version 2.0 (Production Ready)

#### Connection Display
- RightPanel with 6 tabs:
  1. **Connections** - chunk connections by engine
  2. **Sparks** - quick annotations
  3. **Flashcards** - study system (placeholder)
  4. **Tune** - engine weight configuration
  5. **Annotations** - annotation review
  6. **Quality** - chunk quality monitoring (Chonkie confidence tracking)

#### Storage-First Portability
- **Admin Panel** (Cmd+Shift+A) with 6 tabs:
  1. **Scanner** - compare Storage vs Database
  2. **Import** - restore from Storage with conflict resolution
  3. **Export** - generate ZIP bundles
  4. **Connections** - reprocess connections (Smart Mode)
  5. **Integrations** - Obsidian + Readwise operations
  6. **Jobs** - comprehensive job history

- **Benefits**: $0.20-0.60 saved per document, DB reset + restore in 6 min vs 25 min reprocessing
- **Storage is source of truth**, Database is queryable cache

#### Readwise Integration
- IntegrationsTab in Admin Panel
- Highlight import with review workflow
- Conversion to ECS annotations

#### ProcessingDock
- Bottom-right floating dock
- Active jobs only (processing/pending)
- Auto-hides when Admin Panel open
- Collapses to mini badge
- Shares `background-jobs` store

#### Background Job System (Enhanced v2.0)
- **7 Job Types**: Document processing, imports, exports, connection detection, integrations
- **Real-time Progress**: Updates every 5-10 seconds with detailed status ("Chunk 234 of 500")
- **Visual Feedback**: Heartbeat indicator (green pulse), progress bars, status badges
- **Pause & Resume**: Checkpoint-based pause/resume with SHA-256 validation
- **Automatic Retry**: Intelligent error classification (4 types) with exponential backoff
- **Job Control**: Pause/Resume/Retry/Delete buttons in UI
- **Details**: See `docs/JOB_SYSTEM.md` for complete reference

### 📋 NOT STARTED (Priority Order)

#### 1. Study System
- Flashcard creation from selections (ECS backend)
- FSRS spaced repetition algorithm
- Study mode interface
- Progress tracking
- **Note**: FlashcardsTab exists as UI placeholder only

---

## Core Architecture

### 1. Multi-Format Document Processing ✅

**7 Input Methods**: PDF, EPUB, YouTube, Web, Markdown (as-is/clean), Text, Paste

**Processors**: Each format has dedicated processor with error recovery
- `worker/processors/pdf-processor.ts`
- `worker/processors/epub-processor.ts`
- `worker/processors/youtube-processor.ts`
- `worker/processors/web-processor.ts`
- `worker/processors/markdown-processor.ts`
- `worker/processors/text-processor.ts`
- `worker/processors/paste-processor.ts`

**Router**: `worker/processors/router.ts` routes by `source_type`

### 2. Unified Chunking Pipeline ✅

**Philosophy**: ONE pipeline with 9 user-selectable strategies (replaced 3 parallel paths)

**Pipeline**: Download → Docling Extract → Cleanup → Bulletproof Match → Chonkie Chunk → Metadata Transfer → Enrich → Embed → Save

**9 Chunking Strategies**:
| Strategy | Use Case | Speed | Quality |
|----------|----------|-------|---------|
| token | Fixed-size | 2-3 min | Basic |
| sentence | Sentence boundaries | 3-4 min | Good |
| **recursive** | Structural (DEFAULT) | 3-5 min | High |
| semantic | Narrative, thematic | 8-15 min | Very High |
| late | High-quality RAG | 10-20 min | Very High |
| code | AST-aware code | 5-10 min | High (code) |
| neural | BERT semantic | 15-25 min | Very High |
| slumber | Agentic LLM | 30-60 min | Highest |
| table | Markdown tables | 3-5 min | Good (tables) |

**Key Insight**: Docling chunks = metadata anchors, Chonkie chunks = actual chunks used for search/connections

**Details**: See `docs/PROCESSING_PIPELINE.md` for full 10-stage pipeline documentation

### 3. Local Processing Pipeline ✅

100% local document processing with **zero API costs** and **complete privacy**.

**Components**:
- **Docling**: PDF/EPUB extraction with HybridChunker (768 tokens)
- **Ollama (Qwen 32B)**: Local LLM for cleanup and metadata
- **Transformers.js**: Local embeddings (768d vectors, metadata-enhanced)
- **5-Layer Bulletproof Matching**: 100% chunk recovery guarantee

**Cost Savings**: Cloud (Gemini) $0.42/book vs Local $0.00/book

**Details**: See `docs/PROCESSING_PIPELINE.md` and `docs/local-pipeline-setup.md`

### 4. 3-Engine Connection Detection ✅

Dropped from 7 engines to 3 focused engines:

1. **Semantic Similarity** (25% weight) - Embedding-based, fast, finds "say same thing"
2. **Contradiction Detection** (40% weight) - Metadata-based, finds conceptual tensions
3. **Thematic Bridge** (35% weight) - AI-powered, cross-domain concept matching

**Orchestrator**: `worker/engines/orchestrator.ts` coordinates all engines

**Details**: See `worker/engines/` directory for implementation

### 5. ECS (Entity-Component-System) ✅

Everything is an entity with flexible components using **PascalCase** naming.

**Location**: `src/lib/ecs/` (factory pattern via `createECS()`)

**Implemented Systems**:
- **Annotations** (5-component pattern): Position, Visual, Content, Temporal, ChunkRef
- **Sparks** (4-component pattern): Spark, Content, Temporal, ChunkRef

**Shared Components**: Content, Temporal, ChunkRef (reused across entity types)

**Planned Components**: Flashcard, Study, Embedding, Themes, Connections

**Annotation Example** (5-component pattern):
```typescript
import { AnnotationOperations } from '@/lib/ecs/annotations'
import { createECS } from '@/lib/ecs'
import { getCurrentUser } from '@/lib/auth'

const user = await getCurrentUser()
if (!user) throw new Error('Not authenticated')

const ecs = createECS() // Create instance per request
const ops = new AnnotationOperations(ecs, user.id)

// Create annotation with 5 components (Position, Visual, Content, Temporal, ChunkRef)
const entityId = await ops.create({
  documentId: documentId,
  text: "Important insight",
  note: "My thoughts...",
  color: "yellow",
  tags: ["architecture"],
  chunkIds: [chunkId],
  startOffset: 100,
  endOffset: 150,
  textContext: { before: "...", after: "..." },
  chunkPosition: 0
})
```

**Spark Example** (4-component pattern):
```typescript
import { SparkOperations } from '@/lib/ecs/sparks'

const sparkOps = new SparkOperations(ecs, user.id)

// Create spark with 4 components (Spark, Content, Temporal, ChunkRef)
const sparkId = await sparkOps.create({
  content: "Quick thought about this passage",
  selections: [{
    text: "highlighted text",
    chunkId: chunkId,
    startOffset: 100,
    endOffset: 150,
    textContext: { before: "...", after: "..." }
  }],
  tags: ["insight"],
  connections: [],
  chunkId: chunkId,
  chunkIds: [chunkId],
  documentId: documentId,
  originChunkContent: "First 500 chars for recovery..."
})
```

**Key Differences**:
- **Annotations**: Have Position component (text location), used for precise highlights
- **Sparks**: Have Spark component (selections array), lightweight quick capture
- **Shared**: Both use Content (note/tags), Temporal (timestamps), ChunkRef (location)

**Component Naming**: Always use **PascalCase** (Position, Spark, Content) not lowercase (position, spark, content)

**See**: `docs/ANNOTATIONS_SYSTEM.md`, `docs/SPARK_SYSTEM.md`, and `docs/ECS_IMPLEMENTATION.md` for complete guides

### 6. Hybrid Storage Strategy ✅

- **Supabase Storage**: Large files (PDFs, markdown, exports)
- **PostgreSQL**: Chunks, embeddings (pgvector), user data
- **Never mix**: Files in DB or queryable data in Storage

**Storage is source of truth + portability**
**Database is queryable cache + derived data**

### 7. Storage-First Portability ✅

**Admin Panel** (Cmd+Shift+A): 6 tabs for Storage operations
- Automatic export to Storage (`chunks.json`, `metadata.json`, `manifest.json`)
- Import with 3 conflict resolution strategies (skip, replace, merge_smart)
- ZIP bundle export for complete portability
- Smart Mode connection reprocessing (preserves user-validated)

**Details**: See `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`

---

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
    "@google/genai": "Native Gemini SDK",
    "ai": "^5.x + @ai-sdk/google",
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

---

## Quick Start Guide

### Development Setup
```bash
# Install dependencies
npm install
cd worker && npm install

# Start all services
npm run dev     # Supabase + Worker + Next.js
npm run stop    # Stop all services
npm run status  # Check service status

# Database operations
npx supabase start              # Start Supabase
npx supabase db reset           # Reset with migrations
npx supabase migration new <name>  # Create migration
```

### Environment Variables
```bash
# .env.local (main app)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>
GOOGLE_AI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-2.5-flash-lite

# worker/.env (worker module)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<same as above>
GOOGLE_AI_API_KEY=<same as above>
GEMINI_MODEL=gemini-2.5-flash-lite

# Local Processing (Optional)
PROCESSING_MODE=local
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M
```

---

## Development Guidelines

### Dual-Module Architecture

**Main App** (`/`) - Next.js 15 with React 19
- Frontend components and pages
- Server Actions for database mutations
- ECS system for entity management

**Worker Module** (`/worker/`) - Node.js background processing
- Document processors (PDF, EPUB, YouTube, etc.)
- 3-engine collision detection system
- Gemini AI integration and embeddings

### File Organization
```
src/
├── app/                  # Next.js 15 App Router
│   ├── actions/         # Server Actions ('use server')
│   ├── read/[id]/       # Document reader page
│   └── api/             # API routes (avoid, use actions)
├── components/
│   ├── reader/          # Reading UI components
│   ├── sidebar/         # RightPanel tabs (6 tabs)
│   ├── admin/           # Admin Panel tabs (6 tabs)
│   ├── layout/          # Docks, panels, persistent UI
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── ecs/            # Entity-Component-System
│   └── supabase/       # Database clients
└── stores/             # Zustand stores (client state)

worker/                 # Separate Node.js app
├── processors/         # 7 format processors
├── engines/           # 3 collision detection engines
├── lib/               # Utilities, local processing
└── tests/             # Comprehensive test suite
```

### Testing Strategy

```bash
# Main app tests
npm test                 # Run all tests
npm run test:critical    # Must pass (blocks deployment)
npm run test:stable      # Fix when broken

# Worker tests (cd worker && ...)
npm run test:integration        # Integration tests
npm run test:full-validation    # Before committing
npm run validate:metadata       # Metadata extraction
```

**Philosophy**: Test based on replaceability
- **Annotations** (manual work) → Test exhaustively
- **Documents** (source files) → Test preservation
- **Chunks** (cost $0.20) → Test critical algorithms
- **Connections** (auto-generated) → Light testing

**Details**: See `docs/testing/TESTING_RULES.md` and `docs/testing/TESTING_README.md`

---

## Architecture Patterns

### No Modals - Use Persistent UI
```typescript
// ❌ NEVER
<Dialog open={open}>
  <CreateFlashcard />
</Dialog>

// ✅ ALWAYS
<ProcessingDock />      // Bottom-right dock for status
<RightPanel />          // Side panel for connections (6 tabs)
<QuickSparkModal />     // ⌘K quick capture
<AdminPanel />          // Cmd+Shift+A for admin operations
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
  const entityId = await ecs.createEntity(userId, {
    annotation: { text: data.text, range: data.range },
    source: { chunk_id: data.chunkId }
  })

  revalidatePath(`/read/${data.documentId}`)
  return { success: true, id: entityId }
}
```

---

## Critical Anti-Patterns

**From implementation experience - NEVER DO THESE:**

1. ❌ **Don't skip Python `stdout.flush()`** - IPC will hang
2. ❌ **Don't use modals** - Always use docks/panels/overlays
3. ❌ **Don't store markdown in DB** - Use Supabase Storage
4. ❌ **Don't bypass orchestrator** - All 3 engines run through `processDocument()`
5. ❌ **Don't test without mocks in CI** - Use `validate:metadata` not `validate:metadata:real`
6. ❌ **Don't mismatch tokenizers** - HybridChunker must match embeddings model
7. ❌ **Don't use Ollama streaming for structured outputs** - Breaks JSON parsing
8. ❌ **Don't ignore OOM errors** - Graceful fallback required
9. ❌ **Don't modify stored chunk content** - Enhance embeddings only, preserve original
10. ❌ **Don't skip metadata validation** - Chunk statistics catch quality regressions
11. ❌ **Don't parse PDFs directly** - Use Gemini Files API or Docling
12. ❌ **Don't skip character offset validation** - Metadata transfer will fail
13. ❌ **Don't assume 100% overlap coverage** - 70-90% is expected and excellent for Chonkie

**Detection**: Run `npm run test:critical` before commits

---

## Performance Philosophy

For a personal tool, "performance" means:
1. **Does processing annoy me?** (subjective wait time)
2. **Am I spending too much?** (cost per book)
3. **Did I lose work?** (data integrity)

Production metrics (p95 latency, cache hit rates) don't matter for one user.

### Processing Time Targets

**Goal**: Process a book while making coffee (~15-25 minutes)

- **Small PDFs (<50 pages)**: <5 minutes (~$0.10 cost)
- **Large PDFs (500 pages)**: <25 minutes (~$0.55 cost)

### When to Optimize

**Optimize when:**
- Processing takes >30 minutes (annoying during coffee break)
- Cost exceeds $1 per book (monthly budget concern)
- Data loss occurs (critical bug)

**Don't optimize when:**
- Theoretical performance concerns
- Production best practices say you should
- Code doesn't look "clean" but works fine

---

## Documentation Map

### Core Documentation
- **Project Vision**: `docs/APP_VISION.md` - Philosophy and long-term vision
- **Architecture**: `docs/ARCHITECTURE.md` - Complete system design
- **Implementation Status**: `docs/IMPLEMENTATION_STATUS.md` - What's built vs planned
- **User Flow**: `docs/USER_FLOW.md` - Core user workflows

### Processing Pipeline
- **Processing Pipeline Overview**: `docs/PROCESSING_PIPELINE.md` - Full 10-stage pipeline
- **Local Pipeline Setup**: `docs/local-pipeline-setup.md` - Docling + Ollama + Transformers.js
- **Docling Configuration**: `docs/docling-configuration.md` - Environment variables and features
- **Bulletproof Metadata**: `docs/processing-pipeline/bulletproof-metadata-extraction.md`

### Development Guides
- **React Guidelines**: `docs/lib/REACT_GUIDELINES.md` - Server/Client components
- **UI Patterns**: `docs/UI_PATTERNS.md` - No modals, persistent UI
- **ECS Implementation**: `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System
- **Annotations System**: `docs/ANNOTATIONS_SYSTEM.md` - 5-component ECS pattern, recovery, UI integration
- **Spark System**: `docs/SPARK_SYSTEM.md` - 4-component ECS pattern, quick capture, multi-selection
- **Storage Patterns**: `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy
- **Storage-First Portability**: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` - Complete guide

### Testing
- **Testing Rules**: `docs/testing/TESTING_RULES.md` - Primary rules for AI agents
- **Testing README**: `docs/testing/TESTING_README.md` - Quick start guide
- **Critical Patterns**: `docs/testing/critical-patterns.md` - Code examples
- **General Patterns**: `docs/testing/general-patterns.md` - Testing patterns

### State Management
- **Zustand Rules**: `docs/ZUSTAND_RULES.md` - Comprehensive guide with 4 stores
- **Zustand Pattern**: `docs/ZUSTAND_PATTERN.md` - Quick reference for migrations

### Authentication & Setup
- **Auth Rules**: `docs/SUPABASE_AUTH_RULES.md` - Personal project approach
- **AI Documentation**: `docs/AI_DOCUMENTATION.md` - Gemini & Vercel AI SDK

### Module Documentation
- **Worker Module**: `worker/README.md` - Document processing system
- **Gemini Processing**: `docs/GEMINI_PROCESSING.md` - AI processing patterns
- **Background Jobs**: `docs/JOB_SYSTEM.md` - Complete job system reference (pause/resume, retry, progress tracking)

---

## Naming Conventions (CRITICAL)

**Problem**: Fullstack apps have conflicting conventions (Database: `snake_case`, JavaScript: `camelCase`)

**Solution**: Use camelCase in `output_data` JSONB fields to match frontend, validate with Zod schemas.

### Convention Rules

**Database Layer (PostgreSQL/Supabase)**
- Tables: `snake_case` (e.g., `background_jobs`, `connections`)
- Columns: `snake_case` (e.g., `created_at`, `output_data`)
- JSONB fields (`output_data`): **camelCase** (e.g., `downloadUrl`, `zipFilename`)

**TypeScript/Frontend Layer**
- Variables: `camelCase` (e.g., `downloadUrl`, `createdAt`)
- Types/Interfaces: `PascalCase` (e.g., `ExportJobOutput`)
- Files: `kebab-case` (e.g., `export-document.ts`)

### Why camelCase in output_data?

**JSONB is schemaless** - PostgreSQL doesn't enforce types or naming anyway.
**Simpler** - No transformation layer, frontend and backend share same structure.
**Less error-prone** - Fewer places for naming bugs like `download_url` vs `downloadUrl`.

### Enforcement with Zod

```typescript
// worker/types/job-schemas.ts
import { z } from 'zod'

export const ExportJobOutputSchema = z.object({
  success: z.boolean(),
  documentCount: z.number(),      // ✅ camelCase
  downloadUrl: z.string().url(),  // ✅ camelCase
  // ...
})

// In handler
const outputData = {
  success: true,
  documentCount: documents.length,
  downloadUrl: signedUrl, // ✅ camelCase
}

// Validate before saving (catches typos!)
ExportJobOutputSchema.parse(outputData)
```

### Required Files

- **Schema definitions**: `worker/types/job-schemas.ts` (Zod validation)
- **Import in handlers**: All job handlers must import and validate
- **Never skip validation**: Catches bugs at runtime before they reach UI

### Common Mistakes to Avoid

❌ `download_url` in output_data (snake_case breaks frontend)
❌ Skipping schema validation (typos reach production)
❌ Using wrong table names (e.g., `chunk_connections` instead of `connections`)
✅ Always validate with Zod before saving to database
✅ Check schema file when adding new output fields
✅ Verify table names with `\dt` in psql before querying

---

## Miscellaneous Rules

- **Latest Migration**: `052_job_pause_resume.sql` (see `supabase/migrations/`)
- **Migration Format**: `NNN_descriptive_name.sql` where NNN is zero-padded number
- **EPUB Support**: Supported as source type alongside PDF - handle both when implementing
- **Cached Chunks**: `cached_chunks` table stores original Docling chunks for zero-cost LOCAL reprocessing (migration 046)
- **Chunk Metadata**: `chunks` table extended with Docling structural metadata (migration 047):
  - `heading_path` (TEXT[]) - Heading hierarchy for citations
  - `heading_level` (INTEGER) - Depth in heading tree
  - `section_marker` (TEXT) - Section identifier for EPUBs
- **shadcn/ui Pattern**: Always use `npx shadcn@latest add <component>` to install UI components
  - Ensures correct Radix UI primitives
  - Consistent styling with design system
  - Proper TypeScript types
- **Readwise Import**: Uses review workflow via `import_pending` table before creating documents

### Library Documentation

- **Virtuoso**: https://virtuoso.dev/ - Virtual scrolling for document reader
- **AI SDK**: https://ai-sdk.dev/docs/introduction - TypeScript toolkit for AI apps
- **Docling**: https://docling-project.github.io/docling/ - Document processing with advanced PDF understanding
- **Chonkie**: https://docs.chonkie.ai/oss/chunkers/overview - 9 chunking strategies

---

**Remember**: This is an AI-first personal tool. Prioritize connection discovery and knowledge synthesis over traditional features.
