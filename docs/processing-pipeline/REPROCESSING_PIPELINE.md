# Document Reprocessing Pipeline

**Last Updated**: 2025-10-18
**Handler**: `worker/handlers/reprocess-document.ts`
**Purpose**: Recover annotations and connections after document edits (Obsidian sync, manual reprocessing)

---

## Overview

The reprocessing pipeline handles document updates while preserving user work (annotations and connections). It uses a **transaction-safe pattern** with batch IDs to ensure data integrity and enable rollback on failure.

### When Reprocessing is Triggered

1. **Obsidian Sync** (`obsidian-sync` job type)
   - User edits markdown in Obsidian vault
   - Syncs changes back to Rhizome
   - Triggers reprocessing with annotation recovery

2. **Manual Reprocessing** (`reprocess-document` job type)
   - User manually triggers reprocessing
   - Typically used after major edits or fixes

3. **Connection Reprocessing** (`reprocess_connections` job type)
   - Reprocesses only connections, not chunks
   - Three modes: Reprocess All, Smart Mode, Add New

---

## Transaction-Safe Pattern

**Core Principle**: Never lose data. Always maintain ability to rollback.

### Batch ID System

```typescript
const reprocessingBatch = new Date().toISOString()
// Example: "2025-10-18T06:46:05.953Z"
```

Every reprocessing attempt gets a unique batch ID used to:
- Tag new chunks during transaction
- Query correct chunks during collision detection
- Enable rollback on failure (delete by batch ID)

### Chunk States During Reprocessing

```
Before:     is_current: true,  reprocessing_batch: null
Step 1:     is_current: false, reprocessing_batch: null        (old chunks marked)
Step 2:     is_current: false, reprocessing_batch: "2025..."   (new chunks created)
Step 7:     is_current: false, reprocessing_batch: "2025..."   (collision detection)
Step 10:    is_current: true,  reprocessing_batch: "2025..."   (committed)
Cleanup:    Deleted            (old chunks removed)
```

**Why this matters**: During collision detection (Step 7), new chunks are still `is_current: false`, so engines need to query by `reprocessing_batch` instead.

---

## 10-Step Reprocessing Pipeline

### **Step 1: Mark Old Chunks** (5-15%)

```typescript
await supabase
  .from('chunks')
  .update({ is_current: false })
  .eq('document_id', documentId)
  .eq('is_current', true)
```

**Purpose**: Transaction safety - old chunks preserved for rollback

---

### **Step 2: Fetch Edited Markdown** (10%)

```typescript
const { data: blob } = await supabase.storage
  .from('documents')
  .download(document.markdown_path)

const newMarkdown = await blob.text()
```

**Source**: Supabase Storage (`documents/{userId}/{documentId}/content.md`)

---

### **Step 3: Query Original Chunker Strategy** (20-22%)

```typescript
const { data: existingChunk } = await supabase
  .from('chunks')
  .select('chunker_type')
  .eq('document_id', documentId)
  .eq('is_current', false)  // Query old chunks we just marked
  .limit(1)
  .single()

const chunkerStrategy = existingChunk?.chunker_type || 'recursive'
```

**Purpose**: Preserve user's original chunking choice across reprocessing

**Fallback**: `hybrid → recursive` (HybridChunker is deprecated)

---

### **Step 4: Check for Cached Docling Chunks** (25%)

```typescript
const cacheResult = await loadCachedChunksRaw(supabase, documentId)
const hasCachedChunks = !!cacheResult
```

**For PDF/EPUB**: Cached chunks exist (Docling extraction metadata)
**For Markdown**: No cached chunks (markdown_asis source)

---

### **Step 5: Run Chonkie Chunking** (27-32%)

```typescript
const chonkieChunks = await chunkWithChonkie(newMarkdown, {
  chunker_type: chunkerStrategy,
  timeout: 300000
})
```

**CRITICAL**: Always use Chonkie, never CLOUD mode AI chunking.

**Strategies**: `recursive`, `semantic`, `token`, `sentence`, `late`, `code`, `neural`, `slumber`, `table`

---

### **Step 6: Transfer Docling Metadata** (32-40%)

