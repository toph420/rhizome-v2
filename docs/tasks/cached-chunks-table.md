# Task Breakdown: Cached Chunks Table Implementation

**Generated**: 2025-10-11
**Source PRP**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md)
**Total Estimated Effort**: 10-12 hours
**Priority**: High (Fixes LOCAL mode resume/reprocessing bug)

---

## PRP Analysis Summary

### Feature Name & Scope
**Cached Chunks Table Implementation** - Persistent storage for Docling extraction results enabling zero-cost LOCAL mode reprocessing.

### Key Technical Requirements
1. **Persistent Cache Storage**: Dedicated `cached_chunks` table with document-level lifecycle
2. **Cache Validation**: SHA256 hash-based validation to detect markdown changes
3. **Processor Integration**: PDF/EPUB processors save cache after Docling extraction
4. **Handler Integration**: Continue-processing and reprocess handlers load cache for bulletproof matching
5. **Bulletproof Matching**: 5-layer system preserves structural metadata through edits

### Validation Requirements
- Migration applies cleanly (zero errors)
- Cache save/load operations work correctly
- Hash validation prevents stale cache usage
- Graceful fallback to CLOUD mode when cache missing
- 100% backward compatibility (no breaking changes)
- Zero TypeScript/lint errors
- All integration tests pass

---

## Task Complexity Assessment

### Overall Complexity Rating
**Medium-High** (7/10)

**Rationale:**
- Straightforward database migration (JSONB storage pattern proven)
- Simple utility layer (hash + CRUD operations)
- Complex handler integration (bulletproof matching orchestration)
- 5 distinct integration points across worker module
- Requires careful testing (cache hit/miss scenarios)

### Integration Points
1. **Database Layer**: New `cached_chunks` table with CASCADE delete
2. **PDF Processor**: Save cache after Docling extraction (line ~126)
3. **EPUB Processor**: Save cache after Docling extraction (line ~118)
4. **Continue-Processing Handler**: Load cache for resume workflow (lines 170-189)
5. **Reprocess Handler**: Load cache for bulletproof matching (line ~103)

### Technical Challenges
1. **JSONB Type Safety**: TypeScript casting for DoclingChunk[] arrays
2. **Hash Validation**: Detecting markdown changes without false positives
3. **Bulletproof Matching Integration**: Complex orchestration in reprocess handler
4. **Graceful Degradation**: Non-fatal cache failures, clear logging
5. **Testing Coverage**: Mock-based unit tests + real integration tests

---

## Phase Organization

### Phase 1: Database Foundation (2 hours)
**Objective**: Create table schema, types, and validate migration

**Deliverables**:
- Migration file `046_cached_chunks_table.sql`
- Type definitions `worker/types/cached-chunks.ts`
- Database structure validated

**Milestones**:
- ✅ Migration applies without errors
- ✅ Table structure matches specification
- ✅ Indexes created, RLS disabled

---

### Phase 2: Utility Layer (1.5 hours)
**Objective**: Implement cache CRUD operations with validation

**Deliverables**:
- Utility module `worker/lib/cached-chunks.ts`
- Hash generation function
- Save/load/delete operations
- Comprehensive logging

**Milestones**:
- ✅ All functions compile without TypeScript errors
- ✅ ESM imports use `.js` extensions
- ✅ Non-fatal error handling implemented

---

### Phase 3: Processor Integration (2 hours)
**Objective**: Integrate cache save operations into PDF/EPUB processors

**Deliverables**:
- Updated `worker/processors/pdf-processor.ts`
- Updated `worker/processors/epub-processor.ts`
- Cache save after Docling extraction

**Milestones**:
- ✅ Processors save cache successfully
- ✅ Cache row created in database
- ✅ Processing continues even if cache save fails

---

### Phase 4: Handler Integration (3 hours)
**Objective**: Integrate cache load operations for resume/reprocess workflows

**Deliverables**:
- Updated `worker/handlers/continue-processing.ts`
- Updated `worker/handlers/reprocess-document.ts`
- Bulletproof matching integration
- LOCAL mode path with graceful fallback

**Milestones**:
- ✅ Resume workflow loads cache
- ✅ Reprocess workflow uses bulletproof matching
- ✅ Hash validation works correctly
- ✅ CLOUD mode fallback when cache missing

---

### Phase 5: Testing & Documentation (2 hours)
**Objective**: Comprehensive testing and documentation updates

**Deliverables**:
- Integration test file `worker/tests/integration/cached-chunks.test.ts`
- Updated `docs/PROCESSING_PIPELINE.md`
- Updated `docs/ARCHITECTURE.md`
- Validation commands in `worker/package.json`

**Milestones**:
- ✅ All tests pass (unit + integration)
- ✅ Documentation complete and accurate
- ✅ Manual E2E validation successful

---

## Detailed Task Breakdown

### PHASE 1: DATABASE FOUNDATION

---

#### **Task T1.1: Create Migration File**

**Task ID**: T1.1
**Task Name**: Create cached_chunks table migration
**Priority**: Critical
**Estimated Effort**: 30 minutes
**Dependencies**: None

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Database Schema section

**Feature Overview**:
The cached chunks table stores Docling extraction results for LOCAL mode processing. This enables zero-cost reprocessing months or years later without calling expensive Gemini APIs.

**Task Purpose**:
- **As a** LOCAL mode user
- **I need** persistent storage for Docling extraction results
- **So that** I can reprocess documents without API costs ($0.00 vs $0.50)

**Dependencies**:
- **Prerequisite Tasks**: None (first task)
- **Parallel Tasks**: T1.2 (type definitions)
- **Integration Points**: Supabase PostgreSQL database
- **Blocked By**: None

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: When migration runs, the system shall create `cached_chunks` table with 9 columns
- **REQ-2**: The system shall enforce UNIQUE constraint on `document_id` (one cache per document)
- **REQ-3**: The system shall create 3 indexes for efficient querying
- **REQ-4**: The system shall add CASCADE delete (cache deleted when document deleted)
- **REQ-5**: The system shall disable RLS (single-user personal tool)

**Non-Functional Requirements**:
- **Performance**: Migration runs in <5 seconds
- **Compatibility**: PostgreSQL 14+ with JSONB support

**Technical Constraints**:
- **Migration Number**: Must be 046 (next after 045)
- **Naming Convention**: `NNN_descriptive_name.sql` format
- **Database**: Supabase local dev stack (port 54322)

##### Implementation Details

**Files to Modify/Create**:
```
└── supabase/migrations/046_cached_chunks_table.sql - [NEW FILE] Migration script
```

**Key Implementation Steps**:
1. **Create migration file** → Copy SQL from PRP Technical Design section
2. **Verify migration number** → Check `supabase/migrations/` for latest (045)
3. **Add table comments** → Document columns for future reference
4. **Add indexes** → Optimize for document_id lookup (primary access pattern)

**Code Patterns to Follow**:
- **Similar Pattern**: `supabase/migrations/045_add_local_pipeline_columns.sql` - Migration structure
- **Comments**: Add COMMENT ON TABLE/COLUMN for documentation
- **Trigger**: Reuse existing `update_updated_at_column()` function

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Migration applies successfully
  Given a fresh Supabase database
  When I run "npx supabase db reset"
  Then migration 046 applies without errors
  And table "cached_chunks" exists with 9 columns

Scenario 2: UNIQUE constraint enforced
  Given cached_chunks table exists
  When I insert two rows with same document_id
  Then second insert fails with unique violation error

Scenario 3: Indexes created
  Given migration has run
  When I query pg_indexes for cached_chunks
  Then I see 3 indexes: idx_cached_chunks_document, idx_cached_chunks_mode, idx_cached_chunks_created

Scenario 4: CASCADE delete works
  Given a document with cached chunks exists
  When I delete the document from documents table
  Then cached chunks row is automatically deleted
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Table created with correct schema
- [ ] **Constraints**: UNIQUE constraint on document_id works
- [ ] **Indexes**: All 3 indexes created and active
- [ ] **Triggers**: updated_at trigger fires on UPDATE
- [ ] **Permissions**: RLS disabled (verified in table metadata)
- [ ] **Documentation**: Table and column comments present
- [ ] **Cleanup**: CASCADE delete removes orphaned caches

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Validate migration syntax
npx supabase db reset

