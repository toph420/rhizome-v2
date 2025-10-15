# PRP: Chonkie Semantic Chunking Integration (REVISED)

**Status**: Draft - Ready for Review
**Created**: 2025-10-14
**Owner**: @topher
**Estimated Effort**: 4 weeks (32-40 hours)
**Priority**: Medium (Quality Improvement, Not Architectural Simplification)

---

## Executive Summary

**What This Is**: Replace HybridChunker with Chonkie SemanticChunker to improve semantic chunk boundaries, leading to 15-40% better connection detection.

**What This Is NOT**: An architectural simplification or reduction in codebase complexity.

**Core Value Proposition**:
1. **Better semantic boundaries** → More coherent chunks → Better connection detection
2. **Skip-window merging** → Find cross-section connections we currently miss
3. **Dual-mode processing** → Fast (semantic) or premium (LLM-based) quality
4. **Proven performance** → 2.5x faster chunking step (benchmarked by Chonkie)

**Architectural Reality**: Surgical replacement of HybridChunker, all other components stay.

---

## The Coordinate System Problem (Why Bulletproof Matcher Exists)

### The Reality

**User reads**: CLEANED markdown (content.md - no page numbers, headers, artifacts)
**User creates annotation at**: Position 1500 in CLEANED markdown
**We need to know**: Which page? Which heading? (from ORIGINAL markdown)

**Coordinate systems**:
```
ORIGINAL markdown (Docling):
  "Page 45\n\nChapter 2\n\nParagraph text..."
  Metadata: page=45, heading="Chapter 2" at position 15000

CLEANED markdown (Ollama):
  "Chapter 2\n\nParagraph text..."
  Annotation: position 0-500

Question: How do we know position 0 in CLEANED = page 45 in ORIGINAL?
Answer: Bulletproof matcher maps between these coordinate systems.
```

### Bulletproof Matcher: The Right Tool for the Job

**The matcher exists because**:
- Users need to read CLEAN text (better UX - no page artifacts)
- We need ORIGINAL metadata (pages, headings, citations)
- Cleanup creates coordinate mismatch (positions shift)
- Fuzzy matching handles this robustly (5-layer fallback system)

**Alternative approaches considered**:
- Skip cleanup? → Users see page numbers, headers (bad UX)
- Chunk before cleanup? → Semantic boundaries affected by noise
- Track transformations? → Complex, brittle, more code to maintain

**Bulletproof matcher is the pragmatic solution** - it works, it's tested, and it handles edge cases well.

---

## Correct Architecture

### Current System

```
1. Docling extraction
   → cached_chunks.json (original markdown + structural metadata)
   → pages, headings, bboxes in ORIGINAL coordinates

2. Ollama cleanup
   → content.md (cleaned markdown)
   → text changes, positions shift

3. Bulletproof Matcher
   → maps Docling chunks from ORIGINAL to CLEANED coordinates
   → 5-layer system (fuzzy matching, embeddings, LLM, interpolation)

4. HybridChunker (Docling's chunker)
   → chunks cleaned markdown
   → structure-aware boundaries (page breaks, headings)

5. Metadata transfer
   → assigns Docling metadata to chunks using matcher's coordinate map

6. Transformers.js embeddings
   → metadata-enhanced vectors (heading context prepended)

7. Store in PostgreSQL
```

### Proposed System (Chonkie Integration)

```
1. Docling extraction
   → cached_chunks.json (original markdown + structural metadata)
   → UNCHANGED

2. Ollama/Gemini cleanup
   → content.md (cleaned markdown)
   → UNCHANGED

3. Bulletproof Matcher
   → maps Docling chunks from ORIGINAL to CLEANED coordinates
   → UNCHANGED (still necessary!)

4. Chonkie SemanticChunker ← NEW (replaces HybridChunker)
   → chunks cleaned markdown
   → semantic-aware boundaries (embedding similarity)
   → skip-window merging (cross-section connections)

5. Metadata transfer
   → assigns Docling metadata to Chonkie chunks using matcher's coordinate map
   → SAME LOGIC (just better chunk boundaries as input)

6. Transformers.js embeddings
   → metadata-enhanced vectors
   → UNCHANGED

7. Store in PostgreSQL
   → UNCHANGED
```

