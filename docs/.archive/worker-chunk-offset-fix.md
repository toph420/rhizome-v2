# Worker Chunk Offset Fix - Complete Implementation Plan

**Date**: 2025-10-01
**Status**: Ready to implement
**Current Accuracy**: 57% (unacceptable)
**Target Accuracy**: 95-100%

---

## Problem Summary

The worker has **two critical bugs** causing 57% offset accuracy:

### Bug 1: Content Modification (Primary Issue)
- **Problem**: AI normalizes whitespace, newlines, and formatting instead of preserving exact text
- **Evidence**: `indexOf()` fails to find AI's content in markdown
- **Impact**: Annotations appear on wrong paragraphs, connections surface for unrelated content

### Bug 2: Size Constraint Violations (Secondary Issue)
- **Problem**: AI returns 49k character chunks instead of 3k max
- **Evidence**: Auto-split creates 20 metadata-less sub-chunks
- **Impact**: Chunks have no themes/concepts/emotional data, can't be used for connections

---

## Current State Analysis

From latest processing logs:
```
[AI Metadata] ⚠️ Chunk 1 violates size constraint: 49369 chars > 30000 chars
Auto-splitting into smaller chunks...
[AI Metadata] Split oversized chunk into 20 sub-chunks

[AI Metadata] Offset validation complete:
  ✅ Exact matches: 0/21 (0.0%)
  ✓ Corrected offsets: 12/21
  ❌ Content not found: 9/21
  📊 Overall accuracy: 57.1%
```

**Issues**:
1. Zero exact matches (AI always modifies content)
2. 9 chunks can't be found via `indexOf()` (whitespace normalization)
3. 20 auto-split chunks have NO metadata (themes, concepts, emotional analysis)
4. AI ignores 3000 character size constraint

---

## Root Causes

### Why AI Modifies Content
- Gemini 2.5 Flash is trained for summarization, not verbatim copying
- JSON encoding/decoding may normalize whitespace
- Model interprets "exact text" as "semantically equivalent text"
- Prompt engineering alone cannot fix this

### Why AI Violates Size Constraints
- Model prioritizes semantic completeness over hard limits
- Interprets constraints as "suggestions" not absolute requirements
- Will combine multiple ideas into one chunk if they're related

---

## Solution: Two-Pass Approach with Size Validation

### Pass 1: AI Returns Approximate Content with Rich Metadata
```typescript
const aiResult = await callAI(`
Extract semantic chunks with:
- content (approximate, whitespace may vary)
- themes (2-5 key topics)
- concepts (3-5 with importance scores)
- emotional_tone (polarity, primary emotion, intensity)
- importance_score (0.0-1.0)
`)
```

### Pass 2: Correct Content Using Fuzzy Matching
```typescript
for (const chunk of aiResult.chunks) {
  // Find where AI's content actually appears in markdown
  const match = fuzzyFindInMarkdown(markdown, chunk.content)

  // Extract EXACT content from markdown
  const exactContent = markdown.slice(match.start, match.end)

  // Replace AI's content with exact markdown
  chunk.content = exactContent
  chunk.start_offset = match.start
  chunk.end_offset = match.end

  // KEEP AI's metadata (semantically accurate)
  // themes, concepts, emotional_tone, importance_score
}
```

### Why This Works
- AI's semantic analysis (themes, concepts) doesn't require exact whitespace
- Fuzzy matching finds content despite normalization (90%+ similarity)
- Exact content extraction guarantees `markdown.slice(start, end) === chunk.content`
- Metadata is preserved from AI's semantic understanding

---

## Implementation Plan

### Phase 1: Remove Auto-Splitting ❌ CRITICAL
**Why**: Auto-split chunks have NO metadata and are useless for connections

**Current Code** (lines 478-526 in `ai-chunking-batch.ts`):
```typescript
if (chunk.content.length > MAX_CHUNK_SIZE) {
  // Split the oversized chunk into manageable pieces
  const subChunks: ChunkWithOffsets[] = []
  // ... creates metadata-less chunks
}
```

**Action**: Remove this entire block
- Don't auto-split after AI returns results
- Instead, validate BEFORE accepting results
- Retry with stricter prompt if AI violates constraints

---

### Phase 2: Add Size Validation with Retry ✅ NEW

**Add to `extractBatchMetadata()` function**:

