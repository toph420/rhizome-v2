# Smart Metadata Transfer for Reprocessing - Implementation Plan

**Date**: 2025-10-27
**Status**: Proposed
**Priority**: Medium
**Estimated Effort**: 2-3 days

## Problem Statement

Current reprocessing behavior is wasteful:
- When a document is edited in Obsidian, ALL chunks are deleted and recreated
- ALL metadata (themes, concepts, emotions) is re-extracted, even for unchanged chunks
- For minor edits (formatting, typos), 95%+ of chunks are identical but still get re-enriched
- This costs 5-10 minutes of Ollama processing time per reprocessing

**Example**: Change 1 paragraph in a 200-page book → Re-enrich all 500 chunks unnecessarily

## Current State (Phase 1 - Implemented)

**File**: `worker/handlers/reprocess-document.ts`

**Current Flow**:
```typescript
1. Mark old chunks as is_current: false (line 100-106)
2. Create new chunks from edited markdown (lines 165-289)
3. Re-enrich ALL new chunks (lines 293-374) - 5-10 minutes
4. Generate embeddings for all chunks (lines 376-397)
5. Delete old chunks (lines 552-557)
```

**Skip Flags (Phase 1 - Completed)**:
- `enrichChunks=false` skips enrichment entirely (saves 5-10 min)
- `detectConnections=false` skips connection detection (saves 10-15 min)
- Used by default in Obsidian sync for formatting edits

**Limitation**: All-or-nothing approach - either enrich everything or enrich nothing

## Proposed Solution (Phase 2)

Use bulletproof matcher to identify unchanged chunks and transfer their metadata instead of re-enriching.

### High-Level Algorithm

```typescript
// 1. Fetch old chunks WITH metadata before marking not current
const oldChunksWithMetadata = await supabase
  .from('chunks')
  .select('id, content, start_offset, end_offset, themes, importance_score, summary, emotional_metadata, conceptual_metadata, domain_metadata, metadata_extracted_at, enrichments_detected')
  .eq('document_id', documentId)
  .eq('is_current', true)
  .order('chunk_index')

// 2. Mark old chunks as not current (existing code)
await supabase.from('chunks').update({ is_current: false })...

// 3. Create new chunks from edited markdown (existing code)
const newChunks = [...] // From Chonkie chunking

// 4. Use bulletproof matcher to find old → new mappings
const matchResult = await bulletproofMatch(newMarkdown, oldChunksWithMetadata, {
  enabledLayers: {
    layer1: true,  // Fuzzy matching
    layer2: true,  // Embedding similarity
    layer3: false, // Skip LLM (too expensive for this)
    layer4: false  // Skip interpolation (we want explicit matches only)
  },
  confidenceThreshold: 0.8  // Only transfer for high-confidence matches
})

// 5. Transfer metadata from matched old chunks to new chunks
const enrichedChunks = newChunks.map((newChunk, index) => {
  const match = matchResult.chunks.find(m =>
    m.start_offset >= newChunk.start_offset - 10 &&
    m.end_offset <= newChunk.end_offset + 10
  )

  if (match && match.confidence >= 0.8 && match.enrichments_detected) {
    // High-confidence match with existing metadata - reuse it
    console.log(`[MetadataTransfer] Chunk ${index}: Transferred (confidence=${match.confidence})`)
    return {
      ...newChunk,
      // Transfer metadata fields
      themes: match.themes,
      importance_score: match.importance_score,
      summary: match.summary,
      emotional_metadata: match.emotional_metadata,
      conceptual_metadata: match.conceptual_metadata,
      domain_metadata: match.domain_metadata,
      metadata_extracted_at: match.metadata_extracted_at,
      enrichments_detected: true,
      // Track transfer for debugging
      metadata_transferred_from: match.id,
      metadata_transfer_confidence: match.confidence,
      metadata_transfer_method: match.method // 'fuzzy', 'embedding', etc.
    }
  } else {
    // No match or low confidence - needs enrichment
    console.log(`[MetadataTransfer] Chunk ${index}: Needs enrichment (confidence=${match?.confidence || 0})`)
    return {
      ...newChunk,
      enrichments_detected: false,
      enrichment_pending: true
    }
  }
})

// 6. Only enrich chunks that weren't matched
const chunksNeedingEnrichment = enrichedChunks.filter(c => c.enrichment_pending)
const chunksTransferred = enrichedChunks.length - chunksNeedingEnrichment.length

console.log(`[MetadataTransfer] Summary:`)
console.log(`  - Total chunks: ${enrichedChunks.length}`)
console.log(`  - Metadata transferred: ${chunksTransferred} (${(chunksTransferred/enrichedChunks.length*100).toFixed(1)}%)`)
console.log(`  - Needs enrichment: ${chunksNeedingEnrichment.length} (${(chunksNeedingEnrichment.length/enrichedChunks.length*100).toFixed(1)}%)`)

// 7. Enrich only the unmatched chunks
if (enrichChunks && chunksNeedingEnrichment.length > 0) {
  console.log(`[MetadataTransfer] Enriching ${chunksNeedingEnrichment.length} chunks...`)
  await enrichMetadata(chunksNeedingEnrichment)
} else if (chunksNeedingEnrichment.length === 0) {
  console.log(`[MetadataTransfer] ✅ All chunks matched - no enrichment needed!`)
}
```

