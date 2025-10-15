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
- **7 Input Methods**: PDF, EPUB, YouTube, Web URLs, Markdown (as-is/clean), Text, Paste
- **AI Pipeline**: Gemini 2.0 for extraction, cleaning, and semantic analysis
- **Modular Processors**: Each format has dedicated processor with error recovery
- **YouTube Enhancement**: Transcript cleaning, fuzzy positioning for annotations
- **EPUB Support**: Full EPUB book processing with metadata extraction

### 2. Local Processing Pipeline ✅ COMPLETE (Optional Mode)

100% local document processing with **zero API costs** and **complete privacy**. Replaces cloud AI services with local alternatives.

#### Architecture Overview
- **Docling**: PDF/EPUB extraction with structural metadata via HybridChunker (768-token chunks, optimized from 512)
  - Flexible pipeline configuration via environment variables (image extraction, OCR, AI enrichment)
  - Page batching for large documents (auto-optimization for >200 pages)
  - Quality-first defaults with opt-in AI features
- **Ollama (Qwen 32B)**: Local LLM for cleanup and metadata extraction
- **Transformers.js**: Local embeddings (768d vectors, aligned with chunker tokenizer)
  - Metadata-enhanced embeddings (heading context prepended to chunk content)
  - 15-25% retrieval quality improvement without modifying stored content
- **5-Layer Bulletproof Matching**: 100% chunk recovery guarantee with metadata preservation

#### Key Components

**Processing Stages:**
1. **Extraction** - Docling with HybridChunker (768 tokens, tokenizer: `Xenova/all-mpnet-base-v2`)
2. **Cleanup** - Ollama (Qwen) for markdown cleaning (optional, with OOM fallback)
3. **Bulletproof Matching** - 5-layer system for chunk remapping:
   - Layer 1: Enhanced fuzzy matching (exact, normalized, multi-anchor, sliding window)
   - Layer 2: Embeddings-based matching (cosine similarity >0.85)
   - Layer 3: LLM-assisted matching (Ollama for difficult cases)
   - Layer 4: Anchor interpolation (synthetic chunks, never fails)
   - Layer 5: Metadata preservation (Docling structural data - heading_path, page numbers, section markers)
4. **Metadata** - PydanticAI with Ollama (structured outputs with validation)
5. **Embeddings** - Transformers.js with metadata enhancement (aligned tokenizer, 768d vectors)

**Confidence Tracking:**
- `exact`: Perfect match
- `high`: >0.95 similarity or strong fuzzy match
- `medium`: 0.85-0.95 similarity or LLM match
- `synthetic`: Interpolated position (user validation recommended)

**Review Checkpoints:**
- After Docling extraction (before cleanup)
- Before chunking (after cleanup)

#### Configuration

```bash
# Enable local mode in .env.local
PROCESSING_MODE=local                         # Set to 'cloud' for Gemini
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M     # or 14b/7b for smaller RAM
OLLAMA_TIMEOUT=600000

# Docling Pipeline Configuration (optional, env var control)
EXTRACT_IMAGES=true              # Default: true (figure/table extraction)
IMAGE_SCALE=2.0                  # Default: 2.0 (144 DPI)
EXTRACT_TABLES=true              # Default: true
CLASSIFY_IMAGES=false            # Default: false (opt-in AI feature)
DESCRIBE_IMAGES=false            # Default: false (opt-in AI feature)
ENRICH_CODE=false                # Default: false (opt-in AI feature)
ENABLE_OCR=false                 # Default: false (for scanned documents)
```

#### Performance & Cost

**Processing Times (M1 Max 64GB):**
- Small PDFs (<50 pages): 3-5 minutes
- Medium PDFs (200 pages): 15-25 minutes (improved ~25-30% with optimizations)
- Large PDFs (500 pages): 60-80 minutes (with automatic page batching)

**Quality Metrics:**
- Chunk recovery: 100% (guaranteed, no data loss)
- Exact matches: 85-90%
- Synthetic chunks: <5% (flagged for review)
- Metadata coverage: >80% (heading_path, page numbers, section markers)
- Embedding enhancement: >70% (metadata-enriched vectors)
- Semantic coherence: >90% (chunks end on sentence boundaries)
- API calls: 0 (completely local)

