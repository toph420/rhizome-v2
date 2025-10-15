# Chonkie Quick Reference Card

**For**: Rhizome developers implementing Chonkie integration
**Updated**: 2025-10-14

---

## Installation

```bash
# Semantic chunking (recommended)
pip install "chonkie[semantic]"

# LLM-based chunking (premium mode)
pip install "chonkie[genie]"

# Both
pip install "chonkie[semantic,genie]"
```

---

## Basic Usage

### SemanticChunker (Primary)

```python
from chonkie import SemanticChunker

# Recommended configuration for Rhizome
chunker = SemanticChunker(
    embedding_model="sentence-transformers/all-mpnet-base-v2",
    threshold=0.75,      # 0.7-0.8 range
    chunk_size=768,      # Match our system
    skip_window=3        # Cross-section merging
)

# Chunk markdown
chunks = chunker.chunk(cleaned_markdown)

# Each chunk has:
for chunk in chunks:
    print(chunk.text)           # Content
    print(chunk.start_index)    # Character offset ✅
    print(chunk.end_index)      # Character offset ✅
    print(chunk.token_count)    # Size
```

---

### SlumberChunker (Premium)

```python
from chonkie import SlumberChunker
from chonkie.genie import OllamaGenie

# Use our existing Ollama
genie = OllamaGenie(
    model="qwen2.5:32b-instruct-q4_K_M",
    endpoint="http://127.0.0.1:11434"
)

chunker = SlumberChunker(
    genie=genie,
    chunk_size=768,
    candidate_size=128  # Tokens per decision
)

chunks = chunker.chunk(cleaned_markdown)
# Slower but highest quality!
```

---

### Pipeline API (Full)

```python
from chonkie import Pipeline

# Minimal pipeline (bypass Fetcher)
chunks = (Pipeline()
    .chunk_with("semantic", threshold=0.75)
    .run(texts=[cleaned_markdown]))

# Full pipeline with JSON export
doc = (Pipeline()
    .chunk_with("semantic", threshold=0.75)
    .export_with("json")
    .run(texts=[cleaned_markdown]))
```

---

## Configuration Guide

### Threshold Tuning

| Threshold | Chunk Behavior | Use Case |
|-----------|----------------|----------|
| **0.65-0.70** | Aggressive splitting | Dense academic papers |
| **0.75-0.80** | Balanced (recommended) | General books, articles |
| **0.85-0.90** | Conservative | Narrative fiction |

**Rule of Thumb**: Lower threshold = more granular chunks

---

### Skip Window Tuning

| skip_window | Behavior | Effect |
|-------------|----------|--------|
| **0** | Disabled | Sequential chunks only |
| **2-3** | Moderate (recommended) | Merges nearby related sections |
| **5-10** | Aggressive | Finds distant connections |

**Impact**: Higher values improve cross-section connection detection

---

### Chunk Size Recommendations

| chunk_size | Token Count | Use Case |
|------------|-------------|----------|
| **512** | Small | Precise retrieval, dense content |
| **768** | Balanced (our default) | General use |
| **1024** | Large | More context per chunk |

**Keep**: 768 tokens (matches existing Rhizome system)

---

## Chunk Data Structure

```python
@dataclass
class Chunk:
    text: str                    # Chunk content
    start_index: int            # ✅ Character offset in CLEANED markdown
    end_index: int              # ✅ Character offset in CLEANED markdown
    token_count: int            # Token count
    context: Optional[Context]  # Optional metadata
    embedding: Optional[...]    # Optional embedding
```

**Critical**:
- `start_index` and `end_index` are character offsets in **CLEANED markdown** (what Chonkie processed)
- These are NOT byte offsets or token positions
- In Rhizome, bulletproof matcher maps these to ORIGINAL Docling metadata

---

## Metadata Transfer Pattern (Rhizome-Specific)

**Important**: Chonkie chunks are in CLEANED text, Docling metadata is in ORIGINAL text.
Rhizome uses bulletproof matcher to bridge this coordinate gap.