# Check table structure
psql -h localhost -p 54322 -U postgres -d postgres -c "\d cached_chunks"
# Expected: 9 columns (id, document_id, extraction_mode, markdown_hash, docling_version, chunks, structure, created_at, updated_at)

# Verify indexes
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'cached_chunks';
"
# Expected: 3 indexes listed

# Verify UNIQUE constraint
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT conname, contype FROM pg_constraint
  WHERE conrelid = 'cached_chunks'::regclass AND contype = 'u';
"
# Expected: cached_chunks_document_id_key UNIQUE constraint

# Verify RLS disabled
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT relrowsecurity FROM pg_class WHERE relname = 'cached_chunks';
"
# Expected: f (false)
```

**Definition of Done**:
- [ ] Migration file created with correct number (046)
- [ ] Migration applies without errors or warnings
- [ ] Table structure validated via psql
- [ ] All indexes exist and are active
- [ ] UNIQUE constraint works (tested manually)
- [ ] CASCADE delete works (tested manually)
- [ ] RLS disabled and documented
- [ ] Comments present in schema

##### Resources & References

**Documentation Links**:
- **Supabase Migrations**: https://supabase.com/docs/guides/cli/local-development#database-migrations
- **PostgreSQL JSONB**: https://www.postgresql.org/docs/current/datatype-json.html

**Code References**:
- **Migration Pattern**: `supabase/migrations/045_add_local_pipeline_columns.sql:1-50`
- **JSONB Storage**: `supabase/migrations/016_user_preferences.sql:10-15`
- **Trigger Usage**: `supabase/migrations/001_initial_schema.sql:200-210`

**External Resources**:
- **PostgreSQL Constraints**: https://www.postgresql.org/docs/current/ddl-constraints.html
- **JSONB Best Practices**: https://stackoverflow.com/questions/tagged/postgresql+jsonb

---

#### **Task T1.2: Create Type Definitions**

**Task ID**: T1.2
**Task Name**: Define TypeScript types for cached chunks
**Priority**: Critical
**Estimated Effort**: 30 minutes
**Dependencies**: None (parallel with T1.1)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Type Definitions section

**Feature Overview**:
Type-safe interfaces for cached chunks table ensure correct usage across processors and handlers.

**Task Purpose**:
- **As a** developer working with cached chunks
- **I need** TypeScript type definitions
- **So that** I have compile-time safety and IDE autocomplete

**Dependencies**:
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T1.1 (migration)
- **Integration Points**: `worker/lib/docling-extractor.ts` (DoclingChunk, DoclingStructure types)
- **Blocked By**: None

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: The system shall define `CachedChunksRow` interface matching database schema
- **REQ-2**: The system shall define `CachedChunksInput` interface for save operations
- **REQ-3**: The system shall define `CachedChunksResult` interface for load operations
- **REQ-4**: The system shall import existing `DoclingChunk` and `DoclingStructure` types

**Technical Constraints**:
- **Technology Stack**: TypeScript 5.x, ESM modules
- **Import Pattern**: Use `.js` extension for ESM compatibility
- **Location**: `worker/types/` directory (worker module types)

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/types/cached-chunks.ts - [NEW FILE] Type definitions for cached chunks table
```

**Key Implementation Steps**:
1. **Create type file** → Copy types from PRP Technical Design section
2. **Import DoclingChunk and DoclingStructure** → From `../lib/docling-extractor.js`
3. **Add JSDoc comments** → Document each interface and field
4. **Export all types** → Make available for import by utility layer

**Code Patterns to Follow**:
- **Similar Pattern**: `worker/types/processor.ts:1-50` - Type structure and exports
- **Import Pattern**: `worker/types/processor.ts:1-5` - ESM imports with `.js`
- **JSDoc Comments**: `worker/types/processor.ts:10-20` - Documentation style

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Types compile without errors
  Given type definitions are created
  When I run "npm run build" in worker directory
  Then compilation succeeds with zero TypeScript errors

Scenario 2: Types import correctly
  Given cached-chunks.ts exists
  When I import types in utility layer
  Then imports resolve without module errors

Scenario 3: DoclingChunk types match
  Given DoclingChunk is imported from docling-extractor
  When I use it in CachedChunksInput
  Then type checking passes for chunks array
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: All 3 interfaces defined correctly
- [ ] **Imports**: DoclingChunk and DoclingStructure imported with `.js` extension
- [ ] **Documentation**: JSDoc comments on all interfaces
- [ ] **Exports**: All types exported for external use
- [ ] **Type Safety**: No `any` types used
- [ ] **Field Types**: All fields match database column types

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Compile worker module
cd worker && npm run build
# Expected: Zero TypeScript errors

# Verify imports resolve
cd worker && npx tsc --noEmit
# Expected: No module resolution errors

# Check for type safety issues
cd worker && npm run lint
# Expected: Zero ESLint errors related to types
```

**Definition of Done**:
- [ ] Type file created at `worker/types/cached-chunks.ts`
- [ ] All 3 interfaces defined (Row, Input, Result)
- [ ] DoclingChunk and DoclingStructure imported correctly
- [ ] JSDoc comments added for documentation
- [ ] Compilation passes without errors
- [ ] Lint passes without errors
- [ ] Types exported and importable

##### Resources & References

**Code References**:
- **DoclingChunk Type**: `worker/lib/docling-extractor.ts:24-54`
- **DoclingStructure Type**: `worker/lib/docling-extractor.ts:56-71`
- **Type Pattern**: `worker/types/processor.ts:1-100`

---

#### **Task T1.3: Validate Migration**

**Task ID**: T1.3
**Task Name**: Run migration and validate database structure
**Priority**: Critical
**Estimated Effort**: 30 minutes
**Dependencies**: T1.1 (migration file must exist)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Validation Gates section

**Task Purpose**:
- **As a** developer completing Phase 1
- **I need** to validate the migration works correctly
- **So that** I can proceed confidently to Phase 2

**Dependencies**:
- **Prerequisite Tasks**: T1.1 (migration file)
- **Parallel Tasks**: None
- **Integration Points**: Supabase local database
- **Blocked By**: T1.1

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: When migration runs, all SQL executes without errors
- **REQ-2**: The system shall create table with exact schema specified
- **REQ-3**: The system shall create all indexes
- **REQ-4**: The system shall enforce constraints (UNIQUE, CASCADE)

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Fresh migration succeeds
  Given Supabase is running locally
  When I run "npx supabase db reset"
  Then migration 046 applies successfully
  And no error messages appear in output

Scenario 2: Table structure correct
  Given migration has run
  When I query table structure with \d cached_chunks
  Then I see 9 columns with correct types
  And I see 3 indexes
  And I see 1 UNIQUE constraint
  And I see 1 trigger

Scenario 3: UNIQUE constraint works
  Given cached_chunks table exists
  When I manually insert duplicate document_id
  Then PostgreSQL returns unique violation error
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Migration**: Applies without errors or warnings
- [ ] **Table**: Exists with correct name and columns
- [ ] **Indexes**: All 3 indexes created
- [ ] **Constraints**: UNIQUE constraint enforced
- [ ] **Triggers**: updated_at trigger active
- [ ] **RLS**: Disabled (verified)
- [ ] **Comments**: Table and column comments present

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Reset database with all migrations
npx supabase db reset

# Detailed table structure
psql -h localhost -p 54322 -U postgres -d postgres -c "\d+ cached_chunks"

# Test UNIQUE constraint
psql -h localhost -p 54322 -U postgres -d postgres -c "
  INSERT INTO cached_chunks (document_id, extraction_mode, markdown_hash, chunks, structure)
  VALUES ('test-123', 'pdf', 'hash1', '[]'::jsonb, '{}'::jsonb);

  INSERT INTO cached_chunks (document_id, extraction_mode, markdown_hash, chunks, structure)
  VALUES ('test-123', 'pdf', 'hash2', '[]'::jsonb, '{}'::jsonb);
"
# Expected: Second insert fails with "duplicate key value violates unique constraint"

# Cleanup test data
psql -h localhost -p 54322 -U postgres -d postgres -c "
  DELETE FROM cached_chunks WHERE document_id = 'test-123';
"
```

