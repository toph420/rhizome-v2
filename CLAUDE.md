# CLAUDE.md - AI Assistant Guide for Rhizome V2

## ⚡ SuperClaude Framework Integration

**Project uses SuperClaude 4.1.5** (project-specific installation)

**See**: `.claude/CLAUDE.md` for SuperClaude configuration and behavioral modes
**Framework Features**: 26 commands (`/sc:`), 7 modes, 17+ agents, Rhizome-specific flags
**Custom Agents**: ECS Architect, Storage Manager, Worker Coordinator (in `.claude/agents/rhizome/`)

---

## 📍 Quick Navigation
[Critical Rules](#-critical-rules) • [Common Tasks](#-common-tasks) • [Architecture](#%EF%B8%8F-architecture-patterns) • [Reference](#-quick-reference)

---

## 🔴 Critical Rules

### Schema Safety (🔴 CRITICAL)

**ALWAYS check schema before database writes:**
```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d table_name"
```

**ALWAYS check latest migration number:**
```bash
ls supabase/migrations/ | tail -1
# Check dynamically - migration number changes frequently
```

**Migration workflow (🔴 CRITICAL):**
```bash
# Create migration
npx supabase migration new add_field_name

# Apply INCREMENTALLY (normal development - preserves data)
npx supabase db push

# Full reset ONLY when needed (wipes all data)
npx supabase db reset  # Initial setup, conflicts, or clean slate
```

**Dual-Worktree Migration Workflow (🔴 CRITICAL):**

This project uses a dual-worktree setup for development and production:

**Worktree Structure:**
- `/Users/topher/Code/rhizome-v2` - Production (main branch, runs worker)
- `/Users/topher/Code/rhizome-v2-dev-1` - Development (feature branches, ALL development happens here)

**Development Pattern (ALWAYS use dev worktree):**
```bash
# 1. Develop in dev worktree (rhizome-v2-dev-1)
cd /Users/topher/Code/rhizome-v2-dev-1
git checkout -b feature/my-feature  # Or existing feature branch

# 2. Create migration (tracked by git)
npx supabase db diff -f my_feature_migration

# 3. Test locally (incremental)
npx supabase migration up

# 4. Commit (code + migration together!)
git add supabase/migrations/
git add src/
git commit -m "feat: my feature"
git push origin feature/my-feature

# 5. Merge to main (in dev worktree!)
git checkout main
git pull origin main
git merge feature/my-feature --no-edit
git push origin main  # → Triggers Vercel deployment

# 6. Push migration to cloud (IMMEDIATELY after git push)
npx supabase db push  # → Applies migration to production database

# 7. Optional: Update production worker (if worker code changed)
cd /Users/topher/Code/rhizome-v2
git pull origin main
# Restart worker if needed
```

**Critical Rules:**
- ✅ ALL development in `rhizome-v2-dev-1` worktree (never in production worktree)
- ✅ Merge to main happens in dev worktree (not production worktree)
- ✅ Push migration (`npx supabase db push`) IMMEDIATELY after `git push origin main`
- ✅ Migration files are tracked by git (committed with code)
- ✅ Only dev worktree is linked to Supabase (production worktree just runs worker)
- ❌ NEVER develop in production worktree (`rhizome-v2`)
- ❌ NEVER push migrations before pushing code to main
- ❌ NEVER skip `npx supabase db push` after deploying new code

**Why this works:**
- Migrations are just SQL files tracked by git
- They move between branches during merge (like any other file)
- `git push origin main` → Vercel deploys UI
- `npx supabase db push` → Cloud DB gets schema
- Timing control: You decide when to apply migrations

**See**: `docs/MIGRATION_WORKFLOW.md` for complete guide, `docs/DEPLOY.md` for deployment

**Common mistakes:**
- ❌ Using `db reset` for every change - Wipes all data unnecessarily
- ✅ Use `db push` for normal development (incremental, preserves data)
- ❌ `chunks.user_id` - Doesn't exist (user comes via RLS from documents)
- ❌ `documents.chunk_count` - Doesn't exist (not stored)
- ❌ `documents.processed_at` - Wrong name (use `processing_completed_at`)
- ❌ `processing_status: 'processed'` - Wrong value (UI expects `'completed'`)
- ❌ Missing flags - Always set `markdown_available` and `embeddings_available` to `true`
- ✅ Check `supabase/migrations/` for latest schema

**Required fields for common operations:**
- **Chunks insert**: `document_id`, `content`, `chunk_index`, `chunker_type`, `token_count`
- **Chunks optional**: All metadata fields, `heading_path`, `page_start/end`, `bboxes`, position fields, Chonkie metadata
- **Documents update**: Use `processing_completed_at` (not `processed_at`), include `outline` and `metadata` JSONB fields
- **Connections insert**: `source_chunk_id`, `target_chunk_id`, `connection_type`, `strength`, `auto_detected`, `discovered_at`

**See**: `docs/SCHEMA_SAFETY_GUIDELINES.md` for complete prevention strategy

---

### Naming Conventions (🔴 CRITICAL)

**Four-tier system:**
- PostgreSQL columns: `snake_case` (e.g., `created_at`, `output_data`)
- JSONB fields (`output_data`): **camelCase** (e.g., `downloadUrl`, `zipFilename`)
- TypeScript: `camelCase` variables, `PascalCase` types
- Files: `kebab-case` (e.g., `export-document.ts`)

**Why camelCase in output_data?**
- JSONB is schemaless - PostgreSQL doesn't enforce types anyway
- Simpler - No transformation layer, frontend/backend share same structure
- Less error-prone - Fewer places for naming bugs

**ALWAYS validate output_data with Zod:**
```typescript
// worker/types/job-schemas.ts
import { z } from 'zod'

export const ExportJobOutputSchema = z.object({
  success: z.boolean(),
  documentCount: z.number(),      // ✅ camelCase in JSONB
  downloadUrl: z.string().url(),  // ✅ camelCase in JSONB
})

// In handler - ALWAYS validate before saving
const outputData = {
  success: true,
  documentCount: documents.length,
  downloadUrl: signedUrl,
}

ExportJobOutputSchema.parse(outputData) // Catches typos!
```

**Required files:**
- `worker/types/job-schemas.ts` - All Zod schemas
- Import in every handler - NEVER skip validation

❌ NEVER skip Zod validation - catches typos before they reach UI

---

### No Modals Rule (🔴 CRITICAL)

❌ **NEVER use blocking modals:**
```typescript
<Dialog open={open}>
  <CreateFlashcard />
</Dialog>
```

✅ **ALWAYS use persistent UI:**
- `ProcessingDock` - Bottom-right status
- `RightPanel` - Side panel (6 tabs)
- `AdminPanel` - Cmd+Shift+A
- `QuickSparkModal` - Cmd+K quick capture
- `Sheet` - Mobile only
- `Popover` - Non-blocking overlays

**Why?** Modals block reading workflow and lose context. Persistent UI maintains state and user flow.

**See**: `docs/UI_PATTERNS.md` for complete guide

---

### Server Actions Only (🔴 CRITICAL)

✅ **Use Server Actions for ALL mutations:**
```typescript
// app/actions/annotations.ts
'use server'

export async function createAnnotation(data: AnnotationData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const ecs = createECS()
  const ops = new AnnotationOperations(ecs, user.id)
  const entityId = await ops.create(data)

  revalidatePath(`/read/${data.documentId}`)
  return { success: true, id: entityId }
}
```

❌ NEVER use API routes for mutations
❌ NEVER use direct database calls from client components

**Why this rule works for Rhizome:**
- **Worker communication**: Uses `background_jobs` table (database-driven), NOT HTTP endpoints
- **Type safety**: Shared types between frontend/backend, no HTTP boundary
- **Transactional**: Database operations are atomic, queuing/retry built-in
- **Zero network overhead**: No HTTP layer between worker and main app

**When to ACTUALLY use API routes (concrete needs only):**
- ✅ External webhooks (Readwise push notifications, if implemented)
- ✅ Public export APIs (if sharing knowledge graph publicly)
- ✅ SSE streaming (Server Actions can't stream events)
- ❌ Worker communication (already solved via database)
- ❌ "Just in case" future flexibility (YAGNI applies)

**Pattern:**
1. Server Action in `app/actions/`
2. Use ECS Operations classes
3. Call `revalidatePath()` to update UI
4. Return serializable data only

---

### Component Search First (🔴 CRITICAL)

🔴 **NEVER rebuild existing components!**

**Before building ANY UI component:**
1. Search shadcn registry: `mcp__shadcn__search_items_in_registries`
2. Check neobrutalism registry
3. Review existing `components/rhizome/`
4. THEN build custom (if no match found)

**Folder structure:**
- `components/rhizome/` - **ALL components used in Rhizome** (copy from shadcn/neobrutalism here)
- `components/reader/` - Custom reader-specific components (only when no library equivalent)
- `components/admin/` - Admin Panel tabs (6 tabs)
- `components/sidebar/` - RightPanel tabs (6 tabs)
- `components/layout/` - Docks, panels, persistent UI

**Pattern:** Copy components to `components/rhizome/` when using them, don't reference external libraries directly.

---

### Top 10 Anti-Patterns (🔴 CRITICAL)

1. ❌ Don't skip Python `stdout.flush()` - IPC will hang
2. ❌ Don't use modals - Always use docks/panels/overlays
3. ❌ Don't store markdown in DB - Use Supabase Storage
4. ❌ Don't bypass orchestrator - All 3 engines run through `processDocument()`
5. ❌ Don't skip Zod validation - Catches typos before they reach UI
6. ❌ Don't assume schema fields exist - Check with `psql \d table_name` first
7. ❌ Don't use API routes for mutations - Use Server Actions only
8. ❌ Don't rebuild shadcn components - Search registry first
9. ❌ Don't skip metadata validation - Chunk statistics catch quality regressions
10. ❌ Don't assume 100% overlap coverage - 70-90% is expected and excellent for Chonkie


**Detection:** Run `npm run test:critical` before commits

(🔴 CRITICAL) Never provide timeline estimates (e.g., "this will take X weeks/days/hours"). Focus only on what needs to be done, not how long it might take.

---

## 🎯 Common Tasks

### "I need to add a job type"

**Checklist:**
1. ✅ Check latest migration: `ls supabase/migrations/ | tail -1`
2. ✅ Check schema: `psql -c "\d background_jobs"`
3. ✅ Add Zod schema in `worker/types/job-schemas.ts` (camelCase fields)
4. ✅ Create handler in `worker/handlers/{job-type}.ts`
5. ✅ Validate output_data before saving: `JobOutputSchema.parse(data)`
6. ✅ Add to router in `worker/index.ts`

**Example:**
```typescript
// worker/types/job-schemas.ts
export const MyJobOutputSchema = z.object({
  downloadUrl: z.string().url(),  // ✅ camelCase in JSONB
  itemCount: z.number(),
})

// worker/handlers/my-job.ts
const outputData = { downloadUrl: url, itemCount: 5 }
MyJobOutputSchema.parse(outputData) // ALWAYS validate

await updateJob(jobId, {
  status: 'completed',
  output_data: outputData,  // snake_case column, camelCase content
})
```

---

### "I need to create a UI component"

**Decision tree:**
```
Need UI component?
├─ Search shadcn registry → Found? → Copy to components/rhizome/
├─ Search neobrutalism → Found? → Copy to components/rhizome/
├─ Check components/rhizome/ → Exists? → Compose with existing
├─ Domain component (ConnectionCard, FlashcardCard)?
│  └─ Use Feature-Rich pattern (see below)
└─ Nothing exists? → Build custom in components/reader/
```

**For domain components - use Feature-Rich pattern:**
```typescript
// components/rhizome/flashcard-card.tsx
'use client'

export function FlashcardCard({ flashcard, isActive, onClick }) {
  // 1. Internal state (no prop drilling)
  const [flipped, setFlipped] = useState(false)

  // 2. Server actions (colocated)
  const handleReview = async (rating: number) => {
    await reviewFlashcard(flashcard.id, rating)
  }

  // 3. Keyboard shortcuts (when active)
  useEffect(() => {
    if (!isActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '4') {
        handleReview(Number(e.key))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isActive])

  // 4. Self-contained UI with all logic
  return (
    <Card>
      {/* Flip animation, keyboard hints, review buttons */}
    </Card>
  )
}
```

**Existing feature-rich components:**
- `ConnectionCard` (`components/rhizome/connection-card.tsx`) - v/r/s shortcuts, feedback capture
- `AnnotationCard` (`components/rhizome/annotation-card.tsx`) - Colored borders, inline editing
- `SparkCard` (`components/rhizome/spark-card.tsx`) - Selection badges, expand/collapse
- `FlashcardCard` (`components/rhizome/flashcard-card.tsx`) - Flip animations, 1/2/3/4 shortcuts
- `DeckCard` (`components/rhizome/deck-card.tsx`) - Study stats, progress visualization

**Use this pattern when:**
- ✅ Domain objects in multiple contexts (study/browse/search)
- ✅ Complex interactions (shortcuts, animations, state)
- ✅ Server actions needed
- ❌ Pure design system components (use shadcn, copy to rhizome/)
- ❌ One-off unique UI (custom component)

**See**: `docs/UI_PATTERNS.md` for complete Feature-Rich Components guide

---

### "I need to add database fields"

**Schema Safety Checklist:**
```bash
# 1. Check latest migration number
ls supabase/migrations/ | tail -1

# 2. Check current schema FIRST
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d table_name"

# 3. Create migration (use next number)
npx supabase migration new add_field_name

# 4. Write migration SQL

# 5. Apply migration (INCREMENTAL - doesn't wipe data)
npx supabase db push
```

**Migration Commands:**
| Command | What it does | When to use |
|---------|--------------|-------------|
| `npx supabase db push` | Apply pending migrations only | **Normal development** (incremental changes) |
| `npx supabase db reset` | Drop all → Rebuild from scratch | Initial setup, migration conflicts, clean slate |
| `npx supabase migration up` | Apply specific migration | Granular control |

**Common gotchas:**
- ❌ Using `db reset` for every change - Wipes all data unnecessarily
- ❌ `chunks.user_id` - Doesn't exist (RLS via documents)
- ❌ `documents.chunk_count` - Doesn't exist (not stored)
- ✅ Use `db push` for normal development (preserves data)
- ✅ Always set `markdown_available` and `embeddings_available` flags

---

### "I need to process a document"

**Worker processor pattern:**
```typescript
// worker/processors/my-processor.ts
export async function processMyFormat(job: BackgroundJob) {
  // 1. Download/fetch content
  const content = await fetchContent(job.input_data.url)

  // 2. Extract text with Gemini or Docling
  const extracted = await extractText(content)

  // 3. Clean markdown
  const cleaned = await cleanMarkdown(extracted)

  // 4. Return { markdown, metadata }
  return {
    markdown: cleaned,
    metadata: {
      title: extracted.title,
      author: extracted.author,
      // ...
    }
  }
}

// worker/processors/router.ts - Add to router
case 'my_format':
  return processMyFormat(job)
```

**ALWAYS use orchestrator - NEVER bypass:**
```typescript
// worker/index.ts
await processDocument(jobId) // Runs all 3 engines automatically
```

**Current processors:**
- `pdf-processor.ts` - PDF via Docling
- `epub-processor.ts` - EPUB via Docling
- `youtube-processor.ts` - YouTube transcripts
- `web-processor.ts` - Web articles
- `markdown-processor.ts` - Markdown (as-is or clean)
- `text-processor.ts` - Plain text
- `paste-processor.ts` - Pasted content

---

### "I need to create an ECS component"

**Decision tree:**
```
What type of entity?
├─ Annotation (precise text highlight)?
│  └─ Use 5-component: Position, Visual, Content, Temporal, ChunkRef
├─ Spark (quick capture)?
│  └─ Use 4-component: Spark, Content, Temporal, ChunkRef
├─ Flashcard (study)?
│  └─ Use: Flashcard, Study, Content, Temporal, ChunkRef
└─ New type? → Design components, then create Operations class
```

**Pattern (PascalCase components):**
```typescript
// src/lib/ecs/flashcards.ts
import { createECS } from '@/lib/ecs'

export class FlashcardOperations {
  constructor(
    private ecs: ReturnType<typeof createECS>,
    private userId: string
  ) {}

  async create(data: FlashcardData) {
    return await this.ecs.createEntity(this.userId, {
      Flashcard: {           // ✅ PascalCase
        front: data.front,
        back: data.back,
        deck_id: data.deckId,
      },
      Content: {             // ✅ PascalCase
        note: data.note,
        tags: data.tags,
      },
      Temporal: {            // ✅ PascalCase
        created_at: new Date(),
      },
      ChunkRef: {            // ✅ PascalCase
        chunk_ids: data.chunkIds,
        document_id: data.documentId,
      },
    })
  }

  async update(entityId: string, updates: Partial<FlashcardData>) {
    // Update logic
  }

  async delete(entityId: string) {
    return await this.ecs.deleteEntity(entityId)
  }
}
```

**Key rules:**
- ✅ Component names are PascalCase (Position, Spark, Content)
- ✅ Use Operations class pattern for all entity types
- ✅ Reuse shared components (Content, Temporal, ChunkRef)
- ✅ Factory pattern: `createECS()` per request

**See**: `docs/ECS_IMPLEMENTATION.md`, `docs/ANNOTATIONS_SYSTEM.md`, `docs/SPARK_SYSTEM.md`

---

### "I need to run tests"

```bash
# Before ANY commit
npm run test:critical    # Must pass (blocks deployment)

# Worker tests
cd worker
npm run test:integration
npm run test:full-validation
npm run validate:metadata
```

**Philosophy**: Test based on replaceability
- **Annotations** (manual work) → Test exhaustively
- **Documents** (source files) → Test preservation
- **Chunks** (cost $0.20) → Test critical algorithms
- **Connections** (auto-generated) → Light testing

**See**: `docs/testing/TESTING_RULES.md` for complete guide

---

## 🏗️ Architecture Patterns

### Dual-Module Architecture

**Main App** (`/`) - Next.js 15 with React 19
- Frontend components and pages
- Server Actions for database mutations
- ECS system for entity management

**Worker Module** (`/worker/`) - Node.js background processing
- Document processors (7 formats)
- 3-engine collision detection system
- Gemini AI integration and embeddings

**Critical rules:**
- ❌ NEVER cross-import between modules
- ✅ Communication via database (`background_jobs` table)
- ✅ Worker runs independently as background service

---

### Server Components by Default

```typescript
// Default: Server Component (no directive needed)
export default async function DocumentPage({ params }: { params: { id: string } }) {
  const doc = await supabase.from('documents').select().eq('id', params.id).single()
  return <DocumentViewer document={doc} />
}

// Only use 'use client' when needed:
// - Event handlers (onClick, onChange)
// - Browser APIs (window, document)
// - React hooks (useState, useEffect)
'use client'

export function SelectionToolbar() {
  const [selected, setSelected] = useState<string | null>(null)

  const handleSelection = () => {
    // Event handler logic
  }

  return <Toolbar onSelect={handleSelection} />
}
```

**See**: `docs/rEACT_GUIDELINES.md` for complete Server/Client component rules

---

### ECS (Entity-Component-System)

**Everything is an entity with flexible PascalCase components.**

**Location**: `src/lib/ecs/` (factory pattern via `createECS()`)

**Implemented Systems:**
- **Annotations** (5-component): Position, Visual, Content, Temporal, ChunkRef
- **Sparks** (4-component): Spark, Content, Temporal, ChunkRef
- **Flashcards** (5-component): Flashcard, Study, Content, Temporal, ChunkRef - ✅ Complete (backend + UI)

**Shared components**: Content, Temporal, ChunkRef (reused across entity types)

**Pattern:**
```typescript
// Server Action
'use server'

export async function createFlashcard(data: FlashcardData) {
  const user = await getCurrentUser()
  if (!user) throw new Error('Not authenticated')

  const ecs = createECS()
  const ops = new FlashcardOperations(ecs, user.id)

  const flashcardId = await ops.create(data)

  revalidatePath(`/study/${data.deckId}`)
  return { success: true, id: flashcardId }
}
```

**See**: `docs/ECS_IMPLEMENTATION.md`, `docs/ANNOTATIONS_SYSTEM.md`, `docs/SPARK_SYSTEM.md`, `docs/FLASHCARD_SYSTEM.md` for complete guides

---

### Storage-First Portability

**Philosophy:**
- **Supabase Storage** = Source of truth (large files, exports)
- **PostgreSQL** = Queryable cache (chunks, embeddings, metadata)

**Storage is source of truth + portability**
**Database is queryable cache + derived data**

**Admin Panel** (Cmd+Shift+A) - 6 tabs:
1. **Scanner** - Compare Storage vs Database
2. **Import** - Restore from Storage (conflict resolution)
3. **Export** - Generate ZIP bundles
4. **Connections** - Reprocess (Smart Mode)
5. **Integrations** - Obsidian + Readwise
6. **Jobs** - Comprehensive history

**Benefits:**
- $0.20-0.60 saved per document
- DB reset + restore in 6 min vs 25 min reprocessing
- Complete portability via ZIP exports

**See**: `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` for complete guide

---

### No Modals → Persistent UI

**Use docks, panels, and overlays instead of blocking modals:**

- `ProcessingDock` (`components/layout/ProcessingDock.tsx`) - Bottom-right, active jobs only
- `RightPanel` (`components/layout/RightPanel.tsx`) - Side panel with 6 tabs
- `AdminPanel` (`components/layout/AdminPanel.tsx`) - Cmd+Shift+A (6 tabs)
- `QuickSparkModal` (`components/reader/QuickSparkModal.tsx`) - Cmd+K quick capture
- `Sheet` (from `components/rhizome/sheet.tsx`) - Mobile only
- `Popover` (from `components/rhizome/popover.tsx`) - Non-blocking overlays

**Why?**
- Maintains reading context
- Preserves state across interactions
- Non-blocking workflow
- Better UX for document processing app

**See**: `docs/UI_PATTERNS.md` for complete guide

---

## 📚 Quick Reference

### Project Context

**What is Rhizome V2?**

AI-first document processing system with **3-engine collision detection** for discovering non-obvious connections between ideas. Personal knowledge tool optimized for aggressive connection synthesis.

**Core Vision**: Build a personal knowledge tool that actively discovers non-obvious connections across all your reading materials.

**This is a GREENFIELD APP - NOT concerned with backward compatibility.**

**Current Status**: See `docs/IMPLEMENTATION_STATUS.md` for complete implementation status

---

### Quick Metrics

- **7 input formats**: PDF, EPUB, YouTube, Web, Markdown (as-is/clean), Text, Paste
- **9 chunking strategies**: token, sentence, **recursive** (default), semantic, late, code, neural, slumber, table
- **3 connection engines**: Semantic Similarity (25%), Contradiction Detection (40%), Thematic Bridge (35%)
- **Processing modes**: LOCAL (zero cost) or CLOUD (Gemini)

**Processing times** (M1 Max 64GB):
- Small (<50p): 3-5 min
- Medium (200p): 15-25 min
- Large (500p): 60-80 min

**Key shortcuts:**
- `Cmd+Shift+A` - Admin Panel
- `Cmd+K` - Quick Capture (Sparks)

---

### Tech Stack

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

🔴 **CRITICAL SDK Usage:**
- ✅ ALWAYS use `@google/genai` (new native SDK) with `GoogleGenAI` class
- ❌ NEVER use `@google/generative-ai` (deprecated old SDK)

**AI SDK Selection:**
- **Vercel AI SDK** (`ai` + `@ai-sdk/google`) → Frontend features, streaming, React hooks, Server Actions → UI
- **Native Google SDK** (`@google/genai`) → Worker jobs, batch operations, file uploads

**Rule of thumb**: UI-facing features → Vercel AI SDK | Background processing → Native SDK

---

### Development Setup

```bash
# Quick start
npm run dev              # Start all services (Supabase + Worker + Next.js)
npm run stop             # Stop all services
npm run status           # Check service status

# Database operations
npx supabase start                    # Start Supabase
npx supabase migration new <name>     # Create migration
npx supabase db push                  # Apply new migrations (normal development)
npx supabase db reset                 # Full reset (initial setup or clean slate)

# See README.md for full setup and environment variables
```

**Latest Migration**: Check dynamically (changes frequently)

**Check latest migration:**
```bash
ls supabase/migrations/ | tail -1
```

---

### File Organization

```
src/
├── app/
│   ├── actions/           # Server Actions ('use server')
│   ├── read/[id]/         # Document reader page
│   └── api/               # API routes (avoid, use actions)
├── components/
│   ├── rhizome/           # ALL components used in Rhizome
│   ├── reader/            # Custom reader-specific components
│   ├── sidebar/           # RightPanel tabs (6 tabs)
│   ├── admin/             # Admin Panel tabs (6 tabs)
│   └── layout/            # Docks, panels, persistent UI
├── lib/
│   ├── ecs/              # Entity-Component-System
│   └── supabase/         # Database clients
└── stores/               # Zustand stores (client state)

worker/                   # Separate Node.js app
├── processors/           # 7 format processors
├── engines/             # 3 collision detection engines
├── handlers/            # Background job handlers
├── lib/                 # Utilities, local processing
└── tests/               # Comprehensive test suite
```

---

### Documentation Index

**Core Documentation:**
- `docs/IMPLEMENTATION_STATUS.md` - What's built vs planned
- `docs/ARCHITECTURE.md` - Complete system design
- `docs/APP_VISION.md` - Philosophy and long-term vision
- `docs/USER_FLOW.md` - Core user workflows

**Development Guides:**
- `docs/rEACT_GUIDELINES.md` - Server/Client components
- `docs/UI_PATTERNS.md` - No modals, persistent UI, feature-rich components
- `docs/ECS_IMPLEMENTATION.md` - Entity-Component-System
- `docs/SCHEMA_SAFETY_GUIDELINES.md` - Database safety
- `docs/STORAGE_PATTERNS.md` - Hybrid storage strategy
- `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` - Storage-first portability

**Processing Pipeline:**
- `docs/PROCESSING_PIPELINE.md` - Full 10-stage pipeline
- `docs/local-pipeline-setup.md` - Docling + Ollama + Transformers.js
- `docs/docling-configuration.md` - Environment variables and features
- `docs/processing-pipeline/bulletproof-metadata-extraction.md` - Metadata matching

**System Documentation:**
- `docs/JOB_SYSTEM.md` - Background jobs (pause/resume, retry, progress tracking)
- `docs/ANNOTATIONS_SYSTEM.md` - 5-component ECS pattern, recovery, UI integration
- `docs/SPARK_SYSTEM.md` - 4-component ECS pattern, quick capture, multi-selection
- `docs/FLASHCARD_SYSTEM.md` - Flashcard system, FSRS integration, study system (complete backend + UI)
- `docs/PERFORMANCE_PHILOSOPHY.md` - When to optimize, processing time targets

**Testing:**
- `docs/testing/TESTING_RULES.md` - Primary rules for AI agents
- `docs/testing/TESTING_README.md` - Quick start guide
- `docs/testing/critical-patterns.md` - Code examples
- `docs/testing/general-patterns.md` - Testing patterns

**State Management:**
- `docs/ZUSTAND_RULES.md` - Comprehensive guide with 4 stores
- `docs/ZUSTAND_PATTERN.md` - Quick reference for migrations

**Module Documentation:**
- `worker/README.md` - Worker module overview
- `docs/AI_DOCUMENTATION.md` - Gemini & Vercel AI SDK
- `docs/SUPABASE_AUTH_RULES.md` - Personal project approach

---

### Library Documentation

- **Virtuoso**: https://virtuoso.dev/ - Virtual scrolling for document reader
- **AI SDK**: https://ai-sdk.dev/docs/introduction - TypeScript toolkit for AI apps
- **Docling**: https://docling-project.github.io/docling/ - Document processing with advanced PDF understanding
- **Chonkie**: https://docs.chonkie.ai/oss/chunkers/overview - 9 chunking strategies
- **ShadCN**: https://ui.shadcn.com/llms.txt - ShadCN UI library documentation

---


**Remember**: This is an AI-first personal tool. Prioritize connection discovery and knowledge synthesis over traditional features.