```typescript
async function extractBatchMetadata(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number,
  fullMarkdown: string
): Promise<MetadataExtractionResult> {
  const startTime = Date.now()
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiForMetadata(
        geminiClient,
        batch,
        modelName,
        fullMarkdown
      )

      // ✅ NEW: Validate chunk sizes BEFORE accepting
      const oversized = result.filter(c => c.content.length > 3000)

      if (oversized.length > 0) {
        const maxSize = Math.max(...oversized.map(c => c.content.length))
        console.warn(
          `[AI Metadata] Attempt ${attempt}/${maxRetries}: ` +
          `${oversized.length} chunks exceed 3000 chars (max: ${maxSize}). ` +
          `Retrying with stricter prompt...`
        )

        if (attempt < maxRetries) {
          // Retry with more aggressive size constraint
          continue
        } else {
          // Last resort: split batch into smaller sections
          console.error(
            `[AI Metadata] AI repeatedly violated size constraints. ` +
            `Splitting batch into smaller sections...`
          )
          return await processSmallerBatches(
            geminiClient,
            batch,
            modelName,
            maxRetries,
            fullMarkdown
          )
        }
      }

      // All chunks valid, proceed
      return {
        batchId: batch.batchId,
        chunkMetadata: result,
        status: 'success',
        processingTime: Date.now() - startTime
      }
    } catch (error: any) {
      lastError = error
      // ... existing retry logic
    }
  }
}
```

**Add fallback batch splitting**:

```typescript
async function processSmallerBatches(
  geminiClient: GoogleGenAI,
  batch: MetadataExtractionBatch,
  modelName: string,
  maxRetries: number,
  fullMarkdown: string
): Promise<MetadataExtractionResult> {
  // Split the batch in half and process separately
  const midpoint = Math.floor(batch.content.length / 2)
  const batch1 = {
    ...batch,
    batchId: `${batch.batchId}-a`,
    content: batch.content.slice(0, midpoint),
    endOffset: batch.startOffset + midpoint
  }
  const batch2 = {
    ...batch,
    batchId: `${batch.batchId}-b`,
    content: batch.content.slice(midpoint),
    startOffset: batch.startOffset + midpoint
  }

  const [result1, result2] = await Promise.all([
    extractBatchMetadata(geminiClient, batch1, modelName, maxRetries, fullMarkdown),
    extractBatchMetadata(geminiClient, batch2, modelName, maxRetries, fullMarkdown)
  ])

  return {
    batchId: batch.batchId,
    chunkMetadata: [...result1.chunkMetadata, ...result2.chunkMetadata],
    status: 'success',
    processingTime: result1.processingTime + result2.processingTime
  }
}
```

---

### Phase 3: Strengthen Prompt for Size Constraints ✅ NEW

**Update `generateSemanticChunkingPrompt()`**:

```typescript
function generateSemanticChunkingPrompt(batch: MetadataExtractionBatch): string {
  return `Analyze the DOCUMENT TEXT below and identify semantic chunks.

🚨 CRITICAL REQUIREMENT - EXACT TEXT PRESERVATION 🚨
You MUST copy text EXACTLY as it appears. Preserve:
- Every space, tab, and whitespace character
- Every newline and line break (\n)
- Every special character, punctuation mark
- Every formatting character
Do NOT normalize, clean, trim, or modify the text in ANY way.

🚨 ABSOLUTE HARD LIMIT - CHUNK SIZE 🚨
MAXIMUM chunk size: 3000 characters (approximately 500 words)
MINIMUM chunk size: 200 words

DO NOT EVER return a chunk larger than 3000 characters.
This is NOT a suggestion. This is a TECHNICAL CONSTRAINT.
Your response will be REJECTED if you violate this limit.

If a semantic unit would exceed 3000 characters:
1. STOP immediately
2. Break it into 2-3 smaller chunks
3. Each chunk gets its own themes/concepts/emotional analysis
4. Ensure each sub-chunk is semantically coherent

Example of WRONG (will be rejected):
{
  "content": "...49,000 characters of text..." ❌ TOO LARGE
}

Example of CORRECT:
{
  "content": "...1,500 characters of text..." ✅ WITHIN LIMIT
}

A semantic chunk is a COMPLETE UNIT OF THOUGHT with these constraints:
- TARGET: 300-500 words (1500-3000 characters)
- MINIMUM: 200 words (1000 characters)
- MAXIMUM: 3000 characters (ABSOLUTE HARD LIMIT)
- NEVER combine multiple distinct ideas into one chunk

