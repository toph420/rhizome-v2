# Chonkie Storage Portability & Add New Mode Implementation

**Created**: 2025-10-15
**Priority**: HIGH (Data integrity + Feature completion)
**Status**: Ready for implementation
**Estimated Time**: 4-6 hours

---

## Overview

Two critical gaps identified during T-018 testing:

1. **Storage Portability Gap**: New Chonkie metadata fields exist in database but are NOT saved to Storage, breaking the Storage-First philosophy
2. **Add New Mode Limitation**: Connection reprocessing mode exists but doesn't filter to newer documents (orchestrator limitation)

Both require clean, architectural solutions - no band-aids.

---

## Problem 1: Missing Chonkie Fields in Storage Export

### Current State

**Database has these Chonkie fields** (from unified pipeline):
- `heading_path` (TEXT[]) - Heading hierarchy from Docling metadata transfer
- `chunker_type` (TEXT) - Which of 9 strategies was used (token, recursive, semantic, etc.)
- `metadata_overlap_count` (INTEGER) - How many Docling chunks overlapped this Chonkie chunk
- `metadata_confidence` (TEXT) - Quality: "high", "medium", "low"
- `metadata_interpolated` (BOOLEAN) - Was metadata synthetic (gap-filled)?

**ChunkExportData interface is MISSING**:
- ❌ `heading_path` (array)
- ❌ `chunker_type` (string)
- ❌ `metadata_overlap_count` (number)
- ❌ `metadata_confidence` (string)
- ❌ `metadata_interpolated` (boolean)

### Impact

**Data Loss Scenario**:
1. User processes document with recursive chunker → `chunker_type = "recursive"` saved to DB
2. Export to Storage → `chunks.json` does NOT include `chunker_type`
3. DB reset + import from Storage → `chunker_type` defaults to "hybrid" (wrong!)
4. User loses knowledge of which chunking strategy was used
5. Quality metrics (`metadata_confidence`, `metadata_overlap_count`) lost forever

**This violates Storage-First principle**: Storage is supposed to be source of truth, but it's missing critical metadata.

### Root Cause

`worker/types/storage.ts` interface was defined BEFORE Chonkie integration. The unified pipeline added new fields to database schema (migrations 047, 050) but TypeScript export interface was never updated.

---

## Problem 2: Add New Mode Doesn't Filter to Newer Documents

### Current State

**Handler Implementation** (`worker/handlers/reprocess-connections.ts:174-203`):
```typescript
} else if (options.mode === 'add_new') {
  // Get newer documents
  const { data: newerDocs } = await supabase
    .from('documents')
    .select('id')
    .gt('created_at', currentDoc.created_at);

  console.log(`Found ${newerDocs?.length || 0} newer documents`);

  // Note: Current orchestrator doesn't support targetDocumentIds filter
  // This is a limitation documented in the task (line 1724)
  // For now, we'll run full reprocessing but log a warning

  console.log(`Warning: Add New mode will process all documents`);
  console.log(`Orchestrator enhancement needed for targetDocumentIds`);
}
```

**What happens**: Finds newer docs, logs warning, then calls orchestrator which processes ALL documents (not just newer ones).

**User expectation**: "Add New" should keep existing connections and ONLY add connections to documents processed after the current one.

**Actual behavior**: Processes connections to ALL documents (older + newer), wastes AI calls, defeats purpose of "incremental" mode.

### Root Cause

Orchestrator interface (`worker/engines/orchestrator.ts`) doesn't support filtering candidate documents:

```typescript
export interface ProcessDocumentOptions {
  enabledEngines: EngineType[];
  semanticSimilarity?: SemanticSimilarityOptions;
  contradictionDetection?: ContradictionDetectionOptions;
  thematicBridge?: ThematicBridgeOptions;
  onProgress?: ProgressCallback;
  // MISSING: targetDocumentIds?: string[];
}
```

Each engine queries the entire corpus, no way to restrict to specific target documents.

---

## Solution 1: Add Missing Fields to Storage Export Schema

### Implementation Plan

#### Step 1: Update ChunkExportData Interface

**File**: `worker/types/storage.ts`

