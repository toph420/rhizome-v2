# Docling Library Research - Production Implementation Guide

**Library**: Docling (Python-based document processing)
**Version**: Latest (1.x+, actively maintained)
**Documentation**: https://docling-project.github.io/docling/
**GitHub**: https://github.com/docling-project/docling
**License**: MIT

---

## Executive Summary

Docling is an AI-powered document processing library from IBM Research that converts PDFs, DOCX, PPTX, and other formats into clean markdown with advanced table extraction, OCR support, and automatic header/footer removal.

**Key Strengths:**
- Advanced table structure recognition (TableFormer models)
- Automatic header/footer/page number removal
- GPU acceleration support (significant speedup)
- Clean markdown output optimized for RAG/LLM workflows
- Active development and enterprise backing

**Key Limitations:**
- Python-only (requires child_process integration for Node.js)
- Slower than PyMuPDF for basic text (but higher quality)
- Memory-intensive for large PDFs (>500 pages)
- GPU required for best performance (10-25x speedup)

**Performance Targets:**
- **CPU (x86)**: ~3.1 seconds/page (median)
- **CPU (M3 Max)**: ~1.27 seconds/page (median)
- **GPU (L4)**: ~0.114 seconds/page (median)
- **Typical throughput**: 0.77 pages/second (50-page documents, CPU)
- **Production range**: 5-10 pages/second (complex documents, GPU)

**Cost/Complexity Trade-off:**
- More complex than PyMuPDF but significantly better quality
- Ideal for documents where table structure and layout matter
- May be overkill for simple text-only PDFs

---

## Installation & Setup

### System Requirements

**Python Version**: 3.9+ (3.10+ recommended)
**Operating Systems**: macOS, Linux, Windows (x86_64, arm64)
**Memory**: Minimum 8GB RAM, 16GB+ recommended for large PDFs
**GPU (Optional)**: NVIDIA GPU with CUDA support (10-25x speedup)

### Basic Installation

```bash
# Basic installation
pip install docling

# With all optional dependencies
pip install "docling[all]"

# Prefetch models (recommended for production)
docling-tools models download

# Set custom model cache location
export DOCLING_ARTIFACTS_PATH="/path/to/models"
```

### Docker Installation (Recommended for Production)

```bash
# Pull official image
docker pull docling/docling:latest

# Run with volume mounts
docker run -v /path/to/docs:/input -v /path/to/output:/output \
  docling/docling convert /input/document.pdf --output /output
```

---

## Core API Usage

### Basic Conversion Workflow

```python
from docling.document_converter import DocumentConverter

# Initialize converter (loads models on first use)
converter = DocumentConverter()

# Convert single document
result = converter.convert("document.pdf")

# Export to markdown
markdown = result.document.export_to_markdown()

# Save to file
with open("output.md", "w") as f:
    f.write(markdown)

# Access conversion metadata
print(f"Pages: {result.pages}")
print(f"Conversion time: {result.timing.total_seconds}s")
print(f"Success: {result.status}")
```

### Batch Processing

```python
from pathlib import Path
from docling.document_converter import DocumentConverter

converter = DocumentConverter()

# Process directory
pdf_files = Path("./documents").glob("*.pdf")

for pdf_file in pdf_files:
    try:
        result = converter.convert(str(pdf_file))

        # Export markdown
        output_path = pdf_file.with_suffix('.md')
        markdown = result.document.export_to_markdown()
        output_path.write_text(markdown)

        print(f"✓ Converted: {pdf_file.name}")
    except Exception as e:
        print(f"✗ Failed: {pdf_file.name} - {e}")
```

### Advanced Configuration