**Definition of Done**:
- [ ] Migration runs successfully
- [ ] Table structure validated
- [ ] Indexes verified in pg_indexes
- [ ] UNIQUE constraint tested manually
- [ ] Trigger tested manually (UPDATE changes updated_at)
- [ ] RLS status confirmed disabled
- [ ] Comments visible in schema
- [ ] Phase 1 validation gate passed

---

### PHASE 2: UTILITY LAYER

---

#### **Task T2.1: Implement Cache Utility Functions**

**Task ID**: T2.1
**Task Name**: Create cached chunks utility module
**Priority**: High
**Estimated Effort**: 1.5 hours
**Dependencies**: T1.2 (type definitions)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Utility Layer section

**Feature Overview**:
Utility functions provide clean interface for cache operations (save, load, delete, hash) with comprehensive logging and error handling.

**Task Purpose**:
- **As a** processor or handler
- **I need** utility functions for cache operations
- **So that** I can save/load cached chunks with proper validation

**Dependencies**:
- **Prerequisite Tasks**: T1.2 (type definitions)
- **Parallel Tasks**: None
- **Integration Points**: Supabase client, Node.js crypto module
- **Blocked By**: T1.2

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: The system shall hash markdown using SHA256
- **REQ-2**: When saving cache, the system shall upsert on document_id
- **REQ-3**: When loading cache, the system shall validate markdown hash
- **REQ-4**: The system shall return null for hash mismatch (stale cache)
- **REQ-5**: The system shall log all cache operations (save, load, delete)
- **REQ-6**: The system shall handle errors gracefully (non-fatal)

**Non-Functional Requirements**:
- **Performance**: Hash generation <10ms, cache load <2 seconds
- **Reliability**: Non-fatal error handling (log warnings, continue)

**Technical Constraints**:
- **Technology Stack**: Node.js crypto (built-in), Supabase client
- **Error Handling**: Try-catch blocks, console.warn for non-fatal errors
- **Logging**: Consistent prefix `[CachedChunks]`

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/lib/cached-chunks.ts - [NEW FILE] Utility functions for cache operations
```

**Key Implementation Steps**:
1. **hashMarkdown()** → Single line: `createHash('sha256').update(markdown).digest('hex')`
2. **saveCachedChunks()** → Supabase upsert with `onConflict: 'document_id'`, log chunk count
3. **loadCachedChunks()** → Query by document_id, validate hash, return null if mismatch
4. **deleteCachedChunks()** → Simple delete query, log success/failure
5. **Add imports** → crypto, Supabase client, types
6. **Add comprehensive logging** → All operations logged with chunk counts and hash prefixes

**Code Patterns to Follow**:
- **Similar Pattern**: `worker/lib/embeddings.ts:1-50` - Utility function structure
- **Error Handling**: `worker/processors/pdf-processor.ts:150-160` - Try-catch with console.warn
- **Logging Pattern**: `worker/lib/local/ollama-cleanup.ts:20-30` - Prefix and structured logs
- **Type Casting**: `worker/handlers/continue-processing.ts:180` - JSONB to TypeScript types

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Hash generation is consistent
  Given markdown string "# Test"
  When I call hashMarkdown() twice with same string
  Then both hashes are identical

Scenario 2: Save cache creates row
  Given document_id and chunks data
  When I call saveCachedChunks()
  Then row is created in cached_chunks table
  And success message is logged

Scenario 3: Load cache validates hash
  Given cached chunks exist with hash "abc123"
  When I call loadCachedChunks() with hash "def456"
  Then function returns null
  And warning about hash mismatch is logged

Scenario 4: Load cache succeeds on hash match
  Given cached chunks exist with hash "abc123"
  When I call loadCachedChunks() with hash "abc123"
  Then function returns chunks and structure
  And success message is logged

Scenario 5: Save cache is non-fatal
  Given Supabase insert fails (network error)
  When I call saveCachedChunks()
  Then function logs warning
  And function returns without throwing
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: All 4 functions implemented correctly
- [ ] **Type Safety**: All parameters and returns properly typed
- [ ] **Error Handling**: Try-catch blocks, non-fatal failures
- [ ] **Logging**: Comprehensive logs with chunk counts, hash prefixes
- [ ] **Hash Validation**: Correctly detects markdown changes
- [ ] **Upsert**: Correctly replaces existing cache on duplicate document_id
- [ ] **JSONB Casting**: Proper type casting for chunks and structure

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Compile module
cd worker && npm run build
# Expected: Zero TypeScript errors

# Lint check
cd worker && npm run lint
# Expected: Zero ESLint errors

# Manual testing (optional)
cd worker && npx tsx -e "
import { hashMarkdown, saveCachedChunks, loadCachedChunks } from './lib/cached-chunks.js'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const markdown = '# Test Document\n\nContent here.'
const hash = hashMarkdown(markdown)
console.log('Hash:', hash)

await saveCachedChunks(supabase, {
  document_id: 'test-123',
  extraction_mode: 'pdf',
  markdown_hash: hash,
  chunks: [],
  structure: { headings: [], total_pages: 1, sections: [] }
})

const loaded = await loadCachedChunks(supabase, 'test-123', hash)
console.log('Loaded:', loaded)
"
```

**Definition of Done**:
- [ ] Utility file created at `worker/lib/cached-chunks.ts`
- [ ] All 4 functions implemented
- [ ] Imports use `.js` extension (ESM compatibility)
- [ ] Compilation passes without errors
- [ ] Lint passes without errors
- [ ] Logging is comprehensive and consistent
- [ ] Error handling is non-fatal
- [ ] Manual testing succeeds (optional)

##### Resources & References

**Documentation Links**:
- **Node.js crypto**: https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
- **Supabase upsert**: https://supabase.com/docs/reference/javascript/upsert

**Code References**:
- **Utility Pattern**: `worker/lib/embeddings.ts:1-100`
- **Error Handling**: `worker/processors/pdf-processor.ts:150-170`
- **Logging**: `worker/lib/local/ollama-cleanup.ts:20-50`
- **JSONB Casting**: `worker/handlers/continue-processing.ts:180-190`

---

### PHASE 3: PROCESSOR INTEGRATION

---

#### **Task T3.1: Update PDF Processor**

**Task ID**: T3.1
**Task Name**: Integrate cache save into PDF processor
**Priority**: High
**Estimated Effort**: 45 minutes
**Dependencies**: T2.1 (utility functions)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Integration Points section

**Feature Overview**:
PDF processor saves cached chunks after Docling extraction to enable zero-cost reprocessing.

**Task Purpose**:
- **As a** PDF processor
- **I need** to save Docling extraction results to cache
- **So that** future reprocessing can use bulletproof matching without Gemini

**Dependencies**:
- **Prerequisite Tasks**: T2.1 (utility functions)
- **Parallel Tasks**: T3.2 (EPUB processor)
- **Integration Points**: `worker/lib/docling-extractor.ts`, `worker/lib/cached-chunks.ts`
- **Blocked By**: T2.1

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: When Docling extraction completes, the system shall save cached chunks
- **REQ-2**: The system shall generate markdown hash before save
- **REQ-3**: The system shall include Docling version in cache
- **REQ-4**: When cache save fails, the system shall log warning and continue processing

**Technical Constraints**:
- **Location**: `worker/processors/pdf-processor.ts` line ~126 (after Docling extraction)
- **Pattern**: Replace job.metadata cache with saveCachedChunks() call
- **Error Handling**: Non-fatal (processing continues even if save fails)

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/processors/pdf-processor.ts - [MODIFY] Add cache save after extraction
```

**Key Implementation Steps**:
1. **Add imports** → `import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'`
2. **Find Phase 2 comment** → Line ~126: "// Phase 2: Cache extraction result in job metadata"
3. **Replace job.metadata** → Call `saveCachedChunks()` instead
4. **Generate hash** → `hashMarkdown(extractionResult.markdown)`
5. **Pass all fields** → document_id, extraction_mode: 'pdf', hash, chunks, structure
6. **Keep job.metadata for backward compat** → Other code may still reference it (non-critical)