**Changes**:
```typescript
export interface ChunkExportData {
  // Core content
  content: string
  chunk_index: number

  // Position tracking
  start_offset?: number
  end_offset?: number
  word_count?: number

  // NEW: Chonkie chunking metadata
  chunker_type: "token" | "sentence" | "recursive" | "semantic" | "late" |
                "code" | "neural" | "slumber" | "table"  // NOT nullable, required

  // Docling structural metadata (via overlap detection)
  heading_path?: string[] | null  // NEW: Array of heading hierarchy
  heading_level?: number | null
  page_start?: number | null
  page_end?: number | null
  section_marker?: string | null
  bboxes?: BBox[] | null

  // NEW: Metadata transfer quality tracking
  metadata_overlap_count?: number  // Default: 0
  metadata_confidence?: "high" | "medium" | "low"  // Default: "high"
  metadata_interpolated?: boolean  // Default: false

  // Position matching metadata (existing)
  position_confidence?: "exact" | "high" | "medium" | "synthetic"
  position_method?: string
  position_validated?: boolean

  // AI-extracted metadata (existing)
  themes?: string[]
  importance_score?: number
  summary?: string | null
  emotional_metadata?: EmotionalMetadata
  conceptual_metadata?: ConceptualMetadata
  domain_metadata?: DomainMetadata | null
  metadata_extracted_at?: string | null
}
```

**Rationale**:
- `chunker_type`: REQUIRED (always known, critical for reproducibility)
- `heading_path`: Replaces implicit heading structure, enables citation generation
- `metadata_overlap_count`, `metadata_confidence`, `metadata_interpolated`: Quality tracking for user review workflow

#### Step 2: Update Processors to Save New Fields

**Files**:
- `worker/processors/pdf-processor.ts`
- `worker/processors/epub-processor.ts`

**Location**: Where `chunks.json` is saved (search for `saveStageResult('chunks'`)

**Changes**:
```typescript
// Before saving chunks
const enrichedChunksForExport = finalChunks.map(chunk => ({
  content: chunk.content,
  chunk_index: chunk.chunk_index,
  start_offset: chunk.start_offset,
  end_offset: chunk.end_offset,
  word_count: chunk.word_count,

  // NEW: Include Chonkie metadata
  chunker_type: chunk.chunker_type,  // Always present
  heading_path: chunk.heading_path,  // May be null
  heading_level: chunk.heading_level,

  // NEW: Include quality metrics
  metadata_overlap_count: chunk.metadata_overlap_count ?? 0,
  metadata_confidence: chunk.metadata_confidence ?? 'high',
  metadata_interpolated: chunk.metadata_interpolated ?? false,

  // ... existing fields (themes, importance, etc.)
}));

await this.saveStageResult('chunks', {
  version: '1.0',
  document_id: this.documentId,
  processing_mode: isLocalMode ? 'local' : 'cloud',
  created_at: new Date().toISOString(),
  chunks: enrichedChunksForExport
}, { final: true });
```

#### Step 3: Update Import Handler to Read New Fields

**File**: `worker/handlers/import-document.ts`

**Location**: Where chunks are mapped for database insertion (~line 120)

**Changes**:
```typescript
const chunksToInsert = chunksData.chunks.map((chunk: ChunkExportData, idx: number) => ({
  document_id: documentId,
  chunk_index: chunk.chunk_index ?? idx,
  content: chunk.content,
  start_offset: chunk.start_offset,
  end_offset: chunk.end_offset,
  word_count: chunk.word_count,

  // NEW: Chonkie metadata (with fallback for old exports)
  chunker_type: chunk.chunker_type ?? 'recursive',  // Fallback to default
  heading_path: chunk.heading_path,
  heading_level: chunk.heading_level,

  // NEW: Quality metrics (with fallbacks)
  metadata_overlap_count: chunk.metadata_overlap_count ?? 0,
  metadata_confidence: chunk.metadata_confidence ?? 'high',
  metadata_interpolated: chunk.metadata_interpolated ?? false,

  // Existing fields
  page_start: chunk.page_start,
  page_end: chunk.page_end,
  // ... etc
}));
```

**Backward Compatibility**: Use `??` fallback operators so old exports (missing new fields) still import successfully.

#### Step 4: Update Export Validation Script

**File**: `worker/scripts/validate-storage-export.ts`

**Add validation** for new fields (~line 169):

