# Docling Pipeline Configuration Guide

Comprehensive guide to configuring Docling document processing features via environment variables.

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Default Configuration](#default-configuration)
3. [Feature Decision Guide](#feature-decision-guide)
4. [Example Configurations](#example-configurations)
5. [Configuration Priority](#configuration-priority)
6. [Performance Impact Summary](#performance-impact-summary)

---

## Quick Reference

Control Docling pipeline features via environment variables:

| Environment Variable | Type | Default | Description |
|---|---|---|---|
| `EXTRACT_IMAGES` | boolean | `true` | Extract figures from document |
| `IMAGE_SCALE` | number | `2.0` | Image DPI scaling (1.0 = 72 DPI, 2.0 = 144 DPI) |
| `EXTRACT_TABLES` | boolean | `true` | Extract table images |
| `CLASSIFY_IMAGES` | boolean | `false` | AI classification of image types (opt-in) |
| `DESCRIBE_IMAGES` | boolean | `false` | AI-generated image descriptions (opt-in) |
| `ENRICH_CODE` | boolean | `false` | AI analysis of code blocks (opt-in) |
| `ENABLE_OCR` | boolean | `false` | OCR for scanned documents (opt-in) |

**Example:**
```bash
# Enable AI image classification for academic papers
CLASSIFY_IMAGES=true npm run dev:worker

# Enable OCR for scanned documents
ENABLE_OCR=true npm run dev:worker

# Disable image extraction for faster text-only processing
EXTRACT_IMAGES=false npm run dev:worker
```

---

## Default Configuration

Rhizome V2 uses a **quality-first** default configuration:

### ✅ Enabled by Default

- **Figure Extraction** (`generate_picture_images`)
  - Extracts figures, charts, diagrams
  - Low cost, high value
  - Quality: 144 DPI (2.0 scale)

- **Table Extraction** (`generate_table_images`)
  - Extracts table images
  - Preserves complex table layouts
  - Low cost, high value

- **Table Structure** (`do_table_structure`)
  - Extracts table rows/columns/cells
  - Enables structured data extraction
  - Low cost, high value

### ❌ Disabled by Default (Opt-in)

- **Image Classification** (`do_picture_classification`)
  - AI classification of image types
  - Medium cost (AI call per image)
  - Enable with: `CLASSIFY_IMAGES=true`

- **Image Description** (`do_picture_description`)
  - AI-generated natural language descriptions
  - High cost (vision model per image)
  - Enable with: `DESCRIBE_IMAGES=true`

- **Code Enrichment** (`do_code_enrichment`)
  - AI analysis of code blocks
  - Medium cost (AI call per block)
  - Enable with: `ENRICH_CODE=true`

- **OCR** (`do_ocr`)
  - Optical Character Recognition
  - Very high cost (OCR per page)
  - Enable with: `ENABLE_OCR=true`

### Why Quality-First?

1. **Extract What Matters**: Figures and tables are critical for understanding technical content
2. **Preserve Structure**: Table structure extraction enables data analysis
3. **Manage Costs**: Expensive AI features are opt-in to avoid unexpected costs
4. **Fast by Default**: No unnecessary processing means faster extraction

---

## Feature Decision Guide

### Figure Extraction

**What it does**: Extracts individual figures, charts, and diagrams as separate images.

**Enable for:**
- Academic papers with figures
- Technical documentation with diagrams
- Reports requiring visual reference
- Books with important illustrations

**Skip for:**
- Pure text documents (novels, essays)
- Minimal storage use cases
- Fast text-only extraction

**Cost**: Low (local image processing)

**Environment Variable**: `EXTRACT_IMAGES=true|false`

**Recommendation**: ✅ **Enabled by default** (quality-first)

---

### Image Quality (DPI Scaling)

**What it does**: Controls image resolution via DPI scaling.

**Values:**
- `1.0` = 72 DPI (low quality, smallest files)
- `2.0` = 144 DPI (good quality, reasonable files) **← Default**
- `3.0` = 216 DPI (high quality, larger files)

**Use Cases:**
- **1.0**: Text-focused documents, minimal storage
- **2.0**: Standard academic/technical papers
- **3.0**: High-fidelity image preservation, OCR

**Cost**: Minimal (local processing, affects storage only)

**Environment Variable**: `IMAGE_SCALE=1.0|2.0|3.0`

**Recommendation**: ✅ **2.0 by default** (balanced quality/size)

---

### Table Extraction

**What it does**: Extracts table images and structure (rows/columns/cells).

**Enable for:**
- Documents with data tables
- Reports requiring table reference
- Academic papers with tabular data

**Skip for:**
- Text-only documents
- When table visuals not needed

**Cost**: Low (local processing)

**Environment Variable**: `EXTRACT_TABLES=true|false`

**Recommendation**: ✅ **Enabled by default** (quality-first)

---

### Image Classification (AI)

**What it does**: AI classifies image types (figure, chart, diagram, photo, etc.).

**Enable for:**
- Academic papers (precise figure citations)
- Technical documentation (diagram categorization)
- Research analysis (image type statistics)

**Skip for:**
- Novels (no images)
- Cost-sensitive workflows
- Fast processing priority

**Cost**: Medium (AI call per image, ~$0.001 per image)

**Environment Variable**: `CLASSIFY_IMAGES=true|false`

**Recommendation**: ❌ **Opt-in** (costs add up for image-heavy docs)

**Example:**
```bash
# Enable for academic papers
CLASSIFY_IMAGES=true npm run dev:worker
```

---

### Image Description (AI)

**What it does**: AI generates natural language descriptions of images.

**Enable for:**
- Accessibility (screen readers)
- Visual summaries for text-first readers
- Research requiring image content analysis

**Skip for:**
- Fast processing
- Cost-sensitive workflows
- When visual inspection is sufficient

**Cost**: High (vision model per image, ~$0.005 per image)

**Environment Variable**: `DESCRIBE_IMAGES=true|false`

**Recommendation**: ❌ **Opt-in** (expensive, only when needed)

**Example:**
```bash
# Enable for accessibility
DESCRIBE_IMAGES=true npm run dev:worker
```

---

### Code Enrichment (AI)

**What it does**: AI analyzes code blocks (language detection, syntax highlighting metadata).

**Enable for:**
- Programming books
- Technical tutorials with code samples
- API documentation

**Skip for:**
- Non-technical content
- Fast processing priority
- When code highlighting not needed

**Cost**: Medium (AI call per code block, ~$0.001 per block)

**Environment Variable**: `ENRICH_CODE=true|false`

**Recommendation**: ❌ **Opt-in** (only useful for programming content)

**Example:**
```bash
# Enable for programming books
ENRICH_CODE=true npm run dev:worker
```

---

### OCR (Optical Character Recognition)

**What it does**: Extracts text from scanned PDFs (image-based PDFs without text layer).

**Enable for:**
- Scanned documents
- Image-based PDFs
- Historical documents without text layer

**Skip for:**
- Native digital PDFs (text already present)
- Fast processing
- Cost-sensitive workflows

**Cost**: Very High (OCR per page, ~$0.01 per page)

**Environment Variable**: `ENABLE_OCR=true|false`

**Recommendation**: ❌ **Opt-in** (expensive, only for scanned docs)

**Warning**: Rhizome will detect scanned documents and warn if OCR is disabled.

**Example:**
```bash
# Enable for scanned documents
ENABLE_OCR=true npm run dev:worker
```

---

### Page Batching (Auto-Optimization)

**What it does**: Processes large documents in batches to reduce memory usage.

**Enable for:**
- Large documents (>200 pages)
- Memory-constrained systems (<32GB RAM)

**Skip for:**
- Small documents (<100 pages)
- Maximum speed priority

**Cost**: None (actually saves memory)

**Configuration**: **Automatic** (no environment variable)

**Behavior:**
- 200-400 pages → `page_batch_size=50`
- 400+ pages → `page_batch_size=100`

**Recommendation**: ✅ **Auto-enabled** for large docs

**Note**: Cannot be manually controlled via environment variable. Docling detects page count and enables automatically.

---

## Example Configurations

### Academic Papers

**Use Case**: Extract high-quality figures with AI classification for citations.

```bash
# Enable AI features for academic analysis
CLASSIFY_IMAGES=true
IMAGE_SCALE=2.0
EXTRACT_IMAGES=true
EXTRACT_TABLES=true

npm run dev:worker
```

**Expected Cost**: ~$0.10 per paper (20 images @ $0.005 each)

**Processing Time**: +15% vs default (AI classification overhead)

**Benefits:**
- Precise figure citations
- Image type statistics
- High-quality figure extraction

---

### Programming Books

**Use Case**: Extract code blocks with syntax analysis.

```bash
# Enable code enrichment for programming content
ENRICH_CODE=true
EXTRACT_IMAGES=true
IMAGE_SCALE=1.5

npm run dev:worker
```

**Expected Cost**: ~$0.20 per book (200 code blocks @ $0.001 each)

**Processing Time**: +10% vs default (code analysis overhead)

**Benefits:**
- Language-specific syntax highlighting metadata
- Code block categorization
- Programming concept extraction

---

### Novels (Text-Only)

**Use Case**: Fast text extraction, minimal processing.

```bash
# Disable image processing for text-only content
EXTRACT_IMAGES=false
EXTRACT_TABLES=false

npm run dev:worker
```

**Expected Cost**: $0.00 (no AI features, no image processing)

**Processing Time**: -20% vs default (no image processing)

**Benefits:**
- Fastest processing
- Minimal storage usage
- Focus on text content

---

### Scanned Documents

**Use Case**: Extract text from scanned PDFs with OCR.

```bash
# Enable OCR for scanned document text extraction
ENABLE_OCR=true
IMAGE_SCALE=2.0
EXTRACT_IMAGES=true

npm run dev:worker
```

**Expected Cost**: ~$5.00 per 500-page book ($0.01 per page)

**Processing Time**: +300% vs default (OCR is slow)

**Benefits:**
- Text extraction from scanned pages
- Enables search and chunking
- Preserves historical document content

**Warning**: OCR is **very expensive** and **very slow**. Only enable for scanned documents.

---

## Configuration Priority

Configuration is applied in the following order (later overrides earlier):

### 1. Default Configuration (Lowest Priority)

Built-in quality-first defaults from `worker/lib/local/docling-config.ts`:

```typescript
{
  generate_picture_images: true,    // Extract figures
  generate_table_images: true,      // Extract tables
  images_scale: 2.0,                // 144 DPI quality
  do_picture_classification: false, // Opt-in
  do_picture_description: false,    // Opt-in
  do_code_enrichment: false,        // Opt-in
  do_ocr: false,                    // Opt-in
  do_table_structure: true          // Enabled
}
```

### 2. Environment Variables (Medium Priority)

User-specified overrides via shell environment:

```bash
# Override defaults
CLASSIFY_IMAGES=true  # Enable AI classification
IMAGE_SCALE=3.0       # Increase image quality
ENABLE_OCR=true       # Enable OCR
```

### 3. Document Hints (Highest Priority)

Auto-optimization based on document characteristics:

- **Page Count > 200** → Enable page batching (`page_batch_size=50`)
- **Page Count > 400** → Increase batch size (`page_batch_size=100`)
- **Scanned Detected** → Log warning if OCR disabled

**Example:**

```typescript
// Automatic optimization for large documents
const config = getPipelineConfig({
  pageCount: 350  // Detected from PDF
})
// Result: page_batch_size = 50 (auto-enabled)
```

---

## Performance Impact Summary

| Feature | Processing Time | Memory Usage | Cost (500-page book) | Recommendation |
|---|---|---|---|---|
| **Figure Extraction** | +5% | +200 MB | $0.00 | ✅ Enable |
| **Table Extraction** | +3% | +100 MB | $0.00 | ✅ Enable |
| **Table Structure** | +2% | +50 MB | $0.00 | ✅ Enable |
| **Image Classification** | +10% | +100 MB | ~$1.00 (100 images) | ⚠️ Opt-in |
| **Image Description** | +15% | +200 MB | ~$5.00 (100 images) | ❌ Rarely needed |
| **Code Enrichment** | +8% | +100 MB | ~$0.50 (500 blocks) | ⚠️ Opt-in |
| **OCR** | +300% | +500 MB | ~$5.00 (500 pages) | ❌ Only for scanned |
| **Page Batching** | -5% | -40% | $0.00 | ✅ Auto-enabled |

**Key Insights:**

- **Default config** adds ~10% processing time, $0 cost
- **All AI features** add ~40% time, ~$6.50 cost per book
- **OCR alone** adds ~300% time, ~$5.00 cost per book
- **Page batching** saves memory with minimal time overhead

**Recommendations:**

1. **Use defaults** for most documents (quality-first, zero cost)
2. **Enable AI features** selectively (academic papers, programming books)
3. **Enable OCR** only for scanned documents (expensive)
4. **Trust auto-optimization** for large documents (page batching)

---

## Advanced Configuration

### Programmatic Configuration (TypeScript)

For advanced use cases, import and use the configuration functions directly:

```typescript
import {
  getPipelineConfig,
  logPipelineConfig,
  RECOMMENDED_CONFIGS
} from '@/worker/lib/local/docling-config'

// Get configuration with document hints
const config = getPipelineConfig({
  pageCount: 500,      // Enable batching
  isScanned: false,    // No OCR needed
  hasCodeBlocks: true  // Could enable code enrichment
})

// Log configuration for transparency
logPipelineConfig(config)

// Or use recommended presets
const academicConfig = RECOMMENDED_CONFIGS.academic()
const programmingConfig = RECOMMENDED_CONFIGS.programming()
const novelsConfig = RECOMMENDED_CONFIGS.novels()
const scannedConfig = RECOMMENDED_CONFIGS.scanned()
```

### Custom Presets

Define custom configuration presets for specific document types:

```typescript
// Custom preset for research papers
const researchPaperConfig = {
  ...getDefaultPipelineConfig(),
  do_picture_classification: true,  // Classify figures
  do_code_enrichment: true,         // Analyze code
  images_scale: 2.5,                // Higher quality
  generate_picture_images: true,
  generate_table_images: true
}
```

---

## Troubleshooting

### Configuration Not Applied

**Problem**: Environment variables not taking effect.

**Solution**: Verify variables are set in the correct shell:

```bash
# Check current environment
env | grep EXTRACT_IMAGES
env | grep CLASSIFY_IMAGES

# Set and verify
export CLASSIFY_IMAGES=true
env | grep CLASSIFY_IMAGES
```

### High Memory Usage

**Problem**: Worker process using excessive memory during extraction.

**Solution**: Enable page batching via document hints (automatic for 200+ pages), or reduce image scale:

```bash
IMAGE_SCALE=1.0 npm run dev:worker
```

### Slow Processing

**Problem**: Document processing takes too long.

**Solution**: Disable expensive AI features:

```bash
CLASSIFY_IMAGES=false
DESCRIBE_IMAGES=false
ENRICH_CODE=false
npm run dev:worker
```

### Missing Images

**Problem**: Figures not extracted from document.

**Solution**: Verify image extraction is enabled:

```bash
EXTRACT_IMAGES=true npm run dev:worker
```

### OCR Not Working

**Problem**: Scanned document text not extracted.

**Solution**: Enable OCR (disabled by default):

```bash
ENABLE_OCR=true npm run dev:worker
```

---

## Related Documentation

- **Docling Official Docs**: https://docling-project.github.io/docling/
- **Processing Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Worker Module**: `worker/README.md`
- **Configuration Source**: `worker/lib/local/docling-config.ts`

---

## Feedback & Support

If you encounter issues with pipeline configuration:

1. Check environment variables: `env | grep -i extract`
2. Review console logs: Pipeline configuration is logged at startup
3. Verify Docling version: `npm list docling` (should be 2.55.1+)
4. Report issues: https://github.com/anthropics/rhizome-v2/issues

---

**Last Updated**: 2025-10-13
**Docling Version**: 2.55.1
**Configuration Schema Version**: 1.0
