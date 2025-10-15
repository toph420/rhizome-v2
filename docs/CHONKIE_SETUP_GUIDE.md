# Chonkie Integration - Setup & Usage Guide

**Last Updated**: 2025-10-15
**Status**: ✅ Production Ready
**System**: Rhizome V2 - Unified Processing Pipeline

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Installation](#installation)
3. [Choosing a Chunker Strategy](#choosing-a-chunker-strategy)
4. [Configuration](#configuration)
5. [Usage Examples](#usage-examples)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Topics](#advanced-topics)

---

## Quick Start

### 5-Minute Setup

```bash
# 1. Install Chonkie (basic - 15 MiB)
cd worker
pip install chonkie

# 2. Verify installation
python3 -c "from chonkie import RecursiveChunker; print('✅ Chonkie installed')"

# 3. Test with existing document
cd ..
npx tsx worker/scripts/test-chonkie-integration.ts <your-document-id>
```

That's it! The system is now using Chonkie's recursive chunker (default, recommended for 80% of documents).

### Understanding the Pipeline

When you upload a document, it goes through 10 stages:

```
1. Download        (10-15%)   Fetch from Storage
2. Docling Extract (15-50%)   Extract metadata anchors
3. Cleanup         (50-70%)   Clean markdown
4. Bulletproof     (70-72%)   Create coordinate map
5. Review          (72%)      Optional checkpoint
6. Chonkie Chunk   (72-75%)   🎯 YOUR CHUNKER STRATEGY
7. Transfer        (75-77%)   Aggregate metadata via overlaps
8. Enrich          (77-90%)   Extract themes, concepts
9. Embed           (90-95%)   Generate 768d vectors
10. Finalize       (95-100%)  Save to database
```

**Stage 6 is where Chonkie runs** - that's the only stage you control via chunker selection.

---

## Installation

### Basic Installation (Recommended)

For most use cases, the basic installation is sufficient:

```bash
cd worker
pip install chonkie
```

**Includes**: token, sentence, recursive, table chunkers (15 MiB)

### Semantic/Late Chunkers

If you need semantic or late chunkers (narrative documents, high-quality RAG):

```bash
pip install "chonkie[semantic]"
```

**Adds**: sentence-transformers library (62 MiB additional)

### Neural Chunker

For BERT-based semantic shift detection (academic papers):

```bash
pip install "chonkie[neural]"
```

**Adds**: BERT models (varies by model size)

### Code Chunker

For AST-aware code splitting (source code files):

```bash
pip install "chonkie[code]"
```

**Adds**: tree-sitter library

### Slumber Chunker

For agentic LLM-powered chunking (highest quality, slowest):

```bash
pip install "chonkie[genie]"
```

**Requires**: API key (Gemini or OpenAI)

### Everything

Install all chunker types (not recommended unless you need all):

```bash
pip install "chonkie[all]"
```

**Total size**: ~680 MiB

### Verification

After installation, verify Chonkie is working:

```bash
# Test Python import
python3 <<EOF
from chonkie import RecursiveChunker
chunker = RecursiveChunker(chunk_size=512)
chunks = chunker.chunk("# Test\n\nThis is a test document.")
print(f"✅ Created {len(chunks)} chunks")
EOF
```

---

## Choosing a Chunker Strategy

### Decision Matrix

| If your document is... | Use this chunker | Speed | Quality |
|------------------------|------------------|-------|---------|
| **Textbook, manual, or structured reference** | **recursive** | 3-5 min | High ✅ |
| **Novel, essay, or narrative** | semantic | 8-15 min | Very High |
| **Academic paper or research** | neural | 15-25 min | Very High |
| **Source code** | code | 5-10 min | High |
| **Table-heavy report** | table | 3-5 min | Good |
| **Quick test or demo** | token | 2-3 min | Basic |
| **Most critical document** | slumber | 30-60 min | Highest |
| **Well-formatted clean text** | sentence | 3-4 min | Good |
| **High-quality RAG application** | late | 10-20 min | Very High |

### The Default: Recursive

**Why recursive is recommended for 80% of documents:**

1. **Fast**: 3-5 minutes for 500-page document
2. **Flexible**: Hierarchical splitting (paragraph → sentence → token)
3. **Quality**: Respects structural boundaries
4. **Reliable**: Works well with most document types

**When NOT to use recursive:**
- Narrative fiction where topic coherence matters more than structure → Use **semantic**
- Academic papers with complex semantic shifts → Use **neural**
- Source code files → Use **code**

### Strategy Details

#### Token Chunker
```
Use Case: Fixed-size chunks, compatibility
Speed: 2-3 min (fastest)
Quality: Basic

Best For:
- Testing and development
- Compatibility with older systems
- When predictable chunk sizes are required

Avoid When:
- You need semantic coherence
- Structural boundaries matter
```

#### Sentence Chunker
```
Use Case: Simple sentence boundaries
Speed: 3-4 min
Quality: Good

Best For:
- Well-formatted text with clear sentence structure
- Simple documents without complex structure
- When you want sentence-level granularity

Avoid When:
- Document has poor sentence boundaries
- You need deeper structural understanding
```

#### Recursive Chunker (DEFAULT)
```
Use Case: Structured documents
Speed: 3-5 min
Quality: High ✅

Best For:
- Textbooks and manuals
- Technical documentation
- Most document types (80% use case)

Avoid When:
- Narrative fiction where structure doesn't matter
- You need semantic topic detection
```

#### Semantic Chunker
```
Use Case: Narrative, thematic coherence
Speed: 8-15 min
Quality: Very High

Best For:
- Novels and fiction
- Essays and opinion pieces
- Documents where topic coherence matters

Avoid When:
- Speed is critical
- Document is highly structured (use recursive instead)
```

#### Late Chunker
```
Use Case: High-quality RAG
Speed: 10-20 min
Quality: Very High

Best For:
- Critical RAG applications
- When retrieval quality is paramount
- Documents with complex topic interleaving

Avoid When:
- Speed matters more than marginal quality gains
- Your use case doesn't need contextual embeddings
```

#### Code Chunker
```
Use Case: Source code files
Speed: 5-10 min
Quality: High (for code)

Best For:
- Source code files only
- When you need AST-aware splitting
- Preserving code structure

Avoid When:
- Not source code
- Code has syntax errors (may fall back to basic splitting)
```

#### Neural Chunker
```
Use Case: BERT-based semantic shifts
Speed: 15-25 min
Quality: Very High

Best For:
- Academic papers
- Research documents
- Complex semantic content

Avoid When:
- Speed is important
- Simpler chunkers (semantic, recursive) work well enough
```

#### Slumber Chunker
```
Use Case: Agentic LLM-powered
Speed: 30-60 min (slowest)
Quality: Highest

Best For:
- Most critical documents only
- When quality is absolutely paramount
- Documents worth the time investment

Avoid When:
- Almost always (use neural or semantic for quality instead)
- Cost or time constraints
```

#### Table Chunker
```
Use Case: Markdown tables
Speed: 3-5 min
Quality: Good (for tables)

Best For:
- Documents with many markdown tables
- When you want row-by-row table splitting

Avoid When:
- Document doesn't have markdown tables
- Tables are not the primary content
```

---

## Configuration

### User-Level Configuration

**Upload Form Selection** (Recommended):

When uploading a document, select your chunker from the dropdown in the upload form:

```
Chunking Strategy: [Recursive - Structural (Recommended, 3-5 min) ▼]
```

**Default Chunker Preference**:

Set your default in user preferences (future feature - stores in `user_preferences.default_chunker_type`).

### Document-Level Configuration

Each document stores its chunker type in the database:

```sql
SELECT title, chunker_type FROM documents WHERE id = 'your-doc-id';
```

You can see which chunker was used in the document header (colored badge next to title).

### Environment Variables

No environment variables needed! Chonkie configuration is passed via the upload form.

### Advanced Configuration

For advanced use cases, you can customize chunker parameters in `worker/lib/chonkie/chonkie-chunker.ts`:

```typescript
const config: ChonkieConfig = {
  chunker_type: 'recursive',
  chunk_size: 512,        // Or 768 for alignment with embeddings
  tokenizer: 'gpt2',      // Default tokenizer

  // Recursive-specific
  recipe: 'markdown',     // Pre-configured rules

  // Semantic-specific
  embedding_model: 'all-MiniLM-L6-v2',
  threshold: 0.7,         // Or 'auto'

  // Late-specific
  mode: 'sentence',       // Or 'paragraph'

  // Neural-specific
  model: 'mirth/chonky_modernbert_base_1',

  // Code-specific
  language: 'python',
  include_nodes: false,

  // Sentence-specific
  min_sentences: 1,

  // General
  timeout: 300000         // 5 minutes (auto-scaled by doc size)
}
```

---

## Usage Examples

### Example 1: Upload New Document

1. Navigate to library → Click "Upload"
2. Select your PDF file
3. Choose chunker strategy: **Recursive** (default, recommended)
4. Click "Upload"
5. Wait 3-5 minutes for processing

**Expected Result:**
- Document processed successfully
- ~350-420 chunks created
- 100% overlap coverage (metadata transferred)
- 92% high confidence chunks

### Example 2: Test Different Strategies

```bash
cd worker

# Test recursive (default)
npx tsx scripts/test-chonkie-integration.ts your-document-id

# Test all 9 strategies
npx tsx scripts/test-chonkie-integration.ts --all-chunkers your-document-id

# Generate comprehensive report
npx tsx scripts/test-chonkie-integration.ts --all-chunkers --report your-document-id
```

**Expected Report:**
```
Chonkie Integration Test Report
===================================
Document: Your Document Title
Source: pdf

Results:
| Chunker  | Chunks | Overlap | Recovery | Time    | Valid |
|----------|--------|---------|----------|---------|-------|
| token    | 380    | 88.4%   | 95.2%    | 2.3s    | ✓     |
| sentence | 365    | 89.0%   | 95.6%    | 3.1s    | ✓     |
| recursive| 358    | 100.0%  | 96.4%    | 2.8s    | ✓     |
| semantic | 342    | 91.2%   | 94.8%    | 8.9s    | ✓     |

Summary:
✅ 4/4 tests passed
✅ Average overlap: 92.2%
✅ Average recovery: 95.5%
```

### Example 3: Review Chunk Quality

After processing, review chunk quality in the sidebar:

1. Open document
2. Click "Chunk Quality" in sidebar
3. Review statistics:
   - High: 92% (184/200 chunks) ✅
   - Medium: 5% (10/200 chunks) ⚠️
   - Low: 2% (4/200 chunks) ⚠️
   - Interpolated: 1% (2/200) ❌
4. Click on low-confidence chunks to review
5. Accept or fix positions as needed

### Example 4: Verify Installation

```bash
# Test Python wrapper directly
cd worker
echo '{"markdown":"# Test\n\nParagraph 1.\n\nParagraph 2.","config":{"chunker_type":"recursive","chunk_size":512}}' | \
  python3 scripts/chonkie_chunk.py

# Expected output:
# [{"text":"# Test\n\nParagraph 1.","start_index":0,"end_index":20,"token_count":5,"chunker_type":"recursive"},...]
```

---

## Troubleshooting

### Issue 1: Python Subprocess Hangs

**Symptom**: Chunking never completes, stuck at 72% (Stage 6)

**Root Cause**: Missing `sys.stdout.flush()` in Python script

**Solution**: Verify Python script has flush after JSON output:
```python
print(json.dumps(output), flush=True)
sys.stdout.flush()  # CRITICAL
```

**Verification**:
```bash
# Test Python wrapper directly (should complete in <5 seconds)
echo '{"markdown":"Test","config":{"chunker_type":"recursive"}}' | \
  python3 worker/scripts/chonkie_chunk.py
```

### Issue 2: Character Offset Mismatch

**Symptom**: Error: "Character offset mismatch - metadata transfer will fail"

**Root Cause**: Chonkie chunks don't align with markdown content

**Solution**:
1. Verify Chonkie version ≥0.5.0: `pip show chonkie`
2. Check markdown encoding (UTF-8 required)
3. Ensure no middleware modifies markdown between stages

**Verification**:
```typescript
// This validation runs automatically after chunking
for (const chunk of chunks) {
  const extracted = markdown.slice(chunk.start_index, chunk.end_index)
  if (extracted !== chunk.text) {
    throw new Error('Character offset mismatch')
  }
}
```

### Issue 3: Low Overlap Coverage

**Symptom**: Warning: "LOW OVERLAP COVERAGE: 45% (expected >70%)"

**Root Cause**: Poor Docling extraction or unusual document structure

**Solution**:
1. Check Docling extraction quality (Stage 2 logs)
2. Verify PDF is text-based (not scanned): `pdftotext test.pdf - | head`
3. Enable OCR if scanned: `ENABLE_OCR=true` in environment
4. Review ChunkQualityPanel for validation warnings

**Verification**:
```bash
# Check cached_chunks for Docling metadata quality
psql postgres://postgres:postgres@localhost:54322/postgres \
  -c "SELECT jsonb_array_length(chunks) FROM cached_chunks WHERE document_id = 'your-doc-id';"
```

### Issue 4: Slow Processing

**Symptom**: Semantic/neural chunkers taking 2-3x longer than expected

**Root Cause**: Large document, complex content, or resource constraints

**Solution**:
1. Use faster strategy: recursive (3-5 min) or token (2-3 min)
2. Verify RAM: `free -h` (need 8GB+ for semantic, 16GB+ for neural)
3. Check CPU usage: `top -o %CPU`
4. Consider batching for >1000 page documents

**Verification**:
```bash
# Check system resources
free -h
top -l 1 | grep "CPU usage"

# Test with smaller document first
# If small doc is fast, issue is document size
```

### Issue 5: Import Errors

**Symptom**: `ImportError: cannot import name 'RecursiveChunker' from 'chonkie'`

**Root Cause**: Chonkie not installed or wrong version

**Solution**:
```bash
# Reinstall Chonkie
pip uninstall chonkie
pip install chonkie

# Verify version
pip show chonkie | grep Version
# Should be ≥0.5.0

# Test import
python3 -c "from chonkie import RecursiveChunker; print('OK')"
```

### Issue 6: Metadata Not Transferring

**Symptom**: Chunks missing heading_path, page numbers, or bboxes

**Root Cause**: Docling extraction failed or overlap detection broken

**Solution**:
1. Verify Docling stage completed: Check Stage 2 logs
2. Check cached_chunks table: `SELECT COUNT(*) FROM cached_chunks WHERE document_id = 'your-doc-id';`
3. Verify bulletproof matcher ran: Check Stage 4 logs
4. Review overlap detection: Should see "Overlap coverage: X%" in logs

**Verification**:
```sql
-- Check metadata recovery rate
SELECT
  COUNT(*) FILTER (WHERE heading_path IS NOT NULL OR page_start IS NOT NULL) * 100.0 / COUNT(*) AS recovery_rate
FROM chunks
WHERE document_id = 'your-doc-id';
-- Should be >90%
```

---

## Advanced Topics

### Custom Chunker Configuration

For specialized use cases, you can modify chunker parameters:

**Recursive Chunker with Custom Rules:**
```python
from chonkie import RecursiveChunker, RecursiveRules

rules = RecursiveRules([
    {"delimiters": ["\n\n"], "includeDelim": "prev"},  # Paragraphs
    {"delimiters": [". ", "! ", "? "], "includeDelim": "prev"},  # Sentences
    {}  # Token fallback
])

chunker = RecursiveChunker(
    tokenizer="gpt2",
    chunk_size=768,  # Align with embeddings
    rules=rules
)
```

**Semantic Chunker with Custom Threshold:**
```python
from chonkie import SemanticChunker

chunker = SemanticChunker(
    tokenizer="gpt2",
    chunk_size=512,
    embedding_model="all-MiniLM-L6-v2",
    similarity_threshold=0.8  # Higher = more conservative splits
)
```

### Performance Optimization

**For Large Documents (>500 pages):**

1. Use faster chunker initially (recursive or token)
2. Review quality metrics
3. If quality insufficient, reprocess with semantic/neural

**For Maximum Quality:**

1. Start with semantic (8-15 min)
2. If still insufficient, try neural (15-25 min)
3. Reserve slumber for most critical documents only

**For Development/Testing:**

1. Always use token or sentence (fastest)
2. Switch to target strategy only for final validation

### Monitoring & Metrics

**Key Metrics to Track:**

```typescript
// Overlap Coverage (Target: 70-90%)
const overlapCoverage = (chunksWithOverlaps / totalChunks) * 100

// Metadata Recovery (Target: >90%)
const metadataRecovery = (chunksWithMetadata / totalChunks) * 100

// High Confidence Rate (Target: >75%)
const highConfidenceRate = (highConfidenceChunks / totalChunks) * 100

// Interpolation Rate (Target: <10%)
const interpolationRate = (interpolatedChunks / totalChunks) * 100
```

**Alerting Thresholds:**
- Overlap coverage <70%: ⚠️ Warning
- Metadata recovery <90%: ⚠️ Warning
- High confidence rate <75%: ⚠️ Warning
- Interpolation rate >10%: ⚠️ Warning

### Integration Testing

**Test Suite:**
```bash
# Quick test (4 chunkers, ~5 minutes)
npx tsx worker/scripts/test-chonkie-integration.ts your-doc-id

# Full test (9 chunkers, ~15-30 minutes)
npx tsx worker/scripts/test-chonkie-integration.ts --all-chunkers your-doc-id

# With report generation
npx tsx worker/scripts/test-chonkie-integration.ts --all-chunkers --report your-doc-id
```

**Expected Success Criteria:**
- ✅ All chunkers complete successfully
- ✅ Character offsets 100% valid
- ✅ Overlap coverage >70% for all strategies
- ✅ Metadata recovery >90% for all strategies
- ✅ Processing times within acceptable ranges

---

## Resources

### Documentation

- **Chonkie Official Docs**: https://docs.chonkie.ai/oss/chunkers/overview
- **Chonkie GitHub**: https://github.com/chonkie-inc/chonkie
- **Chonkie PyPI**: https://pypi.org/project/chonkie/
- **Rhizome Pipeline Guide**: `docs/PROCESSING_PIPELINE.md`
- **Rhizome PRP**: `docs/prps/chonkie-integration.md`
- **Task Breakdown**: `docs/tasks/chonkie-integration.md`

### Codebase References

- **Python Wrapper**: `worker/scripts/chonkie_chunk.py`
- **TypeScript IPC**: `worker/lib/chonkie/chonkie-chunker.ts`
- **Metadata Transfer**: `worker/lib/chonkie/metadata-transfer.ts`
- **Types**: `worker/lib/chonkie/types.ts`
- **PDF Processor**: `worker/processors/pdf-processor.ts`
- **EPUB Processor**: `worker/processors/epub-processor.ts`
- **Database Types**: `worker/types/database.ts`
- **Migration 050**: `supabase/migrations/050_add_chunker_type.sql`
- **Upload UI**: `src/components/library/UploadZone.tsx`
- **Quality Panel**: `src/components/sidebar/ChunkQualityPanel.tsx`
- **Document Header**: `src/components/reader/DocumentHeader.tsx`
- **Integration Test**: `worker/scripts/test-chonkie-integration.ts`

### Support

For issues or questions:
1. Check troubleshooting section above
2. Review `docs/PROCESSING_PIPELINE.md` for pipeline details
3. Review Chonkie official docs
4. Check GitHub issues (if applicable)

---

**Version**: 1.0
**Last Updated**: 2025-10-15
**Status**: ✅ Production Ready
