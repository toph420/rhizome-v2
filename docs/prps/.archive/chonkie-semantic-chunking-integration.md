# PRP: Chonkie Pipeline Integration for Enhanced Semantic Chunking

**Status**: Draft
**Created**: 2025-01-13
**Updated**: 2025-01-13 (Added Pipeline Architecture & OverlapRefinery)
**Owner**: @topher
**Estimated Effort**: 4-5 weeks (38-50 hours)
**Priority**: Medium-High (Experimental Feature with High Potential)

---

## Overview

Integrate Chonkie's **CHOMP Pipeline Architecture** (CHOnkie's Multi-step Pipeline) to enable composable, semantic-aware chunking that improves connection detection quality in Rhizome's 3-engine system. This uses a pipeline approach: **Docling extraction → Chonkie chunking → Overlap refinement → Metadata transfer**, enabling users to choose between structure-aware (HybridChunker) and meaning-aware processing strategies.

**Core Value Proposition**:
1. **Semantic boundaries** group related concepts → 10-20% more connections discovered
2. **Overlap refinement** adds explicit context between chunks → potentially +5-10% additional improvement
3. **Pipeline composition** combines Docling's structure awareness with Chonkie's semantic intelligence
4. **Preserves all metadata** (pages, headings, bboxes) through offset-based transfer

**Key Architectural Advantages**:
1. **Recovery systems**: `recoverAnnotations` (4-tier fuzzy matching) and `remapConnections` (embedding-based) are **purpose-built** for semantic boundary shifts → 90-95% recovery rate
2. **Composable architecture**: Not choosing "one chunker" but composing a **processing flow** (Docling structure + Chonkie semantics + Overlap context)
3. **Incremental validation**: Can test SemanticChunker alone, then add OverlapRefinery, then evaluate SlumberChunker in phases

**Pipeline Stages**:
- **Docling** (Fetcher/Chef): PDF/EPUB extraction with structural metadata
- **Chonkie** (Chunker): SemanticChunker or SlumberChunker for semantic boundaries
- **OverlapRefinery** (optional): Add 50-100 token overlap for explicit chunk relationships
- **Metadata Transfer**: Map Docling metadata to Chonkie chunks via character offsets

---

## Problem Statement

### Current Limitations

Rhizome currently uses Docling's HybridChunker (768 tokens, structure-aware) which:

1. **Splits on structural boundaries** (page breaks, headings) regardless of semantic coherence
2. **May fragment thought units** - a single argument spanning 2 pages becomes 2 chunks
3. **Misses conceptual arcs** - related paragraphs separated by page boundaries aren't grouped
4. **Optimizes for citations** over connection detection

**Example**:
```
Page 45 (end): "Paranoia emerges as a central theme in postmodern literature..."
[PAGE BREAK - HybridChunker splits here]
Page 46 (start): "...manifesting through surveillance narratives and fragmented identities."
```

HybridChunker creates 2 chunks. SemanticChunker would recognize semantic continuity and keep them together, improving thematic bridge detection.

### User Impact

**For Academic Users**:
- ❌ Missing connections between related concepts split across pages
- ❌ Citation-first chunking doesn't optimize for knowledge synthesis

**For Narrative Readers**:
- ❌ Scene boundaries don't align with page boundaries
- ❌ Emotional arcs fragmented by structural splits

**For Connection Discovery**:
- ❌ 3-engine system operates on suboptimal chunk boundaries
- ❌ Thematic bridges harder to detect when concepts artificially separated

---

## Goals

### Primary Goals

1. **Improve connection quality by 15-20%** through semantically coherent chunks
2. **Preserve structural metadata** (pages, headings, bboxes) via offset-based transfer
3. **Maintain 100% chunk recovery guarantee** with confidence tracking
4. **Provide user choice** between structure-aware and meaning-aware chunking

### Secondary Goals

1. **Validate improvement via A/B testing** on 10+ diverse documents
2. **Build metadata quality gates** to ensure ≥85% exact/high confidence
3. **Create migration path** for existing documents to switch chunkers
4. **Document trade-offs** clearly for user education

---

## Non-Goals

1. **Not replacing HybridChunker** - this is a complementary option, not a replacement
2. **Not supporting dual-chunker per document** - user picks one, can reprocess to switch
3. **Not porting to TypeScript immediately** - start with Python subprocess, evaluate native port later
4. **Not forcing migration** - existing documents stay on hybrid unless user opts in
5. **Not guaranteeing identical chunk boundaries** - semantic boundaries prioritize meaning over structure

---

## Technical Design

### Architecture Overview: CHOMP Pipeline Integration

