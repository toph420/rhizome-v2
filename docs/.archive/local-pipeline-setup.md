# Local Processing Pipeline Setup

## Overview

Rhizome V2's Local Processing Pipeline enables 100% local document processing with **zero API costs** and **complete privacy**. This guide walks you through setting up the required dependencies.

## System Requirements

### Minimum Requirements
- **OS**: macOS, Linux, or Windows (WSL2)
- **RAM**: 24GB (for Qwen 14B model)
- **Storage**: 20GB free space
- **Python**: 3.10 or higher
- **Node.js**: 18.0 or higher

### Recommended Requirements
- **RAM**: 64GB (for Qwen 32B model - best quality)
- **CPU**: Apple M1 Max/Ultra or equivalent
- **Storage**: 50GB free space (for model caching)

## Prerequisites

### 1. Python Installation

Ensure Python 3.10+ is installed:

```bash
python --version  # Should be 3.10 or higher
```

If not installed, download from [python.org](https://www.python.org/downloads/) or use a package manager:

```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt install python3.11

# Windows (via Scoop)
scoop install python
```

### 2. Node.js Installation

Verify Node.js 18+:

```bash
node --version  # Should be 18.0 or higher
```

If needed, install via [nodejs.org](https://nodejs.org/) or use nvm:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js
nvm install 18
nvm use 18
```

## Installation Steps

### Step 1: Python Dependencies

Install the required Python packages in the worker directory:

```bash
cd worker

# Core dependencies
pip install docling==2.55.1
pip install 'pydantic-ai[ollama]'
pip install sentence-transformers
pip install transformers

# Verify installation
python -c "import docling; print('Docling installed successfully')"
python -c "import pydantic_ai; print('PydanticAI installed successfully')"
```

**Troubleshooting:**
- If `pip` is not found, try `pip3`
- Consider using a virtual environment:
  ```bash
  python -m venv venv
  source venv/bin/activate  # On Windows: venv\Scripts\activate
  pip install -r requirements.txt
  ```

### Step 2: Ollama Installation

Ollama provides the local LLM engine (Qwen) for cleanup and metadata extraction.

#### Install Ollama

**macOS/Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Windows:**
Download installer from [ollama.com](https://ollama.com/download)

#### Verify Installation

```bash
ollama --version
```

#### Pull Qwen Model

**For 64GB RAM machines (recommended):**
```bash
ollama pull qwen2.5:32b-instruct-q4_K_M
```

**For 32GB RAM machines:**
```bash
ollama pull qwen2.5:14b-instruct-q4_K_M
```

**For 16GB RAM machines:**
```bash
ollama pull qwen2.5:7b-instruct-q4_K_M
```

**Model Download Times:**
- Qwen 32B: ~20GB download (~30 minutes on fast connection)
- Qwen 14B: ~9GB download (~15 minutes)
- Qwen 7B: ~5GB download (~8 minutes)

#### Start Ollama Server

```bash
ollama serve
```

**Note:** Keep this terminal open. Ollama must be running for local processing to work.

**Verify Server:**
```bash
curl http://127.0.0.1:11434/api/version
# Should return: {"version":"0.x.x"}
```

### Step 3: Node.js Dependencies

Install the JavaScript packages:

```bash
cd worker

# Install Ollama client and Transformers.js
npm install ollama @huggingface/transformers

# Verify installation
npm ls ollama
npm ls @huggingface/transformers
```

### Step 4: Environment Configuration

#### Create .env.local File

```bash
# From project root
cd /Users/topher/Code/rhizome-v2

# Copy example
cp .env.local.example .env.local
```

#### Configure Local Mode

Edit `.env.local` and set:

```bash
# Enable local processing
PROCESSING_MODE=local

# Ollama configuration
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M  # or 14b/7b variant
OLLAMA_TIMEOUT=600000
```

**For smaller RAM:**
```bash
# 32GB RAM
OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M

# 16GB RAM
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
```

## Validation

### Test Python Integration

```bash
cd worker

# Test Docling extraction
echo '{"tokenizer": "Xenova/all-mpnet-base-v2"}' | \
  python scripts/docling_extract.py < ../tests/fixtures/sample.pdf

# Should output JSON with chunks
```

### Test Ollama Integration

```bash
# Test Ollama is responding
curl -X POST http://127.0.0.1:11434/api/generate \
  -d '{"model": "qwen2.5:32b-instruct-q4_K_M", "prompt": "Hello", "stream": false}'

# Should return JSON with model response
```

### Run Integration Tests

```bash
cd worker

# Run all integration tests
npm run test:integration

# Run specific local pipeline tests
npm test -- local-processing.test.ts
```

### Test with Real Document

```bash
# Start all services
npm run dev

# Upload a PDF via UI (http://localhost:3000)
# Verify:
# 1. Processing completes without errors
# 2. Chunks show confidence levels in UI
# 3. No API costs incurred (check logs for "Processing mode: local")
```

## Performance Expectations

### Processing Times

| Document Size | Qwen 32B | Qwen 14B | Qwen 7B |
|--------------|----------|----------|---------|
| Small (<50 pages) | 3-5 min | 2-4 min | 1-3 min |
| Medium (100-200 pages) | 15-25 min | 10-18 min | 6-12 min |
| Large (500 pages) | 60-80 min | 40-60 min | 25-40 min |

**Note:** M1 Max 64GB benchmarks. Your mileage may vary based on hardware.

### Quality Metrics

- **Chunk Recovery**: 100% (guaranteed, no data loss)
- **Exact Matches**: 85-90%
- **Synthetic Chunks**: <5% (flagged for review)
- **API Calls**: 0 (completely local)

## Troubleshooting

### Common Issues

#### 1. Ollama Not Responding

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:11434`

**Solution:**
```bash
# Check if Ollama is running
ps aux | grep ollama

# If not running, start it
ollama serve

# Verify server is up
curl http://127.0.0.1:11434/api/version
```

#### 2. Out of Memory (OOM) Errors

**Symptom:** `Error: Qwen model out of memory`

**Solutions:**
```bash
# Option 1: Use smaller model
export OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M

# Option 2: Close other applications
# Option 3: Restart Ollama server
ollama stop
ollama serve

# Option 4: Check RAM usage
htop  # or Activity Monitor on macOS
```

#### 3. Python Subprocess Hangs

**Symptom:** Processing stuck at "Extracting with Docling..."

**Solutions:**
```bash
# Verify Python dependencies
cd worker
pip list | grep docling

# Test Python script directly
echo '{"tokenizer": "Xenova/all-mpnet-base-v2"}' | \
  python scripts/docling_extract.py < ../tests/fixtures/sample.pdf

# Check for missing sys.stdout.flush() in Python scripts
```

#### 4. High Synthetic Chunk Rate (>10%)

**Symptom:** Chunk Quality panel shows >10% synthetic chunks

**Diagnosis:**
```bash
# Check Docling extraction quality
# Review logs for warnings about missing page numbers or bboxes
```

**Solutions:**
- Ensure PDF is not corrupted or scanned image-only
- Try re-uploading the document
- Check if document is text-based (not scanned images)

#### 5. Slow Processing

**Symptom:** Processing takes 3x longer than expected

**Solutions:**
```bash
# Check Ollama server load
curl http://127.0.0.1:11434/api/ps

# Ensure no other models are running
# Verify model is using GPU (if available)

# Check if batching is working
# Look for "Batch X/Y" in logs
```

#### 6. Transformers.js Embeddings Wrong Dimensions

**Symptom:** `Error: Expected 768 dimensions, got 384`

**Solution:**
```typescript
// Verify pipeline options in embeddings-local.ts
const embeddings = await extractor(texts, {
  pooling: 'mean',      // REQUIRED
  normalize: true       // REQUIRED
})
```

### Getting Help

If issues persist:

1. Check logs: `tail -f logs/worker.log`
2. Review validation checklist in `docs/tasks/local-processing-pipeline-v1/PHASES_OVERVIEW.md`
3. Run full test suite: `cd worker && npm run test:full-validation`
4. File issue with logs and system specs

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Interface                       │
│                    (Next.js 15 App)                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  Worker Module                           │
│                (Background Processing)                   │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Docling    │ │   Ollama     │ │Transformers.js│
│  (Python)    │ │  (Qwen 32B)  │ │  (Node.js)    │
│              │ │              │ │               │
│ • Extract    │ │ • Cleanup    │ │ • Embeddings  │
│ • Chunk      │ │ • Metadata   │ │   (768d)      │
│ • Structure  │ │ • Analysis   │ │               │
└──────────────┘ └──────────────┘ └───────────────┘
        │               │               │
        └───────────────┴───────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase PostgreSQL                         │
│         (Chunks + Embeddings + Metadata)                 │
└─────────────────────────────────────────────────────────┘
```

## Cost Savings

### Cloud Processing (Gemini)
- Small PDF (<50 pages): ~$0.10
- Medium PDF (200 pages): ~$0.35
- Large PDF (500 pages): ~$0.55
- **Annual (1,000 books)**: ~$420

### Local Processing
- **All documents**: $0.00
- **Annual (1,000 books)**: $0.00
- **5-year savings**: ~$2,100

**Additional Benefits:**
- Complete privacy (no data sent to cloud)
- No rate limits
- No API keys required
- Works offline

## Next Steps

After setup is complete:

1. ✅ Process a test document
2. ✅ Review chunk quality in UI
3. ✅ Verify synthetic chunks are <5%
4. ✅ Check processing times meet expectations
5. ✅ Confirm 100% chunk recovery

For advanced configuration and optimization, see:
- `docs/ARCHITECTURE.md` - System architecture
- `docs/tasks/local-processing-pipeline-v1/README.md` - Implementation details
- `worker/README.md` - Worker module documentation

## References

- **Docling**: https://docling-project.github.io/docling/
- **PydanticAI**: https://ai.pydantic.dev/
- **Ollama**: https://ollama.com/
- **Qwen 2.5**: https://ollama.com/library/qwen2.5
- **Transformers.js**: https://huggingface.co/docs/transformers.js/
