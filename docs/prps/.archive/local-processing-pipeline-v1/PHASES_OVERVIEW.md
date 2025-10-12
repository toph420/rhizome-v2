# Local Processing Pipeline - All Phases Overview

This document provides a consolidated overview of all 11 implementation phases. For detailed task breakdowns, see individual phase files.

## Phase Summary

| Phase | Tasks | Time | Risk | Status |
|-------|-------|------|------|--------|
| **Phase 1**: Core Infrastructure | 1-4 | 3-4 days | Medium | ✅ [Complete Doc](./phase-1-core-infrastructure.md) |
| **Phase 2**: Docling Integration (PDF) | 5-7 | 4-5 days | Medium-High | ✅ [Complete Doc](./phase-2-docling-integration.md) |
| **Phase 3**: Local LLM Cleanup (PDF) | 8-9 | 2-3 days | Medium | ✅ [Complete Doc](./phase-3-local-llm-cleanup.md) |
| **Phase 4**: Bulletproof Matching (PDF) | 10-15 | 5-7 days | High | 📄 Summary below |
| **Phase 5**: EPUB Docling Integration | 16-20 | 3-5 days | Low-Medium | ✅ [Complete Doc](./phase-5-epub-docling.md) |
| **Phase 6**: Metadata Enrichment | 21-23 | 3-4 days | Medium | 📄 Summary below |
| **Phase 7**: Local Embeddings | 24-25 | 2 days | Low | 📄 Summary below |
| **Phase 8**: Review Checkpoints | 26-27 | 2 days | Low | 📄 Summary below |
| **Phase 9**: Confidence UI | 28-30 | 3-4 days | Medium | 📄 Summary below |
| **Phase 10**: Testing & Validation | 31-32 | 2-3 days | Low | 📄 Summary below |
| **Phase 11**: Documentation | 33-35 | 1-2 days | Low | 📄 Summary below |

**Total Estimated Time**: 4.5-5.5 weeks (32-40 days)

---

## Phase 4: Bulletproof Matching (Tasks 10-15)

### Overview
Most complex and critical phase. Implements 5-layer matching system to remap Docling chunks to cleaned markdown with **100% recovery guarantee**. No chunks lost, all metadata preserved.

### Dependencies
- Phase 1: Database schema (migration 045)
- Phase 2: Docling chunks cached in job metadata
- Phase 3: Cleaned markdown available

### Key Implementation Files
- `worker/lib/chunking/ai-fuzzy-matcher.ts` (MODIFY - add Layer 1)
- `worker/lib/local/bulletproof-matcher.ts` (CREATE - Layers 2-4, orchestration)
- `worker/processors/pdf-processor.ts` (MODIFY - integrate matching after cleanup)

### 5-Layer Matching System

**Layer 1: Enhanced Fuzzy (Task 10-11)**
- Extend existing `ai-fuzzy-matcher.ts` with 4 strategies:
  1. Exact match (content identical)
  2. Normalized match (whitespace/case insensitive)
  3. Multi-anchor search (find start/middle/end phrases)
  4. Sliding window similarity (>80% similarity)
- **Success Rate**: 85-90% of chunks
- **Confidence**: `exact` or `high`

**Layer 2: Embeddings (Task 11)**
- Use Transformers.js to embed unmatched chunks
- Create sliding windows of cleaned markdown
- Find best cosine similarity (threshold 0.85)
- **Success Rate**: 95-98% cumulative
- **Confidence**: `high` (>0.95 similarity) or `medium` (>0.85)

**Layer 3: LLM-Assisted (Task 12)**
- Use OllamaClient to ask Qwen to find matches
- Give LLM chunk + search window, request JSON position
- **Success Rate**: 99.9% cumulative
- **Confidence**: `medium` (LLM less precise than embeddings)

**Layer 4: Interpolation (Task 13)**
- Use successfully matched chunks as anchors
- Interpolate positions for remaining chunks
- Calculate position based on neighbors and index ratio
- **Success Rate**: 100% GUARANTEED (never fails)
- **Confidence**: `synthetic` (user validation recommended)