```
┌─────────────────────────────────────────────────────────────────┐
│             CHONKIE PIPELINE INTEGRATION ARCHITECTURE           │
│                    (CHOMP: CHOnkie Multi-step Pipeline)         │
└─────────────────────────────────────────────────────────────────┘

                        Document Upload
                              ↓
                   ┌──────────────────────────┐
                   │ User Selects Pipeline    │
                   │ (Chunker + Refinements)  │
                   └──────────────────────────┘
                              ↓
                ┌─────────────┴─────────────────┐
                ↓                               ↓
    ┌───────────────────────┐    ┌───────────────────────────────┐
    │ HYBRID (Structure)    │    │ SEMANTIC PIPELINE (Meaning)   │
    │ [DEFAULT - Existing]  │    │ [EXPERIMENTAL - NEW]          │
    └───────────────────────┘    └───────────────────────────────┘
                ↓                               ↓

╔════════════════════════╗   ╔═══════════════════════════════════════╗
║  HYBRID PATH           ║   ║  CHONKIE PIPELINE PATH (3 Variants)   ║
║  (Existing)            ║   ╚═══════════════════════════════════════╝
╚════════════════════════╝

                               ┌─────────────────────────────────────┐
                               │ Variant A: Semantic Only (Phase 1)  │
                               ├─────────────────────────────────────┤
                               │ Variant B: Semantic + Overlap (P3)  │
                               ├─────────────────────────────────────┤
                               │ Variant C: Slumber + Overlap (P5)   │
                               └─────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════╗
║                    SHARED STAGES (All Variants)                   ║
╚═══════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────┐
│ Stage 1: FETCHER - Docling Extraction (10-50%)                   │
├──────────────────────────────────────────────────────────────────┤
│ Python Subprocess: docling_extract.py                            │
│                                                                   │
│ • Extract markdown + structural metadata                         │
│ • Capture: page numbers, heading paths, bboxes, sections        │
│ • Cache original DoclingChunks (for metadata transfer)          │
│                                                                   │
│ Output: markdown (150KB), doclingChunks (with metadata), structure│
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Stage 2: CHEF - Markdown Cleanup (50-55%)                        │
├──────────────────────────────────────────────────────────────────┤
│ cleanPageArtifacts() or cleanMarkdownLocal() / cleanPdfMarkdown()│
│                                                                   │
│ • Remove page numbers, headers, footers                          │
│ • Fix OCR artifacts, normalize whitespace                        │
│ • Preserve semantic content                                      │
│                                                                   │
│ Output: cleaned markdown (140KB)                                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                  ┌───────────────────┐
                  │  PIPELINE BRANCH  │
                  └───────────────────┘
                              ↓
        ┌───────────────┬─────────────┴─────────────┬──────────────┐
        ↓               ↓                           ↓              ↓
    HYBRID        SEMANTIC ONLY          SEMANTIC+OVERLAP   SLUMBER+OVERLAP

╔════════════════╗  ╔═══════════════╗  ╔═══════════════╗  ╔═══════════════╗
║ Bulletproof    ║  ║ VARIANT A     ║  ║ VARIANT B     ║  ║ VARIANT C     ║
║ Matcher        ║  ║ (Phase 1-2)   ║  ║ (Phase 3)     ║  ║ (Phase 5)     ║
╚════════════════╝  ╚═══════════════╝  ╚═══════════════╝  ╚═══════════════╝

                    ┌─────────────────────────────────────────────┐
                    │ Stage 3A: CHUNKER - SemanticChunker         │
                    ├─────────────────────────────────────────────┤
                    │ Chonkie Pipeline:                            │
                    │   .fetch_from_text(cleaned_markdown)         │
                    │   .chunk_with(SemanticChunker({              │
                    │     chunk_size: 768,                         │
                    │     threshold: 'auto',                       │
                    │     embedding_model: 'Xenova/all-mpnet'      │
                    │   }))                                        │
                    │                                              │
                    │ Output: SemanticChunk[] (~350-400 chunks)    │
                    └─────────────────────────────────────────────┘
                                      ↓
                    ┌─────────────────────────────────────────────┐
                    │ Stage 3B: REFINERY - OverlapRefinery (OPT)  │
                    ├─────────────────────────────────────────────┤
                    │ Chonkie Pipeline (Variants B & C only):      │
                    │   .refine_with(OverlapRefinery({             │
                    │     overlap_tokens: 50,                      │
                    │     mode: 'trailing'  // Add prev chunk end  │
                    │   }))                                        │
                    │                                              │
                    │ Output: Overlapping chunks with context      │
                    │                                              │
                    │ Example:                                     │
                    │ Chunk 42: "...theme in postmodern lit."     │
                    │ Chunk 43: "...in postmodern lit. Surveillance│
                    │            systems mirror..."                 │
                    └─────────────────────────────────────────────┘
                                      ↓
                    ┌─────────────────────────────────────────────┐
                    │ Stage 4: PORTER - Metadata Transfer         │
                    ├─────────────────────────────────────────────┤
                    │ transferMetadata():                          │
                    │                                              │
                    │ • Build offset map from DoclingChunks        │
                    │ • Query map for each SemanticChunk range    │
                    │ • Transfer: pages, headings, bboxes         │
                    │ • Calculate confidence scores               │
                    │                                              │
                    │ Output: EnrichedChunk[] with metadata        │
                    └─────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────┐
                    │ Stage 3C: CHUNKER - SlumberChunker (P5)     │
                    ├─────────────────────────────────────────────┤
                    │ Chonkie Pipeline (Variant C only):           │
                    │   .fetch_from_text(cleaned_markdown)         │
                    │   .chunk_with(SlumberChunker({               │
                    │     chunk_size: 768,                         │
                    │     llm: 'ollama',                           │
                    │     model: 'qwen2.5:32b'                     │
                    │   }))                                        │
                    │   .refine_with(OverlapRefinery({...}))      │
                    │                                              │
                    │ Uses LLM reasoning for chunk boundaries      │
                    │ Output: LLM-optimized chunks with overlap    │
                    └─────────────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════╗
║              CONVERGENCE: Shared Enrichment Pipeline              ║
╚═══════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────┐
│ Stage 5: PydanticAI Metadata Extraction (75-90%)                 │
│ • Extract: themes, concepts, emotions, importance, domain        │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Stage 6: Embeddings Generation (90-95%)                          │
│ • Generate 768d vectors (Transformers.js or Gemini)             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Stage 7: 3-Engine Connection Detection (95-100%)                 │
│ • Semantic Similarity, Contradiction Detection, Thematic Bridge  │
│ • HYPOTHESIS: Overlap chunks improve thematic bridge by 5-10%   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
╔═══════════════════════════════════════════════════════════════════╗
║              FINAL OUTPUT: ProcessedChunk[]                       ║
║  All variants produce compatible output for reader UI            ║
╚═══════════════════════════════════════════════════════════════════╝
```

**Key Pipeline Benefits**:
1. **Docling provides structure** (pages, headings, bboxes) → Citations work
2. **Chonkie provides semantics** (meaningful boundaries) → Better connections
3. **Overlap provides context** (explicit relationships) → Thematic bridges
4. **Incremental testing** (can validate each stage independently)

### Component Design

#### 1. Chonkie Pipeline Integration Layer

**File**: `worker/lib/local/chonkie-pipeline.ts`

```typescript
export interface ChonkiePipelineConfig {
  chunker: 'semantic' | 'slumber'
  chunk_size: number             // 768 tokens
  threshold: number | string     // 0.5 or 'auto' (semantic only)
  embedding_model: string        // 'Xenova/all-mpnet-base-v2'

  // Overlap refinery config (optional)
  overlap?: {
    enabled: boolean
    tokens: number               // 50-100 tokens
    mode: 'trailing' | 'leading' | 'both'
  }

  // LLM config (slumber only)
  llm?: {
    provider: 'ollama' | 'gemini'
    model: string                // 'qwen2.5:32b-instruct-q4_K_M'
  }
}

export interface ChonkieChunk {
  text: string
  start_index: number            // Character position in markdown
  end_index: number              // Character position in markdown
  token_count: number
  sentences?: Sentence[]
  overlap_context?: {            // NEW: Overlap metadata
    has_trailing: boolean        // Has overlap from previous chunk
    has_leading: boolean         // Has overlap to next chunk
    trailing_tokens?: number
    leading_tokens?: number
  }
}

export async function runChonkiePipeline(
  markdown: string,
  config: ChonkiePipelineConfig
): Promise<ChonkieChunk[]>
```

