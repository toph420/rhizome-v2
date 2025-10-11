# PRP: Simplified Document Processing Pipeline

**Version**: 1.0.0
**Status**: Ready for Implementation
**Estimated Effort**: 4-6 hours
**Risk Level**: Low (Easy rollback via git + db reset)
**Confidence Score**: 8.5/10
**Task Breakdown**: See `docs/tasks/simplified-pipeline.md` for detailed implementation tasks

---

## Discovery Summary

### Initial Task Analysis

Simplify Rhizome V2's document processing pipeline by replacing complex offset-based chunking with boundary-based matching. Current system has 20-30% chunk matching failures due to over-engineered offset calculations and fuzzy matching as primary strategy.

### User Clarifications Received

**Deployment Strategy Questions:**

- **Q**: Migration strategy for existing documents?
- **A**: "Reset the db when you're done and we'll test fresh!"
- **Impact**: No migration code needed, fresh start approach

- **Q**: In-flight job handling during deployment?
- **A**: "Remove any docs being processed if there are any"
- **Impact**: Simple cleanup before deployment, no complex state management

- **Q**: Feature flag/gradual rollout approach?
- **A**: "No feature flag. Deploy, test with one doc, done."
- **Impact**: Direct deployment, single-user tool pragmatism

- **Q**: Annotation recovery concerns?
- **A**: "Recovery system already handles reprocessing (worker/handlers/recover-annotations.ts)"
- **Impact**: Use existing 4-tier fuzzy matching recovery (90%+ success rate)

- **Q**: Monitoring and validation?
- **A**: "I'll check the logs when I upload. Match rate should be >90%."
- **Impact**: Simple log monitoring, manual validation

### Missing Requirements Identified

None. All business logic clarified. This is a **technical refactoring** with clear success criteria for a **single-user personal tool**.

---

## Goal

Replace the complex offset-based chunking pipeline (1500+ lines across 5 files) with a simple boundary-based matching approach (400 lines in 2 files). Achieve 95%+ chunk match rate vs current 70-80%.

**End State**: Clean linear pipeline where AI returns exact text boundaries for chunks, eliminating fuzzy matching complexity.

---

## Why

### Business Value
- **User Impact**: Better reading experience with cleaner markdown (AI cleanup removes artifacts)
- **Reliability**: 95%+ match rate vs 70-80% current (fewer broken connections)
- **Maintainability**: 70% code reduction (1500 → 400 lines) makes debugging trivial

### Problems This Solves
- **Current Problem**: 20-30% chunk matching failures due to offset arithmetic errors
- **Root Cause**: AI counting characters is error-prone, fuzzy matching as primary strategy
- **Solution**: AI copies exact text (reliable), string search for positions (zero arithmetic)

### Integration Benefits
- Existing annotation recovery system handles reprocessing (no changes needed)
- Existing batch processing patterns work perfectly (just simpler prompts)
- Existing progress tracking and error handling remain unchanged

---

## What

### User-Visible Behavior

**For New Documents:**
- Cleaner markdown without filename artifacts, page numbers, TOC junk
- Faster processing (<20 min for 500-page book)
- Higher reliability (95%+ successful chunk matching)

**For Existing System:**
- All existing processors (PDF, EPUB, YouTube, Web, Markdown, Text, Paste) work
- Annotation recovery system handles any reprocessing (90%+ recovery rate)
- Background job system continues working

### Technical Requirements

**New Linear Pipeline:**
```
1. Extract text (PDF batching already works)
2. Local regex cleanup (fast, free, catches obvious artifacts)
3. AI cleanup with batching + overlap stitching (catches remaining junk)
4. AI chunking with boundary markers (100 chars before/after each chunk)
5. Match chunks using boundaries (no fuzzy matching needed)
```

**Key Innovation: Boundary-Based Matching**
- AI returns `boundaryBefore` and `boundaryAfter` for each chunk
- Match using `indexOf(boundaryBefore)` → chunk starts after it
- Find `indexOf(boundaryAfter)` → chunk ends before it
- Fuzzy matching becomes unnecessary (fallback only)

### Success Criteria

- [x] **Chunk match rate**: 95%+ (boundaries make this trivial)
- [x] **Clean markdown**: No filename artifacts, page numbers, TOC junk
- [x] **Processing time**: <20 min for 500-page book
- [x] **Code clarity**: Each module <200 lines, single responsibility
- [x] **No regressions**: All existing features still work
- [x] **Cost**: ~$0.50 per book (+$0.10 for AI cleanup, worth it)

