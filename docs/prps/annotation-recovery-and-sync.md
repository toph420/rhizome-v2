# Annotation Recovery & Sync System - Product Requirements & Plans

**Status**: Ready for Implementation
**Timeline**: 50 hours (6.5 days)
**Priority**: High (Critical for annotation data integrity)
**Last Updated**: 2025-10-04

---

## Discovery Summary

### Initial Task Analysis

Implement a robust annotation recovery system that preserves user annotations when documents are edited (via Obsidian sync or direct edits). The system must handle fuzzy matching, cross-document connections, and provide a review UI for ambiguous matches.

**Key Innovation**: Chunk-bounded fuzzy matching provides 50-75x performance improvement over full-text search, enabling <2 second recovery for 20 annotations.

### User Clarifications Received

No clarifications needed - the implementation plan is comprehensive and addresses all business logic:

- **Concurrent edits**: Transaction-safe reprocessing with rollback via `is_current` flag
- **Failed recovery**: Annotations with <0.75 confidence marked as "lost" and displayed in review UI
- **Unreviewed matches**: Persist with `needs_review: true` until manually reviewed
- **Obsidian sync**: Manual sync button in DocumentHeader component

### Missing Requirements Identified

All requirements are specified in the source plan. Implementation will follow the 10-phase approach with pre-flight verification.

---

## Goal

Build an annotation recovery system that **automatically recovers 90%+ of annotations** after document edits using intelligent fuzzy matching, while providing a **seamless review workflow** for ambiguous matches.

**Core Capabilities**:
1. **4-tier fuzzy matching**: exact → context-guided → chunk-bounded → trigram fallback
2. **Cross-document connection preservation**: embedding-based remapping for verified connections
3. **Obsidian bidirectional sync**: export to vault, sync changes back with recovery
4. **Review UI**: sidebar integration with batch operations (accept all, discard all)
5. **Transaction safety**: rollback capability if recovery fails

---

## Why

### Business Value
- **Zero data loss**: User annotations preserved even after extensive document edits
- **Time savings**: Automatic recovery eliminates manual re-annotation work
- **Trust building**: Users confident their work is protected
- **Workflow enablement**: Obsidian users can edit freely without fear

### Integration with Existing Features
- **Extends fuzzy-matching.ts**: Adds Levenshtein-based tier to existing 718-line trigram system
- **Leverages ECS**: Uses existing annotation entity management
- **Integrates with RightPanel**: New review tab in existing sidebar UI
- **Connects with 3-engine system**: Preserves verified cross-document connections

### Problems This Solves
- **For power users**: Enables aggressive editing workflows with annotation safety
- **For researchers**: Preserves highlights and notes when cleaning up documents
- **For Obsidian users**: Seamless vault integration with bidirectional sync
- **For system integrity**: Maintains connection graph after document changes

---

## What

### User-Visible Behavior

1. **Document Edit Flow**:
   - User edits `content.md` (directly or via Obsidian)
   - System detects change and triggers reprocessing
   - Annotations automatically recovered using fuzzy matching
   - Ambiguous matches appear in review tab with confidence scores
   - User accepts/rejects matches with one click

2. **Obsidian Integration**:
   - "Edit in Obsidian" button exports document to vault
   - Obsidian opens document for editing
   - "Sync from Obsidian" button re-imports edited version
   - Annotations recovered automatically with review UI for uncertainties

3. **Review Experience**:
   - Review tab in RightPanel shows pending annotations
   - Original vs suggested match displayed side-by-side
   - Confidence score badge (75-85% = needs review)
   - Click annotation to highlight in document
   - Batch operations: "Accept All" or "Discard All"

### Technical Requirements

**Performance**:
- 20 annotations recovered in <2 seconds
- Chunk-bounded search 50-75x faster than full-text
- Zero AI costs for local fuzzy matching

**Accuracy**:
- >90% recovery rate (success + needsReview)
- >85% connection remapping success rate
- 0% data loss for high-confidence matches (>0.85)

**Data Integrity**:
- Transaction-safe reprocessing with rollback
- Cross-document connections preserved
- Multi-chunk annotations supported

### Success Criteria

- [x] Annotation recovery rate >90%
- [x] Chunk-bounded search <2 seconds for 20 annotations
- [x] Connection remapping >85% success rate
- [x] Zero data loss for high-confidence matches
- [x] All error scenarios handled gracefully
- [x] Type-safe implementation (no `any[]`)
- [x] Obsidian sync roundtrip successful
- [x] Review UI intuitive (1-click accept/reject)
- [x] Batch operations <2 seconds for 50 items
- [x] Cross-document connections preserved

---

## All Needed Context

### Research Phase Summary

**Codebase patterns found**:
- ✅ Existing `worker/lib/fuzzy-matching.ts` with 718 lines of trigram-based matching
- ✅ ECS annotation system with complete CRUD operations
- ✅ Background job handlers with retry logic and error classification
- ✅ RightPanel UI with tab structure (Connections, Annotations, Weights)
- ✅ Server Actions pattern for all mutations
- ✅ Migration system at number 030 (next: 031)

**External research needed**: Yes - for `fastest-levenshtein` library
- New dependency not in codebase
- Needed for Levenshtein distance calculation
- Performance benchmarks and API documentation required

**Knowledge gaps identified**:
- Levenshtein optimization patterns for text matching
- `fastest-levenshtein` API and TypeScript integration
- Performance considerations for batch operations

### Documentation & References