**Python Script**: `worker/scripts/chonkie_pipeline.py`
- Spawned via subprocess (like Docling)
- Uses Chonkie's Pipeline API
- Supports SemanticChunker, SlumberChunker, OverlapRefinery
- JSON I/O via stdin/stdout
- Error handling with stderr logging
- Timeout: 10 minutes (longer for SlumberChunker)

#### 2. Metadata Transfer Engine

**File**: `worker/lib/local/metadata-transfer.ts`

```typescript
export interface OffsetMetadata {
  page: number
  heading_path: string[]
  heading_level: number | null
  bbox?: BoundingBox[]
  section_marker?: string
}

export interface EnrichedChunk extends SemanticChunk {
  page_numbers: number[]         // Transferred from Docling
  heading_path: string[]
  heading_level: number | null
  section_marker?: string
  chunker_type: 'semantic'
  confidence: 'exact' | 'high' | 'medium' | 'synthetic'
  metadata_sources: number       // # of Docling chunks contributing metadata
}

export async function transferMetadata(
  semanticChunks: SemanticChunk[],
  doclingChunks: DoclingChunk[],
  cleanedMarkdown: string
): Promise<EnrichedChunk[]>
```

**Algorithm**:
1. Build offset map: `Map<charPosition, OffsetMetadata>` from Docling chunks
2. For each semantic chunk, query offset map for range `[start_index, end_index]`
3. Collect all unique pages, majority-vote heading path
4. Calculate confidence based on coverage ratio
5. Validate quality: abort if >15% synthetic chunks

#### 3. Database Schema Changes

**Migration 048**: `supabase/migrations/048_add_chunker_type.sql`

```sql
-- Add chunker_type to chunks table
ALTER TABLE chunks
ADD COLUMN chunker_type TEXT NOT NULL DEFAULT 'hybrid'
CHECK (chunker_type IN ('hybrid', 'semantic'));

-- Add metadata quality tracking
ALTER TABLE chunks
ADD COLUMN metadata_confidence TEXT
CHECK (metadata_confidence IN ('exact', 'high', 'medium', 'synthetic'));

ALTER TABLE chunks
ADD COLUMN metadata_sources INTEGER DEFAULT 1;

-- Indexes for efficient querying
CREATE INDEX idx_chunks_chunker_type ON chunks(chunker_type);
CREATE INDEX idx_chunks_document_chunker ON chunks(document_id, chunker_type);

-- User preference for default chunker
ALTER TABLE user_preferences
ADD COLUMN default_chunker_type TEXT DEFAULT 'hybrid'
CHECK (default_chunker_type IN ('hybrid', 'semantic'));

-- Track which chunkers ran per document
CREATE TABLE document_chunkers (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunker_type TEXT NOT NULL CHECK (chunker_type IN ('hybrid', 'semantic')),
  chunk_count INTEGER NOT NULL,
  metadata_quality JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (document_id, chunker_type)
);
```

#### 4. Processor Modifications

**File**: `worker/processors/pdf-processor.ts` (and `epub-processor.ts`)

Add semantic chunking path:

```typescript
// After cleanup stage
if (config.chunker === 'semantic') {
  // NEW: Semantic path
  const semanticChunks = await runChonkieSemanticChunker(cleanedMarkdown, {
    embedding_model: 'Xenova/all-mpnet-base-v2',
    threshold: 'auto',
    chunk_size: 768,
    min_sentences: 1
  })

  const enriched = await transferMetadata(
    semanticChunks,
    cachedDoclingChunks,
    cleanedMarkdown
  )

  // Quality gate
  const quality = calculateMetadataQuality(enriched)
  if (quality.syntheticRate > 0.15) {
    throw new ProcessingError(
      'Metadata quality too low for semantic chunking',
      { quality }
    )
  }

  processedChunks = enriched

} else {
  // EXISTING: Hybrid path
  processedChunks = await runBulletproofMatcher(
    cachedDoclingChunks,
    cleanedMarkdown
  )
}

// Continue with metadata enrichment, embeddings, connections...
```

#### 5. UI Changes

**File**: `src/components/documents/ChunkerSelector.tsx` (new component)

```typescript
<RadioGroup value={chunker} onValueChange={setChunker}>
  <RadioGroupItem value="hybrid">
    <Label>
      <strong>Structure-Aware (Hybrid)</strong>
      <Badge>Default</Badge>
    </Label>
    <Text className="text-sm text-muted-foreground">
      Preserves document structure (headings, pages, tables).
      Best for: Technical docs, research papers, books with citations.
      Annotations: Very stable across edits.
    </Text>
  </RadioGroupItem>

  <RadioGroupItem value="semantic">
    <Label>
      <strong>Meaning-Aware (Semantic)</strong>
      <Badge variant="outline">Experimental</Badge>
    </Label>
    <Text className="text-sm text-muted-foreground">
      Groups content by meaning, finds 15-20% more connections.
      Best for: Narrative texts, essays, philosophical works.
      Annotations: Robust recovery system maintains ~90-95% accuracy.
      ✨ Benefit: Better conceptual coherence for connection discovery.
    </Text>
  </RadioGroupItem>
</RadioGroup>
```

**File**: `src/components/documents/DocumentPreview.tsx`

Add chunker selector to upload flow (after source type selection).

---

## Implementation Plan

### Phase 1: Prototype & Validation (Week 1-2, 12-16 hours)

**Deliverables**:
- [ ] Chonkie Python integration working
- [ ] Metadata transfer algorithm validated
- [ ] Quality metrics calculated
- [ ] Tested on 3 sample documents

**Tasks**:

1. **Set up Chonkie** (2 hours)
   - Install: `pip install chonkie[semantic]`
   - Create `worker/scripts/chonkie_semantic.py`
   - Build TypeScript subprocess handler: `worker/lib/local/chonkie-semantic.ts`
   - Unit tests for subprocess communication

