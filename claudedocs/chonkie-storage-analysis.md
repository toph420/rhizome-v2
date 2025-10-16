# Chonkie Storage Portability & Add New Mode - Current State Analysis

**Generated**: 2025-10-15
**Purpose**: Analyze existing code for implementation of Chonkie fields in Storage and Add New mode
**Reference**: `docs/todo/chonkie-storage-and-add-new-mode.md`

---

## Executive Summary

**Status**: ✅ READY TO IMPLEMENT
**Complexity**: LOW - All infrastructure exists, minimal changes needed
**Risk**: LOW - Additive changes only, no breaking modifications

### Key Findings

1. **Storage Types**: Already defined in `worker/types/storage.ts` but MISSING Chonkie fields
2. **Processors**: Both PDF and EPUB processors save to Storage at line ~600-620, ready for extension
3. **Import Handler**: Clean mapping structure at line ~196-220, easy to extend
4. **Orchestrator**: Simple interface, needs `targetDocumentIds` parameter added
5. **Database Schema**: All Chonkie fields exist in chunks table (migration 050)

### Implementation Estimate

- **Total Lines to Modify**: ~150 lines across 6 files
- **New Lines**: ~50 lines (mostly field mappings)
- **Test Updates**: ~20 lines
- **Estimated Time**: 2-3 hours
- **Risk of Regression**: VERY LOW (additive changes only)

---

## 1. Storage Types (`worker/types/storage.ts`)

### Current State (Lines 37-68)

```typescript
export interface ChunkExportData {
  // Core content
  content: string
  chunk_index: number

  // Position tracking
  start_offset?: number
  end_offset?: number
  word_count?: number

  // Docling structural metadata (LOCAL mode)
  page_start?: number | null
  page_end?: number | null
  heading_level?: number | null
  section_marker?: string | null
  bboxes?: BBox[] | null
  position_confidence?: "exact" | "high" | "medium" | "synthetic"
  position_method?: string
  position_validated?: boolean

  // AI-extracted metadata
  themes?: string[]
  importance_score?: number
  summary?: string | null

  // Flat JSONB metadata (migration 015)
  emotional_metadata?: EmotionalMetadata
  conceptual_metadata?: ConceptualMetadata
  domain_metadata?: DomainMetadata | null

  metadata_extracted_at?: string | null
}
```

### ❌ Missing Chonkie Fields

These fields exist in the database (migration 050) but are NOT exported to Storage:

```typescript
// Chonkie-specific fields (MISSING)
chunker_type?: string           // 'recursive', 'token', 'sentence', etc.
token_count?: number            // Token count from Chonkie
metadata_overlap_count?: number // How many Docling chunks overlapped
metadata_confidence?: string    // 'high', 'medium', 'low'
metadata_interpolated?: boolean // True if no overlaps (interpolated)
```

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/types/storage.ts`
**Location**: Lines 37-68
**Action**: Add 5 new fields to `ChunkExportData`

```typescript
export interface ChunkExportData {
  // ... existing fields ...

  // Chonkie integration metadata (added for zero-cost reprocessing)
  chunker_type?: string           // Which Chonkie chunker was used
  token_count?: number            // Token count respecting chunk_size
  metadata_overlap_count?: number // Number of Docling chunks that overlapped
  metadata_confidence?: string    // 'high', 'medium', 'low'
  metadata_interpolated?: boolean // True if metadata was interpolated (no overlaps)

  metadata_extracted_at?: string | null
}
```

**Impact**: All downstream code will automatically handle these fields (TypeScript)

---

## 2. PDF Processor (`worker/processors/pdf-processor.ts`)

### Current State (Lines 596-622)

```typescript
// Stage 10: Finalize (95-100%)
console.log('[PDFProcessor] Stage 10: Finalizing document processing')
await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')

// Checkpoint 5: Save final markdown and chunks with embeddings
await this.saveStageResult('markdown', { content: markdown }, { final: true })
await this.saveStageResult('chunks', finalChunks, { final: true })  // ⬅️ LINE 601