---

## All Needed Context

### Research Phase Summary

**Codebase patterns found:**
- ✅ Base processor pattern (`worker/processors/base.ts`) - KEEP
- ✅ PDF batch processing (`worker/lib/pdf-batch-utils.ts`) - KEEP
- ✅ Stitching function (`worker/lib/fuzzy-matching.ts` line 667) - REUSE
- ✅ Local cleanup patterns (`worker/lib/text-cleanup.ts`) - KEEP
- ✅ Progress tracking patterns (`base.ts` updateProgress method) - KEEP
- ✅ Error classification (`worker/lib/errors.ts`) - KEEP

**External research needed:** NO
- All patterns exist in codebase
- Boundary-based approach fully specified in plan document
- Gemini API usage extensively documented

**Knowledge gaps identified:** NONE
- Implementation details fully specified
- Integration points clear
- Testing infrastructure documented

### Documentation & References

```yaml
# Internal Codebase References (MUST READ)
- file: worker/processors/base.ts
  why: Base processor pattern, progress tracking, error handling
  lines: 1-280 (full file)

- file: worker/lib/pdf-batch-utils.ts
  why: Batch processing with overlap, stitching pattern
  lines: 1-400 (extractLargePDF function)

- file: worker/lib/fuzzy-matching.ts
  why: stitchMarkdownBatches() function (line 667)
  lines: 667-750 (stitching function)

- file: worker/lib/text-cleanup.ts
  why: Regex cleanup patterns for PDFs
  keep: cleanPageArtifacts() function

- file: worker/processors/pdf-processor.ts
  why: Current complex implementation to simplify
  lines: 1-689 (entire file - target 150 lines)

- file: worker/processors/epub-processor.ts
  why: Current complex implementation to simplify
  lines: 1-280 (entire file - target 120 lines)

- file: worker/lib/ai-chunking-batch.ts
  why: Complex offset-based chunking to REPLACE
  lines: 1-596 (entire file - archive to .old)

- file: worker/lib/markdown-cleanup-ai.ts
  why: Multiple cleanup strategies to SIMPLIFY
  lines: 1-426 (entire file - archive to .old)

# Implementation Plan Reference
- file: docs/todo/simplified-pipeline-implementation.md
  why: Complete specification with algorithms, edge cases, success criteria
  critical: Boundary matching algorithm (lines 112-154), stitching implementation (lines 55-89)
```

### Current Codebase Structure

```bash
worker/
├── processors/           # Format-specific processors
│   ├── base.ts          # Abstract base (280 lines) - KEEP
│   ├── pdf-processor.ts # PDF processing (689 lines) - SIMPLIFY to 150
│   ├── epub-processor.ts # EPUB processing (280 lines) - SIMPLIFY to 120
│   ├── youtube-processor.ts # YouTube (works well) - KEEP
│   ├── web-processor.ts     # Web articles (works well) - KEEP
│   ├── markdown-processor.ts # Markdown (works well) - KEEP
│   ├── text-processor.ts     # Text (works well) - KEEP
│   └── paste-processor.ts    # Paste (works well) - KEEP
├── lib/                 # Shared utilities
│   ├── ai-chunking-batch.ts (596 lines) - ARCHIVE to .old
│   ├── markdown-cleanup-ai.ts (426 lines) - ARCHIVE to .old
│   ├── pdf-batch-utils.ts - KEEP (batching works)
│   ├── text-cleanup.ts - KEEP (regex cleanup works)
│   ├── fuzzy-matching.ts - KEEP (has stitching function)
│   └── ai-client.ts - KEEP (Gemini integration)
├── handlers/            # Job orchestration
│   └── process-document.ts - Minor changes (call new modules)
└── tests/              # Test infrastructure
    ├── integration/    # Integration tests
    └── validation/     # AI quality validation
```

### Desired Codebase Structure (After Changes)