2. **Implement Metadata Transfer** (4 hours)
   - Create `worker/lib/local/metadata-transfer.ts`
   - Build offset map from Docling chunks
   - Implement range-based metadata extraction
   - Add confidence calculation
   - Unit tests for edge cases (chunk spans 3 pages, etc.)

3. **Integrate into Processor** (3 hours)
   - Modify `worker/processors/pdf-processor.ts`
   - Add semantic chunking branch
   - Wire up quality gates
   - Integration tests

4. **Validate on Sample Documents** (4 hours)
   - Test small (50 pages), medium (200 pages), large (500 pages)
   - Measure metadata quality metrics
   - Compare chunk boundaries visually
   - **NEW: Test annotation recovery** (simulate edits, verify fuzzy matching)
   - **NEW: Test connection remapping** (verify embedding-based recovery)
   - Document findings

**Success Criteria**:
- ✅ Chonkie produces valid chunks with offsets
- ✅ Metadata quality ≥85% (exact + high confidence)
- ✅ Synthetic chunks <15%
- ✅ Processing time <30 minutes for 500 pages
- ✅ **Annotation recovery ≥90%** (matches or exceeds hybrid)
- ✅ **Connection remapping ≥95%** (embedding-based matching)

### Phase 2: A/B Testing Infrastructure (Week 2-3, 10-12 hours)

**Deliverables**:
- [ ] Database migration 048 applied
- [ ] Dual-chunker processor support
- [ ] A/B testing dashboard
- [ ] 10 test documents processed

**Tasks**:

1. **Database Schema** (2 hours)
   - Create `048_add_chunker_type.sql`
   - Add `chunker_type` column to chunks
   - Create `document_chunkers` tracking table
   - Add user preference column
   - Test migration on dev database

2. **Dual-Chunker Support** (4 hours)
   - Modify processor to run both chunkers (optional)
   - Store chunks with `chunker_type` flag
   - Run metadata extraction twice
   - Run embeddings twice
   - Run connection detection twice
   - Update background job progress tracking

3. **A/B Testing Dashboard** (4 hours)
   - Create `src/components/admin/ABTestingTab.tsx`
   - Query chunks by chunker_type
   - Display comparison metrics:
     - Chunk count, avg size, std dev
     - Metadata quality (exact/high/medium/synthetic)
     - Connection count by engine type
     - Processing time and cost
   - Manual review UI for connection relevance

4. **Process Test Documents** (2 hours)
   - Select 10 diverse documents:
     - 3 technical (papers, textbooks)
     - 3 narrative (novels, essays)
     - 2 philosophical (dense concept exploration)
     - 2 mixed (history with narrative + analysis)
   - Run dual-chunker processing
   - Collect automated metrics

**Success Criteria**:
- ✅ Database stores both chunker variants
- ✅ Dashboard displays comparison metrics
- ✅ 10 documents processed successfully
- ✅ No cost explosion (under $10 for A/B testing)

### Phase 3: Evaluation & Decision (Week 3-4, 8-10 hours)

**Deliverables**:
- [ ] Quantitative metrics analysis
- [ ] Qualitative review completed
- [ ] Ship/no-ship decision documented
- [ ] Implementation plan finalized

**Tasks**:

1. **Quantitative Analysis** (3 hours)
   - Compare connection counts by engine
   - Analyze metadata quality distribution
   - Measure processing time overhead
   - Calculate cost impact
   - Generate statistical summary

2. **Qualitative Review** (4 hours)
   - Manually review 50 connections (25 hybrid, 25 semantic)
   - Rate connection relevance (1-5 scale)
   - Test citation accuracy (can users find page numbers?)
   - Evaluate annotation precision (do chunks feel "right"?)
   - Collect user feedback (if applicable)

3. **Decision Framework** (1 hour)
   - Apply decision criteria (≥15% improvement, ≥85% quality)
   - Document trade-offs
   - Recommendation: ship, iterate, or abandon
   - If shipping: finalize production rollout plan

4. **Documentation** (2 hours)
   - Write findings report
   - Update `docs/PROCESSING_PIPELINE.md`
   - Create user guide for chunker selection
   - Document known limitations

**Success Criteria**:
- ✅ Clear data-driven decision
- ✅ Trade-offs documented
- ✅ User guidance prepared
- ✅ Production plan ready (if shipping)

### Phase 4: Production Rollout (Week 4-5, 8-12 hours)

**Only if Phase 3 decision is SHIP**

**Deliverables**:
- [ ] User-selectable chunker UI
- [ ] Migration tool for existing documents
- [ ] User documentation
- [ ] Monitoring and metrics

**Tasks**:

1. **UI Implementation** (4 hours)
   - Create `ChunkerSelector` component
   - Add to document upload flow
   - Add to document settings (reprocessing)
   - Implement user preference persistence
   - Add help tooltips and guidance

2. **Migration Tool** (3 hours)
   - Create `src/app/actions/migrate-chunker.ts`
   - Backup current chunks to Storage
   - Delete existing chunks/connections
   - Reprocess with new chunker
   - Migrate annotations (character-offset anchoring)
   - Generate migration report

3. **Documentation** (2 hours)
   - User guide: "When to use hybrid vs semantic"
   - Admin guide: "How to switch chunkers"
   - Developer guide: "Chunker architecture"
   - Update `docs/ARCHITECTURE.md`

4. **Monitoring** (2 hours)
   - Add Sentry error tracking for Chonkie subprocess
   - Log chunker usage stats (hybrid vs semantic adoption)
   - Track metadata quality metrics per document
   - Alert on quality degradation (>15% synthetic)

**Success Criteria**:
- ✅ Users can select chunker during upload
- ✅ Migration tool works without data loss
- ✅ Documentation clear and helpful
- ✅ No production errors in first 100 documents

### Phase 5: Optimization (Ongoing)

**Deliverables**:
- [ ] Threshold tuning experiments
- [ ] LateChunker evaluation
- [ ] Native TypeScript port (optional)

**Tasks**:

1. **Parameter Tuning** (4 hours)
   - Experiment with threshold: 0.3, 0.5, 0.7, 'auto'
   - Test chunk_size variations: 512, 768, 1024
   - Measure impact on connection quality
   - Update default configuration