**Cost Savings:**
- Cloud (Gemini): $0.42/book (500 pages)
- Local: $0.00/book
- 1,000 books: Save $420
- 10,000 books: Save $4,200
- **Bonus**: Complete privacy, no rate limits, works offline

#### System Requirements

**Minimum:**
- 24GB RAM (Qwen 14B)
- Python 3.10+
- Node.js 18+

**Recommended:**
- 64GB RAM (Qwen 32B - best quality)
- Apple M1 Max/Ultra or equivalent

#### Key Files
- `worker/lib/local/ollama-client.ts` - Ollama integration
- `worker/lib/local/bulletproof-matcher.ts` - 5-layer matching system
- `worker/lib/local/embeddings-local.ts` - Local embeddings with Transformers.js
- `worker/lib/local/ollama-cleanup.ts` - Markdown cleanup with OOM fallback
- `worker/lib/local/docling-config.ts` - Flexible Docling pipeline configuration (env var control)
- `worker/lib/chunking/chunker-config.ts` - Shared 768-token configuration
- `worker/lib/chunking/chunk-statistics.ts` - Quality metrics and validation
- `worker/lib/chunking/pydantic-metadata.ts` - Structured metadata extraction
- `worker/lib/chunking/bulletproof-metadata.ts` - Dual-strategy chunk caching with 100% recovery
- `worker/lib/embeddings/metadata-context.ts` - Metadata-enhanced embeddings (heading context)
- `worker/processors/pdf-processor.ts` - PDF pipeline orchestration
- `worker/processors/epub-processor.ts` - EPUB pipeline orchestration
- `worker/scripts/docling_extract.py` - Python Docling wrapper
- `worker/scripts/extract_metadata_pydantic.py` - PydanticAI metadata script

#### Setup & Usage

**Quick Setup:**
```bash
# Install Python dependencies
cd worker
pip install docling==2.55.1 'pydantic-ai[ollama]' sentence-transformers transformers

# Install Ollama and pull model
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:32b-instruct-q4_K_M

# Start Ollama server
ollama serve

# Install Node.js dependencies
npm install ollama @huggingface/transformers

# Configure environment
export PROCESSING_MODE=local

# Run worker
npm run dev
```

**Validation:**
```bash
cd worker

# Integration tests
npm run test:integration

# Metadata validation
npm run validate:metadata

# Test specific components
npx tsx lib/local/__tests__/test-layer1-fuzzy.ts
npx tsx lib/local/__tests__/test-orchestrator.ts <document_id>
```

**For detailed setup instructions, see:** `docs/local-pipeline-setup.md`

#### Critical Anti-Patterns

From implementation experience:
- ❌ Don't skip Python `stdout.flush()` - IPC will hang
- ❌ Don't use Ollama streaming for structured outputs - breaks JSON parsing
- ❌ Don't mismatch tokenizer (HybridChunker must match embeddings model)
- ❌ Don't use Q8 quantization on M1 Max - too slow, use Q4_K_M
- ❌ Don't skip confidence tracking - user needs transparency
- ❌ Don't assume 100% exact matches - plan for synthetic chunks
- ❌ Don't test with real AI in CI - mock Ollama and Python subprocesses
- ❌ Don't ignore OOM errors - graceful fallback to smaller model or regex-only
- ❌ Don't use invalid Docling parameters - `heading_as_metadata` doesn't exist, headings are automatic
- ❌ Don't hardcode chunk sizes - use shared configuration from `chunker-config.ts`
- ❌ Don't modify stored chunk content - enhance embeddings only, preserve original text
- ❌ Don't skip metadata validation - chunk statistics catch quality regressions early

#### Troubleshooting

**Common Issues:**
1. **Ollama not responding**: Verify `ollama serve` is running, check `http://127.0.0.1:11434/api/version`
2. **OOM errors**: Switch to smaller model (`OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M`)
3. **High synthetic chunks (>10%)**: Check Docling extraction quality, verify PDF is text-based
4. **Python subprocess hangs**: Ensure `sys.stdout.flush()` after every JSON write
5. **Wrong embedding dimensions**: Verify `pooling: 'mean'` and `normalize: true` in Transformers.js

**Documentation:**
- Implementation details: `docs/tasks/local-processing-pipeline-v1/README.md`
- Setup guide: `docs/local-pipeline-setup.md`
- Architecture decisions: `docs/tasks/local-processing-pipeline-v1/PHASES_OVERVIEW.md`
- Docling optimization: `docs/tasks/docling-optimization-v1.md` (completed all 20 tasks)
- Pipeline configuration: `docs/docling-configuration.md` (environment variables and feature guide)