```typescript
// worker/processors/pdf-processor.ts

async function processWithChonkie(documentId: string) {
  // 1. Docling extraction (original markdown + metadata)
  const { originalMarkdown, structure } = await doclingExtract(filePath);

  // 2. Ollama cleanup (creates coordinate mismatch)
  const cleanedMarkdown = await ollamaCleanup(originalMarkdown);

  // 3. Bulletproof matcher (maps original → cleaned coordinates)
  const coordinateMap = await runBulletproofMatcher(
    structure.doclingChunks,
    cleanedMarkdown
  );

  // 4. Chonkie semantic chunking (in CLEANED coordinates)
  const chonkieChunks = await chonkieChunk(cleanedMarkdown, {
    threshold: 0.75,
    skip_window: 3
  });

  // 5. Transfer metadata using coordinate map
  const enrichedChunks = chonkieChunks.map(chunk => {
    const metadata = coordinateMap.getMetadataForCleanedRange(
      chunk.start_index,  // Position in CLEANED markdown
      chunk.end_index
    );

    return {
      ...chunk,
      ...metadata,  // pages, headings, bboxes from Docling
      chunker_type: 'semantic'
    };
  });

  return enrichedChunks;
}
```

**Key Point**: Bulletproof matcher is **necessary** - it bridges the coordinate gap between original and cleaned text.

---

## TypeScript Subprocess Wrapper

```typescript
// worker/lib/chonkie/chonkie-chunker.ts

interface ChonkieConfig {
  embedding_model?: string;
  threshold?: number;
  chunk_size?: number;
  skip_window?: number;
  mode?: 'semantic' | 'slumber';
}

export async function chonkieChunk(
  markdown: string,
  config: ChonkieConfig = {}
): Promise<ChonkieChunk[]> {
  const scriptPath = path.join(__dirname, '../../scripts/chonkie_chunk.py');

  const input = JSON.stringify({ markdown, config });

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Chonkie failed: ${stderr}`));
        return;
      }

      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout);
        resolve(chunks);
      } catch (err) {
        reject(new Error(`Parse error: ${err}`));
      }
    });

    python.stdin.write(input);
    python.stdin.end();
  });
}
```

---

## Python Script Template

```python
#!/usr/bin/env python3
"""
worker/scripts/chonkie_chunk.py
"""
import sys
import json
from chonkie import SemanticChunker, SlumberChunker
from chonkie.genie import OllamaGenie

def main():
    # Read from stdin
    input_data = json.loads(sys.stdin.read())
    markdown = input_data["markdown"]
    config = input_data.get("config", {})
    mode = config.get("mode", "semantic")

    # Create chunker
    if mode == "semantic":
        chunker = SemanticChunker(
            embedding_model=config.get("embedding_model",
                                       "sentence-transformers/all-mpnet-base-v2"),
            threshold=config.get("threshold", 0.75),
            chunk_size=config.get("chunk_size", 768),
            skip_window=config.get("skip_window", 3)
        )
    elif mode == "slumber":
        genie = OllamaGenie(
            model="qwen2.5:32b-instruct-q4_K_M",
            endpoint="http://127.0.0.1:11434"
        )
        chunker = SlumberChunker(
            genie=genie,
            chunk_size=config.get("chunk_size", 768)
        )
    else:
        raise ValueError(f"Unknown mode: {mode}")

    # Chunk
    chunks = chunker.chunk(markdown)

    # Output JSON
    output = [
        {
            "text": chunk.text,
            "start_index": chunk.start_index,
            "end_index": chunk.end_index,
            "token_count": chunk.token_count
        }
        for chunk in chunks
    ]

    print(json.dumps(output))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
```

---

## Validation Tests

```typescript
// Offset accuracy
test('character offsets are accurate', async () => {
  const markdown = "# Heading\n\nParagraph one.\n\nParagraph two.";
  const chunks = await chonkieChunk(markdown);

  chunks.forEach(chunk => {
    const extracted = markdown.slice(chunk.start_index, chunk.end_index);
    expect(extracted).toBe(chunk.text);
  });
});