```python
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    TableStructureOptions,
    TableFormerMode,
    EasyOcrOptions,
    AcceleratorOptions,
    AcceleratorDevice
)

# Configure pipeline options
pipeline_options = PdfPipelineOptions()

# Table extraction settings
pipeline_options.do_table_structure = True
pipeline_options.table_structure_options = TableStructureOptions(
    do_cell_matching=True,  # Match cells to PDF structure
    mode=TableFormerMode.ACCURATE  # FAST or ACCURATE
)

# OCR configuration
pipeline_options.do_ocr = True
pipeline_options.ocr_options = EasyOcrOptions(
    lang=["en"],  # Language codes
    force_full_page_ocr=False  # Only OCR when needed
)

# GPU acceleration
pipeline_options.accelerator_options = AcceleratorOptions(
    num_threads=4,
    device=AcceleratorDevice.AUTO  # AUTO, CPU, CUDA, MPS
)

# Performance limits
pipeline_options.images_scale = 1.0  # Scale down images (0.5 = 50%)
pipeline_options.generate_page_images = True  # Generate page images
pipeline_options.generate_picture_images = True  # Extract pictures

# Create converter with options
converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

# Convert with configuration
result = converter.convert("document.pdf")
```

---

## Configuration Deep Dive

### Performance Tuning

```python
from docling.datamodel.pipeline_options import PdfPipelineOptions

# Fast mode (sacrifice accuracy for speed)
fast_options = PdfPipelineOptions()
fast_options.do_ocr = False  # ~60% speedup
fast_options.do_table_structure = False  # ~16-24% speedup
fast_options.images_scale = 0.5  # 50% image size
fast_options.generate_page_images = False

# Accurate mode (best quality, slowest)
accurate_options = PdfPipelineOptions()
accurate_options.do_ocr = True
accurate_options.ocr_options.force_full_page_ocr = True
accurate_options.table_structure_options.mode = TableFormerMode.ACCURATE
accurate_options.table_structure_options.do_cell_matching = True

# Balanced mode (recommended for production)
balanced_options = PdfPipelineOptions()
balanced_options.do_ocr = True  # Enable OCR but only when needed
balanced_options.do_table_structure = True
balanced_options.table_structure_options.mode = TableFormerMode.FAST
balanced_options.accelerator_options.device = AcceleratorDevice.AUTO
```

### Page Range Processing

```python
# Process specific page ranges (useful for chunking large PDFs)
from docling.datamodel.pipeline_options import PdfPipelineOptions

options = PdfPipelineOptions()
options.page_range = (0, 50)  # Pages 0-49 (0-indexed)

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=options)
    }
)

# Process in chunks
def process_large_pdf(pdf_path, chunk_size=50):
    results = []
    total_pages = get_pdf_page_count(pdf_path)  # Implement this

    for start in range(0, total_pages, chunk_size):
        end = min(start + chunk_size, total_pages)

        options = PdfPipelineOptions()
        options.page_range = (start, end)

        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=options)
            }
        )

        result = converter.convert(pdf_path)
        results.append(result)

    return results
```

### Multi-Format Support

```python
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat

# Configure for multiple formats
converter = DocumentConverter(
    allowed_formats=[
        InputFormat.PDF,
        InputFormat.DOCX,
        InputFormat.PPTX,
        InputFormat.HTML,
        InputFormat.IMAGE
    ]
)

# Auto-detect format and convert
result = converter.convert("document.docx")
result = converter.convert("presentation.pptx")
result = converter.convert("image.png")  # OCR applied
```

---

## Advanced Features

### Metadata Extraction

```python
result = converter.convert("document.pdf")
doc = result.document

# Document metadata
print(f"Title: {doc.metadata.title}")
print(f"Author: {doc.metadata.author}")
print(f"Created: {doc.metadata.created}")
print(f"Pages: {doc.metadata.pages}")

# Content structure
for element in doc.elements:
    print(f"Type: {element.type}")  # heading, paragraph, table, etc.
    print(f"Text: {element.text}")
    print(f"Bbox: {element.bbox}")  # Bounding box coordinates
```

### Table Export

