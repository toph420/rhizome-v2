# PRP: YouTube Processing & Metadata Enhancement

## Executive Summary

Enhance YouTube transcript processing to deliver clean, readable content with complete metadata for improved user experience and future annotation features. This implementation adds AI-powered cleaning, comprehensive metadata generation, and fuzzy matching for precise chunk positioning.

**Value Proposition:**
- **Clean Reading**: Remove timestamp noise and formatting artifacts
- **Rich Metadata**: Enable importance badges, theme badges, and quality search
- **Future-Ready**: Chunk positioning enables Phase 2 annotation system
- **Graceful Degradation**: Never lose user data, always degrade gracefully

**Implementation Confidence: 8.5/10** - High confidence due to excellent existing infrastructure and clear implementation path. The 1.5 point deduction accounts for fuzzy matching algorithm tuning and AI prompt optimization.

**Estimated Effort:** 2-3 days for core implementation + 1 day testing/refinement

---

## 1. Context & Problem Statement

### Current State

YouTube transcript processing produces low-quality output with significant issues:

**Formatting Problems:**
```markdown
[[00:01](https://youtube.com/watch?v=abc&t=1s)] So um you know
[[00:15](https://youtube.com/watch?v=abc&t=15s)] this is uh like
[[00:30](https://youtube.com/watch?v=abc&t=30s)] really important
```

- Timestamp links embedded in reading content
- Excessive line breaks disrupt flow
- Sentence fragments not combined
- No semantic structure or headings

**Missing Metadata:**
- `importance_score`: NULL on chunks (no quality indicators)
- `summary`: NULL on chunks (no quick previews)
- `start_offset/end_offset`: Inaccurate or NULL (blocks annotations)
- `position_context`: Doesn't exist (can't re-calculate offsets)
- `word_count`: May be missing on chunks

**Impact:**
- Poor reading experience with timestamp noise
- Degraded search quality (embeddings contain URLs)
- Missing UI features (importance badges, theme badges)
- Blocked future features (annotations, highlighting, precise text positioning)

### Target Outcome

**Clean, Semantic Markdown:**
```markdown
## Introduction to Machine Learning

So this is really important - machine learning transforms how we process data. 
The fundamental concept involves training models on examples to recognize patterns.

## Key Concepts

We'll explore three main areas: supervised learning, unsupervised learning, 
and reinforcement learning. Each has distinct use cases and tradeoffs.
```

**Complete Metadata:**
```json
{
  "content": "So this is really important...",
  "importance_score": 0.85,
  "summary": "Introduction explaining ML fundamentals and pattern recognition",
  "themes": ["machine learning", "pattern recognition", "training"],
  "start_offset": 245,
  "end_offset": 456,
  "position_context": {
    "confidence": 0.92,
    "context_before": "introduction section describes how machine",
    "context_after": "learning transforms data processing methods",
    "method": "fuzzy"
  }
}
```

---

## 2. Requirements

### Functional Requirements

**FR-1: AI Transcript Cleaning**
- Remove timestamp links `[[MM:SS](url)]` from display content
- Remove filler words (um, uh, you know) and fix grammar
- Combine sentence fragments into complete thoughts
- Add semantic section headings every 3-5 minutes of content
- Preserve all semantic meaning from original transcript
- Save cleaned markdown to Storage at `{userId}/{documentId}/content.md`
- Save original transcript to Storage at `{userId}/{documentId}/source-raw.txt`

**FR-2: Enhanced Metadata Generation**
- Generate `importance_score` (0.0-1.0) for every chunk
- Generate `summary` (one sentence) for every chunk
- Generate `themes` (2-3 specific topics) for every chunk
- Calculate `word_count` (whitespace-split) for every chunk
- Ensure NO NULL values in metadata fields

**FR-3: Fuzzy Matching for Offsets**
- Calculate `start_offset` and `end_offset` for every chunk
- Use 3-tier matching: exact → trigram fuzzy → approximate
- Store `position_context` JSONB with:
  - `confidence` (0.0-1.0 score)
  - `context_before` (first 5 words before chunk)
  - `context_after` (last 5 words after chunk)
  - `method` ("exact" | "fuzzy" | "approximate")
- Accept matches with confidence ≥ 0.3 (store even approximate positions)

**FR-4: Error Handling & Graceful Degradation**
- If AI cleaning fails: Fall back to uncleaned transcript + notify user
- If fuzzy matching fails: Store NULL offsets + log warning
- If metadata generation fails: Retry with fallback prompt
- NEVER lose user data due to processing errors
- Provide "Retry Processing" option in UI

**FR-5: Timestamp Preservation**
- Extract timestamps from original transcript with context
- Store in `chunks.timestamps` JSONB (existing field)
- Enable future video navigation feature (click timestamp → jump to video)

### Non-Functional Requirements

**NFR-1: Performance**
- Processing time: <2 minutes for typical videos (10-30 min duration)
- AI cleaning: Single pass (~10-15 seconds)
- Fuzzy matching: <5 seconds for 50 chunks
- No timeout failures for videos up to 2 hours

**NFR-2: Quality**
- Fuzzy matching accuracy: >90% confidence ≥0.7 for well-structured content
- Metadata completeness: 100% of chunks have non-null values
- Cleaning quality: Preserve >99% of semantic content

**NFR-3: Reliability**
- Graceful degradation: 100% (never fail completely)
- Data preservation: 100% (always save original + processed)
- Retry success rate: >80% on transient AI failures

**NFR-4: Maintainability**
- Modular design: Cleaning, matching, metadata as separate modules
- Comprehensive tests: Unit + integration for all components
- Clear error messages: User-friendly with recovery guidance
- JSDoc documentation: All exported functions

---

## 3. Technical Approach

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ YouTube Processing Pipeline (worker/handlers/process-document.ts) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 1. Fetch Transcript (existing)            │
    │    - youtube-transcript-plus library      │
    │    - Retry logic with exponential backoff │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 2. Format to Markdown (existing)          │
    │    - Add clickable timestamps             │
    │    - Generate deep links                  │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 3. SAVE source-raw.txt (NEW)              │
    │    - Backup for fuzzy matching            │
    │    - Storage: {userId}/{docId}/source-raw.txt │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 4. AI CLEANING (NEW)                      │
    │    - Remove timestamps, fix grammar       │
    │    - Add semantic headings                │
    │    - Graceful degradation on failure      │
    │    - worker/lib/youtube-cleaning.ts       │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 5. Save content.md (existing)             │
    │    - Storage: {userId}/{docId}/content.md │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 6. ENHANCED Rechunking (MODIFY)           │
    │    - Updated prompt for metadata          │
    │    - Validate all fields non-null         │
    │    - process-document.ts rechunkMarkdown  │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 7. FUZZY MATCHING (NEW)                   │
    │    - Trigram similarity (0.75 threshold)  │
    │    - Calculate offsets & confidence       │
    │    - Extract context words (first/last 5) │
    │    - worker/lib/fuzzy-matching.ts         │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 8. Generate Embeddings (existing)         │
    │    - Vercel AI SDK batch processing       │
    │    - worker/lib/embeddings.ts             │
    └───────────────────────────────────────────┘
                            │
                            ▼
    ┌───────────────────────────────────────────┐
    │ 9. Save Chunks to Database (existing)     │
    │    - WITH position_context (NEW)          │
    │    - WITH complete metadata               │
    └───────────────────────────────────────────┘
```

### Component 1: AI Transcript Cleaning

**File:** `worker/lib/youtube-cleaning.ts` (NEW)

**Purpose:** Transform noisy YouTube transcripts into clean, readable markdown while preserving timestamps separately.

**Algorithm:**
1. Accept raw markdown with timestamp links
2. Send to Gemini 2.0 Flash with natural language prompt
3. Parse cleaned text response
4. On AI failure: Return original markdown + set `success: false`
5. On AI success: Return cleaned markdown + set `success: true`

**Prompt Strategy (Outcome-Focused):**
```
Transform this YouTube transcript into clean, readable markdown with semantic section headings.

Requirements:
- Remove filler words (um, uh, you know) and fix grammar
- Combine sentence fragments into complete thoughts
- Add descriptive section headings every 3-5 minutes of content
- Remove ALL timestamp links [[MM:SS](url)] from the content
- Preserve the natural flow and meaning of the original speech