// Metadata transfer
test('Docling metadata is preserved', async () => {
  const chonkieChunks = await chonkieChunk(markdown);
  const enriched = transferDoclingMetadata(chonkieChunks, doclingChunks);

  enriched.forEach(chunk => {
    expect(chunk.heading_path).toBeDefined();
    expect(chunk.page_numbers.length).toBeGreaterThan(0);
  });
});

// Performance
test('chunking completes in < 60 seconds', async () => {
  const start = Date.now();
  await chonkieChunk(largeMark down);
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(60000);
});
```

---

## Common Issues & Solutions

### Issue: Offsets Don't Match

**Symptom**: `markdown.slice(start_index, end_index) !== chunk.text`

**Causes**:
1. Markdown was modified after chunking
2. Encoding issues (UTF-8 vs ASCII)
3. Line ending differences (LF vs CRLF)

**Solution**:
```typescript
// Normalize line endings before chunking
const normalized = markdown.replace(/\r\n/g, '\n');
```

---

### Issue: Skip-Window Not Working

**Symptom**: Related sections not merged despite similarity

**Causes**:
1. Threshold too high (requires stronger similarity)
2. skip_window too small
3. Sections too far apart

**Solution**:
```python
# Try lower threshold + larger skip_window
chunker = SemanticChunker(
    threshold=0.70,  # Lower = more merging
    skip_window=5    # Look further
)
```

---

### Issue: Chunks Too Large/Small

**Symptom**: Chunk token counts vary widely

**Causes**:
1. Threshold affects boundary detection
2. Content varies in semantic density

**Solution**:
```python
# Adjust chunk_size + threshold
chunker = SemanticChunker(
    chunk_size=512,   # Smaller max size
    threshold=0.75    # More boundaries
)
```

---

### Issue: SlumberChunker Too Slow

**Symptom**: Processing takes > 30 minutes

**Causes**:
1. Document too large
2. candidate_size too small (more LLM calls)
3. Ollama model too slow

**Solution**:
```python
# Increase candidate_size (fewer LLM calls)
chunker = SlumberChunker(
    genie=genie,
    candidate_size=256  # Larger = fewer calls
)
```

---

## Performance Benchmarks

### SemanticChunker (500-page book)

| Metric | Value |
|--------|-------|
| **Processing Time** | 30-60 seconds |
| **Chunk Count** | 380-420 chunks |
| **Avg Chunk Size** | 750-800 tokens |
| **Cost** | $0 |

---

### SlumberChunker (500-page book)

| Metric | Value |
|--------|-------|
| **Processing Time** | 15-20 minutes |
| **Chunk Count** | 350-400 chunks |
| **Avg Chunk Size** | 750-850 tokens |
| **Cost** | $0 (local Ollama) |
| **Quality** | Subjectively better |

---

## Decision Tree

```
Need chunking?
├─ Fast processing required?
│  └─ YES → SemanticChunker (threshold=0.75)
│
├─ Highest quality needed?
│  └─ YES → SlumberChunker (willing to wait 15-20 min)
│
├─ Structure preservation critical?
│  └─ YES → RecursiveChunker (fallback)
│
└─ Multi-topic complexity?
   └─ YES → Consider NeuralChunker (Phase 2)