## Performance Analysis

### Scenario 1: Minor Edit (5% content changed)

**Examples**: Fix typo, adjust heading formatting, add footnote

**Current (with Phase 1 skip flags)**:
- Skip enrichment entirely: 5-10 minutes saved
- Manual enrichment later: 5-10 minutes for all 500 chunks

**With Phase 2 Smart Transfer**:
- Bulletproof matching: 30 seconds (match 475/500 chunks)
- Transfer metadata: instant
- Enrich 25 unmatched chunks: 30-60 seconds
- **Total: 1-2 minutes** (80-90% improvement over Phase 1 manual enrichment)

### Scenario 2: Medium Edit (25% content changed)

**Examples**: Rewrite section, restructure chapters, add new content

**Current**:
- Full enrichment: 5-10 minutes

**With Smart Transfer**:
- Match 375 chunks (75%): 30 seconds
- Enrich 125 unmatched chunks (25%): 1-3 minutes
- **Total: 2-4 minutes** (40-60% savings)

### Scenario 3: Major Edit (50%+ content changed)

**Examples**: Major rewrite, merge documents, restructure entire book

**Current**:
- Full enrichment: 5-10 minutes

**With Smart Transfer**:
- Match 250 chunks (50%): 30 seconds
- Enrich 250 unmatched chunks (50%): 2-5 minutes
- **Total: 3-6 minutes** (20-40% savings)

### Scenario 4: Formatting-Only Edit (0% content changed)

**Examples**: Add markdown formatting, fix line breaks, adjust whitespace

**Current**:
- Skip enrichment: 5-10 min saved, but metadata not available

**With Smart Transfer**:
- Match all 500 chunks (100%): 30 seconds
- Enrich 0 chunks: 0 seconds
- **Total: 30 seconds** (Near-instant reprocessing with metadata preserved!)

## Implementation Details

### Phase 2.1: Core Matching Logic (Day 1)

**File**: `worker/handlers/reprocess-document.ts`

**Changes**:
1. Fetch old chunks with metadata before marking not current (line ~95)
2. Pass old chunks to bulletproof matcher after new chunks created (line ~215)
3. Implement metadata transfer logic (new function)
4. Filter chunks needing enrichment (line ~295)
5. Only enrich filtered chunks instead of all chunks

**New Function**:
```typescript
/**
 * Transfer metadata from matched old chunks to new chunks
 *
 * @param newChunks - Newly created chunks from reprocessing
 * @param matchedOldChunks - Old chunks matched by bulletproof matcher
 * @param confidenceThreshold - Minimum confidence to transfer metadata (default: 0.8)
 * @returns Chunks with transferred metadata or marked for enrichment
 */
async function transferMetadataFromMatches(
  newChunks: any[],
  matchedOldChunks: any[],
  confidenceThreshold: number = 0.8
): Promise<{
  chunks: any[]
  transferred: number
  needsEnrichment: number
}> {
  const enrichedChunks = []
  let transferred = 0
  let needsEnrichment = 0

  for (const newChunk of newChunks) {
    // Find best match by offset proximity and confidence
    const match = findBestMatch(newChunk, matchedOldChunks, confidenceThreshold)

    if (match && match.enrichments_detected) {
      // Transfer metadata
      enrichedChunks.push({
        ...newChunk,
        themes: match.themes,
        importance_score: match.importance_score,
        summary: match.summary,
        emotional_metadata: match.emotional_metadata,
        conceptual_metadata: match.conceptual_metadata,
        domain_metadata: match.domain_metadata,
        metadata_extracted_at: match.metadata_extracted_at,
        enrichments_detected: true,
        metadata_transferred_from: match.id,
        metadata_transfer_confidence: match.confidence
      })
      transferred++
    } else {
      // Needs enrichment
      enrichedChunks.push({
        ...newChunk,
        enrichments_detected: false,
        enrichment_pending: true
      })
      needsEnrichment++
    }
  }

  return { chunks: enrichedChunks, transferred, needsEnrichment }
}

/**
 * Find best matching old chunk for a new chunk
 */
function findBestMatch(
  newChunk: any,
  matchedOldChunks: any[],
  confidenceThreshold: number
): any | null {
  let bestMatch = null
  let bestScore = 0

  for (const oldChunk of matchedOldChunks) {
    // Check if offsets overlap
    const overlapStart = Math.max(newChunk.start_offset, oldChunk.start_offset)
    const overlapEnd = Math.min(newChunk.end_offset, oldChunk.end_offset)
    const overlap = Math.max(0, overlapEnd - overlapStart)

    if (overlap === 0) continue

    // Calculate overlap ratio
    const newChunkLength = newChunk.end_offset - newChunk.start_offset
    const overlapRatio = overlap / newChunkLength

    // Score = confidence * overlap ratio
    const score = oldChunk.confidence * overlapRatio

    if (score > bestScore && oldChunk.confidence >= confidenceThreshold) {
      bestScore = score
      bestMatch = oldChunk
    }
  }

  return bestMatch
}
```