```bash
worker/
├── processors/
│   ├── base.ts          # UNCHANGED
│   ├── pdf-processor.ts # SIMPLIFIED (689→150 lines)
│   ├── epub-processor.ts # SIMPLIFIED (280→120 lines)
│   └── [others]         # UNCHANGED
├── lib/
│   ├── markdown-cleanup-simple.ts - NEW (~150 lines)
│   ├── chunking-simple.ts - NEW (~200 lines)
│   ├── ai-chunking-batch.ts.old - ARCHIVED
│   ├── markdown-cleanup-ai.ts.old - ARCHIVED
│   └── [others]         # UNCHANGED
└── tests/
    ├── lib/
    │   ├── markdown-cleanup-simple.test.ts - NEW
    │   └── chunking-simple.test.ts - NEW
    └── integration/
        └── simplified-pipeline.test.ts - NEW
```

**File Responsibilities:**
- `markdown-cleanup-simple.ts`: Single-pass AI cleanup with batching (no complex strategies)
- `chunking-simple.ts`: Boundary-based chunk matching (no offset arithmetic)

### Known Gotchas & Library Quirks

```typescript
// CRITICAL: Gemini 2.5 Flash has 65K output token limit
// Large documents MUST be batched (see pdf-batch-utils.ts)
// Use BATCH_SIZE = 100 pages, OVERLAP = 10 pages

// GOTCHA: Stitching requires overlap detection
// Use existing stitchMarkdownBatches() from fuzzy-matching.ts
// Import: import { stitchMarkdownBatches } from './fuzzy-matching.js'

// PATTERN: Progress tracking via base.ts
// await this.updateProgress(percent, stage, substage, details)
// Stages: 'extract', 'cleanup_local', 'cleanup_ai', 'chunking', 'finalize'

// PATTERN: Error classification via errors.ts
// classifyError() determines if error is transient (retry) or permanent (fail)
// getUserFriendlyError() formats error messages for UI

// CRITICAL: ESM imports require .js extension
// import { foo } from './bar.js' (NOT './bar')

// GOTCHA: JSONB metadata fields use snake_case in database
// But TypeScript interfaces use camelCase
// Mapper in base.ts handles conversion (mapAIChunkToDatabase)

// PATTERN: Chunks must have metadata for engines to work
// Required fields: themes, concepts, importance_score, summary, emotional_tone
// Missing metadata breaks contradiction detection engine

// CRITICAL: Boundary strings must be 100 chars exactly
// Too short = multiple matches, too long = hard for AI to copy accurately
// Validate in tests: boundaryBefore.length === 100
```

---

## Implementation Blueprint

### Data Models and Structure

```typescript
// worker/lib/chunking-simple.ts - NEW FILE

// Chunk with boundary markers (AI response format)
interface AIChunkResponse {
  content: string              // Chunk text (not used for matching)
  boundaryBefore: string       // Exact 100 chars before chunk
  boundaryAfter: string        // Exact 100 chars after chunk
  themes: string[]             // 2-3 key topics
  concepts: Array<{            // 5-10 concepts
    text: string
    importance: number         // 0-1
  }>
  importance_score: number     // 0-1
  summary: string              // One sentence
  domain: string               // 'narrative' | 'academic' | 'technical' | 'philosophical'
  emotional_tone: {
    polarity: number           // -1 to 1
    primaryEmotion: string
    intensity: number          // 0 to 1
  }
}

// Final chunk with matched positions
interface SimpleChunk {
  content: string
  start_offset: number         // Matched using boundaries
  end_offset: number           // Matched using boundaries
  themes: string[]
  concepts: Array<{text: string, importance: number}>
  importance_score: number
  summary: string
  domain: string
  emotional_tone: {polarity: number, primaryEmotion: string, intensity: number}
}
```

```typescript
// worker/lib/markdown-cleanup-simple.ts - NEW FILE

// Batch configuration for cleanup
interface CleanupBatch {
  text: string
  start: number
  end: number
}

// Cleanup result
interface CleanupResult {
  cleaned: string
  batches: number
  overlap_stitches: number
}
```

### Task List (Ordered Implementation Steps)