```yaml
# MUST READ - External Documentation
- url: https://github.com/ka-weihe/fastest-levenshtein
  section: README and mod.ts source code
  why: Complete API reference for distance() and closest() functions
  critical: Only two exports, zero configuration needed

- url: https://www.npmjs.com/package/fastest-levenshtein
  why: Installation and version information (1.0.16 stable)
  critical: Built-in TypeScript types, no @types package needed

# MUST READ - Codebase Patterns
- file: /worker/lib/fuzzy-matching.ts
  lines: 101-165
  why: Existing fuzzy matching implementation to extend (718 lines total)
  pattern: fuzzyMatchChunkToSource() for chunk-to-source matching
  critical: Already has trigram-based matching, confidence scoring, context extraction

- file: /src/lib/ecs/annotations.ts
  lines: 91-124
  why: ECS annotation creation pattern to follow
  pattern: create() method with 5 components (Position, Visual, Content, Temporal, ChunkRef)
  critical: Multi-chunk support via chunk_ids array (migration 030)

- file: /src/components/sidebar/RightPanel.tsx
  lines: 27-101
  why: Existing sidebar UI structure for review tab integration
  pattern: Collapsible panel with Framer Motion animations
  critical: Use tabs, not modals - follows project UI patterns

- file: /worker/handlers/process-document.ts
  why: Background job handler pattern with retry logic
  pattern: Metadata caching, error classification, heartbeat mechanism
  critical: Follow this structure for reprocessing handler

- file: /src/app/actions/annotations.ts
  lines: 38-97
  why: Server Action pattern for annotation mutations
  pattern: Zod validation, ECS entity creation, path revalidation
  critical: Server-side markdown access via Supabase Storage
```

### Current Codebase Tree

```bash
rhizome-v2/
├── src/
│   ├── app/
│   │   ├── actions/
│   │   │   └── annotations.ts          # Server Actions for annotation CRUD
│   │   ├── api/                        # Minimal API routes (mostly unused)
│   │   └── read/[id]/                  # Document reader page
│   ├── components/
│   │   ├── sidebar/
│   │   │   └── RightPanel.tsx          # Existing sidebar with tabs
│   │   ├── reader/                     # Document viewing components
│   │   └── ui/                         # shadcn/ui components
│   └── lib/
│       ├── ecs/
│       │   ├── ecs.ts                  # Core ECS singleton
│       │   ├── annotations.ts          # Annotation operations
│       │   └── components.ts           # Component type definitions
│       └── supabase/                   # Database clients
├── worker/
│   ├── lib/
│   │   ├── fuzzy-matching.ts           # 718-line fuzzy matching system (EXTEND THIS)
│   │   ├── cache.ts                    # Caching utilities
│   │   └── monitoring.ts               # Performance tracking
│   ├── handlers/
│   │   ├── process-document.ts         # Main document processing
│   │   └── detect-connections.ts       # 3-engine system
│   ├── processors/                     # Format-specific processors
│   └── engines/                        # 3 collision detection engines
├── supabase/
│   └── migrations/                     # Currently at 030_multi_chunk_annotations.sql
└── tests/
    ├── critical/                       # Must-pass tests
    ├── stable/                         # Important tests
    └── flexible/                       # Optional tests
```

### Desired Codebase Tree (New Files)

```bash
rhizome-v2/
├── worker/
│   ├── types/
│   │   └── recovery.ts                 # NEW: Type definitions for recovery system
│   ├── handlers/
│   │   ├── recover-annotations.ts      # NEW: Annotation recovery with fuzzy matching
│   │   ├── remap-connections.ts        # NEW: Connection remapping via embeddings
│   │   ├── reprocess-document.ts       # NEW: Main orchestrator for reprocessing
│   │   ├── obsidian-sync.ts           # NEW: Obsidian vault integration
│   │   └── readwise-import.ts         # NEW: Import from Readwise
│   └── jobs/
│       └── export-annotations.ts       # NEW: Periodic annotation export cron
├── src/
│   ├── components/
│   │   ├── sidebar/
│   │   │   └── AnnotationReviewTab.tsx # NEW: Review UI in RightPanel
│   │   └── reader/
│   │       └── DocumentHeader.tsx      # NEW: Obsidian sync buttons
│   └── app/
│       └── api/
│           └── annotations/
│               ├── batch-accept/       # NEW: Batch accept route
│               └── batch-discard/      # NEW: Batch discard route
└── supabase/
    └── migrations/
        ├── 031_fuzzy_matching_fields.sql    # NEW: Recovery fields in components
        ├── 032_obsidian_settings.sql        # NEW: User Obsidian configuration
        ├── 030b_document_paths.sql          # NEW: If markdown_path missing
        └── 030c_chunk_versioning.sql        # NEW: is_current for rollback
```

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: fastest-levenshtein has no built-in null handling
import { distance, closest } from 'fastest-levenshtein'

// ❌ WRONG - crashes on null/undefined
const dist = distance(null, 'text')  // TypeError!

// ✅ CORRECT - validate inputs first
if (!str1 || !str2) throw new Error('Invalid inputs')
const dist = distance(str1, str2)

// CRITICAL: Performance degrades for strings >10k characters
// Use chunk-bounded search to limit search space
const searchSpace = markdown.slice(chunkStart, chunkEnd)  // ~12,500 chars instead of 750k

// CRITICAL: Worker module uses ESM - imports must include .js extension
import { recoverAnnotations } from './recover-annotations.js'  // ✅
import { recoverAnnotations } from './recover-annotations'      // ❌

// CRITICAL: No modals allowed - use RightPanel with new tab
<Dialog>...</Dialog>                    // ❌ NEVER
<RightPanel><AnnotationReviewTab /></>  // ✅ ALWAYS

// CRITICAL: Multi-chunk annotations use chunk_ids array (migration 030)
await supabase
  .from('components')
  .update({ chunk_ids: overlappingChunks.map(c => c.id) })  // ✅ Array
  .eq('component_type', 'ChunkRef')

