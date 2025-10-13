# Bulletproof Metadata Extraction

**Zero-Failure Tolerance System for Local Metadata Enrichment**

## Overview

The bulletproof metadata extraction system guarantees 100% success rate for extracting structured metadata from document chunks using local LLMs (Ollama). Every chunk gets metadata - no exceptions, no failures.

## Architecture

### 5-Layer Protection System

```
1. Pre-Flight Validation
   ├─ Ollama health check
   ├─ Model availability check
   └─ Memory availability check

2. Per-Chunk Retry (5 attempts)
   ├─ Exponential backoff (2s → 32s)
   ├─ Automatic error recovery
   └─ Transient failure handling

3. Progressive Fallback Chain
   ├─ Ollama 32B (best quality)
   ├─ Ollama 14B (good quality, less RAM)
   ├─ Ollama 7B (fast, lower quality)
   ├─ Gemini API (optional, costs $$)
   ├─ Regex extraction (always works)
   └─ Fallback metadata (guaranteed)

4. Circuit Breaker Pattern
   ├─ Detects systematic failures
   ├─ Prevents cascade failures
   └─ Automatic recovery testing

5. Quality Tracking
   ├─ Source tracking per chunk
   ├─ Attempt counting
   └─ Error logging
```

## Guarantees

1. **Every chunk gets metadata** - Never null/undefined
2. **Processing never fails** - Automatic fallback chain
3. **Quality transparency** - Know which method was used
4. **Automatic recovery** - Handles transient errors
5. **Cost control** - Optional Gemini fallback

## Usage

### Basic Usage

```typescript
import { bulletproofExtractMetadata } from './lib/chunking/bulletproof-metadata.ts'

const chunks = [
  { id: 'chunk-1', content: 'Machine learning is...' },
  { id: 'chunk-2', content: 'Quantum computing has...' }
]

const results = await bulletproofExtractMetadata(chunks, {
  maxRetries: 5,
  enableGeminiFallback: false,  // Set true to enable $$$ fallback
  onProgress: (processed, total, status) => {
    console.log(`${processed}/${total}: ${status}`)
  }
})

// Results include source tracking
for (const [id, result] of results) {
  console.log(`${id}:`)
  console.log(`  Source: ${result.source}`)      // 'ollama-32b', 'regex', etc.
  console.log(`  Attempts: ${result.attempts}`)   // How many retries
  console.log(`  Metadata: ${result.metadata}`)   // ChunkMetadata object
}
```

### Configuration Options

```typescript
interface BulletproofConfig {
  /** Maximum retries per chunk (default: 5) */
  maxRetries?: number

  /** Enable Gemini fallback (costs money but 100% reliable) */
  enableGeminiFallback?: boolean

  /** Progress callback */
  onProgress?: (processed: number, total: number, status: string) => void
}
```

### Quality Distribution

After processing, check the quality distribution:

```typescript
const qualityStats = {
  ollama32b: [...results.values()].filter(r => r.source === 'ollama-32b').length,
  ollama14b: [...results.values()].filter(r => r.source === 'ollama-14b').length,
  ollama7b: [...results.values()].filter(r => r.source === 'ollama-7b').length,
  regex: [...results.values()].filter(r => r.source === 'regex').length,
  fallback: [...results.values()].filter(r => r.source === 'fallback').length
}

console.log('Quality Distribution:')
console.log(`  Ollama 32B: ${qualityStats.ollama32b} (${(qualityStats.ollama32b/results.size*100).toFixed(1)}%)`)
// ...
```

## Failure Modes & Handling

### 1. OOM (Out of Memory)

**Detection:**
- Process exit code 137
- Ollama logs show memory errors
- System memory >85%

**Handling:**
- Automatic fallback to 14B model (less RAM)
- Further fallback to 7B model (even less RAM)
- Ultimate fallback to regex extraction

### 2. Timeout

**Detection:**
- Individual chunk takes >60 seconds
- Ollama becomes unresponsive