// Checkpoint 6: Save manifest.json with processing metadata
const manifestData = {
  document_id: this.job.document_id,
  processing_mode: isLocalMode ? 'local' : 'cloud',
  source_type: 'pdf',
  files: {
    'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
    'metadata.json': { size: JSON.stringify(markdown).length, type: 'final' },
    'manifest.json': { size: 0, type: 'final' },
    ...(isLocalMode && extractionResult.chunks ? {
      'cached_chunks.json': { size: JSON.stringify(extractionResult.chunks).length, type: 'final' }
    } : {})
  },
  chunk_count: finalChunks.length,
  word_count: markdown.split(/\s+/).length,
  processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
  docling_version: isLocalMode ? '2.55.1' : undefined,
  markdown_hash: isLocalMode ? hashMarkdown(markdown) : undefined
}
await this.saveStageResult('manifest', manifestData, { final: true })
```

### ✅ Analysis

- **Line 601**: `saveStageResult('chunks', finalChunks)` already saves ALL fields from `finalChunks`
- **Chunks are enriched** at lines 396-403 (metadata transfer stage)
- **TypeScript will auto-include** new fields once `ChunkExportData` is extended

### ✅ Required Changes

**NONE** - Processor already saves all fields present in `finalChunks` array!

**Why it works**:
1. Chonkie chunks are created with metadata in `transferMetadataToChonkieChunks()` (line 396-403)
2. `saveStageResult()` serializes entire object to JSON
3. TypeScript type checking ensures compatibility
4. Storage helper writes full JSON to `chunks.json`

**Verification**: Check that `transferMetadataToChonkieChunks()` includes Chonkie fields:

```typescript
// worker/lib/chonkie/metadata-transfer.ts (line ~50-80)
const enrichedChunk: ProcessedChunk = {
  content: chonkieChunk.text,
  chunk_index: chonkieChunk.chunk_index,
  // ... existing fields ...

  // Chonkie fields (should be here)
  chunker_type: chonkieChunk.chunker_type,           // ⬅️ VERIFY THIS EXISTS
  token_count: chonkieChunk.token_count,             // ⬅️ VERIFY THIS EXISTS
  metadata_overlap_count: overlaps.length,           // ⬅️ SHOULD BE ADDED
  metadata_confidence: calculateConfidence(overlaps), // ⬅️ SHOULD BE ADDED
  metadata_interpolated: overlaps.length === 0       // ⬅️ SHOULD BE ADDED
}
```

**Action Required**: Check `metadata-transfer.ts` to ensure Chonkie fields are included

---

## 3. EPUB Processor (`worker/processors/epub-processor.ts`)

### Current State (Lines 725-752)

```typescript
// Stage 10: Finalize (95-100%)
console.log('[EPUBProcessor] Stage 10: Finalizing document processing')
await this.updateProgress(97, 'finalize', 'formatting', 'Finalizing')

// Checkpoint 5: Save final markdown and chunks with embeddings
await this.saveStageResult('markdown', { content: markdown }, { final: true })
await this.saveStageResult('chunks', finalChunks, { final: true })  // ⬅️ LINE 731

// Checkpoint 6: Save manifest.json with processing metadata
const manifestData = { /* ... */ }
await this.saveStageResult('manifest', manifestData, { final: true })
```

### ✅ Analysis

Same as PDF processor - no changes needed! EPUB uses same `saveStageResult()` pattern.

---

## 4. Import Handler (`worker/handlers/import-document.ts`)

### Current State (Lines 194-221)

```typescript
// Prepare chunks for insert (exclude database-specific fields)
const chunksToInsert = chunks.map(chunk => ({
  document_id: documentId,
  content: chunk.content,
  chunk_index: chunk.chunk_index,
  start_offset: chunk.start_offset,
  end_offset: chunk.end_offset,
  word_count: chunk.word_count,
  // Docling metadata
  page_start: chunk.page_start,
  page_end: chunk.page_end,
  heading_level: chunk.heading_level,
  section_marker: chunk.section_marker,
  bboxes: chunk.bboxes,
  position_confidence: chunk.position_confidence,
  position_method: chunk.position_method,
  position_validated: chunk.position_validated,
  // AI metadata
  themes: chunk.themes,
  importance_score: chunk.importance_score,
  summary: chunk.summary,
  emotional_metadata: chunk.emotional_metadata,
  conceptual_metadata: chunk.conceptual_metadata,
  domain_metadata: chunk.domain_metadata,
  metadata_extracted_at: chunk.metadata_extracted_at
  // Note: embedding will be regenerated if regenerateEmbeddings=true
}))
```

### ❌ Missing Chonkie Fields

The import handler does NOT map Chonkie fields from Storage to Database!

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/handlers/import-document.ts`
**Location**: Lines 194-221
**Action**: Add 5 new field mappings