**Orchestration (Task 14-15)**
```typescript
// Pseudocode from PRP lines 831-882
async function bulletproofMatch(
  cleanedMarkdown: string,
  doclingChunks: DoclingChunk[]
): Promise<{chunks: MatchResult[], stats: MatchStats, warnings: string[]}> {
  const results = []
  const warnings = []

  // Layer 1: Enhanced Fuzzy
  const { matched: l1Matched, unmatched: l1Failed } =
    await enhancedFuzzyMatch(cleanedMarkdown, doclingChunks)
  results.push(...l1Matched)
  if (l1Failed.length === 0) return { chunks: results, stats, warnings: [] }

  // Layer 2: Embeddings
  const { matched: l2Matched, unmatched: l2Failed } =
    await embeddingBasedMatching(cleanedMarkdown, l1Failed)
  results.push(...l2Matched)
  if (l2Failed.length === 0) return { chunks: results, stats, warnings: [] }

  // Layer 3: LLM
  const { matched: l3Matched, unmatched: l3Failed } =
    await llmAssistedMatching(cleanedMarkdown, l2Failed)
  results.push(...l3Matched)

  // Layer 4: Interpolation (ALWAYS succeeds)
  const l4Synthetic = anchorInterpolation(cleanedMarkdown, l3Failed, results)
  results.push(...l4Synthetic)

  // Generate warnings for synthetic chunks
  for (const synthetic of l4Synthetic) {
    warnings.push(
      `Chunk ${synthetic.chunk.index} (page ${synthetic.chunk.page_start}): ` +
      `Position approximate, metadata preserved`
    )
  }

  return { chunks: results, stats: calculateStats(results), warnings }
}
```

### Critical Integration with PDF Processor

```typescript
// worker/processors/pdf-processor.ts
// Stage 6: Bulletproof matching (70-75%)

await this.updateProgress(72, 'matching', 'processing', 'Remapping chunks')

const { chunks: rematchedChunks, stats, warnings } = await bulletproofMatch(
  cleanedMarkdown,
  this.job.metadata.doclingChunks
)

console.log(`[PDF] Matching: ${stats.exact} exact, ${stats.high} high, ${stats.medium} medium, ${stats.synthetic} synthetic`)

// Store warnings for UI
this.job.metadata.matchingWarnings = warnings

// Combine Docling metadata + new offsets + confidence
const finalChunks = rematchedChunks.map(result => ({
  content: result.chunk.content,
  start_offset: result.start_offset,      // NEW - in cleaned markdown
  end_offset: result.end_offset,          // NEW - in cleaned markdown
  page_start: result.chunk.page_start,    // PRESERVED from Docling
  page_end: result.chunk.page_end,        // PRESERVED from Docling
  heading_path: result.chunk.heading_path, // PRESERVED from Docling
  bboxes: result.chunk.bboxes,            // PRESERVED from Docling
  position_confidence: result.confidence, // NEW - quality tracking
  position_method: result.method          // NEW - which layer matched
}))

await this.updateProgress(75, 'matching', 'complete', `${finalChunks.length} chunks matched`)
```

### Validation Commands

```bash
# Test individual layers
cd worker
npx tsx lib/local/__tests__/test-layer1-fuzzy.ts
npx tsx lib/local/__tests__/test-layer2-embeddings.ts
npx tsx lib/local/__tests__/test-layer3-llm.ts
npx tsx lib/local/__tests__/test-layer4-interpolation.ts

# Test orchestration
npx tsx lib/local/__tests__/test-orchestrator.ts <document_id>

# Expected output:
# Layer 1: 340/400 chunks (85%)
# Layer 2: 55/60 chunks (92% cumulative)
# Layer 3: 4/5 chunks (99% cumulative)
# Layer 4: 1/1 chunks (100% guaranteed)
# Total: 400/400 chunks matched
# Synthetic: 1 (0.25%)

# Integration test
cd worker && npm run test:integration
# Should include bulletproof-matching.test.ts
```

### Success Criteria
- ✅ 100% chunk recovery rate (0 lost chunks)
- ✅ <5% synthetic chunks (need user validation)
- ✅ 85%+ chunks match with "exact" confidence
- ✅ All Docling metadata preserved (pages, headings, bboxes)
- ✅ Warnings generated for synthetic chunks