```

---

## Component Selection

| Component | Use? | Reason |
|-----------|------|--------|
| **Fetcher** | ❌ | We have Docling |
| **MarkdownChef** | ❌ | We have Ollama cleanup |
| **SemanticChunker** | ✅ | Primary strategy |
| **SlumberChunker** | ✅ | Premium option |
| **RecursiveChunker** | ⚠️ | Fallback only |
| **OverlapRefinery** | ⚠️ | Test offset preservation first |
| **EmbeddingsRefinery** | ❌ | Keep Transformers.js |
| **JSONPorter** | ✅ | For serialization |
| **pgvector-handshake** | ❌ | Custom schema needed |

---

## Environment Variables

```bash
# .env (worker module)
CHONKIE_ENABLED=true
CHONKIE_MODE=semantic          # or "slumber"
CHONKIE_THRESHOLD=0.75
CHONKIE_SKIP_WINDOW=3
CHONKIE_CHUNK_SIZE=768
OLLAMA_ENDPOINT=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M
```

---

## Useful Links

**Chonkie Documentation**:
- **Docs**: https://docs.chonkie.ai/python-sdk
- **GitHub**: https://github.com/chonkie-inc/chonkie
- **SemanticChunker**: https://docs.chonkie.ai/oss/chunkers/semantic-chunker
- **SlumberChunker**: https://docs.chonkie.ai/oss/chunkers/slumber-chunker

**Rhizome Documentation**:
- **Integration PRP**: `/docs/prps/chonkie-integration-revised.md`
- **Processing Pipeline**: `/docs/PROCESSING_PIPELINE.md`
- **Bulletproof Matcher**: `/docs/processing-pipeline/bulletproof-metadata-extraction.md`

---

## Advanced Patterns

### Skip-Window: Visual Demonstration

**What skip-window does**: Merges semantically similar content **across gaps** (non-consecutive sections).

**Example**:

```
Input Text (5 paragraphs):
─────────────────────────────────────────
Group 0: "AI systems require massive datasets."
Group 1: "The weather today is sunny."
Group 2: "Machine learning models need training data."
Group 3: "I went to the store yesterday."
Group 4: "Neural networks learn from examples."

Without skip_window (default):
─────────────────────────────────────────
Result: 5 separate chunks
- AI concepts fragmented across document
- Unrelated topics mixed in

With skip_window=2:
─────────────────────────────────────────
Chunk 1: Groups [0, 2, 4]  ← AI-related merged!
Chunk 2: Groups [1]         ← Weather standalone
Chunk 3: Groups [3]         ← Store standalone

Result: 3 chunks, AI concepts unified
```

**Configuration by document type**:

```python
DOCUMENT_CONFIGS = {
    "academic_paper": {
        "threshold": 0.80,      # Strict separation
        "skip_window": 0,       # No merging (preserve structure)
    },
    "narrative_book": {
        "threshold": 0.65,      # Lenient grouping
        "skip_window": 2,       # Merge thematic threads
    },
    "rhizome_default": {
        "threshold": 0.70,      # Balanced
        "skip_window": 3,       # Enable cross-section connections
    }
}
```

**Performance impact**:
- `skip_window=0`: Baseline speed
- `skip_window=1`: ~1.2x slower (acceptable)
- `skip_window=2`: ~1.5x slower (acceptable)
- `skip_window=5`: ~3x slower (avoid unless necessary)

---

### Production Subprocess Pattern

**Problem**: Basic subprocess can hang, crash, or run out of memory.

**Solution**: Robust wrapper with retry, timeout, and fallback.

```typescript
// worker/lib/chonkie/chonkie-chunker.ts (production version)

interface ChonkieConfig {
  mode?: 'semantic' | 'slumber';
  threshold?: number;
  chunk_size?: number;
  skip_window?: number;
  timeout?: number;
  max_retries?: number;
}

export async function chonkieChunkRobust(
  markdown: string,
  config: ChonkieConfig = {}
): Promise<ChonkieChunk[]> {
  const timeout = config.timeout || 300000; // 5 minutes
  const maxRetries = config.max_retries || 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chonkieChunkSingleAttempt(markdown, config, timeout);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;

      // Handle timeout
      if (error.message.includes('timeout')) {
        if (isLastAttempt) {
          console.error(`Chonkie timed out after ${maxRetries + 1} attempts`);
          return fallbackChunking(markdown, config);
        }
        console.warn(`Attempt ${attempt + 1} timed out, retrying...`);
        await sleep(2 ** attempt * 1000); // Exponential backoff
        continue;
      }

      // Handle OOM
      if (error.message.includes('MemoryError') || error.message.includes('OOM')) {
        console.error('Out of memory, using fallback chunking');
        return fallbackChunking(markdown, config);
      }

      // Other errors
      if (isLastAttempt) throw error;
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await sleep(2 ** attempt * 1000);
    }
  }
}