```python
from docling.document_converter import DocumentConverter

result = converter.convert("document.pdf")

# Export tables separately
tables = result.document.tables

for i, table in enumerate(tables):
    # Export as markdown
    table_md = table.export_to_markdown()

    # Export as HTML (better structure preservation)
    table_html = table.export_to_html()

    # Export as DataFrame
    df = table.export_to_dataframe()

    # Save
    with open(f"table_{i}.md", "w") as f:
        f.write(table_md)
```

### Error Handling & Recovery

```python
from docling.document_converter import DocumentConverter
from docling.exceptions import ConversionError, TimeoutError

converter = DocumentConverter()

try:
    result = converter.convert("document.pdf")

    # Check conversion status
    if result.status != "success":
        print(f"Warning: Conversion status is {result.status}")
        print(f"Errors: {result.errors}")

    # Check for partial success
    if result.pages != result.document.metadata.pages:
        print(f"Warning: Only {result.pages} of {result.document.metadata.pages} pages converted")

    markdown = result.document.export_to_markdown()

except ConversionError as e:
    print(f"Conversion failed: {e}")
    # Implement fallback or retry logic

except TimeoutError as e:
    print(f"Conversion timed out: {e}")
    # Try with reduced quality settings

except Exception as e:
    print(f"Unexpected error: {e}")
```

---

## Node.js/TypeScript Integration

### Option 1: TypeScript SDK (Recommended)

**Best for**: Production applications, type safety, clean API

```typescript
import { Docling } from "docling-sdk";

// Requires docling-serve running (separate service)
const client = new Docling({
  api: {
    baseUrl: process.env.DOCLING_URL || "http://localhost:5001"
  }
});

// Synchronous conversion
async function convertPdf(buffer: Buffer, filename: string) {
  try {
    const result = await client.convertFile({
      files: buffer,
      filename: filename,
      to_formats: ["md"]
    });

    return result.document.md_content;
  } catch (error) {
    console.error("Conversion failed:", error.message);
    throw error;
  }
}

// Async conversion with progress tracking
async function convertPdfAsync(buffer: Buffer, filename: string) {
  const task = await client.convertFileAsync({
    files: buffer,
    filename: filename,
    to_formats: ["md"]
  });

  // Poll for completion
  await task.waitForCompletion();

  // Get result
  const result = await client.getTaskResultFile(task.taskId);
  return result.document.md_content;
}

// Streaming conversion (for large files)
async function convertPdfStream(
  buffer: Buffer,
  filename: string,
  outputPath: string
) {
  const writeStream = createWriteStream(outputPath);

  await client.convertToStream(
    buffer,
    filename,
    writeStream,
    { to_formats: ["md"] }
  );
}
```

**Installation:**
```bash
npm install docling-sdk

# Requires separate docling-serve service
docker run -p 5001:5001 docling/docling-serve
```

### Option 2: Direct Python Integration via child_process

**Best for**: Simple integration, no separate service, direct control