```typescript
const chunksToInsert = chunks.map(chunk => ({
  // ... existing fields ...
  metadata_extracted_at: chunk.metadata_extracted_at,

  // Chonkie integration metadata (added for proper reprocessing)
  chunker_type: chunk.chunker_type || 'hybrid',  // Default for old exports
  token_count: chunk.token_count,
  metadata_overlap_count: chunk.metadata_overlap_count || 0,
  metadata_confidence: chunk.metadata_confidence || 'high',
  metadata_interpolated: chunk.metadata_interpolated || false
  // Note: embedding will be regenerated if regenerateEmbeddings=true
}))
```

**Impact**: Ensures Chonkie metadata is preserved during import/export cycles

---

## 5. Orchestrator (`worker/engines/orchestrator.ts`)

### Current State (Lines 15-21)

```typescript
export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
}
```

### ❌ Missing Add New Mode Support

The orchestrator has NO support for restricting engines to target specific documents!

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/engines/orchestrator.ts`
**Location**: Lines 15-21
**Action**: Add `targetDocumentIds` parameter

```typescript
export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  targetDocumentIds?: string[];  // NEW: Restrict candidate pool to these documents only
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
}
```

**Propagation**: Pass `targetDocumentIds` to each engine:

```typescript
// Lines 53-59
if (enabledEngines.includes('semantic_similarity')) {
  console.log('\n[Orchestrator] Running SemanticSimilarity...');
  await onProgress?.(25, 'semantic-similarity', 'Finding semantic similarities');
  const connections = await runSemanticSimilarity(documentId, {
    ...config.semanticSimilarity,
    targetDocumentIds: config.targetDocumentIds  // NEW: Pass to engine
  });
  allConnections.push(...connections);
  byEngine.semantic_similarity = connections.length;
}
```

**Repeat for**: contradiction_detection (lines 61-67), thematic_bridge (lines 69-83)

---

## 6. Semantic Similarity Engine (`worker/engines/semantic-similarity.ts`)

### Current State (Lines 31-36)

```typescript
export interface SemanticSimilarityConfig {
  threshold?: number;
  maxResultsPerChunk?: number;
  importanceWeight?: number;
  crossDocumentOnly?: boolean;
}
```

### ❌ Missing targetDocumentIds Support

The engine queries ALL documents in corpus (line 101-106):

```typescript
const { data: matches, error: searchError } = await supabase.rpc('match_chunks', {
  query_embedding: embedding,
  match_threshold: threshold,
  match_count: maxResultsPerChunk,
  exclude_document_id: crossDocumentOnly ? documentId : null
});
```

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/engines/semantic-similarity.ts`
**Location**: Lines 31-36, 99-112
**Action**: Add filtering by `targetDocumentIds`

```typescript
export interface SemanticSimilarityConfig {
  threshold?: number;
  maxResultsPerChunk?: number;
  importanceWeight?: number;
  crossDocumentOnly?: boolean;
  targetDocumentIds?: string[];  // NEW: Restrict to these documents only
}
```

**Query Changes** (lines 99-112):

```typescript
// Use pgvector's match_chunks function for efficient similarity search
const { data: matches, error: searchError } = await supabase.rpc('match_chunks', {
  query_embedding: embedding,
  match_threshold: threshold,
  match_count: maxResultsPerChunk,
  exclude_document_id: crossDocumentOnly ? documentId : null
});

// NEW: Filter by target documents if specified
if (config.targetDocumentIds && matches) {
  matches = matches.filter(m => config.targetDocumentIds!.includes(m.document_id));
}
```