---

## Phase 5: EPUB Docling Integration (Tasks 16-20)

### Overview
Extend local processing pipeline to EPUBs using same Docling approach as PDFs. EPUBs get structural metadata extraction, local cleanup, and bulletproof matching with section markers instead of page numbers.

### Dependencies
- Phase 1: Core Infrastructure (database, Ollama, Transformers.js)
- Phase 2: Docling PDF extraction (proven patterns)
- Phase 3: Local cleanup (Ollama integration)
- Phase 4: Bulletproof matching (adapt for section-based positioning)

### Key Implementation Files
- `worker/scripts/docling_extract_epub.py` (CREATE - Python EPUB→HTML→Docling)
- `worker/lib/epub/epub-docling-extractor.ts` (CREATE - TypeScript wrapper)
- `worker/processors/epub-processor.ts` (MODIFY - add local mode)
- `worker/lib/bulletproof-matching.ts` (MODIFY - adapt Layer 4 for sections)

### Critical Differences from PDF

| Aspect | PDF | EPUB |
|--------|-----|------|
| **Input** | PDF file | EPUB → HTML (via jszip) |
| **Page Numbers** | page_start, page_end | NULL (use section_marker) |
| **Bounding Boxes** | bboxes array | NULL (HTML has no coordinates) |
| **Structure** | Headings + pages | Headings + section markers |
| **Matching Key** | Page ranges | Section markers |
| **Interpolation** | Between page numbers | Between section markers |

### Task Breakdown

**Task 16: Python EPUB Extractor**
```python
# docling_extract_epub.py
# - Read HTML from stdin
# - Convert with Docling DocumentConverter
# - HybridChunker with same tokenizer as PDFs
# - Extract section_marker from headings
# - Set page_start/page_end to NULL
# - Set bboxes to NULL
```

**Task 17: TypeScript EPUB Wrapper**
```typescript
// epub-docling-extractor.ts
# - Extract EPUB to unified HTML (spine order)
# - Feed HTML to Python script
# - Parse Docling chunks with section markers
# - Cache in job metadata for matching
```

**Task 18: EPUB Processor Integration**
```typescript
// epub-processor.ts
# - Check PROCESSING_MODE environment variable
# - Local mode: Use Docling + Ollama cleanup
# - Cloud mode: Existing Gemini pipeline (backward compatible)
# - Cache doclingChunks for bulletproof matching
```

**Task 19: Adapt Bulletproof Matching**
```typescript
// Layer 4 interpolation for EPUBs
# - Use section_marker instead of page numbers
# - Interpolate heading_path for synthetic chunks
# - Generate synthetic section markers
# - 90% code reuse from PDF implementation
```

**Task 20: Validation**
```bash
# Integration tests with EPUB samples
# Verify: section_marker populated, pages NULL
# Bulletproof matching achieves 100% recovery
```

### Validation Commands

```bash
# Test EPUB extraction
echo '{"tokenizer": "Xenova/all-mpnet-base-v2"}' | \
  python worker/scripts/docling_extract_epub.py < test.html

# Integration test
cd worker && npm test -- epub-docling

# Expected:
# - Chunks have section_marker
# - page_start/page_end are NULL
# - Bulletproof matching works
```

### Success Criteria
- ✅ EPUB → HTML → Docling extraction works
- ✅ Chunks have section_marker instead of page numbers
- ✅ Local Ollama cleanup works for EPUBs
- ✅ Bulletproof matching adapted for section-based positioning
- ✅ 100% chunk recovery (same as PDFs)
- ✅ Both formats ready for unified metadata/embeddings phases

### Cost Savings
- **Current EPUB**: $0.60 cleanup + $0.50 chunking = $1.10/document
- **Local EPUB**: $0.00 (100% local)
- **1,000 EPUBs**: Save $1,100
- **Privacy**: Complete (no cloud API calls)

---

## Phase 6: Metadata Enrichment (Tasks 21-23)

### Overview
Use PydanticAI with Ollama to extract structured metadata from chunks for **both PDFs and EPUBs**. Type-safe outputs with automatic retry on validation failure.