### Phase 2.2: Logging & Monitoring (Day 2)

**Add detailed transfer statistics**:
```typescript
console.log(`[MetadataTransfer] Transfer Summary:`)
console.log(`  Total chunks: ${newChunks.length}`)
console.log(`  High-confidence matches (>0.8): ${highConfidenceMatches}`)
console.log(`  Medium-confidence matches (0.6-0.8): ${mediumConfidenceMatches}`)
console.log(`  Low/no matches (<0.6): ${lowConfidenceMatches}`)
console.log(`  Metadata transferred: ${transferred} (${transferRate}%)`)
console.log(`  Needs enrichment: ${needsEnrichment} (${enrichmentRate}%)`)
console.log(`  Estimated time saved: ${timeSaved} seconds`)
```

**Add transfer tracking fields to chunks table** (optional migration):
```sql
ALTER TABLE chunks
  ADD COLUMN metadata_transferred_from UUID REFERENCES chunks(id),
  ADD COLUMN metadata_transfer_confidence FLOAT,
  ADD COLUMN metadata_transfer_method TEXT;

CREATE INDEX idx_chunks_metadata_transfer
  ON chunks(metadata_transferred_from)
  WHERE metadata_transferred_from IS NOT NULL;
```

### Phase 2.3: Edge Case Handling (Day 3)

**Edge Cases to Handle**:

1. **Partial Overlaps**: Old chunk spans multiple new chunks
   - **Solution**: Transfer to chunk with highest overlap ratio
   - **Alternative**: Mark all partial overlaps for enrichment (conservative)

2. **Boundary Shifts**: Content identical but offsets shifted by whitespace
   - **Solution**: Bulletproof matcher handles this (fuzzy matching layer)
   - **Verification**: Check content similarity, not just offsets

3. **Chunking Strategy Changed**: User switched from token → semantic chunking
   - **Solution**: Detect strategy change, skip transfer (force full enrichment)
   - **Check**: Compare `chunker_type` field before matching

4. **Metadata Schema Changed**: New enrichment fields added
   - **Solution**: Transfer existing fields, mark for partial enrichment
   - **Check**: Validate metadata schema version

5. **Content Drift**: Chunk content changed 20%, is metadata still valid?
   - **Solution**: Use confidence threshold (0.8 = max 20% difference)
   - **Tuning**: Make threshold configurable for testing

**Implementation**:
```typescript
// Strategy change detection
if (oldChunks[0]?.chunker_type !== newChunkerStrategy) {
  console.log(`[MetadataTransfer] Chunking strategy changed (${oldChunks[0]?.chunker_type} → ${newChunkerStrategy})`)
  console.log(`[MetadataTransfer] Skipping transfer - forcing full enrichment`)
  return { chunks: newChunks.map(c => ({ ...c, enrichment_pending: true })), transferred: 0, needsEnrichment: newChunks.length }
}

// Partial overlap handling
if (overlapRatio < 0.5) {
  console.log(`[MetadataTransfer] Chunk ${newChunk.chunk_index}: Partial overlap (${overlapRatio}) - skipping transfer`)
  continue
}

// Content drift detection
if (match.confidence < confidenceThreshold) {
  console.log(`[MetadataTransfer] Chunk ${newChunk.chunk_index}: Low confidence (${match.confidence}) - needs enrichment`)
  continue
}
```

