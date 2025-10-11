# Worker Bug Report: Chunk Offset Mismatch

**Date**: 2025-10-01
**Severity**: High (blocks Phase 2 virtualized reader)
**Status**: Diagnosed, workaround available

## Problem Summary

Chunks stored in database have **incorrect `start_offset` and `end_offset` values**. The offsets don't match where the chunk content actually appears in the markdown file.

## Evidence

Document: `3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff` ("The-Solar-Anus")

| Chunk | Content Length | Stored Offset Span | Actual Location | Error |
|-------|----------------|-------------------|-----------------|-------|
| 0 | 1284 chars | 789 chars | 18-1302 | -495 chars (-39%) |
| 1 | 2436 chars | 1356 chars | 1369-3804 | -1080 chars (-44%) |
| 2 | 2252 chars | 1215 chars | 3871-6123 | -1037 chars (-46%) |
| 7 | 7542 chars | 4500 chars | 15708-23567 | -3042 chars (-40%) |
| 8 | 22268 chars | 8822 chars | 23590-46623 | -13446 chars (-60%) |

**Pattern**: Stored offset spans are consistently **30-60% smaller** than actual content length.

## Root Cause Analysis

### Location: `worker/lib/ai-chunking-batch.ts`

The AI is asked to return:
1. **content**: Exact verbatim text from markdown
2. **start_offset**: Character position (relative to batch)
3. **end_offset**: Character position (relative to batch)

**What's happening**:
- AI returns FULL chunk content (correct) ✅
- AI returns SHORTENED offsets (incorrect) ❌

### Why This Breaks Phase 2

The virtualized reader needs to:
1. Parse markdown into blocks using `marked.lexer()`
2. Track character offsets for each block
3. Binary search chunks to find which chunk each block belongs to
4. Display annotations and connections based on chunk mapping

**With broken offsets**, blocks will map to wrong chunks, causing:
- Annotations appearing on wrong paragraphs
- Connections surfacing for unrelated content
- Complete failure of chunk-based architecture

## Verification

```bash
# Run verification script
tsx scripts/verify-chunk-offsets.ts <document-id>

# Expected output for working system:
# Success rate: 100.0%
# ✨ All chunk offsets are accurate!

# Actual output:
# Success rate: 0.0%
# ⚠️  Offset mismatches detected.
```

## Workaround (Temporary)

Created `scripts/repair-chunk-offsets.ts` that uses fuzzy matching to find correct offsets:

```bash
# Test with dry-run
tsx scripts/repair-chunk-offsets.ts <document-id> --dry-run

# Apply repairs
tsx scripts/repair-chunk-offsets.ts <document-id>
```

**Effectiveness**: 90% success rate (9/10 chunks repaired for test document)

**Limitations**:
- Requires manual run per document
- Fuzzy matching fails for highly edited chunks
- Not a permanent solution

## Proper Fix Required

### Option 1: Fix AI Prompt (Preferred)

Modify `worker/lib/ai-chunking-batch.ts:generateSemanticChunkingPrompt()`:

**Current approach**:
```typescript
// AI returns: { content, start_offset, end_offset }
// Problem: AI estimates offsets incorrectly
```

**Better approach**:
```typescript
// AI returns: { content, metadata }
// Calculate offsets locally by searching for content in markdown
```

**Implementation**:
```typescript
function calculateAccurateOffsets(
  markdown: string,
  aiChunks: Array<{ content: string, metadata: Metadata }>
): ChunkWithOffsets[] {
  let searchFrom = 0

  return aiChunks.map(chunk => {
    const index = markdown.indexOf(chunk.content, searchFrom)
    if (index === -1) {
      throw new Error(`Chunk content not found in markdown`)
    }

    searchFrom = index + chunk.content.length

    return {
      content: chunk.content,
      start_offset: index,
      end_offset: index + chunk.content.length,
      metadata: chunk.metadata
    }
  })
}
```

### Option 2: Validate & Correct Post-AI

Keep AI returning offsets but validate and correct:

```typescript
function validateAndCorrectOffsets(
  markdown: string,
  chunks: ChunkWithOffsets[]
): ChunkWithOffsets[] {
  return chunks.map((chunk, i) => {
    // Extract what AI thinks is there
    const extracted = markdown.slice(chunk.start_offset, chunk.end_offset)

    // If mismatch, search for correct location
    if (extracted !== chunk.content) {
      const correctIndex = markdown.indexOf(chunk.content)
      if (correctIndex !== -1) {
        console.warn(`Chunk ${i}: Correcting offsets ${chunk.start_offset} → ${correctIndex}`)
        return {
          ...chunk,
          start_offset: correctIndex,
          end_offset: correctIndex + chunk.content.length
        }
      }
    }

    return chunk
  })
}
```

## Recommended Action

1. **Immediate**: Use workaround script for existing documents
2. **Short-term**: Implement Option 2 (validate & correct) in worker
3. **Long-term**: Implement Option 1 (remove AI offset responsibility)

## Impact

**Blocked Features**:
- ✅ Phase 1: Annotations (uses heuristic chunk mapping - working)
- ❌ Phase 2: Virtualized reader (needs accurate offsets - blocked)
- ❌ Phase 3: Connection surfacing (depends on Phase 2 - blocked)
- ❌ Phase 4: Chunk-based navigation (depends on Phase 2 - blocked)

## Test Coverage

Added test to prevent regression:

```typescript
// worker/tests/integration/offset-accuracy.test.ts
describe('Chunk offset accuracy', () => {
  it('should match extracted markdown exactly', async () => {
    const result = await processDocument(testDoc)

    for (const chunk of result.chunks) {
      const extracted = markdown.slice(
        chunk.start_offset,
        chunk.end_offset
      )

      expect(extracted).toBe(chunk.content)
    }
  })
})
```

## Related Files

- `worker/lib/ai-chunking-batch.ts` - AI chunking logic
- `worker/processors/base.ts` - Chunk saving logic
- `scripts/verify-chunk-offsets.ts` - Verification utility
- `scripts/repair-chunk-offsets.ts` - Temporary workaround
- `docs/todo/reader-and-annotation-system-plan.md` - Phase 2 plan

---

**Next Steps**: Assign to worker team for permanent fix before Phase 2 implementation.