```typescript
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

interface DoclingOptions {
  doOcr?: boolean;
  doTableStructure?: boolean;
  tableMode?: 'fast' | 'accurate';
  ocrLang?: string[];
  pageRange?: [number, number];
}

async function convertPdfWithDocling(
  pdfPath: string,
  outputPath: string,
  options: DoclingOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create Python script arguments
    const args = [
      '-u',  // Unbuffered output (critical for real-time progress)
      path.join(__dirname, 'docling_wrapper.py'),
      pdfPath,
      outputPath,
      '--json-output',  // Output JSON for progress tracking
    ];

    // Add optional arguments
    if (options.doOcr !== undefined) {
      args.push('--do-ocr', String(options.doOcr));
    }
    if (options.doTableStructure !== undefined) {
      args.push('--do-table-structure', String(options.doTableStructure));
    }
    if (options.tableMode) {
      args.push('--table-mode', options.tableMode);
    }
    if (options.ocrLang) {
      args.push('--ocr-lang', options.ocrLang.join(','));
    }
    if (options.pageRange) {
      args.push('--page-range', `${options.pageRange[0]}-${options.pageRange[1]}`);
    }

    const python = spawn('python3', args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',  // Additional unbuffered setting
      },
    });

    let stdout = '';
    let stderr = '';

    // Stream stdout for progress tracking
    python.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;

      // Parse JSON progress updates
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('{')) {
          try {
            const progress = JSON.parse(line);
            if (progress.type === 'progress') {
              console.log(`Progress: ${progress.current}/${progress.total} pages`);
            }
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      }
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Docling process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        // Read converted markdown
        const markdown = await fs.readFile(outputPath, 'utf-8');
        resolve(markdown);
      } catch (error) {
        reject(error);
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to start Python process: ${error.message}`));
    });

    // Set timeout (important for large PDFs)
    const timeout = setTimeout(() => {
      python.kill();
      reject(new Error('Conversion timed out'));
    }, 10 * 60 * 1000); // 10 minutes

    python.on('close', () => clearTimeout(timeout));
  });
}

// Usage
async function example() {
  try {
    const markdown = await convertPdfWithDocling(
      '/path/to/document.pdf',
      '/path/to/output.md',
      {
        doOcr: true,
        doTableStructure: true,
        tableMode: 'accurate',
        ocrLang: ['en'],
      }
    );

    console.log('Conversion successful');
    console.log(`Markdown length: ${markdown.length} characters`);
  } catch (error) {
    console.error('Conversion failed:', error);
  }
}
```

### Python Wrapper Script (docling_wrapper.py)

```python
#!/usr/bin/env python3
"""
Docling wrapper for Node.js integration.
Outputs JSON progress updates for real-time tracking.
"""

import sys
import json
import argparse
from pathlib import Path
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import (
    PdfPipelineOptions,
    TableStructureOptions,
    TableFormerMode,
    EasyOcrOptions,
)

def log_progress(current, total, message=""):
    """Output JSON progress for Node.js to parse."""
    progress = {
        "type": "progress",
        "current": current,
        "total": total,
        "message": message
    }
    print(json.dumps(progress), flush=True)

def main():
    parser = argparse.ArgumentParser(description='Convert PDF with Docling')
    parser.add_argument('input_path', help='Path to input PDF')
    parser.add_argument('output_path', help='Path to output markdown')
    parser.add_argument('--json-output', action='store_true', help='Output JSON progress')
    parser.add_argument('--do-ocr', type=bool, default=True)
    parser.add_argument('--do-table-structure', type=bool, default=True)
    parser.add_argument('--table-mode', choices=['fast', 'accurate'], default='accurate')
    parser.add_argument('--ocr-lang', default='en')
    parser.add_argument('--page-range', help='Page range (e.g., 0-50)')

    args = parser.parse_args()

    # Parse page range
    page_range = None
    if args.page_range:
        start, end = map(int, args.page_range.split('-'))
        page_range = (start, end)

    # Configure pipeline
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = args.do_ocr
    pipeline_options.do_table_structure = args.do_table_structure

    if args.do_table_structure:
        pipeline_options.table_structure_options = TableStructureOptions(
            do_cell_matching=True,
            mode=TableFormerMode.ACCURATE if args.table_mode == 'accurate' else TableFormerMode.FAST
        )

    if args.do_ocr:
        ocr_langs = args.ocr_lang.split(',')
        pipeline_options.ocr_options = EasyOcrOptions(lang=ocr_langs)

    if page_range:
        pipeline_options.page_range = page_range

    # Create converter
    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )

    try:
        # Convert
        if args.json_output:
            log_progress(0, 100, "Starting conversion")

        result = converter.convert(args.input_path)

        if args.json_output:
            log_progress(50, 100, "Conversion complete, exporting markdown")

        # Export markdown
        markdown = result.document.export_to_markdown()

        # Save to file
        Path(args.output_path).write_text(markdown, encoding='utf-8')

        if args.json_output:
            log_progress(100, 100, "Export complete")

            # Output final result
            result_json = {
                "type": "result",
                "success": True,
                "pages": result.pages,
                "output_path": args.output_path,
                "conversion_time": result.timing.total_seconds if hasattr(result, 'timing') else None
            }
            print(json.dumps(result_json), flush=True)

        sys.exit(0)

    except Exception as e:
        if args.json_output:
            error_json = {
                "type": "error",
                "success": False,
                "error": str(e)
            }
            print(json.dumps(error_json), flush=True)
        else:
            print(f"Error: {e}", file=sys.stderr)

        sys.exit(1)

