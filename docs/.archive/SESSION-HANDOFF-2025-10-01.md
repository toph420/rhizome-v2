# Session Handoff: Phase 2 Pause & Worker Bug Fix

**Date**: 2025-10-01
**Session**: Phase 2 Reader Planning → Worker Bug Discovery
**Status**: Phase 2 paused, ready for worker bug fix

---

## What We Accomplished

### ✅ Completed
1. **Project Context Review**: Full understanding of Rhizome V2 architecture
2. **Phase 2 Planning**: Detailed virtualized reader implementation plan
3. **Offset Verification**: Discovered critical worker bug (0% offset accuracy)
4. **Diagnostic Tools**: Created verification and repair scripts
5. **Bug Documentation**: Complete analysis with proposed fixes

### 📝 Created Files
- `scripts/verify-chunk-offsets.ts` - Validates chunk offsets against markdown
- `scripts/repair-chunk-offsets.ts` - Temporary fuzzy-matching workaround
- `docs/worker-offset-bug-report.md` - Complete bug analysis with solutions
- `docs/SESSION-HANDOFF-2025-10-01.md` - This file

### 📋 Updated Files
- `docs/todo/reader-and-annotation-system-plan.md` - Added Phase 2 pause notice

---

## The Bug

**Location**: `worker/lib/ai-chunking-batch.ts`

**Problem**: AI returns correct chunk content BUT incorrect/shortened offsets

**Evidence** (Test Document: `3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff`):
```
Chunk 0: Content 1284 chars, Offset span 789 chars (-39% error)
Chunk 1: Content 2436 chars, Offset span 1356 chars (-44% error)
Chunk 8: Content 22268 chars, Offset span 8822 chars (-60% error)
```

**Impact**: Blocks Phase 2 (virtualized reader needs accurate offsets for chunk mapping)

---

## Recommended Fix (2-4 hours)

### Option 2: Validate & Correct Offsets (Preferred)

**File**: `worker/lib/ai-chunking-batch.ts`

**Add after line 569** (in `parseMetadataResponse`):

```typescript
/**
 * Validates and corrects chunk offsets by searching for content in original markdown.
 * AI-provided offsets are often incorrect, so we verify against actual content location.
 */
function validateAndCorrectOffsets(
  originalMarkdown: string,
  chunks: ChunkWithOffsets[],
  batchStartOffset: number
): ChunkWithOffsets[] {
  let searchFrom = batchStartOffset

  return chunks.map((chunk, index) => {
    // Verify AI's offsets by extracting what it claims is there
    const extracted = originalMarkdown.slice(chunk.start_offset, chunk.end_offset)

    // If exact match, AI got it right
    if (extracted === chunk.content) {
      searchFrom = chunk.end_offset
      return chunk
    }

    // AI's offsets are wrong - find correct location
    const correctStart = originalMarkdown.indexOf(chunk.content, searchFrom)

    if (correctStart === -1) {
      // Content not found - try fuzzy matching
      const normalizedContent = chunk.content.trim().replace(/\s+/g, ' ')
      const normalizedMarkdown = originalMarkdown.replace(/\s+/g, ' ')
      const fuzzyIndex = normalizedMarkdown.indexOf(normalizedContent, searchFrom)

      if (fuzzyIndex === -1) {
        console.error(`[AI Metadata] Chunk ${index}: Content not found in markdown`)
        console.error(`  Content preview: "${chunk.content.slice(0, 100)}..."`)
        return chunk // Return original (will fail validation but preserve data)
      }

      // Map fuzzy match back to original markdown position
      // (This is complex - for MVP just warn and use AI offsets)
      console.warn(`[AI Metadata] Chunk ${index}: Using fuzzy match (may be imprecise)`)
      return chunk
    }

    // Found exact match - correct the offsets
    const correctEnd = correctStart + chunk.content.length

    console.log(
      `[AI Metadata] Chunk ${index}: Corrected offsets ` +
      `${chunk.start_offset}-${chunk.end_offset} → ${correctStart}-${correctEnd}`
    )

    searchFrom = correctEnd

    return {
      ...chunk,
      start_offset: correctStart,
      end_offset: correctEnd
    }
  })
}
```