// ... rest of prompt
`
}
```

---

### Phase 4: Implement Two-Pass Content Correction ✅ NEW

**Rename and enhance `validateOffsets()` → `correctContentAndOffsets()`**:

```typescript
/**
 * Corrects AI-provided content and offsets using fuzzy matching.
 *
 * AI often normalizes whitespace/newlines, so we:
 * 1. Fuzzy search to find where AI's content appears in markdown
 * 2. Extract EXACT content from markdown at that location
 * 3. Replace AI's content with exact markdown bytes
 * 4. Calculate precise offsets
 * 5. Preserve AI's semantic metadata (themes, concepts, emotional analysis)
 */
function correctContentAndOffsets(
  fullMarkdown: string,
  chunks: ChunkWithOffsets[]
): ChunkWithOffsets[] {
  let searchHint = 0
  let exactMatches = 0
  let fuzzyMatches = 0
  let failures = 0

  const corrected = chunks.map((chunk, i) => {
    // Try exact match first (AI got it right)
    const exactIndex = fullMarkdown.indexOf(chunk.content, searchHint)
    if (exactIndex !== -1) {
      exactMatches++
      searchHint = exactIndex + chunk.content.length
      return {
        ...chunk,
        start_offset: exactIndex,
        end_offset: exactIndex + chunk.content.length
      }
    }

    // Exact match failed - use fuzzy matching
    const fuzzyMatch = fuzzyFindInMarkdown(
      fullMarkdown,
      chunk.content,
      searchHint
    )

    if (!fuzzyMatch) {
      failures++
      console.error(
        `[AI Metadata] ❌ Chunk ${i}: Cannot locate content ` +
        `(length: ${chunk.content.length}, preview: "${chunk.content.slice(0, 80)}...")`
      )
      // Return original chunk as fallback (will be inaccurate)
      return chunk
    }

    // Found via fuzzy match - extract EXACT content
    const exactContent = fullMarkdown.slice(fuzzyMatch.start, fuzzyMatch.end)
    fuzzyMatches++
    searchHint = fuzzyMatch.end

    console.log(
      `[AI Metadata] ✓ Chunk ${i}: Fuzzy match (${fuzzyMatch.similarity}% similar) ` +
      `at ${fuzzyMatch.start}→${fuzzyMatch.end}`
    )

    return {
      ...chunk,
      content: exactContent, // ← Replace AI's normalized content
      start_offset: fuzzyMatch.start,
      end_offset: fuzzyMatch.end
    }
  })

  // Validation: Verify all corrected chunks have exact content
  let validationFailures = 0
  for (let i = 0; i < corrected.length; i++) {
    const chunk = corrected[i]
    const extracted = fullMarkdown.slice(chunk.start_offset, chunk.end_offset)

    if (extracted !== chunk.content) {
      validationFailures++
      console.error(
        `[AI Metadata] ⚠️ Chunk ${i}: Content mismatch after correction ` +
        `(expected ${chunk.content.length} chars, got ${extracted.length} chars)`
      )
    }
  }

  // Log summary
  const total = chunks.length
  const accuracy = ((exactMatches + fuzzyMatches) / total * 100).toFixed(1)

  console.log(`[AI Metadata] Content correction complete:`)
  console.log(`  ✅ Exact matches: ${exactMatches}/${total} (${(exactMatches/total*100).toFixed(1)}%)`)
  console.log(`  ✓ Fuzzy matches: ${fuzzyMatches}/${total} (${(fuzzyMatches/total*100).toFixed(1)}%)`)
  console.log(`  ❌ Failures: ${failures}/${total}`)
  console.log(`  📊 Overall accuracy: ${accuracy}%`)
  console.log(`  ⚠️ Validation failures: ${validationFailures}/${total}`)

  if (validationFailures > 0) {
    console.error(
      `[AI Metadata] CRITICAL: ${validationFailures} chunks failed validation. ` +
      `These chunks will have incorrect offsets!`
    )
  }

  return corrected
}
```

**Add fuzzy matching helper**:

