# Simplified Processing Pipeline - Implementation Plan

**Goal:** Strip away complexity. Linear pipeline with boundary-based chunk matching.

**Philosophy:** Extract → Local Clean → AI Clean → Chunk with Boundaries → Match → Done

---

## The Problem

Current system is over-engineered:
- Complex offset calculations spread across multiple files
- Fuzzy matching as primary strategy (should be unnecessary)
- Multiple cleanup strategies with different approaches
- Validation heuristics and edge case handling everywhere
- Split chunk logic with theme preservation
- Batch stitching with complex reconciliation

**Result:** 20-30% chunk matching failures, difficult to debug, hard to maintain

---

## The Solution

**Simple Pipeline:**
```
1. Extract text (PDF batching already works)
2. Local regex cleanup (fast, free, catches obvious artifacts)
3. AI cleanup with batching + overlap stitching (catches remaining junk)
4. AI chunking with boundary markers (100 chars before/after each chunk)
5. Match chunks using boundaries (no fuzzy matching needed)
```

**Key Insight:** Ask AI to return `boundaryBefore` and `boundaryAfter` for each chunk. Search for these exact strings to find chunk positions. Fuzzy matching becomes unnecessary.

---

## Files to Create (NEW)

### 1. `worker/lib/markdown-cleanup-simple.ts`
**Purpose:** Single-pass AI cleanup with batching

**What it does:**
- Small docs (<50K): Single AI call
- Large docs: Batch with 2K overlap, stitch results
- Simple prompt: "Clean this, remove junk, keep content"
- Returns cleaned markdown string

**Key functions:**
- `cleanMarkdown(ai, markdown): Promise<string>`
- `cleanBatch(ai, text): Promise<string>` (internal)
- `stitchBatches(batches: string[]): string` (internal) - **see implementation below**

**Stitching Implementation:**
```typescript
function stitchBatches(batches: string[]): string {
  if (batches.length === 1) return batches[0];

  let result = batches[0];

  for (let i = 1; i < batches.length; i++) {
    const prev = batches[i - 1];
    const curr = batches[i];

    // Find overlap (search last 2K of prev in first 3K of curr)
    const prevEnd = prev.slice(-2000);
    const currStart = curr.slice(0, 3000);

    let overlapPos = -1;
    // Try to find longest match (start with 1K, decrease by 100)
    for (let len = 1000; len > 100; len -= 100) {
      const needle = prevEnd.slice(-len);
      overlapPos = currStart.indexOf(needle);
      if (overlapPos >= 0) break;
    }

    if (overlapPos >= 0) {
      // Skip the overlap in current batch
      result += curr.slice(overlapPos + (prevEnd.length - 2000));
    } else {
      // No overlap found, just append with paragraph break
      console.warn('[Stitching] No overlap found, appending with break');
      result += '\n\n' + curr;
    }
  }

  return result;
}
```

**Note:** `stitchMarkdownBatches()` DOES exist in fuzzy-matching.ts (line 667). You can:
- **Option A:** Import and use the existing function
- **Option B:** Use the simpler implementation above (avoids dependency)

---

### 2. `worker/lib/chunking-simple.ts`
**Purpose:** Boundary-based chunk matching

**What it does:**
- Batch markdown (25K per batch)
- AI returns chunks with `boundaryBefore` + `boundaryAfter`
- Match each chunk: find boundaryBefore → chunk starts after it → find boundaryAfter → chunk ends before it
- Extract exact content from source using matched positions
- Fallback to content search only if boundaries fail (should be <1% of cases)

**Key functions:**
- `chunkWithBoundaries(markdown, ai, onProgress): Promise<SimpleChunk[]>`
- `chunkBatch(ai, batchText, batchOffset, fullMarkdown): Promise<SimpleChunk[]>` (internal)
- `findWithBoundaries(before, after, markdown, searchStart): {start, end} | null` (internal)