Return only the cleaned markdown text.
```

**Key Design Decisions:**
- **No JSON response**: Plain text is simpler and more reliable
- **Graceful degradation**: Always return something usable
- **No retries**: Single attempt to keep processing fast
- **User notification**: Progress update shows cleaning status

**Error Handling:**
```typescript
try {
  const result = await ai.models.generateContent({...})
  if (!result.text || result.text.trim().length === 0) {
    console.warn('AI returned empty response')
    return { cleaned: rawMarkdown, success: false }
  }
  return { cleaned: result.text, success: true }
} catch (error) {
  console.error('AI cleaning failed:', error)
  return { cleaned: rawMarkdown, success: false }
}
```

### Component 2: Enhanced Metadata Generation

**File:** `worker/handlers/process-document.ts` (MODIFY rechunkMarkdown function)

**Purpose:** Ensure every chunk has complete metadata (importance, summary, themes).

**Current Implementation (lines 593-643):**
```typescript
async function rechunkMarkdown(ai: GoogleGenAI, markdown: string): Promise<ChunkData[]> {
  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [{ text: `Break this markdown document into semantic chunks:\n\n${markdown}` }]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                themes: { type: Type.ARRAY, items: { type: Type.STRING }},
                importance_score: { type: Type.NUMBER },
                summary: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  })
  
  const response = JSON.parse(result.text)
  return response.chunks
}
```

**Enhancement Required:**

1. **Update prompt to emphasize metadata completeness:**
```typescript
const prompt = `Break this markdown document into semantic chunks (complete thoughts, 200-2000 characters).

CRITICAL: Every chunk MUST have:
- themes: Array of 2-3 specific topics covered (e.g., ["authentication", "security"])
- importance_score: Float 0.0-1.0 representing how central this content is to the document
- summary: One sentence describing what this chunk covers

Return JSON with this exact structure: {chunks: [{content, themes, importance_score, summary}]}

${markdown}`
```

2. **Add validation after parsing:**
```typescript
const response = JSON.parse(result.text)

// Validate metadata completeness
for (const chunk of response.chunks) {
  if (!chunk.themes || chunk.themes.length === 0) {
    throw new Error('Missing themes in chunk metadata')
  }
  if (chunk.importance_score === null || chunk.importance_score === undefined) {
    throw new Error('Missing importance_score in chunk metadata')
  }
  if (!chunk.summary || chunk.summary.trim().length === 0) {
    throw new Error('Missing summary in chunk metadata')
  }
}

return response.chunks
```

**No new file needed** - This is a modification to existing rechunkMarkdown function.

### Component 3: Fuzzy Matching for Chunk Offsets

**File:** `worker/lib/fuzzy-matching.ts` (NEW)

**Purpose:** Calculate accurate chunk positions in source markdown despite AI reformatting.

**Algorithm: Three-Tier Matching Strategy**

**Tier 1: Exact String Match (Confidence 1.0)**
```typescript
const exactIndex = sourceMarkdown.indexOf(chunkContent)
if (exactIndex !== -1) {
  return {
    start_offset: exactIndex,
    end_offset: exactIndex + chunkContent.length,
    confidence: 1.0,
    method: 'exact',
    context_before: extractContextBefore(sourceMarkdown, exactIndex),
    context_after: extractContextAfter(sourceMarkdown, exactIndex + chunkContent.length)
  }
}
```

**Tier 2: Trigram Fuzzy Match (Confidence 0.7-0.99)**
```typescript
// Generate trigrams (3-character sequences)
function generateTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  
  for (let i = 0; i < normalized.length - 2; i++) {
    trigrams.add(normalized.slice(i, i + 3))
  }
  
  return trigrams
}

// Calculate Jaccard similarity
function calculateTrigramSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
}

// Sliding window search
const windowSize = chunkContent.length
const stride = Math.floor(windowSize * 0.1)  // 10% overlap
let bestMatch = null
let bestScore = 0

for (let i = 0; i < sourceMarkdown.length - windowSize; i += stride) {
  const window = sourceMarkdown.slice(i, i + windowSize)
  const similarity = calculateTrigramSimilarity(
    generateTrigrams(chunkContent),
    generateTrigrams(window)
  )
  
  if (similarity >= 0.75 && similarity > bestScore) {
    bestScore = similarity
    bestMatch = { start_offset: i, end_offset: i + windowSize, confidence: similarity }
  }
}
```

**Tier 3: Approximate Position (Confidence 0.3)**
```typescript
if (!bestMatch) {
  // Fall back to proportional positioning
  const chunkIndex = chunks.indexOf(chunk)
  const estimatedOffset = Math.floor(
    (sourceMarkdown.length / chunks.length) * chunkIndex
  )
  
  bestMatch = {
    start_offset: estimatedOffset,
    end_offset: estimatedOffset + chunkContent.length,
    confidence: 0.3,
    method: 'approximate'
  }
}
```

**Context Extraction:**
```typescript
function extractContextBefore(source: string, offset: number): string {
  const start = Math.max(0, offset - 100)
  const context = source.slice(start, offset)
  return context.trim().split(/\s+/).slice(-5).join(' ')
}

function extractContextAfter(source: string, offset: number): string {
  const end = Math.min(source.length, offset + 100)
  const context = source.slice(offset, end)
  return context.trim().split(/\s+/).slice(0, 5).join(' ')
}
```

**Key Parameters (Confirmed Defaults):**
- **Trigram threshold:** 0.75 (balanced - not too strict/loose)
- **Minimum confidence to store:** 0.3 (preserve even approximate matches)
- **Sliding window stride:** 10% of chunk length (performance vs accuracy)
- **Context window:** 100 characters before/after (±5 words typical)

**Performance Optimization:**
- Early exit on exact match (skip fuzzy matching)
- Stride reduces comparisons from O(n²) to O(n/10)
- Trigram sets cached per chunk (no recalculation)

### Database Schema Changes

**Migration:** `supabase/migrations/012_youtube_position_context.sql` (NEW)

```sql
-- Add position_context JSONB column for fuzzy matching metadata
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS position_context JSONB;

-- VERIFY: Does word_count exist on chunks table?
-- If not, add it:
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS word_count INTEGER;

-- Index for queries filtering by confidence threshold
CREATE INDEX IF NOT EXISTS idx_chunks_position_confidence 
  ON chunks ((position_context->>'confidence')::float)
  WHERE position_context IS NOT NULL;

-- Index for querying by matching method
CREATE INDEX IF NOT EXISTS idx_chunks_position_method
  ON chunks ((position_context->>'method'))
  WHERE position_context IS NOT NULL;

-- Comments
COMMENT ON COLUMN chunks.position_context IS 
  'Fuzzy matching metadata: confidence score (0-1), context_before/after words for validation, method (exact|fuzzy|approximate)';

COMMENT ON COLUMN chunks.word_count IS
  'Number of words in chunk content (whitespace-split count)';
```

**JSONB Structure:**
```json
{
  "confidence": 0.85,
  "context_before": "introduction section describes how machine",
  "context_after": "learning transforms data processing methods",
  "method": "fuzzy"
}
```

**Verification Query:**
```sql
-- Check position_context distribution
SELECT 
  position_context->>'method' as method,
  COUNT(*) as count,
  AVG((position_context->>'confidence')::float) as avg_confidence
FROM chunks
WHERE position_context IS NOT NULL
GROUP BY position_context->>'method';

-- Expected results:
-- method   | count | avg_confidence
-- exact    | 120   | 1.0
-- fuzzy    | 80    | 0.82
-- approximate | 10 | 0.3
```

---

## 4. Implementation Plan

### Phase 1: Database Foundation

**Task 1.1: Create Migration**
- File: `supabase/migrations/012_youtube_position_context.sql`
- Add `position_context` JSONB column
- Verify `word_count` exists, add if missing
- Create indexes on confidence and method
- Add helpful comments

**Task 1.2: Apply Migration**
```bash
npx supabase db reset
```

**Task 1.3: Verify Schema**
```sql
-- Check columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chunks' 
  AND column_name IN ('position_context', 'word_count');

-- Check indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'chunks' 
  AND indexname LIKE '%position%';
```

**Success Criteria:**
- Migration applies without errors
- `position_context` column exists with JSONB type
- `word_count` column exists with INTEGER type
- Both indexes created successfully

---

### Phase 2: Fuzzy Matching Implementation

**Task 2.1: Create fuzzy-matching.ts**

**File:** `worker/lib/fuzzy-matching.ts`

**Implementation:**
```typescript
/**
 * Fuzzy matching utilities for chunk offset calculation.
 * Uses trigram-based similarity to handle AI-reformatted content.
 */

export interface FuzzyMatchResult {
  start_offset: number
  end_offset: number
  confidence: number
  method: 'exact' | 'fuzzy' | 'approximate'
  context_before: string
  context_after: string
}

/**
 * Finds chunk position in source markdown using 3-tier matching strategy.
 * 
 * Tier 1: Exact string match (confidence 1.0)
 * Tier 2: Trigram fuzzy match (confidence 0.75-0.99)
 * Tier 3: Approximate position (confidence 0.3)
 * 
 * @param chunkContent - AI-generated chunk text to locate
 * @param sourceMarkdown - Original markdown with timestamps
 * @param chunkIndex - Chunk's position in array (for approximate fallback)
 * @param totalChunks - Total number of chunks (for approximate fallback)
 * @returns Match result with offsets and confidence, or null if confidence < 0.3
 * 
 * @example
 * const result = fuzzyMatchChunkToSource(
 *   "This is the content we're looking for",
 *   fullSourceMarkdown,
 *   5,
 *   20
 * )
 * // Returns: { start_offset: 1234, confidence: 0.85, method: 'fuzzy', ... }
 */
