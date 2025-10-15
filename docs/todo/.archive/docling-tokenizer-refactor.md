# Docling Chunker Refactor: HybridChunker → TokenChunker + Custom Serialization

**Created**: 2025-10-15
**Status**: 📋 **READY TO START**
**Priority**: P1 (High - Prerequisite for Chonkie integration)
**Estimated Effort**: 4-6 hours
**Goal**: Simplify Docling extraction with predictable chunking and inline metadata

---

## 🎯 Executive Summary

**Problem**: HybridChunker optimizes for semantic quality we discard. Docling chunks exist only to carry metadata to Chonkie chunks via overlap detection.

**Solution**: Switch to TokenChunker with guaranteed overlap + custom serialization with inline metadata.

**Benefits**:
- **95%+ overlap coverage** (vs 70-90% with HybridChunker)
- **Faster extraction** (TokenChunker simpler than HybridChunker)
- **Predictable behavior** (fixed-size chunks, no semantic variance)
- **Potential to eliminate bulletproof matching** (inline metadata parsing)
- **Cleaner pipeline** (less AI cleanup needed with better serialization)

**Risk**: Low (can rollback to HybridChunker if validation fails)

---

## 📊 Current State vs Proposed State

### Current Pipeline (HybridChunker)
```
1. Docling extraction with HybridChunker (768 tokens, semantic boundaries)
2. Get ~66 chunks with structural metadata
3. AI cleanup (Ollama removes artifacts, changes whitespace)
4. Bulletproof matching (5 layers to remap chunks to cleaned markdown)
5. Store chunks with metadata

Issues:
- Semantic boundaries reduce overlap opportunities
- Variable chunk sizes (200-1200 tokens)
- Complex matching required after cleanup
- Optimization wasted on chunks we'll discard
```

### Proposed Pipeline (TokenChunker + Custom Serialization)
```
1. Docling extraction with TokenChunker (256 tokens, 64-token overlap)
2. Custom serializer embeds metadata inline in markdown
3. Get ~200 chunks with guaranteed overlap + inline metadata
4. AI cleanup (optional - serializer may produce clean output)
5. Parse metadata from markdown (simple regex, no matching needed!)
6. Store chunks with metadata

Benefits:
- Guaranteed 25% overlap (64/256 tokens)
- Predictable chunk sizes
- Inline metadata = zero offset drift
- Could skip bulletproof matching entirely
- Faster extraction (simpler algorithm)
```

---

## 📋 Implementation Plan

### Phase 1: Add TokenChunker + Inline Metadata Serializer (2-3 hours)

#### Task 1.1: Create Custom Serializer
**File**: `worker/scripts/inline_metadata_serializer.py`

```python
"""
Custom Docling serializer that embeds metadata inline as HTML comments.
These comments are invisible in markdown renderers but preserve exact structure.
"""

from docling.datamodel import Document
from typing import List, Dict, Any

class InlineMetadataSerializer:
    """Serialize Docling document with inline metadata markers"""

    def serialize(self, doc: Document) -> str:
        """
        Convert Docling document to markdown with inline metadata.

        Format:
        <!-- CHUNK id="chunk-0" page="1-2" heading="Introduction" level="2" -->
        Content here...
        <!-- /CHUNK -->
        """
        markdown_parts = []

        for idx, chunk in enumerate(doc.chunks):
            # Start marker with metadata
            meta = {
                'id': f'chunk-{idx}',
                'page_start': chunk.page_start,
                'page_end': chunk.page_end,
                'heading': chunk.heading or '',
                'heading_level': chunk.heading_level or 0,
                'section': chunk.section_marker or ''
            }

            meta_str = ' '.join([f'{k}="{v}"' for k, v in meta.items()])
            markdown_parts.append(f'<!-- CHUNK {meta_str} -->')

            # Content
            markdown_parts.append(chunk.text)

            # End marker
            markdown_parts.append('<!-- /CHUNK -->')
            markdown_parts.append('')  # Blank line

        return '\n'.join(markdown_parts)
```

**Validation**:
- Test with small PDF (10 pages)
- Verify metadata markers present in output
- Verify markdown renders correctly (comments hidden)

