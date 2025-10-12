# Local Processing Pipeline v1 - Task Breakdown

## Overview

This directory contains the complete task breakdown for implementing the **100% Local Document Processing Pipeline** feature, as specified in `/Users/topher/Code/rhizome-v2/docs/prps/local-processing-pipeline.md`.

The pipeline replaces cloud AI services (Gemini) with local alternatives:
- **Docling** for PDF extraction with structural metadata
- **Ollama (Qwen 32B)** for LLM tasks (cleanup, metadata)
- **Transformers.js** for local embeddings
- **5-layer bulletproof matching** for 100% chunk recovery

## Document Organization

### Detailed Phase Documents (4 Complete)

1. **[Phase 1: Core Infrastructure](./phase-1-core-infrastructure.md)** ✅ COMPLETE
   - Tasks 1-4: Database migration, Python/Node dependencies, Ollama setup, client module
   - **Time**: 3-4 days | **Risk**: Medium | **Blocks**: All other phases
   - **Files**: Migration 045, OllamaClient, Python packages, Ollama model

2. **[Phase 2: Docling Integration (PDF)](./phase-2-docling-integration.md)** ✅ COMPLETE
   - Tasks 5-7: Python script enhancement, TypeScript wrapper, PDF processor integration
   - **Time**: 4-5 days | **Risk**: Medium-High | **Depends**: Phase 1
   - **Files**: docling_extract.py, docling-extractor.ts, pdf-processor.ts

3. **[Phase 3: Local LLM Cleanup (PDF)](./phase-3-local-llm-cleanup.md)** ✅ COMPLETE
   - Tasks 8-9: Ollama cleanup module, PDF processor integration
   - **Time**: 2-3 days | **Risk**: Medium | **Depends**: Phases 1-2
   - **Files**: ollama-cleanup.ts, pdf-processor.ts (Stage 4)