2. **LateChunker Evaluation** (6 hours)
   - Test Chonkie's LateChunker (embeds full doc first)
   - Compare to SemanticChunker
   - Measure context preservation improvement
   - Decide if worth the added complexity

3. **Native TypeScript Port** (20+ hours, optional)
   - Evaluate `chonkiejs` (TypeScript port)
   - Or implement semantic chunking natively
   - Remove Python subprocess dependency
   - Performance comparison

**Success Criteria**:
- ✅ Optimal parameters identified
- ✅ LateChunker vs SemanticChunker decision made
- ✅ TypeScript port evaluated (decision documented)

---

## Testing Strategy

### Unit Tests

**File**: `worker/lib/local/__tests__/chonkie-semantic.test.ts`

```typescript
describe('ChonkieSemanticChunker', () => {
  it('produces valid semantic chunks with offsets', async () => {
    const markdown = 'Sample text...'
    const chunks = await runChonkieSemanticChunker(markdown)

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0].start_index).toBe(0)
    expect(chunks[chunks.length - 1].end_index).toBe(markdown.length)
  })

  it('handles subprocess errors gracefully', async () => {
    await expect(
      runChonkieSemanticChunker('', { chunk_size: -1 })
    ).rejects.toThrow('Chonkie failed')
  })
})
```

**File**: `worker/lib/local/__tests__/metadata-transfer.test.ts`

```typescript
describe('MetadataTransfer', () => {
  it('transfers page numbers correctly', async () => {
    const semanticChunks = [/* mock */]
    const doclingChunks = [/* mock with pages 45-47 */]

    const enriched = await transferMetadata(semanticChunks, doclingChunks, markdown)

    expect(enriched[0].page_numbers).toContain(45)
    expect(enriched[0].confidence).toBe('exact')
  })

  it('calculates synthetic confidence for gaps', async () => {
    // Mock scenario: semantic chunk in gap between Docling chunks
    const enriched = await transferMetadata(...)

    expect(enriched[5].confidence).toBe('synthetic')
    expect(enriched[5].metadata_sources).toBe(0)
  })
})
```

### Integration Tests

**File**: `worker/processors/__tests__/semantic-chunking.integration.test.ts`

```typescript
describe('Semantic Chunking Integration', () => {
  it('processes document with semantic chunker end-to-end', async () => {
    const result = await processPDF(documentId, {
      chunker: 'semantic',
      cleanMarkdown: true
    })

    expect(result.success).toBe(true)
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.chunks[0].chunker_type).toBe('semantic')
    expect(result.chunks[0].metadata_confidence).toBeOneOf(['exact', 'high', 'medium'])
  })

  it('aborts on low metadata quality', async () => {
    // Mock scenario: >15% synthetic chunks
    await expect(
      processPDF(documentId, { chunker: 'semantic' })
    ).rejects.toThrow('Metadata quality too low')
  })
})
```

### A/B Testing Validation

**File**: `scripts/validate-ab-testing.ts`

```typescript
// Compare hybrid vs semantic on same document
async function validateABTesting(documentId: string) {
  const hybridChunks = await getChunks(documentId, 'hybrid')
  const semanticChunks = await getChunks(documentId, 'semantic')

  console.log('Chunk counts:', {
    hybrid: hybridChunks.length,
    semantic: semanticChunks.length,
    ratio: semanticChunks.length / hybridChunks.length
  })

  const hybridConnections = await getConnections(documentId, 'hybrid')
  const semanticConnections = await getConnections(documentId, 'semantic')

  console.log('Connection counts:', {
    hybrid: hybridConnections.length,
    semantic: semanticConnections.length,
    improvement: ((semanticConnections.length - hybridConnections.length) / hybridConnections.length * 100).toFixed(1) + '%'
  })

  // Metadata quality
  const semanticQuality = calculateQuality(semanticChunks)
  console.log('Semantic metadata quality:', semanticQuality)

  if (semanticQuality.syntheticRate > 0.15) {
    console.warn('⚠️ High synthetic rate:', (semanticQuality.syntheticRate * 100).toFixed(1) + '%')
  }
}
```

### Recovery System Validation (NEW)

**File**: `scripts/validate-recovery-systems.ts`

```typescript
// Test annotation recovery with semantic chunking
async function validateAnnotationRecovery(documentId: string) {
  // Process with both chunkers
  const hybridChunks = await processWithHybrid(documentId)
  const semanticChunks = await processWithSemantic(documentId)

  // Create test annotations on original
  const testAnnotations = [
    { text: "Sample annotation 1", startOffset: 1500, endOffset: 1600 },
    { text: "Sample annotation 2", startOffset: 5800, endOffset: 5950 },
    { text: "Sample annotation 3", startOffset: 12000, endOffset: 12200 }
  ]

  // Simulate markdown edits
  const editedMarkdown = applySimulatedEdits(originalMarkdown, [
    { position: 3000, insert: " deeply" },
    { position: 8000, delete: 50 },
    { position: 10000, insert: "\n\nNew paragraph.\n\n" }
  ])

  // Reprocess with both chunkers
  const newHybridChunks = await processWithHybrid(documentId, editedMarkdown)
  const newSemanticChunks = await processWithSemantic(documentId, editedMarkdown)

  // Test recovery with EXISTING recoverAnnotations handler
  const hybridRecovery = await recoverAnnotations(
    documentId,
    editedMarkdown,
    newHybridChunks
  )

  const semanticRecovery = await recoverAnnotations(
    documentId,
    editedMarkdown,
    newSemanticChunks
  )

  // Compare recovery rates
  console.log('Annotation Recovery Comparison:', {
    hybrid: {
      success: hybridRecovery.success.length,
      needsReview: hybridRecovery.needsReview.length,
      lost: hybridRecovery.lost.length,
      rate: (hybridRecovery.success.length / testAnnotations.length * 100).toFixed(1) + '%'
    },
    semantic: {
      success: semanticRecovery.success.length,
      needsReview: semanticRecovery.needsReview.length,
      lost: semanticRecovery.lost.length,
      rate: (semanticRecovery.success.length / testAnnotations.length * 100).toFixed(1) + '%'
    }
  })

  // Validate: semantic should match or exceed hybrid
  const semanticRate = semanticRecovery.success.length / testAnnotations.length
  const hybridRate = hybridRecovery.success.length / testAnnotations.length

  expect(semanticRate).toBeGreaterThanOrEqual(hybridRate * 0.95) // Within 5%
}

// Test connection remapping with semantic chunking
async function validateConnectionRemapping(documentId: string) {
  // Create verified connections on original
  const originalConnections = await createTestConnections(documentId)

  // Reprocess with semantic chunker
  const newSemanticChunks = await processWithSemantic(documentId, editedMarkdown)

  // Test remapping with EXISTING remapConnections handler
  const remapResults = await remapConnections(
    documentId,
    newSemanticChunks
  )

  console.log('Connection Remapping Results:', {
    success: remapResults.success.length,
    needsReview: remapResults.needsReview.length,
    lost: remapResults.lost.length,
    autoRemapRate: (remapResults.success.length / originalConnections.length * 100).toFixed(1) + '%'
  })

  // Validate: ≥95% auto-remap (semantic embeddings should be MORE stable)
  const autoRemapRate = remapResults.success.length / originalConnections.length
  expect(autoRemapRate).toBeGreaterThanOrEqual(0.95)
}
```