## Configuration & Flags

**Add new option to reprocessDocument()**:
```typescript
export async function reprocessDocument(
  documentId: string,
  supabaseClient?: any,
  jobId?: string,
  enrichChunks: boolean = true,
  detectConnections: boolean = true,
  transferMetadata: boolean = true,  // NEW: Enable smart metadata transfer
  transferConfidenceThreshold: number = 0.8  // NEW: Configurable threshold
): Promise<ReprocessResults>
```

**Obsidian sync configuration**:
```typescript
// Fast mode (current): Skip enrichment entirely
const recovery = await reprocessDocument(documentId, supabase, jobId, false, false)

// Smart mode (new): Transfer metadata where possible, enrich gaps
const recovery = await reprocessDocument(documentId, supabase, jobId, true, false, true, 0.8)
```

**UI Control** (future enhancement):
- Admin Panel → Enrichments Tab → "Smart Reprocessing Mode" toggle
- Document-level setting: "Transfer metadata during reprocessing"
- Confidence threshold slider (0.6 - 0.95)

## Testing Strategy

### Unit Tests

**File**: `worker/handlers/__tests__/metadata-transfer.test.ts`

```typescript
describe('Smart Metadata Transfer', () => {
  test('should transfer metadata for high-confidence matches', async () => {
    const oldChunks = [{ content: 'Test content', confidence: 0.9, themes: ['test'] }]
    const newChunks = [{ content: 'Test content', start_offset: 0 }]

    const result = await transferMetadataFromMatches(newChunks, oldChunks, 0.8)

    expect(result.transferred).toBe(1)
    expect(result.chunks[0].themes).toEqual(['test'])
  })

  test('should enrich chunks with low-confidence matches', async () => {
    const oldChunks = [{ content: 'Old content', confidence: 0.5 }]
    const newChunks = [{ content: 'New content', start_offset: 0 }]

    const result = await transferMetadataFromMatches(newChunks, oldChunks, 0.8)

    expect(result.needsEnrichment).toBe(1)
    expect(result.chunks[0].enrichment_pending).toBe(true)
  })

  test('should handle partial overlaps correctly', async () => {
    // Test case where old chunk spans multiple new chunks
    // Verify highest-overlap chunk gets metadata
  })

  test('should skip transfer when chunking strategy changed', async () => {
    const oldChunks = [{ chunker_type: 'token', confidence: 0.9 }]
    const newChunks = [{ chunker_type: 'semantic' }]

    // Verify all chunks marked for enrichment
  })
})
```

### Integration Tests

**Scenarios**:
1. Minor edit (5% change) → Verify 95% transfer rate
2. Major edit (50% change) → Verify 50% transfer rate
3. Formatting-only edit → Verify 100% transfer rate
4. Strategy change → Verify 0% transfer rate (force enrichment)

**Validation**:
- Check transfer statistics in logs
- Verify enrichment only runs on unmatched chunks
- Compare metadata between old and new chunks for transferred entries
- Ensure embeddings still generated for all chunks (needed for connections)

### Manual Testing Checklist

- [ ] Edit document in Obsidian (minor change)
- [ ] Verify reprocessing completes in <2 minutes
- [ ] Check logs show high transfer rate (>80%)
- [ ] Verify transferred metadata matches old chunks
- [ ] Verify enrichment only runs on changed chunks
- [ ] Test with major edit (verify partial transfer)
- [ ] Test with chunking strategy change (verify full enrichment)
- [ ] Verify annotations still recovered correctly
- [ ] Check ProcessingDock shows accurate progress

## Rollout Plan

### Stage 1: Implementation (Week 1)
- [ ] Implement core matching logic
- [ ] Add transfer statistics logging
- [ ] Write unit tests
- [ ] Test locally with sample documents

### Stage 2: Testing (Week 2)
- [ ] Integration tests
- [ ] Manual testing with real documents
- [ ] Edge case validation
- [ ] Performance benchmarking

### Stage 3: Opt-In Beta (Week 3)
- [ ] Add `transferMetadata` flag (default: false)
- [ ] Enable for Obsidian sync only (safe testing ground)
- [ ] Monitor transfer rates and performance
- [ ] Gather feedback on metadata accuracy

### Stage 4: General Availability (Week 4)
- [ ] Enable by default for all reprocessing
- [ ] Add UI controls in Admin Panel
- [ ] Document behavior in user guide
- [ ] Create troubleshooting guide for edge cases

## Risks & Mitigations

### Risk 1: Stale Metadata

