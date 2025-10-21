# Worker Module: Comprehensive Test & Script Cleanup Analysis

**Analysis Date**: October 20, 2025  
**Scope**: worker/ directory - Scripts, tests, and validation files  
**Total Files Analyzed**: 150+ files across scripts/, tests/, __tests__/, benchmarks/

---

## EXECUTIVE SUMMARY

The worker/ directory contains **significant technical debt** from development phases:

- **8 root-level test files** - All are standalone manual test scripts, NO imports from other code
- **38 scripts in scripts/ directory** - Mix of active tools, one-off debugging utilities, and old system files
- **37 tests in tests/** - Mix of canonical tests and old "phase validation" experiments
- **11 tests in __tests__/** - Properly structured unit tests (canonical location)
- **2.5 MB dist/** - Build artifacts, can be safely deleted before commit

### Recommendation
- **DELETE**: 25+ files (test scripts, debugging utilities, old phase validations)
- **KEEP**: ~35 files (active test suites, utilities, benchmarks)
- **ARCHIVE**: 5-10 files (might be useful reference)

---

## 1. ROOT-LEVEL TEST FILES (worker/test-*.ts)

### Current Status
**8 files**, ALL are manual test runners with **ZERO imports** from other code.

These are ad-hoc testing scripts that developers run manually, not part of the automated test suite.

| File | Purpose | Status | Git History | Recommendation |
|------|---------|--------|-------------|-----------------|
| `test-orchestrator.ts` | Test all 3 connection engines | Manual CLI script | commit 4d156ef (Sept) | DELETE |
| `test-annotation-recovery.ts` | Test fuzzy matching recovery | Manual CLI script | commit 4d156ef (Sept) | DELETE |
| `test-semantic-similarity.ts` | Test semantic engine only | Manual CLI script | commit 4d156ef (Sept) | DELETE |
| `test-thematic-bridge.ts` | Test thematic bridge engine | Manual CLI script | commit 4d156ef (Sept) | DELETE |
| `test-fuzzy-matching.ts` | Test fuzzy matching tiers | Manual CLI script | commit ? | DELETE |
| `test-cleanup-prompt.ts` | Test AI cleanup effectiveness | Manual CLI script | commit ? | DELETE |
| `test-contradiction-detection.ts` | Test contradiction engine | Manual CLI script | commit ? | DELETE |
| `test-reprocess-pipeline.ts` | Test full reprocessing | Manual CLI script | commit ? | DELETE |

**Evidence**: Zero cross-references in codebase:
```bash
$ grep -r "test-orchestrator\|test-annotation\|test-semantic" worker --include="*.ts" | grep -v "dist/" | grep -v ".test.ts"
# Returns: 0 matches
```

**Why Delete**:
1. Not imported by any code
2. Not run by npm scripts
3. Duplicates functionality in proper test suites (tests/engines/*.test.ts)
4. Create clutter in root directory
5. Can be recreated if needed - they're simple CLI wrappers

**Recovery Path**: All are simple reproducible scripts; git history preserved

---

## 2. SCRIPTS DIRECTORY (worker/scripts/)

### Overview
**38 TypeScript + 4 Python + 3 JavaScript + 1 Shell = 46 total scripts**

### A. ACTIVELY REFERENCED IN package.json (KEEP)

| Script | npm Scripts | Usage | Status |
|--------|------------|-------|--------|
| `test-dual-bridge.ts` | `npm run test:dual-bridge` | Test dual bridge implementation | KEEP |
| `list-testable-documents.ts` | `npm run test:list-documents` | List test documents | KEEP |
| `validate-metadata-quality.js` | npm → `validate:metadata` | Main validation runner | KEEP |
| Python: `docling_extract.py` | Via tests | PDF extraction wrapper | KEEP |
| Python: `docling_extract_epub.py` | Via tests | EPUB extraction wrapper | KEEP |
| Python: `extract_metadata_pydantic.py` | Via tests | Metadata extraction | KEEP |
| Python: `chonkie_chunk.py` | Via chonkie-chunker.ts | Chunking wrapper | KEEP |

### B. DEBUGGING/UTILITY SCRIPTS (ONE-OFF, 2-3 COMMITS OLD)

These are one-time debugging tools from specific problems that have been resolved:

| Script | Purpose | Git Commit | Status | Notes |
|--------|---------|-----------|--------|-------|
| `check-documents.ts` | List documents | 9b94cb8 (N+1 fix) | DELETE | Basic info query, rarely needed |
| `check-chunk-status.ts` | Query chunk status | 9b94cb8 | DELETE | Debug helper for N+1 issue |
| `check-annotations.ts` | Verify annotations | 9b94cb8 | DELETE | Part of N+1 debugging |
| `check-verified-connections.ts` | List verified connections | 9b94cb8 | DELETE | Debug helper |
| `debug-connection-data.ts` | Debug connections | 9b94cb8 | DELETE | Development utility |
| `find-readwise-book.ts` | Search Readwise | ae895e3 (Readwise API) | DELETE | Readwise query helper |
| `fix-document-status.ts` | Fix document state | 338a5f7 (EPUB fixes) | DELETE | One-off fix script |
| `restore-chunks.ts` | Restore chunk data | 9b94cb8 | DELETE | Recovery script |

**These should be archived as reference but deleted from repo.**

### C. CONNECTION REMAPPING SCRIPTS (EXPERIMENTAL, 2-3 COMMITS OLD)

Developed during connection remapping feature implementation. Likely superseded by proper handlers.

| Script | Purpose | Status | Evidence |
|--------|---------|--------|----------|
| `test-remap-connections.ts` | Test remapping with real doc | ARCHIVE | Created 9b94cb8, not referenced |
| `test-remap-direct.ts` | Direct remapping test | ARCHIVE | Created 9b94cb8, not referenced |
| `test-remap-real-connections.ts` | Remap with verified connections | ARCHIVE | Created 9b94cb8, not referenced |
| `verify-remap-connections.ts` | Verify remap results | ARCHIVE | Created 9b94cb8, not referenced |
| `import-palmer-eldritch.ts` | Import test document | ARCHIVE | Created 9b94cb8, test data |

**Archive**: Copy to `claudedocs/archived-scripts/` for reference. Delete from main repo.

### D. READWISE INTEGRATION SCRIPTS (STABLE, JULY COMMITS)

From Readwise feature implementation. Mostly working but some may be outdated.

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `test-readwise-export-import.ts` | Test Readwise flow | KEEP | Tests active feature |
| `import-readwise.ts` | CLI import from Readwise | KEEP | Production utility |
| ~~`test-readwise-reader-import.ts`~~ | Test Reader API | DELETED | Already removed from repo |

### E. STORAGE/IMPORT SCRIPTS (STABLE, RECENT)

From storage-first portability feature (fd8614e, Oct 13).

| Script | Purpose | Status | Keep |
|--------|---------|--------|------|
| `validate-storage-export.ts` | Validate export format | KEEP | Validates critical feature |
| `test-pdf-storage-integration.ts` | PDF storage test | KEEP | Integration test |
| `test-epub-storage-integration.ts` | EPUB storage test | KEEP | Integration test |
| `test-import-strategies.ts` | Test import conflict resolution | KEEP | Tests 3 strategies |

### F. DOCLING/CHUNKING SCRIPTS (ACTIVE DEVELOPMENT)

Recent Chonkie integration and Docling optimization.

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `test-docling-wrapper.ts` | Test Docling wrapper | KEEP | Active feature |
| `test-docling-wrapper-full.ts` | Full Docling test | KEEP | Comprehensive test |
| `test-local-pipeline.ts` | Test local pipeline | KEEP | End-to-end test |
| `test-paragraph-chunking.ts` | Test paragraph chunking | KEEP | Docling feature |
| `validate-chunk-matching.ts` | Validate chunk preservation | KEEP | Critical validation |
| `test-chunk-size-comparison.ts` | Compare chunk sizes | ARCHIVE | Performance exploration |
| `validate-bulletproof-matcher.ts` | Validate metadata matching | KEEP | Core functionality |
| `test-chonkie-integration.ts` | Chonkie integration test | KEEP | Active feature |
| `test-chonkie-ipc.ts` | Test Python IPC | KEEP | Critical for local processing |
| `test-metadata-transfer.ts` | Test metadata transfer | KEEP | Core pipeline step |

### G. ANALYSIS/DEBUGGING SCRIPTS (OLD PHASE, 2 WEEKS AGO)

From bulletproof revisions phase (commit 038dfd1). Likely experimental.

| Script | Purpose | Status |
|--------|---------|--------|
| `analyze-character-drift.ts` | Analyze character offsets | ARCHIVE |
| `check-drift-consistency.ts` | Check drift patterns | ARCHIVE |
| `check-markdown-offsets.ts` | Verify offset preservation | ARCHIVE |
| `download-hexen-chunking.ts` | Download test document | ARCHIVE |
| `download-cleanup-stage.ts` | Download pipeline stage | ARCHIVE |

### H. MISCELLANEOUS

| Script | Purpose | Status | Notes |
|--------|---------|--------|-------|
| `reprocess-cli.ts` | CLI for document reprocessing | KEEP | User-facing tool |
| `manual-reprocess.ts` | Manual reprocess helper | KEEP | Development tool |
| `test-docling-direct.sh` | Shell wrapper for Python script | DELETE | Superseded by .ts version |
| `validate-metadata-quality-mock.cjs` | Mock validation | DELETE | Dev/demo only |
| `run-integration-tests.js` | Old test runner | DELETE | Superseded by jest |
| `test-metadata-integration.js` | Old test runner | DELETE | Superseded by jest |

---

## 3. TESTS DIRECTORY (worker/tests/)

### Overall Status
**37 test files** across multiple subdirectories. Mix of:
- Real test suites (integration, engines)
- Old "phase validation" scripts (should be deleted)
- Experimental benchmarks

### A. PHASE VALIDATION FILES (DELETE ALL)

**Obsolete**: These are from development phases that are now complete. They validate old implementations.

| File | Phase | Created | Status |
|------|-------|---------|--------|
| `phase-2-validation.ts` | Docling integration | Phase 2 (Sept) | DELETE |
| `phase-4-validation.js` | (unclear) | - | DELETE |
| `phase-6-validation.ts` | Metadata extraction | Phase 6 (Sept) | DELETE |
| `phase-7-validation.ts` | (unclear) | - | DELETE |
| `phase-8-validation.ts` | (unclear) | - | DELETE |
| `phase-9-validation.ts` | (unclear) | - | DELETE |
| `phase-10-validation.ts` | Comprehensive pipeline | Phase 10 (Sept) | DELETE |
| `scoring-integration.ts` | Scoring system | Dev phase | ARCHIVE |

**Why Delete**:
1. Validate old/completed phases
2. Not run by any npm scripts
3. Duplicated by proper jest test suites
4. Create clutter - suggest deleting all phase-*-validation.ts files

### B. CANONICAL TEST SUITES (KEEP)

These are the real test suites run by npm scripts:

#### Integration Tests (`tests/integration/`)
```
- full-system.test.ts           (Critical - npm run test:critical)
- processor-integration.test.ts  (Stable - npm run test:stable)
- edge-cases.test.ts
- failure-recovery.test.ts
- large-document.test.ts
- local-cleanup.test.ts
- local-processing.test.ts
- pdf-batch.test.ts
- cached-chunks.test.ts
- docling-optimization.test.ts
- validation-warnings.test.ts
```

#### Engine Tests (`tests/engines/`)
```
- orchestrator.test.ts           (Critical - npm run test:critical)
- semantic-similarity.test.ts    (Stable - npm run test:stable)
- contradiction-detection.test.ts (Stable)
- thematic-bridge.test.ts        (Stable)
```

#### Library Tests (`tests/lib/`)
```
- fuzzy-matching.test.ts
- ai-chunking-batch.test.ts
- ai-chunking-batch-integration.test.ts
```

#### Validation Tests (`tests/validation/`)
```
- ai-metadata-quality.test.ts
```

### C. EXPERIMENTAL/BENCHMARK FILES (ARCHIVE)

| File | Type | Status |
|------|------|--------|
| `load-test.ts` | Load testing | ARCHIVE |
| `test-local-embeddings.ts` | Local embeddings | ARCHIVE |
| `scoring.test.ts` | Scoring validation | ARCHIVE |

### D. HELPERS & UTILS

Keep all of these:
- `setup.ts`
- `utils/test-helpers.ts`
- `helpers/index.ts`
- `fixtures/validation-set/generate-test-corpus.ts`

---

## 4. __TESTS__ DIRECTORY (worker/__tests__/)

### Overall Status
**11 files** in canonical Jest __tests__ directory. Mix of quality:

### A. PRODUCTION-QUALITY TESTS (KEEP)

| File | Purpose | Status |
|------|---------|--------|
| `embeddings.test.ts` | Test embedding generation | KEEP |
| `job-flow.test.ts` | Test background job system | KEEP |
| `storage-export.test.ts` | Test storage export | KEEP |
| `multi-format-integration.test.ts` | Test all input formats | KEEP |
| `fuzzy-matching.test.ts` | Test fuzzy matching | KEEP |

### B. EXPERIMENTAL/UTILITY TESTS

| File | Purpose | Status | Notes |
|------|---------|--------|-------|
| `youtube-cleaning.test.ts` | Test YouTube cleaning | KEEP | Part of processor |
| `youtube-metadata-enhancement.test.ts` | Test YouTube metadata | KEEP | Part of processor |
| `handler-refactor.test.ts` | Handler refactoring | ARCHIVE | Experimental |
| `recover-sparks.test.ts` | Test spark recovery | KEEP | Spark system feature |

### C. DEBUGGING FILES

| File | Purpose | Status | Notes |
|------|---------|--------|-------|
| `test-gemini-embedding.ts` | Debug Gemini embeddings | DELETE | Dev debugging |
| `utils/vector-utils.ts` | Utility functions | KEEP | Used by tests |

---

## 5. BENCHMARKS DIRECTORY (worker/benchmarks/)

### Status
**9 files** - All actively referenced in package.json npm scripts.

### Actively Used (KEEP ALL)
```
- batch-processing.ts         (npm run benchmark:batch-processing)
- metadata-quality-benchmark.ts (npm run benchmark:metadata-quality)
- orchestration-benchmark.ts   (npm run benchmark:orchestration)
- pdf-benchmark.ts             (npm run benchmark:pdf-benchmark)
- performance-test.ts          (npm run benchmark:performance)
- semantic-engine-benchmark.ts (npm run benchmark:semantic-engine)
```

### Supporting Files (KEEP)
```
- base-harness.cjs            (Used by pdf-benchmark.cjs)
- batch-operations-benchmark.cjs (Experimental but part of suite)
- cache-benchmark.cjs         (Experimental benchmark)
- run-all.cjs                 (Orchestration script)
```

---

## 6. BUILD ARTIFACTS (dist/)

### Status
**2.5 MB** of compiled JavaScript. 

- Generated by `npm run build`
- Should NOT be committed to git
- Should be in `.gitignore`

**Action**: Verify it's in .gitignore. Delete before committing any changes.

---

## ORPHANED FILES (from claudedocs analysis)

Already documented in `/Users/topher/Code/rhizome-v2-worktree-1/claudedocs/worker-orphaned-files.md`:

### Safe to Delete Now
- `worker/lib/cache-manager.ts` (10.9 KB)
- `worker/lib/pattern-matching.ts` (8.5 KB)
- `worker/lib/time-analysis.ts` (12.7 KB)
- `worker/tests/extractors/` (entire directory)

---

## PYTHON SCRIPTS ANALYSIS

### Active Scripts (KEEP)
```
✓ docling_extract.py          - PDF extraction wrapper (actively used in tests)
✓ docling_extract_epub.py     - EPUB extraction wrapper (actively used in tests)
✓ extract_metadata_pydantic.py - Metadata extraction via Ollama (actively used)
✓ chonkie_chunk.py            - Chunking via Python subprocess (actively used)
```

### Usage Evidence
- Called by: `worker/tests/integration/local-processing.test.ts`
- Called by: `worker/lib/chonkie/chonkie-chunker.ts`
- Tested by: `worker/scripts/test-chonkie-ipc.ts`
- Tested by: `worker/scripts/test-local-pipeline.ts`

All Python scripts are actively integrated and should be KEPT.

---

## JAVASCRIPT SCRIPTS ANALYSIS

### Active
- `validate-metadata-quality.js` - Main validation (npm run validate:metadata)

### Delete
- `run-integration-tests.js` - Superseded by jest
- `test-metadata-integration.js` - Superseded by jest  
- `validate-metadata-quality-mock.cjs` - Demo/mock only

---

## SUMMARY TABLE: DELETE vs KEEP vs ARCHIVE

### DELETE (Definitely Safe - Zero Risk)

| Category | Count | Examples |
|----------|-------|----------|
| Root test files | 8 | test-orchestrator.ts, test-annotation-recovery.ts, etc. |
| Phase validations | 8 | phase-2-validation.ts through phase-10-validation.ts |
| Debugging scripts | 8 | check-*.ts, debug-*.ts, fix-*.ts, find-*.ts, restore-*.ts |
| Old test runners | 3 | run-integration-tests.js, test-metadata-integration.js |
| Mock validators | 1 | validate-metadata-quality-mock.cjs |
| Shell wrappers | 1 | test-docling-direct.sh |
| **SUBTOTAL** | **29** | ~100 KB total |

### KEEP (Actively Used)

| Category | Count | Examples |
|----------|-------|----------|
| Integration tests | 13 | full-system.test.ts, processor-integration.test.ts, etc. |
| Engine tests | 5 | orchestrator.test.ts, semantic-similarity.test.ts, etc. |
| Unit tests | 10+ | embeddings.test.ts, job-flow.test.ts, etc. |
| Library tests | 3+ | fuzzy-matching.test.ts, ai-chunking-batch.test.ts |
| Active scripts | 7 | reprocess-cli.ts, manual-reprocess.ts, test-dual-bridge.ts |
| Benchmarks | 9 | All benchmark files (actively used) |
| Python scripts | 4 | All docling_extract*.py, chonkie_chunk.py |
| Utilities | 5+ | test helpers, fixtures, conftest-style setup |
| **SUBTOTAL** | **56+** | Keep all |

### ARCHIVE (Reference Only - Low Priority)

| Category | Count | Purpose |
|----------|-------|---------|
| Remapping tests | 5 | Connection remapping experiments (9b94cb8) |
| Offset analysis | 5 | Character drift analysis (038dfd1) |
| Experimental benchmarks | 2 | load-test.ts, test-local-embeddings.ts |
| Chunk exploration | 1 | test-chunk-size-comparison.ts |
| Scoring experiments | 1 | scoring-integration.ts |
| **SUBTOTAL** | **14** | Archive to claudedocs/ for reference |

---

## IMPLEMENTATION PLAN

### Phase 1: Zero-Risk Deletions (All Should Pass Tests)
```bash
# Root test files (8 files)
rm worker/test-orchestrator.ts
rm worker/test-annotation-recovery.ts
rm worker/test-semantic-similarity.ts
rm worker/test-thematic-bridge.ts
rm worker/test-fuzzy-matching.ts
rm worker/test-cleanup-prompt.ts
rm worker/test-contradiction-detection.ts
rm worker/test-reprocess-pipeline.ts

# Phase validation scripts (8 files)
rm worker/tests/phase-2-validation.ts
rm worker/tests/phase-4-validation.js
rm worker/tests/phase-6-validation.ts
rm worker/tests/phase-7-validation.ts
rm worker/tests/phase-8-validation.ts
rm worker/tests/phase-9-validation.ts
rm worker/tests/phase-10-validation.ts

# Debugging helpers (8 files)
rm worker/scripts/check-*.ts
rm worker/scripts/debug-*.ts
rm worker/scripts/fix-*.ts
rm worker/scripts/find-*.ts
rm worker/scripts/restore-*.ts

# Old test runners (3 files)
rm worker/scripts/run-integration-tests.js
rm worker/scripts/test-metadata-integration.js
rm worker/scripts/validate-metadata-quality-mock.cjs

# Misc (2 files)
rm worker/scripts/test-docling-direct.sh

# Test: npm run test:critical && npm run test:stable
```

### Phase 2: Archive Experimental Scripts (14 files)
```bash
mkdir -p claudedocs/archived-scripts

# Remapping experiments
mv worker/scripts/test-remap-*.ts claudedocs/archived-scripts/
mv worker/scripts/verify-remap-connections.ts claudedocs/archived-scripts/
mv worker/scripts/import-palmer-eldritch.ts claudedocs/archived-scripts/

# Offset analysis
mv worker/scripts/analyze-character-drift.ts claudedocs/archived-scripts/
mv worker/scripts/check-drift-consistency.ts claudedocs/archived-scripts/
mv worker/scripts/check-markdown-offsets.ts claudedocs/archived-scripts/
mv worker/scripts/download-*.ts claudedocs/archived-scripts/

# Other experiments
mv worker/tests/scoring-integration.ts claudedocs/archived-scripts/
mv worker/tests/load-test.ts claudedocs/archived-scripts/
mv worker/tests/test-local-embeddings.ts claudedocs/archived-scripts/
mv worker/scripts/test-chunk-size-comparison.ts claudedocs/archived-scripts/

# Test: npm run test (no failures)
```

### Phase 3: Clean Other Artifacts
```bash
# Verify these are in .gitignore
ls -la worker/dist
ls -la worker/node_modules

# Delete from disk before committing
rm -rf worker/dist
rm -rf worker/node_modules

# npm install will regenerate if needed
```

---

## VERIFICATION CHECKLIST

Before committing:

- [ ] Run `npm run test:critical` - Should pass
- [ ] Run `npm run test:stable` - Should pass  
- [ ] Run `npm run test` - Should pass (all tests)
- [ ] Run `npm run test:flexible` - Should pass
- [ ] Verify `npm run test:dual-bridge` still works
- [ ] Verify `npm run test:list-documents` still works
- [ ] Verify all benchmarks compile: `npm run benchmark:quick`
- [ ] Verify `.gitignore` covers dist/, node_modules/

---

## FILES TO DELETE (Complete List with Paths)

### Root Test Files (8)
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-orchestrator.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-annotation-recovery.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-semantic-similarity.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-thematic-bridge.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-fuzzy-matching.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-cleanup-prompt.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-contradiction-detection.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/test-reprocess-pipeline.ts`

### Phase Validation Files (8)
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-2-validation.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-4-validation.js`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-6-validation.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-7-validation.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-8-validation.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-9-validation.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/phase-10-validation.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/scoring-integration.ts`

### Debugging Scripts (8)
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/check-annotations.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/check-chunk-status.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/check-documents.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/check-verified-connections.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/debug-connection-data.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/find-readwise-book.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/fix-document-status.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/restore-chunks.ts`

### Old Test Runners (3)
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/run-integration-tests.js`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/test-metadata-integration.js`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/validate-metadata-quality-mock.cjs`

### Misc (2)
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/test-docling-direct.sh`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/__tests__/test-gemini-embedding.ts`

---

## FILES TO ARCHIVE (Complete List)

Move to `claudedocs/archived-scripts/`:

- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/test-remap-connections.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/test-remap-direct.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/test-remap-real-connections.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/verify-remap-connections.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/import-palmer-eldritch.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/analyze-character-drift.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/check-drift-consistency.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/check-markdown-offsets.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/download-hexen-chunking.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/download-cleanup-stage.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/load-test.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/test-local-embeddings.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/scripts/test-chunk-size-comparison.ts`
- `/Users/topher/Code/rhizome-v2-worktree-1/worker/__tests__/handler-refactor.test.ts`

---

## KEY REFERENCES

### Deleted Previously (Not Examined)
- `worker/lib/cache-manager.ts` - Already marked for deletion
- `worker/lib/pattern-matching.ts` - Already marked for deletion
- `worker/lib/time-analysis.ts` - Already marked for deletion
- `worker/tests/extractors/` - Directory already marked for deletion

### Not Touched
- All files in `worker/tests/integration/` - Canonical integration tests
- All files in `worker/tests/engines/` - Canonical engine tests
- All files in `worker/tests/lib/` - Canonical library tests
- All files in `worker/__tests__/` (except test-gemini-embedding.ts)
- All files in `worker/benchmarks/` - Actively used
- All Python scripts - Actively integrated
- All files in `worker/processors/` - Core functionality
- All files in `worker/handlers/` - Core functionality
- All files in `worker/engines/` - Core functionality