### Dependencies
- Phase 5: EPUB Docling Integration (both formats have chunks with structural metadata)

### Key Implementation Files
- `worker/scripts/extract_metadata_pydantic.py` (CREATE)
- `worker/lib/chunking/pydantic-metadata.ts` (CREATE)
- `worker/processors/pdf-processor.ts` (MODIFY - add metadata stage)
- `worker/processors/epub-processor.ts` (MODIFY - add metadata stage)

### PydanticAI Python Script (Task 21)

```python
# worker/scripts/extract_metadata_pydantic.py

from pydantic import BaseModel, Field
from pydantic_ai import Agent
import json
import sys

class ChunkMetadata(BaseModel):
    themes: list[str] = Field(min_length=1, max_length=5)
    concepts: list[dict] = Field(min_length=1, max_length=10)
    importance: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=20, max_length=200)
    emotional: dict  # {polarity, primaryEmotion, intensity}
    domain: str

agent = Agent(
    model='ollama:qwen2.5:32b-instruct-q4_K_M',
    result_type=ChunkMetadata,
    retries=3  # Auto-retry if validation fails
)

# Read chunks from stdin, one JSON per line
for line in sys.stdin:
    chunk = json.loads(line)

    try:
        result = await agent.run(chunk['content'])
        sys.stdout.write(json.dumps({
            'chunk_id': chunk['id'],
            'metadata': result.data.model_dump()
        }) + '\n')
        sys.stdout.flush()
    except Exception as e:
        # Return fallback metadata
        sys.stdout.write(json.dumps({
            'chunk_id': chunk['id'],
            'metadata': get_fallback_metadata(),
            'error': str(e)
        }) + '\n')
        sys.stdout.flush()
```

### TypeScript Wrapper (Task 22)

```typescript
// worker/lib/chunking/pydantic-metadata.ts

import { spawn } from 'child_process'
import path from 'path'

async function extractMetadataBatch(
  chunks: Array<{id: string, content: string}>
): Promise<Map<string, ChunkMetadata>> {
  const pythonScript = path.join(process.cwd(), 'worker/scripts/extract_metadata_pydantic.py')
  const python = spawn('python', ['-u', pythonScript])

  const results = new Map()

  // Write chunks to stdin
  for (const chunk of chunks) {
    python.stdin.write(JSON.stringify(chunk) + '\n')
  }
  python.stdin.end()

  // Read results from stdout
  for await (const line of python.stdout) {
    const result = JSON.parse(line)
    results.set(result.chunk_id, result.metadata)
  }

  return results
}
```

### Integration (Task 23)

```typescript
// worker/processors/pdf-processor.ts
// Stage 7: Metadata enrichment (75-90%)

await this.updateProgress(77, 'metadata', 'processing', 'Extracting metadata')

const BATCH_SIZE = 10
const enriched = []

for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
  const batch = finalChunks.slice(i, i + BATCH_SIZE)
  const metadata = await extractMetadataBatch(
    batch.map(c => ({ id: c.id, content: c.content }))
  )

  for (const chunk of batch) {
    enriched.push({
      ...chunk,
      themes: metadata.get(chunk.id).themes,
      concepts: metadata.get(chunk.id).concepts,
      importance_score: metadata.get(chunk.id).importance,
      summary: metadata.get(chunk.id).summary,
      emotional_metadata: metadata.get(chunk.id).emotional,
      domain_metadata: { primaryDomain: metadata.get(chunk.id).domain }
    })
  }

  const progress = 77 + Math.floor((i / finalChunks.length) * 13)
  await this.updateProgress(progress, 'metadata', 'processing', `Batch ${i/BATCH_SIZE + 1}`)
}

await this.updateProgress(90, 'metadata', 'complete', 'Metadata enrichment done')
```

### Validation
```bash
# Test PydanticAI script
echo '{"id": "test", "content": "Machine learning is transforming AI."}' | \
  python worker/scripts/extract_metadata_pydantic.py

# Expected: JSON with themes, concepts, importance, etc.

# Integration test
cd worker && npm run validate:metadata
# Should test metadata extraction with mocked Ollama
```

---