**Handling:**
- Per-chunk 60-second timeout
- Automatic retry with exponential backoff
- Fallback to next model size

### 3. Validation Errors

**Detection:**
- PydanticAI validation fails after 3 retries
- Malformed JSON output

**Handling:**
- Automatic retry (up to 5 times)
- Fallback to next extraction method
- Never surfaces to user

### 4. Ollama Crash

**Detection:**
- Pre-flight health check fails
- Circuit breaker detects 5+ consecutive failures

**Handling:**
- Circuit breaker opens (stop using Ollama)
- Skip directly to regex extraction
- Retry Ollama after 60 seconds (half-open state)

## Performance

### For The Recognitions (1334 chunks)

**Expected Distribution:**
- Ollama 32B: ~1200 chunks (90%)
- Ollama 14B: ~100 chunks (7.5%) - fallback from 32B failures
- Ollama 7B: ~20 chunks (1.5%) - fallback from 14B failures
- Regex: ~10 chunks (0.75%) - ultimate fallback
- Pure Fallback: ~4 chunks (0.3%) - catastrophic failures

**Processing Time:**
- Best case (all 32B): 40-60 minutes
- Worst case (mixed): 60-90 minutes
- Failure handling overhead: ~2-5 minutes total

**Memory Usage:**
- Qwen 32B: ~20GB baseline + ~2GB per inference
- Qwen 14B: ~10GB baseline + ~1GB per inference
- Qwen 7B: ~5GB baseline + ~500MB per inference

## Cost Analysis

### Without Gemini Fallback (Default)

**Cost: $0.00**
- 100% local processing
- No API calls
- Complete privacy

**Quality Trade-off:**
- ~90% high-quality (Ollama 32B/14B)
- ~8% medium-quality (Ollama 7B)
- ~2% low-quality (regex/fallback)

### With Gemini Fallback (Optional)

**Cost: ~$0.10-0.30 per 1000 chunks**
- Gemini only used after Ollama failures
- Typical usage: <2% of chunks
- For 1334 chunks: ~$0.02-0.05

**Quality Trade-off:**
- ~90% high-quality (Ollama 32B/14B)
- ~8% high-quality (Gemini)
- ~2% low-quality (regex/fallback - only if Gemini fails too)

**Enable with:**
```typescript
const results = await bulletproofExtractMetadata(chunks, {
  enableGeminiFallback: true  // Costs $$ but improves quality
})
```

## Monitoring & Debugging

### Progress Tracking

```typescript
await bulletproofExtractMetadata(chunks, {
  onProgress: (processed, total, status) => {
    console.log(`[${processed}/${total}] ${status}`)
    // Example output:
    // [1/1334] ollama-32b (1 attempts)
    // [2/1334] ollama-32b (1 attempts)
    // [3/1334] ollama-14b (4 attempts)  ← Fallback happened
    // [4/1334] regex (5 attempts)       ← All Ollama failed
  }
})
```

### Quality Metrics

Monitor these metrics to assess system health:

1. **Primary Success Rate**: `ollama32b_count / total_count`
   - Target: >85%
   - Warning: <70%
   - Critical: <50%

2. **Ollama Success Rate**: `(ollama32b + ollama14b + ollama7b) / total_count`
   - Target: >95%
   - Warning: <85%
   - Critical: <70%

3. **Fallback Rate**: `(regex + fallback) / total_count`
   - Target: <5%
   - Warning: >15%
   - Critical: >30%

### Debugging

```typescript
// Enable debug logging
export DEBUG_BULLETPROOF=1

// Check Ollama health manually
curl http://127.0.0.1:11434/api/version

// Check Ollama models
curl http://127.0.0.1:11434/api/tags

// Monitor memory usage
watch -n 1 'ps aux | grep ollama | grep -v grep'
```

## Best Practices

### 1. Pre-Process Validation

Always validate before processing large documents:

```typescript
// Check Ollama is running
const health = await checkOllamaHealth()
if (!health) {
  throw new Error('Start Ollama: ollama serve')
}

// Check models are available
const has32b = await checkModelAvailability('qwen2.5:32b')
const has14b = await checkModelAvailability('qwen2.5:14b')
const has7b = await checkModelAvailability('qwen2.5:7b')

if (!has32b && !has14b && !has7b) {
  throw new Error('Pull at least one model: ollama pull qwen2.5:32b')
}
```

### 2. Memory Management

For documents >1000 chunks:

```bash
# Use smaller model to start
OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M npm run dev

# Or enable automatic fallback (system handles it)
# Default behavior in bulletproof-metadata.ts
```

### 3. Quality Review

For critical documents, review chunks that used fallback methods:

```typescript
const lowQualityChunks = [...results.values()]
  .filter(r => r.source === 'regex' || r.source === 'fallback')
  .map(r => r.metadata)

if (lowQualityChunks.length > 0) {
  console.warn(`${lowQualityChunks.length} chunks need manual review`)
  // Optionally: flag for manual review in UI
}
```

### 4. Cost vs Quality

Choose your strategy based on needs:

| Strategy | Cost | Quality | Use Case |
|----------|------|---------|----------|
| Ollama only | $0 | ~92% high | Personal use, testing |
| Ollama + Gemini | ~$0.05 | ~98% high | Production, important docs |
| Gemini only | ~$0.50 | ~99% high | Maximum quality needed |

## Troubleshooting

### Issue: High Fallback Rate (>15%)

**Symptoms:**
- Many chunks using regex/fallback
- Logs show repeated Ollama failures

**Diagnosis:**
```bash
# Check Ollama health
curl http://127.0.0.1:11434/api/version

# Check memory
free -h  # Linux
vm_stat  # macOS

# Check Ollama logs
journalctl -u ollama -f  # Linux
# macOS: Check Console.app for Ollama logs
```

**Solutions:**
1. Restart Ollama: `pkill ollama && ollama serve`
2. Reduce model size: Use 14B or 7B instead of 32B
3. Increase system RAM
4. Enable Gemini fallback temporarily

### Issue: Slow Processing (>90 minutes for 1334 chunks)

**Symptoms:**
- Processing takes >1 minute per chunk on average
- High number of retries

**Diagnosis:**
```bash
# Check Ollama response time
time curl -X POST http://127.0.0.1:11434/api/generate \
  -d '{"model": "qwen2.5:32b", "prompt": "test", "stream": false}'

# Should be <5 seconds
```

**Solutions:**
1. Use GPU acceleration if available
2. Switch to smaller model (14B or 7B)
3. Reduce concurrent processes
4. Upgrade hardware

### Issue: Circuit Breaker Keeps Opening

**Symptoms:**
- Logs show "Circuit breaker: open"
- Most chunks use regex extraction

**Diagnosis:**
- Systematic Ollama instability
- Resource exhaustion
- Model corruption

**Solutions:**
1. Restart Ollama completely
2. Re-pull model: `ollama pull qwen2.5:32b`
3. Check disk space: `df -h`
4. Check RAM: Ensure 32GB+ available

## Migration from Old System

If you have documents processed with the old system:

```typescript
// Old system (brittle)
try {
  const metadata = await extractMetadataBatch(chunks)
} catch (error) {
  console.error('Failed!')  // ← Document stuck
}

// New system (bulletproof)
const results = await bulletproofExtractMetadata(chunks)
// ← Always succeeds, quality tracked per-chunk
```

No migration needed - just restart the worker and reprocess failed documents.

## References

- **Source**: `worker/lib/chunking/bulletproof-metadata.ts`
- **Usage**: `worker/handlers/continue-processing.ts`
- **Dependencies**: PydanticAI, Ollama, Gemini (optional)
- **Related**: `worker/lib/chunking/pydantic-metadata.ts` (base extraction)