**Code Patterns to Follow**:
- **Integration Point**: `worker/processors/pdf-processor.ts:123-135` - Existing cache location
- **Non-fatal Pattern**: `worker/processors/epub-processor.ts:150-160` - Try-catch with continue
- **Logging**: `worker/processors/pdf-processor.ts:100-110` - Consistent log style

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: PDF processing saves cache
  Given LOCAL mode is enabled
  When I process a PDF with Docling
  Then cached_chunks row is created
  And extraction_mode is 'pdf'
  And chunks array matches extraction result
  And markdown_hash is correct SHA256

Scenario 2: Cache save failure is non-fatal
  Given Supabase is unreachable
  When PDF processing completes Docling extraction
  Then cache save logs warning
  And processing continues to Phase 3 (cleanup)

Scenario 3: Hash generated correctly
  Given extraction produces markdown
  When cache is saved
  Then markdown_hash matches hashMarkdown() output
  And hash is 64 characters (SHA256 hex)
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Cache saved after every PDF extraction
- [ ] **Data**: All fields populated correctly (document_id, mode, hash, chunks, structure)
- [ ] **Error Handling**: Non-fatal failure (log + continue)
- [ ] **Logging**: Success message with chunk count
- [ ] **Integration**: Processing continues to next phase
- [ ] **Backward Compat**: Existing job.metadata code still works

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Compile processor
cd worker && npm run build
# Expected: Zero TypeScript errors

# Lint check
cd worker && npm run lint
# Expected: Zero ESLint errors

# Process test PDF
cd worker && npx tsx scripts/test-local-pipeline.ts
# Expected: Processing succeeds

# Verify cache row created
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT document_id, extraction_mode,
         jsonb_array_length(chunks) as chunk_count,
         LEFT(markdown_hash, 8) as hash_prefix
  FROM cached_chunks
  ORDER BY created_at DESC
  LIMIT 1;
"
# Expected: Row exists with extraction_mode='pdf'
```

**Definition of Done**:
- [ ] Imports added to pdf-processor.ts
- [ ] saveCachedChunks() called after Docling extraction
- [ ] Hash generated correctly
- [ ] Compilation passes
- [ ] Lint passes
- [ ] Manual test: Process PDF, verify cache row created
- [ ] Cache save is logged
- [ ] Processing continues even if save fails

##### Resources & References

**Code References**:
- **Integration Point**: `worker/processors/pdf-processor.ts:123-135`
- **Non-fatal Error**: `worker/processors/epub-processor.ts:150-160`
- **Docling Result**: `worker/lib/docling-extractor.ts:80-100`

---

#### **Task T3.2: Update EPUB Processor**

**Task ID**: T3.2
**Task Name**: Integrate cache save into EPUB processor
**Priority**: High
**Estimated Effort**: 45 minutes
**Dependencies**: T2.1 (utility functions)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Integration Points section

**Feature Overview**:
EPUB processor saves cached chunks after Docling extraction, identical pattern to PDF processor.

**Task Purpose**:
- **As an** EPUB processor
- **I need** to save Docling extraction results to cache
- **So that** future reprocessing can use bulletproof matching without Gemini

**Dependencies**:
- **Prerequisite Tasks**: T2.1 (utility functions)
- **Parallel Tasks**: T3.1 (PDF processor)
- **Integration Points**: `worker/lib/docling-extractor.ts`, `worker/lib/cached-chunks.ts`
- **Blocked By**: T2.1

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: When Docling extraction completes, the system shall save cached chunks
- **REQ-2**: The system shall use extraction_mode='epub'
- **REQ-3**: The system shall generate markdown hash before save
- **REQ-4**: When cache save fails, the system shall log warning and continue processing

**Technical Constraints**:
- **Location**: `worker/processors/epub-processor.ts` line ~118 (after Docling extraction)
- **Pattern**: Identical to PDF processor, just extraction_mode='epub'

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/processors/epub-processor.ts - [MODIFY] Add cache save after extraction
```

**Key Implementation Steps**:
1. **Add imports** → `import { saveCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'`
2. **Find Phase 5 comment** → Line ~118: "// Phase 5: Cache extraction result in job metadata"
3. **Replace job.metadata** → Call `saveCachedChunks()` instead
4. **Generate hash** → `hashMarkdown(result.markdown)`
5. **Pass all fields** → document_id, extraction_mode: 'epub', hash, chunks, structure
6. **Keep job.metadata for backward compat** → Other code may still reference it

**Code Patterns to Follow**:
- **Integration Point**: `worker/processors/epub-processor.ts:118-130` - Existing cache location
- **Mirror PDF Pattern**: `worker/processors/pdf-processor.ts:126-135` - Exact same structure

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: EPUB processing saves cache
  Given LOCAL mode is enabled
  When I process an EPUB with Docling
  Then cached_chunks row is created
  And extraction_mode is 'epub'
  And chunks array matches extraction result
  And markdown_hash is correct SHA256

Scenario 2: Cache distinguishes PDF vs EPUB
  Given I process one PDF and one EPUB
  When I query cached_chunks table
  Then I see two rows with different extraction_mode values
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Cache saved after every EPUB extraction
- [ ] **Data**: extraction_mode is 'epub' (not 'pdf')
- [ ] **Error Handling**: Non-fatal failure (log + continue)
- [ ] **Logging**: Success message with chunk count
- [ ] **Pattern Consistency**: Matches PDF processor implementation
- [ ] **Backward Compat**: Existing job.metadata code still works

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Compile processor
cd worker && npm run build
# Expected: Zero TypeScript errors

# Lint check
cd worker && npm run lint
# Expected: Zero ESLint errors

# Process test EPUB (if available)
# Expected: Processing succeeds

# Verify cache row created
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT document_id, extraction_mode,
         jsonb_array_length(chunks) as chunk_count
  FROM cached_chunks
  WHERE extraction_mode = 'epub'
  ORDER BY created_at DESC
  LIMIT 1;
"
# Expected: Row exists with extraction_mode='epub'
```

**Definition of Done**:
- [ ] Imports added to epub-processor.ts
- [ ] saveCachedChunks() called after Docling extraction
- [ ] extraction_mode set to 'epub'
- [ ] Compilation passes
- [ ] Lint passes
- [ ] Manual test: Process EPUB, verify cache row created
- [ ] Pattern matches PDF processor (consistency)

---

#### **Task T3.3: Validate Processor Integration**

**Task ID**: T3.3
**Task Name**: Test PDF and EPUB cache save operations
**Priority**: High
**Estimated Effort**: 30 minutes
**Dependencies**: T3.1, T3.2 (both processors updated)

##### Context & Background

**Task Purpose**:
- **As a** developer completing Phase 3
- **I need** to validate cache save works for both PDF and EPUB
- **So that** I can proceed confidently to Phase 4

**Dependencies**:
- **Prerequisite Tasks**: T3.1 (PDF), T3.2 (EPUB)
- **Parallel Tasks**: None
- **Blocked By**: T3.1, T3.2

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: PDF cache persists
  Given I process a PDF in LOCAL mode
  When I query cached_chunks table
  Then I see a row with extraction_mode='pdf'
  And chunk count matches extraction

Scenario 2: EPUB cache persists
  Given I process an EPUB in LOCAL mode
  When I query cached_chunks table
  Then I see a row with extraction_mode='epub'
  And chunk count matches extraction

Scenario 3: Cache survives job deletion
  Given cached_chunks row exists for document
  When I delete corresponding background_jobs row
  Then cached_chunks row still exists (not CASCADE deleted)
```

**Rule-Based Criteria (Checklist)**:
- [ ] **PDF**: Cache row created after PDF processing
- [ ] **EPUB**: Cache row created after EPUB processing
- [ ] **Persistence**: Cache survives job deletion
- [ ] **Data Integrity**: Chunk counts match extraction results
- [ ] **Hash**: Markdown hash is 64 characters (SHA256)
- [ ] **Logging**: Success messages appear in logs

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Full build
cd worker && npm run build && npm run lint
# Expected: Zero errors

