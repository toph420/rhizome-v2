# Rhizome V2 + SuperClaude Configuration

**Project**: AI-first document processing system with 3-engine collision detection
**Version**: SuperClaude 4.1.5 (Project-specific installation)
**Focus**: Knowledge synthesis through aggressive connection discovery

---

## 🌱 Rhizome-Specific Configuration

This installation is customized for Rhizome V2 architecture patterns:
- ECS (Entity-Component-System) enforcement
- Storage-first portability
- No modals rule (persistent UI only)
- Worker dual-module architecture
- Schema safety (ALWAYS check before writes)

**See**: Root `CLAUDE.md` for complete Rhizome documentation

---

## ===================================================
## SuperClaude Framework Components (Auto-Imported)
## ===================================================

# Core Framework
@BUSINESS_PANEL_EXAMPLES.md
@BUSINESS_SYMBOLS.md
@FLAGS.md
@PRINCIPLES.md
@RESEARCH_CONFIG.md
@RULES.md

# Behavioral Modes
@MODE_Brainstorming.md
@MODE_Business_Panel.md
@MODE_DeepResearch.md
@MODE_Introspection.md
@MODE_Orchestration.md
@MODE_Task_Management.md
@MODE_Token_Efficiency.md

---

## 🔴 Rhizome Critical Rules Override

These project-specific rules OVERRIDE framework defaults:

### Schema Safety (🔴 ALWAYS ENFORCE)
```bash
# BEFORE any database write operation:
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d table_name"
ls supabase/migrations/ | tail -1  # Check latest migration
```

**Common mistakes to PREVENT**:
- ❌ `chunks.user_id` - Doesn't exist (RLS via documents)
- ❌ `documents.chunk_count` - Not stored
- ❌ `processing_status: 'processed'` - Wrong value (use 'completed')
- ✅ ALWAYS set `markdown_available` and `embeddings_available` flags
- ✅ ALWAYS validate `output_data` JSONB with Zod schemas

### Naming Conventions (🔴 CRITICAL)
- **PostgreSQL columns**: `snake_case` (created_at, output_data)
- **JSONB contents**: **camelCase** (downloadUrl, zipFilename)
- **TypeScript**: camelCase variables, PascalCase types
- **Files**: kebab-case (export-document.ts)
- **ECS components**: **PascalCase** (Position, Visual, Content, Temporal, ChunkRef)

### No Modals Rule (🔴 ABSOLUTE)
❌ NEVER: Dialog, AlertDialog, Modal (blocking UI)
✅ ALWAYS: ProcessingDock, RightPanel, AdminPanel, QuickSparkModal, Sheet (mobile), Popover

### Server Actions Only (🔴 CRITICAL)
✅ Use Server Actions (`'use server'`) for ALL mutations
❌ NEVER use API routes for mutations
❌ NEVER use direct database calls from client components

### Component Search First (🔴 CRITICAL)
**Before building ANY UI component:**
1. Search shadcn registry: `mcp__shadcn__search_items_in_registries`
2. Check neobrutalism registry
3. Review existing `components/rhizome/`
4. THEN build custom (if no match)

---

## 🎯 Rhizome Architecture Patterns

### ECS (Entity-Component-System)
**Everything is an entity with flexible PascalCase components.**

**Pattern:**
```typescript
// Server Action (app/actions/)
'use server'
export async function createEntity(data) {
  const ecs = createECS()
  const ops = new EntityOperations(ecs, user.id)
  const id = await ops.create(data)
  revalidatePath(`/path`)
  return { success: true, id }
}
```

**Shared components**: Content, Temporal, ChunkRef
**Implemented**: Annotations (5-comp), Sparks (4-comp), Flashcards (5-comp)

### Storage-First Portability
- **Supabase Storage** = Source of truth (markdown, exports)
- **PostgreSQL** = Queryable cache (chunks, embeddings)
- Admin Panel (Cmd+Shift+A) - Scanner, Import, Export, Connections, Integrations, Jobs

### Dual-Module Architecture
- **Main App** (`/`) - Next.js 15 + React 19
- **Worker** (`/worker/`) - Node.js background processing
- ❌ NEVER cross-import between modules
- ✅ Communication via `background_jobs` table

---

## 🧠 SuperClaude Integration

### Recommended Commands for Rhizome
- `/sc:test` - Run critical tests before commits
- `/sc:analyze` - Code quality, security, architecture review
- `/sc:cleanup` - Remove dead code, optimize structure
- `/sc:troubleshoot` - Systematic debugging
- `/sc:implement` - Feature implementation with validation

### Recommended Modes
- **MODE_Task_Management** - Auto-activates for >3 step operations
- **MODE_Orchestration** - Tool selection, parallel execution
- **MODE_DeepResearch** - Library documentation lookup
- **MODE_Token_Efficiency** - Context usage >75%

### MCP Server Usage
- **context7** - Library docs (React 19, Next.js 15, Supabase, Gemini)
- **sequential-thinking** - Complex debugging, architecture decisions
- **shadcn** - UI component search and implementation
- **ide** - Diagnostics, Jupyter notebook execution

---

## 📝 Development Checklist

**Before ANY commit:**
```bash
npm run test:critical    # MUST pass
npm run lint             # Fix errors
npm run typecheck        # Fix type errors
```

**Before ANY database operation:**
```bash
psql -c "\d table_name"  # Verify schema
ls supabase/migrations/ | tail -1  # Check latest migration
```

**Before ANY UI component:**
```
Search shadcn → Search neobrutalism → Check components/rhizome/ → Build custom
```

**Before ANY mutation:**
```
Server Action (app/actions/) → ECS Operations → revalidatePath() → Return serializable
```

---

## 🚀 Quick Reference

**Latest Migration**: `068_flashcards_cache_rebuild.sql`
**Current Branch**: `integration/study-and-connections`
**Main Branch**: (check git remote)

**Key Shortcuts**:
- `Cmd+Shift+A` - Admin Panel
- `Cmd+K` - Quick Capture (Sparks)

**Documentation**: See root `/docs/` for complete guides
**Framework Version**: SuperClaude 4.1.5