#### Task 1.2: Update Docling Extraction Script
**File**: `worker/scripts/docling_extract.py`

**Changes**:
1. Replace HybridChunker with TokenChunker
2. Add inline metadata serialization
3. Preserve both serialization modes (flag-controlled)

```python
# Configuration
CHUNKER_TYPE = config.get('chunker_type', 'hybrid')  # 'hybrid' or 'token'
USE_INLINE_METADATA = config.get('inline_metadata', True)

if CHUNKER_TYPE == 'token':
    from docling_core.transforms.chunker import TokenChunker
    chunker = TokenChunker(
        chunk_size=256,        # Small chunks for high granularity
        chunk_overlap=64,      # 25% overlap for guaranteed coverage
        tokenizer='gpt2'       # Fast, standard tokenizer
    )
else:
    # Existing HybridChunker (fallback)
    chunker = HybridChunker(...)

# Apply custom serialization
if USE_INLINE_METADATA:
    from inline_metadata_serializer import InlineMetadataSerializer
    serializer = InlineMetadataSerializer()
    markdown = serializer.serialize(doc)
else:
    # Existing MarkdownDocumentSerializer
    markdown = existing_serializer.serialize(doc)
```

**Validation**:
- Run with CHUNKER_TYPE='token'
- Verify chunk counts increase (256 tokens vs 768 tokens = ~3x more chunks)
- Verify overlap exists between adjacent chunks
- Verify inline metadata present

#### Task 1.3: Create Inline Metadata Parser
**File**: `worker/lib/local/inline-metadata-parser.ts`

```typescript
/**
 * Parse inline metadata from Docling markdown with embedded chunk markers.
 * Replaces bulletproof matching for documents with inline metadata.
 */

export interface InlineChunkMetadata {
  id: string
  content: string
  start_offset: number
  end_offset: number
  page_start: number | null
  page_end: number | null
  heading_path: string[] | null
  heading_level: number | null
  section_marker: string | null
}

const CHUNK_START_REGEX = /<!-- CHUNK (.*?) -->/g
const CHUNK_END_REGEX = /<!-- \/CHUNK -->/g

export function parseInlineMetadata(markdown: string): InlineChunkMetadata[] {
  const chunks: InlineChunkMetadata[] = []

  // Find all chunk markers
  let match
  const startMatches: Array<{ index: number, meta: Record<string, string> }> = []

  while ((match = CHUNK_START_REGEX.exec(markdown)) !== null) {
    const metaString = match[1]
    const meta = parseMetaAttributes(metaString)
    startMatches.push({ index: match.index, meta })
  }

  // Extract content between markers
  for (let i = 0; i < startMatches.length; i++) {
    const start = startMatches[i]
    const nextStart = startMatches[i + 1]

    // Find content between <!-- CHUNK --> and <!-- /CHUNK -->
    const startMarkerEnd = markdown.indexOf('-->', start.index) + 3
    const endMarkerStart = nextStart
      ? markdown.lastIndexOf('<!-- /CHUNK -->', nextStart.index)
      : markdown.lastIndexOf('<!-- /CHUNK -->')

    const content = markdown.slice(startMarkerEnd, endMarkerStart).trim()

    chunks.push({
      id: start.meta.id || `chunk-${i}`,
      content,
      start_offset: startMarkerEnd,
      end_offset: endMarkerStart,
      page_start: start.meta.page_start ? parseInt(start.meta.page_start) : null,
      page_end: start.meta.page_end ? parseInt(start.meta.page_end) : null,
      heading_path: start.meta.heading ? [start.meta.heading] : null,
      heading_level: start.meta.heading_level ? parseInt(start.meta.heading_level) : null,
      section_marker: start.meta.section || null
    })
  }

  return chunks
}

function parseMetaAttributes(metaString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /(\w+)="([^"]*)"/g
  let match

  while ((match = attrRegex.exec(metaString)) !== null) {
    attrs[match[1]] = match[2]
  }

  return attrs
}
```