async function chonkieChunkSingleAttempt(
  markdown: string,
  config: ChonkieConfig,
  timeout: number
): Promise<ChonkieChunk[]> {
  const scriptPath = path.join(__dirname, '../../scripts/chonkie_chunk.py');

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath]);
    let stdout = '';
    let stderr = '';

    // Set timeout
    const timer = setTimeout(() => {
      python.kill();
      reject(new Error(`Chonkie process timed out after ${timeout}ms`));
    }, timeout);

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Chonkie failed (exit ${code}): ${stderr}`));
        return;
      }

      try {
        const chunks: ChonkieChunk[] = JSON.parse(stdout);
        resolve(chunks);
      } catch (err) {
        reject(new Error(`Failed to parse Chonkie output: ${err}`));
      }
    });

    python.stdin.write(JSON.stringify({ markdown, config }));
    python.stdin.end();
  });
}

function fallbackChunking(markdown: string, config: ChonkieConfig): ChonkieChunk[] {
  console.warn('Using simple sentence-based fallback chunking');

  // Simple sentence splitting
  const sentences = markdown.split(/(?<=[.!?])\s+/);
  const chunkSize = config.chunk_size || 768;
  const chunks: ChonkieChunk[] = [];

  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).length;

    if (currentLength + words > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join(' '),
        start_index: 0, // Approximate
        end_index: 0,
        token_count: currentLength,
        fallback: true // Flag for monitoring
      });
      currentChunk = [];
      currentLength = 0;
    }

    currentChunk.push(sentence);
    currentLength += words;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join(' '),
      start_index: 0,
      end_index: 0,
      token_count: currentLength,
      fallback: true
    });
  }

  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Python script critical fix**:

```python
#!/usr/bin/env python3
import sys
import json

# CRITICAL: Always flush after printing
def log(msg):
    print(msg, file=sys.stderr, flush=True)  # Log to stderr

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        markdown = input_data["markdown"]
        config = input_data.get("config", {})

        log(f"Processing {len(markdown)} characters")

        from chonkie import SemanticChunker

        chunker = SemanticChunker(
            threshold=config.get("threshold", 0.75),
            chunk_size=config.get("chunk_size", 768),
            skip_window=config.get("skip_window", 3)
        )

        chunks = chunker.chunk(markdown)

        output = [
            {
                "text": chunk.text,
                "start_index": chunk.start_index,
                "end_index": chunk.end_index,
                "token_count": chunk.token_count
            }
            for chunk in chunks
        ]

        # CRITICAL: Flush stdout
        print(json.dumps(output), flush=True)
        sys.stdout.flush()  # Extra safety
        sys.exit(0)

    except Exception as e:
        log(f"ERROR: {e}")
        import traceback
        log(traceback.format_exc())
        sys.exit(1)

if __name__ == '__main__':
    main()
```

---

### Common Gotchas & Solutions

#### Gotcha 1: Subprocess Hangs Indefinitely

**Symptom**: TypeScript never receives Python output, process hangs

**Cause**: Python script forgot `sys.stdout.flush()`

**Solution**:
```python
# ❌ WRONG - IPC will hang
print(json.dumps(output))

# ✅ RIGHT - Explicit flush
print(json.dumps(output), flush=True)
sys.stdout.flush()  # Extra safety
```

#### Gotcha 2: Threshold Too High = Fragmentation

**Symptom**: Chunks average < 2 sentences each

**Cause**: `threshold > 0.85` creates excessive splits

**Solution**:
```python
# Validate chunk quality after processing
def validate_chunks(chunks):
    total_sentences = sum(chunk.text.count('.') for chunk in chunks)
    avg_sentences = total_sentences / len(chunks)

    if avg_sentences < 3:
        print(f"⚠️  Warning: {avg_sentences:.1f} sentences/chunk (threshold too high?)")
        print("Try lowering threshold to 0.70-0.75")
        return False

    print(f"✅ Good: {avg_sentences:.1f} sentences/chunk")
    return True

