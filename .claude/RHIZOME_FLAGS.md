# Rhizome V2 Project Flags

Project-specific behavioral flags for Rhizome architecture enforcement.

## Architecture Enforcement Flags

**--schema-check**
- Trigger: Database writes, migrations, JSONB operations, background_jobs updates
- Behavior: ALWAYS run `psql -c "\d table_name"` before database writes
- Validates: Column existence, data types, JSONB structure, RLS policies
- Prevents: chunks.user_id errors, wrong status values, missing flags

**--ecs-enforce**
- Trigger: Entity creation, component modifications, Operations class changes
- Behavior: Enforce ECS patterns and PascalCase components
- Validates: Position, Visual, Content, Temporal, ChunkRef, Spark, Flashcard, Study components
- Ensures: Operations pattern, factory usage (`createECS()`), revalidatePath() calls

**--no-modal**
- Trigger: UI component creation, shadcn Dialog/AlertDialog usage
- Behavior: Block modals, suggest persistent UI alternatives
- Alternatives: ProcessingDock, RightPanel, AdminPanel, QuickSparkModal, Sheet (mobile), Popover
- Rationale: Maintains reading context, preserves state, non-blocking workflow

**--storage-first**
- Trigger: Large file operations, markdown storage, export generation
- Behavior: Prefer Supabase Storage over PostgreSQL for large content
- Pattern: Storage = source of truth, DB = queryable cache
- Use cases: Document markdown, export bundles, portability archives

**--worker-only**
- Trigger: Document processing, connection detection, background jobs
- Behavior: Route processing to worker module, prevent main app processing
- Validates: No cross-imports, communication via background_jobs table
- Pattern: Main app = UI/Server Actions, Worker = processing pipeline

**--server-action-only**
- Trigger: Mutations, database writes, revalidation needs
- Behavior: Enforce Server Actions for ALL mutations, block API routes
- Pattern: 'use server' → ECS Operations → revalidatePath() → return serializable
- Prevents: Client-side DB calls, API route mutations, missing revalidation

**--component-search-first**
- Trigger: UI component creation, shadcn imports, custom components
- Behavior: Search registries before building custom components
- Order: shadcn → neobrutalism → components/rhizome/ → custom
- Tool: `mcp__shadcn__search_items_in_registries`

**--zod-validate**
- Trigger: JSONB writes, output_data updates, worker job completions
- Behavior: Enforce Zod schema validation for all JSONB writes
- Location: `worker/types/job-schemas.ts`
- Pattern: `JobOutputSchema.parse(data)` before saving
- Prevents: Typos, missing fields, type mismatches in JSONB

## Processing Pipeline Flags

**--local-processing**
- Trigger: Document processing requests, cost optimization needs
- Behavior: Use Docling + Ollama + Transformers.js (zero API cost)
- Mode: LOCAL (no Gemini API calls)
- Use cases: Development, testing, cost-sensitive processing

**--cloud-processing**
- Trigger: Production processing, quality requirements, time constraints
- Behavior: Use Gemini API for processing ($0.20-0.60 per doc)
- Mode: CLOUD (Gemini 2.5 Flash)
- Use cases: Production, high-quality extraction, faster processing

**--orchestrator-required**
- Trigger: Document processing, connection detection, chunking
- Behavior: NEVER bypass orchestrator, always run through `processDocument()`
- Ensures: All 3 engines run (Semantic 25%, Contradiction 40%, Thematic 35%)
- Prevents: Manual engine calls, incomplete processing

## Testing Flags

**--critical-tests**
- Trigger: Before commits, deployment, pull requests
- Behavior: Run `npm run test:critical` - MUST pass
- Rationale: Test replaceability - annotations (hours of work) vs connections (auto-generated)
- Categories: critical/ (must pass) vs stable/ vs flexible/ vs experimental/

**--real-fixtures**
- Trigger: Test creation, test data generation
- Behavior: Use real processed chunks, NEVER Lorem Ipsum
- Source: Fixtures from actual document processing
- Rationale: Tests must validate real-world scenarios

## Quality Flags

**--lint-check**
- Trigger: Before commits, after code generation
- Behavior: Run `npm run lint` and fix errors
- Auto-fix: Most style issues
- Manual: Complex linting errors

**--type-check**
- Trigger: Before commits, TypeScript changes
- Behavior: Run `npm run typecheck` and fix type errors
- Validates: Type safety, inference, compatibility
- Prevents: Runtime type errors, undefined behavior

## Workflow Flags

**--admin-panel**
- Trigger: Storage operations, import/export, job management
- Behavior: Use Admin Panel (Cmd+Shift+A) for system operations
- Tabs: Scanner, Import, Export, Connections, Integrations, Jobs
- Use cases: Portability, debugging, system health

**--quick-capture**
- Trigger: Quick note creation, reading interruptions
- Behavior: Use QuickSparkModal (Cmd+K) for fast capture
- Pattern: Multi-selection → tags → save → continue reading
- Entity: Spark (4-component ECS)

## Migration Flags

**--migration-check**
- Trigger: Schema changes, table modifications
- Behavior: Check latest migration number before creating new
- Command: `ls supabase/migrations/ | tail -1`
- Latest: `068_flashcards_cache_rebuild.sql`
- Pattern: Sequential numbering, descriptive names

## Integration Flags

**--gemini-sdk**
- Trigger: AI operations, embeddings, chat completions
- Behavior: Use `@google/genai` (native SDK), NOT `@google/generative-ai` (deprecated)
- Pattern: Worker jobs → Native SDK, UI features → Vercel AI SDK
- Model: gemini-2.5-flash (65K token context)

**--supabase-storage**
- Trigger: File uploads, downloads, export generation
- Behavior: Use Supabase Storage for large files
- Pattern: `storage.from('bucket').upload()`
- Buckets: document-markdown, exports, attachments

## Flag Priority Rules

**Architecture Safety**: --schema-check, --ecs-enforce, --no-modal, --server-action-only (CRITICAL)
**Processing Integrity**: --orchestrator-required, --worker-only (NEVER bypass)
**Quality Gates**: --critical-tests, --zod-validate, --lint-check, --type-check (before commits)
**Search Before Build**: --component-search-first (efficiency)
**Storage Strategy**: --storage-first (portability and cost optimization)

## Flag Combinations

**New Feature Development**:
```
--component-search-first → --server-action-only → --ecs-enforce →
--schema-check → --zod-validate → --critical-tests
```

**Document Processing**:
```
--worker-only → --orchestrator-required → --schema-check →
--local-processing OR --cloud-processing
```

**UI Component Creation**:
```
--component-search-first → --no-modal → --server-action-only
```

**Database Operations**:
```
--schema-check → --migration-check → --zod-validate → --critical-tests
```