**Boundary Matching Implementation (with edge case handling):**
```typescript
function findWithBoundaries(
  boundaryBefore: string,
  boundaryAfter: string,
  markdown: string,
  searchStart: number = 0
): { start: number; end: number } | null {

  // Find before boundary
  const beforePos = markdown.indexOf(boundaryBefore, searchStart);
  if (beforePos === -1) {
    return null;
  }

  // Chunk starts after the before boundary
  const chunkStart = beforePos + boundaryBefore.length;

  // Find after boundary - search from chunk start with reasonable max distance
  // Typical chunks: 2K-8K chars, allow up to 15K for long chunks
  const searchEnd = Math.min(chunkStart + 15000, markdown.length);
  const afterPos = markdown.indexOf(boundaryAfter, chunkStart);

  if (afterPos === -1 || afterPos > searchEnd) {
    return null;
  }

  // Chunk ends where after boundary starts
  const chunkEnd = afterPos;
  const chunkLength = chunkEnd - chunkStart;

  // Sanity check: chunks should be 100-12000 chars
  if (chunkLength < 100 || chunkLength > 12000) {
    console.warn(
      `[Boundary Match] Suspicious chunk length: ${chunkLength} chars ` +
      `(expected 2000-8000). Before: "${boundaryBefore.slice(0, 30)}..."`
    );
    return null;
  }

  return { start: chunkStart, end: chunkEnd };
}
```

**Types:**
```typescript
interface SimpleChunk {
  content: string
  start_offset: number
  end_offset: number
  themes: string[]
  concepts: Array<{text: string, importance: number}>
  importance: number
  summary: string
  domain: string
  emotional: {polarity: number, primaryEmotion: string, intensity: number}
}
```

**AI Response Schema:**
```typescript
interface AIChunkResponse {
  content: string  // Chunk text (not used for matching)
  boundaryBefore: string  // 100 chars before chunk
  boundaryAfter: string   // 100 chars after chunk
  // ... metadata fields
}
```

**AI Chunking Prompt (Crystal Clear):**
```typescript
const prompt = `Split this text into semantic chunks (300-800 words each).

CRITICAL: For each chunk, you must provide EXACT boundary markers:
- boundaryBefore: Copy the EXACT 100 characters that appear immediately BEFORE this chunk
- boundaryAfter: Copy the EXACT 100 characters that appear immediately AFTER this chunk

These boundaries are used to locate the chunk in the source text, so they must be EXACT COPIES.

Example:
If chunk starts at: "...previous sentence. The new idea begins with this text..."
Then boundaryBefore: "...previous sentence. " (the 100 chars immediately before)

If chunk ends at: "...this is the end of the idea. The next section starts here..."
Then boundaryAfter: " The next section starts here..." (the 100 chars immediately after)

Return JSON array with these fields for each chunk:
{
  "chunks": [
    {
      "boundaryBefore": "exact 100 chars before chunk",
      "boundaryAfter": "exact 100 chars after chunk",
      "content": "the actual chunk text",
      "themes": ["theme1", "theme2"],
      "concepts": [{"text": "concept", "importance": 0.8}],
      "importance": 0.8,
      "summary": "one sentence summary",
      "domain": "narrative" | "academic" | "technical" | "philosophical",
      "emotional": {
        "polarity": -1 to 1,
        "primaryEmotion": "string",
        "intensity": 0 to 1
      }
    }
  ]
}

TEXT TO CHUNK:
\${batchText}`;
```

---

## Files to Modify (SIMPLIFY)

### 3. `worker/processors/epub-processor.ts`
**Current:** 280 lines, complex batching logic, multiple cleanup strategies
**Target:** ~120 lines, linear flow

