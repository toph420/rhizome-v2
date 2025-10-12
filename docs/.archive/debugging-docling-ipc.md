# Debugging Docling IPC Issues

## Problem Description

Error: "Docling script completed but returned no result"

This means:
- Python script exits with code 0 (success)
- But TypeScript wrapper never receives the final JSON result
- IPC (Inter-Process Communication) is broken

## Root Cause Analysis

The issue occurs when:
1. Python outputs JSON but doesn't flush stdout
2. JSON parsing fails in TypeScript wrapper
3. Python script crashes before outputting final result
4. Environment issues (Python version, dependencies)

## Diagnostic Steps

### Step 1: Test Python Script Directly

This verifies the Python script works in isolation:

```bash
# Navigate to project root
cd /Users/topher/Code/rhizome-v2

# Test with a small PDF (replace with your test PDF)
python3 worker/scripts/docling_extract.py "/path/to/test.pdf" '{"enable_chunking": true, "chunk_size": 512, "tokenizer": "Xenova/all-mpnet-base-v2"}'
```

**Expected Output:**
```json
{"type": "progress", "stage": "extraction", "percent": 5, "message": "Initializing Docling converter"}
{"type": "progress", "stage": "extraction", "percent": 10, "message": "Converting PDF with Docling"}
{"type": "progress", "stage": "extraction", "percent": 40, "message": "Extraction complete (5 pages)"}
{"type": "progress", "stage": "extraction", "percent": 50, "message": "Extracting document structure"}
{"type": "progress", "stage": "chunking", "percent": 60, "message": "Running HybridChunker"}
{"type": "progress", "stage": "chunking", "percent": 90, "message": "Chunked into 42 segments"}
{"type": "result", "data": {"markdown": "...", "structure": {...}, "chunks": [...]}}
```

**What to check:**
- ✅ Last line should be `{"type": "result", ...}`
- ✅ All progress messages should have `{"type": "progress", ...}`
- ✅ No Python errors in stderr
- ❌ If last line is missing, Python script is not outputting final result

### Step 2: Check Python Dependencies

```bash
# Check Python version (must be 3.10+)
python3 --version

# Verify Docling is installed
python3 -c "import docling; print(f'Docling version: {docling.__version__}')"

# Verify HybridChunker is available
python3 -c "from docling.chunking import HybridChunker; print('HybridChunker: OK')"

# Check tokenizers library
python3 -c "import tokenizers; print(f'Tokenizers: OK')"
```

**If any import fails:**
```bash
cd worker
pip install docling==2.55.1
pip install 'pydantic-ai[ollama]'
pip install sentence-transformers
pip install transformers
```

### Step 3: Use Diagnostic Test Scripts

I've created two test scripts for you:

**A. Test Python script directly (with visual output):**
```bash
./worker/scripts/test-docling-direct.sh /path/to/test.pdf
```

**B. Test TypeScript wrapper (mimics PDF processor):**
```bash
npx tsx worker/scripts/test-docling-wrapper.ts /path/to/test.pdf
```

### Step 4: Check for Common Issues

#### Issue 1: Missing `sys.stdout.flush()`

**Symptom:** Python script hangs or TypeScript sees no output

**Check:** Look for flush after every `sys.stdout.write()` in `docling_extract.py`

Lines to verify:
- Line 38: `sys.stdout.flush()`  (after progress)
- Line 254: `sys.stdout.flush()`  (after error)
- Line 269: `sys.stdout.flush()`  (after error)
- Line 285: `sys.stdout.flush()`  (after final result)
- Line 297: `sys.stdout.flush()`  (after exception)

#### Issue 2: Python Buffering

**Symptom:** Output appears only after script exits

**Fix:** Ensure Python runs with unbuffered mode:

In TypeScript wrapper (`docling-extractor.ts:211-219`):
```typescript
const python = spawn(pythonPath, [
  '-u',  // Unbuffered - CRITICAL
  scriptPath,
  pdfPath,
  JSON.stringify(options)
], {
  env: { ...process.env, PYTHONUNBUFFERED: '1' },  // Force unbuffered
  stdio: ['ignore', 'pipe', 'pipe']
})
```

#### Issue 3: JSON Parsing Errors

**Symptom:** Python outputs JSON but TypeScript can't parse it

**Debug:** Add logging to TypeScript wrapper:

```typescript
// In docling-extractor.ts around line 232
python.stdout.on('data', (data: Buffer) => {
  const rawData = data.toString()
  console.log('[DEBUG] Raw stdout:', rawData)  // ADD THIS

  const lines = rawData.split('\n').filter(line => line.trim())

  for (const line of lines) {
    console.log('[DEBUG] Parsing line:', line)  // ADD THIS
    try {
      const message = JSON.parse(line)
      console.log('[DEBUG] Parsed message:', message.type)  // ADD THIS
      // ... rest of code
```

#### Issue 4: Python Script Crashes

**Symptom:** stderr has Python traceback

**Check stderr output:**
```bash
python3 worker/scripts/docling_extract.py "/path/to/test.pdf" '{"enable_chunking": true}' 2>&1 | tee output.log
```

Look for:
- `ImportError`: Missing dependency
- `FileNotFoundError`: PDF not found or script path wrong
- `JSONDecodeError`: Invalid options JSON
- `MemoryError`: PDF too large, reduce `maxPages`

#### Issue 5: Tokenizer Not Found

**Symptom:** HybridChunker fails with tokenizer error

**Fix:**
```bash
# Download tokenizer model
python3 -c "from transformers import AutoTokenizer; AutoTokenizer.from_pretrained('Xenova/all-mpnet-base-v2')"
```