```typescript
// Validate chunk-level required fields
const chunkRequiredFields = [
  'content', 'chunk_index', 'chunker_type'  // NEW: chunker_type required
];

const chunkOptionalFields = [
  'heading_path',  // NEW
  'metadata_overlap_count',  // NEW
  'metadata_confidence',  // NEW
  'metadata_interpolated',  // NEW
  'themes', 'importance_score', // existing
];

// Validate chunker_type enum
if (chunk.chunker_type) {
  const validTypes = ['token', 'sentence', 'recursive', 'semantic',
                      'late', 'code', 'neural', 'slumber', 'table'];
  if (!validTypes.includes(chunk.chunker_type)) {
    summary.results.push({
      success: false,
      message: `✗ chunks.json: invalid chunker_type "${chunk.chunker_type}"`
    });
    summary.failed++;
  }
}

// Validate metadata_confidence enum
if (chunk.metadata_confidence) {
  const validConfidence = ['high', 'medium', 'low'];
  if (!validConfidence.includes(chunk.metadata_confidence)) {
    summary.results.push({
      success: false,
      message: `✗ chunks.json: invalid metadata_confidence "${chunk.metadata_confidence}"`
    });
    summary.failed++;
  }
}
```

#### Step 5: Update Tests

**Files**:
- `worker/__tests__/storage-export.test.ts`
- `worker/handlers/__tests__/import-document.test.ts`

**Add test cases**:
```typescript
it('should include Chonkie metadata fields in chunks.json', async () => {
  const chunksData = {
    version: '1.0',
    document_id: 'test-doc',
    processing_mode: 'local',
    created_at: new Date().toISOString(),
    chunks: [
      {
        content: 'Test chunk',
        chunk_index: 0,
        chunker_type: 'recursive',
        heading_path: ['Chapter 1', 'Section 1.1'],
        heading_level: 2,
        metadata_overlap_count: 3,
        metadata_confidence: 'high',
        metadata_interpolated: false
      }
    ]
  };

  await saveToStorage(mockSupabase, 'test/chunks.json', chunksData);
  const saved = storageSaves.get('test/chunks.json') as ChunksExport;

  expect(saved.chunks[0].chunker_type).toBe('recursive');
  expect(saved.chunks[0].heading_path).toEqual(['Chapter 1', 'Section 1.1']);
  expect(saved.chunks[0].metadata_overlap_count).toBe(3);
  expect(saved.chunks[0].metadata_confidence).toBe('high');
  expect(saved.chunks[0].metadata_interpolated).toBe(false);
});

it('should handle import of legacy chunks without new fields', async () => {
  // Old export missing chunker_type, heading_path, etc.
  const legacyChunks = {
    version: '1.0',
    chunks: [
      {
        content: 'Old chunk',
        chunk_index: 0
        // Missing: chunker_type, heading_path, metadata_* fields
      }
    ]
  };

  const imported = await importChunks(legacyChunks);

  // Should use fallback values
  expect(imported[0].chunker_type).toBe('recursive');  // Default
  expect(imported[0].metadata_overlap_count).toBe(0);
  expect(imported[0].metadata_confidence).toBe('high');
});
```

---

## Solution 2: Add targetDocumentIds Filter to Orchestrator

### Implementation Plan

#### Step 1: Extend Orchestrator Interface

**File**: `worker/engines/orchestrator.ts`

**Changes**:
```typescript
export interface ProcessDocumentOptions {
  enabledEngines: EngineType[];

  // NEW: Filter connections to specific target documents
  targetDocumentIds?: string[];  // If provided, only find connections to these docs

  semanticSimilarity?: SemanticSimilarityOptions;
  contradictionDetection?: ContradictionDetectionOptions;
  thematicBridge?: ThematicBridgeOptions;
  onProgress?: ProgressCallback;
}

// Update each engine options interface
export interface SemanticSimilarityOptions {
  threshold: number;
  maxResultsPerChunk: number;
  crossDocumentOnly: boolean;
  targetDocumentIds?: string[];  // NEW: Filter candidates
}

export interface ContradictionDetectionOptions {
  minConceptOverlap: number;
  polarityThreshold: number;
  maxResultsPerChunk: number;
  crossDocumentOnly: boolean;
  targetDocumentIds?: string[];  // NEW: Filter candidates
}

export interface ThematicBridgeOptions {
  minImportance: number;
  minStrength: number;
  maxSourceChunks: number;
  maxCandidatesPerSource: number;
  batchSize: number;
  targetDocumentIds?: string[];  // NEW: Filter candidates
}
```