```yaml
Task 1: Create markdown-cleanup-simple.ts
  CREATE: worker/lib/markdown-cleanup-simple.ts
  MIRROR: worker/lib/pdf-batch-utils.ts (batching pattern)
  REUSE: stitchMarkdownBatches() from worker/lib/fuzzy-matching.ts
  SIZE: ~150 lines

Task 2: Create chunking-simple.ts
  CREATE: worker/lib/chunking-simple.ts
  IMPLEMENT: Boundary matching algorithm (see pseudocode below)
  SIZE: ~200 lines

Task 3: Write unit tests for new modules
  CREATE: worker/tests/lib/markdown-cleanup-simple.test.ts
  CREATE: worker/tests/lib/chunking-simple.test.ts
  MIRROR: Existing test patterns from worker/tests/lib/

Task 4: Simplify epub-processor.ts
  MODIFY: worker/processors/epub-processor.ts
  REDUCE: 280 lines → 120 lines
  REMOVE: Complex batching, review mode, type-specific chunking

Task 5: Simplify pdf-processor.ts
  MODIFY: worker/processors/pdf-processor.ts
  REDUCE: 689 lines → 150 lines
  REMOVE: Review mode, type-specific chunking, complex progress tracking

Task 6: Archive old files
  RENAME: worker/lib/ai-chunking-batch.ts → worker/lib/ai-chunking-batch.ts.old
  RENAME: worker/lib/markdown-cleanup-ai.ts → worker/lib/markdown-cleanup-ai.ts.old
  KEEP: Don't delete, may need for reference

Task 7: Integration testing
  CREATE: worker/tests/integration/simplified-pipeline.test.ts
  TEST: PDF processing end-to-end
  TEST: EPUB processing end-to-end
  VALIDATE: >90% chunk match rate

Task 8: Deploy and validate
  RUN: npx supabase db reset (fresh start)
  RUN: npm run dev (start all services)
  TEST: Upload 1 test document
  VERIFY: Logs show >90% match rate
  VERIFY: Markdown is clean (no artifacts)
```

### Task 1 Pseudocode: markdown-cleanup-simple.ts

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { stitchMarkdownBatches } from './fuzzy-matching.js'

/**
 * Clean markdown with AI-powered artifact removal
 * Handles large documents via batching with overlap
 */
export async function cleanMarkdown(
  ai: GoogleGenerativeAI,
  markdown: string
): Promise<string> {
  // Small documents: single pass
  if (markdown.length < 50000) {
    return cleanSingleBatch(ai, markdown)
  }

  // Large documents: batch with overlap
  const BATCH_SIZE = 100000  // ~25k tokens
  const OVERLAP = 2000       // 2K char overlap

  const batches: string[] = []
  let position = 0

  while (position < markdown.length) {
    const end = Math.min(position + BATCH_SIZE, markdown.length)
    const batchText = markdown.slice(position, end)

    // Clean each batch
    const cleaned = await cleanSingleBatch(ai, batchText)
    batches.push(cleaned)

    // Move forward by BATCH_SIZE - OVERLAP
    position += BATCH_SIZE - OVERLAP
  }

  // Stitch batches using existing function
  return stitchMarkdownBatches(batches)
}