4. **[Phase 4: Bulletproof Matching (PDF)](./PHASES_OVERVIEW.md#phase-4-bulletproof-matching)** 📋 PLANNED
   - Tasks 10-15: 5-layer matching system, 100% chunk recovery
   - **Time**: 5-7 days | **Risk**: High | **Depends**: Phases 1-3
   - **Files**: bulletproof-matching.ts, chunk-remapper.ts

5. **[Phase 5: EPUB Docling Integration](./phase-5-epub-docling.md)** 📋 PLANNED
   - Tasks 16-20: EPUB→HTML extraction, Docling processing, bulletproof matching adaptation
   - **Time**: 3-5 days | **Risk**: Low-Medium | **Depends**: Phase 4
   - **Files**: docling_extract_epub.py, epub-docling-extractor.ts, epub-processor.ts

### Consolidated Overview (Phases 6-11)

6. **[PHASES_OVERVIEW.md](./PHASES_OVERVIEW.md)** ✅ COMPLETE
   - **Phase 6**: Metadata Enrichment (Tasks 21-23) - PydanticAI structured outputs (both formats)
   - **Phase 7**: Local Embeddings (Tasks 24-25) - Transformers.js integration (both formats)
   - **Phase 8**: Review Checkpoints (Tasks 26-27) - Manual review workflow
   - **Phase 9**: Confidence UI (Tasks 28-30) - Quality indicators, tooltips
   - **Phase 10**: Testing & Validation (Tasks 31-32) - Integration tests
   - **Phase 11**: Documentation (Tasks 33-35) - Setup guides, env vars

## How to Use These Documents

### For AI Coding Assistants (Claude, Cursor, etc.)

Each phase document is **standalone and comprehensive**:
- Complete context and background
- All relevant pseudocode from PRP
- Critical gotchas and library quirks
- Codebase patterns to mirror (file:line references)
- Validation commands with expected outputs
- External documentation links

**To implement a phase:**
1. Read the phase document (e.g., `phase-1-core-infrastructure.md`)
2. Work through tasks sequentially
3. Run validation commands after each task
4. Check off items in validation checklist
5. Verify success criteria before moving to next phase

**No need to reference the original PRP** - all necessary information is extracted and included.

### For Human Developers

**Quick Start:**
1. Start with `PHASES_OVERVIEW.md` for high-level understanding
2. Dive into detailed phase docs (Phases 1-3) for implementation
3. Use validation checklists to track progress
4. Reference external links for library documentation

**Dependencies:**
- Phase 1 blocks everything (foundational)
- Phases 2-3 sequential (PDF pipeline: Docling → Cleanup)
- Phase 4 depends on Phases 1-3 (bulletproof matching needs PDF pipeline proven)
- Phase 5 depends on Phase 4 (EPUB extends proven matching approach)
- Phases 6-7 depend on Phase 5 (metadata/embeddings work on both formats)
- Phases 8-9 sequential (review → UI)
- Phase 10 integrates all (testing)
- Phase 11 final (documentation)

## Implementation Timeline

### Week 1: Foundation (PDF)
- **Days 1-4**: Phase 1 (Core Infrastructure) ✅ COMPLETE
- **Days 5-7**: Phase 2 (Docling PDF) - start ✅ COMPLETE

### Week 2: PDF Pipeline
- **Days 8-10**: Phase 2 (Docling PDF) - complete ✅ COMPLETE
- **Days 11-13**: Phase 3 (Local Cleanup PDF) ✅ COMPLETE
- **Day 14**: Phase 4 (Bulletproof Matching) - start

### Week 3: Matching & EPUB Extension
- **Days 15-20**: Phase 4 (Bulletproof Matching PDF) - COMPLEX
- **Days 21-25**: Phase 5 (EPUB Docling Integration)

### Week 4: Unified Enhancements
- **Days 26-28**: Phase 6 (Metadata Enrichment - both formats)
- **Days 29-31**: Phase 7 (Local Embeddings - both formats)
- **Days 32-33**: Phase 8 (Review Checkpoints)

### Week 5: Finalization
- **Days 34-36**: Phase 9 (Confidence UI)
- **Days 37-38**: Phase 10 (Testing & Validation)
- **Days 39-40**: Phase 11 (Documentation)

**Total**: 32-40 days (4.5 - 5.5 weeks)

## Critical Paths

### Blocking Dependencies
```
Phase 1 (Core Infrastructure)
    ↓
Phase 2 (Docling PDF) ──→ Phase 3 (Cleanup PDF) ──→ Phase 4 (Matching PDF)
                                                           ↓
                                                    Phase 5 (EPUB Docling)
                                                           ↓
                                                    Phase 6 (Metadata - both)
                                                           ↓
                                                    Phase 7 (Embeddings - both)
                                                           ↓
                                                    Phase 8 (Review Checkpoints)
                                                           ↓
                                                    Phase 9 (Confidence UI)
                                                           ↓
                                                    Phase 10 (Testing)
                                                           ↓
                                                    Phase 11 (Documentation)
```

### Parallel Work Opportunities
- **During Phases 1-5**: Documentation can be drafted in parallel
- **After Phase 5**: Could parallelize Phase 6 (metadata) and Phase 7 (embeddings) if needed
- **During Phase 10**: Can draft Phase 11 documentation

## Key Technical Decisions

### From PRP Analysis

**1. Tokenizer Alignment** (CRITICAL)
- HybridChunker: `tokenizer='Xenova/all-mpnet-base-v2'`
- Transformers.js: `model='Xenova/all-mpnet-base-v2'`
- **Must match** or chunk sizes won't align with embeddings

**2. Quantization Choice**
- Qwen 32B Q4_K_M (not Q8)
- **Why**: 2-3x faster on M1 Max, ~20GB RAM vs 40GB, minimal quality loss

**3. Streaming Disabled for Structured Outputs**
- Ollama: `stream: false` when using `format: 'json'`
- **Why**: Streaming breaks JSON parsing in PydanticAI

**4. Python stdout.flush() Required**
- **Every** JSON write must be followed by `sys.stdout.flush()`
- **Why**: Without flush, Node.js subprocess IPC hangs

**5. 100% Recovery Guarantee**
- Layer 4 (interpolation) **never fails**
- Always returns synthetic chunks for unmatched items
- **Trade-off**: Position approximate, but metadata preserved

## Success Metrics

### Performance Targets
- **Small PDFs (<50 pages)**: <5 minutes total processing
- **Large PDFs (500 pages)**: <80 minutes total processing
- **Chunk recovery**: 100% (0% lost)
- **Exact matches**: ≥85%
- **Synthetic chunks**: <5%
- **API calls**: 0 (100% local)

### Quality Targets
- User can review at 2 checkpoints
- Confidence UI shows match quality for all chunks
- Can retry failed stages without data loss
- Synthetic chunks flagged for validation

### Technical Targets
- All integration tests pass
- No linting errors
- No TypeScript errors
- Build succeeds
- Mocked tests for CI (no real AI calls)

## Validation Strategy

### Per-Phase Validation
Each phase document includes:
- Validation commands with expected outputs
- Integration points checklist
- Success criteria specific to that phase

### Final Validation (Phase 9)
```bash
# Worker integration tests
cd worker && npm run test:integration

# Metadata validation
cd worker && npm run validate:metadata

# E2E tests
npm run test:e2e

# Build verification
npm run build
```

### Manual Testing Checklist
- [ ] Upload 50-page PDF, verify <5 min processing
- [ ] Check chunk quality panel shows statistics
- [ ] Verify synthetic chunks have correct page numbers
- [ ] Test Qwen OOM fallback (if applicable)
- [ ] Verify review checkpoints pause correctly
- [ ] Test resume from review

## Troubleshooting Guide

### Common Issues

**1. Python subprocess hangs**
- **Cause**: Missing `sys.stdout.flush()` in Python script
- **Fix**: Add flush after every `sys.stdout.write()`
- **Validation**: Check Python script has flush in all paths

**2. Qwen OOM errors**
- **Cause**: 32B model too large for available RAM
- **Fix**: Use smaller model (Qwen 14B or 7B)
- **Update**: `OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M`

**3. High synthetic chunk rate (>5%)**
- **Cause**: Poor Docling extraction or aggressive cleanup
- **Debug**: Review Docling extraction output
- **Fix**: Adjust cleanup prompts or disable AI cleanup

**4. Embeddings wrong dimensions**
- **Cause**: Missing `pooling: 'mean'` or `normalize: true`
- **Fix**: Check Transformers.js pipeline options
- **Validation**: Verify embeddings are 768-dimensional

**5. Chunks missing page numbers**
- **Cause**: Docling provenance data missing
- **Debug**: Check Python script `extract_chunk_metadata()`
- **Fix**: Ensure provenance extraction handles missing data

## External Resources

### Documentation Links
- **Docling HybridChunker**: https://docling-project.github.io/docling/examples/hybrid_chunking/
- **PydanticAI Install**: https://ai.pydantic.dev/install/
- **Ollama JS SDK**: https://github.com/ollama/ollama-js
- **Qwen Model**: https://ollama.com/library/qwen2.5:32b-instruct
- **Transformers.js**: https://huggingface.co/docs/transformers.js/

### Codebase Patterns
All phase documents include specific file:line references to existing code patterns to mirror.

## Cost Savings Analysis

### Current Gemini Costs (per 500-page book)
- Extraction: $0.12
- Cleanup: $0.08
- Metadata: $0.20
- Embeddings: $0.02
- **Total**: $0.42 per book

### Local Pipeline Costs
- **Total**: $0.00 per book

### ROI
- 1,000 books: **Save $420**
- 10,000 books: **Save $4,200**
- 100,000 books: **Save $42,000**

**Plus**: Complete privacy, no data sent to cloud

## Anti-Patterns Reference

From PRP lines 1519-1530 (repeated in all phase docs):

- ❌ Don't skip Python stdout.flush() - IPC will hang
- ❌ Don't use Ollama streaming for structured outputs - breaks JSON
- ❌ Don't mismatch tokenizer between HybridChunker and embeddings
- ❌ Don't load entire PDFs into memory - use Docling streaming
- ❌ Don't use Q8 quantization on M1 Max - too slow, use Q4_K_M
- ❌ Don't skip confidence tracking - user needs transparency
- ❌ Don't block pipeline on validation failures - mark for review
- ❌ Don't assume 100% exact matches - plan for synthetic chunks
- ❌ Don't test with real AI in CI - mock Ollama and Python
- ❌ Don't ignore OOM errors - catch and fallback gracefully

## Questions & Support

### Before Starting
- Review `PHASES_OVERVIEW.md` for high-level understanding
- Ensure hardware meets requirements (64GB RAM for Qwen 32B)
- Check Python 3.10+ installed

### During Implementation
- Each phase is standalone - start with Phase 1
- Run validation commands after each task
- Check off validation checklist items
- Reference external docs for library-specific questions

### After Completion
- Run full validation suite (Phase 9)
- Manual testing with real PDFs
- Update CLAUDE.md with learnings (Phase 10)

---

**Source PRP**: `/Users/topher/Code/rhizome-v2/docs/prps/local-processing-pipeline.md`

**PRP Confidence**: 8.5/10 (High confidence for one-pass implementation)

**Status**: Ready for Implementation ✅