**In processDocument function** (~line 40):

```typescript
export async function processDocument(
  documentId: string,
  options: ProcessDocumentOptions
): Promise<ProcessDocumentResult> {

  // ... existing setup ...

  // Pass targetDocumentIds to each engine
  if (options.enabledEngines.includes('semantic_similarity')) {
    const engineOptions: SemanticSimilarityOptions = {
      ...options.semanticSimilarity,
      targetDocumentIds: options.targetDocumentIds  // NEW: Pass filter
    };

    const results = await semanticSimilarity.detect(sourceChunks, engineOptions);
    allConnections.push(...results);
  }

  // Same for contradiction_detection and thematic_bridge
}
```

#### Step 2: Update Semantic Similarity Engine

**File**: `worker/engines/semantic-similarity.ts`

**Changes**:
```typescript
export async function detect(
  sourceChunks: Chunk[],
  options: SemanticSimilarityOptions
): Promise<Connection[]> {

  const connections: Connection[] = [];

  for (const chunk of sourceChunks) {
    // Query pgvector for similar chunks
    const { data: candidates } = await supabase.rpc('match_chunks', {
      query_embedding: chunk.embedding,
      threshold: options.threshold,
      limit: options.maxResultsPerChunk
    });

    if (!candidates) continue;

    // NEW: Filter candidates by targetDocumentIds
    let filteredCandidates = candidates;
    if (options.targetDocumentIds && options.targetDocumentIds.length > 0) {
      const targetSet = new Set(options.targetDocumentIds);
      filteredCandidates = candidates.filter(c => targetSet.has(c.document_id));

      console.log(`[SemanticSimilarity] Filtered ${candidates.length} → ${filteredCandidates.length} candidates (target docs only)`);
    }

    // Cross-document filter (existing)
    if (options.crossDocumentOnly) {
      filteredCandidates = filteredCandidates.filter(c => c.document_id !== chunk.document_id);
    }

    // Create connections from filtered candidates
    for (const candidate of filteredCandidates) {
      connections.push({
        source_chunk_id: chunk.id,
        target_chunk_id: candidate.id,
        type: 'semantic_similarity',
        strength: candidate.similarity,
        // ...
      });
    }
  }

  return connections;
}
```

#### Step 3: Update Contradiction Detection Engine

**File**: `worker/engines/contradiction-detection.ts`

**Changes**:
```typescript
export async function detect(
  sourceChunks: Chunk[],
  options: ContradictionDetectionOptions
): Promise<Connection[]> {

  // Query all chunks for candidate pool
  const { data: allChunks } = await supabase
    .from('chunks')
    .select('id, document_id, concepts, emotional_tone');

  // NEW: Filter to target documents if specified
  let candidatePool = allChunks || [];
  if (options.targetDocumentIds && options.targetDocumentIds.length > 0) {
    const targetSet = new Set(options.targetDocumentIds);
    candidatePool = candidatePool.filter(c => targetSet.has(c.document_id));

    console.log(`[ContradictionDetection] Filtered to ${candidatePool.length} candidates (target docs only)`);
  }

  // Cross-document filter (existing)
  if (options.crossDocumentOnly) {
    const sourceDocIds = new Set(sourceChunks.map(c => c.document_id));
    candidatePool = candidatePool.filter(c => !sourceDocIds.has(c.document_id));
  }

  // ... rest of contradiction detection logic with candidatePool
}
```

#### Step 4: Update Thematic Bridge Engine

**File**: `worker/engines/thematic-bridge.ts`

**Changes**:
```typescript
export async function detect(
  sourceChunks: Chunk[],
  options: ThematicBridgeOptions
): Promise<Connection[]> {

  // Query candidate chunks (importance > 0.6, cross-document)
  const { data: candidates } = await supabase
    .from('chunks')
    .select('*')
    .gte('importance_score', options.minImportance);

  // NEW: Filter to target documents if specified
  let filteredCandidates = candidates || [];
  if (options.targetDocumentIds && options.targetDocumentIds.length > 0) {
    const targetSet = new Set(options.targetDocumentIds);
    filteredCandidates = filteredCandidates.filter(c => targetSet.has(c.document_id));

    console.log(`[ThematicBridge] Filtered to ${filteredCandidates.length} candidates (target docs only)`);
  }

  // IMPORTANT: This reduces AI calls significantly!
  // Instead of processing 40 batches (all docs), might only process 5-10 (newer docs)

  // ... rest of thematic bridge logic with filteredCandidates
}
```