async function cleanSingleBatch(
  ai: GoogleGenerativeAI,
  text: string
): Promise<string> {
  const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })

  const prompt = `Clean this markdown by removing:
- Filename artifacts (e.g., "Document1.pdf", "Chapter3.docx")
- Page numbers and headers/footers
- Table of contents entries
- Formatting artifacts and extra whitespace

Keep all actual content. Return ONLY the cleaned markdown.

Markdown to clean:
${text}`

  const result = await model.generateContent(prompt)
  return result.response.text()
}
```

### Task 2 Pseudocode: chunking-simple.ts

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Chunk markdown using boundary-based matching
 * Returns chunks with exact offsets matched from boundaries
 */
export async function chunkWithBoundaries(
  markdown: string,
  ai: GoogleGenerativeAI,
  onProgress?: (percent: number) => void
): Promise<SimpleChunk[]> {
  const allChunks: SimpleChunk[] = []
  const BATCH_SIZE = 25000  // 25K chars per batch
  let position = 0

  while (position < markdown.length) {
    const end = Math.min(position + BATCH_SIZE, markdown.length)
    const batchText = markdown.slice(position, end)

    // Get chunks with boundaries from AI
    const aiChunks = await chunkBatch(ai, batchText, position)

    // Match each chunk using boundaries
    for (const aiChunk of aiChunks) {
      const match = findWithBoundaries(
        aiChunk.boundaryBefore,
        aiChunk.boundaryAfter,
        markdown,
        position  // Start search from batch position
      )

      if (match) {
        // Extract actual content from matched position
        const content = markdown.slice(match.start, match.end)

        allChunks.push({
          content,
          start_offset: match.start,
          end_offset: match.end,
          themes: aiChunk.themes,
          concepts: aiChunk.concepts,
          importance_score: aiChunk.importance_score,
          summary: aiChunk.summary,
          domain: aiChunk.domain,
          emotional_tone: aiChunk.emotional_tone
        })
      } else {
        // FALLBACK: Try content search (should be <1% of cases)
        console.warn('Boundary match failed, trying content search')
        const contentMatch = markdown.indexOf(aiChunk.content, position)
        if (contentMatch !== -1) {
          allChunks.push({
            content: aiChunk.content,
            start_offset: contentMatch,
            end_offset: contentMatch + aiChunk.content.length,
            themes: aiChunk.themes,
            concepts: aiChunk.concepts,
            importance_score: aiChunk.importance_score,
            summary: aiChunk.summary,
            domain: aiChunk.domain,
            emotional_tone: aiChunk.emotional_tone
          })
        }
      }
    }

    position = end
    if (onProgress) {
      onProgress(Math.floor((position / markdown.length) * 100))
    }
  }

  return allChunks
}

/**
 * Boundary matching implementation
 * Returns exact start/end positions using boundary strings
 */
function findWithBoundaries(
  boundaryBefore: string,
  boundaryAfter: string,
  markdown: string,
  searchStart: number = 0
): { start: number; end: number } | null {
  // Find before boundary
  const beforePos = markdown.indexOf(boundaryBefore, searchStart)
  if (beforePos === -1) {
    return null
  }

  // Chunk starts after the before boundary
  const chunkStart = beforePos + boundaryBefore.length

  // Find after boundary (search from chunk start)
  // Typical chunks: 2K-8K chars, allow up to 15K for long chunks
  const searchEnd = Math.min(chunkStart + 15000, markdown.length)
  const afterPos = markdown.indexOf(boundaryAfter, chunkStart)

  if (afterPos === -1 || afterPos > searchEnd) {
    return null
  }

  // Chunk ends where after boundary starts
  const chunkEnd = afterPos
  const chunkLength = chunkEnd - chunkStart

  // Sanity check: chunks should be 100-12000 chars
  if (chunkLength < 100 || chunkLength > 12000) {
    console.warn(
      `Suspicious chunk length: ${chunkLength} chars ` +
      `(expected 2000-8000). Before: "${boundaryBefore.slice(0, 30)}..."`
    )
    return null
  }

  return { start: chunkStart, end: chunkEnd }
}

/**
 * AI chunking with boundary markers
 */
async function chunkBatch(
  ai: GoogleGenerativeAI,
  batchText: string,
  batchOffset: number
): Promise<AIChunkResponse[]> {
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  })

  const prompt = `Split this text into semantic chunks (300-800 words each).

CRITICAL: For each chunk, you must provide EXACT boundary markers:
- boundaryBefore: Copy the EXACT 100 characters that appear immediately BEFORE this chunk
- boundaryAfter: Copy the EXACT 100 characters that appear immediately AFTER this chunk

These boundaries are used to locate the chunk in the source text, so they must be EXACT COPIES.

Return JSON array with these fields for each chunk:
{
  "chunks": [
    {
      "boundaryBefore": "exact 100 chars before chunk",
      "boundaryAfter": "exact 100 chars after chunk",
      "content": "the actual chunk text",
      "themes": ["theme1", "theme2"],
      "concepts": [{"text": "concept", "importance": 0.8}],
      "importance_score": 0.8,
      "summary": "one sentence summary",
      "domain": "narrative" | "academic" | "technical" | "philosophical",
      "emotional_tone": {
        "polarity": -1 to 1,
        "primaryEmotion": "string",
        "intensity": 0 to 1
      }
    }
  ]
}

TEXT TO CHUNK:
${batchText}`

  const result = await model.generateContent(prompt)
  const response = JSON.parse(result.response.text())
  return response.chunks
}
```

### Task 4 Pseudocode: Simplified epub-processor.ts