**New flow:**
```typescript
async process(): ProcessResult {
  // 1. Parse EPUB (10%)
  const { metadata, chapters } = await parseEPUB(fileData)

  // 2. Local regex cleanup per chapter (20%)
  const cleaned = chapters.map(ch => ({
    title: ch.title,
    markdown: cleanEpubArtifacts(ch.markdown)  // Keep existing
  }))

  // 3. Combine chapters
  const combined = cleaned.map(ch => `# ${ch.title}\n\n${ch.markdown}`).join('\n\n---\n\n')

  // 4. AI cleanup (30-50%)
  const cleanedMarkdown = await cleanMarkdown(this.ai, combined)

  // 5. Chunk with boundaries (55-90%)
  const chunks = await chunkWithBoundaries(cleanedMarkdown, this.ai, progressCallback)

  // 6. Format and return
  return { markdown: cleanedMarkdown, chunks: enrichedChunks, metadata, wordCount }
}
```

**Remove:**
- Complex windowed batching logic
- Review mode / simple chunking paths
- Type-specific chunking (let AI handle this naturally)
- Metadata extraction progress tracking (too granular)

---

### 4. `worker/processors/pdf-processor.ts`
**Current:** 350+ lines, batched extraction, complex progress tracking
**Target:** ~150 lines, linear flow

**New flow:**
```typescript
async process(): ProcessResult {
  // 1. Extract PDF with batching (10-40%)
  const result = await extractLargePDF(this.ai, fileData, progressCallback)
  let markdown = result.markdown

  // 2. Local regex cleanup (40-45%)
  markdown = cleanPageArtifacts(markdown)  // Keep existing

  // 3. AI cleanup (45-60%)
  markdown = await cleanMarkdown(this.ai, markdown)

  // 4. Chunk with boundaries (65-90%)
  const chunks = await chunkWithBoundaries(markdown, this.ai, progressCallback)

  // 5. Format and return
  return { markdown, chunks: enrichedChunks, wordCount }
}
```

**Remove:**
- Review mode logic
- Type-specific chunking
- Complex progress percentage calculations (see simplified tracking below)
- Service role key refresh (move to base class if needed)

**Simplified Progress Tracking:**
```typescript
// Simple 5-phase tracking (20% per phase)
const phases = {
  extract: { start: 0, end: 20 },      // PDF extraction
  cleanup_local: { start: 20, end: 40 },  // Regex cleanup
  cleanup_ai: { start: 40, end: 60 },     // AI cleanup
  chunking: { start: 60, end: 90 },       // AI chunking
  finalize: { start: 90, end: 100 }       // Save & wrap up
}

// Update progress within phase:
const percent = phases.cleanup_ai.start +
  ((current / total) * (phases.cleanup_ai.end - phases.cleanup_ai.start))