# Database validation
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT
    extraction_mode,
    COUNT(*) as cache_count,
    AVG(jsonb_array_length(chunks)) as avg_chunks
  FROM cached_chunks
  GROUP BY extraction_mode;
"
# Expected: Both 'pdf' and 'epub' modes present (if both processed)

# Test job deletion doesn't cascade
psql -h localhost -p 54322 -U postgres -d postgres -c "
  -- Get a test document_id
  SELECT document_id FROM cached_chunks LIMIT 1;

  -- Delete its job (replace <doc_id> with actual ID)
  DELETE FROM background_jobs WHERE entity_id = '<doc_id>';

  -- Verify cache still exists
  SELECT document_id FROM cached_chunks WHERE document_id = '<doc_id>';
"
# Expected: Cache row still exists after job deleted
```

**Definition of Done**:
- [ ] PDF processing creates cache row
- [ ] EPUB processing creates cache row
- [ ] Both modes logged correctly
- [ ] Cache persists after job deletion
- [ ] Phase 3 validation gate passed

---

### PHASE 4: HANDLER INTEGRATION

---

#### **Task T4.1: Update Continue Processing Handler**

**Task ID**: T4.1
**Task Name**: Integrate cache load into continue-processing handler
**Priority**: Critical
**Estimated Effort**: 1 hour
**Dependencies**: T3.3 (processors validated)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Integration Points section (continue-processing)

**Feature Overview**:
Continue-processing handler loads cached chunks for resume workflow, enabling zero-cost processing after review checkpoints.

**Task Purpose**:
- **As a** user resuming from review checkpoint
- **I need** the handler to load cached chunks
- **So that** I can continue processing without re-running Docling

**Dependencies**:
- **Prerequisite Tasks**: T3.3 (processors validated)
- **Parallel Tasks**: T4.2 (reprocess handler)
- **Integration Points**: `worker/lib/cached-chunks.ts`, `worker/lib/local/bulletproof-matcher.ts`
- **Blocked By**: T3.3

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: When LOCAL mode is active, the system shall load cached chunks by document_id
- **REQ-2**: The system shall validate markdown hash before using cache
- **REQ-3**: When cache is invalid, the system shall fall back to CLOUD mode
- **REQ-4**: When cache is valid, the system shall pass chunks to bulletproof matching
- **REQ-5**: The system shall log cache hit/miss with clear messaging

**Non-Functional Requirements**:
- **Performance**: Cache load <2 seconds
- **Reliability**: Graceful fallback to CLOUD mode

**Technical Constraints**:
- **Location**: `worker/handlers/continue-processing.ts` lines 170-189 (existing cache query)
- **Pattern**: Replace job metadata query with loadCachedChunks()

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/handlers/continue-processing.ts - [MODIFY] Replace cache query with loadCachedChunks()
```

**Key Implementation Steps**:
1. **Add imports** → `import { loadCachedChunks, hashMarkdown } from '../lib/cached-chunks.js'`
2. **Find cache query** → Lines 170-189 (job metadata query)
3. **Replace with loadCachedChunks()** → Pass documentId and markdown hash
4. **Update logging** → Change messages to reflect new cache source
5. **Keep fallback logic** → If cache is null, warn and continue to CLOUD mode
6. **Test with hash mismatch** → Verify fallback works when markdown changed

**Code Patterns to Follow**:
- **Integration Point**: `worker/handlers/continue-processing.ts:170-189` - Existing cache logic
- **Fallback Pattern**: `worker/handlers/continue-processing.ts:186-189` - CLOUD mode fallback
- **Bulletproof Matching**: `worker/handlers/continue-processing.ts:200-220` - Existing usage

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Resume with valid cache
  Given document processed with reviewDoclingExtraction=true
  And cached_chunks row exists with matching hash
  When I resume processing
  Then cached chunks are loaded
  And bulletproof matching runs with cached chunks
  And no Gemini API calls are made
  And log shows "Loaded N cached chunks"

Scenario 2: Resume with stale cache (hash mismatch)
  Given document processed and cached
  And markdown has been edited (hash changed)
  When I resume processing
  Then loadCachedChunks() returns null
  And handler falls back to CLOUD mode
  And log shows "Cache invalid (markdown changed)"
  And Gemini API is called for chunking

Scenario 3: Resume with no cache
  Given document has no cached_chunks row
  When I resume processing
  Then loadCachedChunks() returns null
  And handler falls back to CLOUD mode
  And log shows "No cache found"
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: Cache loaded successfully on resume
- [ ] **Validation**: Hash mismatch detected correctly
- [ ] **Fallback**: CLOUD mode used when cache missing/invalid
- [ ] **Logging**: Clear messages for hit/miss scenarios
- [ ] **Integration**: Bulletproof matching receives cached chunks
- [ ] **Cost**: Zero API calls when cache hit
- [ ] **Error Handling**: No crashes on cache errors

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Compile handler
cd worker && npm run build
# Expected: Zero TypeScript errors

# Lint check
cd worker && npm run lint
# Expected: Zero ESLint errors

# Integration test
cd worker && npm run test:integration -- continue-processing.test.ts
# Expected: Tests pass (if test exists)

# Manual E2E test
# 1. Process document with reviewDoclingExtraction=true
# 2. Make small edit in Obsidian
# 3. Resume processing
# 4. Check logs for: "[CachedChunks] ✓ Loaded N cached chunks"
# 5. Verify: No Gemini API calls in logs
```

**Definition of Done**:
- [ ] Imports added to continue-processing.ts
- [ ] loadCachedChunks() replaces job metadata query
- [ ] Hash validation implemented
- [ ] Fallback to CLOUD mode works
- [ ] Logging is clear and informative
- [ ] Compilation passes
- [ ] Lint passes
- [ ] Manual test: Resume with cache succeeds
- [ ] Manual test: Resume with stale cache falls back

##### Resources & References

**Code References**:
- **Integration Point**: `worker/handlers/continue-processing.ts:170-189`
- **Bulletproof Usage**: `worker/handlers/continue-processing.ts:200-250`
- **Fallback Pattern**: `worker/handlers/continue-processing.ts:186-189`

---

#### **Task T4.2: Update Reprocess Document Handler**

**Task ID**: T4.2
**Task Name**: Integrate cache load into reprocess-document handler
**Priority**: Critical
**Estimated Effort**: 1.5 hours
**Dependencies**: T3.3 (processors validated)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Integration Points section (reprocess-document)

**Feature Overview**:
Reprocess handler loads cached chunks for zero-cost reprocessing with bulletproof matching, preserving structural metadata through heavy edits.

**Task Purpose**:
- **As a** user reprocessing a document
- **I need** the handler to use cached chunks for bulletproof matching
- **So that** I avoid $0.50 Gemini API costs

**Dependencies**:
- **Prerequisite Tasks**: T3.3 (processors validated)
- **Parallel Tasks**: T4.1 (continue-processing handler)
- **Integration Points**: `worker/lib/cached-chunks.ts`, `worker/lib/local/bulletproof-matcher.ts`, `worker/lib/chunking/pydantic-metadata.ts`
- **Blocked By**: T3.3

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: When LOCAL mode is active, the system shall load cached chunks by document_id
- **REQ-2**: The system shall run bulletproof matching with cached chunks
- **REQ-3**: The system shall enrich chunks with PydanticAI metadata
- **REQ-4**: The system shall generate local embeddings
- **REQ-5**: When cache is missing/invalid, the system shall fall back to CLOUD mode
- **REQ-6**: The system shall preserve structural metadata (pages, headings, bboxes)

**Non-Functional Requirements**:
- **Performance**: Bulletproof matching with 5 layers completes in <10 minutes (500-page book)
- **Cost**: $0.00 when cache hit (vs $0.50 CLOUD mode)

**Technical Constraints**:
- **Location**: `worker/handlers/reprocess-document.ts` line ~103 (before Gemini chunking)
- **Pattern**: Add LOCAL mode path before existing CLOUD mode logic
- **Imports**: Multiple imports needed (bulletproof matcher, metadata, embeddings)

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/handlers/reprocess-document.ts - [MODIFY] Add LOCAL mode path with bulletproof matching
```