export function fuzzyMatchChunkToSource(
  chunkContent: string,
  sourceMarkdown: string,
  chunkIndex: number,
  totalChunks: number
): FuzzyMatchResult | null {
  // Tier 1: Exact match
  const exactIndex = sourceMarkdown.indexOf(chunkContent)
  if (exactIndex !== -1) {
    return {
      start_offset: exactIndex,
      end_offset: exactIndex + chunkContent.length,
      confidence: 1.0,
      method: 'exact',
      context_before: extractContextBefore(sourceMarkdown, exactIndex),
      context_after: extractContextAfter(sourceMarkdown, exactIndex + chunkContent.length)
    }
  }

  // Tier 2: Trigram fuzzy match
  const chunkTrigrams = generateTrigrams(chunkContent)
  const windowSize = chunkContent.length
  const stride = Math.max(1, Math.floor(windowSize * 0.1))  // 10% overlap, min 1
  
  let bestMatch: FuzzyMatchResult | null = null
  let bestScore = 0

  for (let i = 0; i < sourceMarkdown.length - windowSize; i += stride) {
    const window = sourceMarkdown.slice(i, i + windowSize)
    const windowTrigrams = generateTrigrams(window)
    const similarity = calculateTrigramSimilarity(chunkTrigrams, windowTrigrams)

    if (similarity >= 0.75 && similarity > bestScore) {
      bestScore = similarity
      bestMatch = {
        start_offset: i,
        end_offset: i + windowSize,
        confidence: similarity,
        method: 'fuzzy',
        context_before: extractContextBefore(sourceMarkdown, i),
        context_after: extractContextAfter(sourceMarkdown, i + windowSize)
      }
    }
  }

  if (bestMatch) {
    return bestMatch
  }

  // Tier 3: Approximate position fallback
  const estimatedOffset = Math.floor((sourceMarkdown.length / totalChunks) * chunkIndex)
  
  return {
    start_offset: estimatedOffset,
    end_offset: estimatedOffset + chunkContent.length,
    confidence: 0.3,
    method: 'approximate',
    context_before: extractContextBefore(sourceMarkdown, estimatedOffset),
    context_after: extractContextAfter(sourceMarkdown, estimatedOffset + chunkContent.length)
  }
}

/**
 * Generates trigram set from text for similarity comparison.
 * Trigrams are 3-character sliding windows normalized to lowercase.
 * 
 * @param text - Input text to generate trigrams from
 * @returns Set of trigram strings
 * 
 * @example
 * generateTrigrams("hello") // Returns Set { "hel", "ell", "llo" }
 */
function generateTrigrams(text: string): Set<string> {
  const trigrams = new Set<string>()
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim()

  for (let i = 0; i < normalized.length - 2; i++) {
    trigrams.add(normalized.slice(i, i + 3))
  }

  return trigrams
}

/**
 * Calculates Jaccard similarity between two trigram sets.
 * Similarity = |intersection| / |union|
 * 
 * @param set1 - First trigram set
 * @param set2 - Second trigram set
 * @returns Similarity score between 0.0 and 1.0
 */
function calculateTrigramSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])

  if (union.size === 0) {
    return 0
  }

  return intersection.size / union.size
}

/**
 * Extracts 5 words of context before the given offset.
 * 
 * @param source - Full source markdown
 * @param offset - Character position to extract context before
 * @returns Space-joined string of up to 5 words
 */
function extractContextBefore(source: string, offset: number): string {
  const start = Math.max(0, offset - 100)
  const context = source.slice(start, offset)
  const words = context.trim().split(/\s+/)
  return words.slice(-5).join(' ')
}

/**
 * Extracts 5 words of context after the given offset.
 * 
 * @param source - Full source markdown
 * @param offset - Character position to extract context after
 * @returns Space-joined string of up to 5 words
 */
function extractContextAfter(source: string, offset: number): string {
  const end = Math.min(source.length, offset + 100)
  const context = source.slice(offset, end)
  const words = context.trim().split(/\s+/)
  return words.slice(0, 5).join(' ')
}
```

**Task 2.2: Create fuzzy-matching.test.ts**

**File:** `worker/__tests__/fuzzy-matching.test.ts`

**Tests:**
```typescript
import { fuzzyMatchChunkToSource } from '../lib/fuzzy-matching.js'

describe('Fuzzy Matching', () => {
  describe('Exact Match (Tier 1)', () => {
    test('finds exact match with 1.0 confidence', () => {
      const chunk = 'This is a test chunk with specific content'
      const source = `Preamble text here.\n\n${chunk}\n\nFollowing text here.`

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(1.0)
      expect(result!.method).toBe('exact')
      expect(result!.start_offset).toBeGreaterThan(0)
      expect(source.slice(result!.start_offset, result!.end_offset)).toBe(chunk)
    })

    test('extracts correct context words', () => {
      const chunk = 'test chunk'
      const source = 'one two three four five test chunk six seven eight nine ten'

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result!.context_before).toBe('one two three four five')
      expect(result!.context_after).toBe('six seven eight nine ten')
    })
  })

  describe('Fuzzy Match (Tier 2)', () => {
    test('finds fuzzy match above 0.75 threshold', () => {
      const chunk = 'this is a test chunk with content'
      const source = 'this is test chunk with some content'  // Missing word "a", extra word "some"

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(result!.confidence).toBeGreaterThanOrEqual(0.75)
      expect(result!.confidence).toBeLessThan(1.0)
      expect(result!.method).toBe('fuzzy')
    })

    test('handles minor reformatting', () => {
      const chunk = 'The quick brown fox jumps over the lazy dog'
      const source = 'The quick brown fox jumped over a lazy dog'  // Changed tense, added article

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(result!.confidence).toBeGreaterThan(0.75)
    })

    test('prefers higher confidence match when multiple candidates', () => {
      const chunk = 'machine learning algorithms'
      const source = `
        machine learning concepts are introduced first.
        Then machine learning algorithms are explained in detail.
        Finally machine learning applications are discussed.
      `

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(source.slice(result!.start_offset, result!.end_offset)).toContain('algorithms')
    })
  })

  describe('Approximate Match (Tier 3)', () => {
    test('falls back to approximate when no fuzzy match found', () => {
      const chunk = 'completely different content that does not exist in source'
      const source = 'The source contains totally unrelated text about other topics entirely'

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(0.3)
      expect(result!.method).toBe('approximate')
    })

    test('uses chunk index for proportional positioning', () => {
      const chunk = 'unmatched content'
      const source = 'a'.repeat(1000)  // 1000 character source
      
      // Chunk 5 of 10 should be positioned around 500
      const result = fuzzyMatchChunkToSource(chunk, source, 5, 10)

      expect(result).not.toBeNull()
      expect(result!.start_offset).toBeGreaterThan(400)
      expect(result!.start_offset).toBeLessThan(600)
    })
  })

  describe('Edge Cases', () => {
    test('handles empty chunk gracefully', () => {
      const chunk = ''
      const source = 'some source text'

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()  // Should return approximate
      expect(result!.confidence).toBe(0.3)
    })

    test('handles chunk longer than source', () => {
      const chunk = 'very long chunk text that exceeds source length significantly'
      const source = 'short'

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(result!.method).toBe('approximate')
    })

    test('handles special characters correctly', () => {
      const chunk = 'Code: `const x = 10;` and **bold** text'
      const source = `Random text.\n\n${chunk}\n\nMore text.`

      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)

      expect(result).not.toBeNull()
      expect(result!.confidence).toBe(1.0)
    })
  })

  describe('Performance', () => {
    test('completes fuzzy matching in reasonable time', () => {
      const chunk = 'Looking for this needle in the haystack'
      const source = 'Beginning. '.repeat(100) + chunk + ' Ending.'.repeat(100)

      const start = Date.now()
      const result = fuzzyMatchChunkToSource(chunk, source, 0, 1)
      const elapsed = Date.now() - start

      expect(result).not.toBeNull()
      expect(elapsed).toBeLessThan(100)  // Should complete in <100ms
    })
  })
})
```

**Task 2.3: Run Tests**
```bash
npm test fuzzy-matching.test.ts
```

**Success Criteria:**
- All 12+ test cases pass
- Exact matches return confidence 1.0
- Fuzzy matches return confidence ≥0.75
- Approximate fallback returns confidence 0.3
- Performance test completes in <100ms

---

### Phase 3: AI Cleaning Implementation

**Task 3.1: Create youtube-cleaning.ts**

**File:** `worker/lib/youtube-cleaning.ts`

**Implementation:**
```typescript
import type { GoogleGenAI } from '@google/genai'