```typescript
if (hasCachedChunks) {
  // Run bulletproof matcher
  const matchResult = await bulletproofMatch(newMarkdown, cachedDoclingChunks)

  // Transfer metadata from Docling chunks → Chonkie chunks
  enrichedChunks = await transferMetadataToChonkieChunks(
    chonkieChunks,
    matchResult.chunks,
    documentId
  )
} else {
  // Markdown source - use Chonkie chunks directly
  enrichedChunks = chonkieChunks
}
```

**5-Layer Bulletproof Matching**:
1. Exact match
2. Enhanced fuzzy match
3. Embedding similarity
4. LLM-assisted matching
5. Interpolation (100% recovery)

**Result**: Chonkie chunks with Docling structural metadata (page numbers, headings, bboxes)

---

### **Step 7: Metadata Enrichment** (45-55%)

```typescript
const metadataMap = await extractMetadataBatch(batchInput, {
  onProgress: (processed) => updateProgress(...)
})
```

**PydanticAI + Ollama**: Extract themes, importance, summary, emotional metadata, concepts, domain

**Batch Size**: 10 chunks per batch

---

### **Step 8: Local Embeddings** (55-65%)

```typescript
const embeddings = await generateEmbeddingsLocal(chunkContents)
```

**Transformers.js**: 768-dimensional vectors, zero API cost

**Fallback**: Gemini embeddings if local fails

---

### **Step 9: Insert New Chunks** (65-73%)

```typescript
const newChunksToInsert = aiChunks.map((chunk, index) => ({
  document_id: documentId,
  chunk_index: index,
  content: chunk.content,
  // ... metadata fields ...
  embedding: embeddings[index],
  is_current: false,  // ✅ Transaction safety
  reprocessing_batch: reprocessingBatch  // ✅ Tag for rollback
}))

const { data: insertedChunks } = await supabase
  .from('chunks')
  .insert(newChunksToInsert)
  .select('id, document_id, chunk_index, start_offset, end_offset, content, embedding, is_current')
```

**Key Fields**:
- `is_current: false` - Not committed yet
- `reprocessing_batch: <timestamp>` - Enables rollback and correct querying

---

### **Step 10: Collision Detection** (75-77%)

```typescript
await processDocument(documentId, {
  reprocessingBatch: reprocessingBatch  // ✅ Pass batch ID
})
```

**CRITICAL FIX (2025-10-18)**: Engines now query by `reprocessingBatch` instead of `is_current: true`.

**3 Engines**:
1. **Semantic Similarity** (25% weight)
2. **Contradiction Detection** (40% weight)
3. **Thematic Bridge** (35% weight)

**Why batch ID matters**: New chunks are still `is_current: false` during collision detection, so engines need to know to query by batch ID.

---

### **Step 11: Annotation Recovery** (80-85%)

```typescript
const annotationResults = await recoverAnnotations(
  documentId,
  newMarkdown,
  newChunks as Chunk[],
  supabase
)
```

**Recovery Levels**:
- **Success**: High confidence fuzzy match (exact or near-exact position)
- **Needs Review**: Moderate confidence match (text found but position uncertain)
- **Lost**: No match found

**Fuzzy Matching Algorithm**:
1. Exact character offset match
2. Text content similarity
3. Chunk boundary tolerance
4. Context window matching

**Recovery Rate**: Typically 90-100%

---

### **Step 12: Connection Remapping** (88-92%)

```typescript
connectionResults = await remapConnections(
  documentId,
  newChunks as Chunk[],
  supabase
)
```

**Strategy**:
1. Query old chunks with embeddings
2. Query verified connections (user_validated: true)
3. For each connection, find best match in new chunks using cosine similarity
4. Classify by similarity:
   - **≥0.95**: Auto-remap (high confidence)
   - **0.85-0.95**: Needs review (medium confidence)
   - **<0.85**: Lost (low confidence)

**Embedding-Based Matching**:
```typescript
const similarity = cosineSimilarity(oldChunkEmbedding, newChunkEmbedding)
```

---

### **Step 13: Commit Changes** (95-100%)

```typescript
// Set new chunks as current
await supabase
  .from('chunks')
  .update({ is_current: true })
  .eq('reprocessing_batch', reprocessingBatch)

// Delete ALL old chunks
await supabase
  .from('chunks')
  .delete()
  .eq('document_id', documentId)
  .eq('is_current', false)

// Update document status
await supabase
  .from('documents')
  .update({ processing_status: 'completed' })
  .eq('id', documentId)
```