## Phase 7: Local Embeddings (Tasks 24-25)

### Overview
Replace Gemini embeddings with local Transformers.js for **both PDFs and EPUBs**. Uses same model (`Xenova/all-mpnet-base-v2`) as HybridChunker tokenizer for alignment.

### Dependencies
- Phase 6: Metadata Enrichment (both formats have enriched chunks)

### Key Implementation Files
- `worker/lib/local/embeddings-local.ts` (CREATE)
- `worker/processors/pdf-processor.ts` (MODIFY - add local embeddings stage)
- `worker/processors/epub-processor.ts` (MODIFY - add local embeddings stage)

### Implementation (Task 24)

```typescript
// worker/lib/local/embeddings-local.ts

import { pipeline } from '@huggingface/transformers'

let cachedExtractor: any = null

async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  if (!cachedExtractor) {
    cachedExtractor = await pipeline(
      'feature-extraction',
      'Xenova/all-mpnet-base-v2'
    )
  }

  const embeddings = await cachedExtractor(texts, {
    pooling: 'mean',      // REQUIRED
    normalize: true       // REQUIRED
  })

  return embeddings.tolist()  // Convert tensor to array
}
```

### Integration (Task 25)

```typescript
// worker/processors/pdf-processor.ts
// Stage 8: Embedding generation (90-95%)

await this.updateProgress(92, 'embeddings', 'processing', 'Generating embeddings')

const isLocalMode = process.env.PROCESSING_MODE === 'local'
let embeddings

if (isLocalMode) {
  try {
    embeddings = await generateEmbeddingsBatch(
      enriched.map(c => c.content)
    )
  } catch (error) {
    console.warn('[PDF] Local embeddings failed, falling back to Gemini')
    embeddings = await generateEmbeddings(enriched.map(c => c.content))
  }
} else {
  embeddings = await generateEmbeddings(enriched.map(c => c.content))
}

// Attach embeddings to chunks
enriched.forEach((chunk, i) => {
  chunk.embedding = embeddings[i]
})

await this.updateProgress(95, 'embeddings', 'complete', 'Embeddings generated')
```

### Critical Gotcha
```typescript
// From PRP lines 302-308:
// "CRITICAL: Transformers.js requires specific pipeline options
// Without pooling and normalize, embeddings will be wrong dimensions"

// ❌ WRONG - Missing pooling/normalize
const embeddings = await extractor(texts)

// ✅ CORRECT - With required options
const embeddings = await extractor(texts, {
  pooling: 'mean',
  normalize: true
})
```

---

## Phase 8: Review Checkpoints (Tasks 26-27)

### Overview
Add manual review checkpoints at critical stages. User can pause processing, review in Obsidian, edit if needed, then continue.

### Checkpoints
1. **After Docling Extraction** (reviewDoclingExtraction flag)
2. **Before Chunking** (existing reviewBeforeChunking flag)

### Implementation (Task 26)

```typescript
// worker/processors/pdf-processor.ts
// Stage 3: Review checkpoint (optional - 55%)

const reviewDoclingExtraction = this.job.input_data?.reviewDoclingExtraction

if (reviewDoclingExtraction) {
  console.log('[PDF] Pausing for Docling extraction review')

  // Export to Obsidian
  await exportToObsidian(this.job.document_id, this.job.user_id)

  // Set awaiting review status
  await this.supabase
    .from('documents')
    .update({
      processing_status: 'awaiting_manual_review',
      review_stage: 'docling_extraction'
    })
    .eq('id', this.job.document_id)

  // Return partial result (no chunks yet)
  return {
    markdown: regexCleanedMarkdown,
    chunks: [],
    metadata: {
      review_stage: 'docling_extraction',
      awaiting_user_decision: true
    }
  }
}
```

### Resume Handler (Task 27)

```typescript
// worker/handlers/continue-processing.ts

if (review_stage === 'docling_extraction') {
  console.log('[Continue] Resuming from Docling extraction review')

  // Sync edited markdown from Obsidian
  const { changed, markdown } = await syncFromObsidian(documentId, userId)

  // Check user decision on AI cleanup
  const runAICleanup = job.input_data?.cleanMarkdown ?? true

  if (runAICleanup) {
    return await runAICleanup(job, markdown)
  } else {
    return await runChunking(job, markdown)
  }
}
```