**Validation**:
- Test with inline metadata markdown
- Verify all chunks parsed correctly
- Verify metadata extracted accurately
- Verify offsets match content positions

---

### Phase 2: Integrate into PDF/EPUB Processors (1-2 hours)

#### Task 2.1: Update PDF Processor
**File**: `worker/processors/pdf-processor.ts`

**Changes**:
1. Add flag to use TokenChunker + inline metadata
2. Parse inline metadata instead of bulletproof matching
3. Compare results side-by-side

```typescript
// Check for inline metadata mode (new experimental mode)
const useInlineMetadata = process.env.USE_INLINE_METADATA === 'true'

if (isLocalMode && useInlineMetadata) {
  console.log('[PDFProcessor] EXPERIMENTAL: Using TokenChunker + inline metadata')

  // Extract with TokenChunker
  const result = await extractPdfBuffer(fileData, {
    chunker_type: 'token',
    chunk_size: 256,
    chunk_overlap: 64,
    inline_metadata: true
  })

  // Parse inline metadata (no bulletproof matching needed!)
  const chunks = parseInlineMetadata(result.markdown)

  console.log(`[PDFProcessor] Parsed ${chunks.length} chunks from inline metadata`)
  console.log(`[PDFProcessor] No bulletproof matching needed - metadata embedded in markdown`)

  // Convert to ProcessedChunk format
  finalChunks = chunks.map((chunk, idx) => ({
    document_id: this.job.document_id,
    content: chunk.content,
    chunk_index: idx,
    start_offset: chunk.start_offset,
    end_offset: chunk.end_offset,
    page_start: chunk.page_start,
    page_end: chunk.page_end,
    heading_path: chunk.heading_path,
    heading_level: chunk.heading_level,
    section_marker: chunk.section_marker,
    position_confidence: 'exact',  // Inline metadata = perfect sync!
    position_method: 'inline_metadata',
    // ... rest of fields
  }))

} else if (isLocalMode && doclingChunks) {
  // Existing bulletproof matching path (fallback)
  console.log('[PDFProcessor] Using HybridChunker + bulletproof matching')
  // ... existing code
}
```

**Validation**:
- Process test document with `USE_INLINE_METADATA=true`
- Verify chunks created successfully
- Compare chunk count (should be ~3x more with TokenChunker)
- Verify metadata accuracy

#### Task 2.2: Update EPUB Processor
**File**: `worker/processors/epub-processor.ts`

**Same changes as PDF processor**

---

### Phase 3: Testing & Validation (1-2 hours)

#### Test 3.1: Side-by-Side Comparison
**Script**: `worker/scripts/compare-chunking-methods.ts`

```typescript
/**
 * Compare HybridChunker vs TokenChunker on same document.
 * Measures: chunk count, overlap coverage, processing time, metadata accuracy
 */

async function compareChunkingMethods(documentId: string) {
  // Method 1: HybridChunker + bulletproof matching
  const hybrid = await processWithHybridChunker(documentId)

  // Method 2: TokenChunker + inline metadata
  const token = await processWithTokenChunker(documentId)

  console.log(`
  📊 Comparison Results:

  HybridChunker:
    - Chunks: ${hybrid.chunks.length}
    - Processing time: ${hybrid.time}ms
    - Overlap coverage: ${hybrid.overlapCoverage}%
    - Exact matches: ${hybrid.exactMatches}
    - Bulletproof layers used: ${hybrid.layersUsed}

  TokenChunker:
    - Chunks: ${token.chunks.length}
    - Processing time: ${token.time}ms
    - Overlap coverage: ${token.overlapCoverage}%
    - Exact matches: ${token.exactMatches} (inline metadata)
    - Bulletproof matching: Not needed!

  Winner: ${token.time < hybrid.time && token.overlapCoverage > hybrid.overlapCoverage ? 'TokenChunker' : 'HybridChunker'}
  `)
}
```

**Run on**:
- Hexen3 (small, 83 chunks)
- HEXEN2 (medium, 382 chunks)
- Large test document (>500 chunks)