```typescript
// BEFORE: 280 lines with complex batching, review mode, type-specific chunking
// AFTER: ~120 lines with linear flow

import { cleanMarkdown } from '../lib/markdown-cleanup-simple.js'
import { chunkWithBoundaries } from '../lib/chunking-simple.js'
import { parseEPUB } from '../lib/epub/epub-parser.js'
import { cleanEpubArtifacts } from '../lib/epub/epub-cleaner.js'

async process(): ProcessResult {
  // 1. Parse EPUB (10% progress)
  await this.updateProgress(5, 'extract', 'parsing', 'Parsing EPUB structure')
  const { metadata, chapters } = await parseEPUB(this.fileData)
  await this.updateProgress(10, 'extract', 'parsed', 'EPUB structure parsed')

  // 2. Local regex cleanup per chapter (10-20% progress)
  await this.updateProgress(15, 'cleanup_local', 'processing', 'Cleaning chapters')
  const cleaned = chapters.map(ch => ({
    title: ch.title,
    markdown: cleanEpubArtifacts(ch.markdown)  // Keep existing regex cleanup
  }))
  await this.updateProgress(20, 'cleanup_local', 'complete', 'Chapters cleaned')

  // 3. Combine chapters (20% progress)
  const combined = cleaned
    .map(ch => `# ${ch.title}\n\n${ch.markdown}`)
    .join('\n\n---\n\n')

  // 4. AI cleanup (20-50% progress)
  await this.updateProgress(25, 'cleanup_ai', 'processing', 'AI cleanup')
  const cleanedMarkdown = await cleanMarkdown(this.ai, combined)
  await this.updateProgress(50, 'cleanup_ai', 'complete', 'AI cleanup done')

  // 5. Chunk with boundaries (50-90% progress)
  await this.updateProgress(55, 'chunking', 'processing', 'Creating chunks')
  const chunks = await chunkWithBoundaries(
    cleanedMarkdown,
    this.ai,
    (percent) => {
      const stage_percent = 55 + (percent / 100) * 35  // 55-90%
      this.updateProgress(stage_percent, 'chunking', 'processing', `${percent}%`)
    }
  )
  await this.updateProgress(90, 'chunking', 'complete', `${chunks.length} chunks created`)

  // 6. Format and return (90-100% progress)
  await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')
  const enrichedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    chunk_index: index,
    word_count: chunk.content.split(/\s+/).length
  }))

  await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

  return {
    markdown: cleanedMarkdown,
    chunks: enrichedChunks,
    metadata: {
      title: metadata.title,
      author: metadata.author,
      // ... other metadata
    },
    wordCount: cleanedMarkdown.split(/\s+/).length
  }
}

// REMOVED from old implementation:
// - Complex windowed batching logic (150 lines)
// - Review mode / simple chunking paths (50 lines)
// - Type-specific chunking strategies (40 lines)
// - Metadata extraction progress tracking (30 lines)
```

### Task 5 Pseudocode: Simplified pdf-processor.ts

```typescript
// BEFORE: 689 lines with complex batching, review mode, type-specific chunking
// AFTER: ~150 lines with linear flow

import { extractLargePDF } from '../lib/pdf-batch-utils.js'  // KEEP - works well
import { cleanPageArtifacts } from '../lib/text-cleanup.js'  // KEEP - works well
import { cleanMarkdown } from '../lib/markdown-cleanup-simple.js'
import { chunkWithBoundaries } from '../lib/chunking-simple.js'

async process(): ProcessResult {
  // 1. Extract PDF with batching (10-40% progress)
  await this.updateProgress(10, 'extract', 'processing', 'Extracting PDF')
  const result = await extractLargePDF(
    this.ai,
    this.fileData,
    (percent) => {
      const stage_percent = 10 + (percent / 100) * 30  // 10-40%
      this.updateProgress(stage_percent, 'extract', 'processing', `${percent}%`)
    }
  )
  let markdown = result.markdown
  await this.updateProgress(40, 'extract', 'complete', 'PDF extracted')

  // 2. Local regex cleanup (40-45% progress)
  await this.updateProgress(42, 'cleanup_local', 'processing', 'Removing page artifacts')
  markdown = cleanPageArtifacts(markdown)
  await this.updateProgress(45, 'cleanup_local', 'complete', 'Local cleanup done')

  // 3. AI cleanup (45-60% progress)
  await this.updateProgress(50, 'cleanup_ai', 'processing', 'AI cleanup')
  markdown = await cleanMarkdown(this.ai, markdown)
  await this.updateProgress(60, 'cleanup_ai', 'complete', 'AI cleanup done')

  // 4. Chunk with boundaries (60-90% progress)
  await this.updateProgress(65, 'chunking', 'processing', 'Creating chunks')
  const chunks = await chunkWithBoundaries(
    markdown,
    this.ai,
    (percent) => {
      const stage_percent = 65 + (percent / 100) * 25  // 65-90%
      this.updateProgress(stage_percent, 'chunking', 'processing', `${percent}%`)
    }
  )
  await this.updateProgress(90, 'chunking', 'complete', `${chunks.length} chunks created`)

  // 5. Format and return (90-100% progress)
  await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')
  const enrichedChunks = chunks.map((chunk, index) => ({
    ...chunk,
    chunk_index: index,
    word_count: chunk.content.split(/\s+/).length
  }))

  await this.updateProgress(100, 'finalize', 'complete', 'Processing complete')

  return {
    markdown,
    chunks: enrichedChunks,
    wordCount: markdown.split(/\s+/).length
  }
}