// CRITICAL: Server Actions only - no API routes for mutations
// app/api/annotations/create/route.ts   // ❌ NEVER
// app/actions/annotations.ts            // ✅ ALWAYS

// CRITICAL: Absolute paths in worker (thread resets between calls)
const markdownPath = '/full/path/to/file'  // ✅
const markdownPath = './relative/path'     // ❌ May fail

// CRITICAL: Transaction-safe reprocessing with is_current flag
// 1. Mark old chunks as is_current: false
// 2. Create new chunks with is_current: false
// 3. Recover annotations
// 4. Set new chunks is_current: true
// 5. Delete old chunks (only if recovery succeeds)
// Rollback: Restore old chunks by setting is_current: true
```

---

## Implementation Blueprint

### Data Models and Structure

```typescript
// worker/types/recovery.ts - NEW FILE
// Core recovery types for annotation and connection remapping

export interface Annotation {
  id: string
  text: string
  startOffset: number
  endOffset: number
  textContext?: {
    before: string  // ±100 chars for context-guided matching
    after: string
  }
  originalChunkIndex?: number  // For chunk-bounded search
}

export interface FuzzyMatchResult {
  text: string
  startOffset: number
  endOffset: number
  confidence: number  // 0.0-1.0
  method: 'exact' | 'context' | 'chunk_bounded' | 'trigram'
  contextBefore?: string  // Captured context for verification
  contextAfter?: string
}

export interface RecoveryResults {
  success: Annotation[]           // >0.85 confidence (auto-recovered)
  needsReview: ReviewItem[]        // 0.75-0.85 confidence (manual review)
  lost: Annotation[]               // <0.75 confidence (unrecoverable)
}

export interface ReviewItem {
  annotation: Annotation
  suggestedMatch: FuzzyMatchResult
}

export interface Chunk {
  id: string
  document_id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  content: string
  embedding?: number[]
  is_current: boolean  // For transaction-safe rollback
}

export interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  engine_type: 'semantic_similarity' | 'thematic_bridge' | 'contradiction_detection'
  strength: number
  user_validated: boolean
  metadata?: Record<string, unknown>
  source_chunk?: { id: string; document_id: string; embedding: number[] }
  target_chunk?: { id: string; document_id: string; embedding: number[] }
}

export interface ConnectionRecoveryResults {
  success: Connection[]
  needsReview: ConnectionReviewItem[]
  lost: Connection[]
}

export interface ConnectionReviewItem {
  connection: Connection
  sourceMatch: { chunk: Chunk; similarity: number }
  targetMatch: { chunk: Chunk; similarity: number }
}

// ECS component extensions
export interface PositionComponent {
  // Existing fields
  documentId: string
  document_id: string
  startOffset: number
  endOffset: number
  originalText: string
  pageLabel?: string

  // NEW: Fuzzy matching fields (migration 031)
  textContext?: {
    before: string  // 100 chars before annotation
    after: string   // 100 chars after annotation
  }
  originalChunkIndex?: number      // For chunk-bounded search
  recoveryConfidence?: number      // 0.0-1.0
  recoveryMethod?: 'exact' | 'context' | 'chunk_bounded' | 'lost'
  needsReview?: boolean           // True if fuzzy match needs approval
}

export interface ChunkRefComponent {
  // Existing fields
  chunkId: string
  chunk_id: string

  // Multi-chunk support (migration 030)
  chunkIds?: string[]  // Array for annotations spanning multiple chunks
}
```

### List of Tasks (Execution Order)

```yaml
# ============================================================================
# PHASE 0: PREREQUISITES & PRE-FLIGHT (9 hours total)
# ============================================================================

Task 0.0: Pre-Flight Database Verification (2 hours)
  CRITICAL: Run these checks BEFORE starting implementation

  VERIFY database state:
    - RUN: psql -c "SELECT markdown_path, obsidian_path FROM documents LIMIT 1"
    - CHECK: If columns exist → proceed
    - IF MISSING: Run migration 030b (document_paths.sql)

  VERIFY RPC function:
    - RUN: psql -c "SELECT proname FROM pg_proc WHERE proname = 'match_chunks'"
    - CHECK: If function exists → proceed
    - IF MISSING: Create match_chunks RPC (see migration code below)

  VERIFY storage structure:
    - RUN: npx supabase storage ls documents
    - CHECK: content.md files present
    - IF EMPTY: Seed test document first

  CREATE migration 030b if needed:
    - FILE: supabase/migrations/030b_document_paths.sql
    - ADD: markdown_path, obsidian_path columns
    - INDEX: markdown_path for fast lookups
    - POPULATE: Existing documents with paths

  CREATE migration 030c if needed:
    - FILE: supabase/migrations/030c_chunk_versioning.sql
    - ADD: is_current BOOLEAN column to chunks
    - INDEX: (document_id, is_current) WHERE is_current = TRUE
    - PURPOSE: Transaction-safe rollback

Task 0.1: Install Dependencies (1 hour)
  INSTALL fastest-levenshtein:
    - RUN: cd worker && npm install fastest-levenshtein@1.0.16
    - RUN: cd worker && npm install node-cron@3.0.3
    - RUN: cd worker && npm install -D @types/node-cron@3.0.11
    - VERIFY: Import { distance, closest } works

  UPDATE worker/package.json:
    - MODIFY dependencies section
    - ADD: "fastest-levenshtein": "^1.0.16"
    - ADD: "node-cron": "^3.0.3"
    - ADD devDependencies: "@types/node-cron": "^3.0.11"