/**
 * Result of YouTube transcript cleaning operation.
 */
export interface CleaningResult {
  /** Cleaned markdown text (or original if cleaning failed) */
  cleaned: string
  /** Whether AI cleaning succeeded */
  success: boolean
  /** Error message if cleaning failed */
  error?: string
}

/**
 * Cleans YouTube transcript with AI while preserving semantic content.
 * Gracefully degrades to uncleaned markdown on AI failure.
 * 
 * Removes:
 * - Timestamp links [[MM:SS](url)]
 * - Filler words (um, uh, you know)
 * - Excessive line breaks
 * 
 * Adds:
 * - Semantic section headings every 3-5 minutes
 * - Combined sentence fragments into complete thoughts
 * - Proper grammar and punctuation
 * 
 * @param ai - Initialized GoogleGenAI client
 * @param rawMarkdown - Original transcript markdown with timestamps
 * @returns Cleaning result with cleaned text and success status
 * 
 * @example
 * const { cleaned, success } = await cleanYoutubeTranscript(ai, rawMarkdown)
 * if (success) {
 *   console.log('Transcript cleaned successfully')
 * } else {
 *   console.warn('Using uncleaned transcript')
 * }
 */
export async function cleanYoutubeTranscript(
  ai: GoogleGenAI,
  rawMarkdown: string
): Promise<CleaningResult> {
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',  // Fast model for cleaning
      contents: [{
        parts: [{
          text: YOUTUBE_CLEANING_PROMPT + '\n\n' + rawMarkdown
        }]
      }],
      config: {
        temperature: 0.3,  // Low temperature for consistent formatting
        maxOutputTokens: 8192  // Support long transcripts
      }
    })

    // Validate response
    if (!result.text || result.text.trim().length === 0) {
      console.warn('[youtube-cleaning] AI returned empty response, using original')
      return {
        cleaned: rawMarkdown,
        success: false,
        error: 'AI returned empty response'
      }
    }

    // Sanity check: cleaned text should be roughly same length (±30%)
    const lengthRatio = result.text.length / rawMarkdown.length
    if (lengthRatio < 0.5 || lengthRatio > 1.5) {
      console.warn(`[youtube-cleaning] Suspicious length change: ${lengthRatio.toFixed(2)}x, using original`)
      return {
        cleaned: rawMarkdown,
        success: false,
        error: `Suspicious length change: ${lengthRatio.toFixed(2)}x`
      }
    }

    return {
      cleaned: result.text,
      success: true
    }

  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    console.error('[youtube-cleaning] AI cleaning failed:', err.message)
    
    return {
      cleaned: rawMarkdown,
      success: false,
      error: err.message
    }
  }
}

/**
 * AI prompt for YouTube transcript cleaning.
 * Outcome-focused natural language approach.
 */
const YOUTUBE_CLEANING_PROMPT = `Transform this YouTube transcript into clean, readable markdown with semantic section headings.

Requirements:
- Remove filler words (um, uh, you know, like) and fix grammar
- Combine sentence fragments into complete thoughts
- Add descriptive section headings (##) every 3-5 minutes of content
- Remove ALL timestamp links in format [[MM:SS](url)] from the content
- Preserve the natural flow and meaning of the original speech
- Maintain paragraph breaks for readability

Return only the cleaned markdown text. Do not add any preamble or explanation.`
```

**Task 3.2: Create youtube-cleaning.test.ts**

**File:** `worker/__tests__/youtube-cleaning.test.ts`

**Tests:**
```typescript
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'
import { GoogleGenAI } from '@google/genai'

// Mock GoogleGenAI client for testing
const mockAI = {
  models: {
    generateContent: jest.fn()
  }
} as unknown as GoogleGenAI