### 3. Chonkie Integration System ✅ COMPLETE (New!)

**Philosophy**: ONE unified chunking pipeline with 9 user-selectable strategies, replacing 3 parallel paths with a single predictable system.

#### The Transformation

**BEFORE (3 Parallel Paths):**
```
❌ Inline metadata (experimental, PDF only)
❌ Bulletproof matcher AS chunking system
❌ Cloud chunking (Gemini semantic)
```

**AFTER (1 Unified Path):**
```
✅ Download → Docling Extract → Cleanup → Bulletproof (coord map) →
   Review → Chonkie Chunk → Metadata Transfer → Enrich → Embed → Save
```

**Business Impact:**
- **Simplicity**: -223 net lines of code (removed 823, added 600)
- **Flexibility**: 9 chunking strategies for different document types
- **Quality**: 15%+ connection quality improvement (semantic/neural chunkers)
- **Cost**: $0 additional (all LOCAL mode processing)
- **Maintenance**: Single pipeline = easier debugging, testing, optimization

#### The 9 Chunking Strategies

| Strategy | Use Case | Speed | Quality |
|----------|----------|-------|---------|
| **token** | Fixed-size chunks | 2-3 min | Basic |
| **sentence** | Sentence boundaries | 3-4 min | Good |
| **recursive** | Structural (DEFAULT) | 3-5 min | High |
| **semantic** | Narrative, thematic | 8-15 min | Very High |
| **late** | High-quality RAG | 10-20 min | Very High |
| **code** | AST-aware code | 5-10 min | High (code) |
| **neural** | BERT semantic | 15-25 min | Very High |
| **slumber** | Agentic LLM | 30-60 min | Highest |
| **table** | Markdown tables | 3-5 min | Good (tables) |

**Recommended Default**: **recursive** - best balance of speed, quality, and flexibility for 80% of documents.

#### Key Components

**Chonkie Python Wrapper** (`worker/scripts/chonkie_chunk.py`):
- stdin/stdout JSON IPC pattern
- sys.stdout.flush() after output (CRITICAL: prevents IPC hangs)
- Supports all 9 chunker types
- Character offset guarantee (start_index, end_index)

**TypeScript IPC** (`worker/lib/chonkie/chonkie-chunker.ts`):
- Dynamic timeout based on chunker type + document size
- Character offset validation after chunking (CRITICAL)
- Proper subprocess error handling

**Metadata Transfer** (`worker/lib/chonkie/metadata-transfer.ts`):
- Overlap detection between Docling and Chonkie chunks
- Expected overlap rate: 70-90% (this is GOOD, not a bug)
- Aggregates heading_path, pages, bboxes from overlapping Docling chunks
- Confidence scoring: high/medium/low based on overlap quality
- Interpolation fallback for no-overlap cases (<10% expected)

#### Architecture Decisions

1. **ALWAYS run Chonkie** - No fast paths, no branching, no CLOUD/LOCAL split
2. **Docling chunks = metadata anchors** - Heading paths, pages, bboxes
3. **Chonkie chunks = actual chunks** - Used for search, connections, annotations
4. **Bulletproof matcher = coordinate mapper** - Helps metadata transfer via overlap detection
5. **9 user-selectable strategies** - Choose optimal chunker per document type

#### Quality Metrics

**Success Criteria:**
- **Overlap coverage**: 70-90% (metadata transfer quality)
- **Metadata recovery**: >90% (chunks with heading_path OR page_start)
- **Character offsets**: 100% accuracy (validated after chunking)
- **Processing times**: Within acceptable ranges per strategy

**Current Performance:**
- Overlap coverage: 100% (excellent in testing)
- High confidence: 92% of chunks
- Interpolated chunks: 0% (no fallback needed)
- Processing time: 2 seconds for recursive (13 chunks)

#### Database Schema (Migration 050)

```sql
-- chunks table
ALTER TABLE chunks
ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid',
ADD COLUMN metadata_overlap_count INTEGER DEFAULT 0,
ADD COLUMN metadata_confidence TEXT DEFAULT 'high',
ADD COLUMN metadata_interpolated BOOLEAN DEFAULT false,
ADD COLUMN token_count INTEGER;

-- documents table
ALTER TABLE documents
ADD COLUMN chunker_type TEXT DEFAULT 'recursive';

-- user_preferences table
ALTER TABLE user_preferences
ADD COLUMN default_chunker_type TEXT DEFAULT 'recursive';
```