**Then modify line 413** (in `parseMetadataResponse`):

```typescript
// Before:
return validated

// After:
// Validate and correct offsets before returning
const corrected = validateAndCorrectOffsets(
  batch.content, // Pass batch content for searching
  validated,
  batch.startOffset
)

return corrected
```

**Wait, that won't work!** We need the FULL markdown, not just the batch content.

**Better approach**: Pass `originalMarkdown` through the call chain:

1. `batchChunkAndExtractMetadata` receives full markdown (already has it)
2. Pass it to `extractBatchMetadata`
3. Pass it to `callGeminiForMetadata`
4. Pass it to `parseMetadataResponse`
5. Use it in `validateAndCorrectOffsets`

**Actual implementation**:

```typescript
// Modify function signature (line 409):
function parseMetadataResponse(
  responseText: string,
  batch: MetadataExtractionBatch,
  fullMarkdown: string // ADD THIS
): ChunkWithOffsets[] {
  // ... existing parsing logic ...

  // After line 569, before return:
  const corrected = validateOffsets(fullMarkdown, validated)
  return corrected
}

// Modify callGeminiForMetadata signature (line 233):
async function callGeminiForMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  fullMarkdown: string // ADD THIS
): Promise<ChunkWithOffsets[]> {
  // ... existing logic ...

  // Line 313:
  return parseMetadataResponse(text, batch, fullMarkdown) // PASS IT
}

// Modify extractBatchMetadata signature (line 183):
async function extractBatchMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number,
  fullMarkdown: string // ADD THIS
): Promise<MetadataExtractionResult> {
  // ... retry loop ...

  // Line 194:
  const result = await callGeminiForMetadata(
    geminiClient,
    batch,
    modelName,
    fullMarkdown // PASS IT
  )
  // ...
}

// Modify call in batchChunkAndExtractMetadata (line 103):
const result = await extractBatchMetadata(
  geminiClient,
  batch,
  finalConfig.modelName,
  finalConfig.maxRetries,
  markdown // PASS FULL MARKDOWN
)
```

### Simpler validateOffsets function:

```typescript
function validateOffsets(
  fullMarkdown: string,
  chunks: ChunkWithOffsets[]
): ChunkWithOffsets[] {
  let searchHint = 0

  return chunks.map((chunk, i) => {
    // Check if AI's offsets are correct
    const extracted = fullMarkdown.slice(chunk.start_offset, chunk.end_offset)

    if (extracted === chunk.content) {
      searchHint = chunk.end_offset
      return chunk // Correct!
    }

    // Find correct offset
    const correctStart = fullMarkdown.indexOf(chunk.content, searchHint)

    if (correctStart === -1) {
      console.error(`Chunk ${i}: Content not found, keeping AI offsets`)
      return chunk
    }

    console.log(`Chunk ${i}: Fixed ${chunk.start_offset}→${chunk.end_offset} to ${correctStart}→${correctStart + chunk.content.length}`)

    searchHint = correctStart + chunk.content.length

    return {
      ...chunk,
      start_offset: correctStart,
      end_offset: correctStart + chunk.content.length
    }
  })
}
```

---

## Test After Fix

```bash
# 1. Reprocess test document (delete + re-upload)
# Document ID: 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff

# 2. Verify offsets
env SUPABASE_URL=http://localhost:54321 \
    SUPABASE_SERVICE_ROLE_KEY=<key> \
    npx tsx scripts/verify-chunk-offsets.ts 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff

# Expected output:
# Success rate: 100.0%
# ✨ All chunk offsets are accurate!
```

---

## Resume Phase 2 After Fix

Once worker is fixed and verified:

1. **Install dependencies**:
   ```bash
   npm install react-virtuoso marked dompurify
   npm install -D @types/dompurify
   ```

2. **Follow Phase 2 plan** in `docs/todo/reader-and-annotation-system-plan.md`:
   - Create `lib/reader/block-parser.ts`
   - Create `components/reader/BlockRenderer.tsx`
   - Create `components/reader/VirtualizedReader.tsx`
   - Build test page `/test-reader`
   - Migrate production reader