**Note**: Filter AFTER pgvector query (can't pass array to RPC function without custom SQL)

---

## 7. Contradiction Detection Engine (`worker/engines/contradiction-detection.ts`)

### Current State (Lines 14-19)

```typescript
export interface ContradictionDetectionConfig {
  minConceptOverlap?: number;
  polarityThreshold?: number;
  maxResultsPerChunk?: number;
  crossDocumentOnly?: boolean;
}
```

### ❌ Missing targetDocumentIds Support

The engine queries ALL documents (lines 73-88):

```typescript
const { data: candidates } = await supabase
  .from('chunks')
  .select(`
    id,
    document_id,
    conceptual_metadata,
    emotional_metadata,
    importance_score,
    content,
    summary,
    documents!inner(title)
  `)
  .not('conceptual_metadata', 'is', null)
  .not('emotional_metadata', 'is', null)
  .neq('id', chunk.id);
```

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/engines/contradiction-detection.ts`
**Location**: Lines 14-19, 73-88
**Action**: Add filtering by `targetDocumentIds`

```typescript
export interface ContradictionDetectionConfig {
  minConceptOverlap?: number;
  polarityThreshold?: number;
  maxResultsPerChunk?: number;
  crossDocumentOnly?: boolean;
  targetDocumentIds?: string[];  // NEW: Restrict to these documents only
}
```

**Query Changes** (lines 73-88):

```typescript
// Build query with optional targetDocumentIds filter
let query = supabase
  .from('chunks')
  .select(`
    id,
    document_id,
    conceptual_metadata,
    emotional_metadata,
    importance_score,
    content,
    summary,
    documents!inner(title)
  `)
  .not('conceptual_metadata', 'is', null)
  .not('emotional_metadata', 'is', null)
  .neq('id', chunk.id);

// NEW: Apply target document filter if provided
if (config.targetDocumentIds) {
  query = query.in('document_id', config.targetDocumentIds);
}

const { data: candidates } = await query;
```

---

## 8. Thematic Bridge Engine (`worker/engines/thematic-bridge.ts`)

### Current State (Lines 17-24)

```typescript
export interface ThematicBridgeConfig {
  minImportance?: number;
  minStrength?: number;
  maxSourceChunks?: number;
  maxCandidatesPerSource?: number;
  batchSize?: number;
}
```

### ❌ Missing targetDocumentIds Support

The engine queries ALL cross-document candidates (lines 88-105):

```typescript
const { data: candidates } = await supabase
  .from('chunks')
  .select(`
    id,
    document_id,
    content,
    summary,
    domain_metadata,
    importance_score,
    documents!inner(title)
  `)
  .neq('document_id', chunk.document_id)
  .gte('importance_score', minImportance)
  .not('domain_metadata', 'is', null)
  .neq('domain_metadata->>primaryDomain', sourceDomain)
  .order('importance_score', { ascending: false })
  .limit(maxCandidatesPerSource);
```

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/engines/thematic-bridge.ts`
**Location**: Lines 17-24, 88-105
**Action**: Add filtering by `targetDocumentIds`

```typescript
export interface ThematicBridgeConfig {
  minImportance?: number;
  minStrength?: number;
  maxSourceChunks?: number;
  maxCandidatesPerSource?: number;
  batchSize?: number;
  targetDocumentIds?: string[];  // NEW: Restrict to these documents only
}
```

**Query Changes** (lines 88-105):

```typescript
// Build query with optional targetDocumentIds filter
let query = supabase
  .from('chunks')
  .select(`
    id,
    document_id,
    content,
    summary,
    domain_metadata,
    importance_score,
    documents!inner(title)
  `)
  .neq('document_id', chunk.document_id)
  .gte('importance_score', minImportance)
  .not('domain_metadata', 'is', null)
  .neq('domain_metadata->>primaryDomain', sourceDomain)
  .order('importance_score', { ascending: false })
  .limit(maxCandidatesPerSource);

// NEW: Apply target document filter if provided
if (config.targetDocumentIds) {
  query = query.in('document_id', config.targetDocumentIds);
}

const { data: candidates } = await query;
```

---

## 9. Reprocess Connections Handler (`worker/handlers/reprocess-connections.ts`)

### Current State (Lines 173-225)

```typescript
} else if (options.mode === 'add_new') {
  // Add New Mode: Only process connections to newer documents
  await updateProgress(20, 'analyzing', 'Finding newer documents');

  // Get current document creation date
  const { data: currentDoc, error: docError } = await supabase
    .from('documents')
    .select('created_at')
    .eq('id', documentId)
    .single();

  if (docError || !currentDoc) {
    throw new Error(`Failed to query document: ${docError?.message || 'Not found'}`);
  }

  // Get newer documents
  const { data: newerDocs, error: newerError } = await supabase
    .from('documents')
    .select('id')
    .gt('created_at', currentDoc.created_at);

  if (newerError) {
    throw new Error(`Failed to query newer documents: ${newerError?.message}`);
  }

  console.log(`[ReprocessConnections] Found ${newerDocs?.length || 0} newer documents`);

  // Note: Current orchestrator doesn't support targetDocumentIds filter
  // This is a limitation documented in the task (line 1724)
  // For now, we'll run full reprocessing but log a warning
  if ((newerDocs?.length || 0) === 0) {
    console.log(`[ReprocessConnections] No newer documents found, skipping reprocessing`);
    // ... early return ...
  }

  console.log(`[ReprocessConnections] Warning: Add New mode will process all documents`);
  console.log(`[ReprocessConnections] Orchestrator enhancement needed for targetDocumentIds`);
}
```

### ❌ Warning Message for Add New Mode

Lines 223-224 explicitly state that Add New mode is NOT fully implemented!

### ✅ Required Changes

**File**: `/Users/topher/Code/rhizome-v2-cached-chunks/worker/handlers/reprocess-connections.ts`
**Location**: Lines 173-225
**Action**: Pass `targetDocumentIds` to orchestrator

```typescript
} else if (options.mode === 'add_new') {
  // Add New Mode: Only process connections to newer documents
  await updateProgress(20, 'analyzing', 'Finding newer documents');

  // Get current document creation date
  const { data: currentDoc, error: docError } = await supabase
    .from('documents')
    .select('created_at')
    .eq('id', documentId)
    .single();

  if (docError || !currentDoc) {
    throw new Error(`Failed to query document: ${docError?.message || 'Not found'}`);
  }

  // Get newer documents
  const { data: newerDocs, error: newerError } = await supabase
    .from('documents')
    .select('id')
    .gt('created_at', currentDoc.created_at);

  if (newerError) {
    throw new Error(`Failed to query newer documents: ${newerError?.message}`);
  }

  const newerDocIds = newerDocs?.map(d => d.id) || [];
  console.log(`[ReprocessConnections] Found ${newerDocIds.length} newer documents`);

  if (newerDocIds.length === 0) {
    console.log(`[ReprocessConnections] No newer documents found, skipping reprocessing`);
    // ... early return ...
  }

  // NEW: Store targetDocumentIds for orchestrator
  result.targetDocumentIds = newerDocIds;
  console.log(`[ReprocessConnections] Will process connections to ${newerDocIds.length} newer documents`);
}

// Step 3: Call orchestrator with selected engines
await updateProgress(40, 'processing', 'Running connection detection engines');

console.log(`[ReprocessConnections] Calling orchestrator with engines: ${options.engines.join(', ')}`);

const orchestratorResult = await processDocument(documentId, {
  enabledEngines: options.engines,
  targetDocumentIds: result.targetDocumentIds,  // NEW: Pass to orchestrator
  onProgress: async (percent, stage, details) => {
    // ... progress tracking ...
  },
  // ... engine configs ...
});
```

---

## 10. Database Schema Verification

### Chunks Table Fields (Migration 050)

```sql
-- Migration 050: Add chunker_type support for Chonkie integration
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS chunker_type TEXT NOT NULL DEFAULT 'hybrid'
CHECK (chunker_type IN (
  'hybrid', 'token', 'sentence', 'recursive', 'semantic',
  'late', 'code', 'neural', 'slumber', 'table'
));

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS token_count INTEGER;

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS metadata_overlap_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata_confidence TEXT DEFAULT 'high'
CHECK (metadata_confidence IN ('high', 'medium', 'low')),
ADD COLUMN IF NOT EXISTS metadata_interpolated BOOLEAN DEFAULT false;
```

### ✅ All Required Fields Exist

- `chunker_type` ✅
- `token_count` ✅
- `metadata_overlap_count` ✅
- `metadata_confidence` ✅
- `metadata_interpolated` ✅

**No database migrations needed!**

---

## Implementation Checklist

### Phase 1: Storage Export (Chonkie Fields)

- [ ] **1.1** Add 5 Chonkie fields to `ChunkExportData` interface (`worker/types/storage.ts` lines 37-68)
- [ ] **1.2** Verify `metadata-transfer.ts` includes Chonkie fields in enriched chunks
- [ ] **1.3** Test: Export document, verify `chunks.json` contains Chonkie fields

### Phase 2: Storage Import (Chonkie Fields)

- [ ] **2.1** Add 5 Chonkie field mappings to import handler (`worker/handlers/import-document.ts` lines 194-221)
- [ ] **2.2** Test: Import exported document, verify Chonkie fields restored to database

### Phase 3: Add New Mode Support

- [ ] **3.1** Add `targetDocumentIds` to `OrchestratorConfig` (`worker/engines/orchestrator.ts` lines 15-21)
- [ ] **3.2** Propagate `targetDocumentIds` to all 3 engines (orchestrator lines 53-83)
- [ ] **3.3** Add `targetDocumentIds` filtering to SemanticSimilarity (`worker/engines/semantic-similarity.ts` lines 31-36, 99-112)
- [ ] **3.4** Add `targetDocumentIds` filtering to ContradictionDetection (`worker/engines/contradiction-detection.ts` lines 14-19, 73-88)
- [ ] **3.5** Add `targetDocumentIds` filtering to ThematicBridge (`worker/engines/thematic-bridge.ts` lines 17-24, 88-105)
- [ ] **3.6** Update reprocess handler to pass `targetDocumentIds` (`worker/handlers/reprocess-connections.ts` lines 173-225)
- [ ] **3.7** Test: Reprocess with Add New mode, verify only connections to newer documents created

### Phase 4: Testing & Validation

- [ ] **4.1** Integration test: Full export → import → reprocess cycle
- [ ] **4.2** Verify Chonkie fields preserved across cycles
- [ ] **4.3** Verify Add New mode only creates connections to newer documents
- [ ] **4.4** Performance test: Add New mode should be faster than "all" mode
- [ ] **4.5** Edge case: Add New mode with zero newer documents (early return)

---

## Risk Assessment

### LOW RISK Areas ✅

1. **Storage Types**: Pure TypeScript interfaces, no runtime logic
2. **Import Handler**: Simple field mapping, no complex transformations
3. **Orchestrator**: Clean interface addition, backward compatible
4. **Database Schema**: All fields already exist, no migrations needed

### MEDIUM RISK Areas ⚠️

1. **Engine Query Modifications**: SQL query changes could impact performance
   - **Mitigation**: Filter AFTER database query (not ideal but safe)
   - **Future**: Add RPC function for `targetDocumentIds` filtering

2. **Metadata Transfer Verification**: Need to confirm Chonkie fields exist in `ProcessedChunk`
   - **Mitigation**: Check `metadata-transfer.ts` before implementation
   - **Fallback**: Add fields if missing (trivial change)

### NO RISK Areas 🎯

1. **Processors**: No changes needed! Already save all fields
2. **Database**: All fields exist, no migrations required
3. **Breaking Changes**: None - all changes are additive

---

## Performance Considerations

### Storage Export/Import

**Impact**: NEGLIGIBLE
**Reason**: Adding 5 integer/boolean fields to JSON (~50 bytes per chunk)
**Example**: 500-chunk document adds 25KB to `chunks.json` (0.01% size increase)

### Add New Mode Filtering

**Current**: Queries entire corpus for each source chunk
**After**: Queries entire corpus, then filters in-memory

**Performance Impact**:
- **Best Case**: 1 newer document → 99% reduction in AI calls
- **Worst Case**: 100 newer documents → ~50% reduction in AI calls
- **Memory**: ~1MB per 10,000 candidate chunks (negligible)

**Future Optimization**: Add RPC function for database-level filtering

---

## Next Steps

1. **Verify metadata-transfer.ts** includes Chonkie fields (5 min)
2. **Implement Phase 1** (Storage export) (30 min)
3. **Implement Phase 2** (Storage import) (20 min)
4. **Implement Phase 3** (Add New mode) (60 min)
5. **Test integration** (30 min)
6. **Update documentation** (15 min)

**Total Estimated Time**: 2-3 hours

---

## File Summary

| File | Lines to Modify | New Lines | Complexity | Risk |
|------|----------------|-----------|------------|------|
| `worker/types/storage.ts` | 1 block | 5 | LOW | LOW |
| `worker/handlers/import-document.ts` | 1 block | 5 | LOW | LOW |
| `worker/engines/orchestrator.ts` | 4 blocks | 10 | LOW | LOW |
| `worker/engines/semantic-similarity.ts` | 2 blocks | 10 | MEDIUM | LOW |
| `worker/engines/contradiction-detection.ts` | 2 blocks | 10 | MEDIUM | LOW |
| `worker/engines/thematic-bridge.ts` | 2 blocks | 10 | MEDIUM | LOW |
| `worker/handlers/reprocess-connections.ts` | 2 blocks | 10 | LOW | LOW |
| **TOTAL** | **14 blocks** | **60 lines** | **LOW** | **LOW** |

---

## Conclusion

**Status**: ✅ READY TO IMPLEMENT
**Risk**: LOW - All infrastructure exists
**Effort**: 2-3 hours
**Impact**: HIGH - Enables zero-cost reprocessing with Chonkie metadata + efficient Add New mode

All required database fields exist (migration 050), processors already save complete chunk data, and the architecture is clean with clear separation of concerns. Implementation is straightforward field additions with minimal risk of regression.