#### UI Integration

**Upload Form** (`src/components/library/UploadZone.tsx`):
- Chunker selection dropdown with all 9 strategies
- Time estimates per strategy (e.g., "Recursive - Structural (Recommended, 3-5 min)")
- Info alerts for slower strategies
- Special warning for slumber (30-60 min)

**Quality Panel** (`src/components/sidebar/ChunkQualityPanel.tsx`):
- Confidence badges (high/medium/low/interpolated)
- Overlap count display per chunk
- Existing validation workflow (view/accept/fix)
- Statistics: High (92%) / Medium (5%) / Low (2%) / Interpolated (1%)

**Document Header** (`src/components/reader/DocumentHeader.tsx`):
- Color-coded chunker badge next to title
- Tooltip shows full strategy description
- Green (recursive), Blue (semantic), Purple (neural), etc.

#### Setup & Usage

```bash
# Install Chonkie
cd worker
pip install chonkie

# Verify installation
python3 -c "from chonkie import RecursiveChunker; print('OK')"

# Integration test
npx tsx scripts/test-chonkie-integration.ts <document_id>

# Test all 9 chunker types
npx tsx scripts/test-chonkie-integration.ts --all-chunkers <document_id>

# Generate test report
npx tsx scripts/test-chonkie-integration.ts --all-chunkers --report <document_id>
```

#### Critical Anti-Patterns

- ❌ Don't skip `sys.stdout.flush()` in Python - IPC will hang
- ❌ Don't skip character offset validation - metadata transfer will fail
- ❌ Don't assume 100% overlap coverage - 70-90% is expected and excellent
- ❌ Don't ignore interpolated chunks - flag for user review via ChunkQualityPanel
- ❌ Don't use chunker strategies without understanding trade-offs (speed vs quality)

#### Troubleshooting

**Common Issues:**
1. **Python subprocess hangs**: Ensure `sys.stdout.flush()` after every JSON write
2. **Character offset mismatch**: Verify no middleware is modifying markdown between stages
3. **Low overlap coverage (<70%)**: Check Docling extraction quality, verify PDF is text-based
4. **Slow chunking**: Use faster strategy (recursive or token), ensure sufficient RAM

#### Documentation

- **Complete Guide**: `docs/PROCESSING_PIPELINE.md` - Full 10-stage pipeline documentation
- **PRP**: `docs/prps/chonkie-integration.md` - Original specification (9/10 confidence)
- **Task Breakdown**: `docs/tasks/chonkie-integration.md` - 16 tasks across 3 weeks
- **Chonkie Docs**: https://docs.chonkie.ai/oss/chunkers/overview - Official API reference

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

### 6. Storage-First Portability System ✅ COMPLETE (New!)

**Philosophy**: Storage is the source of truth for AI-enriched data. Database is a queryable cache.

#### Core Components

**Automatic Storage Export**:
- Every document processing automatically saves to Supabase Storage
- Files: `chunks.json`, `metadata.json`, `manifest.json`, `cached_chunks.json` (LOCAL mode)
- Zero-cost reprocessing: Import from Storage instead of reprocessing documents
- Development velocity: DB reset + restore in 6 minutes vs 25 minutes reprocessing

**Admin Panel** (Cmd+Shift+A):
- **Scanner Tab**: Compare Storage vs Database state, identify sync issues
- **Import Tab**: Restore from Storage with 3 conflict resolution strategies
- **Export Tab**: Generate ZIP bundles for complete document portability
- **Connections Tab**: Reprocess connections with Smart Mode (preserves user-validated)
- **Integrations Tab**: Obsidian and Readwise operations
- **Jobs Tab**: Background job management

**Conflict Resolution**:
1. **Skip**: Keep existing data, ignore import
2. **Replace**: Delete all, use import data (resets annotations)
3. **Merge Smart**: Update metadata, preserve chunk IDs and annotations (recommended)

**Connection Reprocessing Modes**:
1. **Reprocess All**: Fresh regeneration (deletes all connections)
2. **Add New**: Only process newer documents
3. **Smart Mode**: Preserves user-validated connections + backup to Storage