**Expected Results**:
- TokenChunker produces 2-3x more chunks (smaller size)
- TokenChunker has 95%+ overlap coverage (guaranteed overlap)
- TokenChunker faster (simpler algorithm)
- TokenChunker 100% exact matches (no fuzzy matching needed)

#### Test 3.2: Content-Offset Sync Validation
**Script**: Reuse existing `worker/scripts/validate-bulletproof-matcher.ts`

**Modify to test inline metadata mode**:
```bash
# Test TokenChunker + inline metadata
USE_INLINE_METADATA=true npx tsx scripts/validate-bulletproof-matcher.ts <document_id>

# Expected:
# ✅ Content-offset sync: 100% (inline metadata = perfect sync)
# ✅ Binary search: 100%
# ✅ Overlap coverage: 95%+ (guaranteed overlap)
```

#### Test 3.3: AI Cleanup Impact Test
**Question**: Does inline metadata survive AI cleanup?

**Test**:
```typescript
// Extract with inline metadata
const markdown = extractWithInlineMetadata(pdf)

// Before cleanup
const chunksBefore = parseInlineMetadata(markdown)

// After AI cleanup
const cleanedMarkdown = await cleanMarkdownLocal(markdown)
const chunksAfter = parseInlineMetadata(cleanedMarkdown)

// Verify metadata preserved
console.log(`
Chunks before cleanup: ${chunksBefore.length}
Chunks after cleanup: ${chunksAfter.length}
Metadata preserved: ${chunksBefore.length === chunksAfter.length ? 'YES' : 'NO'}
`)
```

**Possible outcomes**:
1. **HTML comments preserved** → Skip AI cleanup entirely (fastest!)
2. **HTML comments removed** → Need to parse before cleanup
3. **HTML comments corrupted** → Fallback to bulletproof matching

---

## 🎯 Success Metrics

### Must-Pass (Blocking)
- [ ] TokenChunker extraction works for PDF and EPUB
- [ ] Inline metadata parser extracts all chunks correctly
- [ ] Content-offset sync: 100% (same as current)
- [ ] Binary search: 100% (same as current)
- [ ] No regressions in processing success rate

### Target Metrics (Goals)
- [ ] Overlap coverage: 95%+ (vs 70-90% with HybridChunker)
- [ ] Processing time: 10-20% faster (simpler algorithm)
- [ ] Chunk count: 2-3x more chunks (smaller chunks = better granularity)
- [ ] Bulletproof matching: Optional (inline metadata may eliminate need)

### Nice-to-Have
- [ ] AI cleanup optional (custom serializer may produce clean output)
- [ ] Zero offset drift (inline metadata survives cleanup)
- [ ] Simpler codebase (less matching complexity)

---

## 🔄 Migration Strategy

### Phase 1: Dual Mode (Safest)
```bash
# Default: HybridChunker (existing production mode)
PROCESSING_MODE=local

# Experimental: TokenChunker + inline metadata
PROCESSING_MODE=local USE_INLINE_METADATA=true
```

**Both modes coexist**, switch via env var.

### Phase 2: A/B Testing
Process same documents with both modes, compare:
- Chunk quality (for Chonkie metadata transfer)
- Overlap coverage
- Processing time
- Cost (if any API calls differ)

### Phase 3: Gradual Rollout
1. Switch new documents to TokenChunker
2. Keep existing documents on HybridChunker (backward compatible)
3. Optionally reprocess old documents

### Phase 4: Deprecate HybridChunker
Once TokenChunker validated:
- Remove HybridChunker code path
- Default to TokenChunker
- Remove bulletproof matching (if inline metadata works)

---

## 🚨 Rollback Plan

**If validation fails**:
1. Set `USE_INLINE_METADATA=false`
2. Falls back to HybridChunker + bulletproof matching
3. No data loss (both modes store compatible schema)

**If inline metadata doesn't work**:
- Keep TokenChunker with bulletproof matching
- Still get benefits: 95% overlap, predictable chunks

**If TokenChunker causes issues**:
- Set `CHUNKER_TYPE=hybrid`
- Falls back to HybridChunker entirely
- Zero risk migration

---

## 📁 Files to Create/Modify