**Key Implementation Steps**:
1. **Add imports** → loadCachedChunks, hashMarkdown, bulletproofMatch, extractMetadataBatch, generateEmbeddingsLocal
2. **Insert LOCAL mode check** → Line ~103, before existing CLOUD mode logic
3. **Load cached chunks** → Call loadCachedChunks() with markdown hash
4. **Run bulletproof matching** → Pass cached chunks, new markdown, progress callback
5. **Enrich metadata** → Call extractMetadataBatch() in batches of 10
6. **Generate embeddings** → Call generateEmbeddingsLocal() with fallback to Gemini
7. **Preserve structural metadata** → Map page_start, page_end, heading_path, bboxes
8. **Add progress updates** → updateProgress() for each stage (load, match, enrich, embed)
9. **Log matching stats** → Exact/synthetic counts for transparency
10. **Fall through to CLOUD mode** → If cache is null, continue to existing logic

**Code Patterns to Follow**:
- **Bulletproof Matching**: `worker/handlers/continue-processing.ts:200-250` - Existing usage
- **Metadata Batching**: `worker/processors/pdf-processor.ts:200-250` - Batch extraction pattern
- **Progress Updates**: `worker/handlers/reprocess-document.ts:80-100` - updateProgress() calls
- **Error Handling**: `worker/processors/epub-processor.ts:150-170` - Try-catch with fallback

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Reprocess with valid cache
  Given document fully processed with LOCAL mode
  And cached_chunks row exists
  And markdown has been edited (30% content change)
  When I reprocess document
  Then cached chunks are loaded
  And bulletproof matching runs (5 layers)
  And metadata enriched with PydanticAI
  And local embeddings generated
  And structural metadata preserved (pages, headings)
  And cost is $0.00 (no Gemini calls)
  And log shows matching stats (exact, synthetic)

Scenario 2: Reprocess with stale cache
  Given document processed
  And markdown hash has changed significantly
  When I reprocess document
  Then loadCachedChunks() returns null
  And handler falls back to CLOUD mode
  And Gemini API is called for chunking
  And cost is $0.50

Scenario 3: Bulletproof matching preserves structure
  Given cached chunks have bboxes and heading_path
  When bulletproof matching remaps to new markdown
  Then remapped chunks retain bboxes
  And heading_path is preserved
  And page numbers are correct
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: LOCAL mode path executes correctly
- [ ] **Cache**: Cached chunks loaded successfully
- [ ] **Matching**: Bulletproof matching runs with progress updates
- [ ] **Metadata**: PydanticAI enriches chunks in batches
- [ ] **Embeddings**: Local embeddings generated (or Gemini fallback)
- [ ] **Structure**: Structural metadata preserved through remapping
- [ ] **Fallback**: CLOUD mode used when cache missing
- [ ] **Logging**: Matching stats logged (exact, synthetic counts)
- [ ] **Cost**: Zero API calls when cache hit
- [ ] **Progress**: updateProgress() called at each stage

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Compile handler
cd worker && npm run build
# Expected: Zero TypeScript errors

# Lint check
cd worker && npm run lint
# Expected: Zero ESLint errors

# Integration test
cd worker && npm run test:integration -- reprocess-document.test.ts
# Expected: Tests pass (if test exists)

# Manual E2E test
# 1. Process document fully with LOCAL mode
# 2. Make heavy edits (30% content change)
# 3. Trigger reprocessing
# 4. Check logs for:
#    - "[ReprocessDocument] Found N cached chunks"
#    - "[ReprocessDocument] Layer 1: X matched, Y remaining"
#    - "[ReprocessDocument] Matching complete: Exact: X/N"
#    - "[ReprocessDocument] Cost: $0.00"
# 5. Verify: structural metadata preserved in chunks table
# 6. Verify: No Gemini API calls for chunking
```

**Definition of Done**:
- [ ] Imports added to reprocess-document.ts
- [ ] LOCAL mode path inserted before CLOUD mode logic
- [ ] loadCachedChunks() called with hash validation
- [ ] Bulletproof matching integrated with progress
- [ ] Metadata enrichment batched (10 chunks)
- [ ] Local embeddings with Gemini fallback
- [ ] Structural metadata preserved (pages, headings, bboxes)
- [ ] Progress updates at each stage
- [ ] Logging comprehensive (stats, costs)
- [ ] Compilation passes
- [ ] Lint passes
- [ ] Manual test: Reprocess with cache succeeds
- [ ] Manual test: Structural metadata verified in database

##### Resources & References

**Code References**:
- **Bulletproof Matching**: `worker/lib/local/bulletproof-matcher.ts:1-100`
- **Metadata Extraction**: `worker/lib/chunking/pydantic-metadata.ts:1-100`
- **Local Embeddings**: `worker/lib/local/embeddings-local.ts:1-50`
- **Progress Pattern**: `worker/handlers/reprocess-document.ts:80-160`
- **Structural Metadata**: `worker/processors/pdf-processor.ts:180-200`

---

#### **Task T4.3: Validate Handler Integration**

**Task ID**: T4.3
**Task Name**: Test resume and reprocess workflows end-to-end
**Priority**: Critical
**Estimated Effort**: 30 minutes
**Dependencies**: T4.1, T4.2 (both handlers updated)

##### Context & Background

**Task Purpose**:
- **As a** developer completing Phase 4
- **I need** to validate both handler workflows work correctly
- **So that** I can confirm zero-cost reprocessing is achieved

**Dependencies**:
- **Prerequisite Tasks**: T4.1 (continue-processing), T4.2 (reprocess)
- **Parallel Tasks**: None
- **Blocked By**: T4.1, T4.2

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Resume workflow uses cache
  Given document processed with reviewDoclingExtraction=true
  And cached_chunks row exists
  When I resume processing
  Then cache is loaded
  And bulletproof matching runs
  And cost is $0.00

Scenario 2: Reprocess workflow uses cache
  Given document fully processed
  And cached_chunks row exists
  And markdown edited
  When I reprocess document
  Then cache is loaded
  And bulletproof matching runs
  And structural metadata preserved
  And cost is $0.00

Scenario 3: Fallback works correctly
  Given cached_chunks row does not exist
  When I resume or reprocess
  Then handler falls back to CLOUD mode
  And Gemini API is called
  And cost is $0.50
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Resume**: Cache hit works, $0.00 cost
- [ ] **Reprocess**: Cache hit works, $0.00 cost, structure preserved
- [ ] **Fallback**: Cache miss triggers CLOUD mode
- [ ] **Logging**: All operations logged clearly
- [ ] **Progress**: Progress updates visible in UI/logs
- [ ] **Matching Stats**: Exact/synthetic counts logged

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Full build and lint
cd worker && npm run build && npm run lint
# Expected: Zero errors

# Manual E2E: Resume workflow
# 1. Process PDF with reviewDoclingExtraction=true
# 2. Make small edit
# 3. Resume processing
# 4. Verify: Cache loaded, $0.00 cost

# Manual E2E: Reprocess workflow
# 1. Process PDF fully
# 2. Make heavy edits (30% content change)
# 3. Reprocess document
# 4. Verify: Cache loaded, bulletproof matching runs, structure preserved

# Manual E2E: Fallback scenario
# 1. Delete cached_chunks row manually
# 2. Try to resume/reprocess
# 3. Verify: Falls back to CLOUD mode, Gemini called

# Database verification
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT
    document_id,
    COUNT(*) as chunk_count,
    COUNT(CASE WHEN position_confidence = 'exact' THEN 1 END) as exact_matches,
    COUNT(CASE WHEN position_confidence = 'synthetic' THEN 1 END) as synthetic
  FROM chunks
  WHERE document_id = '<test_doc_id>'
  GROUP BY document_id;
"
# Expected: High exact_matches, low synthetic
```