**Key Benefits**:
- **Cost Savings**: Save $0.20-0.60 per document by avoiding reprocessing
- **Data Safety**: Zero data loss, Storage backups automatic
- **Portability**: Complete ZIP bundles for backup/migration
- **Development**: Quick DB resets without losing work

**File Structure**:
```
Storage: documents/{userId}/{documentId}/
├── source.pdf or source.epub          # Original file
├── content.md                          # Cleaned markdown
├── chunks.json                         # Enriched chunks (final)
├── metadata.json                       # Document metadata
├── manifest.json                       # File inventory + costs
├── cached_chunks.json                  # Docling chunks (LOCAL mode only)
└── validated-connections-*.json        # Smart Mode backups
```

**Validation**:
```bash
# Quick smoke tests (< 1 second)
npx tsx scripts/validate-complete-system.ts --quick

# Full validation with database checks
npx tsx scripts/validate-complete-system.ts --full

# Manual testing guide
docs/tasks/MANUAL_TESTING_CHECKLIST_T024.md
```

**Documentation**:
- Complete guide: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md`
- Task breakdown: `docs/tasks/storage-first-portability.md`
- Implementation summary: `docs/tasks/T024_COMPLETION_SUMMARY.md`

### 7. Unified Job Display System ✅ COMPLETE (Session 4)

**Philosophy**: Single polling source, context-aware displays, no redundancy

#### Job Display Architecture

**Background Jobs Store** (`src/stores/admin/background-jobs.ts`):
- Single Zustand store for ALL background jobs
- One 2-second polling interval (shared across UI)
- Auto-start/stop polling based on active jobs
- Job lifecycle management (register, update, replace, remove)
- Computed selectors: `activeJobs()`, `completedJobs()`, `failedJobs()`

**Admin Panel Store** (`src/stores/admin/admin-panel.ts`):
- Tracks Admin Panel open/close state
- Coordinates with ProcessingDock to hide redundancy
- Tab state management

#### Display Components

**1. ProcessingDock** (Bottom-Right Dock)
- **Shows**: Active jobs only (processing/pending)
- **Hides**: When Admin Panel is open
- **Features**: Collapse to mini badge, "View All Jobs →" link
- **Position**: Fixed bottom-right, 384px width
- **Uses**: background-jobs store (no separate polling)

**Before** (Original Dock):
- Full-width bottom sheet
- Showed completed/failed jobs
- Separate 5-second polling + real-time subscriptions
- "Clear Completed" button
- Always visible

**After** (Hybrid Approach):
- Bottom-right floating dock
- Active jobs only
- Shares background-jobs store polling
- Hides on Admin Panel
- Collapse/expand toggle

**2. Jobs Tab** (Admin Panel)
- **Shows**: ALL jobs with 7-filter system
- **Features**: Type filters (Import, Export, Connections), Status filters (Active, Completed, Failed)
- **Purpose**: Comprehensive job history and management
- **Uses**: Shared JobList component

**3. Import Tab** (Admin Panel)
- **Shows**: Import jobs only
- **Features**: Focused import workflow, no filter clutter
- **Uses**: Shared JobList component with `showFilters={false}`

#### Shared JobList Component

**Location**: `src/components/admin/JobList.tsx`

**Features**:
- Reusable across Jobs tab and Import tab
- 7 filter tabs: All, Import, Export, Connections, Active, Completed, Failed
- Job cards with status icons, progress bars, error messages
- Sort by creation time (newest first)
- Badge counts for each filter

**Benefits**:
- DRY: ~200 lines of shared code
- Maintainable: Fix bugs once, applies everywhere
- Extensible: Easy to add new job types
- Type-safe: Full TypeScript support

#### Key Improvements

**1. Eliminated Redundancy**:
- Before: Jobs polled in 2 places (ProcessingDock + Admin Panel stores)
- After: Single background-jobs store with one polling interval

**2. Context-Aware**:
- ProcessingDock hides when Admin Panel is open
- No duplicate job displays

**3. Clear Mental Model**:
- ProcessingDock = "Quick glance at active work"
- Jobs Tab = "Comprehensive history and management"
- Import Tab = "Focused import workflow"

**4. Reduced Screen Clutter**:
- Mini badge when collapsed (e.g., "⚙️ 2 active jobs")
- Auto-hide when no active jobs
- Bottom-right position (not full-width bar)

#### Usage Examples

```typescript
// ProcessingDock auto-hides on Admin Panel
const { isOpen } = useAdminPanelStore()
if (isOpen) return null