### Manual Review Checklist

For each test document:

- [ ] **Connection Relevance**: Review 5 random connections, rate 1-5
- [ ] **Citation Accuracy**: Verify 3 chunks have correct page numbers
- [ ] **Chunk Coherence**: Read 5 random chunks, assess semantic coherence
- [ ] **Annotation Recovery Test**: Create annotations → edit markdown → verify ≥90% recovery
- [ ] **Connection Remapping Test**: Create connections → reprocess → verify ≥95% remapping
- [ ] **Performance**: Processing time under 30 minutes?
- [ ] **Cost**: Total cost under $1 for dual-chunker?

---

## Risks & Mitigations

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Metadata Quality <85%** | Medium | High | Quality gate aborts processing, fall back to hybrid |
| **Synthetic Chunks >15%** | Medium | High | Abort if threshold exceeded, document review checkpoints |
| **Python Subprocess Hangs** | Low | Medium | 5-minute timeout, comprehensive error handling, retry logic |
| **Cost Explosion** (chunk count increases 50%) | Medium | Medium | Set `max_chunks: 500` hard limit, abort if exceeded |
| **IPC Reliability Issues** | Low | Medium | Robust error handling, stderr logging, graceful degradation |

### User Experience Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **User Confusion** (hybrid vs semantic) | High | Low | Clear UI guidance, sensible defaults (hybrid), tooltips |
| **Annotation Recovery Edge Cases** (<5% loss) | Low | Low | 4-tier fuzzy matching (exact/context/chunk-bounded/trigram), ≥0.85 auto-recover threshold |
| **Performance Regression** (>30 min) | Low | Medium | Benchmark monitoring, optimize threshold tuning |
| **Backward Compatibility** (existing docs break) | Low | High | No forced migration, opt-in reprocessing only |

**Note on Annotation Recovery**: Rhizome's existing `recoverAnnotations` handler uses character-offset based fuzzy matching (not chunk-ID dependent), so semantic boundary shifts are handled identically to page-break shifts. Expected recovery rate: **90-95%** (matches hybrid chunker performance).

### Data Quality Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Connection Quality Regression** | Low | High | A/B testing validates improvement before shipping |
| **Citation Accuracy Degradation** | Medium | Medium | Offset-based metadata transfer, quality metrics |
| **Chunk Boundary Issues** (mid-sentence splits) | Low | Low | Chonkie respects sentence boundaries by design |

---

## Success Metrics

### Quantitative Metrics (Automated)

**Primary**:
- Connection count improvement: **≥15% target**
- Metadata quality: **≥90% exact+high confidence**
- Synthetic chunks: **<10%**
- Processing time: **<30 minutes for 500 pages**

**Secondary**:
- Cost increase: **<20% for A/B testing, 0% for production**
- Chunk count ratio: **0.8-1.2x (±20%)**
- Thematic bridge improvement: **≥20%** (biggest expected gain)
- Annotation recovery rate: **≥90%** (leverages existing 4-tier fuzzy matching)
- Connection remapping rate: **≥95%** (embedding-based matching benefits from semantic coherence)

### Qualitative Metrics (Manual Review)

**Connection Relevance** (1-5 scale):
- Hybrid baseline: **3.5 average**
- Semantic target: **4.0+ average** (14% improvement)

**Citation Accuracy**:
- Can users cite page numbers correctly? **Yes/No**
- Page number accuracy: **≥90%**

**Annotation UX**:
- Do semantic chunks feel "correctly scoped"? **Yes/No**
- User satisfaction with chunker choice: **Positive feedback**

### Decision Criteria

**SHIP if all met**:
1. ✅ Connection improvement ≥15%
2. ✅ Metadata quality ≥90%
3. ✅ Synthetic chunks <10%
4. ✅ Processing time <30 min
5. ✅ User feedback positive

**ITERATE if**:
- 🤔 Improvement 5-15% (marginal but promising)
- 🤔 Metadata quality 85-90% (acceptable, needs tuning)

**ABANDON if**:
- ❌ Improvement <5%
- ❌ Metadata quality <85%
- ❌ Synthetic chunks >15%
- ❌ Reliability issues (subprocess crashes frequently)

---

## Open Questions

1. **Threshold tuning**: Is 'auto' optimal, or should we experiment with fixed values (0.3-0.7)?
2. **LateChunker**: Should we test both SemanticChunker and LateChunker in A/B testing?
3. **Cross-document connections**: Does semantic chunking improve cross-book thematic bridges more than within-document?
4. **Hybrid approach**: Can we use hybrid for structure, semantic for connections (run both engines on hybrid chunks)?
5. **Embedding model**: Should we use Model2Vec (500x faster) or stick with Xenova/all-mpnet-base-v2 (current)?

---

## Alternatives Considered

### Alternative 1: Replace HybridChunker Entirely

**Rejected**: Too risky, loses structural metadata precision.

**Trade-offs**:
- ✅ Simpler architecture (one chunker)
- ❌ Forces all users to semantic chunking
- ❌ Breaks backward compatibility
- ❌ Loses bbox metadata for PDF highlighting

### Alternative 2: Dual-Chunker Per Document

**Rejected**: Cost explosion (2x metadata, embeddings, connections).

**Trade-offs**:
- ✅ Direct A/B comparison per document
- ✅ User can switch views
- ❌ 2x processing cost ($0.52 → $1.04 per book)
- ❌ 2x storage (chunks table doubles)
- ❌ Complex UI (which chunker to display?)