### Step 5: Enable Debug Logging

**In your PDF processor** (`worker/processors/pdf-processor.ts`):

```typescript
const result = await extractWithDocling(pdfPath, {
  enableChunking: true,
  chunkSize: 512,
  tokenizer: 'Xenova/all-mpnet-base-v2',
  onProgress: (percent, stage, message) => {
    console.log(`[Docling] ${stage}: ${percent}% - ${message}`)
  }
})

// After extractWithDocling, add:
console.log('[DEBUG] Docling result:', {
  hasMarkdown: !!result.markdown,
  markdownLength: result.markdown?.length,
  hasStructure: !!result.structure,
  hasChunks: !!result.chunks,
  chunkCount: result.chunks?.length
})
```

## Quick Fixes

### Fix 1: Test with Minimal PDF

Create a tiny test PDF (1 page) to rule out size/complexity issues:

```bash
# Use a sample PDF from tests
npx tsx worker/scripts/test-docling-wrapper.ts tests/fixtures/sample.pdf
```

### Fix 2: Disable Chunking Temporarily

Test extraction without HybridChunker:

```typescript
const result = await extractWithDocling(pdfPath, {
  enableChunking: false  // Disable chunking
})
```

If this works, the issue is in HybridChunker, not the IPC layer.

### Fix 3: Increase Timeout

Large PDFs might exceed the default timeout:

```typescript
const result = await extractWithDocling(pdfPath, {
  enableChunking: true,
  timeout: 30 * 60 * 1000  // 30 minutes
})
```

### Fix 4: Check Python Path

Ensure correct Python is used:

```bash
# Check which Python
which python3

# Test with explicit path
export PYTHON_PATH=/usr/local/bin/python3
```

In TypeScript:
```typescript
const result = await extractWithDocling(pdfPath, {
  enableChunking: true,
  pythonPath: '/usr/local/bin/python3'
})
```

## Expected Behavior

When working correctly, you should see:

**Console output:**
```
[Docling] Starting extraction...
  PDF: /path/to/document.pdf
  Mode: LOCAL (with chunking)
  Options: {"enable_chunking":true,"chunk_size":512,...}
[Progress] extraction: 5% - Initializing Docling converter
[Progress] extraction: 10% - Converting PDF with Docling
[Progress] extraction: 40% - Extraction complete (42 pages)
[Progress] extraction: 50% - Extracting document structure
[Progress] chunking: 60% - Running HybridChunker
[Progress] chunking: 90% - Chunked into 156 segments
[Docling] Extraction complete
  Structure: 42 pages, 23 headings
  Chunks: 156 segments
  Markdown size: 234KB
```

**Result object:**
```typescript
{
  markdown: "# Document Title\n\n...",
  structure: {
    total_pages: 42,
    headings: [
      { level: 1, text: "Chapter 1", page: 1 },
      // ...
    ],
    sections: []
  },
  chunks: [
    {
      index: 0,
      content: "...",
      meta: {
        page_start: 1,
        page_end: 1,
        heading_path: ["Chapter 1", "Section 1.1"],
        heading_level: 2,
        bboxes: [{ page: 1, l: 72, t: 100, r: 540, b: 150 }]
      }
    },
    // ... 155 more chunks
  ]
}
```

## Still Not Working?

If diagnostics don't reveal the issue, collect this info:

```bash
# System info
uname -a
python3 --version
node --version

# Python dependencies
pip list | grep -E "docling|pydantic|transformers"

# Run wrapper with debug
DEBUG=* npx tsx worker/scripts/test-docling-wrapper.ts /path/to/test.pdf 2>&1 | tee debug.log
```

Then check:
1. Is `{"type": "result", ...}` in the output?
2. Is there a Python traceback in stderr?
3. Does the script hang or exit immediately?
4. Is the PDF corrupted or password-protected?

## Advanced Debugging

### Intercept Python stdout

Create a wrapper script that logs everything:

```bash
#!/bin/bash
# wrapper.sh
echo "===== PYTHON STARTING =====" >&2
python3 "$@" 2>&1 | tee -a python-output.log
echo "===== PYTHON EXITED: $? =====" >&2
```

Use it:
```typescript
const result = await extractWithDocling(pdfPath, {
  pythonPath: './wrapper.sh'
})
```

### Minimal Reproduction

Create the simplest possible test case:

```python
# test-minimal.py
import sys
import json

sys.stdout.write(json.dumps({'type': 'result', 'data': {'test': 'ok'}}) + '\n')
sys.stdout.flush()
sys.exit(0)
```

Test:
```typescript
const { spawn } = require('child_process')
const python = spawn('python3', ['test-minimal.py'])
python.stdout.on('data', (data) => {
  console.log('Received:', data.toString())
})
```

If this works, issue is in `docling_extract.py` logic, not IPC setup.

---

## Summary Checklist

- [ ] Python 3.10+ installed
- [ ] Docling dependencies installed (`pip list | grep docling`)
- [ ] Python script runs standalone (`python3 worker/scripts/docling_extract.py ...`)
- [ ] Final JSON output includes `{"type": "result", ...}`
- [ ] TypeScript wrapper has `-u` flag and `PYTHONUNBUFFERED=1`
- [ ] All `sys.stdout.write()` calls have `sys.stdout.flush()` after them
- [ ] PDF exists and is readable (not corrupted/password-protected)
- [ ] Timeout is sufficient for PDF size (default 10 minutes)
- [ ] Test with small PDF (1-5 pages) to rule out size issues

If all checks pass but issue persists, share the output of `test-docling-wrapper.ts` for further debugging.