// Uses shared job store
const { activeJobs } = useBackgroundJobsStore()
const jobs = activeJobs() // Only processing/pending

// "View All Jobs" opens Admin Panel
const { open } = useAdminPanelStore()
<Button onClick={() => open('jobs')}>View All →</Button>
```

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
- 47+ migrations applied (latest: 047_chunk_validation_corrections for user validation workflow)
- ECS tables (entities, components)
- Chunks with embeddings and metadata
- Cached chunks table (original Docling extractions for zero-cost reprocessing)
- Chunk validation/correction system (warnings, overlap detection, correction history)
- User preferences for weight tuning
- Hybrid storage (files + database)
- Background jobs table
- Chunk connections table (3-engine system)
- Import pending table (Readwise integration)
- Obsidian settings table

#### Worker Module
- Modular processor architecture
- Processor router by source type
- Performance monitoring
- Cache manager
- Weight configuration system
- Comprehensive test coverage (88-100%)

#### Storage-First Portability System ✅ COMPLETE
- **Automatic Storage Export**: All processing saves to Supabase Storage (chunks.json, metadata.json, manifest.json)
- **Admin Panel**: Sheet-based UI with 6 tabs (Scanner, Import, Export, Connections, Integrations, Jobs)
- **Storage Scanner**: Compare Storage vs Database state with sync actions
- **Import Workflow**: Restore from Storage with 3 conflict resolution strategies (skip, replace, merge_smart)
- **Connection Reprocessing**: Smart Mode preserves user-validated connections
- **Export Workflow**: ZIP bundle generation for complete document portability
- **Integration Hub**: Obsidian and Readwise operations centralized
- **Keyboard Shortcuts**: Cmd+Shift+A to toggle Admin Panel, number keys for tabs
- **Comprehensive Validation**: Automated validation script + manual testing checklist

**Key Benefits**:
- **Cost Savings**: $0.20-0.60 saved per document by avoiding reprocessing
- **Development Speed**: DB reset + restore in 6 minutes vs 25 minutes reprocessing
- **Data Safety**: Zero data loss, Storage is source of truth
- **Portability**: Complete document bundles for backup/migration

**Access**: Database icon in TopNav or press `Cmd+Shift+A`

**Validation**: `npx tsx scripts/validate-complete-system.ts --quick`

**Documentation**: See `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` for complete system guide

### 🚧 IN PROGRESS

#### Document Reader & Annotations
- [x] Markdown renderer (react-markdown with KaTeX)
- [x] Virtual scrolling (react-virtuoso)
- [x] Text selection → annotation flow
- [x] Annotation persistence with ECS
- [ ] Right panel for connections display

#### Readwise Integration
- [x] Import pending table for review workflow
- [x] Highlight import with metadata
- [ ] UI for reviewing and importing highlights

### 📋 NOT STARTED

#### Study System
- [ ] Flashcard creation from selections
- [ ] FSRS spaced repetition algorithm
- [ ] Study mode interface
- [ ] Progress tracking

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
├── processors/           # Format-specific processors (pdf, epub, youtube, web, markdown, text, paste)
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
5. **Storage for source of truth + portability, Database for queryable cache + derived data**
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

# Benchmarking (from worker directory)
npm run benchmark:all                    # All performance benchmarks
npm run benchmark:batch-processing       # Batch processing benchmarks
npm run benchmark:pdf-processing         # PDF processing benchmarks
npm run benchmark:orchestration          # Orchestration benchmarks
npm run benchmark:semantic-engine        # Semantic similarity benchmarks
npm run benchmark:metadata-quality       # Metadata quality benchmarks
npm run benchmark:metadata-quality:real  # Metadata quality with real AI
npm run benchmark:quick                  # Quick benchmarks only
npm run benchmark:report                 # Comprehensive report
npm run benchmark:compare                # Compare with baseline
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
  .from('connections')
  .select(`
    *,
    source_chunk:chunks!source_chunk_id(id, content, summary),
    target_chunk:chunks!target_chunk_id(id, content, summary)
  `)
  .eq('source_chunk.document_id', documentId)
  .order('strength', { ascending: false })

// Get by engine type
const { data: semantic } = await supabase
  .from('connections')
  .select('*')
  .eq('connection_type', 'semantic_similarity')
  .gte('strength', 0.7)

// Get cross-document connections only
const { data: crossDoc } = await supabase
  .from('connections')
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
- **Architecture**: `docs/ARCHITECTURE.MD` - Complete system design
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

### Processing Pipeline
- **Processing Pipeline Overview**: `docs/PROCESSING_PIPELINE.md`
- **Bullet Proof Metadata Extraction**: `docs/processing-pipeline/bulletproof-metadata-extraction.md`
- **Docling Patterns**: `docs/processing-pipeline/docling-patterns.md`

## Zustand Checklist

### ✅ Use Zustand for:
- [ ] State shared across multiple components
- [ ] State that persists across unmounts
- [ ] State updated from multiple locations
- [ ] Complex state requiring coordinated updates
- [ ] Personal preferences (engine weights, UI settings)

### ❌ Don't use Zustand for:
- [ ] Component-local UI state (hover, focus)
- [ ] Form inputs and validation
- [ ] Temporary loading indicators
- [ ] Animation states
- [ ] Props that don't need to be shared

### 🎯 Best Practices:
- [ ] Subscribe to minimal state slices
- [ ] Normalize complex state (weights sum to 1.0)
- [ ] Define actions for all state mutations
- [ ] Use persist middleware for user preferences
- [ ] Batch related state updates
- [ ] Test store actions independently
- [ ] Reset state when appropriate

---

## Zustand Quick Reference

### Import Statements
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
```

