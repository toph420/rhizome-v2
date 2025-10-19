# Worker Module: Orphaned & Unused Files - Detailed List

## ABSOLUTE PATHS FOR ALL FINDINGS

### Completely Unused Modules (Safe to Delete)

#### 1. cache-manager.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/cache-manager.ts`
- **Size**: ~10.9 KB
- **Purpose**: LRU cache with TTL support
- **Status**: 0 imports found
- **Content**: Implements generic `LRUCache<K,V>` class with TTL, stats tracking
- **Safety**: SAFE TO DELETE - No references anywhere

#### 2. pattern-matching.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/pattern-matching.ts`
- **Size**: ~8.5 KB
- **Purpose**: Pattern similarity calculation
- **Status**: 0 imports found
- **Content**: Functions for comparing structural patterns/fingerprints
- **Safety**: SAFE TO DELETE - No references anywhere

#### 3. time-analysis.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/time-analysis.ts`
- **Size**: ~12.7 KB
- **Purpose**: Temporal proximity and time parsing
- **Status**: 0 imports found
- **Content**: Functions for parsing dates, calculating temporal distances
- **Safety**: SAFE TO DELETE - No references anywhere

---

### Orphaned Test Files

#### 1. structural.test.js (and parent directory)
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/extractors/structural.test.js`
- **Size**: ~8.9 KB
- **Status**: Tests non-existent module
- **What it imports**:
  - `../../lib/extractors/structural-patterns` ← DOES NOT EXIST
  - `../../lib/extractors/prompts/structural` ← DOES NOT EXIST
- **Parent directory**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/extractors/`
- **Safety**: SAFE TO DELETE - Source modules were removed in refactoring

---

### Files with References to Deleted Modules

#### 1. model-config.ts (Comment Reference)
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/model-config.ts`
- **Problem**: Line 41 comment references deleted module
- **Comment**: "Used by ai-chunking-batch and pdf-batch-utils"
- **Status**: pdf-batch-utils.ts was deleted in commit f38be9891a
- **Recommendation**: Update comment to remove reference

---

### Benchmarks with Potentially Broken References

#### 1. pdf-benchmark.cjs
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/benchmarks/pdf-benchmark.cjs`
- **Status**: May reference deleted utils
- **Recommendation**: Verify it still runs after pdf-batch-utils deletion

---

### Recently Deleted Files (from Git History)

All these were in working tree previously but now deleted:

#### Core Metadata System (DELETED)
- `worker/lib/extractors/` (entire directory with 6+ files)
  - `domain.ts`
  - `emotional-tone.ts`
  - `index.ts`
  - `key-concepts.ts`
  - `method-signatures.ts`
  - `narrative-rhythm.ts`
  - `references.ts`
  - `prompts/emotional.ts`
  - `prompts/structural.ts`
- `worker/lib/metadata-extractor.ts`
- Replaced by: `worker/lib/chunking/pydantic-metadata.ts` & `bulletproof-metadata.ts`

#### Batch Processing System (DELETED)
- `worker/lib/pdf-batch-utils.ts`
- `worker/benchmarks/batch-processing.ts`
- `worker/benchmarks/pdf-benchmark.ts`
- `worker/tests/lib/pdf-batch-utils.test.ts`
- Replaced by: Unified Chonkie pipeline in `worker/lib/ai-chunking-batch.ts`

#### Readwise Integration (DELETED)
- `worker/lib/readwise-reader-api.ts`
- Replaced by: `worker/lib/readwise-export-api.ts`

#### Local Processing (DELETED)
- `worker/lib/local/inline-metadata-parser.ts`

#### Backups/Artifacts (DELETED)
- `worker/lib/ai-chunking-batch.ts.backup`
- `worker/debug-chunks.ts`
- `worker/test-gemini.ts`

#### Readwise Testing (DELETED)
- `worker/scripts/test-readwise-reader-import.ts`

#### Coverage Artifacts (DELETED - Not relevant for source analysis)
- `worker/coverage/*` (multiple files)

---

### Low Usage Modules (Single Import Only)

#### 1. performance-monitor.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/performance-monitor.ts`
- **Size**: ~8.8 KB
- **Imports**: 1 (from `worker/test-semantic-similarity.ts`)
- **Status**: Only used in ad-hoc test script
- **Recommendation**: Verify if actively used or just test scaffold

#### 2. gemini-cache.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/gemini-cache.ts`
- **Size**: ~9.1 KB
- **Imports**: 1 (from `worker/handlers/process-document.ts`)
- **Status**: Used in production
- **Recommendation**: Keep - active in document handler

#### 3. rate-limiter.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/rate-limiter.ts`
- **Size**: ~653 B
- **Imports**: 1 (from `worker/lib/embeddings.ts`)
- **Status**: Used for rate control
- **Recommendation**: Keep - supports embeddings generation

---

### Low Usage Modules (2 Imports Only)

#### 1. user-preferences.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/user-preferences.ts`
- **Size**: ~9.8 KB
- **Imports**: 2
- **Recommendation**: Verify usage pattern

#### 2. vector-search.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/vector-search.ts`
- **Size**: ~6.7 KB
- **Imports**: 2
- **Recommendation**: Verify usage pattern

#### 3. batch-operations.ts
- **Path**: `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/batch-operations.ts`
- **Size**: ~9.4 KB
- **Imports**: 2
- **Recommendation**: Verify usage pattern

---

## Summary Statistics

### File Counts by Category
```
Total lib files: 59
├── Completely unused: 3 files
├── Orphaned tests: 1 directory (1 file)
├── References to deleted modules: 1 file (comment only)
├── Low usage (1 import): 2 files (1 active, 1 test-only)
├── Low usage (2 imports): 3 files
└── Active/Well-used: 50+ files
```

### Storage Impact
- **Unused modules total size**: ~32 KB
- **Orphaned tests size**: ~9 KB
- **Total potential cleanup**: ~41 KB (negligible but worth removing)

### Git History Changes
- Files deleted in recent refactoring: 25+
- Extraction module consolidation: 7 files → 2 files
- Batch utils consolidation: 4 files → 1 file
- Net reduction: 10+ files already removed

---

## Immediate Actions Recommended

### Do This First (Zero Risk)
1. Delete `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/cache-manager.ts`
2. Delete `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/pattern-matching.ts`
3. Delete `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/time-analysis.ts`
4. Delete `/Users/topher/Code/rhizome-v2-worktree-1/worker/tests/extractors/` (entire directory)

### Do This Second (Minor Updates)
1. Update `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/model-config.ts` line 41
2. Update `/Users/topher/Code/rhizome-v2-worktree-1/worker/README.md` file counts
3. Test `/Users/topher/Code/rhizome-v2-worktree-1/worker/benchmarks/pdf-benchmark.cjs`

### Do This Third (Optional - Verify First)
1. Review `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/performance-monitor.ts` usage
2. Review `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/user-preferences.ts` usage
3. Review `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/vector-search.ts` usage
4. Review `/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/batch-operations.ts` usage