if __name__ == '__main__':
    main()
```

### Integration Pattern for Rhizome Worker

```typescript
// worker/processors/docling-processor.ts
import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export async function processWithDocling(
  pdfBuffer: Buffer,
  documentId: string
): Promise<string> {
  // Create temp files
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docling-'));
  const inputPath = path.join(tempDir, 'input.pdf');
  const outputPath = path.join(tempDir, 'output.md');

  try {
    // Write PDF to temp file
    await fs.writeFile(inputPath, pdfBuffer);

    // Run Docling conversion
    const markdown = await convertPdfWithDocling(inputPath, outputPath, {
      doOcr: true,
      doTableStructure: true,
      tableMode: 'accurate',
      ocrLang: ['en'],
    });

    return markdown;
  } finally {
    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
```

---

## Production Considerations

### Performance Benchmarks

**Hardware Configurations:**
- **AWS EC2 (g6.2xlarge)**: 8 vCPU, 32GB RAM, Nvidia L4 GPU (24GB VRAM)
- **MacBook Pro M3 Max**: 14 cores, 36GB RAM
- **Low-resource (t3.large)**: 2 vCPU, 8GB RAM

**Processing Speed:**
| Configuration | Pages/Second | Notes |
|---------------|--------------|-------|
| x86 CPU (8 core) | ~0.32 | Median 3.1s/page |
| M3 Max SoC | ~0.79 | Median 1.27s/page |
| Nvidia L4 GPU | ~8.77 | Median 0.114s/page (25x speedup) |
| Production (complex docs) | 5-10 | With GPU, optimized settings |

**Memory Usage:**
- **Small PDFs (<50 pages)**: 1-2GB RAM
- **Medium PDFs (100-200 pages)**: 2-4GB RAM
- **Large PDFs (500+ pages)**: 4-8GB RAM
- **Peak during table extraction**: +50% memory usage

**Model Download Sizes:**
- **Layout model**: ~100MB
- **TableFormer (accurate)**: ~250MB
- **TableFormer (fast)**: ~150MB
- **OCR models**: ~50MB per language
- **Total (all models)**: ~500-700MB

### Timeout Handling

```typescript
// Recommended timeouts based on document size
function getRecommendedTimeout(pages: number): number {
  if (pages < 10) return 2 * 60 * 1000;      // 2 minutes
  if (pages < 50) return 5 * 60 * 1000;      // 5 minutes
  if (pages < 200) return 15 * 60 * 1000;    // 15 minutes
  return 30 * 60 * 1000;                      // 30 minutes
}

// Implementation with timeout
async function convertWithTimeout(
  pdfPath: string,
  outputPath: string,
  timeoutMs: number
): Promise<string> {
  return Promise.race([
    convertPdfWithDocling(pdfPath, outputPath),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    ),
  ]);
}
```

### Error Recovery Strategies

```typescript
// Retry with degraded quality on failure
async function convertWithFallback(
  pdfPath: string,
  outputPath: string
): Promise<string> {
  const strategies = [
    // Strategy 1: Full quality
    {
      doOcr: true,
      doTableStructure: true,
      tableMode: 'accurate' as const,
    },
    // Strategy 2: Fast mode
    {
      doOcr: true,
      doTableStructure: true,
      tableMode: 'fast' as const,
    },
    // Strategy 3: No table extraction
    {
      doOcr: true,
      doTableStructure: false,
    },
    // Strategy 4: Minimal (fastest)
    {
      doOcr: false,
      doTableStructure: false,
    },
  ];

  for (const [index, options] of strategies.entries()) {
    try {
      console.log(`Attempting conversion strategy ${index + 1}/${strategies.length}`);
      return await convertPdfWithDocling(pdfPath, outputPath, options);
    } catch (error) {
      console.error(`Strategy ${index + 1} failed:`, error);
      if (index === strategies.length - 1) {
        throw error; // All strategies failed
      }
    }
  }

  throw new Error('All conversion strategies failed');
}
```

### Memory Management

```python
# For processing large PDFs, use chunking
def process_large_pdf_chunked(pdf_path, output_dir, chunk_size=50):
    """Process large PDF in chunks to manage memory."""
    import gc
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)

    markdown_parts = []

    for start_page in range(0, total_pages, chunk_size):
        end_page = min(start_page + chunk_size, total_pages)

        # Create temporary chunk PDF
        writer = PdfWriter()
        for page_num in range(start_page, end_page):
            writer.add_page(reader.pages[page_num])

        chunk_path = f"/tmp/chunk_{start_page}_{end_page}.pdf"
        with open(chunk_path, 'wb') as f:
            writer.write(f)

        # Process chunk
        options = PdfPipelineOptions()
        converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=options)
            }
        )

        result = converter.convert(chunk_path)
        markdown = result.document.export_to_markdown()
        markdown_parts.append(markdown)

        # Cleanup
        os.remove(chunk_path)
        del converter
        gc.collect()  # Force garbage collection

    # Combine all markdown parts
    return "\n\n---\n\n".join(markdown_parts)