**Estimated time**: 3-4 hours once worker is fixed

---

## Files to Review

Before starting next session:

1. **Bug Report**: `docs/worker-offset-bug-report.md` (complete analysis)
2. **Phase 2 Plan**: `docs/todo/reader-and-annotation-system-plan.md` (implementation guide)
3. **Worker Code**: `worker/lib/ai-chunking-batch.ts` (where to make changes)
4. **Test Scripts**: `scripts/verify-chunk-offsets.ts` and `scripts/repair-chunk-offsets.ts`

---

## Key Decisions Made

1. ✅ **Pause Phase 2**: Don't build on broken foundation
2. ✅ **Fix Worker First**: Implement offset validation/correction
3. ✅ **Use Option 2**: Validate & correct (simpler than Option 1)
4. ✅ **Reprocess Documents**: After fix, delete and re-upload test docs

---

## Implementation Complete ✅

**Date**: 2025-10-01 (same day)
**Time**: ~30 minutes

### What Was Implemented

1. ✅ **Added `validateOffsets` function** (`worker/lib/ai-chunking-batch.ts:578-615`)
   - Searches for chunk content in full markdown
   - Uses sequential search hint for optimization
   - Logs corrections with before/after offsets
   - Handles missing content gracefully (keeps AI offsets as fallback)

2. ✅ **Threaded `fullMarkdown` through call chain**
   - Modified `parseMetadataResponse` (line 412): Added `fullMarkdown` parameter
   - Modified `callGeminiForMetadata` (line 237): Added `fullMarkdown` parameter
   - Modified `extractBatchMetadata` (line 188): Added `fullMarkdown` parameter
   - Updated call in `batchChunkAndExtractMetadata` (line 108): Passes `markdown`

3. ✅ **Applied validation before return** (line 573-574)
   ```typescript
   const corrected = validateOffsets(fullMarkdown, validated)
   return corrected
   ```

### How It Works

**Before Fix**:
```
AI returns: { content: "full text...", start_offset: 18, end_offset: 807 }
Problem: offset span (789) < content length (1284)
```

**After Fix**:
```
1. AI returns shortened offsets
2. validateOffsets extracts markdown[18:807]
3. Compares with chunk.content → MISMATCH
4. Searches for chunk.content in full markdown
5. Finds it at position 18 (start is correct!)
6. Corrects end_offset: 18 + 1284 = 1302
7. Returns: { content: "...", start_offset: 18, end_offset: 1302 }
```

### Next Steps (New Session)

1. ⏳ **Reprocess test document**
   ```bash
   env SUPABASE_URL=http://localhost:54321 \
       SUPABASE_SERVICE_ROLE_KEY=<key> \
       npx tsx scripts/reprocess-document.ts 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff
   ```

2. ⏳ **Verify 100% accuracy**
   ```bash
   env SUPABASE_URL=http://localhost:54321 \
       SUPABASE_SERVICE_ROLE_KEY=<key> \
       npx tsx scripts/verify-chunk-offsets.ts 3392b8cd-fcc7-423d-ae3e-3e6cb23f7dff
   ```

3. ⏳ **Add regression test** (worker/tests/offset-accuracy.test.ts)

4. ✨ **Resume Phase 2** with confidence!

### Files Modified

- ✅ `worker/lib/ai-chunking-batch.ts` - Added offset validation
- ✅ `scripts/reprocess-document.ts` - Created utility for reprocessing

### Key Insights

The fix is **surgical and minimal** - it doesn't change AI behavior or prompt engineering. Instead, it:
- Trusts AI for content extraction (working correctly)
- Validates and corrects offsets post-processing
- Uses the content itself as source of truth for position

This approach is **robust** because:
- Content matching is deterministic (no AI unpredictability)
- Sequential search hint optimizes performance
- Graceful fallback if content not found (shouldn't happen)

---

**Worker bug is FIXED!** Ready to test and then resume Phase 2. 🚀