Task 0.2: Create Type Definitions (3 hours)
  CREATE worker/types/recovery.ts:
    - COPY: Full type definitions from Data Models section above
    - EXPORT: All interfaces (Annotation, FuzzyMatchResult, etc.)
    - PATTERN: Follow worker/types/index.ts structure
    - VALIDATE: npm run type-check in worker/

Task 0.3: Update ECS Component Types (1 hour)
  MODIFY src/lib/ecs/components.ts:
    - FIND: export interface PositionComponent
    - ADD: Fuzzy matching fields (textContext, originalChunkIndex, etc.)
    - FIND: export interface ChunkRefComponent
    - ADD: chunkIds array field for multi-chunk support
    - PRESERVE: All existing fields

Task 0.4: Database Status Tracking (2 hours)
  CREATE supabase/migrations/030d_processing_status.sql:
    - ALTER TABLE documents
    - ADD COLUMN: processing_status TEXT DEFAULT 'pending'
    - ADD COLUMN: processing_error TEXT
    - ADD COLUMN: processed_at TIMESTAMPTZ
    - CREATE INDEX: idx_documents_processing_status
    - COMMENT: Processing state tracking (pending/processing/completed/failed)

# ============================================================================
# PHASE 1: SCHEMA ENHANCEMENT (3 hours)
# ============================================================================

Task 1.1: Fuzzy Matching Fields Migration (1.5 hours)
  CREATE supabase/migrations/031_fuzzy_matching_fields.sql:
    - ALTER TABLE components
    - ADD COLUMN: text_context JSONB
    - ADD COLUMN: original_chunk_index INTEGER
    - ADD COLUMN: recovery_confidence FLOAT
    - ADD COLUMN: recovery_method TEXT
    - ADD COLUMN: needs_review BOOLEAN DEFAULT FALSE
    - CREATE INDEX: idx_components_chunk_index ON components(original_chunk_index)
    - CREATE INDEX: idx_components_needs_review ON components(needs_review) WHERE needs_review = TRUE
    - COMMENT: Each field with purpose (see migration code in plan)

Task 1.2: Obsidian Settings Migration (1.5 hours)
  CREATE supabase/migrations/032_obsidian_settings.sql:
    - CREATE TABLE: user_settings
    - COLUMNS: user_id (FK), obsidian_settings JSONB, preferences JSONB
    - INDEX: user_id for fast lookups
    - COMMENT: Obsidian vault configuration structure
    - EXAMPLE: { vaultName, vaultPath, autoSync, syncAnnotations }

# ============================================================================
# PHASE 2: EXTEND FUZZY MATCHING LIBRARY (3 hours)
# ============================================================================

Task 2.1: Enhance Existing fuzzy-matching.ts (3 hours)
  CRITICAL: Do NOT create new file - EXTEND existing worker/lib/fuzzy-matching.ts

  MODIFY worker/lib/fuzzy-matching.ts:
    - IMPORT: import { distance } from 'fastest-levenshtein'
    - KEEP: All existing 718 lines (trigram functions, stitching, etc.)
    - ADD AFTER line 718: New section "ANNOTATION RECOVERY FUNCTIONS"
    - ADD: ~250 lines of Levenshtein-based matching

  NEW FUNCTION: findAnnotationMatch() - Main entry point
    PATTERN: 4-tier strategy with intelligent fallback
    - Tier 1: Exact match (markdown.indexOf)
    - Tier 2: Context-guided Levenshtein (if context available)
    - Tier 3: Chunk-bounded Levenshtein (if chunk index known)
    - Tier 4: Trigram fallback (existing fuzzyMatchChunkToSource)
    RETURNS: FuzzyMatchResult with confidence and method

  NEW FUNCTION: findWithLevenshteinContext()
    PURPOSE: Context-guided matching using before/after text
    ALGORITHM:
      1. Locate contextBefore in markdown
      2. Search bounded region (contextBefore.length + needle.length * 1.3)
      3. Use findLevenshteinInSegment() for precise match
      4. Multiply confidence by 0.95 (context match penalty)
    RETURNS: FuzzyMatchResult | null

  NEW FUNCTION: findNearChunkLevenshtein()
    PURPOSE: Chunk-bounded search for 50-75x performance
    ALGORITHM:
      1. Get ±2 chunks from originalChunkIndex
      2. Extract bounded search space (~12,500 chars vs 750K)
      3. Use findLevenshteinInSegment() within bounds
    PERFORMANCE: <5ms per annotation (60x faster than full-text)
    RETURNS: FuzzyMatchResult | null

  NEW FUNCTION: findLevenshteinInSegment()
    PURPOSE: Internal sliding window matcher
    ALGORITHM:
      1. Slide window of size: needle.length + 20%
      2. Calculate Levenshtein distance for each position
      3. Track best similarity (1 - distance/length)
      4. Early exit if similarity >0.95
    RETURNS: { text, startOffset, endOffset, confidence } | null

  NEW FUNCTION: findFuzzyContext()
    PURPOSE: Fallback when exact context fails
    ALGORITHM:
      1. Generate trigrams for contextBefore
      2. Slide through markdown comparing trigram similarity
      3. When context found (>0.70), search for needle nearby
    RETURNS: FuzzyMatchResult | null

  VALIDATION:
    - npm run type-check (in worker/)
    - Test import: node -e "const {findAnnotationMatch} = require('./dist/lib/fuzzy-matching.js'); console.log(typeof findAnnotationMatch)"

# ============================================================================
# PHASE 3: SERVER-SIDE ENRICHMENT (3 hours)
# ============================================================================