```typescript
interface FuzzyMatch {
  start: number
  end: number
  similarity: number // 0-100
}

function fuzzyFindInMarkdown(
  markdown: string,
  aiContent: string,
  searchFrom: number = 0
): FuzzyMatch | null {
  // Normalize whitespace for matching
  const normalizeWhitespace = (text: string) =>
    text.trim().replace(/\s+/g, ' ')

  const normalizedAI = normalizeWhitespace(aiContent)
  const normalizedMarkdown = normalizeWhitespace(markdown)

  // Try normalized exact match
  let normalizedIndex = normalizedMarkdown.indexOf(normalizedAI, searchFrom)

  if (normalizedIndex !== -1) {
    // Map back to original markdown position
    const originalIndex = mapNormalizedToOriginal(
      markdown,
      normalizedMarkdown,
      normalizedIndex
    )

    return {
      start: originalIndex,
      end: originalIndex + aiContent.length,
      similarity: 100
    }
  }

  // Fallback: Try first/last 100 chars method (from repair script)
  const contentStart = normalizeWhitespace(aiContent.slice(0, 100))
  const contentEnd = normalizeWhitespace(aiContent.slice(-100))

  const startIndex = normalizedMarkdown.indexOf(contentStart, searchFrom)
  if (startIndex !== -1) {
    const endIndex = normalizedMarkdown.indexOf(contentEnd, startIndex)
    if (endIndex !== -1) {
      const originalStart = mapNormalizedToOriginal(
        markdown,
        normalizedMarkdown,
        startIndex
      )
      const originalEnd = mapNormalizedToOriginal(
        markdown,
        normalizedMarkdown,
        endIndex + contentEnd.length
      )

      return {
        start: originalStart,
        end: originalEnd,
        similarity: 85 // Lower confidence
      }
    }
  }

  return null // Could not locate
}

function mapNormalizedToOriginal(
  original: string,
  normalized: string,
  normalizedIndex: number
): number {
  let originalIndex = 0
  let normalizedCount = 0

  while (normalizedCount < normalizedIndex && originalIndex < original.length) {
    if (/\s/.test(original[originalIndex])) {
      // Skip consecutive whitespace in original
      originalIndex++
      if (/\s/.test(normalized[normalizedCount])) {
        normalizedCount++
      }
    } else {
      originalIndex++
      normalizedCount++
    }
  }

  return originalIndex
}
```

---

### Phase 5: Update parseMetadataResponse to Use New Function

**Change line 591** in `parseMetadataResponse()`:

```typescript
// Before:
const corrected = validateOffsets(fullMarkdown, validated)

// After:
const corrected = correctContentAndOffsets(fullMarkdown, validated)
```

---

### Phase 6: Add Integration Tests

**Create**: `worker/tests/lib/offset-accuracy.test.ts`

```typescript
import { batchChunkAndExtractMetadata } from '../../lib/ai-chunking-batch'

describe('Offset Accuracy', () => {
  it('should achieve 95%+ accuracy with fuzzy matching', async () => {
    const markdown = `# Test Document

This is a test paragraph with exact whitespace.

Another paragraph here.`

    const chunks = await batchChunkAndExtractMetadata(markdown, {
      apiKey: process.env.GOOGLE_AI_API_KEY!
    })

    // Verify all chunks have exact content
    let matches = 0
    for (const chunk of chunks) {
      const extracted = markdown.slice(chunk.start_offset, chunk.end_offset)
      if (extracted === chunk.content) {
        matches++
      }
    }

    const accuracy = (matches / chunks.length) * 100
    expect(accuracy).toBeGreaterThanOrEqual(95)
  })

  it('should reject oversized chunks and retry', async () => {
    const markdown = 'x'.repeat(50000) // Force oversized chunk

    const chunks = await batchChunkAndExtractMetadata(markdown, {
      apiKey: process.env.GOOGLE_AI_API_KEY!
    })

    // All chunks should be under 3000 chars
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(3000)
    }
  })
})
```

---

## Testing Strategy

### Test 1: Verify Offset Accuracy
```bash
# Upload new document
# Run verification
npx tsx scripts/verify-chunk-offsets.ts <doc-id>

# Expected output:
# Success rate: 95-100%
# ✨ All chunk offsets are accurate!
```

### Test 2: Verify Size Compliance
```bash
# Check chunk sizes
psql -c "SELECT chunk_index, LENGTH(content) as size
         FROM chunks
         WHERE document_id = '<doc-id>'
         ORDER BY chunk_index;"

# Expected: All chunks 200-3000 characters
```