---

## Phase 9: Confidence UI (Tasks 28-30)

### Overview
Display chunk quality indicators in UI. Show confidence levels, match methods, and flagged synthetic chunks.

### Components to Create

**1. ChunkQualityPanel (Task 28)**
```typescript
// src/components/sidebar/ChunkQualityPanel.tsx

export function ChunkQualityPanel({ documentId }: { documentId: string }) {
  const { data: stats } = useChunkStats(documentId)
  const { data: syntheticChunks } = useSyntheticChunks(documentId)

  return (
    <div className="space-y-4 p-4">
      {/* Quality Stats */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Exact" count={stats.exact} color="green" />
        <StatCard label="High" count={stats.high} color="blue" />
        <StatCard label="Medium" count={stats.medium} color="yellow" />
        <StatCard label="Synthetic" count={stats.synthetic} color="orange" />
      </div>

      {/* Synthetic Chunks List */}
      {syntheticChunks.length > 0 && (
        <Accordion type="single" collapsible>
          {syntheticChunks.map(chunk => (
            <AccordionItem key={chunk.id} value={chunk.id}>
              <AccordionTrigger>
                <Badge variant="warning">Synthetic</Badge>
                <span>Chunk {chunk.chunk_index} (Page {chunk.page_start})</span>
              </AccordionTrigger>
              <AccordionContent>
                <Button onClick={() => validateChunk(chunk.id)}>
                  ✓ Position Correct
                </Button>
                <Button onClick={() => showInDocument(chunk.id)}>
                  Review in Document
                </Button>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  )
}
```

**2. Sidebar Tab (Task 29)**
```typescript
// Add Quality tab to existing sidebar
<SidebarTab icon={CheckCircle} label="Quality">
  <ChunkQualityPanel documentId={documentId} />
</SidebarTab>
```

**3. Inline Tooltips (Task 30)**
```typescript
// Add confidence indicators to chunk rendering
function ChunkWithMetadata({ chunk, children }) {
  const isSynthetic = chunk.position_confidence === 'synthetic'

  return (
    <span data-chunk-id={chunk.id}>
      {isSynthetic && (
        <Tooltip>
          <TooltipTrigger>
            <WarningIcon className="inline w-3 h-3 text-yellow-500" />
          </TooltipTrigger>
          <TooltipContent>
            Confidence: {chunk.position_confidence}
            Method: {chunk.position_method}
            Page: {chunk.page_start}
          </TooltipContent>
        </Tooltip>
      )}
      {children}
    </span>
  )
}
```

---

## Phase 10: Testing & Validation (Tasks 31-32)

### Integration Tests (Task 31)

```typescript
// worker/tests/integration/local-processing.test.ts

describe('Local Processing Pipeline', () => {
  it('extracts PDF with Docling and HybridChunker', async () => {
    const result = await extractPdfBuffer(testPdfBuffer, {
      enableChunking: true,
      chunkSize: 512,
      tokenizer: 'Xenova/all-mpnet-base-v2'
    })

    expect(result.chunks).toBeDefined()
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.chunks[0]).toHaveProperty('page_start')
  })

  it('achieves 100% chunk recovery with bulletproof matching', async () => {
    const { chunks, stats } = await bulletproofMatch(cleanedMarkdown, doclingChunks)

    expect(chunks.length).toBe(doclingChunks.length)
    expect(stats.synthetic).toBeLessThan(chunks.length * 0.05)
  })

  it('handles Qwen OOM gracefully', async () => {
    mockOllama.mockRejectedValueOnce(new Error('out of memory'))
    const result = await processDocument(testJob)

    expect(result.metadata.ai_cleanup_status).toBe('skipped')
  })
})
```

### Validation Commands (Task 32)

```bash
# Worker integration tests
cd worker && npm run test:integration

# Metadata validation
cd worker && npm run validate:metadata

# E2E tests
npm run test:e2e

# Build verification
npm run build

# Expected: All tests pass, no linting errors, build succeeds
```

---