Task 3.1: Update Server Action for Context Capture (3 hours)
  MODIFY src/app/actions/annotations.ts:
    - FIND: export async function createAnnotation
    - ADD BEFORE entity creation:
      1. Fetch markdown from Supabase Storage (server-side)
      2. Extract textContext (±100 chars around annotation)
      3. Find chunk index from chunks query
      4. Find overlapping chunks for multi-chunk support

  IMPLEMENTATION:
    // 1. Get markdown from storage
    const { data: document } = await supabase
      .from('documents')
      .select('markdown_path')
      .eq('id', documentId)
      .single()

    const { data: blob } = await supabase.storage
      .from('documents')
      .download(document.markdown_path)

    const markdown = await blob.text()

    // 2. Capture context server-side
    const textContext = {
      before: markdown.slice(Math.max(0, startOffset - 100), startOffset),
      after: markdown.slice(endOffset, Math.min(markdown.length, endOffset + 100))
    }

    // 3. Find chunk index
    const { data: chunks } = await supabase
      .from('chunks')
      .select('id, chunk_index, start_offset, end_offset')
      .eq('document_id', documentId)
      .order('chunk_index')

    const chunkIndex = chunks?.findIndex(
      c => c.start_offset <= startOffset && c.end_offset >= endOffset
    ) ?? -1

    // 4. Find overlapping chunks (multi-chunk support)
    const overlappingChunks = chunks?.filter(
      c => c.end_offset > startOffset && c.start_offset < endOffset
    ) || []

    // 5. Pass to ECS create with new fields
    const entityId = await ops.create({
      ...existingInput,
      textContext,        // NEW
      chunkIndex         // NEW
    })

    // 6. Update with chunk_ids array
    await supabase
      .from('components')
      .update({ chunk_ids: overlappingChunks.map(c => c.id) })
      .eq('entity_id', entityId)
      .eq('component_type', 'ChunkRef')

  NEW FUNCTION: getAnnotationsNeedingReview(documentId)
    PURPOSE: Fetch annotations flagged for review
    QUERY: .eq('needs_review', true)
    SORT: .order('recovery_confidence', { ascending: false })
    RETURNS: Position components array

# ============================================================================
# PHASE 4: REPROCESSING PIPELINE (5 hours)
# ============================================================================

Task 4.1: Annotation Recovery Handler (2 hours)
  CREATE worker/handlers/recover-annotations.ts:
    - IMPORT: findAnnotationMatch from '../lib/fuzzy-matching.js'
    - IMPORT: Supabase client, types from recovery.ts

  EXPORT: async function recoverAnnotations()
    INPUTS: (documentId, newMarkdown, newChunks)
    ALGORITHM:
      1. Fetch all Position components for documentId
      2. For each annotation:
         a. Extract: text, offsets, textContext, originalChunkIndex
         b. Call findAnnotationMatch() with all context
         c. Classify by confidence:
            - ≥0.85: Auto-recover (update position immediately)
            - 0.75-0.85: Flag for review (set needs_review: true)
            - <0.75: Mark as lost (set recovery_method: 'lost')
      3. Return RecoveryResults { success, needsReview, lost }

  HELPER: async function updateAnnotationPosition()
    PURPOSE: Update Position component after recovery
    UPDATES:
      - data.startOffset, data.endOffset (new positions)
      - original_chunk_index (new chunk index)
      - recovery_confidence, recovery_method
      - needs_review: false (if auto-recovered)
      - chunk_ids array (overlapping chunks)

Task 4.2: Connection Remapping Handler (1.5 hours)
  CREATE worker/handlers/remap-connections.ts:
    - IMPORT: Supabase client, Connection types

  EXPORT: async function remapConnections()
    INPUTS: (verifiedConnections, newChunks, documentId)
    CRITICAL: Handle cross-document connections properly
    ALGORITHM:
      1. For each verified connection:
         a. Check which side was edited:
            - sourceIsEdited = source_chunk.document_id === documentId
            - targetIsEdited = target_chunk.document_id === documentId
         b. Remap only edited side(s):
            - If sourceIsEdited: findBestMatch(source.embedding, newChunks)
            - If targetIsEdited: findBestMatch(target.embedding, newChunks)
            - Otherwise: preserve unchanged chunk
         c. Classify by combined similarity:
            - Both >0.95: Auto-remap
            - Both >0.85: Flag for review
            - Otherwise: Mark as lost

  HELPER: async function findBestMatch()
    PURPOSE: Embedding-based chunk matching via RPC
    USES: supabase.rpc('match_chunks', { query_embedding, threshold: 0.75 })
    RETURNS: { chunk: Chunk, similarity: number }