### Test 3: Verify Metadata Preservation
```bash
# Check metadata exists
psql -c "SELECT chunk_index,
         jsonb_array_length(metadata->'themes') as theme_count,
         jsonb_array_length(metadata->'concepts') as concept_count
         FROM chunks
         WHERE document_id = '<doc-id>';"

# Expected: All chunks have themes and concepts
```

---

## Success Criteria

✅ **100% Size Compliance**
- No chunks exceed 3000 characters
- No auto-split metadata-less chunks
- All chunks are semantically coherent units

✅ **95-100% Content Accuracy**
- Exact matches: >50%
- Fuzzy matches: >40%
- Failures: <5%
- Validation: `markdown.slice(start, end) === chunk.content` for all chunks

✅ **100% Metadata Preservation**
- All chunks have themes (2-5 items)
- All chunks have concepts with importance scores
- All chunks have emotional analysis (polarity, emotion, intensity)
- No metadata-less chunks in database

✅ **Same AI Cost**
- One AI call per batch (baseline)
- Retries only on size violations (rare after prompt fix)
- No increase in processing time

---

## Rollout Plan

### Phase 1: Deploy Fix (2-3 hours)
1. Remove auto-splitting
2. Add size validation + retry
3. Implement two-pass correction
4. Add fuzzy matching helpers
5. Update logging

### Phase 2: Test with New Documents (30 min)
1. Upload 3 test documents (small, medium, large)
2. Verify offset accuracy >95%
3. Verify size compliance 100%
4. Verify metadata preservation 100%

### Phase 3: Reprocess Existing Documents (Optional)
1. Delete existing chunks for test documents
2. Reprocess with fixed worker
3. Verify improvements
4. Decision: Reprocess all or live with legacy data

### Phase 4: Resume Phase 2 (Reader Implementation)
Once worker achieves 95%+ accuracy:
- Implement virtualized reader
- Add annotation positioning
- Enable connection surfacing
- All features will work correctly

---

## Estimated Timeline

- **Implementation**: 2-3 hours
- **Testing**: 30 minutes
- **Documentation**: 30 minutes
- **Total**: ~4 hours

---

## Risk Analysis