**Simple Cleanup**: Delete any chunk where `is_current: false` for this document.

---

## Error Handling & Rollback

### Rollback on Failure

```typescript
catch (error) {
  // Delete new chunks by batch ID
  await supabase
    .from('chunks')
    .delete()
    .eq('reprocessing_batch', reprocessingBatch)

  // Restore old chunks
  await supabase
    .from('chunks')
    .update({ is_current: true })
    .eq('document_id', documentId)
    .eq('is_current', false)

  // Mark document as failed
  await supabase
    .from('documents')
    .update({
      processing_status: 'failed',
      processing_error: error.message
    })
    .eq('id', documentId)
}
```

**Rollback Guarantees**:
- ✅ No data loss
- ✅ Original chunks restored
- ✅ Annotations preserved
- ✅ Connections preserved

---

## Non-Blocking Operations

### Collision Detection (Step 10)

```typescript
try {
  await processDocument(documentId, { reprocessingBatch })
} catch (error) {
  console.error('[ReprocessDocument] ⚠️  Collision detection failed:', error)
  console.log('[ReprocessDocument] Continuing with annotation recovery')
}
```

**Philosophy**: Don't let connection failures block annotation recovery. Connections can be rebuilt later.

### Connection Remapping (Step 12)

```typescript
try {
  connectionResults = await remapConnections(...)
} catch (error) {
  console.error('[ReprocessDocument] ⚠️  Connection remapping failed:', error)
  connectionResults = { success: [], needsReview: [], lost: [] }
}
```

**Philosophy**: Even if connection remapping fails, committed annotations are still valuable.

---

## Critical Bug Fix (2025-10-18)

### **The Bug**: Collision Detection Processing 2x Chunks

**Problem**: During reprocessing, collision detection was processing both old and new chunks because engines didn't filter by `is_current` or `reprocessing_batch`.

**Example**:
```
[ReprocessDocument] Inserted 7 new chunks
[SemanticSimilarity] Processing 15 chunks  ❌ (7 new + 8 old)
```

### **Root Cause**

1. **Engine Queries**: Missing `is_current: true` filter
2. **Database Function**: `match_chunks()` missing `is_current: true` filter
3. **Context Missing**: Engines didn't know they were in "reprocessing mode"

### **The Fix**

**Migration 053**: Added `is_current: true` to `match_chunks()` function

**All 3 Engines**: Added conditional logic
```typescript
if (config.reprocessingBatch) {
  query = query.eq('reprocessing_batch', config.reprocessingBatch);
} else {
  query = query.eq('is_current', true);
}
```

**Orchestrator**: Pass batch ID to engines
```typescript
await processDocument(documentId, {
  reprocessingBatch: reprocessingBatch
})
```

**Result**:
```
[ReprocessDocument] Inserted 7 new chunks
[SemanticSimilarity] Processing 7 chunks  ✅ (correct!)
```

---

## Performance Characteristics

### Execution Time (M1 Max 64GB)

| Document Size | Chunk Count | Reprocessing Time |
|---------------|-------------|-------------------|
| Small (3 chunks) | 3 | 6-10 minutes |
| Medium (50 chunks) | 50 | 15-25 minutes |
| Large (382 chunks) | 382 | 60-80 minutes |

**Bottlenecks**:
1. **Metadata Enrichment** (45-55%): PydanticAI + Ollama (10 chunks/batch)
2. **Local Embeddings** (55-65%): Transformers.js (768d vectors)
3. **Collision Detection** (75-77%): 3 engines with AI calls

### Cost Analysis

**CLOUD Mode** (Gemini):
- Chunking: ~$0.20 per document
- Embeddings: ~$0.10 per document
- **Total**: ~$0.30 per reprocessing

**LOCAL Mode** (Ollama + Transformers.js):
- Chunking: $0.00 (Chonkie)
- Metadata: $0.00 (local Ollama)
- Embeddings: $0.00 (local Transformers.js)
- **Total**: $0.00 per reprocessing ✅

---

## Best Practices

### 1. Always Use Chonkie for Reprocessing

```typescript
// ✅ CORRECT
const chonkieChunks = await chunkWithChonkie(newMarkdown, {
  chunker_type: chunkerStrategy
})

// ❌ WRONG (unreliable AI chunking)
const aiChunks = await geminiSemanticChunking(newMarkdown)
```