**Definition of Done**:
- [ ] Resume workflow validated (cache hit)
- [ ] Reprocess workflow validated (cache hit, structure preserved)
- [ ] Fallback scenario validated (cache miss → CLOUD mode)
- [ ] All logs reviewed and clear
- [ ] Progress updates working
- [ ] Matching stats logged correctly
- [ ] Phase 4 validation gate passed

---

### PHASE 5: TESTING & DOCUMENTATION

---

#### **Task T5.1: Create Integration Tests**

**Task ID**: T5.1
**Task Name**: Write comprehensive integration tests for cached chunks
**Priority**: High
**Estimated Effort**: 1 hour
**Dependencies**: T4.3 (handlers validated)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Testing & Documentation section

**Feature Overview**:
Integration tests validate cache save/load/delete operations and hash validation logic.

**Task Purpose**:
- **As a** developer maintaining the codebase
- **I need** automated tests for cached chunks
- **So that** I can catch regressions early

**Dependencies**:
- **Prerequisite Tasks**: T4.3 (handlers validated)
- **Parallel Tasks**: T5.2 (documentation)
- **Integration Points**: Jest test framework, Supabase test client
- **Blocked By**: T4.3

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: Tests shall validate save/load/delete operations
- **REQ-2**: Tests shall validate hash matching logic
- **REQ-3**: Tests shall validate graceful cache miss handling
- **REQ-4**: Tests shall use real Supabase client (not mocked)

**Technical Constraints**:
- **Test Framework**: Jest with ESM support
- **Location**: `worker/tests/integration/cached-chunks.test.ts`
- **Pattern**: Follow existing integration test structure

##### Implementation Details

**Files to Modify/Create**:
```
└── worker/tests/integration/cached-chunks.test.ts - [NEW FILE] Integration tests
```

**Key Implementation Steps**:
1. **Create test file** → Copy test code from PRP section
2. **Setup test environment** → Supabase client initialization
3. **beforeEach hook** → Cleanup test data before each test
4. **Test 1: Save and load** → Verify round-trip works
5. **Test 2: Hash mismatch** → Verify cache invalidation
6. **Test 3: Cache miss** → Verify graceful null return
7. **Add to package.json** → Test script for cached-chunks

**Code Patterns to Follow**:
- **Test Structure**: `worker/tests/integration/local-processing.test.ts:1-50`
- **Supabase Client**: `worker/tests/integration/local-processing.test.ts:10-20`
- **Cleanup Pattern**: `worker/tests/integration/local-cleanup.test.ts:15-25`

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Tests run successfully
  Given test file is created
  When I run "npm run test:cached-chunks"
  Then all tests pass
  And no warnings are logged

Scenario 2: Save and load test validates round-trip
  Given I save cached chunks
  When I load with same hash
  Then chunks are returned
  And structure is intact

Scenario 3: Hash mismatch test validates invalidation
  Given I save cached chunks with hash1
  When I load with hash2
  Then null is returned
  And warning is logged
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Functional**: All 3 tests implemented
- [ ] **Coverage**: Save, load, delete, hash mismatch scenarios
- [ ] **Environment**: Uses real Supabase (not mocked)
- [ ] **Cleanup**: beforeEach cleans up test data
- [ ] **Assertions**: Proper expect() statements
- [ ] **Logging**: Console logs captured and verified

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Run integration tests
cd worker && npm run test:integration -- cached-chunks.test.ts
# Expected: All tests pass

# Verify test coverage (if enabled)
cd worker && npm run test:coverage -- cached-chunks.test.ts
# Expected: High coverage for utility functions
```

**Definition of Done**:
- [ ] Test file created at `worker/tests/integration/cached-chunks.test.ts`
- [ ] All 3 tests implemented
- [ ] Tests pass locally
- [ ] Test script added to package.json
- [ ] Cleanup logic works (no leftover test data)

##### Resources & References

**Code References**:
- **Test Pattern**: `worker/tests/integration/local-processing.test.ts:1-100`
- **Supabase Setup**: `worker/tests/integration/local-cleanup.test.ts:10-30`

---

#### **Task T5.2: Update Documentation**

**Task ID**: T5.2
**Task Name**: Document cached chunks architecture and usage
**Priority**: Medium
**Estimated Effort**: 45 minutes
**Dependencies**: T5.1 (tests created)

##### Context & Background

**Source PRP Document**: [docs/prps/cached-chunks-table.md](/Users/topher/Code/rhizome-v2/docs/prps/cached-chunks-table.md) - Documentation section

**Task Purpose**:
- **As a** future developer or AI agent
- **I need** documentation for cached chunks system
- **So that** I understand how it works and how to debug issues

**Dependencies**:
- **Prerequisite Tasks**: T5.1 (tests created)
- **Parallel Tasks**: None
- **Blocked By**: T5.1

##### Technical Requirements

**Functional Requirements**:
- **REQ-1**: Documentation shall explain cached chunks architecture
- **REQ-2**: Documentation shall provide usage examples
- **REQ-3**: Documentation shall explain cache lifecycle
- **REQ-4**: Documentation shall update PROCESSING_PIPELINE.md
- **REQ-5**: Documentation shall update ARCHITECTURE.md

##### Implementation Details

**Files to Modify/Create**:
```
├── docs/PROCESSING_PIPELINE.md - [MODIFY] Add cached chunks section
└── docs/ARCHITECTURE.md - [MODIFY] Add cached_chunks table entry
```

**Key Implementation Steps**:
1. **Update PROCESSING_PIPELINE.md** → Add "Cached Chunks Architecture" section after "Review Checkpoint Recovery"
2. **Add architecture diagram** → Copy from PRP or create simplified version
3. **Add query examples** → Show how to query cached_chunks table
4. **Update ARCHITECTURE.md** → Add cached_chunks table to database tables section
5. **Document lifecycle** → Explain creation, usage, deletion
6. **Add troubleshooting** → Common issues and solutions

**Code Patterns to Follow**:
- **Documentation Style**: `docs/PROCESSING_PIPELINE.md:1-100` - Existing style
- **Code Examples**: `docs/ARCHITECTURE.md:200-250` - SQL examples

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Documentation is complete
  Given I read PROCESSING_PIPELINE.md
  When I reach cached chunks section
  Then I understand architecture, lifecycle, and usage

Scenario 2: Examples are clear
  Given I need to query cached chunks
  When I read documentation
  Then I find query examples I can copy-paste
```

**Rule-Based Criteria (Checklist)**:
- [ ] **PROCESSING_PIPELINE.md**: New section added
- [ ] **ARCHITECTURE.md**: Table documented
- [ ] **Diagrams**: Architecture diagram included
- [ ] **Examples**: Query examples provided
- [ ] **Lifecycle**: Creation → Usage → Deletion explained
- [ ] **Troubleshooting**: Common issues documented

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Verify markdown syntax
npx markdownlint docs/PROCESSING_PIPELINE.md docs/ARCHITECTURE.md
# Expected: Zero linting errors

# Manual review
# 1. Read PROCESSING_PIPELINE.md cached chunks section
# 2. Verify clarity and completeness
# 3. Test query examples in psql
```

**Definition of Done**:
- [ ] PROCESSING_PIPELINE.md updated
- [ ] ARCHITECTURE.md updated
- [ ] Architecture diagram added
- [ ] Query examples tested and working
- [ ] Markdown linting passes
- [ ] Manual review complete

---

#### **Task T5.3: Final Validation**

**Task ID**: T5.3
**Task Name**: Run all validation gates and manual E2E tests
**Priority**: Critical
**Estimated Effort**: 30 minutes
**Dependencies**: T5.2 (documentation complete)

##### Context & Background

**Task Purpose**:
- **As a** developer completing the feature
- **I need** to run all validation gates
- **So that** I confirm the feature is production-ready

**Dependencies**:
- **Prerequisite Tasks**: T5.2 (documentation)
- **Parallel Tasks**: None
- **Blocked By**: T5.2

##### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: All validation gates pass
  Given all code is complete
  When I run all 6 validation gates
  Then all gates pass with zero errors

Scenario 2: Manual E2E tests pass
  Given I follow E2E test checklist
  When I complete all 4 scenarios
  Then all scenarios work as expected
```