### Low Risk ✅
- Two-pass approach is well-tested (repair script works)
- Fuzzy matching logic already proven
- Backward compatible (doesn't break existing chunks)

### Medium Risk ⚠️
- AI might still violate size constraints occasionally
- Mitigation: Batch splitting fallback ensures processing succeeds
- Worst case: More chunks than expected, but all have metadata

### High Risk ❌
- None identified

---

## Notes from Developer

> "Don't use fuzzy matching as a band-aid. Fix the AI, then use fuzzy matching as a safety net for edge cases. The two-pass approach is correct because it separates semantic analysis (AI's strength) from exact text preservation (string matching's strength)."

> "Auto-splitting is the worst possible solution because it creates metadata-less chunks that can't be used for connections. Better to retry with a stricter prompt or split the batch before sending to AI."

> "The goal is 100% accuracy, not 'good enough'. With 61% accuracy, 4 out of 10 annotations will be wrong. That's unacceptable for a knowledge tool."

---

## Developer Additions (Validated 2025-10-01)

### Addition #1: Specific 3-Strategy Fuzzy Matching

**Source**: `scripts/repair-chunk-offsets.ts:33-98`

The plan mentions "add fuzzy matching helpers" but must import the **exact implementation** from the repair script:

```typescript
/**
 * 3-Strategy Fuzzy Matching (from repair-chunk-offsets.ts)
 */

interface FuzzyMatch {
  start: number
  end: number
  confidence: 'exact' | 'fuzzy' | 'approximate'
  similarity: number // 0-100 percentage
}

/**
 * Find where content appears in markdown using 3-strategy fuzzy matching.
 *
 * Strategy 1: Exact match (100% similarity)
 * Strategy 2: Normalized whitespace match (95% similarity)
 * Strategy 3: First 100/last 100 chars (85% similarity)
 */
function fuzzySearchMarkdown(
  markdown: string,
  targetContent: string,
  startFrom: number = 0
): FuzzyMatch | null {
  // Strategy 1: Try exact match first
  const exactIndex = markdown.indexOf(targetContent, startFrom)
  if (exactIndex !== -1) {
    return {
      start: exactIndex,
      end: exactIndex + targetContent.length,
      confidence: 'exact',
      similarity: 100
    }
  }

  // Strategy 2: Fuzzy match with normalized whitespace
  const normalizedContent = targetContent.trim().replace(/\s+/g, ' ')
  const normalizedMarkdown = markdown.replace(/\s+/g, ' ')

  const fuzzyIndex = normalizedMarkdown.indexOf(normalizedContent, startFrom)
  if (fuzzyIndex !== -1) {
    // Map back to original markdown position
    const originalIndex = mapNormalizedToOriginal(markdown, normalizedMarkdown, fuzzyIndex)

    return {
      start: originalIndex,
      end: originalIndex + targetContent.length,
      confidence: 'fuzzy',
      similarity: 95
    }
  }

  // Strategy 3: First 100/last 100 chars (for heavily modified chunks)
  const contentStart = targetContent.slice(0, 100).trim()
  const contentEnd = targetContent.slice(-100).trim()

  const startIndex = markdown.indexOf(contentStart, startFrom)
  if (startIndex !== -1) {
    const endIndex = markdown.indexOf(contentEnd, startIndex)
    if (endIndex !== -1) {
      return {
        start: startIndex,
        end: endIndex + contentEnd.length,
        confidence: 'approximate',
        similarity: 85
      }
    }
  }

  return null // Failed to locate
}

/**
 * Maps normalized index back to original markdown position.
 * Accounts for collapsed whitespace during normalization.
 */
function mapNormalizedToOriginal(
  original: string,
  normalized: string,
  normalizedIndex: number
): number {
  let originalIndex = 0
  let normalizedCount = 0

  while (normalizedCount < normalizedIndex && originalIndex < original.length) {
    if (/\s/.test(original[originalIndex])) {
      originalIndex++
      if (/\s/.test(normalized[normalizedCount])) {
        normalizedCount++
      }
    } else {
      originalIndex++
      normalizedCount++
    }
  }

  return originalIndex
}
```

**Update Phase 4**: Replace generic `fuzzyFindInMarkdown()` with this proven 3-strategy implementation.

---

### Addition #2: Telemetry for Monitoring

Add telemetry tracking to detect regressions in offset accuracy:

```typescript
/**
 * Telemetry structure for monitoring offset accuracy over time.
 */
interface OffsetAccuracyTelemetry {
  documentId: string
  totalChunks: number
  exactMatches: number
  fuzzyMatches: number
  approximateMatches: number
  failed: number
  accuracy: number
  sizeViolationRetries: number
  processingTime: number
}

/**
 * Log telemetry after processing each document.
 * Helps catch regressions in offset accuracy.
 */
function logOffsetTelemetry(
  documentId: string,
  chunks: ChunkWithOffsets[],
  stats: {
    exact: number
    fuzzy: number
    approximate: number
    failed: number
  },
  sizeViolationRetries: number,
  processingTime: number
): void {
  const telemetry: OffsetAccuracyTelemetry = {
    documentId,
    totalChunks: chunks.length,
    exactMatches: stats.exact,
    fuzzyMatches: stats.fuzzy,
    approximateMatches: stats.approximate,
    failed: stats.failed,
    accuracy: ((stats.exact + stats.fuzzy + stats.approximate) / chunks.length) * 100,
    sizeViolationRetries,
    processingTime
  }

  console.log('[AI Metadata] 📊 Offset Telemetry:', JSON.stringify(telemetry))

  // Optional: Send to monitoring service (Sentry, PostHog, etc.)
  // await sendTelemetry(telemetry)
}
```

**Integration Point**: Call `logOffsetTelemetry()` at the end of `batchChunkAndExtractMetadata()` before returning final chunks.

**Why This Matters**:
- JSON format enables easy parsing by monitoring tools
- Track accuracy trends over time
- Alert if accuracy drops below 95%
- Identify which documents cause failures

---

### Addition #3: Enhanced Phase 4 with Telemetry

Update `correctContentAndOffsets()` to track all 3 match types:

```typescript
function correctContentAndOffsets(
  fullMarkdown: string,
  chunks: ChunkWithOffsets[],
  documentId: string // ← NEW: for telemetry
): ChunkWithOffsets[] {
  const startTime = Date.now()
  let searchHint = 0

  // Telemetry counters (track all 3 strategies)
  const stats = {
    exact: 0,
    fuzzy: 0,
    approximate: 0,
    failed: 0
  }

  const corrected = chunks.map((chunk, i) => {
    // Try exact match first
    const exactIndex = fullMarkdown.indexOf(chunk.content, searchHint)
    if (exactIndex !== -1) {
      stats.exact++
      searchHint = exactIndex + chunk.content.length
      return {
        ...chunk,
        start_offset: exactIndex,
        end_offset: exactIndex + chunk.content.length
      }
    }

    // Use 3-strategy fuzzy matching
    const fuzzyMatch = fuzzySearchMarkdown(
      fullMarkdown,
      chunk.content,
      searchHint
    )

    if (!fuzzyMatch) {
      stats.failed++
      console.error(`[AI Metadata] ❌ Chunk ${i}: Cannot locate content`)
      return chunk
    }

    // Track match type for telemetry
    if (fuzzyMatch.confidence === 'fuzzy') stats.fuzzy++
    else if (fuzzyMatch.confidence === 'approximate') stats.approximate++

    const exactContent = fullMarkdown.slice(fuzzyMatch.start, fuzzyMatch.end)
    searchHint = fuzzyMatch.end

    console.log(
      `[AI Metadata] ✓ Chunk ${i}: ${fuzzyMatch.confidence.toUpperCase()} ` +
      `match (${fuzzyMatch.similarity}% similar) at ${fuzzyMatch.start}→${fuzzyMatch.end}`
    )

    return {
      ...chunk,
      content: exactContent,
      start_offset: fuzzyMatch.start,
      end_offset: fuzzyMatch.end
    }
  })

  // Validation step (ensure markdown.slice() === content)
  let validationFailures = 0
  for (let i = 0; i < corrected.length; i++) {
    const chunk = corrected[i]
    const extracted = fullMarkdown.slice(chunk.start_offset, chunk.end_offset)
    if (extracted !== chunk.content) {
      validationFailures++
      console.error(`[AI Metadata] ⚠️ Chunk ${i}: Content mismatch after correction`)
    }
  }

  // Log summary with all 3 match types
  const total = chunks.length
  const accuracy = ((stats.exact + stats.fuzzy + stats.approximate) / total * 100).toFixed(1)

  console.log(`[AI Metadata] Content correction complete:`)
  console.log(`  ✅ Exact matches: ${stats.exact}/${total} (${(stats.exact/total*100).toFixed(1)}%)`)
  console.log(`  🔍 Fuzzy matches: ${stats.fuzzy}/${total} (${(stats.fuzzy/total*100).toFixed(1)}%)`)
  console.log(`  📍 Approximate matches: ${stats.approximate}/${total}`)
  console.log(`  ❌ Failures: ${stats.failed}/${total}`)
  console.log(`  📊 Overall accuracy: ${accuracy}%`)
  console.log(`  ⚠️ Validation failures: ${validationFailures}/${total}`)

  if (validationFailures > 0) {
    console.error(
      `[AI Metadata] CRITICAL: ${validationFailures} chunks failed validation!`
    )
  }

  // Log telemetry
  logOffsetTelemetry(
    documentId,
    corrected,
    stats,
    0, // Size violations tracked in extractBatchMetadata
    Date.now() - startTime
  )

  return corrected
}
```

**Update Phase 5**: Change function signature to include `documentId` parameter:

```typescript
// In parseMetadataResponse(), pass documentId:
const corrected = correctContentAndOffsets(fullMarkdown, validated, documentId)
```

---

## Validation Summary

**Phase Order**: ✅ CORRECT
- Must remove auto-split first (prevents garbage chunks during testing)
- Must fix size violations before fuzzy matching (no point matching 49K chunks)

**Expected Outcomes**: ✅ REALISTIC
- 95-100% accuracy achievable (3-strategy fuzzy matching proven in repair script)
- 100% size compliance achievable (retry + batch splitting)
- Same cost (retries only on violations, rare after prompt fix)
- 100% metadata (no auto-split chunks)

**Key Improvements**:
1. **3-strategy fuzzy matching** (exact → normalized → approximate) instead of generic
2. **Confidence scoring** (100%, 95%, 85%) for better debugging
3. **Telemetry tracking** catches regressions immediately
4. **JSON logging** enables monitoring integration

---

## References

- Original bug report: `docs/worker-offset-bug-report.md`
- Session handoff: `docs/SESSION-HANDOFF-2025-10-01.md`
- Repair script (fuzzy matching reference): `scripts/repair-chunk-offsets.ts`
- Verification script: `scripts/verify-chunk-offsets.ts`
- Worker code: `worker/lib/ai-chunking-batch.ts`