```

### Known Limitations & Edge Cases

**1. Complex Table Structures:**
- May not preserve exact layout for nested tables
- Multi-page tables can have boundary issues
- Merged cells sometimes lose span information

**Mitigation:**
```python
# Use HTML export for better table fidelity
table_html = result.document.tables[0].export_to_html()

# Or work with raw structure
for row in result.document.tables[0].rows:
    for cell in row.cells:
        print(f"Cell ({cell.row_span}x{cell.col_span}): {cell.text}")
```

**2. Scanned PDFs (Image-only):**
- OCR accuracy depends on image quality
- Slower processing (OCR is most expensive operation)
- May miss text in complex layouts

**Mitigation:**
```python
# Force full-page OCR for scanned documents
pipeline_options.ocr_options.force_full_page_ocr = True

# Or check if document is scanned first
def is_scanned_pdf(pdf_path):
    # Implement detection logic
    pass

if is_scanned_pdf(pdf_path):
    # Use OCR-optimized settings
    pass
```

**3. Memory Leaks (docling-serve):**
- Known issue with long-running docling-serve instances
- Memory usage grows over time

**Mitigation:**
```bash
# Restart service periodically
# Use container orchestration with health checks
# Monitor memory usage and restart when threshold exceeded
```

**4. Timeout Issues:**
- Hard timeout around 250 seconds in some configurations
- May not respect DOCLING_SERVE_MAX_SYNC_WAIT setting

**Mitigation:**
```python
# Use async mode for large documents
# Or process in smaller chunks
```

---

## Output Quality

### Markdown Structure Preservation

**What Docling Does Well:**
- ✅ Preserves heading hierarchy
- ✅ Maintains list structures (ordered/unordered)
- ✅ Extracts tables with column alignment
- ✅ Removes headers/footers/page numbers automatically
- ✅ Preserves reading order (even for multi-column layouts)
- ✅ Handles inline formatting (bold, italic, code)

**What Docling Struggles With:**
- ❌ Complex nested tables (flattened)
- ❌ Embedded charts/graphs (extracted as images, not recreated)
- ❌ Mathematical equations (basic LaTeX, not perfect)
- ❌ Footnotes (may be separated from context)
- ❌ Sidebars/callout boxes (integrated into main flow)

**Example Output Quality:**

```markdown
# Document Title