**Why**: Consistent chunk boundaries across reprocessing, preserves user's chunking strategy.

### 2. Preserve Chunker Strategy

```typescript
// ✅ Query original strategy
const chunkerStrategy = existingChunk?.chunker_type || 'recursive'

// ❌ Hard-code chunker
const chunkerStrategy = 'hybrid'  // Wrong! Ignores user's choice
```

### 3. Use Batch IDs for Transaction Safety

```typescript
// ✅ Tag for rollback
{ is_current: false, reprocessing_batch: reprocessingBatch }

// ❌ No rollback capability
{ is_current: false }
```

### 4. Pass Batch ID to Orchestrator

```typescript
// ✅ Engines query correct chunks
await processDocument(documentId, { reprocessingBatch })

// ❌ Engines query ALL chunks (bug!)
await processDocument(documentId)
```

### 5. Always Commit (Let User Review)

```typescript
// ✅ Commit even with low recovery rate
console.log('[ReprocessDocument] ✅ Committing changes (user can review via UI)')
await commitChanges()

// ❌ Rollback on low recovery rate
if (recoveryRate < 0.9) {
  throw new Error('Recovery rate too low')
}
```

**Philosophy**: Committed annotations with flags are better than lost annotations.

---

## Monitoring & Debugging

### Key Logs to Watch

```
[ReprocessDocument] Starting for document <id>
[ReprocessDocument] Batch ID: 2025-10-18T06:46:05.953Z
[ReprocessDocument] Querying original chunker strategy...
[ReprocessDocument] Original chunker strategy: hybrid → Using: recursive
[ReprocessDocument] No cached chunks (markdown source) - will use Chonkie only
[ReprocessDocument] Running Chonkie chunking with recursive strategy...
[ReprocessDocument] Chonkie created 7 chunks using recursive strategy
[ReprocessDocument] Inserted 7 new chunks
[SemanticSimilarity] Processing 7 chunks  ← Should match inserted count!
[ReprocessDocument] Recovery stats:
  - Success: 4
  - Needs review: 0
  - Lost: 0
  - Rate: 100.0%
[RemapConnections] Results:
  ✅ Success: 0
  ⚠️  Needs Review: 0
  ❌ Lost: 3
[ReprocessDocument] ✅ Complete in 384.6s
```

### Common Issues

**Issue**: Collision detection processing 2x chunks
```
[SemanticSimilarity] Processing 15 chunks  ❌
```
**Fix**: Verify migration 053 applied, engines query by `reprocessing_batch`

**Issue**: Lost connections (0.0% similarity)
```
[RemapConnections] ❌ Lost (0.0%): thematic_bridge
```
**Debug**: Check if `newChunks` has embeddings, verify cosine similarity calculation

**Issue**: Annotations marked as "needs review" instead of "success"
```
  - Success: 0
  - Needs review: 2
```
**Analysis**: Moderate confidence matches, text found but position uncertain. Lower threshold or improve fuzzy matching.

---

## Future Improvements

### 1. Incremental Reprocessing

**Current**: Reprocess entire document
**Future**: Detect changed sections, only reprocess affected chunks

### 2. Streaming Progress Updates

**Current**: Polling every 5 seconds
**Future**: WebSocket real-time updates

### 3. Parallel Metadata Enrichment

**Current**: Sequential batches (10 chunks/batch)
**Future**: Parallel batches with concurrency control

### 4. Connection Remapping Optimization

**Current**: N queries for candidates
**Future**: Single batch query with pgvector

### 5. Annotation Recovery ML Model

**Current**: Fuzzy matching algorithm
**Future**: Fine-tuned model for position prediction

---

## Related Documentation

- **Processing Pipeline**: `docs/PROCESSING_PIPELINE.md` - Initial document processing
- **Chonkie Integration**: `docs/processing-pipeline/chonkie-integration.md` - Chunking strategies
- **Bulletproof Matching**: `docs/processing-pipeline/bulletproof-metadata-extraction.md` - Metadata transfer
- **ECS System**: `docs/ECS_IMPLEMENTATION.md` - Annotation storage
- **Connection Detection**: `worker/engines/README.md` - 3-engine system

---

**Version**: 1.0
**Last Updated**: 2025-10-18
**Maintainer**: Rhizome V2 Team