**What Changed**: Step 4 only (HybridChunker → Chonkie)
**What Stayed**: Everything else (7 out of 8 steps)

---

## Benefits (Realistic)

### Primary Benefits

1. **Better Semantic Boundaries** (15-40% improvement claimed)
   - Embedding-based similarity grouping
   - Keeps related concepts together
   - Respects semantic shifts, not just page breaks
   - **Measurement**: Connection count before/after

2. **Skip-Window Merging** (cross-section connections)
   - Merges non-consecutive similar sections
   - Example: Paragraphs 1 and 3 merged despite unrelated paragraph 2 between them
   - Finds thematic connections we currently miss
   - **Measurement**: Cross-section connection count

3. **Dual-Mode Processing** (user choice)
   - Standard: SemanticChunker (fast, <60s, good quality)
   - Premium: SlumberChunker (slow, 15-20min, highest quality with LLM reasoning)
   - Users choose based on document importance

4. **Faster Chunking Step** (2.5x claimed)
   - Chonkie benchmarked at 2.5x faster than LangChain
   - **Note**: Overall processing time similar (chunking is small part of pipeline)

### What This Is NOT

1. ❌ **NOT an architecture overhaul** (surgical component swap)
2. ❌ **NOT eliminating the matcher** (it's the right tool for coordinate mapping)
3. ❌ **NOT "cleaning up technical debt"** (bulletproof matcher works great)
4. ❌ **NOT about code aesthetics** (quality and functionality over theoretical purity)

---

## Technical Design

### Component: Chonkie Semantic Chunker

**File**: `worker/scripts/chonkie_chunk.py`

```python
#!/usr/bin/env python3
"""
Chonkie semantic chunking for Rhizome
Replaces HybridChunker with better semantic boundaries
"""
import sys
import json
from chonkie import SemanticChunker, SlumberChunker
from chonkie.genie import OllamaGenie

def main():
    # Read input from stdin
    input_data = json.loads(sys.stdin.read())
    markdown = input_data["markdown"]
    config = input_data.get("config", {})
    mode = config.get("mode", "semantic")

    # Create chunker (direct usage, not Pipeline API)
    if mode == "semantic":
        chunker = SemanticChunker(
            embedding_model="sentence-transformers/all-mpnet-base-v2",
            threshold=config.get("threshold", 0.75),
            chunk_size=config.get("chunk_size", 768),
            skip_window=config.get("skip_window", 3),
            similarity_window=config.get("similarity_window", 5)
        )
    elif mode == "slumber":
        genie = OllamaGenie(
            model="qwen2.5:32b-instruct-q4_K_M",
            endpoint="http://127.0.0.1:11434"
        )
        chunker = SlumberChunker(
            genie=genie,
            chunk_size=config.get("chunk_size", 768),
            candidate_size=config.get("candidate_size", 128)
        )
    else:
        raise ValueError(f"Unknown mode: {mode}")

    # Chunk the cleaned markdown
    chunks = chunker.chunk(markdown)

    # Output JSON (manual serialization for explicit control)
    output = [
        {
            "text": chunk.text,
            "start_index": chunk.start_index,  # Offset in CLEANED markdown
            "end_index": chunk.end_index,      # Offset in CLEANED markdown
            "token_count": chunk.token_count
        }
        for chunk in chunks
    ]

    print(json.dumps(output))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
```

**Key Points**:
- ✅ Direct chunker usage (not Pipeline API - simpler)
- ✅ Offsets are in CLEANED markdown (matches reader coordinates)
- ✅ Bulletproof matcher will map these to ORIGINAL metadata
- ✅ Supports both semantic (fast) and slumber (premium) modes

---

### Component: TypeScript Subprocess Wrapper

**File**: `worker/lib/chonkie/chonkie-chunker.ts`

```typescript
import { spawn } from 'child_process';
import path from 'path';

interface ChonkieConfig {
  mode?: 'semantic' | 'slumber';
  threshold?: number;
  chunk_size?: number;
  skip_window?: number;
  similarity_window?: number;
  candidate_size?: number;
}

interface ChonkieChunk {
  text: string;
  start_index: number;  // Position in CLEANED markdown
  end_index: number;    // Position in CLEANED markdown
  token_count: number;
}

export async function chonkieChunk(
  cleanedMarkdown: string,
  config: ChonkieConfig = {}
): Promise<ChonkieChunk[]> {
  const scriptPath = path.join(__dirname, '../../scripts/chonkie_chunk.py');

  const input = JSON.stringify({
    markdown: cleanedMarkdown,
    config: {
      mode: config.mode || 'semantic',
      threshold: config.threshold || 0.75,
      chunk_size: config.chunk_size || 768,
      skip_window: config.skip_window || 3,
      similarity_window: config.similarity_window || 5,
      candidate_size: config.candidate_size || 128
    }
  });

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Chonkie chunking failed: ${stderr}`));
        return;
      }

      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout);
        resolve(chunks);
      } catch (err) {
        reject(new Error(`Failed to parse Chonkie output: ${err}`));
      }
    });

    // Send input via stdin
    python.stdin.write(input);
    python.stdin.end();
  });
}
```

---

### Integration Point: PDF Processor

**File**: `worker/processors/pdf-processor.ts` (modified)

```typescript
export async function processPDF(documentId: string, config: ProcessingConfig) {
  // 1. Docling extraction (UNCHANGED)
  const { markdown: originalMarkdown, structure } = await doclingExtract(filePath);

  // Cache Docling chunks for coordinate mapping
  await saveCachedChunks(documentId, structure.doclingChunks);

  // 2. Ollama cleanup (UNCHANGED)
  const cleanedMarkdown = await ollamaCleanup(originalMarkdown);

  // 3. Bulletproof matcher (UNCHANGED - still necessary!)
  const coordinateMap = await runBulletproofMatcher(
    structure.doclingChunks,
    cleanedMarkdown
  );

  // 4. Chonkie chunking (NEW - replaces HybridChunker)
  const useChonkie = config.chunker === 'semantic' || config.chunker === 'slumber';

  let chunks: ChunkWithMetadata[];

  if (useChonkie) {
    const chonkieChunks = await chonkieChunk(cleanedMarkdown, {
      mode: config.chunker,
      threshold: config.threshold || 0.75,
      skip_window: config.skip_window || 3
    });

    // Transfer metadata using bulletproof matcher's coordinate map
    chunks = chonkieChunks.map(chunk => {
      const metadata = coordinateMap.getMetadataForCleanedRange(
        chunk.start_index,
        chunk.end_index
      );
      return {
        ...chunk,
        ...metadata,  // pages, headings, bboxes from Docling
        chunker_type: config.chunker
      };
    });
  } else {
    // Fallback: use existing HybridChunker path
    chunks = await runBulletproofMatcher(structure.doclingChunks, cleanedMarkdown);
  }

  // 5. Generate embeddings (UNCHANGED)
  const chunksWithEmbeddings = await addEmbeddings(chunks);

  // 6. Store in database (UNCHANGED)
  await storeChunks(documentId, chunksWithEmbeddings);
}
```

**Key Points**:
- ✅ Feature flag for easy rollback (`useChonkie`)
- ✅ Bulletproof matcher runs regardless (does its job well)
- ✅ Metadata transfer uses matcher's coordinate map (proven system)
- ✅ Fallback to HybridChunker if Chonkie disabled (zero risk)

---

## Configuration

### Recommended Defaults

```typescript
export const CHONKIE_CONFIG = {
  semantic: {
    embedding_model: "sentence-transformers/all-mpnet-base-v2",
    threshold: 0.75,        // Sweet spot: 0.70-0.80
    chunk_size: 768,        // Match existing system
    skip_window: 3,         // Enable cross-section merging
    similarity_window: 5    // Sentences to compare
  },
  slumber: {
    chunk_size: 768,
    candidate_size: 128     // Tokens examined per LLM decision
  }
};
```

### Threshold Tuning Guide

| Threshold | Behavior | Use Case |
|-----------|----------|----------|
| 0.65-0.70 | Aggressive splitting (more chunks) | Dense academic papers |
| 0.75-0.80 | Balanced (recommended) | General books, articles |
| 0.85-0.90 | Conservative (fewer chunks) | Narrative fiction |

### Skip-Window Tuning Guide

| skip_window | Effect | When to Use |
|-------------|--------|-------------|
| 0 | Disabled (sequential only) | Structure-first documents |
| 2-3 | Moderate merging | General content (recommended) |
| 5-10 | Aggressive merging | Highly thematic content |

---

## Database Schema Changes

### Migration 050: Add Chunker Type Tracking

```sql
-- Track which chunker was used
ALTER TABLE chunks
ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid'
CHECK (chunker_type IN ('hybrid', 'semantic', 'slumber'));