This is the main content with **bold** and _italic_ text.

## Section with Table

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

- List item 1
- List item 2
  - Nested item 2.1
  - Nested item 2.2

### Subsection

More content here.
```

### Table Handling

**Best Practices:**
```python
# Get tables with structure metadata
for table in result.document.tables:
    # Check table quality score (if available)
    if hasattr(table, 'confidence'):
        print(f"Table confidence: {table.confidence}")

    # Export to multiple formats for comparison
    md = table.export_to_markdown()
    html = table.export_to_html()  # Better structure preservation
    df = table.export_to_dataframe()  # For data analysis

    # Use HTML for complex tables
    if table.num_rows > 20 or table.num_cols > 10:
        use_html_export(html)
    else:
        use_markdown_export(md)
```

### Image Extraction

```python
# Configure image extraction
pipeline_options.generate_picture_images = True

result = converter.convert("document.pdf")

# Access extracted images
for image in result.document.images:
    print(f"Image: {image.path}")
    print(f"Caption: {image.caption}")
    print(f"Page: {image.page}")

    # Images saved to temporary directory
    # Copy to permanent storage if needed
```

---

## Production Deployment Checklist

### Pre-deployment

- [ ] Models downloaded and cached (`docling-tools models download`)
- [ ] Environment variable `DOCLING_ARTIFACTS_PATH` set to persistent storage
- [ ] Python version 3.10+ installed
- [ ] GPU drivers installed (if using GPU acceleration)
- [ ] Memory requirements validated (8GB minimum, 16GB+ recommended)
- [ ] Disk space for model cache (~1GB) and temporary files

### Configuration

- [ ] Timeout values tuned for expected document sizes
- [ ] Retry strategies implemented (with degraded quality fallback)
- [ ] Memory limits configured (container/process level)
- [ ] Logging configured for progress tracking
- [ ] Error reporting integrated (Sentry, CloudWatch, etc.)

### Monitoring

- [ ] Memory usage tracking (alert on >80% usage)
- [ ] Processing time metrics (p50, p95, p99)
- [ ] Success/failure rates
- [ ] Queue depth (if using background jobs)
- [ ] Model load times (first conversion vs subsequent)

### Testing

- [ ] Test with representative document samples
- [ ] Validate table extraction quality
- [ ] Verify header/footer removal
- [ ] Check OCR accuracy (if applicable)
- [ ] Load testing with concurrent requests
- [ ] Failover testing (simulated crashes)

### Operational

- [ ] Health check endpoint configured
- [ ] Graceful shutdown handling
- [ ] Temporary file cleanup scheduled
- [ ] Log rotation configured
- [ ] Backup/restore procedures for model cache

---

## Common Pitfalls

### 1. Python Output Buffering
**Problem**: Progress updates don't appear in real-time when using child_process.

**Solution**:
```typescript
// Always use -u flag and PYTHONUNBUFFERED
const python = spawn('python3', ['-u', 'script.py'], {
  env: { ...process.env, PYTHONUNBUFFERED: '1' }
});
```

```python
# In Python, flush after every print
print(json.dumps(progress), flush=True)
```

### 2. Model Download on First Run
**Problem**: First conversion is extremely slow (downloading models).

**Solution**:
```bash
# Pre-download in Docker build or deployment script
docling-tools models download
```

### 3. Memory Exhaustion on Large PDFs
**Problem**: Process killed (OOM) when processing 500+ page PDFs.

**Solution**:
```python
# Process in chunks, force garbage collection
import gc

for chunk in chunks:
    process_chunk(chunk)
    gc.collect()