## Phase 11: Documentation (Tasks 33-35)

### Environment Variables (Task 33)

```bash
# .env.local.example

# Local Processing Pipeline
PROCESSING_MODE=local                           # Enable local pipeline
OLLAMA_HOST=http://127.0.0.1:11434             # Ollama server URL
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M       # Model name
OLLAMA_TIMEOUT=600000                           # Timeout (10 minutes)
```

### Setup Instructions (Task 34)

Create `docs/local-pipeline-setup.md`:

```markdown
# Local Processing Pipeline Setup

## Prerequisites
- Python 3.10+
- Ollama installed
- 64GB RAM (for Qwen 32B)

## Installation

### 1. Python Dependencies
```bash
cd worker
pip install docling==2.55.1
pip install 'pydantic-ai[ollama]'
pip install sentence-transformers
pip install transformers
```

### 2. Ollama Setup
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Qwen model
ollama pull qwen2.5:32b-instruct-q4_K_M

# Start server
ollama serve
```

### 3. Node.js Packages
```bash
cd worker
npm install ollama @huggingface/transformers
```

### 4. Environment Configuration
```bash
# Copy example
cp .env.local.example .env.local

# Set local mode
echo "PROCESSING_MODE=local" >> .env.local
```

## Testing
```bash
# Run validation
cd worker && npm run test:integration

# Upload test PDF via UI
# Verify: Processing completes, chunks show confidence
```
```

### CLAUDE.md Update (Task 35)

Add to `/Users/topher/Code/rhizome-v2/CLAUDE.md`:

```markdown
## Local Processing Pipeline

### Overview
100% local document processing with Docling, Ollama (Qwen 32B), and Transformers.js.
Zero API costs, complete privacy.

### Architecture
- **Docling**: PDF extraction with HybridChunker
- **Ollama**: Local LLM for cleanup and metadata
- **Transformers.js**: Local embeddings (768d)
- **Bulletproof Matching**: 5-layer system, 100% recovery guarantee

### Commands
```bash
# Start Ollama
ollama serve

# Set local mode
export PROCESSING_MODE=local

# Run worker
cd worker && npm run dev

# Validation
cd worker && npm run test:integration
cd worker && npm run validate:metadata
```

### Memory Requirements
- Qwen 32B Q4_K_M: ~20-24GB RAM
- M1 Max 64GB: Recommended
- Smaller machines: Use Qwen 14B or 7B

### Performance Targets
- Small PDFs (<50 pages): <5 minutes
- Large PDFs (500 pages): <80 minutes
- 100% chunk recovery rate
- <5% synthetic chunks

### Key Files
- `worker/lib/local/ollama-client.ts` - Ollama integration
- `worker/lib/local/bulletproof-matcher.ts` - 5-layer matching
- `worker/lib/local/embeddings-local.ts` - Local embeddings
- `worker/processors/pdf-processor.ts` - Pipeline orchestration