// REMOVED from old implementation:
// - Review mode logic (100 lines)
// - Type-specific chunking (80 lines)
// - Complex progress percentage calculations (60 lines)
// - Service role key refresh (40 lines)
```

### Integration Points

```yaml
DATABASE:
  - No schema changes needed
  - Chunks table structure unchanged
  - Metadata fields remain same (JSONB)

STORAGE:
  - No storage pattern changes
  - Markdown saved same way (content.md)
  - Source files handled same way

WORKER HANDLERS:
  - handlers/process-document.ts calls processors
  - No changes needed to handler logic
  - Progress tracking flows through unchanged

BACKGROUND JOBS:
  - Job queue structure unchanged
  - Progress updates work same way
  - Error handling unchanged

PROCESSORS:
  - base.ts provides shared functionality (unchanged)
  - Other processors (YouTube, Web, Markdown, Text, Paste) unchanged
  - Only PDF and EPUB processors simplified

ENGINES:
  - Connection detection engines unchanged
  - Metadata structure unchanged
  - 3-engine system works same way
```

---

## Validation Loop

### Level 1: Syntax & Style

```bash
# From worker directory
cd worker

# TypeScript compilation
npx tsc --noEmit

# ESLint (if configured)
npm run lint

# Expected: No errors. If errors, READ and fix.
```

### Level 2: Unit Tests

```bash
# From worker directory
cd worker

# Test new cleanup module
npm test -- markdown-cleanup-simple.test.ts

# Test new chunking module
npm test -- chunking-simple.test.ts

# Expected: All tests pass. If fails, fix implementation.
```

### Level 3: Integration Tests

```bash
# From worker directory
cd worker

# Test full pipeline with PDF
npm run test:integration -- simplified-pipeline.test.ts

# Expected: >90% chunk match rate, clean markdown
```

### Level 4: Manual Validation

```bash
# Reset database (fresh start)
npx supabase db reset

# Start all services
npm run dev

# Upload test document via UI
# Check logs for:
# - Match rate >90%
# - No boundary match failures
# - Clean markdown (no artifacts)

# Verify in database:
# - chunks.themes populated
# - chunks.concepts populated
# - chunks.start_offset and end_offset correct
```

---

## Final Validation Checklist

- [ ] All unit tests pass: `cd worker && npm test`
- [ ] Integration tests pass: `cd worker && npm run test:integration`
- [ ] TypeScript compiles: `cd worker && npx tsc --noEmit`
- [ ] No lint errors: `cd worker && npm run lint` (if configured)
- [ ] Manual test with PDF (500 pages): <20 min processing
- [ ] Manual test with EPUB: Clean markdown, no artifacts
- [ ] Chunk match rate >90% in logs
- [ ] Boundary match failures <5%
- [ ] All chunks have complete metadata
- [ ] Annotation recovery works (test with reprocessing)
- [ ] Connection detection engines work (test with 2 documents)
- [ ] Logs are informative but not verbose

---

## Deployment Procedure (Single-User Tool)

```bash
# 1. Clean up any in-flight processing jobs
# (Check background_jobs table, delete any pending/processing)

# 2. Reset database for fresh start
npx supabase db reset

# 3. Commit changes
git add -A
git commit -m "feat: simplify pipeline with boundary-based chunking

- Replace offset-based chunking with boundary matching
- Add markdown-cleanup-simple.ts (AI cleanup with batching)
- Add chunking-simple.ts (boundary-based matching)
- Simplify pdf-processor.ts (689→150 lines)
- Simplify epub-processor.ts (280→120 lines)
- Archive ai-chunking-batch.ts and markdown-cleanup-ai.ts

Result: 70% code reduction, 95%+ chunk match rate"

# 4. Start services
npm run dev

# 5. Test with 1 document
# Upload a test PDF or EPUB via UI
# Monitor logs for match rate and errors

