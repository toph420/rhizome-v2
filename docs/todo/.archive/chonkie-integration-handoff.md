Rhizome V2 - Chonkie Integration Handoff Document

  Date: 2025-10-15Session Summary: Inline metadata implementation debugging
   → Vision for simplified Chonkie pipelineStatus: Planning phase - Ready
  for architecture discussion

  ---
  Executive Summary

  We successfully implemented and debugged inline metadata parsing for the
  PDF processor, which proved that:
  1. ✅ Metadata can survive AI cleanup when parsed BEFORE cleanup
  2. ✅ TypeScript-to-Python IPC works reliably with proper spread operator
   ordering
  3. ✅ The concept is sound, but the implementation revealed a better path
   forward

  Key Insight: Instead of inline metadata OR bulletproof matching, we
  should use Chonkie with overlap-based metadata transfer. This gives us
  the best of both worlds: flexible chunking strategies + preserved Docling
   metadata.

  ---
  Current System Architecture

  Processing Pipeline (3 Parallel Paths)

  Path 1: Inline Metadata (Lines 381-443 in pdf-processor.ts)
  Extract w/ HTML comments → Parse metadata → Strip comments → Cleanup →
  Use stored metadata
  - ✅ Works: 100% exact matches, skips bulletproof matcher
  - ❌ Problem: No metadata enrichment or embeddings (skipped)
  - ❌ Incomplete: Rushed implementation for POC

  Path 2: Bulletproof Matching (Lines 444-723)
  Extract → Cleanup → 5-layer matching → Metadata enrichment → Embeddings
  - ✅ Complete: Full pipeline with all stages
  - ❌ Complex: 5 layers of matching logic
  - ❌ Imperfect: 5-10% synthetic chunks need validation

  Path 3: Cloud Mode (Lines 725-807)
  AI chunking with metadata → Already enriched → Just add embeddings
  - ✅ Works: Legacy path, maintained for backward compatibility

  Key Files

  Worker Module:
  - worker/processors/pdf-processor.ts - Main processing orchestration (855
   lines, complex branching)
  - worker/lib/local/bulletproof-matcher.ts - 5-layer matching system
  - worker/lib/local/inline-metadata-parser.ts - NEW: HTML comment parsing
  - worker/lib/docling-extractor.ts - Python IPC wrapper
  - worker/scripts/docling_extract.py - Docling HybridChunker wrapper

  Planning Docs:
  - docs/todo/inline-metadata-implementation.md - Completed POC (lines
  1-465)
  - docs/tasks/hybrid-chunking-system.md - Chonkie integration plan (Phase
  0-5, ~2000 lines)

  ---
  What We Discovered Today

  Bug Fixes (2 Critical Issues)

  Bug 1: Spread Operator Order (pdf-processor.ts:125-151)
  // ❌ BEFORE: pipelineConfig was last, overriding inline_metadata
  {
    ...getChunkerOptions(),
    ...(useInlineMetadata ? { inline_metadata: true } : {}),
    ...formatPipelineConfigForPython(pipelineConfig)  // OVERWRITES!
  }

  // ✅ AFTER: inline_metadata spread is last
  {
    ...getChunkerOptions(),
    ...formatPipelineConfigForPython(pipelineConfig),
    ...(useInlineMetadata ? { inline_metadata: true } : {})  // Final say!
  }

  Bug 2: Missing TypeScript→Python Mapping (docling-extractor.ts:169-181)
  // ❌ BEFORE: inline_metadata not passed to Python
  const pythonOptions = {
    enable_chunking: options.enableChunking,
    chunk_size: options.chunkSize,
    // inline_metadata: MISSING!
  }

  // ✅ AFTER: Added to options interface + pythonOptions
  inline_metadata: options.inline_metadata || false

  What Works Now

  With both fixes applied, inline metadata flow works perfectly:
  [PDFProcessor] 🎯 Inline metadata detected - parsing BEFORE cleanup!
  [PDFProcessor] ✅ Validation passed: 12 chunks detected
  [PDFProcessor] ✅ Parsed 12 chunks from inline metadata
  [PDFProcessor] ✅ Stripped HTML comments - markdown ready for cleanup
  [PDFProcessor] 💾 Stored parsed metadata for use after cleanup
  [PDFProcessor] 💰 SAVED TIME: Skipped 5-layer bulletproof matching!
  [PDFProcessor] ✅ PERFECT SYNC: 100% exact matches with inline metadata

  But: Metadata enrichment and embeddings were skipped (architectural
  issue, not a bug)

  ---
  The Simplified Vision

  Why Simplify?

  Current complexity:
  - 3 parallel execution paths (inline/bulletproof/cloud)
  - 5-layer bulletproof matching (fuzzy, embeddings, LLM, interpolation,
  metadata)
  - Inline metadata as alternative approach
  - 3-way branching logic throughout

  Proposed simplicity:
  - One path: Docling → Cleanup → Chonkie → Overlap transfer → Enrich →
  Embed
  - No bulletproof matching: Replaced by overlap detection
  - No inline metadata: Replaced by cached Docling chunks
  - User choice: 7 chunker strategies (HybridChunker default + 6 Chonkie
  options)

  New Pipeline Architecture

  ┌─────────────────────────────────────────────┐
  │ Stage 1: Download PDF (10-15%)             │
  └──────────────┬──────────────────────────────┘
                 │
  ┌──────────────▼──────────────────────────────┐
  │ Stage 2: Docling Extraction (15-50%)       │
  │  • HybridChunker (768 tokens, structural)  │
  │  • Save to cached_chunks table             │
  │  • Metadata: pages, headings, bboxes       │
  └──────────────┬──────────────────────────────┘
                 │
  ┌──────────────▼──────────────────────────────┐
  │ Stage 3: Local Regex Cleanup (52-56%)     │
  │  • cleanPageArtifacts()                    │
  └──────────────┬──────────────────────────────┘
                 │
  ┌──────────────▼──────────────────────────────┐
  │ Stage 4: AI Cleanup (56-70%)               │
  │  • Gemini (USE_GEMINI_CLEANUP=true)        │
  │  • OR Ollama (default)                     │
  └──────────────┬──────────────────────────────┘
                 │
  ┌──────────────▼──────────────────────────────┐
  │ Stage 5: Review Checkpoint (Optional)      │
  │  • Skip if reviewBeforeChunking=false      │
  └──────────────┬──────────────────────────────┘
                 │
           ┌─────┴──────┐
           │            │
      User Choice   User Choice
      (Default)     (Optional)
           │            │
      ┌────▼────┐  ┌───▼──────────────────┐
      │Hybrid   │  │ Chonkie Re-chunking  │
      │Chunker  │  │ • Semantic           │
      │(Fast)   │  │ • Recursive          │
      │         │  │ • Neural             │
      │Skip     │  │ • Slumber            │
      │overlap  │  │ • Sentence           │
      │transfer │  │ • Token              │
      └────┬────┘  └──────┬───────────────┘
           │              │
           │         ┌────▼────────────────┐
           │         │ Overlap Detection   │
           │         │ • Find overlapping  │
           │         │   Docling chunks    │
           │         │ • Aggregate metadata│
           │         │ • Union headings    │
           │         │ • Min/max pages     │
           │         └──────┬──────────────┘
           │                │
           └────────┬───────┘
                    │
      ┌─────────────▼────────────────────────────┐
      │ Stage 6: Metadata Enrichment (75-90%)   │
      │  • PydanticAI + Ollama                  │
      │  • Extract themes, concepts, domains    │
      └──────────────┬──────────────────────────┘
                     │
      ┌──────────────▼──────────────────────────┐
      │ Stage 7: Embeddings (90-95%)            │
      │  • Transformers.js (local)              │
      │  • Metadata-enhanced vectors            │
      └──────────────┬──────────────────────────┘
                     │
      ┌──────────────▼──────────────────────────┐
      │ Stage 8: Finalize (95-100%)             │
      │  • Save to database                     │
      │  • Queue connection detection           │
      └─────────────────────────────────────────┘

  Key Simplifications

  Remove:
  - ❌ Inline metadata HTML comment system (proven concept, but Chonkie is
  better)
  - ❌ 5-layer bulletproof matching (replaced by overlap detection)
  - ❌ Fuzzy matching, embeddings matching, LLM matching layers
  - ❌ Synthetic chunks and validation warnings
  - ❌ 3-way branching (inline/bulletproof/cloud)
  - ❌ Cloud mode chunking (keep Gemini for cleanup only)

  Keep:
  - ✅ Docling extraction with cached_chunks table
  - ✅ AI cleanup (Gemini or Ollama)
  - ✅ Metadata enrichment (Stage 7)
  - ✅ Embeddings generation (Stage 8)
  - ✅ Review checkpoints (optional pause points)

  Add:
  - ✅ Chonkie Python wrapper (6 chunker types)
  - ✅ TypeScript IPC for Chonkie
  - ✅ Overlap-based metadata transfer
  - ✅ UI dropdown for chunker selection
  - ✅ Database migration for chunker_type column

  ---
  Chonkie Integration Plan

  Phase 0: Validation (Week 0.5)

  T-001: Validate bulletproof matcher content-offset sync
  - Verify chunks.start_offset and chunks.end_offset match actual positions
  - Test binary search accuracy (position → chunk mapping)
  - Measure overlap rate (expect 70-90% for most documents)
  - Document that overlaps are EXPECTED and BENEFICIAL

  T-002: Document overlap detection as feature (not bug)
  - Update bulletproof-metadata-extraction.md
  - Create worker/lib/chonkie/README.md explaining overlap transfer
  - Visual examples of overlap-based metadata aggregation

  Phase 1: Infrastructure (Week 1)

  T-003: Install Chonkie and create Python wrapper
  - pip install chonkie
  - Create worker/scripts/chonkie_chunk.py
  - Support 6 chunker types: semantic, recursive, neural, slumber,
  sentence, token
  - Chunker-specific configs (threshold, separators, model, strategy)
  - CRITICAL: sys.stdout.flush() after JSON write (prevent IPC hangs)

  T-004: Create TypeScript IPC wrapper
  - worker/lib/chonkie/chonkie-chunker.ts
  - Spawn Python subprocess, parse JSON output
  - Timeout handling (90-240 seconds based on chunker type)
  - Error propagation with context

  T-005: Database migration for chunker_type
  - Add chunker_type column to chunks table
  - Add chunker_type column to documents table
  - Add default_chunker_type to user_preferences
  - CHECK constraints for valid types: hybrid, semantic, recursive, neural,
   slumber, sentence, token

  T-006: Unit tests for Chonkie infrastructure
  - Mock subprocess tests (fast)
  - Integration tests with real Python (slow)
  - Character offset accuracy tests (critical for metadata transfer)

  Phase 2: Metadata Transfer (Week 2)

  T-007: Create metadata transfer module
  - worker/lib/chonkie/metadata-transfer.ts
  - Overlap detection: docling.start < chonkie.end AND docling.end > 
  chonkie.start
  - Metadata aggregation: union headings, min/max pages, merge bboxes
  - Confidence scoring: high (3+ overlaps), medium (1-2), low
  (interpolated)
  - Handle no-overlap cases gracefully (interpolate from neighbors)

  T-008: Integration tests for metadata transfer
  - Test with 5-10 diverse documents
  - Validate >90% overlap coverage
  - Validate >90% metadata recovery
  - Confidence distribution checks

  Phase 3: UI Integration (Week 3)

  T-009: Add chunker selection to upload flow
  - Dropdown in UploadZone component
  - 7 options: Hybrid (default), Semantic, Recursive, Neural, Slumber,
  Sentence, Token
  - Time estimates for each chunker
  - Tooltips with descriptions
  - Load user's default_chunker_type preference

  T-010: Display chunker type in document metadata
  - Badge in DocumentCard
  - Metadata panel display
  - Filter by chunker type in library view

  ---
  Overlap-Based Metadata Transfer

  How It Works

  Docling creates structural chunks (heading breaks, page breaks).Chonkie
  creates semantic chunks (topic shifts, sentence groups).

  These boundaries don't align, which is GOOD:

  Docling chunks:  [─────────────────][───────────────────][─────────────]
  Chonkie chunks:     [────────────────────][────────────────────][───────]
                           ↑                   ↑
                        Overlaps!          Overlaps!

  Overlap Detection:
  function hasOverlap(docling: Chunk, chonkie: Chunk): boolean {
    return docling.start_offset < chonkie.end_index &&
           docling.end_offset > chonkie.start_index
  }

  Metadata Aggregation:
  function aggregateMetadata(overlappingDoclingChunks: DoclingChunk[]): 
  Metadata {
    return {
      // Union of all heading paths
      heading_path: [...new Set(overlappingChunks.flatMap(c =>
  c.heading_path))],

      // Earliest to latest page
      page_start: Math.min(...overlappingChunks.map(c => c.page_start)),
      page_end: Math.max(...overlappingChunks.map(c => c.page_end)),

      // All bounding boxes
      bboxes: overlappingChunks.flatMap(c => c.bboxes),

      // Confidence based on overlap count
      confidence: calculateConfidence(overlappingChunks.length)
    }
  }

  Expected Results:
  - 70-90% of Chonkie chunks have 1-3 overlapping Docling chunks
  - High confidence (>0.9) for chunks with 3+ overlaps
  - Low overlap rate (<70%) indicates potential issues

  ---
  Technical Decisions

  Why Chonkie Over Inline Metadata?

  | Aspect           | Inline Metadata      | Chonkie + Overlap       |
  |------------------|----------------------|-------------------------|
  | Chunk boundaries | Structural (Docling) | Semantic/Neural/etc     |
  | Metadata source  | HTML comments        | Cached Docling chunks   |
  | Flexibility      | 1 chunker only       | 7 chunker strategies    |
  | Complexity       | Medium (parsing)     | Low (overlap detection) |
  | Quality          | Good (structural)    | Better (semantic)       |
  | User choice      | No                   | Yes (per document)      |

  Winner: Chonkie gives users choice while overlap detection preserves
  metadata quality.

  Why Keep cached_chunks Table?

  The cached_chunks table stores original Docling HybridChunker output:
  - Purpose: Zero-cost reprocessing with different Chonkie strategies
  - Contents: Raw chunks with metadata before AI cleanup
  - Benefit: User can try neural chunker, then switch to semantic without
  re-extracting PDF
  - Cost savings: ~$0.20-0.60 per document reprocessing avoided

  Why Remove Bulletproof Matching?

  The 5-layer system was solving: "AI cleanup destroys chunk boundaries,
  how do we remap?"

  With Chonkie approach:
  1. Docling chunks stored in cache (original boundaries + metadata)
  2. AI cleanup changes markdown (boundaries destroyed)
  3. Chonkie creates NEW boundaries (semantic, not structural)
  4. Overlap detection finds which Docling chunks contributed to each
  Chonkie chunk
  5. Metadata aggregated from overlapping chunks

  Key insight: We're not trying to MATCH boundaries anymore. We're
  TRANSFERRING metadata across different boundary systems.

  ---
  Open Questions for Discussion

  Architecture

  1. HybridChunker as default vs Chonkie semantic as default?
    - HybridChunker: Fast, proven, structural
    - Semantic: Better quality, slightly slower
    - Recommendation: Keep Hybrid default, Semantic opt-in
  2. Should overlap detection run for HybridChunker?
    - If user selects Hybrid, chunks ARE the Docling chunks
    - No re-chunking needed, no overlap detection needed
    - Skip straight to metadata enrichment
    - OR: Always run overlap detection for consistency?
  3. Confidence thresholds for metadata transfer?
    - High: >0.9 (3+ overlaps, >50% character overlap)
    - Medium: 0.7-0.9 (1-2 overlaps, 20-50% overlap)
    - Low: <0.7 (interpolated, no direct overlap)
    - Should low-confidence chunks be flagged for user review?

  Implementation

  4. Chunker selection UI placement?
    - Option A: Upload form dropdown (user decides upfront)
    - Option B: After upload, before processing (see extraction first)
    - Option C: Both (default in upload, can override after)
  5. Reprocessing with different chunkers?
    - Use cached_chunks to avoid re-extraction
    - Keep original chunks or replace entirely?
    - How to handle multiple chunk sets per document?
  6. Migration path for existing documents?
    - All existing chunks get chunker_type: 'hybrid' (default)
    - Bulletproof-matched chunks: what chunker_type?
    - Cloud-mode chunks: chunker_type: 'ai_semantic'?

  Performance

  7. Batch size for Chonkie processing?
    - Neural/Slumber are slow (180-240 seconds per document)
    - Should we warn users about processing time?
    - Queue limits for slow chunkers?
  8. Embeddings with Chonkie chunks?
    - Current: Metadata-enhanced embeddings (heading context)
    - With Chonkie: Same approach, or different?
    - Token limits still apply (512 tokens for embedding input)

  ---
  Code Refactoring Scope

  Files to Modify

  Worker Module:
  1. worker/processors/pdf-processor.ts (~855 lines)
    - Remove inline metadata branch (lines 381-443)
    - Remove bulletproof matching branch (lines 444-723)
    - Remove cloud chunking branch (lines 725-807)
    - Add Chonkie chunking stage
    - Add overlap-based metadata transfer stage
    - Keep metadata enrichment and embeddings stages
  2. worker/lib/docling-extractor.ts
    - Keep as-is (used for Docling extraction)
  3. NEW: worker/lib/chonkie/chonkie-chunker.ts
    - TypeScript IPC wrapper for Chonkie
  4. NEW: worker/lib/chonkie/metadata-transfer.ts
    - Overlap detection and aggregation
  5. NEW: worker/scripts/chonkie_chunk.py
    - Python wrapper for 6 Chonkie chunker types

  Frontend:
  6. src/components/library/UploadZone.tsx
  - Add chunker selection dropdown

  7. src/components/reader/DocumentMetadata.tsx
    - Display chunker_type badge

  Database:
  8. supabase/migrations/050_add_chunker_type.sql
  - Add chunker_type columns

  Estimated Changes

  - Remove: ~350 lines (bulletproof matching + inline metadata)
  - Add: ~400 lines (Chonkie wrapper + overlap detection + UI)
  - Modify: ~200 lines (pdf-processor flow refactor)
  - Net change: +250 lines, but MUCH simpler logic

  ---
  Success Metrics

  Performance

  - HybridChunker (default): <15 minutes for 500-page book
  - Semantic/Recursive: 15-17 minutes
  - Neural: 17-18 minutes
  - Slumber: 18-20 minutes

  Quality

  - Overlap coverage: >70% of chunks have overlaps
  - Metadata recovery: >90% of chunks have heading_path or page numbers
  - Confidence distribution: >75% high confidence, <5% interpolated
  - Zero synthetic chunks (no interpolation needed)

  User Experience

  - Single, predictable pipeline (no branching)
  - Clear chunker selection UI
  - Accurate time estimates
  - No validation warnings for users

  ---
  Next Session Goals

  1. Architecture Review
    - Discuss HybridChunker vs Chonkie as default
    - Decide on overlap detection for HybridChunker
    - Confirm confidence thresholds
  2. Implementation Strategy
    - Phase 0 first (validation) or skip to Phase 1 (infrastructure)?
    - Parallel development (Python + TypeScript) or sequential?
    - Testing strategy during refactor
  3. Migration Plan
    - How to handle existing documents?
    - Backward compatibility requirements?
    - Can we break existing processing in favor of simplicity?
  4. UI/UX Decisions
    - Chunker selection placement
    - Time estimates and warnings
    - Reprocessing workflow

  ---
  Key Takeaways

  ✅ Inline metadata proof of concept succeeded - We proved metadata can
  survive cleanup when parsed before AI transformations.

  ✅ Chonkie is the better path - More flexible, simpler code, better
  quality, user choice.

  ✅ Overlap detection replaces bulletproof matching - Simpler algorithm,
  same guarantee of metadata preservation.

  ✅ One pipeline to rule them all - No more 3-way branching, just: Extract
   → Clean → Chunk → Transfer → Enrich → Embed.

  🚀 Ready to build!