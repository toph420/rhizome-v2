# Docling Optimization Opportunities (Post-Chonkie Integration)

**Status**: Research needed after Chonkie integration complete
**Priority**: Low (current config is working well)
**Context**: HEXEN2 analysis showed 17 gap-fills (20.5%), all expected structural gaps

---

## Current Configuration (Baseline)

```python
# worker/scripts/docling_extract.py (lines 199-208)
do_picture_classification = False  # AI disabled
do_picture_description = False     # AI disabled
do_code_enrichment = False         # AI disabled
generate_page_images = False       # Not extracting
do_table_structure = True          # ✓ ENABLED (good!)
images_scale = 1.0                 # 72 DPI (low resolution)
do_ocr = False                     # Only for scanned PDFs
```

**Performance:**
- ✅ 100% chunk matching (66/66 Docling chunks found)
- ✅ 17 gap-fills (expected: headings, page breaks, figures)
- ✅ Gap-fills enable binary search + Chonkie overlap detection

---

## Quick Wins (Low-Hanging Fruit)

### 1. Increase Image Resolution
**Change:**
```python
images_scale = 2.0  # From 1.0 → 2.0 (144 DPI)
```

**Impact:**
- Better figure/diagram detection → fewer gap-fills
- More accurate bounding boxes for citations
- **Especially helpful for visual documents** (art, technical manuals, diagrams)

**Cost:** ~20% slower processing (acceptable for local pipeline)

**When to do:** Test with diverse document types first

---

### 2. Conditional OCR for Scanned PDFs
**Change:**
```python
def is_scanned_pdf(pdf_path: str) -> bool:
    """Detect if PDF has text layer or needs OCR."""
    # Implementation: Check if text extraction yields <100 chars
    # Or use PyPDF2.PdfReader to check text layer
    pass

# In extract_with_chunking():
if is_scanned_pdf(pdf_path):
    pipeline_options.do_ocr = True
```

**Impact:**
- Scanned PDFs: 0% coverage → 100% coverage
- Normal PDFs: No performance hit (OCR skipped)

**Cost:** 5-10x slower for scanned PDFs only

**When to do:** When users report scanned book/document failures

---

## Research Needed (Post-Chonkie Integration)

### Test Matrix: Gap-Fill Rates vs Configuration

**Hypothesis:** Higher image resolution → fewer gaps

**Test Documents:**
1. **Narrative PDF** (novel, essay) → expect 5-10% gaps
2. **Technical manual** (tables, diagrams) → expect 15-20% gaps
3. **Academic paper** (figures, equations) → expect 10-15% gaps
4. **Scanned book** → requires OCR testing

**Test Configurations:**
```
A. Baseline (current): images_scale=1.0, do_ocr=False
B. High-res images: images_scale=2.0, do_ocr=False
C. OCR enabled: images_scale=2.0, do_ocr=True (scanned only)
```

**Metrics to track:**
- Gap-fill count and percentage
- Total processing time
- Overlap rate with Chonkie chunks (target: 70-90%)
- Metadata coverage (heading_path, page_start completeness)

---

### AI Features (Low Priority - Research Only)

**Picture Classification** (`do_picture_classification = True`):
- Use case: Distinguish diagrams from photos from charts
- Benefit: Metadata enrichment only
- Cost: Minimal (classification API)
- **Skip for now:** Not needed for Chonkie metadata transfer

**Picture Description** (`do_picture_description = True`):
- Use case: Accessibility, image search
- Benefit: Alt-text for figures
- Cost: High (image-to-text model)
- **Skip indefinitely:** Ollama can't do this, requires cloud AI

**Code Enrichment** (`do_code_enrichment = True`):
- Use case: Programming books, API documentation
- Benefit: Extract function names, detect languages
- Cost: Medium (code analysis)
- **Maybe later:** If processing programming books becomes common

---

## Optimization Roadmap

### Phase 1: Chonkie Integration (Current)
- ✅ Keep current Docling config (it's working!)
- ✅ Focus on Chonkie metadata transfer via overlaps
- ✅ Validate gap-fills carry metadata correctly

### Phase 2: Testing & Measurement (After Chonkie Works)
1. Process 10-20 diverse documents
2. Measure gap-fill rates by document type
3. Test `images_scale = 2.0` impact
4. Document "normal" vs "concerning" gap rates

### Phase 3: Document Type Detection (Optional)
```python
def detect_document_type(doc) -> str:
    """Classify document as narrative/technical/academic."""
    # Check for: tables, figures, code blocks, equations
    # Return: 'narrative' | 'technical' | 'academic' | 'mixed'
    pass

def get_pipeline_preset(doc_type: str) -> dict:
    """Return optimal pipeline config for document type."""
    presets = {
        'narrative': {'images_scale': 1.0, 'do_table_structure': False},
        'technical': {'images_scale': 2.0, 'do_table_structure': True},
        'academic': {'images_scale': 2.0, 'do_table_structure': True},
    }
    return presets.get(doc_type, presets['technical'])
```

### Phase 4: Advanced Optimization (Future)
- Profile processing time by stage
- Implement caching for repeated documents
- Add quality scoring (metadata coverage, gap rate)
- Consider Docling v2.x new features

---

## Key Insights

### Gap-Fills Are a Feature, Not a Bug

**Why gaps occur:**
- Docling HybridChunker is conservative: "If I'm not sure, skip it"
- Skips: headings, page breaks, figure captions, decorative content
- Philosophy: High-quality semantic chunks > complete coverage

**Why bulletproof matcher fills gaps:**
- Ensures 100% markdown coverage (no position-mapping holes)
- Enables binary search for ChunkQualityPanel "Fix Position" feature
- **Critical for Chonkie metadata transfer via overlap detection**

**The workflow:**
```
Docling chunks (66) → High-quality semantic boundaries with metadata
         ↓
Bulletproof matcher → Fills gaps (17) for continuous coverage
         ↓
Total chunks (83) → 100% markdown covered, ready for overlaps
         ↓
Chonkie chunking → Creates NEW boundaries on cleanedMarkdown
         ↓
Metadata transfer → Overlaps detect which Docling chunks → Chonkie chunks
         ↓
Result: Chonkie chunks inherit Docling metadata (heading_path, pages, bboxes)
```

**Expected gap-fill rates:**
- **<10%**: Simple narratives (novels, essays)
- **10-20%**: Mixed content (HEXEN2: 20.5% ✓ normal)
- **20-30%**: Heavy visual content (art books, infographics)
- **>30%**: Potential issue (check Docling extraction quality)

---

## Next Steps (When Ready)

1. ✅ Complete Chonkie integration
2. ✅ Validate metadata transfer works with gap-fills
3. 🔜 Run test matrix (diverse documents × config variations)
4. 🔜 Document optimal configs per document type
5. 🔜 Consider auto-detection + presets

---

## References

**Current Implementation:**
- `worker/scripts/docling_extract.py` - Main extraction script
- `worker/lib/local/bulletproof-matcher.ts` - Gap-filling logic
- `docs/validation/bulletproof-matcher-validation.md` - HEXEN2 analysis

**Docling Documentation:**
- Official docs: https://docling-project.github.io/docling/
- Pipeline options: https://github.com/DS4SD/docling (PdfPipelineOptions)
- HybridChunker: https://docling-project.github.io/docling/usage/#chunking

**Related Tasks:**
- Phase 0, T-001: Bulletproof matcher validation (✅ complete)
- Phase 1, T-003: Chonkie Python wrapper (🔜 next)
- Phase 2, T-007: Chonkie metadata transfer (🔜 blocked on T-003)