await this.updateProgress(percent, 'cleanup_ai', 'processing', message)
```

---

## Files to Archive (.old)

Move these to `.old` extension (don't delete, might need for reference):

### 5. `worker/lib/ai-chunking-batch.ts` → `.old`
**Why:** Complex offset correction, fuzzy matching as primary strategy, validation heuristics
**Replace with:** `chunking-simple.ts` (boundary-based)

### 6. `worker/lib/chunking/chunk-validator.ts` → `.old`
**Why:** Complex split logic, theme preservation, placeholder offsets
**Replace with:** Simple validation in `chunking-simple.ts` if needed

### 7. `worker/lib/chunking/batch-creator.ts` → `.old`
**Why:** Complex batch creation with overlap calculation
**Replace with:** Simple batching in `chunking-simple.ts`

### 8. `worker/lib/markdown-cleanup-ai.ts` → `.old`
**Why:** Multiple strategies (per-chapter, heading-split, conditional), complex prompt
**Replace with:** `markdown-cleanup-simple.ts` (single strategy)

### 9. `worker/lib/prompts/markdown-cleanup.ts` → `.old`
**Why:** Overly complex prompt with many rules
**Replace with:** Simple inline prompt in `markdown-cleanup-simple.ts`

---

## Files to Keep (Working Well)

These don't need changes:

- `worker/lib/epub/epub-cleaner.ts` - Regex cleanup works great
- `worker/lib/text-cleanup.ts` - PDF page artifact removal works
- `worker/lib/epub/epub-parser.ts` - EPUB parsing works
- `worker/lib/pdf-batch-utils.ts` - PDF extraction with batching works
- `worker/processors/base.ts` - Base processor class is fine
- `worker/lib/fuzzy-matching.ts` - May need `stitchMarkdownBatches()` function

---

## Implementation Steps

### Phase 1: Create New Modules (2-3 hours)
1. ✅ Create `worker/lib/markdown-cleanup-simple.ts`
   - Implement `cleanMarkdown()` with batching
   - Simple prompt: "Clean markdown, remove artifacts, keep content"
   - Test with sample EPUB markdown

2. ✅ Create `worker/lib/chunking-simple.ts`
   - Implement `chunkWithBoundaries()`
   - AI returns chunks with boundary markers
   - Match using boundaries: `indexOf(boundaryBefore)` → extract → `indexOf(boundaryAfter)`
   - Test with sample cleaned markdown

3. ✅ Write unit tests
   - Test cleanup batching and stitching
   - Test boundary matching (happy path)
   - Test boundary matching failures (fallback)

### Phase 2: Update Processors (1-2 hours)
4. ✅ Simplify `worker/processors/epub-processor.ts`
   - Strip to ~120 lines
   - Linear flow: parse → clean local → clean AI → chunk
   - Remove review mode, type-specific logic

5. ✅ Simplify `worker/processors/pdf-processor.ts`
   - Strip to ~150 lines
   - Linear flow: extract → clean local → clean AI → chunk
   - Remove review mode, type-specific logic

### Phase 3: Archive Old Code (15 min)
6. ✅ Move old files to .old extension
   - `ai-chunking-batch.ts.old`
   - `chunk-validator.ts.old`
   - `batch-creator.ts.old`
   - `markdown-cleanup-ai.ts.old`
   - `prompts/markdown-cleanup.ts.old`

### Phase 4: Test (1-2 hours)
7. ✅ Test with real documents
   - Upload EPUB (The Soft Machine)
   - Upload PDF (academic paper)
   - Check logs for match rates
   - Verify cleaned markdown has no artifacts

8. ✅ Monitor metrics
   - Chunk match rate: Target 95%+ (boundaries should make this easy)
   - Processing time: Should be similar or faster
   - Clean markdown quality: No filenames, page numbers, junk

### Phase 5: Cleanup (15 min)
9. ✅ Remove .old files if everything works
10. ✅ Update docs/ARCHITECTURE.md with new pipeline

---

## Expected Results

### Chunk Match Rate
- **Current:** 70-80% exact matches, 20-30% failures
- **Target:** 95%+ matches using boundaries
- **Why:** Boundaries are exact strings, no offset arithmetic

### Code Complexity
- **Current:** ~1500 lines across chunking/cleanup modules
- **Target:** ~400 lines total
- **Reduction:** 70% less code

### Processing Cost
- **Current:** ~$0.40 per book
- **Target:** ~$0.50 per book (+$0.10 for AI cleanup)
- **Worth it:** Clean markdown = better reading experience

### Maintenance
- **Current:** Hard to debug, many edge cases
- **Target:** Simple linear flow, easy to understand

---

## Success Criteria

✅ **Chunk matching:** 95%+ match rate with boundaries
✅ **Clean markdown:** No filename artifacts, page numbers, TOC junk
✅ **Processing time:** <20 min for 500-page book
✅ **Code clarity:** Each module <200 lines, single responsibility
✅ **No regressions:** All existing features still work

---

## Rollback Plan

If boundaries don't work well:
1. Keep .old files around for reference
2. Git revert to previous commit
3. Or: Add fuzzy matching as fallback in `findWithBoundaries()`

But boundaries should work - it's just string searching!

---

## Key Design Decisions

### Why boundaries instead of offsets?
- **Offsets:** Require AI to count characters (error-prone)
- **Boundaries:** AI copies exact text (reliable)
- **Math:** 0 arithmetic vs substring search

### Why batch cleanup?
- Large documents don't fit in single AI call
- Batching with overlap is standard text processing
- Stitching is simple: find overlap, join

### Why linear pipeline?
- Easy to understand
- Easy to debug
- No complex control flow
- Each step validates previous step

### Why archive instead of delete?
- May need to reference old logic
- Easy to restore if needed
- Can delete later once proven

---

## Implementation Checklist

- [ ] Create `markdown-cleanup-simple.ts`
- [ ] Create `chunking-simple.ts`
- [ ] Write unit tests for new modules
- [ ] Simplify `epub-processor.ts`
- [ ] Simplify `pdf-processor.ts`
- [ ] Archive 5 old files to .old
- [ ] Test with real EPUB
- [ ] Test with real PDF
- [ ] Monitor match rates (target 95%+)
- [ ] Update architecture docs
- [ ] Remove .old files if successful

---

## Timeline & Risk Assessment

**Estimated Time:** 4-6 hours (core work) + 1-2 hours buffer for "oh shit" moments

**Timeline Breakdown:**
- Phase 1 (New modules + tests): 2-3 hours
- Phase 2 (Update processors): 1-2 hours
- Phase 3 (Archive old code): 15 min
- Phase 4 (Testing): 1-2 hours
- Phase 5 (Cleanup): 15 min
- **Buffer:** 1-2 hours for unexpected issues

**Timeline Validation:**
✅ Realistic IF stitching function exists or is simple (30 min max)
✅ Realistic IF no major surprises in testing
⚠️ Add buffer for edge cases in boundary matching

**Risk Level:** Low
- Can rollback via git revert
- .old files preserved as reference
- No database schema changes
- Isolated to worker module

**Payoff:**
- 70% less code (1500 → 400 lines)
- 95%+ match rate (vs 70-80% currently)
- Maintainable linear pipeline
- Better reading experience (clean markdown)

---

## Execution Strategy

**Start with Phase 1 in isolation:**
1. Create `markdown-cleanup-simple.ts` first
2. Test with sample markdown (copy from existing document)
3. Verify stitching works on 2-3 batches
4. Create `chunking-simple.ts`
5. Test boundary matching on 5 sample chunks (validate concept before full processor changes)

**Key Validation Points:**
- [ ] Stitching correctly handles overlap (test with known overlap content)
- [ ] Boundary matching finds 95%+ of chunks in test sample
- [ ] Fallback to content search works for edge cases
- [ ] AI cleanup prompt removes filenames/artifacts

**Only proceed to Phase 2 if Phase 1 tests pass!**

---

## Developer Recommendations

### Critical Pre-Implementation Steps

1. **Test Boundary Matching First**
   - Take 5 chunks from an existing document
   - Manually add boundary markers
   - Test `findWithBoundaries()` function
   - Validate 100% match rate before touching processors

2. **Verify Stitching Function**
   - Check if `stitchMarkdownBatches()` in fuzzy-matching.ts works
   - If yes: Import and use it
   - If no: Use the simple implementation provided above
   - Test on 2-3 batches with known overlap

3. **Keep Reference Files**
   - Keep `ai-chunking-batch.ts.old` even after success
   - Useful for comparing approaches if issues arise
   - Can delete after 2-3 successful processing runs

### Post-Implementation Monitoring

**Success Metrics:**
- ✅ Chunk match rate: 95%+ (log every processing run)
- ✅ Processing time: <20 min for 500-page books
- ✅ Clean markdown: No filename artifacts in spot checks
- ✅ No regressions: All existing features work

**Monitor for 1 week:**
- Check logs for boundary match failures
- Spot check cleaned markdown quality
- Verify chunk offsets are accurate
- Ensure annotations still map correctly

**If match rate < 90%:**
- Investigate boundary matching failures
- Check if AI is returning correct boundaries
- May need to adjust prompt or fallback logic

---

## Green Light Decision

**This plan is APPROVED for execution.**

**Rationale:**
- Well thought out simplification
- Boundaries eliminate fuzzy matching complexity
- Clear implementation steps with validation
- Low risk with easy rollback
- Significant code reduction (70%)

**Execute it.** Start with Phase 1, validate thoroughly, then proceed.