**Problem**: Transferred metadata might not reflect actual content changes

**Mitigation**:
- Use high confidence threshold (0.8)
- Track transfer confidence in database
- Add "Re-enrich All" button in UI to force full enrichment
- Log transfer statistics for monitoring

### Risk 2: Performance Regression

**Problem**: Bulletproof matching might be slower than direct enrichment for major edits

**Mitigation**:
- Benchmark matching performance
- Add timeout for matching phase (fall back to full enrichment)
- Make transfer optional via flag
- Skip transfer if >50% chunks need enrichment anyway

### Risk 3: Complex Edge Cases

**Problem**: Partial overlaps, boundary shifts, strategy changes create bugs

**Mitigation**:
- Conservative matching (high threshold)
- Comprehensive test suite
- Detailed logging for debugging
- Fallback to full enrichment on errors

### Risk 4: Annotation Recovery Conflicts

**Problem**: Metadata transfer might interfere with annotation recovery logic

**Mitigation**:
- Transfer happens before annotation recovery (no conflict)
- Annotation recovery uses content, not metadata
- Test annotation recovery with transferred metadata

## Success Metrics

**Performance**:
- Transfer rate >80% for minor edits
- Reprocessing time <2 minutes for formatting-only edits
- Time savings 50-80% compared to full enrichment

**Quality**:
- Transferred metadata accuracy >95% (validated by confidence scores)
- No increase in annotation recovery failures
- Zero data loss incidents

**Adoption**:
- Used in >50% of Obsidian sync operations
- Positive user feedback on speed improvement
- <5% forced re-enrichments due to transfer issues

## Future Enhancements

### Phase 3: Embedding Transfer

**Problem**: We still regenerate embeddings for all chunks (3-5 min)

**Solution**: Transfer embeddings along with metadata for matched chunks

**Benefit**: Additional 3-5 minutes saved

**Complexity**: High - embeddings depend on exact content match

### Phase 4: Partial Overlap Splitting

**Problem**: When old chunk spans multiple new chunks, we only transfer to one

**Solution**: Split metadata proportionally based on overlap ratios

**Example**:
- Old chunk: "Section A. Section B." (importance: 0.8)
- New chunks: "Section A." (0.4) + "Section B." (0.4)

### Phase 5: Content-Aware Transfer

**Problem**: Confidence threshold is binary (transfer or don't)

**Solution**: Adjust metadata based on content changes detected

**Example**:
- 90% match: Transfer all metadata
- 70% match: Transfer themes, re-extract emotions (content tone may have changed)
- 50% match: Full re-enrichment

## Related Work

**Similar Implementations**:
- Docling → Chonkie metadata transfer (`worker/lib/chonkie/metadata-transfer.ts`)
- Annotation recovery during reprocessing (`worker/handlers/recover-annotations.ts`)
- Connection remapping (`worker/handlers/remap-connections.ts`)

**Key Differences**:
- This transfer is **metadata → metadata** (same domain)
- Annotation recovery is **position → position** (different domain)
- Docling transfer is **structure → semantic** (different domains)

**Lessons Learned from Existing Systems**:
- Confidence scoring is critical (from bulletproof matcher)
- Logging transfer statistics helps debugging (from all recovery systems)
- Conservative thresholds prevent stale data (from annotation recovery)
- Fallback to full processing on errors (from all systems)

## Open Questions

1. **Confidence Threshold**: Should it be 0.8 (conservative) or 0.7 (aggressive)?
   - **Answer**: Start at 0.8, make configurable, tune based on data

2. **Embeddings Transfer**: Should we transfer embeddings too?
   - **Answer**: Phase 3 enhancement - needs careful validation

3. **UI Exposure**: Should users control transfer behavior?
   - **Answer**: Yes, but default to smart transfer (most users won't need to change)

4. **Storage Impact**: Do we keep transfer tracking fields forever?
   - **Answer**: Optional - can clean up after validation period

5. **Chunking Strategy Changes**: Auto-detect or require user flag?
   - **Answer**: Auto-detect by comparing `chunker_type` field

## References

- Bulletproof Matcher: `worker/lib/local/bulletproof-matcher.ts`
- Metadata Transfer (Docling): `worker/lib/chonkie/metadata-transfer.ts`
- Current Reprocessing: `worker/handlers/reprocess-document.ts`
- Annotation Recovery: `worker/handlers/recover-annotations.ts`
- Connection Remapping: `worker/handlers/remap-connections.ts`
- Phase 1 Implementation: `thoughts/plans/2025-10-26_chunk-enrichment-skip.md`