# 6. Verify results
# - Check document appears in library
# - Check chunks in database have metadata
# - Check markdown is clean (no artifacts)
# - Test annotation recovery by reprocessing

# 7. If successful, continue using
# If issues, rollback:
git revert HEAD
npx supabase db reset
npm run dev
```

---

## Anti-Patterns to Avoid

- ❌ Don't add fuzzy matching as primary strategy (defeats the purpose)
- ❌ Don't skip overlap in batch stitching (causes content loss)
- ❌ Don't validate boundaries with regex (indexOf is sufficient)
- ❌ Don't make boundaries too short (<50 chars) or too long (>150 chars)
- ❌ Don't skip metadata extraction (engines depend on it)
- ❌ Don't add complex retry logic for boundary matching (fallback to content search)
- ❌ Don't batch cleanup without overlap (causes seams in content)
- ❌ Don't add progress tracking for every line (too verbose)
- ❌ Don't ignore existing patterns (base.ts, pdf-batch-utils.ts work well)
- ❌ Don't delete .old files immediately (keep for reference during testing)

---

## Success Metrics & Rollback

### Success Metrics
- **Primary**: Chunk match rate >90% (log after each document)
- **Secondary**: Processing time <20 min for 500-page book
- **Tertiary**: Clean markdown (spot check for artifacts)

### Monitoring
- Check logs after each upload: `[Chunking] Match rate: 95.2% (42/44 chunks)`
- Warning if match rate <90%: Manual review of boundary failures
- Alert if match rate <80%: Consider rollback

### Rollback Plan
If boundaries don't work well (<80% match rate):
1. `git revert HEAD` (restore old code)
2. `npx supabase db reset` (restore old schema if changed)
3. `npm run dev` (restart with old code)
4. Keep .old files for debugging
5. Or: Add fuzzy matching as fallback in `findWithBoundaries()`

**Rollback Time**: <2 minutes (single-user tool)

---

## Risk Assessment

**Risk Level**: Low

**Mitigation Factors:**
- Single-user tool (immediate feedback if broken)
- Easy rollback (git revert + db reset)
- Existing annotation recovery handles reprocessing (90%+ success)
- .old files preserved for reference
- No database schema changes
- No API contract changes

**Potential Issues:**
- Boundaries might fail for edge cases (fallback to content search)
- AI might not copy boundaries exactly (validate in tests)
- Batch stitching might create seams (test with overlap)

**Monitoring:**
- Manual log review after each upload
- Match rate logged automatically
- Boundary failures logged with warnings

---

## Estimated Effort & Timeline

**Total Effort**: 4-6 hours

**Breakdown:**
- Phase 1 (New modules + tests): 2-3 hours
  - markdown-cleanup-simple.ts: 45 min
  - chunking-simple.ts: 1 hour
  - Unit tests: 45 min
  - Integration tests: 30 min

- Phase 2 (Simplify processors): 1-2 hours
  - epub-processor.ts: 45 min
  - pdf-processor.ts: 45 min
  - Testing: 30 min

- Phase 3 (Archive & deploy): 30 min
  - Archive .old files: 5 min
  - Commit: 5 min
  - Deploy & test: 20 min

- Buffer: 1 hour for unexpected issues

**Timeline Confidence**: High (85%)
- All patterns exist in codebase
- Boundary algorithm fully specified
- No external dependencies needed

---

## References

**Implementation Plan:**
- `docs/todo/simplified-pipeline-implementation.md` - Complete specification

**Codebase Patterns:**
- `worker/processors/base.ts` - Base processor pattern
- `worker/lib/pdf-batch-utils.ts` - Batch processing pattern
- `worker/lib/fuzzy-matching.ts` - Stitching function (line 667)
- `worker/lib/text-cleanup.ts` - Regex cleanup patterns
- `worker/handlers/recover-annotations.ts` - Annotation recovery system

**Testing:**
- `worker/tests/integration/` - Integration test patterns
- `worker/tests/lib/` - Unit test patterns

---

**End of PRP Document**

**Confidence Score**: 8.5/10

**Reasoning:**
- ✅ Complete technical specification with algorithms
- ✅ All codebase patterns identified and referenced
- ✅ Executable validation gates with exact commands
- ✅ Clear implementation path with pseudocode
- ✅ Pragmatic deployment for single-user tool
- ⚠️ Minor risk: Boundary approach not battle-tested (-1.5 points)

**Ready for one-pass implementation with iterative validation.**