#### Step 5: Update Reprocess Connections Handler

**File**: `worker/handlers/reprocess-connections.ts`

**Remove warning** (lines 227-228), **add proper filtering**:

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
    throw new Error(`Failed to query newer documents: ${newerError.message}`);
  }

  const newerDocIds = newerDocs?.map(d => d.id) || [];
  console.log(`[ReprocessConnections] Found ${newerDocIds.length} newer documents`);

  if (newerDocIds.length === 0) {
    console.log(`[ReprocessConnections] No newer documents found, skipping reprocessing`);
    await updateProgress(100, 'complete', 'No new connections to add');

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          ...result,
          connectionsAfter: connectionsBefore || 0
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    return;
  }

  // REMOVE: Warning about limitation
  // ADD: Pass targetDocumentIds to orchestrator
}

// Step 3: Call orchestrator with targetDocumentIds filter (if Add New mode)
await updateProgress(40, 'processing', 'Running connection detection engines');

const orchestratorResult = await processDocument(documentId, {
  enabledEngines: options.engines,

  // NEW: Add targetDocumentIds filter for Add New mode
  targetDocumentIds: options.mode === 'add_new' && newerDocs
    ? newerDocs.map((d: any) => d.id)
    : undefined,

  onProgress: async (percent, stage, details) => {
    const mappedPercent = 40 + Math.floor((percent / 100) * 50);
    await updateProgress(mappedPercent, stage, details);
  },
  semanticSimilarity: {
    threshold: 0.7,
    maxResultsPerChunk: 50,
    crossDocumentOnly: true,
    targetDocumentIds: options.mode === 'add_new' && newerDocs
      ? newerDocs.map((d: any) => d.id)
      : undefined  // NEW: Pass filter to engine
  },
  contradictionDetection: {
    minConceptOverlap: 0.5,
    polarityThreshold: 0.3,
    maxResultsPerChunk: 20,
    crossDocumentOnly: true,
    targetDocumentIds: options.mode === 'add_new' && newerDocs
      ? newerDocs.map((d: any) => d.id)
      : undefined  // NEW: Pass filter to engine
  },
  thematicBridge: {
    minImportance: 0.6,
    minStrength: 0.6,
    maxSourceChunks: 50,
    maxCandidatesPerSource: 10,
    batchSize: 5,
    targetDocumentIds: options.mode === 'add_new' && newerDocs
      ? newerDocs.map((d: any) => d.id)
      : undefined  // NEW: Pass filter to engine
  }
});
```

#### Step 6: Add Tests

**File**: `worker/__tests__/orchestrator.test.ts` (create if doesn't exist)

```typescript
describe('Orchestrator - targetDocumentIds filtering', () => {
  it('should only create connections to target documents', async () => {
    // Setup: 3 documents (A, B, C)
    // Document A processed on Day 1
    // Document B processed on Day 2
    // Document C processed on Day 3

    // Run: Process Document A with targetDocumentIds: [B.id, C.id]
    const result = await processDocument(docA.id, {
      enabledEngines: ['semantic_similarity'],
      targetDocumentIds: [docB.id, docC.id],
      semanticSimilarity: {
        threshold: 0.7,
        maxResultsPerChunk: 50,
        crossDocumentOnly: true,
        targetDocumentIds: [docB.id, docC.id]
      }
    });

    // Verify: All connections are to B or C (not to other docs)
    const { data: connections } = await supabase
      .from('connections')
      .select('*, target_chunk:chunks!target_chunk_id(document_id)')
      .eq('source_chunk_id', docA.chunks[0].id);

    expect(connections.every(c =>
      c.target_chunk.document_id === docB.id ||
      c.target_chunk.document_id === docC.id
    )).toBe(true);
  });

  it('should reduce AI calls in thematic bridge with targetDocumentIds', async () => {
    // Thematic bridge is expensive - verify filtering reduces calls
    const aiCallSpy = jest.spyOn(ollama, 'analyze');

    // Without filter: processes all documents
    await processDocument(docA.id, {
      enabledEngines: ['thematic_bridge'],
      thematicBridge: { /* no targetDocumentIds */ }
    });
    const callsWithoutFilter = aiCallSpy.mock.calls.length;

    aiCallSpy.mockClear();

    // With filter: only newer doc
    await processDocument(docA.id, {
      enabledEngines: ['thematic_bridge'],
      targetDocumentIds: [docB.id],
      thematicBridge: { targetDocumentIds: [docB.id] }
    });
    const callsWithFilter = aiCallSpy.mock.calls.length;

    // Should make fewer AI calls
    expect(callsWithFilter).toBeLessThan(callsWithoutFilter);
  });
});
```

**File**: `worker/handlers/__tests__/reprocess-connections.test.ts`

```typescript
describe('Reprocess Connections - Add New Mode', () => {
  it('should only add connections to newer documents', async () => {
    // Setup: Doc A (Oct 13), Doc B (Oct 14), Doc C (Oct 15)
    // Doc A has 10 chunks, Doc B has 15 chunks, Doc C has 12 chunks

    // Initial state: Doc A has 0 connections
    const initialCount = await getConnectionCount(docA.id);
    expect(initialCount).toBe(0);

    // Run: Reprocess Doc A in Add New mode
    await reprocessConnectionsHandler(supabase, {
      id: 'job-123',
      entity_id: docA.id,
      user_id: 'user-1',
      input_data: {
        mode: 'add_new',
        engines: ['semantic_similarity', 'thematic_bridge']
      }
    });

    // Verify: Connections created
    const finalCount = await getConnectionCount(docA.id);
    expect(finalCount).toBeGreaterThan(0);

    // Verify: ALL connections are to newer documents (B or C only)
    const { data: connections } = await supabase
      .from('connections')
      .select('*, target_chunk:chunks!target_chunk_id(document_id)')
      .or(`source_chunk_id.in.(${docA.chunkIds}),target_chunk_id.in.(${docA.chunkIds})`);

    const targetDocIds = connections.map(c => c.target_chunk.document_id);
    expect(targetDocIds.every(id => id === docB.id || id === docC.id)).toBe(true);
    expect(targetDocIds).not.toContain(docA.id);  // No self-connections
  });
});
```

---

## Implementation Checklist

### Phase 1: Storage Portability (3-4 hours)

- [ ] **Update TypeScript interfaces** (30 min)
  - [ ] `worker/types/storage.ts` - Add 5 new fields to `ChunkExportData`
  - [ ] Verify field types match database schema exactly

- [ ] **Update PDF processor** (45 min)
  - [ ] `worker/processors/pdf-processor.ts` - Include new fields in chunks.json save
  - [ ] Test with sample PDF in LOCAL mode
  - [ ] Test with sample PDF in CLOUD mode

- [ ] **Update EPUB processor** (45 min)
  - [ ] `worker/processors/epub-processor.ts` - Include new fields in chunks.json save
  - [ ] Test with sample EPUB

- [ ] **Update import handler** (30 min)
  - [ ] `worker/handlers/import-document.ts` - Read new fields with fallbacks
  - [ ] Test import of NEW export (has fields)
  - [ ] Test import of OLD export (missing fields) - backward compatibility

- [ ] **Update validation script** (30 min)
  - [ ] `worker/scripts/validate-storage-export.ts` - Add field validations
  - [ ] Validate enum values (chunker_type, metadata_confidence)
  - [ ] Test validation with complete export

- [ ] **Write tests** (45 min)
  - [ ] `worker/__tests__/storage-export.test.ts` - Test new fields saved
  - [ ] `worker/handlers/__tests__/import-document.test.ts` - Test new fields imported
  - [ ] Test backward compatibility (old exports still import)
  - [ ] Run `npm run test:critical` - must pass

### Phase 2: Add New Mode Implementation (2-3 hours)

- [ ] **Extend orchestrator interface** (20 min)
  - [ ] `worker/engines/orchestrator.ts` - Add `targetDocumentIds` to options
  - [ ] Add to each engine options interface

- [ ] **Update semantic similarity engine** (30 min)
  - [ ] `worker/engines/semantic-similarity.ts` - Filter candidates by targetDocumentIds
  - [ ] Log filtering stats
  - [ ] Test with 3-document scenario

- [ ] **Update contradiction detection engine** (30 min)
  - [ ] `worker/engines/contradiction-detection.ts` - Filter candidate pool
  - [ ] Log filtering stats
  - [ ] Test with 3-document scenario

- [ ] **Update thematic bridge engine** (30 min)
  - [ ] `worker/engines/thematic-bridge.ts` - Filter candidates (reduces AI calls!)
  - [ ] Log filtering stats and AI call reduction
  - [ ] Test with 3-document scenario

- [ ] **Update reprocess handler** (30 min)
  - [ ] `worker/handlers/reprocess-connections.ts` - Remove warning, pass targetDocumentIds
  - [ ] Verify newerDocIds passed to all 3 engines
  - [ ] Handle edge case: no newer documents (exit early)

- [ ] **Write tests** (45 min)
  - [ ] `worker/__tests__/orchestrator.test.ts` - Test targetDocumentIds filtering
  - [ ] `worker/handlers/__tests__/reprocess-connections.test.ts` - Test Add New mode
  - [ ] Verify AI call reduction with thematic bridge
  - [ ] Run `npm run test:full-validation` - must pass

### Phase 3: Integration Testing (30-45 min)

- [ ] **Manual test: Storage round-trip** (15 min)
  - [ ] Process document with recursive chunker
  - [ ] Export to ZIP
  - [ ] Delete from database
  - [ ] Import from ZIP
  - [ ] Verify `chunker_type = "recursive"` preserved
  - [ ] Verify `heading_path`, `metadata_confidence` preserved

- [ ] **Manual test: Add New mode** (20 min)
  - [ ] Process Doc A (older)
  - [ ] Process Doc B (newer)
  - [ ] Verify Doc A has 0 connections initially
  - [ ] Run "Add New" reprocessing on Doc A
  - [ ] Verify connections created ONLY to Doc B
  - [ ] Verify no connections to Doc A itself
  - [ ] Check logs: "Filtered to N newer documents"

- [ ] **Update T-018 checklist** (10 min)
  - [ ] Mark T-018 as ready for testing
  - [ ] Remove "KNOWN LIMITATION" warning
  - [ ] Document expected behavior

---

## Success Criteria

### Storage Portability
- [ ] All 5 new Chonkie fields saved to chunks.json
- [ ] Import preserves chunker_type, heading_path, metadata_* fields
- [ ] Old exports (missing fields) still import successfully (fallbacks work)
- [ ] Storage validation script passes for new exports
- [ ] Round-trip test: Export → Delete DB → Import → All fields match

### Add New Mode
- [ ] Add New mode only creates connections to documents with `created_at` > current document
- [ ] No connections created to same-age or older documents
- [ ] Thematic bridge makes fewer AI calls (e.g., 50 calls instead of 200)
- [ ] Logs show "Filtered X → Y candidates (target docs only)" for each engine
- [ ] T-018 test passes completely (no warnings)

---

## Dependencies

**Before starting**:
- Supabase running (`npx supabase start`)
- Worker running (`cd worker && npm run dev`)
- Database schema current (migration 050 applied)
- Test documents available (1 PDF, 1 EPUB)

**No external dependencies** - all changes are internal to worker module.

---

## Risk Assessment

**Low Risk** - These are additive changes:
- Storage schema adds fields (backward compatible via fallbacks)
- Orchestrator adds optional parameter (doesn't break existing calls)
- No breaking changes to public APIs

**Rollback Plan**:
- If Phase 1 fails: Old exports still work (fields are optional)
- If Phase 2 fails: Add New mode falls back to current behavior (processes all docs)

---

## Documentation Updates

After implementation:

- [ ] Update `docs/COMPLETE_PIPELINE_FLOW.md` - Note new fields in Stage 11 (Storage Export)
- [ ] Update `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` - Document new fields in schema
- [ ] Update `docs/portability/MANUAL_TESTING_CHECKLIST.md` - Mark T-018 as testable
- [ ] Add comments in `worker/types/storage.ts` explaining Chonkie fields

---

## Next Steps

1. **Review this plan** - Ensure architectural approach is correct
2. **Allocate time** - Block 4-6 hours for implementation
3. **Create feature branch** - `git checkout -b feature/chonkie-storage-and-add-new`
4. **Implement Phase 1** - Storage portability (critical for data integrity)
5. **Implement Phase 2** - Add New mode (feature completion)
6. **Run full test suite** - Both unit tests and manual testing
7. **Update T-018 checklist** - Mark as ready for validation
8. **Merge to main** - After all tests pass

**Estimated completion**: 1 session (4-6 hours focused work)