**Rule-Based Criteria (Checklist)**:
- [ ] **Gate 1**: Migration success ✅
- [ ] **Gate 2**: Type safety ✅
- [ ] **Gate 3**: Lint check ✅
- [ ] **Gate 4**: Unit tests ✅
- [ ] **Gate 5**: Integration tests ✅
- [ ] **Gate 6**: Manual E2E ✅

##### Validation & Quality Gates

**Code Quality Checks**:
```bash
# Gate 1: Migration Success
npx supabase db reset
psql -h localhost -p 54322 -U postgres -d postgres -c "\d cached_chunks"
# Expected: Table with 9 columns, 3 indexes

# Gate 2: Type Safety
cd worker && npm run build
# Expected: Zero TypeScript errors

# Gate 3: Lint Check
cd worker && npm run lint
# Expected: Zero ESLint errors

# Gate 4: Unit Tests
cd worker && npm run test:cached-chunks
# Expected: All tests pass

# Gate 5: Integration Tests
cd worker && npm run test:integration -- local-processing.test.ts cached-chunks.test.ts
# Expected: All tests pass

# Gate 6: Manual E2E
# Scenario 1: Initial Processing
# - Process test PDF (LOCAL mode)
# - Verify: cached_chunks row created
psql -h localhost -p 54322 -U postgres -d postgres -c "
  SELECT document_id, extraction_mode,
         jsonb_array_length(chunks) as chunk_count,
         LEFT(markdown_hash, 8) as hash
  FROM cached_chunks
  ORDER BY created_at DESC LIMIT 1;
"

# Scenario 2: Resume from Checkpoint
# - Process with reviewDoclingExtraction=true
# - Make small edits
# - Resume processing
# - Verify: Cache loaded, $0.00 cost
# - Check logs for: "[CachedChunks] ✓ Loaded N cached chunks"

# Scenario 3: Reprocess with Heavy Edits
# - Process document fully
# - Make 30% content changes
# - Trigger reprocessing
# - Verify: Bulletproof matching runs, structure preserved
# - Check logs for matching stats

# Scenario 4: Cache Miss Fallback
# - Manually delete cached_chunks row
psql -h localhost -p 54322 -U postgres -d postgres -c "
  DELETE FROM cached_chunks WHERE document_id = '<test-doc-id>';
"
# - Try to resume/reprocess
# - Verify: Graceful fallback to CLOUD mode
# - Check logs for: "No cached chunks found - falling back to CLOUD mode"
```

**Definition of Done**:
- [ ] All 6 validation gates passed
- [ ] All 4 manual E2E scenarios successful
- [ ] No errors or warnings in logs
- [ ] Feature complete and production-ready

---

## Implementation Recommendations

### Optimal Task Sequencing

**Critical Path** (must be sequential):
```
T1.1 → T1.3 → T2.1 → T3.1 → T4.1 → T5.3
(Migration → Validate → Utils → PDF → Continue → Final)
```

**Parallelization Opportunities**:
1. **Phase 1**: T1.1 and T1.2 (migration + types) - parallel
2. **Phase 3**: T3.1 and T3.2 (PDF + EPUB processors) - parallel after T2.1
3. **Phase 4**: T4.1 and T4.2 (handlers) - parallel after T3.3
4. **Phase 5**: T5.1 and T5.2 (tests + docs) - parallel after T4.3

**Recommended Team Structure**:
- **1 Developer**: Follow sequential order, complete in 10-12 hours
- **2 Developers**:
  - Dev 1: T1.1 → T1.3 → T2.1 → T3.1 → T4.1
  - Dev 2: T1.2 → (wait for T2.1) → T3.2 → T4.2
  - Both: Collaborate on T5.x
  - **Total time**: 6-8 hours

### Resource Allocation Suggestions

**Skills Required**:
- **Database**: PostgreSQL, Supabase, migrations (Phase 1)
- **TypeScript**: ESM modules, type definitions (Phase 1-5)
- **Backend**: Node.js, async/await, error handling (Phase 2-4)
- **Testing**: Jest, integration testing (Phase 5)
- **Documentation**: Markdown, technical writing (Phase 5)

**Time Allocation**:
- **Phase 1**: 2 hours (foundation, critical)
- **Phase 2**: 1.5 hours (utilities, straightforward)
- **Phase 3**: 2 hours (processor integration, moderate)
- **Phase 4**: 3 hours (handler integration, complex)
- **Phase 5**: 2 hours (testing + docs, important)

---

## Critical Path Analysis

### Tasks on Critical Path

**Must Complete in Order**:
1. **T1.1** - Migration (blocks all database operations)
2. **T1.3** - Validate migration (confirms foundation solid)
3. **T2.1** - Utility functions (blocks all cache operations)
4. **T3.1 or T3.2** - At least one processor (blocks handler testing)
5. **T4.1 or T4.2** - At least one handler (blocks E2E validation)
6. **T5.3** - Final validation (confirms production-readiness)

### Potential Bottlenecks

**Risk 1: Migration Issues**
- **Impact**: Blocks entire feature
- **Mitigation**: Validate migration syntax early, test with `db reset`
- **Contingency**: Have rollback plan, keep migration simple

**Risk 2: Bulletproof Matching Integration**
- **Impact**: T4.2 is most complex task, could take 2+ hours
- **Mitigation**: Reference existing continue-processing usage, test incrementally
- **Contingency**: Start with simple LOCAL mode path, add bulletproof matching later

**Risk 3: Hash Validation Logic**
- **Impact**: False cache invalidations reduce cost savings
- **Mitigation**: Test with various markdown edits, log hash comparisons
- **Contingency**: Make hash comparison configurable (exact vs structural)

### Schedule Optimization Suggestions

**Fastest Path (Single Developer)**:
1. Day 1 Morning (4 hours): T1.1 → T1.3 → T2.1 → T3.1
2. Day 1 Afternoon (4 hours): T3.2 → T4.1 → T4.2
3. Day 2 Morning (2 hours): T5.1 → T5.2 → T5.3

**Parallel Path (Two Developers)**:
1. Dev 1: T1.1 → T1.3 → T2.1 → T3.1 → T4.1 → T5.1 (6 hours)
2. Dev 2: T1.2 → (wait) → T3.2 → T4.2 → T5.2 (6 hours)
3. Both: T5.3 final validation (30 minutes)

---

## Success Criteria Summary

### Functional Success
- [ ] Resume from review checkpoint uses cached chunks ($0.00 cost)
- [ ] Reprocessing uses cached chunks ($0.00 cost)
- [ ] Graceful fallback to CLOUD mode if cache missing
- [ ] Hash validation prevents stale cache usage
- [ ] Structural metadata preserved through reprocessing

### Technical Success
- [ ] All tests pass (unit + integration + E2E)
- [ ] Zero TypeScript errors
- [ ] Zero lint errors
- [ ] No breaking changes
- [ ] Backward compatible with existing workflows

### Quality Success
- [ ] Code follows project conventions
- [ ] Comprehensive logging
- [ ] Clear error messages
- [ ] Documentation complete and accurate
- [ ] All validation gates passed

---

## Confidence Assessment: 9.5/10

**High Confidence Because**:
- ✅ Complete type definitions provided from existing codebase
- ✅ Exact integration points with line numbers
- ✅ Concrete examples from real code (not generic patterns)
- ✅ Clear validation commands (6 automated gates)
- ✅ All edge cases documented (hash mismatch, cache miss, graceful fallback)
- ✅ Testing strategy comprehensive (unit + integration + E2E)
- ✅ No external dependencies (crypto is built-in)
- ✅ Migration pattern proven (follows 045 exactly)
- ✅ Bulletproof matching interface validated (continue-processing usage)

**Not 10/10 Because**:
- ⚠️ Line numbers may shift if codebase changes before implementation
- ⚠️ Bulletproof matcher interface assumptions validated but not integration-tested with full reprocess workflow

**Recommendation**: **PROCEED** with implementation. This task breakdown contains all context needed for successful one-pass implementation.

---

**Generated**: 2025-10-11
**Next Action**: Begin implementation with Task T1.1 (Create Migration File)