### Alternative 3: Native TypeScript Port (Immediate)

**Deferred**: Start with Python subprocess, evaluate port later.

**Trade-offs**:
- ✅ No IPC complexity
- ✅ Native async/await
- ❌ `chonkiejs` not at feature parity
- ❌ 20+ hours implementation effort
- ❌ May need to port algorithm manually

### Alternative 4: Hybrid-Semantic Fusion

**Deferred**: Explore in Phase 5 optimization.

**Concept**: Use HybridChunker for chunks, SemanticChunker for connection detection.

**Trade-offs**:
- ✅ Best of both worlds (citations + connections)
- ❌ Complex architecture
- ❌ Unclear if improvement justifies complexity
- 🤔 Worth experimenting after A/B testing

---

## Dependencies

### External Dependencies

1. **Chonkie Python Library**
   - Version: `^1.3.0` (latest with SDPM, peak detection)
   - Install: `pip install chonkie[semantic]`
   - Extras: `[semantic]` includes embedding models

2. **Python 3.10+** (already required for Docling)
   - No new Python version requirement

### Internal Dependencies

1. **Cached Chunks Architecture** (migration 046)
   - Required for metadata transfer
   - Already implemented

2. **Bulletproof Matcher** (existing)
   - Used to locate Docling chunks in cleaned markdown
   - Reused for offset mapping

3. **Background Job System** (existing)
   - Extended to track chunker_type
   - Progress reporting for both paths

### Infrastructure Dependencies

1. **Supabase Migration 048**
   - `chunker_type` column
   - `document_chunkers` table
   - User preferences

2. **Storage Manifest Updates**
   - Track which chunkers ran per document
   - Store `chunks-semantic.json` alongside `chunks-hybrid.json`

---

## Timeline

**Total Estimated Time**: 32-44 hours (3-4 weeks part-time)

| Phase | Duration | Effort | Deliverables |
|-------|----------|--------|--------------|
| Phase 1: Prototype + Recovery Validation | Week 1-2 | 12-16 hours | Chonkie integration, metadata transfer, annotation/connection recovery tests |
| Phase 2: A/B Testing | Week 2-3 | 10-12 hours | Database migration, dashboard, 10 test documents |
| Phase 3: Evaluation | Week 3-4 | 8-10 hours | Metrics analysis, decision documented |
| Phase 4: Production | Week 4-5 | 8-12 hours | UI, migration tool, documentation, monitoring |
| Phase 5: Optimization | Ongoing | Variable | Parameter tuning, LateChunker, TS port |

**Critical Path**: Phase 1 → Phase 2 → Phase 3 (evaluation) → **Decision Gate** → Phase 4

---

## Rollback Plan

If semantic chunking causes production issues:

1. **Disable for new documents**:
   ```typescript
   // Temporarily hide semantic chunker option
   const ENABLE_SEMANTIC_CHUNKER = false
   ```

2. **Revert existing documents**:
   ```typescript
   // Admin Panel → Bulk Revert
   await bulkRevertChunker(documentIds, { from: 'semantic', to: 'hybrid' })
   ```

3. **Database rollback**:
   ```sql
   -- Revert migration 048 if needed
   ALTER TABLE chunks DROP COLUMN chunker_type;
   DROP TABLE document_chunkers;
   ```

4. **Cost impact**: Reprocessing with hybrid costs $0.52/book (standard cost)

---

## Related Documents

- **Main Pipeline Doc**: `docs/PROCESSING_PIPELINE.md`
- **Bulletproof Matcher**: `docs/processing-pipeline/bulletproof-metadata-extraction.md`
- **Cached Chunks**: Migration 046, `worker/lib/cached-chunks.ts`
- **Chonkie Docs**: https://docs.chonkie.ai/common/welcome
- **Chonkie GitHub**: https://github.com/chonkie-inc/chonkie

### NEW: Comprehensive Research Documentation (2025-10-14)

**IMPORTANT**: Before proceeding with implementation, review these research documents:

1. **Comprehensive Research Report** (5,000+ words)
   - File: `docs/prps/chonkie-research-report.md`
   - Contains: Complete analysis of Chonkie architecture, chunker comparison, configuration deep-dive, performance benchmarks, integration patterns, and code examples

2. **Executive Summary & Recommendations**
   - File: `docs/prps/chonkie-integration-recommendations.md`
   - Contains: TL;DR summary, critical discoveries, decision framework, implementation strategy

3. **Developer Quick Reference**
   - File: `docs/prps/chonkie-quick-reference.md`
   - Contains: Code snippets, configuration guide, troubleshooting, validation tests

**Key Findings from Research**:
- ✅ **Native character offset preservation** eliminates bulletproof matcher (1,500+ lines)
- ✅ **Skip-window merging** finds cross-section connections we currently miss
- ✅ **Dual-mode processing** (SemanticChunker = fast, SlumberChunker = premium quality)
- ✅ **TypeScript port (chonkiejs)** not ready - use Python subprocess
- ⚠️ **OverlapRefinery** needs testing for offset preservation
- ✅ **2.5x faster** processing claimed (benchmark validated)

**Updated Recommendations**:
- PRIMARY: SemanticChunker with threshold=0.75, skip_window=3
- PREMIUM: SlumberChunker with Ollama (qwen2.5:32b)
- SKIP: OverlapRefinery in Phase 1 (test separately in Phase 2)
- KEEP: Transformers.js embeddings (metadata enhancement too valuable)

---

## Appendix A: Chonkie Configuration Reference

```typescript
// Recommended configuration for Rhizome
export const RHIZOME_CHONKIE_CONFIG: ChonkieConfig = {
  // Embedding model (MUST match Rhizome's embeddings)
  embedding_model: 'Xenova/all-mpnet-base-v2',

  // Threshold: 'auto' for adaptive, or 0.5 for consistent
  threshold: 'auto',

  // Chunk size: 768 tokens (match HybridChunker)
  chunk_size: 768,

  // Minimum sentences per chunk
  min_sentences: 1,

  // Sentence delimiters
  delimiters: ['.', '!', '?', '\n']
}

// Quality gates
export const QUALITY_GATES = {
  maxChunkCount: 500,           // Abort if >500 chunks
  minMetadataQuality: 0.85,     // 85% exact+high confidence
  maxSyntheticRate: 0.10        // 10% synthetic chunks
}
```