```

### 4. Timeout Not Respected
**Problem**: Conversion times out at ~250s regardless of configured timeout.

**Solution**:
```typescript
// Implement your own timeout wrapper
Promise.race([
  convertPdfWithDocling(path),
  timeout(600000)  // 10 minutes
])
```

### 5. Table Structure Lost in Export
**Problem**: Complex tables flattened or misaligned in markdown.

**Solution**:
```python
# Use HTML export for tables
table_html = table.export_to_html()

# Or access raw structure
for row in table.rows:
    for cell in row.cells:
        # Process cell with row_span, col_span metadata
        pass
```

---

## Comparison to Alternatives

| Feature | Docling | PyMuPDF | Unstructured | LlamaParse |
|---------|---------|---------|--------------|------------|
| **Speed** | Medium (0.8-10 pps) | Fast (50+ pps) | Slow (0.3 pps) | Slow (API) |
| **Table Quality** | Excellent | Poor | Good | Excellent |
| **OCR Support** | Yes (EasyOCR) | Limited | Yes (Tesseract) | Yes |
| **Header/Footer Removal** | Automatic | Manual | Partial | Automatic |
| **GPU Acceleration** | Yes (25x speedup) | No | No | Cloud |
| **Cost** | Free | Free | Free | $3/1000 pages |
| **Ease of Setup** | Medium | Easy | Medium | Easy |
| **Production Ready** | Yes | Yes | Yes | Yes |

**Recommendation:**
- **Simple text extraction**: PyMuPDF (fastest, simplest)
- **Complex documents with tables**: Docling (best quality)
- **Cloud/managed service**: LlamaParse (easiest, costs money)
- **Maximum control**: Unstructured (most flexible, slowest)

---

## Integration Summary for Rhizome

**Recommended Approach**: Direct Python integration via child_process

**Why:**
- No additional service to manage (docling-serve not needed)
- Full control over configuration and error handling
- Streaming progress updates for long-running conversions
- Can implement chunked processing for large PDFs
- Works with existing worker architecture

**Implementation Steps:**
1. Create `docling_wrapper.py` in worker/lib/
2. Create TypeScript processor in worker/processors/docling-processor.ts
3. Add Docling to router in worker/processors/router.ts
4. Update PDF processing to use Docling instead of Gemini for extraction
5. Implement retry logic with quality degradation
6. Add progress tracking and timeout handling
7. Test with representative documents (technical papers, books with tables)

**Cost Comparison:**
- **Gemini**: $0.50 per 500-page book (65k token limit, batching required)
- **Docling**: Free (self-hosted, GPU recommended)

**Quality Comparison:**
- **Gemini**: Good general-purpose extraction
- **Docling**: Superior table structure, better layout preservation

**Speed Comparison:**
- **Gemini**: ~30 seconds for 100 pages (after batching)
- **Docling (CPU)**: ~5 minutes for 100 pages
- **Docling (GPU)**: ~15 seconds for 100 pages

**Verdict**: Docling is ideal for Rhizome if:
- Documents contain complex tables (academic papers, textbooks)
- GPU acceleration available (cheap on cloud)
- Self-hosting preferred over API costs
- Processing time <30 minutes acceptable

---

## Next Steps

**For Immediate Integration:**
1. Set up local Docling environment
2. Test with sample PDFs from your use case
3. Benchmark processing time and quality
4. Compare with current Gemini extraction
5. Implement TypeScript wrapper
6. Add to worker module

**For Production:**
1. Containerize Docling (Dockerfile)
2. Set up GPU-enabled container orchestration
3. Implement monitoring and alerting
4. Add cost tracking (compute hours)
5. Document operational runbook
6. Train team on Docling limitations

**Resources:**
- Official docs: https://docling-project.github.io/docling/
- GitHub: https://github.com/docling-project/docling
- Examples: https://docling-project.github.io/docling/examples/
- Technical report: https://arxiv.org/html/2408.09869v4