### Troubleshooting
- **OOM errors**: Use smaller model (Qwen 14B/7B)
- **Slow processing**: Check Ollama server load
- **High synthetic chunks**: Review Docling extraction quality
```

---

## Complete Validation Checklist

### Phase 1: Core Infrastructure
- [ ] Migration 045 applied
- [ ] Python packages installed (docling, pydantic-ai, etc.)
- [ ] Ollama running with Qwen 32B
- [ ] OllamaClient module works

### Phase 2: Docling Integration
- [ ] Python script extracts with HybridChunker
- [ ] TypeScript wrapper parses chunks
- [ ] PDF processor enables chunking in local mode
- [ ] Chunks cached in job metadata

### Phase 3: Local LLM Cleanup
- [ ] Ollama cleanup module created
- [ ] Batching works for large documents
- [ ] OOM fallback to regex-only
- [ ] PDF processor integrates cleanup

### Phase 4: Bulletproof Matching (PDF)
- [ ] Layer 1 (fuzzy) works
- [ ] Layer 2 (embeddings) works
- [ ] Layer 3 (LLM) works
- [ ] Layer 4 (interpolation) never fails
- [ ] 100% chunk recovery achieved
- [ ] <5% synthetic chunks

### Phase 5: EPUB Docling Integration
- [ ] Python EPUB extractor works
- [ ] TypeScript wrapper extracts HTML correctly
- [ ] EPUB processor checks PROCESSING_MODE
- [ ] Section markers populated (pages NULL)
- [ ] Bulletproof matching adapted for sections
- [ ] 100% chunk recovery for EPUBs

### Phase 6: Metadata Enrichment (Both Formats)
- [ ] PydanticAI script works
- [ ] TypeScript wrapper communicates
- [ ] Metadata extracted for PDFs
- [ ] Metadata extracted for EPUBs
- [ ] Structured outputs validated

### Phase 7: Local Embeddings (Both Formats)
- [ ] Transformers.js generates embeddings
- [ ] 768 dimensions with correct pooling
- [ ] Works for both PDFs and EPUBs
- [ ] Fallback to Gemini if fails

### Phase 8: Review Checkpoints
- [ ] Docling extraction review works
- [ ] Resume handler continues from review
- [ ] Obsidian sync functional

### Phase 9: Confidence UI
- [ ] ChunkQualityPanel displays stats
- [ ] Sidebar Quality tab works
- [ ] Inline tooltips show confidence
- [ ] Synthetic chunks highlighted

### Phase 10: Testing & Validation
- [ ] Integration tests pass (PDFs)
- [ ] Integration tests pass (EPUBs)
- [ ] Metadata validation passes
- [ ] E2E tests pass
- [ ] Build succeeds

### Phase 11: Documentation
- [ ] Environment variables documented
- [ ] Setup instructions complete
- [ ] CLAUDE.md updated
- [ ] EPUB-specific docs added
- [ ] Troubleshooting guide available

---

## Final Success Criteria

✅ **Functional**
- Can process 500-page PDF in under 80 minutes
- Achieves 100% chunk recovery rate (0% lost chunks)
- 85%+ chunks match with "exact" confidence
- <5% chunks flagged as "synthetic"
- All processing happens locally (0 API calls)

✅ **Quality**
- User can review at 2 checkpoints
- Confidence UI shows match quality
- Can retry failed stages without losing progress
- Synthetic chunks have correct page numbers

✅ **Technical**
- All tests pass
- No linting errors
- No type errors
- Build succeeds

✅ **Documentation**
- Setup instructions clear
- Environment variables documented
- Troubleshooting guide available
- CLAUDE.md updated

---

## Anti-Patterns to Avoid

From PRP lines 1519-1530:

- ❌ Don't skip Python stdout.flush() - IPC will hang
- ❌ Don't use Ollama streaming for structured outputs - breaks JSON
- ❌ Don't mismatch tokenizer between HybridChunker and embeddings
- ❌ Don't load entire PDFs into memory - use Docling streaming
- ❌ Don't use Q8 quantization on M1 Max - too slow, use Q4_K_M
- ❌ Don't skip confidence tracking - user needs transparency
- ❌ Don't block pipeline on validation failures - mark for review
- ❌ Don't assume 100% exact matches - plan for synthetic chunks
- ❌ Don't test with real AI in CI - mock Ollama and Python subprocesses
- ❌ Don't ignore OOM errors - catch and fallback gracefully

---

## PRP Confidence Score: 8.5/10

**Reasoning from PRP lines 1534-1560**:
- ✅ Complete research (codebase + external libraries)
- ✅ Clear business logic (user decisions documented)
- ✅ Existing patterns to follow
- ✅ External docs provided
- ✅ Validation commands specified
- ✅ Database schema defined
- ✅ Test strategy clear
- ⚠️ Complexity: 5-layer matching is sophisticated (may need debugging)
- ⚠️ Python integration: IPC can be tricky (but pattern exists)

**Risk areas**:
- Bulletproof matching (Layers 2-4) - most complex, may need iteration
- Python-Node IPC edge cases - subprocess failures, timeout handling
- Qwen 32B OOM - graceful degradation critical

**Mitigation**:
- Start with Layers 1-2 only, add 3-4 incrementally
- Comprehensive error handling for subprocess failures
- Mock Python in tests to avoid flakiness

---

**Ready for Implementation** ✓
