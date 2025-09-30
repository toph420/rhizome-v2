# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Rhizome V2 - AI-Powered Document Processing & Knowledge Synthesis

## Project Overview

Rhizome V2 is an **AI-first document processing system** with **7-engine collision detection** for discovering connections between ideas. It transforms documents into structured knowledge through clean markdown, semantic chunking, and aggressive connection synthesis.

**This is a GREENFIELD APP, we are NOT CONCERNED ABOUT BACKWARD COMPATIBILITY!!**

**Core Vision**: Build a personal knowledge tool that actively discovers non-obvious connections across all your reading materials.

**Key Documents**:
- `docs/APP_VISION.md` - Core philosophy and vision
- `docs/USER_FLOW.md` - Core philosophy and vision
- `docs/IMPLEMENTATION_STATUS.md` - Current feature status
- `docs/ARCHITECTURE.md` - System architecture (first 1000 lines = implemented)

## Project Context

**ARCHON PROJECT ID**: a2232595-4e55-41d2-a041-1a4a8a4ff3c6

This is a personal tool optimized for aggressive connection detection and knowledge synthesis. Not designed for multi-user or enterprise use. 



## Core Architecture

### 1. Multi-Format Document Processing ✅ COMPLETE
- **6 Input Methods**: PDF, YouTube, Web URLs, Markdown (as-is/clean), Text, Paste
- **AI Pipeline**: Gemini 2.0 for extraction, cleaning, and semantic analysis
- **Modular Processors**: Each format has dedicated processor with error recovery
- **YouTube Enhancement**: Transcript cleaning, fuzzy positioning for annotations

### 2. 7-Engine Collision Detection System ✅ COMPLETE
```typescript
// Implemented engines in worker/engines/
- semantic-similarity.ts    // Embedding-based similarity (25% weight)
- conceptual-density.ts      // Concept clustering detection (20% weight)  
- structural-pattern.ts      // Document structure matching (15% weight)
- citation-network.ts        // Reference graph analysis (15% weight)
- temporal-proximity.ts      // Time-based clustering (10% weight)
- contradiction-detection.ts // Opposing viewpoint finder (10% weight)
- emotional-resonance.ts     // Emotional pattern matching (5% weight)
```

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
    "model": "gemini-2.0-flash-exp (65K tokens)"
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
- 7 specialized engines for connection discovery
- Orchestrator for engine coordination
- Score normalization and ranking
- User-configurable weights
- Caching layer for performance
- Batch processing optimizations

#### Database & Storage
- 16 migrations applied
- ECS tables (entities, components)
- Chunks with embeddings and metadata
- User preferences for weight tuning
- Hybrid storage (files + database)
- Background jobs table

#### Worker Module
- Modular processor architecture
- Processor router by source type
- Performance monitoring
- Cache manager
- Weight configuration system
- Comprehensive test coverage (88-100%)

### 🚧 IN PROGRESS

#### Document Reader & Annotations
- [ ] MDX-based markdown renderer
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
GEMINI_MODEL=gemini-2.0-flash-exp  # Or gemini-1.5-pro

# worker/.env (worker module)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<same as above>
GOOGLE_AI_API_KEY=<same as above>
GEMINI_MODEL=gemini-2.0-flash-exp

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

### Processing a Document
```typescript
// Server Action in src/app/actions/documents.ts
'use server'

export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File
  const sourceType = detectSourceType(file.name)
  
  // Upload to storage
  const storagePath = `${userId}/${docId}/source.pdf`
  await supabase.storage.from('documents').upload(storagePath, file)
  
  // Create document record
  await supabase.from('documents').insert({
    id: docId,
    user_id: userId,
    title: file.name,
    storage_path: storagePath,
    source_type: sourceType,
    processing_status: 'pending'
  })
  
  // Trigger background processing
  await supabase.from('background_jobs').insert({
    job_type: 'process-document',
    input_data: { document_id: docId, source_type: sourceType }
  })
}
```

### Configuring Engine Weights
```typescript
// Update user preferences
await supabase.rpc('update_engine_weights', {
  p_user_id: userId,
  p_weights: {
    'semantic-similarity': 0.30,      // Boost semantic matching
    'conceptual-density': 0.25,       // Increase concept clustering
    'structural-pattern': 0.10,       // Reduce structure weight
    'citation-network': 0.15,
    'temporal-proximity': 0.10,
    'contradiction-detection': 0.05,
    'emotional-resonance': 0.05
  },
  p_normalization_method: 'sigmoid',  // Smooth score distribution
  p_preset_name: 'custom'
})
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
- 7-engine collision detection system
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
├── engines/             # 7 collision detection engines
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

## Testing Guidelines

### Testing Philosophy
- **Pragmatic Coverage**: Target 70% on critical paths rather than 100% everywhere
- **Test What Matters**: Focus on user journeys and critical functionality
- **Use Test Factories**: Consistent test data generation via `tests/factories/`

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

### Test Structure
```
tests/
├── factories/     # Test data generators (documents, chunks, entities)
├── fixtures/      # Static test files
├── mocks/         # MSW handlers for API mocking
└── e2e/          # Playwright E2E tests (future)

src/lib/ecs/__tests__/    # ECS unit tests
worker/tests/             # Worker module tests
```

### Using Test Factories
```typescript
import { factories } from '@/tests/factories'

// Create test data
const doc = factories.document.createProcessed()
const chunks = factories.chunk.createMany(10, 'doc-id')
const flashcard = factories.entity.createFlashcard()

// Reset between tests
beforeEach(() => {
  factories.document.reset()
})
```

### Testing Documentation
- **[docs/testing/README.md](docs/testing/README.md)** - Primary testing guide and quick start
- **[docs/testing/development-workflow.md](docs/testing/development-workflow.md)** - Comprehensive strategy and team workflows  
- **[docs/testing/patterns.md](docs/testing/patterns.md)** - Code examples and testing patterns
- **[docs/testing/TROUBLESHOOTING.md](docs/testing/TROUBLESHOOTING.md)** - Common issues and solutions
- **[docs/testing/.archive/](docs/testing/.archive/)** - Historical documentation and task reports

## Monitoring & Performance

### Key Metrics
- Document processing time: <2 min per hour of content
- Collision detection: <500ms for 100 chunks
- Cache hit rate: >70% for repeated queries
- Embedding generation: ~1000 chunks/minute
- Database queries: <50ms p95

### Performance Patterns
```typescript
// ✅ Stream from storage
const url = await getSignedUrl(markdownPath)
const response = await fetch(url)
const reader = response.body.getReader()

// ❌ Don't load into memory
const { markdown } = await supabase
  .from('documents')
  .select('markdown_content')  // NO!

// ✅ Use pgvector for similarity
const similar = await supabase.rpc('match_chunks', {
  query_embedding: embedding,
  match_threshold: 0.7
})

// ❌ Don't filter in JavaScript
const chunks = await getAllChunks()
const similar = chunks.filter(...)  // NO!
```

## Next Steps

1. **Continue Reader UI**: Markdown renderer, virtual scrolling, selection system
2. **Implement Annotations**: Text selection → ECS persistence
3. **Build Connection Panel**: Display collision detection results
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

Remember: This is an AI-first personal tool. Prioritize connection discovery and knowledge synthesis over traditional features.