CREATE INDEX idx_chunks_chunker_type ON chunks(chunker_type);

-- User preference for default chunker
ALTER TABLE user_preferences
ADD COLUMN default_chunker_type TEXT DEFAULT 'hybrid'
CHECK (default_chunker_type IN ('hybrid', 'semantic', 'slumber'));

-- Optional: Track configuration per document (Phase 2)
CREATE TABLE document_chunker_config (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  chunker_type TEXT NOT NULL,
  threshold DECIMAL,
  skip_window INTEGER,
  chunk_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose**:
- A/B testing (store chunks with different chunker types)
- User customization (threshold tuning in Phase 2)
- Migration tracking (know which documents use which chunker)

---

## Implementation Plan

### Phase 1: Core Integration (2 weeks, 16-20 hours)

**Goal**: Replace HybridChunker with Chonkie SemanticChunker, validate quality

**Tasks**:
1. **Setup** (2 hours)
   - Install Chonkie: `pip install "chonkie[semantic]"`
   - Verify compatibility with existing Python environment
   - Test basic chunking on sample markdown

2. **Python Script** (3 hours)
   - Create `worker/scripts/chonkie_chunk.py`
   - Implement semantic and slumber modes
   - Add error handling, logging, timeout handling
   - Test subprocess I/O (JSON via stdin/stdout)

3. **TypeScript Wrapper** (2 hours)
   - Create `worker/lib/chonkie/chonkie-chunker.ts`
   - Implement subprocess spawning
   - Add error handling, timeout handling
   - Unit tests for subprocess communication

4. **Processor Integration** (4 hours)
   - Modify `worker/processors/pdf-processor.ts`
   - Add feature flag for Chonkie vs HybridChunker
   - Integrate with bulletproof matcher output
   - Implement metadata transfer logic
   - Update `worker/processors/epub-processor.ts` similarly

5. **Database Migration** (1 hour)
   - Create migration 050 (chunker_type column)
   - Test migration on dev database
   - Update types and interfaces

6. **Testing & Validation** (6 hours)
   - Test on small (50 pages), medium (200 pages), large (500 pages) documents
   - Verify metadata quality (spot-check 50 chunks)
   - A/B test: HybridChunker vs SemanticChunker
   - Measure connection count improvement
   - Validate annotation recovery still works (critical!)
   - Validate connection remapping still works (critical!)

7. **Documentation** (2 hours)
   - Update `docs/PROCESSING_PIPELINE.md`
   - Document configuration options
   - Write troubleshooting guide

**Success Criteria**:
- ✅ Chunks have correct metadata (pages, headings, bboxes)
- ✅ Connection detection improved by ≥15%
- ✅ Processing time <30 minutes for 500-page book (no regression)
- ✅ Annotation recovery ≥90% success rate (no regression)
- ✅ No Python dependency conflicts

---

### Phase 2: Skip-Window Optimization (1 week, 8-10 hours)

**Goal**: Tune skip-window and threshold for optimal connection quality

**Tasks**:
1. **Parameter Testing** (4 hours)
   - Test skip_window: 0, 2, 3, 5, 10
   - Test threshold: 0.70, 0.75, 0.80, 0.85
   - Measure cross-section connection improvements
   - Document optimal configurations per document type

2. **UI Implementation** (4 hours)
   - Add threshold slider to Admin Panel
   - Add skip-window selector
   - Save user preferences
   - Show preview of chunk boundaries (optional)

3. **Validation** (2 hours)
   - Test with 10 diverse documents
   - Measure connection quality improvements
   - Gather user feedback on chunk quality

**Success Criteria**:
- ✅ Skip-window improves cross-section connections
- ✅ Users can tune threshold via UI
- ✅ Optimal defaults identified and documented

---

### Phase 3: Premium Mode (1 week, 8-10 hours)

**Goal**: Add SlumberChunker option for highest quality

**Tasks**:
1. **Setup** (1 hour)
   - Install: `pip install "chonkie[genie]"`
   - Verify Ollama integration
   - Test SlumberChunker on sample document

2. **Integration** (3 hours)
   - Extend `chonkie_chunk.py` to support slumber mode
   - Update TypeScript wrapper
   - Add processing mode selector in UI

3. **Benchmarking** (3 hours)
   - Measure processing time vs SemanticChunker
   - Subjective quality comparison (manual review of 20 chunks)
   - Connection quality comparison
   - Cost tracking (should remain $0 with Ollama)

4. **Documentation** (1 hour)
   - Document when to use slumber vs semantic
   - Update user guide
   - Add troubleshooting for long processing times

**Success Criteria**:
- ✅ SlumberChunker produces subjectively better chunks
- ✅ Processing time acceptable (15-20 minutes)
- ✅ Users can choose Standard vs Premium mode
- ✅ Clear guidance on when to use each mode

---

## Testing Strategy

### Unit Tests

```typescript
// worker/lib/chonkie/__tests__/chonkie-chunker.test.ts

describe('ChonkieChunker', () => {
  it('produces valid chunks with offsets', async () => {
    const markdown = "# Heading\n\nParagraph one.\n\nParagraph two.";
    const chunks = await chonkieChunk(markdown);

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.start_index).toBeGreaterThanOrEqual(0);
      expect(chunk.end_index).toBeGreaterThan(chunk.start_index);
      expect(chunk.token_count).toBeGreaterThan(0);
    });
  });

  it('handles subprocess errors gracefully', async () => {
    await expect(
      chonkieChunk("", { threshold: -1 })  // Invalid config
    ).rejects.toThrow('Chonkie chunking failed');
  });

  it('supports both semantic and slumber modes', async () => {
    const markdown = "Test content.";

    const semanticChunks = await chonkieChunk(markdown, { mode: 'semantic' });
    const slumberChunks = await chonkieChunk(markdown, { mode: 'slumber' });

    expect(semanticChunks).toBeDefined();
    expect(slumberChunks).toBeDefined();
  });
});
```

### Integration Tests

```typescript
// worker/processors/__tests__/chonkie-integration.test.ts

describe('Chonkie Integration', () => {
  it('processes document end-to-end with metadata', async () => {
    const result = await processPDF(testDocumentId, {
      chunker: 'semantic',
      threshold: 0.75,
      skip_window: 3
    });

    expect(result.success).toBe(true);
    expect(result.chunks.every(c => c.chunker_type === 'semantic')).toBe(true);
    expect(result.chunks.every(c => c.page_numbers.length > 0)).toBe(true);
    expect(result.chunks.every(c => c.heading_path)).toBeDefined();
  });

  it('falls back to HybridChunker when disabled', async () => {
    const result = await processPDF(testDocumentId, {
      chunker: 'hybrid'
    });

    expect(result.chunks.every(c => c.chunker_type === 'hybrid')).toBe(true);
  });
});
```

### A/B Testing Validation

```bash
# scripts/validate-chonkie-quality.ts
npx tsx scripts/validate-chonkie-quality.ts --document-id <id>

# Outputs:
# Connection count (hybrid): 347
# Connection count (semantic): 421 (+21% improvement)
# Cross-section connections (hybrid): 23
# Cross-section connections (semantic): 67 (+191% improvement)
# Processing time (hybrid): 18.3 minutes
# Processing time (semantic): 17.1 minutes
```

---

## Success Metrics

### Primary Metrics (Must Achieve)

1. **Connection Quality**: ≥15% improvement in connection count
2. **Metadata Accuracy**: ≥90% of chunks have correct pages/headings
3. **Processing Time**: <30 minutes for 500-page book (no regression)
4. **Annotation Recovery**: ≥90% success rate (no regression)
5. **Connection Remapping**: ≥95% success rate (no regression)

### Secondary Metrics (Nice to Have)

1. **Cross-Section Connections**: ≥50% improvement via skip-window
2. **Chunk Coherence**: Manual review rates chunks 4/5 or higher
3. **Chunk Count Variance**: 0.8-1.2x ratio vs HybridChunker
4. **User Satisfaction**: Positive feedback on chunk quality

### Decision Criteria

**SHIP if**:
- ✅ All primary metrics met
- ✅ No critical bugs or regressions
- ✅ User feedback positive

**ITERATE if**:
- 🤔 Connection improvement 10-15% (marginal)
- 🤔 Metadata quality 85-90% (acceptable but needs tuning)

**ABANDON if**:
- ❌ Connection improvement <10%
- ❌ Metadata quality <85%
- ❌ Processing time >40 minutes
- ❌ Annotation recovery <85%
- ❌ Reliability issues (frequent crashes)

---

## Risks & Mitigations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Metadata quality regression** | Medium | 🔴 Critical | Extensive testing, fallback to HybridChunker |
| **Semantic quality below expectations** | Medium | 🟡 Medium | A/B testing before shipping, keep HybridChunker option |
| **Processing time regression** | Low | 🟡 Medium | Benchmark on real data, optimize skip-window |
| **Python dependency conflicts** | Low | 🟢 Low | Virtual environment isolation, test installation |

### User Experience Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **User confusion** (hybrid vs semantic) | High | 🟢 Low | Clear UI guidance, sensible defaults |
| **Annotation recovery edge cases** | Low | 🟡 Medium | Existing 4-tier fuzzy matching handles it |
| **Skip-window unexpected behavior** | Medium | 🟢 Low | Document behavior, show examples |

---

## Rollback Plan

### Immediate Rollback (< 1 hour)

```typescript
// Toggle feature flag
const USE_CHONKIE = false;  // Back to HybridChunker

// Existing code supports both paths
if (USE_CHONKIE) {
  chunks = await chonkieChunk(cleanedMarkdown);
} else {
  chunks = await runBulletproofMatcher(cachedDoclingChunks, cleanedMarkdown);
}
```

### Data Migration Rollback

```sql
-- Mark Chonkie documents for reprocessing
UPDATE chunks
SET chunker_type = 'needs_reprocessing'
WHERE chunker_type IN ('semantic', 'slumber');

-- Or delete and reprocess with HybridChunker
DELETE FROM chunks WHERE chunker_type IN ('semantic', 'slumber');
```

### Dependency Cleanup

```bash
# Uninstall Chonkie
pip uninstall chonkie

# Remove integration code
rm -rf worker/scripts/chonkie_*.py
rm -rf worker/lib/chonkie/
```

**Cost of Rollback**: Reprocessing time for affected documents (no data loss)

---

## Alternatives Considered

### Alternative 1: Enhance HybridChunker Directly

**Approach**: Modify Docling's HybridChunker to add semantic awareness

**Pros**: No new dependency, familiar codebase

**Cons**: Docling is external library (hard to modify), no skip-window feature, reinventing wheel

**Verdict**: Not practical

---

### Alternative 2: Build Custom Semantic Chunker

**Approach**: Implement our own using Transformers.js embeddings

**Pros**: Full control, no Python dependency

**Cons**: 20+ hours implementation, no proven performance, missing features like skip-window

**Verdict**: Not worth effort when Chonkie exists and is proven

---

### Alternative 3: Use LangChain Chunking

**Approach**: LangChain has semantic chunking capabilities

**Pros**: Well-known library, widely used

**Cons**: 2.5x slower than Chonkie (benchmarked), heavier dependency, less focused

**Verdict**: Chonkie is purpose-built for this, faster

---

### Alternative 4: Keep HybridChunker, Enhance Connection Detection

**Approach**: Don't change chunking, improve 3-engine system instead

**Pros**: Lower risk, no new dependencies

**Cons**: Connection quality limited by chunk boundaries, misses opportunity for semantic improvement

**Verdict**: Worth considering but Chonkie + better engines is superior

---

## Why Chonkie

1. **Proven Performance**: 2.5x faster chunking (benchmarked)
2. **Unique Features**: Skip-window merging for cross-sections
3. **Dual-Mode**: Semantic (fast) + LLM (premium) options
4. **Active Development**: YC-backed, growing ecosystem
5. **Clean API**: Well-documented, straightforward integration
6. **Compatible**: Works with our existing infrastructure

**Core Value**: Better chunk boundaries → Better connection detection → Core Rhizome value

---

## Dependencies

### External Dependencies

```bash
# Python dependencies
pip install "chonkie[semantic]"  # Phase 1
pip install "chonkie[genie]"     # Phase 3 (SlumberChunker)

# Version requirements
Python: 3.10+ (already required for Docling)
```

### Internal Dependencies

1. **Bulletproof Matcher** (existing, required)
   - Coordinate mapping between original and cleaned text
   - Used for metadata transfer

2. **Cached Chunks Architecture** (existing, required)
   - Migration 046: cached_chunks table
   - Stores Docling chunks for coordinate mapping

3. **Background Job System** (existing, required)
   - Extended to track chunker_type
   - Progress reporting for both HybridChunker and Chonkie paths

---

## Timeline

**Total Estimated Time**: 32-40 hours (4 weeks part-time)

| Phase | Duration | Effort | Deliverables |
|-------|----------|--------|--------------|
| Phase 1: Core Integration | 2 weeks | 16-20 hours | Chonkie integration, validation, A/B testing |
| Phase 2: Skip-Window Optimization | 1 week | 8-10 hours | Parameter tuning, UI implementation |
| Phase 3: Premium Mode | 1 week | 8-10 hours | SlumberChunker, benchmarking, documentation |

**Critical Path**: Phase 1 → Validation → Decision Gate → Phase 2/3

---

## Related Documents

**Rhizome Documentation**:
- `docs/PROCESSING_PIPELINE.md` - Current dual-mode architecture
- `docs/processing-pipeline/bulletproof-metadata-extraction.md` - Coordinate mapping system
- `worker/lib/local/bulletproof-matcher.ts` - Matcher implementation
- `docs/prps/chonkie-quick-reference.md` - Chonkie configuration reference

**External Resources**:
- Chonkie Docs: https://docs.chonkie.ai
- Chonkie GitHub: https://github.com/chonkie-inc/chonkie
- SemanticChunker: https://docs.chonkie.ai/oss/chunkers/semantic-chunker
- SlumberChunker: https://docs.chonkie.ai/oss/chunkers/slumber-chunker

---

## Conclusion

**What This Integration Provides**:
- ✅ Better semantic chunk boundaries (15-40% connection improvement)
- ✅ Skip-window merging for cross-section connections
- ✅ Dual-mode processing (fast vs premium quality)
- ✅ Proven performance (2.5x faster chunking)

**What This Integration Does NOT Provide**:
- ❌ Architectural simplification
- ❌ Elimination of bulletproof matcher
- ❌ Reduction in codebase complexity
- ❌ Elimination of fuzzy matching

**Recommendation**: ✅ **PROCEED** - Quality improvement justified, risk manageable

The value is in **better semantic boundaries leading to better connection detection**, which is core to Rhizome's mission. The integration is surgical (replacing HybridChunker only), reversible (feature flag + fallback), and validated through A/B testing.

**Philosophy**: This is a personal tool - quality and functionality matter more than theoretical architecture purity. The bulletproof matcher works, Chonkie improves chunk quality, together they deliver better connection detection. That's what matters.

---

**Status**: Ready for Implementation Decision
**Next Steps**:
1. Review and approve this revised PRP
2. Set up test environment
3. Begin Phase 1 implementation
4. Validate quality improvements
5. Decide: ship, iterate, or abandon

---

**End of Revised PRP**