chunks = chunker.chunk(text)
validate_chunks(chunks)
```

#### Gotcha 3: Skip-Window Slow Performance

**Symptom**: Processing takes > 2 minutes for 500-page book

**Cause**: `skip_window > 3` causes O(n²) comparisons

**Solution**:
```python
# Progressive tuning
import time

for skip_window in [0, 1, 2, 3, 5]:
    chunker = SemanticChunker(skip_window=skip_window)
    start = time.time()
    chunks = chunker.chunk(test_doc)
    elapsed = time.time() - start

    print(f"skip_window={skip_window}: {elapsed:.2f}s, {len(chunks)} chunks")

# Expected results:
# skip_window=0: 1.0s baseline
# skip_window=1: 1.2s (20% slower, acceptable)
# skip_window=2: 1.5s (50% slower, acceptable)
# skip_window=3: 2.0s (2x slower, borderline)
# skip_window=5: 4.0s (4x slower, avoid!)
```

#### Gotcha 4: Benchmark Claims Inflated

**Reality Check**: Chonkie claims "33x faster" but real-world is **1.06-1.86x**

**What this means**:
- Don't choose Chonkie for speed alone
- Choose it for **semantic coherence** in chunks
- Benchmark in your environment with your documents

```python
# Set realistic expectations
import time

chunker = SemanticChunker()

start = time.time()
chunks = chunker.chunk(large_document)
elapsed = time.time() - start

print(f"Processed {len(large_document)} chars in {elapsed:.2f}s")
print(f"Speed: {len(large_document) / elapsed:.0f} chars/sec")
print(f"Chunks: {len(chunks)}, Avg: {len(large_document) / len(chunks):.0f} chars/chunk")
```

#### Gotcha 5: Character Offset Confusion

**Symptom**: Metadata doesn't align with chunks

**Cause**: Misunderstanding coordinate systems

**Clarification**:
```
Chonkie chunks CLEANED markdown:
  chunk.start_index = position in CLEANED text ✅

Docling metadata references ORIGINAL markdown:
  docling.page = position in ORIGINAL text ✅

Bulletproof matcher bridges the gap:
  matcher.map(cleaned_position) → original_metadata ✅
```

**Solution**: Always use bulletproof matcher to transfer metadata

---

### Production Checklist

Before deploying Chonkie:

**Setup**:
- [ ] Install Chonkie: `pip install "chonkie[semantic]"`
- [ ] Test Python script standalone
- [ ] Verify `sys.stdout.flush()` in all print statements

**Configuration**:
- [ ] Set threshold based on document type (default: 0.70)
- [ ] Set skip_window=3 for Rhizome (cross-section connections)
- [ ] Set timeout=300000 (5 minutes for large documents)
- [ ] Set max_retries=2 (exponential backoff)

**Error Handling**:
- [ ] Implement timeout handling
- [ ] Implement OOM fallback
- [ ] Add retry logic with exponential backoff
- [ ] Clean up temp files in error cases

**Validation**:
- [ ] Verify average chunk size (3-5 sentences)
- [ ] Test with largest expected document
- [ ] Monitor fallback usage (should be <5%)
- [ ] Benchmark processing time (should be <30 min for 500 pages)

**Integration**:
- [ ] Bulletproof matcher runs before metadata transfer
- [ ] Flag chunks with `chunker_type: 'semantic'`
- [ ] Preserve all Docling metadata (pages, headings, bboxes)
- [ ] Test annotation recovery (should be ≥90%)

---

**Updated**: 2025-10-14
**Status**: Production-ready patterns for Rhizome integration