---

## Appendix B: Decision Tree

```
User uploads document
  ↓
Is document narrative or technical?
  ↓
├─ Technical (research paper, textbook)
│  → Recommend: HYBRID
│  → Reason: Citations critical, structure matters
│
└─ Narrative (novel, essay, philosophy)
   → Recommend: SEMANTIC
   → Reason: Connections > citations, meaning > structure

User preference set?
  ↓
├─ Yes → Use user preference
└─ No → Use default (HYBRID)

Processing completes
  ↓
Metadata quality <85%?
  ↓
├─ Yes → Flag for review, warn user
└─ No → Success

Synthetic chunks >15%?
  ↓
├─ Yes → Abort, fall back to HYBRID
└─ No → Success
```

---

## Appendix C: Recovery Systems & Semantic Chunking Compatibility

### Why Rhizome's Recovery Systems Excel with Semantic Chunking

Most document processors would struggle with semantic chunking because they rely on stable chunk IDs or fixed offsets. **Rhizome's architecture is different.**

### Annotation Recovery: 4-Tier Fuzzy Matching

**File**: `worker/handlers/recover-annotations.ts`

**Strategy**: Character-offset based with progressive fallback
1. **Exact match** (`markdown.indexOf`) - 70% success
2. **Context-guided Levenshtein** (uses surrounding text) - +15% success
3. **Chunk-bounded Levenshtein** (searches within chunk boundaries) - +10% success
4. **Trigram fallback** (last resort) - +3% success

**Confidence Thresholds**:
- ≥0.85: Auto-recover
- 0.75-0.85: Flag for review
- <0.75: Mark as lost

**Why it works with semantic chunking**:
- Searches for annotation **text content**, not chunk IDs
- Uses **character offsets** in markdown, not chunk boundaries
- Fuzzy matching handles text shifts regardless of chunking strategy
- Semantic boundary shifts vs page-break shifts: **handled identically**

**Expected Performance**:
- Hybrid chunker: 85-95% auto-recovery
- Semantic chunker: **90-95% auto-recovery** (same or better)

**Why semantic might be BETTER**:
- Semantic chunks = more coherent units = cleaner annotation scopes
- Fewer mid-thought splits = annotations align better with chunk boundaries
- Levenshtein matching benefits from semantic context stability

### Connection Remapping: Embedding-Based Similarity

**File**: `worker/handlers/remap-connections.ts`

**Strategy**: Cosine similarity between old and new chunk embeddings

```typescript
// Find best match for old chunk in new chunks
const bestMatch = findBestMatch(
  oldChunk.embedding,  // 768d vector
  newChunks            // Search within new chunks only
)

// Similarity thresholds
if (similarity >= 0.95) autoRemap()
else if (similarity >= 0.85) flagForReview()
else markAsLost()
```

**Why it works with semantic chunking**:
- Matches chunks by **semantic content**, not positions
- Semantic chunks = **more coherent embeddings** (full concepts, not fragments)
- Higher cosine similarity = higher auto-remap success

**Expected Performance**:
- Hybrid chunker: 85-90% auto-remap (0.95 threshold)
- Semantic chunker: **≥95% auto-remap** (better embedding coherence)

**Why semantic is BETTER**:
```
Example:
OLD (Hybrid, page-break split):
Chunk 42: "Paranoia emerges in postmodern lit..."
Embedding: [partial concept vector]

NEW (Semantic, after edit):
Chunk 38: "Paranoia emerges in postmodern literature, manifesting through surveillance..."
Embedding: [complete concept vector, similar to old]

Cosine similarity: 0.97 ✅ AUTO-REMAP (vs 0.92 with hybrid)
```

### The Competitive Advantage

**Most document processors**:
- Rely on stable chunk IDs → breaks with semantic chunking
- Use fixed offsets → breaks with boundary shifts
- No recovery systems → data loss on reprocessing

**Rhizome**:
- ✅ Character-offset + fuzzy matching → handles boundary shifts
- ✅ Embedding-based remapping → benefits from semantic coherence
- ✅ 4-tier fallback system → 100% recovery guarantee (interpolation layer)
- ✅ Confidence tracking → transparent about recovery quality

This architecture wasn't designed for semantic chunking, but it **accidentally provides the perfect foundation** for it. The recovery systems treat semantic boundary shifts as just another form of text transformation - which they're already built to handle.

### Validation Strategy

Phase 1 will empirically validate this advantage:

```typescript
// Test on 3 documents:
for (const doc of testDocuments) {
  // 1. Process with both chunkers
  const hybrid = await processWithHybrid(doc)
  const semantic = await processWithSemantic(doc)

  // 2. Create test annotations + connections
  const annotations = createTestAnnotations(hybrid.chunks)
  const connections = createTestConnections(hybrid.chunks)

  // 3. Simulate edits + reprocess
  const editedMarkdown = simulateEdits(doc.markdown)
  const newHybrid = await processWithHybrid(doc, editedMarkdown)
  const newSemantic = await processWithSemantic(doc, editedMarkdown)

  // 4. Test recovery with EXISTING handlers
  const hybridAnnotationRecovery = await recoverAnnotations(doc.id, editedMarkdown, newHybrid.chunks)
  const semanticAnnotationRecovery = await recoverAnnotations(doc.id, editedMarkdown, newSemantic.chunks)

  const hybridConnectionRemapping = await remapConnections(doc.id, newHybrid.chunks)
  const semanticConnectionRemapping = await remapConnections(doc.id, newSemantic.chunks)

  // 5. Compare
  assert(semanticAnnotationRecovery.success.length >= hybridAnnotationRecovery.success.length * 0.95)
  assert(semanticConnectionRemapping.success.length >= hybridConnectionRemapping.success.length)
}
```

If validation confirms ≥90% annotation recovery and ≥95% connection remapping, semantic chunking is a **no-brainer enhancement** with minimal risk.

---

**End of PRP**

**Next Steps**:
1. Review and approve PRP
2. Begin Phase 1 prototype (Week 1)
3. **Run recovery validation tests** (critical for risk assessment)
4. Create tracking task in project management system
5. Schedule A/B testing evaluation meeting (Week 3)

**Questions?** Contact @topher or open discussion in #rhizome-dev