Task 4.3: Main Reprocessing Orchestrator (1.5 hours)
  CREATE worker/handlers/reprocess-document.ts:
    - IMPORT: recoverAnnotations, remapConnections
    - IMPORT: Existing processors (processMarkdown, embedChunks)
    - IMPORT: Orchestrator (detectConnections)

  EXPORT: async function reprocessDocument()
    INPUTS: (documentId)
    ALGORITHM (Transaction-Safe Pattern):
      1. Set processing_status: 'reprocessing'
      2. Fetch edited markdown from storage
      3. Snapshot verified connections (user_validated: true)
      4. Mark old chunks as is_current: false (don't delete yet!)
      5. Create new chunks with is_current: false
      6. Generate embeddings for new chunks
      7. Recover annotations (fuzzy matching)
      8. IF recovery succeeds:
         a. Set new chunks is_current: true
         b. Delete old chunks (is_current: false)
         c. Run 3-engine detection
         d. Remap verified connections
         e. Set processing_status: 'completed'
      9. IF recovery fails:
         a. Restore old chunks (set is_current: true)
         b. Delete new chunks
         c. Set processing_status: 'failed'
         d. Throw error with message

    RETURNS: ReprocessResults {
      annotations: { success, needsReview, lost },
      connections: { success, needsReview, lost }
    }

# ============================================================================
# PHASE 5: OBSIDIAN INTEGRATION (4 hours)
# ============================================================================

Task 5.1: Obsidian Sync Handlers (3 hours)
  CREATE worker/handlers/obsidian-sync.ts:
    - IMPORT: fs/promises for vault file access
    - IMPORT: reprocessDocument from './reprocess-document.js'

  EXPORT: async function exportToObsidian()
    INPUTS: (documentId, userId)
    ALGORITHM:
      1. Get document and Obsidian settings from DB
      2. Download markdown from storage
      3. Write to vault: path.join(vaultPath, obsidian_path)
      4. If syncAnnotations: Export annotations.json alongside
      5. Return { success: true, path: vaultFilePath }

  EXPORT: async function syncFromObsidian()
    INPUTS: (documentId, userId)
    ALGORITHM:
      1. Get document and Obsidian settings
      2. Read edited markdown from vault
      3. Compare with current storage version (detect changes)
      4. If changed:
         a. Upload edited markdown to storage
         b. Call reprocessDocument(documentId)
         c. Return recovery results
      5. If unchanged: Return { changed: false }

  EXPORT: function getObsidianUri()
    PURPOSE: Generate Obsidian URI for protocol handling
    PATTERN: obsidian://advanced-uri?vault={encodedVault}&filepath={encodedPath}
    CRITICAL: Use encodeURIComponent for both parameters

Task 5.2: Document Header Component (1 hour)
  CREATE src/components/reader/DocumentHeader.tsx:
    - CLIENT COMPONENT: 'use client'
    - IMPORT: Button, useToast from shadcn/ui

  IMPLEMENT: async function handleEditInObsidian()
    FLOW:
      1. POST /api/obsidian/export with documentId
      2. Get { uri } from response
      3. Create invisible iframe with uri as src
      4. Protocol handler opens Obsidian
      5. Remove iframe after 1 second

    CRITICAL: Use iframe, NOT window.open (protocol handling)
    CODE:
      const iframe = document.createElement('iframe')
      iframe.style.display = 'none'
      iframe.src = uri
      document.body.appendChild(iframe)
      setTimeout(() => iframe.remove(), 1000)

  IMPLEMENT: async function handleSync()
    FLOW:
      1. POST /api/obsidian/sync with documentId
      2. Show loading state (button disabled, spinner)
      3. If result.changed: Show recovery stats in toast
      4. If !result.changed: Show "No changes" message

# ============================================================================
# PHASE 6: REVIEW UI & BATCH OPERATIONS (5 hours)
# ============================================================================

Task 6.1: Batch API Routes (2 hours)
  CREATE src/app/api/annotations/batch-accept/route.ts:
    - POST handler with { matches } array
    - OPTIMIZE: Use single supabase.upsert() not loop
    - UPDATE: Position component data + needs_review: false
    - PATTERN: onConflict: 'id', ignoreDuplicates: false
    - RETURN: { success: true, updated: count }

  CREATE src/app/api/annotations/batch-discard/route.ts:
    - POST handler with { componentIds } array
    - DELETE: Batch delete using .in(componentIds)
    - RETURN: { success: true, deleted: count }

Task 6.2: Review Tab Component (2 hours)
  CREATE src/components/sidebar/AnnotationReviewTab.tsx:
    - CLIENT COMPONENT: 'use client'
    - PROPS: { documentId, results, onHighlightAnnotation }

  UI STRUCTURE:
    - Stats summary (3 columns: Restored, Review, Lost)
    - ScrollArea with review queue
    - Each item shows:
      * Confidence badge
      * Original text (line-clamp-2)
      * Suggested text (line-clamp-2)
      * Accept/Discard buttons
    - Lost annotations in collapsible <details>
    - Batch actions footer (Accept All, Discard All)

  INTERACTIONS:
    - Click item: Highlight in document via onHighlightAnnotation()
    - Accept: POST to /api/annotations/accept-match
    - Discard: POST to /api/annotations/discard
    - Accept All: POST to /api/annotations/batch-accept
    - Discard All: POST to /api/annotations/batch-discard

Task 6.3: RightPanel Integration (1 hour)
  MODIFY src/components/sidebar/RightPanel.tsx:
    - ADD: 'review' to tab types
    - ADD: reviewResults prop (nullable)
    - ADD: onHighlightAnnotation callback prop
    - UPDATE: TabsList grid-cols-4 (add Review tab)
    - AUTO-SWITCH: If reviewResults.needsReview.length > 0, setActiveTab('review')
    - SHOW: Badge with count on Review tab

  TabsContent for 'review':
    - IF reviewResults && needsReview.length > 0:
      * Render <AnnotationReviewTab />
    - ELSE:
      * Show "No annotations need review" message

# ============================================================================
# PHASE 7: INFRASTRUCTURE & CRON (3 hours)
# ============================================================================

Task 7.1: Periodic Annotation Export (2 hours)
  CREATE worker/jobs/export-annotations.ts:
    - IMPORT: node-cron
    - SCHEDULE: cron.schedule('0 * * * *') // Every hour

  CRON LOGIC:
    1. Fetch all documents with markdown_path
    2. For each document:
       a. Get Position components (annotations)
       b. Transform to portable format (not raw DB structure):
          { text, note, color, type, position, pageLabel, created_at, recovery }
       c. Upload as .annotations.json to storage
    3. Log: Exported count

  PORTABLE FORMAT (CRITICAL):
    annotations.map(a => ({
      text: a.data.originalText,
      note: a.data.note,
      color: a.data.color,
      type: a.data.type,
      position: { start: a.data.startOffset, end: a.data.endOffset },
      pageLabel: a.data.pageLabel,
      created_at: a.created_at,
      recovery: a.recovery_method ? {
        method: a.recovery_method,
        confidence: a.recovery_confidence
      } : undefined
    }))

Task 7.2: Worker Integration (1 hour)
  MODIFY worker/index.ts:
    - IMPORT: { startAnnotationExportCron } from './jobs/export-annotations.js'
    - CALL: startAnnotationExportCron() after worker setup
    - LOG: 'Annotation export cron started (runs hourly)'

# ============================================================================
# PHASE 8: READWISE IMPORT (2 hours)
# ============================================================================

Task 8.1: Readwise Import Handler (2 hours)
  CREATE worker/handlers/readwise-import.ts:
    - IMPORT: findAnnotationMatch from fuzzy-matching
    - IMPORT: ECS, AnnotationOperations

  EXPORT: async function importReadwiseHighlights()
    INPUTS: (documentId, readwiseJson: ReadwiseHighlight[])
    ALGORITHM:
      1. Fetch markdown and chunks for documentId
      2. For each highlight:
         a. Try exact match first (markdown.indexOf)
         b. If exact: Create annotation immediately (imported++)
         c. If not exact:
            - Estimate chunk: Math.floor(location/100 * chunks.length)
            - Try chunk-bounded fuzzy match
            - If confidence >0.8: Add to needsReview
            - Otherwise: Add to failed
      3. Return { imported, needsReview, failed }

  HELPER: function mapReadwiseColor()
    MAP: { yellow→yellow, blue→blue, red→red, green→green, orange→orange }
    DEFAULT: 'yellow'

  HELPER: async function createAnnotation()
    CRITICAL: Implement proper ECS creation (not TODO stub!)
    PATTERN:
      const supabase = createClient(...)
      const ecs = new ECS(supabase)
      const ops = new AnnotationOperations(ecs, 'readwise-import')

      // Get chunk for position
      const { data: chunks } = await supabase
        .from('chunks')
        .select('id')
        .eq('document_id', documentId)
        .lte('start_offset', startOffset)
        .gte('end_offset', endOffset)
        .limit(1)

      return await ops.create({
        documentId,
        startOffset,
        endOffset,
        originalText: text,
        chunkId: chunks[0].id,
        chunkPosition: 0,
        type: 'highlight',
        color,
        note
      })

# ============================================================================
# PHASE 9: TESTING & VALIDATION (8 hours)
# ============================================================================

Task 9.1: Critical Tests (3 hours)
  CREATE tests/critical/annotation-recovery.test.ts:
    - TEST: Context capture in server action
    - TEST: 4-tier fuzzy matching strategies
    - TEST: Confidence threshold classification
    - TEST: Multi-chunk annotation support
    - TEST: Cross-document connection preservation
    - MOCK: Supabase storage and database
    - FIXTURES: Real chunk data from processed book

  RUN: npm run test:critical
  EXPECT: All tests pass

Task 9.2: Integration Tests (3 hours)
  CREATE worker/tests/integration/reprocessing.test.ts:
    - TEST: Full reprocessing workflow
    - TEST: Transaction rollback on failure
    - TEST: Annotation recovery pipeline
    - TEST: Connection remapping with embeddings
    - FIXTURES: Real markdown, real chunks, real annotations

  RUN: cd worker && npm run test:integration
  EXPECT: All tests pass

Task 9.3: Performance Tests (2 hours)
  CREATE worker/benchmarks/annotation-recovery.ts:
    - BENCHMARK: 20 annotations in <2 seconds
    - BENCHMARK: Chunk-bounded vs full-text (50-75x speedup)
    - BENCHMARK: Batch operations <2 seconds for 50 items
    - METRICS: Memory usage, CPU time

  RUN: cd worker && npm run benchmark:annotation-recovery
  EXPECT: All benchmarks within targets

# ============================================================================
# PHASE 10: DOCUMENTATION (4 hours)
# ============================================================================

Task 10.1: Update Documentation (2 hours)
  UPDATE docs/ARCHITECTURE.md:
    - ADD: Annotation recovery section
    - EXPLAIN: 4-tier fuzzy matching strategy
    - DIAGRAM: Recovery pipeline flow

  UPDATE docs/IMPLEMENTATION_STATUS.md:
    - MARK: Annotation recovery ✅ COMPLETE
    - MARK: Obsidian integration ✅ COMPLETE
    - MARK: Review UI ✅ COMPLETE

  UPDATE worker/README.md:
    - ADD: Recovery handlers documentation
    - ADD: Fuzzy matching extensions
    - ADD: Obsidian sync handlers

Task 10.2: Performance Validation (2 hours)
  RUN: npm run benchmark:fuzzy-matching
  VERIFY: <2s for 20 annotations

  RUN: npm run benchmark:annotation-recovery
  VERIFY: >90% recovery rate

  RUN: npm run test:full-validation
  VERIFY: All validations pass

  DOCUMENT: Results in docs/PERFORMANCE.md
```

### Integration Points

```yaml
# Database Migrations
MIGRATIONS:
  - run: npx supabase db reset
    when: After creating all migrations
    creates: [031, 032, 030b, 030c, 030d]

  - run: npx supabase migration new <name>
    pattern: Sequential numbering (030 → 031 → 032)
    location: supabase/migrations/

# Worker Module
WORKER_HANDLERS:
  - add to: worker/handlers/
    pattern: Export async function, use Supabase service role
    imports: Add .js extension for ESM (import './file.js')
    types: Import from ../types/recovery.js

FUZZY_MATCHING:
  - extend: worker/lib/fuzzy-matching.ts
    location: After line 718 (end of existing code)
    section: "// ANNOTATION RECOVERY FUNCTIONS"
    preserve: All existing trigram functions

# Frontend Components
SIDEBAR_INTEGRATION:
  - modify: src/components/sidebar/RightPanel.tsx
    add: AnnotationReviewTab as 4th tab
    props: reviewResults, onHighlightAnnotation
    pattern: Follow existing Connections/Annotations tabs

SERVER_ACTIONS:
  - modify: src/app/actions/annotations.ts
    add: Server-side context capture
    pattern: Fetch markdown from storage, extract context
    critical: Use service role for storage access

# Cron Jobs
WORKER_JOBS:
  - add to: worker/jobs/
    start: Call from worker/index.ts
    schedule: node-cron patterns
    pattern: Hourly export, daily cleanup
```

---

## Validation Loop

### Level 1: Syntax & Style

```bash
# Main App
npm run lint                          # ESLint validation
npm run type-check                    # TypeScript checking

# Worker Module
cd worker && npm run lint             # Worker ESLint
cd worker && npm run type-check       # Worker TypeScript

# Expected: No errors. If errors, READ and fix.
```

### Level 2: Unit Tests

```bash
# Critical Tests (must pass)
npm run test:critical                 # E2E + integration smoke
cd worker && npm run test:unit        # Worker unit tests

# Stable Tests (should pass)
npm run test:stable                   # API contracts
cd worker && npm run test:integration # Worker integration

# Expected: All pass. Fix failures before proceeding.
```

### Level 3: Integration

```bash
# Full validation suite
npm run test:full-validation          # Build + lint + integration + validation
cd worker && npm run test:full-validation

# Performance benchmarks
cd worker && npm run benchmark:annotation-recovery

# Expected: <2s for 20 annotations, >90% recovery rate
```

---

## Final Validation Checklist

- [ ] All tests pass: `npm test && cd worker && npm test`
- [ ] No linting errors: `npm run lint && cd worker && npm run lint`
- [ ] No type errors: TypeScript compiles cleanly in both modules
- [ ] Build succeeds: `npm run build && cd worker && npm run build`
- [ ] Manual test: Upload document, edit via Obsidian, sync successfully
- [ ] Recovery test: 20 annotations recovered in <2 seconds
- [ ] Review UI: Annotations appear in sidebar, accept/discard works
- [ ] Batch operations: Accept All/Discard All complete in <2 seconds
- [ ] Error handling: Network failures, missing files handled gracefully
- [ ] Cross-document: Connections preserved when both docs edited
- [ ] Rollback: Failed recovery restores old chunks correctly
- [ ] Logs: Informative console output, no verbose spam
- [ ] Dependencies: fastest-levenshtein@1.0.16 in worker/package.json
- [ ] Migrations: 031, 032 applied successfully
- [ ] Documentation: ARCHITECTURE.md and IMPLEMENTATION_STATUS.md updated

---

## Anti-Patterns to Avoid

- ❌ Don't create `worker/lib/fuzzy-match.ts` - EXTEND existing `fuzzy-matching.ts`
- ❌ Don't use modals for review - Use RightPanel with new tab
- ❌ Don't store full markdown in components table - Only store offsets and context
- ❌ Don't skip validation of null inputs for Levenshtein - Always check
- ❌ Don't use API routes for mutations - Use Server Actions only
- ❌ Don't delete chunks before recovery succeeds - Use is_current flag for rollback
- ❌ Don't ignore cross-document connections - Check both source and target document IDs
- ❌ Don't use sequential updates for batch operations - Use upsert()
- ❌ Don't export raw DB structure - Transform to portable format
- ❌ Don't use relative imports in worker - ESM requires .js extensions
- ❌ Don't forget chunk_ids array - Multi-chunk annotations need it
- ❌ Don't bypass context capture - Server Actions must fetch markdown and extract context
- ❌ Don't use window.open for Obsidian URI - Use invisible iframe for protocol handling

---

## Task Breakdown Reference

**Detailed Sprint Planning**: See [`docs/tasks/annotation-recovery-and-sync.md`](../tasks/annotation-recovery-and-sync.md)

The task breakdown document provides:
- **25 discrete tasks** (T-001 to T-025) sized for sprint execution
- **Work breakdown structure** with dependencies and critical path
- **Acceptance criteria** in Given-When-Then format for each task
- **Risk assessment** with mitigation strategies
- **Sprint allocation** for 2-week sprint cycles

**Sprint Overview**:
- **Sprint 1 (Week 1)**: Foundation & Core Recovery (Phases 0-4, 14 tasks, 23 hours)
- **Sprint 2 (Week 2)**: Integration & UI (Phases 5-10, 11 tasks, 27 hours)

---

## Success Confidence Score

**9/10** - High confidence for one-pass implementation

**Strengths**:
- Complete type definitions with no `any[]`
- Existing fuzzy-matching.ts provides proven foundation
- Clear 4-tier strategy with fallback
- Comprehensive error handling specified
- Transaction-safe rollback pattern
- All integration points identified
- Real codebase patterns to follow

**Minor Risks**:
- Obsidian URI handling may need OS-specific adjustments (iframe approach should work universally)
- Performance benchmarks may need tuning based on real data (targets are conservative)
- Review UI UX may need iteration based on user feedback (basic flow is solid)

**Mitigation**:
- Start with pre-flight verification (Phase 0)
- Test each phase incrementally
- Use existing fuzzy-matching.ts patterns
- Follow ECS patterns for all entity operations
- Validate with real book fixtures

---

## Task Breakdown Reference

See `docs/tasks/annotation-recovery-and-sync.md` for detailed task breakdown with:
- Work breakdown structure (WBS)
- Task dependencies and critical path
- Acceptance criteria (Given-When-Then format)
- Estimated effort per task
- Risk assessment and mitigation

This PRP provides all context needed for implementation. The task breakdown document provides sprint planning and execution details.