### New Files
- `worker/scripts/inline_metadata_serializer.py` (Python custom serializer)
- `worker/lib/local/inline-metadata-parser.ts` (TypeScript parser)
- `worker/scripts/compare-chunking-methods.ts` (Validation script)
- `docs/validation/tokenizer-chunking-validation.md` (Results doc)

### Modified Files
- `worker/scripts/docling_extract.py` (Add TokenChunker + serializer)
- `worker/processors/pdf-processor.ts` (Add inline metadata path)
- `worker/processors/epub-processor.ts` (Add inline metadata path)
- `worker/lib/chunking/chunker-config.ts` (Update defaults)

### Test Files
- `worker/lib/local/__tests__/inline-metadata-parser.test.ts` (Unit tests)
- `worker/tests/integration/tokenizer-chunking.test.ts` (Integration tests)

---

## 🔗 Dependencies

**Python**:
- `docling==2.55.1` (already installed)
- `docling-core` (already installed)

**TypeScript**:
- No new dependencies (pure regex parsing)

**Environment Variables**:
```bash
# New flags
USE_INLINE_METADATA=true     # Enable TokenChunker + inline metadata
CHUNKER_TYPE=token           # 'token' or 'hybrid'
CHUNK_SIZE=256               # Token count per chunk
CHUNK_OVERLAP=64             # Overlap tokens (25% of chunk_size)
```

---

## 📝 Validation Checklist

### Pre-Implementation
- [ ] Review Docling TokenChunker documentation
- [ ] Review custom serialization examples
- [ ] Understand HTML comment markdown behavior

### During Implementation
- [ ] Test inline metadata serializer in isolation
- [ ] Test inline metadata parser in isolation
- [ ] Test with small document first (10 pages)
- [ ] Test with medium document (100 pages)
- [ ] Test with large document (500 pages)

### Post-Implementation
- [ ] Run validation script on 3+ test documents
- [ ] Compare HybridChunker vs TokenChunker side-by-side
- [ ] Verify overlap coverage >95%
- [ ] Verify content-offset sync 100%
- [ ] Test AI cleanup impact on inline metadata
- [ ] Document results in `docs/validation/`

### Before Chonkie Integration
- [ ] All validation tests pass
- [ ] Performance acceptable (<20 min for 500-page book)
- [ ] No regressions in processing success rate
- [ ] Team approval on metrics

---

## 🎯 Next Steps After Completion

1. **Update bulletproof-matcher-pipeline-bug-handoff.md**
   - Note: TokenChunker + inline metadata eliminates root cause
   - No markdown modification between matching and storage
   - Inline metadata = zero offset drift by design

2. **Proceed to Chonkie Phase 1** (Task T-003 from hybrid-chunking-system.md)
   - Install Chonkie library
   - Create Python wrapper with 6 chunker types
   - TypeScript IPC integration

3. **Update documentation**
   - `docs/local-pipeline-setup.md` - New TokenChunker instructions
   - `docs/processing-pipeline/docling-patterns.md` - Custom serialization
   - `README.md` - Updated processing mode descriptions

---

## 📚 References

**Docling Documentation**:
- [Custom Serialization Guide](https://docling-project.github.io/docling/examples/serialization/#creating-a-custom-serializer)
- [TokenChunker API](https://docling-project.github.io/docling/reference/chunking/)
- [Chunker Configuration](https://docling-project.github.io/docling/examples/chunking/)

**Related Task Docs**:
- `docs/tasks/hybrid-chunking-system.md` - Phase 0, T-001 (Bulletproof matcher validation)
- `docs/todo/bulletproof-matcher-pipeline-bug-handoff.md` - Original bug analysis
- `docs/validation/bulletproof-matcher-validation.md` - Validation results

**Code References**:
- `worker/scripts/docling_extract.py` - Existing extraction logic
- `worker/lib/local/bulletproof-matcher.ts` - Current matching system
- `worker/processors/pdf-processor.ts` - Pipeline orchestration

---

**Last Updated**: 2025-10-15
**Ready to Start**: After bulletproof matcher fix validated ✅
**Estimated Completion**: 2025-10-15 (same day, 4-6 hours)