### Basic Store Template
```typescript
interface MyState {
  value: number
  setValue: (value: number) => void
}

export const useMyStore = create<MyState>((set, get) => ({
  value: 0,
  setValue: (value) => set({ value })
}))
```

### Usage in Components
```typescript
// Subscribe to specific value
const value = useMyStore(state => state.value)

// Get action
const setValue = useMyStore(state => state.setValue)

// Get state outside React
const currentValue = useMyStore.getState().value
```

### Persistence
```typescript
export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({ /* store definition */ }),
    {
      name: 'my-storage',
      partialize: (state) => ({ value: state.value })
    }
  )
)
```


## Readwise Integration

Rhizome includes a Readwise highlight import system with a review workflow:

### Import Flow
1. User imports highlights from Readwise
2. Highlights stored in `import_pending` table for review
3. User reviews and selects which highlights to import
4. Selected highlights converted to annotations via ECS
5. Annotations attached to chunks with proper positioning

### Database Schema
- `import_pending` table stores highlights awaiting review
- Each highlight has: content, book_title, author, location, highlight_url, tags
- After approval, highlights become annotation components in ECS

## Other Docs

- Virtuoso - `https://virtuoso.dev/` - Virtual Scrolling for our document reader
- AI SDK - `https://ai-sdk.dev/docs/introduction` - The AI SDK is the TypeScript toolkit designed to help developers build AI-powered applications and agents with React, Next.js, Vue, Svelte, Node.js, and more.
- Marked.js - `https://marked.js.org/` - a low-level markdown compiler for parsing markdown without caching or blocking for long periods of time.
- Docling - `https://docling-project.github.io/docling/` -Docling simplifies document processing, parsing diverse formats — including advanced PDF understanding — and providing seamless integrations with the gen AI ecosystem.

## Miscellaneous Rules
- Always check database migration number and increment by one. **Current latest: 050** (see supabase/migrations folder for examples)
- When creating migrations, use format: `NNN_descriptive_name.sql` where NNN is zero-padded number
- EPUB files are supported as a source type alongside PDF - handle both when implementing document features
- Readwise import uses a review workflow via `import_pending` table before creating documents
- Cached chunks system: `cached_chunks` table stores original Docling chunks for zero-cost LOCAL mode reprocessing (migration 046)
- Chunk metadata: `chunks` table extended with Docling structural metadata (migration 047):
  - `heading_path` (TEXT[]) - Heading hierarchy for citations
  - `heading_level` (INTEGER) - Depth in heading tree
  - `section_marker` (TEXT) - Section identifier for EPUBs
- shadcn/ui Pattern: Always use npx shadcn@latest add <component> to install UI components rather than creating them manually. This ensures:
  - Correct Radix UI primitives
  - Consistent styling with the design system
  - Proper TypeScript types

Remember: This is an AI-first personal tool. Prioritize connection discovery and knowledge synthesis over traditional features.