describe('YouTube Transcript Cleaning', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Successful Cleaning', () => {
    test('removes timestamp links from content', async () => {
      const raw = '[[00:30](https://youtube.com/watch?v=abc&t=30s)] This is content'
      const cleaned = 'This is content'

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: cleaned
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(true)
      expect(result.cleaned).not.toContain('[[00:30]')
      expect(result.cleaned).toBe(cleaned)
    })

    test('adds semantic headings', async () => {
      const raw = 'First topic content. Second topic content. Third topic content.'
      const cleaned = '## First Topic\n\nFirst topic content.\n\n## Second Topic\n\nSecond topic content.'

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: cleaned
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(true)
      expect(result.cleaned).toContain('## ')
    })

    test('removes filler words', async () => {
      const raw = 'So um you know this is uh like really important'
      const cleaned = 'This is really important'

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: cleaned
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(true)
      expect(result.cleaned).not.toContain('um')
      expect(result.cleaned).not.toContain('uh')
    })
  })

  describe('Graceful Degradation', () => {
    test('returns original on empty AI response', async () => {
      const raw = 'Original content'

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: ''
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(false)
      expect(result.cleaned).toBe(raw)
      expect(result.error).toContain('empty response')
    })

    test('returns original on AI exception', async () => {
      const raw = 'Original content'

      mockAI.models.generateContent = jest.fn().mockRejectedValue(
        new Error('API rate limit exceeded')
      )

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(false)
      expect(result.cleaned).toBe(raw)
      expect(result.error).toBe('API rate limit exceeded')
    })

    test('returns original on suspicious length change', async () => {
      const raw = 'Original content with reasonable length'
      const cleaned = 'Too short'  // <50% of original length

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: cleaned
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(false)
      expect(result.cleaned).toBe(raw)
      expect(result.error).toContain('Suspicious length change')
    })
  })

  describe('Edge Cases', () => {
    test('handles very short transcripts', async () => {
      const raw = 'Hello world'
      const cleaned = 'Hello world'

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: cleaned
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(true)
    })

    test('handles transcripts with special characters', async () => {
      const raw = 'Code: `const x = 10;` and **bold** text'
      const cleaned = 'Code: const x equals 10 and bold text'

      mockAI.models.generateContent = jest.fn().mockResolvedValue({
        text: cleaned
      })

      const result = await cleanYoutubeTranscript(mockAI, raw)

      expect(result.success).toBe(true)
    })
  })
})
```

**Task 3.3: Run Tests**
```bash
npm test youtube-cleaning.test.ts
```

**Success Criteria:**
- All 9+ test cases pass
- Successful cleaning returns `success: true`
- Failed cleaning returns `success: false` with original text
- Error messages captured in `error` field
- No exceptions thrown (all errors caught)

---

### Phase 4: Pipeline Integration

**Task 4.1: Modify process-document.ts YouTube Case**

**File:** `worker/handlers/process-document.ts` (lines 67-96)

**Current Implementation:**
```typescript
case 'youtube': {
  await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching YouTube transcript')
  
  const videoId = extractVideoId(sourceUrl)
  if (!videoId) {
    throw new Error('YOUTUBE_INVALID_ID: Could not extract video ID from URL')
  }
  
  const transcript = await fetchTranscriptWithRetry(videoId)
  markdown = formatTranscriptToMarkdown(transcript, sourceUrl)
  
  break
}
```

**Enhanced Implementation:**
```typescript
case 'youtube': {
  await updateProgress(supabase, job.id, 10, 'download', 'fetching', 'Fetching YouTube transcript')
  
  // 1. Extract video ID
  const videoId = extractVideoId(sourceUrl)
  if (!videoId) {
    throw new Error('YOUTUBE_INVALID_ID: Could not extract video ID from URL')
  }
  
  // 2. Fetch transcript with retry logic
  const transcript = await fetchTranscriptWithRetry(videoId)
  markdown = formatTranscriptToMarkdown(transcript, sourceUrl)
  
  // 3. SAVE source-raw.txt backup for fuzzy matching
  await updateProgress(supabase, job.id, 15, 'extract', 'backup', 'Saving original transcript')
  const rawBlob = new Blob([markdown], { type: 'text/plain' })
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/source-raw.txt`, rawBlob, { 
      contentType: 'text/plain',
      upsert: true 
    })
  
  // 4. AI CLEANING with graceful degradation
  await updateProgress(supabase, job.id, 20, 'extract', 'cleaning', 'AI cleaning transcript')
  const { cleaned, success: cleaningSuccess, error: cleaningError } = await cleanYoutubeTranscript(ai, markdown)
  
  if (cleaningSuccess) {
    markdown = cleaned
    await updateProgress(supabase, job.id, 25, 'extract', 'cleaned', 'Transcript cleaned successfully')
  } else {
    // Notify user but continue with uncleaned
    console.warn('[youtube-processing] Using uncleaned transcript:', cleaningError)
    await updateProgress(
      supabase, 
      job.id, 
      25, 
      'extract', 
      'warning', 
      `Using uncleaned transcript - ${cleaningError || 'cleaning failed'}`
    )
  }
  
  break
}
```

**Task 4.2: Update rechunkMarkdown Function**

**File:** `worker/handlers/process-document.ts` (lines 593-643)

**Enhancement:**
```typescript
async function rechunkMarkdown(ai: GoogleGenAI, markdown: string): Promise<ChunkData[]> {
  const prompt = `Break this markdown document into semantic chunks (complete thoughts, 200-2000 characters).

CRITICAL: Every chunk MUST have:
- themes: Array of 2-3 specific topics covered (e.g., ["authentication", "security"])
- importance_score: Float 0.0-1.0 representing how central this content is to the document
- summary: One sentence describing what this chunk covers

Return JSON with this exact structure: {chunks: [{content, themes, importance_score, summary}]}

${markdown}`

  const result = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [{ text: prompt }]
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                themes: { type: Type.ARRAY, items: { type: Type.STRING }},
                importance_score: { type: Type.NUMBER },
                summary: { type: Type.STRING }
              },
              required: ['content', 'themes', 'importance_score', 'summary']
            }
          }
        },
        required: ['chunks']
      }
    }
  })

  const response = JSON.parse(result.text)
  
  // Validate metadata completeness
  for (let i = 0; i < response.chunks.length; i++) {
    const chunk = response.chunks[i]
    
    if (!chunk.themes || chunk.themes.length === 0) {
      console.warn(`Chunk ${i}: Missing themes, adding default`)
      chunk.themes = ['general']
    }
    
    if (chunk.importance_score === null || chunk.importance_score === undefined) {
      console.warn(`Chunk ${i}: Missing importance_score, adding default`)
      chunk.importance_score = 0.5
    }
    
    if (!chunk.summary || chunk.summary.trim().length === 0) {
      console.warn(`Chunk ${i}: Missing summary, generating from content`)
      chunk.summary = chunk.content.slice(0, 100).trim() + '...'
    }
  }

  return response.chunks
}
```

**Task 4.3: Add Fuzzy Matching to Chunk Processing**

**File:** `worker/handlers/process-document.ts` (after rechunking, before embeddings)

**Location:** Around line 350 (after chunks = await rechunkMarkdown(...))

**Implementation:**
```typescript
// After semantic rechunking
chunks = await rechunkMarkdown(ai, markdown)
await updateProgress(supabase, job.id, 45, 'extract', 'complete', `Created ${chunks.length} semantic chunks`)

// FUZZY MATCHING: Calculate chunk offsets
if (sourceType === 'youtube') {
  await updateProgress(supabase, job.id, 50, 'extract', 'positioning', 'Calculating chunk positions')
  
  // Load source-raw.txt for offset calculation
  const { data: rawBlob, error: downloadError } = await supabase.storage
    .from('documents')
    .download(`${storagePath}/source-raw.txt`)
  
  if (downloadError) {
    console.error('[fuzzy-matching] Failed to load source-raw.txt:', downloadError)
  } else {
    const sourceRaw = await rawBlob.text()
    
    // Calculate offsets and position context for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const match = fuzzyMatchChunkToSource(
        chunk.content,
        sourceRaw,
        i,
        chunks.length
      )
      
      if (match) {
        chunk.start_offset = match.start_offset
        chunk.end_offset = match.end_offset
        chunk.position_context = {
          confidence: match.confidence,
          context_before: match.context_before,
          context_after: match.context_after,
          method: match.method
        }
      } else {
        console.warn(`[fuzzy-matching] No match found for chunk ${i}, leaving offsets null`)
      }
    }
    
    // Log confidence distribution for monitoring
    const confidenceDistribution = chunks
      .filter(c => c.position_context)
      .reduce((acc, c) => {
        const method = c.position_context!.method
        acc[method] = (acc[method] || 0) + 1
        return acc
      }, {} as Record<string, number>)
    
    console.log('[fuzzy-matching] Confidence distribution:', confidenceDistribution)
  }
}

// Extract timestamps with context (existing code - keep this)
for (const chunk of chunks) {
  const timestamps = extractTimestampsWithContext(chunk.content)
  if (timestamps.length > 0) {
    chunk.timestamps = timestamps
  }
}
```

**Task 4.4: Update Chunk Insertion to Include position_context**

**File:** `worker/handlers/process-document.ts` (chunk insertion loop, around line 470)

**Current Implementation:**
```typescript
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i]
  const chunkData: any = {
    document_id,
    content: chunk.content,
    embedding: embeddings[i],
    chunk_index: i,
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary
  }
  
  if (chunk.timestamps) {
    chunkData.timestamps = chunk.timestamps
  }
  
  await supabase.from('chunks').insert(chunkData)
}
```

**Enhanced Implementation:**
```typescript
for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i]
  
  // Calculate word count
  const wordCount = chunk.content.trim().split(/\s+/).length
  
  const chunkData: any = {
    document_id,
    content: chunk.content,
    embedding: embeddings[i],
    chunk_index: i,
    chunk_type: 'semantic',
    
    // Position data
    start_offset: chunk.start_offset ?? null,
    end_offset: chunk.end_offset ?? null,
    
    // Metadata (now guaranteed non-null by rechunkMarkdown validation)
    themes: chunk.themes,
    importance_score: chunk.importance_score,
    summary: chunk.summary,
    word_count: wordCount,
    
    // NEW: Position context for fuzzy matching
    position_context: chunk.position_context ?? null,
    
    // Timestamps (if present)
    timestamps: chunk.timestamps ?? null
  }
  
  await supabase.from('chunks').insert(chunkData)
}
```

**Task 4.5: Add Imports**

**File:** `worker/handlers/process-document.ts` (top of file)

**Add:**
```typescript
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'
import { fuzzyMatchChunkToSource } from '../lib/fuzzy-matching.js'
```

---

### Phase 5: Validation & Testing

**Task 5.1: Run Unit Tests**
```bash
# Run all new tests
npm test fuzzy-matching.test.ts
npm test youtube-cleaning.test.ts

# Verify existing tests still pass
npm test embeddings.test.ts
npm test multi-format-integration.test.ts
```

**Task 5.2: Run Integration Test with Real YouTube Video**

**Test Script:** `worker/__tests__/youtube-metadata-enhancement.test.ts` (NEW)

```typescript
import { processDocument } from '../handlers/process-document.js'

describe('YouTube Processing with Metadata Enhancement', () => {
  test('processes short YouTube video with complete metadata', async () => {
    const documentId = 'test-doc-123'
    const storagePath = 'test-user/test-doc-123'
    const sourceUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'  // Use real test video
    
    // Run processing pipeline
    await processDocument({
      document_id: documentId,
      storage_path: storagePath,
      source_type: 'youtube',
      source_url: sourceUrl
    })
    
    // Verify chunks in database
    const { data: chunks } = await supabase
      .from('chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_index')
    
    expect(chunks.length).toBeGreaterThan(0)
    
    // Verify every chunk has complete metadata
    for (const chunk of chunks) {
      expect(chunk.importance_score).not.toBeNull()
      expect(chunk.importance_score).toBeGreaterThanOrEqual(0.0)
      expect(chunk.importance_score).toBeLessThanOrEqual(1.0)
      
      expect(chunk.summary).not.toBeNull()
      expect(chunk.summary.length).toBeGreaterThan(0)
      
      expect(chunk.themes).not.toBeNull()
      expect(Array.isArray(chunk.themes)).toBe(true)
      expect(chunk.themes.length).toBeGreaterThan(0)
      
      expect(chunk.word_count).not.toBeNull()
      expect(chunk.word_count).toBeGreaterThan(0)
      
      // Position context (should exist for most chunks)
      if (chunk.position_context) {
        expect(chunk.position_context.confidence).toBeGreaterThanOrEqual(0.3)
        expect(chunk.position_context.confidence).toBeLessThanOrEqual(1.0)
        expect(['exact', 'fuzzy', 'approximate']).toContain(chunk.position_context.method)
      }
    }
    
    // Verify source-raw.txt backup exists
    const { data: rawData } = await supabase.storage
      .from('documents')
      .download(`${storagePath}/source-raw.txt`)
    
    expect(rawData).not.toBeNull()
    
    // Verify cleaned content.md exists
    const { data: cleanedData } = await supabase.storage
      .from('documents')
      .download(`${storagePath}/content.md`)
    
    expect(cleanedData).not.toBeNull()
    const cleanedText = await cleanedData.text()
    
    // Cleaned text should NOT contain timestamp links
    expect(cleanedText).not.toMatch(/\[\[\d{1,2}:\d{2}\]\(https?:\/\//)
  })
  
  test('gracefully handles AI cleaning failure', async () => {
    // Mock AI failure by using invalid video ID
    const documentId = 'test-doc-456'
    
    // This test would need to mock the AI client to force failure
    // Implementation depends on your test setup
  })
})
```

**Task 5.3: Verify Database Schema**

**Query:**
```sql
-- Check position_context data
SELECT 
  document_id,
  chunk_index,
  position_context->>'method' as method,
  (position_context->>'confidence')::float as confidence,
  word_count,
  importance_score,
  LENGTH(summary) as summary_length
FROM chunks
WHERE document_id = 'test-doc-123'
ORDER BY chunk_index;

-- Expected output:
-- chunk_index | method | confidence | word_count | importance_score | summary_length
-- 0           | exact  | 1.0        | 150        | 0.85            | 75
-- 1           | fuzzy  | 0.82       | 200        | 0.65            | 68
-- 2           | fuzzy  | 0.78       | 175        | 0.90            | 82
```

**Task 5.4: Run Linting and Type Checking**
```bash
# Type check all new code
npm run build

# Lint with JSDoc validation
npm run lint

# Fix any auto-fixable issues
npm run lint -- --fix
```

**Task 5.5: Manual Testing with Various Video Lengths**

**Test Cases:**
1. **Short video (<5 min)**: https://youtube.com/watch?v=...
   - Expected: 5-10 chunks, all with confidence >0.7
   
2. **Medium video (10-30 min)**: https://youtube.com/watch?v=...
   - Expected: 20-50 chunks, mostly fuzzy matches
   
3. **Long video (1+ hour)**: https://youtube.com/watch?v=...
   - Expected: 100+ chunks, mixed confidence levels

**Verification Steps:**
```bash
# 1. Upload video via UI
# 2. Monitor processing in dock
# 3. Verify completion without errors
# 4. Check preview page for metadata display
# 5. Query database for confidence distribution

# Query for monitoring
SELECT 
  COUNT(*) as total_chunks,
  COUNT(CASE WHEN (position_context->>'confidence')::float >= 0.9 THEN 1 END) as high_confidence,
  COUNT(CASE WHEN (position_context->>'confidence')::float BETWEEN 0.7 AND 0.9 THEN 1 END) as medium_confidence,
  COUNT(CASE WHEN (position_context->>'confidence')::float < 0.7 THEN 1 END) as low_confidence,
  AVG((position_context->>'confidence')::float) as avg_confidence
FROM chunks
WHERE document_id = 'YOUR_DOCUMENT_ID';
```

---

## 5. Error Handling & Edge Cases

### Error Scenarios & Responses

**Scenario 1: AI Cleaning Returns Empty Response**
```typescript
// In youtube-cleaning.ts
if (!result.text || result.text.trim().length === 0) {
  return {
    cleaned: rawMarkdown,
    success: false,
    error: 'AI returned empty response'
  }
}
```
**User Impact:** Sees "Using uncleaned transcript" in processing dock, can retry processing.

---

**Scenario 2: AI Cleaning Returns Malformed Content**
```typescript
// Length sanity check
const lengthRatio = result.text.length / rawMarkdown.length
if (lengthRatio < 0.5 || lengthRatio > 1.5) {
  return {
    cleaned: rawMarkdown,
    success: false,
    error: `Suspicious length change: ${lengthRatio.toFixed(2)}x`
  }
}
```
**User Impact:** Original transcript used, no data loss, retry available.

---

**Scenario 3: Fuzzy Matching Finds No Confident Match**
```typescript
// In fuzzy-matching.ts
if (!bestMatch && confidence < 0.75) {
  // Fall back to approximate
  return {
    start_offset: estimatedOffset,
    confidence: 0.3,
    method: 'approximate'
  }
}
```
**User Impact:** Chunk stored with low-confidence offsets, future re-calculation possible.

---

**Scenario 4: Metadata Generation Missing Fields**
```typescript
// In rechunkMarkdown
for (const chunk of response.chunks) {
  if (!chunk.themes || chunk.themes.length === 0) {
    chunk.themes = ['general']  // Safe default
  }
  if (chunk.importance_score === null) {
    chunk.importance_score = 0.5  // Neutral default
  }
  if (!chunk.summary) {
    chunk.summary = chunk.content.slice(0, 100) + '...'  // Fallback
  }
}
```
**User Impact:** Always get usable metadata, never NULL values.

---

**Scenario 5: source-raw.txt Backup Fails to Save**
```typescript
try {
  await supabase.storage
    .from('documents')
    .upload(`${storagePath}/source-raw.txt`, rawBlob)
} catch (error) {
  console.error('[backup] Failed to save source-raw.txt:', error)
  // Continue processing - not critical for user experience
}
```
**User Impact:** Fuzzy matching skipped with warning, processing continues.

---

**Scenario 6: Very Long Video (2+ Hours)**
```typescript
// Add timeout protection in process-document.ts
const PROCESSING_TIMEOUT = 10 * 60 * 1000  // 10 minutes max

const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Processing timeout exceeded')), PROCESSING_TIMEOUT)
)

const result = await Promise.race([
  processYoutubeVideo(documentId, sourceUrl),
  timeoutPromise
])
```
**User Impact:** Clear timeout error message, option to retry or split video.

---

### Graceful Degradation Priority

**Tier 1 (Critical - Must Work):**
- Save original transcript (source-raw.txt)
- Save chunks to database
- Generate embeddings

**Tier 2 (Important - Degrade Gracefully):**
- AI cleaning → Use uncleaned on failure
- Fuzzy matching → Use approximate positions on failure
- Metadata generation → Use safe defaults on missing fields

**Tier 3 (Nice-to-Have - Can Skip):**
- Timestamp extraction → Skip if none found
- Progress updates → Continue processing if update fails

---

## 6. Performance Considerations

### Expected Processing Times

**Short Video (<5 min, ~5-10 chunks):**
- Transcript fetch: 2-3 seconds
- AI cleaning: 5-8 seconds
- Rechunking: 5-8 seconds
- Fuzzy matching: 1-2 seconds
- Embeddings: 3-5 seconds
- **Total: ~20-30 seconds**

**Medium Video (10-30 min, ~20-50 chunks):**
- Transcript fetch: 3-5 seconds
- AI cleaning: 10-15 seconds
- Rechunking: 10-15 seconds
- Fuzzy matching: 3-5 seconds
- Embeddings: 5-10 seconds
- **Total: ~35-55 seconds**

**Long Video (1+ hour, ~100+ chunks):**
- Transcript fetch: 5-8 seconds
- AI cleaning: 20-30 seconds
- Rechunking: 20-30 seconds
- Fuzzy matching: 8-12 seconds
- Embeddings: 15-20 seconds (batched)
- **Total: ~70-100 seconds**

### Optimization Strategies

**1. Parallel Operations Where Possible**
```typescript
// After markdown saved to storage, run embeddings and fuzzy matching in parallel
const [embeddings, _] = await Promise.all([
  generateEmbeddings(chunks.map(c => c.content)),
  calculateFuzzyMatches(chunks, sourceRaw)  // Independent of embeddings
])
```

**2. Early Exit on Exact Matches**
```typescript
// In fuzzy-matching.ts
const exactIndex = sourceMarkdown.indexOf(chunkContent)
if (exactIndex !== -1) {
  return { confidence: 1.0, start_offset: exactIndex }  // Skip fuzzy logic
}
```

**3. Configurable Stride for Large Videos**
```typescript
// Adjust stride based on video length
const stride = chunks.length > 100 
  ? Math.floor(windowSize * 0.2)  // 20% for long videos (fewer comparisons)
  : Math.floor(windowSize * 0.1)  // 10% for normal videos (higher accuracy)
```

**4. Rate Limiting Awareness**
```typescript
// Embeddings already has 1s delay between batches (100 chunks/batch)
// Gemini API: 60 RPM free tier → Already handled by existing retry logic
```

### Memory Management

**Large Transcript Handling:**
```typescript
// Don't load entire source into memory multiple times
let sourceRaw: string | null = null

if (sourceType === 'youtube') {
  const { data: rawBlob } = await downloadSourceRaw(storagePath)
  sourceRaw = await rawBlob.text()
  
  // Process chunks with shared reference
  for (const chunk of chunks) {
    const match = fuzzyMatchChunkToSource(chunk.content, sourceRaw, ...)
    // sourceRaw reference reused, not copied
  }
  
  // Clear reference after processing
  sourceRaw = null
}
```

---

## 7. Acceptance Criteria

### Functional Acceptance

**✅ YouTube transcripts display without timestamp links**
- Manual verification: Open processed document, no `[[MM:SS](url)]` visible
- Query: `SELECT content FROM chunks WHERE content LIKE '%[[%:%](http%'`
- Expected: 0 results

**✅ Cleaned markdown has semantic section headings**
- Manual verification: `content.md` contains `## Heading` structures
- Pattern: Headings appear every 3-5 minutes (estimated ~500-1000 chars)

**✅ All chunks have non-null metadata fields**
```sql
SELECT COUNT(*) as total,
       COUNT(importance_score) as has_importance,
       COUNT(summary) as has_summary,
       COUNT(CASE WHEN themes IS NOT NULL AND jsonb_array_length(themes) > 0 THEN 1 END) as has_themes,
       COUNT(word_count) as has_word_count
FROM chunks
WHERE document_id = 'test-doc-id';

-- Expected: total = has_importance = has_summary = has_themes = has_word_count
```

**✅ All chunks have calculated offsets and position_context**
```sql
SELECT COUNT(*) as total,
       COUNT(start_offset) as has_start,
       COUNT(end_offset) as has_end,
       COUNT(position_context) as has_context
FROM chunks
WHERE document_id = 'test-doc-id';

-- Expected: total = has_start = has_end = has_context (or close, some may be null)
```

**✅ Timestamps preserved in separate field**
```sql
SELECT COUNT(*) as chunks_with_timestamps
FROM chunks
WHERE document_id = 'test-doc-id'
  AND timestamps IS NOT NULL;

-- Expected: Most/all chunks have timestamps array
```

**✅ source-raw.txt backup exists**
```bash
# Via Supabase Storage API
curl "${SUPABASE_URL}/storage/v1/object/documents/${userId}/${docId}/source-raw.txt"
# Expected: 200 OK with content
```

**✅ Preview page shows badges correctly**
- Manual verification: Open `/documents/[id]/preview`
- Check: Importance badges display (0.0-1.0 visual indicator)
- Check: Theme badges display (comma-separated topics)

### Non-Functional Acceptance

**✅ Processing completes within time limits**
- Short video: <45 seconds
- Medium video: <90 seconds
- Long video: <2 minutes

**✅ Fuzzy matching accuracy meets threshold**
```sql
SELECT 
  AVG((position_context->>'confidence')::float) as avg_confidence,
  COUNT(CASE WHEN (position_context->>'confidence')::float >= 0.7 THEN 1 END) * 100.0 / COUNT(*) as pct_high_confidence
FROM chunks
WHERE document_id = 'test-doc-id'
  AND position_context IS NOT NULL;

-- Expected: avg_confidence > 0.75, pct_high_confidence > 70%
```

**✅ No data loss on errors**
- Test: Force AI failure (mock error)
- Verify: Original transcript saved to source-raw.txt
- Verify: Chunks created with default metadata
- Verify: Document marked as processed (not failed)

**✅ All tests pass**
```bash
npm test
# Expected output:
# Test Suites: 4 passed, 4 total
# Tests:       28 passed, 28 total
# Snapshots:   0 total
# Time:        12.345 s
```

**✅ Type checking succeeds**
```bash
npm run build
# Expected: No TypeScript errors
```

**✅ Linting succeeds with JSDoc**
```bash
npm run lint
# Expected: 0 errors, 0 warnings
```

---

## 8. Rollback Plan

### If Critical Issues Found in Production

**Step 1: Disable YouTube Processing**
```typescript
// In process-document.ts, youtube case
case 'youtube': {
  throw new Error('YOUTUBE_TEMPORARILY_DISABLED: YouTube processing is under maintenance')
}
```

**Step 2: Revert Migration (if needed)**
```sql
-- Migration: supabase/migrations/013_rollback_position_context.sql
ALTER TABLE chunks DROP COLUMN IF EXISTS position_context;
ALTER TABLE chunks DROP COLUMN IF EXISTS word_count;  -- Only if added in 012

DROP INDEX IF EXISTS idx_chunks_position_confidence;
DROP INDEX IF EXISTS idx_chunks_position_method;
```

**Step 3: Revert Code Changes**
```bash
git revert <commit-hash-of-feature>
npm run build
npm test
```

**Step 4: Re-enable with Old Logic**
```typescript
// Temporarily use old rechunking without metadata enhancement
case 'youtube': {
  const transcript = await fetchTranscriptWithRetry(videoId)
  markdown = formatTranscriptToMarkdown(transcript, sourceUrl)
  chunks = await simpleMarkdownChunking(markdown)  // Old heading-based approach
  break
}
```

### Partial Rollback Options

**Option A: Disable Only Cleaning**
- Keep metadata enhancement
- Skip `cleanYoutubeTranscript` call
- Use raw markdown for rechunking

**Option B: Disable Only Fuzzy Matching**
- Keep cleaning and metadata
- Skip offset calculation
- Leave `position_context` null

**Option C: Use Fallback Prompt**
- Keep pipeline architecture
- Switch to simpler AI prompts
- Reduce metadata requirements

---

## 9. Future Enhancements (Out of Scope)

### Phase 2: Annotation System
- Use `position_context` for precise text highlighting
- Click chunk → highlight in markdown viewer
- Store annotations with chunk references

### Phase 3: Video Navigation UI
- Use `timestamps` field for video player integration
- Click timestamp → jump to video moment
- Sync video playback with reading position

### Phase 4: Offset Re-calculation
- If markdown changes, use `position_context` to re-calculate offsets
- On-the-fly fuzzy matching in browser
- Show confidence badges in UI ("exact position" vs "approximate")

### Phase 5: Quality Indicators
- Display confidence scores in preview
- Filter chunks by confidence threshold
- Flag low-confidence chunks for manual review

### Phase 6: User Preferences
- Toggle "Show original timestamps" in UI
- Choose cleaning aggressiveness (light/medium/heavy)
- Manual re-processing with different settings

---

## 10. Validation Commands

### Pre-Implementation Validation
```bash
# Verify current schema
npm run db:inspect

# Check existing tests pass
npm test

# Verify TypeScript compilation
npm run build
```

### During Implementation Validation
```bash
# Run unit tests for new modules
npm test fuzzy-matching.test.ts
npm test youtube-cleaning.test.ts

# Type check after each file
npm run build

# Lint with JSDoc validation
npm run lint
```

### Post-Implementation Validation
```bash
# Apply migration
npx supabase db reset

# Run all tests
npm test

# Run integration test with real video
npm test youtube-metadata-enhancement.test.ts

# Type check entire project
npm run build

# Lint entire project
npm run lint

# Manual test with UI
npm run dev
# 1. Upload YouTube video
# 2. Monitor processing dock
# 3. Verify completion
# 4. Check preview page metadata
```

### Database Validation Queries

**Check Metadata Completeness:**
```sql
SELECT 
  document_id,
  COUNT(*) as total_chunks,
  COUNT(importance_score) as has_importance,
  COUNT(summary) as has_summary,
  COUNT(CASE WHEN themes IS NOT NULL AND jsonb_array_length(themes) > 0 THEN 1 END) as has_themes,
  COUNT(word_count) as has_word_count,
  COUNT(position_context) as has_position
FROM chunks
GROUP BY document_id
HAVING COUNT(*) > 0;
```

**Check Position Context Distribution:**
```sql
SELECT 
  position_context->>'method' as method,
  COUNT(*) as count,
  AVG((position_context->>'confidence')::float) as avg_confidence,
  MIN((position_context->>'confidence')::float) as min_confidence,
  MAX((position_context->>'confidence')::float) as max_confidence
FROM chunks
WHERE position_context IS NOT NULL
GROUP BY position_context->>'method'
ORDER BY method;
```

**Check for NULL Metadata:**
```sql
SELECT 
  id,
  chunk_index,
  CASE WHEN importance_score IS NULL THEN 'missing' ELSE 'ok' END as importance,
  CASE WHEN summary IS NULL THEN 'missing' ELSE 'ok' END as summary,
  CASE WHEN themes IS NULL OR jsonb_array_length(themes) = 0 THEN 'missing' ELSE 'ok' END as themes
FROM chunks
WHERE document_id = 'test-doc-id'
  AND (
    importance_score IS NULL 
    OR summary IS NULL 
    OR themes IS NULL 
    OR jsonb_array_length(themes) = 0
  );

-- Expected: 0 rows (no missing metadata)
```

---

## 11. Implementation Checklist

### Phase 1: Database Foundation
- [ ] Create migration 012 with `position_context` and `word_count` (if needed)
- [ ] Run `npx supabase db reset`
- [ ] Verify schema with SQL queries
- [ ] Test indexes created correctly

### Phase 2: Fuzzy Matching
- [ ] Create `worker/lib/fuzzy-matching.ts` with full implementation
- [ ] Add comprehensive JSDoc documentation
- [ ] Create `worker/__tests__/fuzzy-matching.test.ts` with 12+ test cases
- [ ] Run tests: `npm test fuzzy-matching.test.ts`
- [ ] Verify all tests pass

### Phase 3: AI Cleaning
- [ ] Create `worker/lib/youtube-cleaning.ts` with graceful degradation
- [ ] Add comprehensive JSDoc documentation
- [ ] Create `worker/__tests__/youtube-cleaning.test.ts` with 9+ test cases
- [ ] Run tests: `npm test youtube-cleaning.test.ts`
- [ ] Verify graceful degradation works

### Phase 4: Pipeline Integration
- [ ] Add imports to `process-document.ts`
- [ ] Modify youtube case to save `source-raw.txt`
- [ ] Add AI cleaning step with progress updates
- [ ] Update `rechunkMarkdown` prompt for metadata emphasis
- [ ] Add metadata validation with safe defaults
- [ ] Add fuzzy matching loop after rechunking
- [ ] Update chunk insertion to include `position_context` and `word_count`
- [ ] Add confidence distribution logging

### Phase 5: Validation
- [ ] Run all unit tests: `npm test`
- [ ] Run type checking: `npm run build`
- [ ] Run linting: `npm run lint`
- [ ] Create integration test: `youtube-metadata-enhancement.test.ts`
- [ ] Test with short video (<5 min)
- [ ] Test with medium video (10-30 min)
- [ ] Test with long video (1+ hour)
- [ ] Verify database metadata completeness
- [ ] Check preview page displays badges correctly
- [ ] Verify `source-raw.txt` backup exists
- [ ] Test graceful degradation by forcing AI failure
- [ ] Check processing times meet requirements

### Phase 6: Documentation
- [ ] Add JSDoc to all exported functions
- [ ] Update `CLAUDE.md` with new processing flow
- [ ] Update `docs/ARCHITECTURE.md` with fuzzy matching details
- [ ] Add comments explaining key algorithms
- [ ] Document configuration parameters (thresholds)

---

## 12. Success Metrics

### Technical Metrics

**Metadata Completeness:**
- Target: 100% of chunks have non-null `importance_score`, `summary`, `themes`, `word_count`
- Measurement: SQL query counting non-null values

**Fuzzy Matching Accuracy:**
- Target: >90% of chunks have confidence ≥0.7
- Measurement: Average confidence score from `position_context`

**Processing Performance:**
- Target: <2 minutes for typical videos (10-30 min)
- Measurement: Timestamp difference between start and completion

**Error Recovery Rate:**
- Target: 100% graceful degradation (never lose data)
- Measurement: Test forced failures, verify fallback behavior

### User Experience Metrics

**Clean Reading Experience:**
- Target: 0 timestamp links visible in rendered content
- Measurement: Manual inspection + pattern search in `chunks.content`

**UI Feature Enablement:**
- Target: Importance and theme badges display on preview page
- Measurement: Manual verification in UI

**Processing Feedback:**
- Target: Clear progress updates at each stage
- Measurement: Check `background_jobs.progress` updates

---

## 13. Confidence Assessment

**Overall Confidence: 8.5/10**

### High Confidence Factors (+)
- ✅ Excellent existing infrastructure (90% of code patterns already exist)
- ✅ Clear implementation path with no major unknowns
- ✅ User clarifications resolved all ambiguities
- ✅ Modular design allows independent testing
- ✅ Graceful degradation reduces risk
- ✅ Comprehensive test utilities already available
- ✅ Similar patterns proven in PDF and web extraction

### Uncertainty Factors (-)
- ⚠️ Fuzzy matching algorithm is custom (not battle-tested)
- ⚠️ Trigram threshold (0.75) is educated guess, may need tuning
- ⚠️ AI cleaning quality depends on prompt effectiveness
- ⚠️ Performance with very long videos (2+ hours) untested
- ⚠️ Edge cases in YouTube transcript formats may exist

### Risk Mitigation
- Comprehensive unit tests for fuzzy matching (covers edge cases)
- Configurable thresholds for easy tuning
- AI prompts follow proven patterns from existing code
- Performance limits and timeouts can be added if needed
- Graceful degradation ensures no data loss on failures

**Recommendation:** Proceed with implementation. The 1.5 point deduction is for algorithm tuning and edge case handling, not fundamental uncertainty. The strong foundation and clear path make this a low-risk, high-value enhancement.

---

## 14. Task Breakdown Reference

For detailed task breakdown with time estimates, dependencies, and acceptance criteria, see:
**`docs/tasks/youtube-processing-metadata-enhancement.md`**

The task breakdown will be generated automatically after this PRP is completed and includes:
- Granular development tasks (2-4 hour chunks)
- Clear dependencies and sequencing
- Acceptance criteria in Given-When-Then format
- Resource allocation recommendations
- Critical path identification

---

## Appendix A: File Change Summary

### New Files (3)
1. `worker/lib/fuzzy-matching.ts` (~250 lines)
2. `worker/lib/youtube-cleaning.ts` (~120 lines)
3. `supabase/migrations/012_youtube_position_context.sql` (~30 lines)

### Modified Files (1)
1. `worker/handlers/process-document.ts` (~100 lines added/modified)
   - Lines 67-96: YouTube case (add cleaning + backup)
   - Lines 350-400: Fuzzy matching integration
   - Lines 470-490: Chunk insertion (add position_context)
   - Lines 593-643: rechunkMarkdown (update prompt + validation)

### New Test Files (2)
1. `worker/__tests__/fuzzy-matching.test.ts` (~200 lines)
2. `worker/__tests__/youtube-cleaning.test.ts` (~150 lines)

### Total Code Volume
- New code: ~750 lines
- Modified code: ~100 lines
- Test code: ~350 lines
- **Total: ~1,200 lines**

---

## Appendix B: Key Algorithms Pseudocode

### Fuzzy Matching Algorithm
```
FUNCTION fuzzyMatchChunkToSource(chunk, source, chunkIndex, totalChunks):
  # Tier 1: Exact Match
  exactIndex = source.indexOf(chunk)
  IF exactIndex != -1:
    RETURN { offset: exactIndex, confidence: 1.0, method: 'exact' }
  
  # Tier 2: Trigram Fuzzy Match
  chunkTrigrams = generateTrigrams(chunk)
  windowSize = chunk.length
  stride = windowSize * 0.1
  bestMatch = null
  bestScore = 0
  
  FOR position = 0 TO (source.length - windowSize) STEP stride:
    window = source[position : position + windowSize]
    windowTrigrams = generateTrigrams(window)
    similarity = jaccardSimilarity(chunkTrigrams, windowTrigrams)
    
    IF similarity >= 0.75 AND similarity > bestScore:
      bestMatch = { offset: position, confidence: similarity, method: 'fuzzy' }
      bestScore = similarity
  
  IF bestMatch:
    RETURN bestMatch
  
  # Tier 3: Approximate Position
  estimatedOffset = (source.length / totalChunks) * chunkIndex
  RETURN { offset: estimatedOffset, confidence: 0.3, method: 'approximate' }

FUNCTION generateTrigrams(text):
  trigrams = SET()
  normalized = text.toLowerCase().removeExtraSpaces()
  FOR i = 0 TO (normalized.length - 3):
    trigrams.add(normalized[i : i+3])
  RETURN trigrams

FUNCTION jaccardSimilarity(set1, set2):
  intersection = set1 INTERSECT set2
  union = set1 UNION set2
  RETURN intersection.size / union.size
```

### AI Cleaning Flow
```
FUNCTION cleanYoutubeTranscript(ai, rawMarkdown):
  TRY:
    result = ai.generateContent({
      model: 'gemini-2.0-flash',
      prompt: CLEANING_PROMPT + rawMarkdown,
      temperature: 0.3
    })
    
    IF result.text IS EMPTY:
      RETURN { cleaned: rawMarkdown, success: false, error: 'Empty response' }
    
    lengthRatio = result.text.length / rawMarkdown.length
    IF lengthRatio < 0.5 OR lengthRatio > 1.5:
      RETURN { cleaned: rawMarkdown, success: false, error: 'Suspicious length' }
    
    RETURN { cleaned: result.text, success: true }
  
  CATCH error:
    RETURN { cleaned: rawMarkdown, success: false, error: error.message }
```

---

## Appendix C: Database Schema Reference

### Chunks Table (Relevant Fields)
```sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents,
  
  -- Content
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  
  -- Position in original (ENHANCED)
  start_offset INTEGER,          -- Calculated by fuzzy matching
  end_offset INTEGER,
  position_context JSONB,        -- NEW: Fuzzy matching metadata
  
  -- Semantic analysis (ENHANCED)
  embedding vector(768),         -- From Vercel AI SDK
  themes JSONB,                  -- From AI rechunking
  importance_score FLOAT,        -- From AI rechunking
  summary TEXT,                  -- From AI rechunking
  word_count INTEGER,            -- NEW: Calculated from content
  
  -- Multi-format support
  timestamps JSONB,              -- TimestampContext[] for YouTube
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### position_context JSONB Structure
```json
{
  "confidence": 0.85,              // 0.0-1.0 score
  "context_before": "five words",  // First 5 words before chunk
  "context_after": "five words",   // Last 5 words after chunk
  "method": "fuzzy"                // "exact" | "fuzzy" | "approximate"
}
```

### timestamps JSONB Structure (Existing)
```json
[
  {
    "time": 30,                    // Seconds from video start
    "context_before": "beginning",
    "context_after": "we discuss"
  }
]
```

---

**End of PRP Document**

**Next Steps:**
1. Review and approve this PRP
2. Generate task breakdown with `team-lead-task-breakdown` agent
3. Begin Phase 1 implementation (database migration)
4. Proceed through phases sequentially with validation gates