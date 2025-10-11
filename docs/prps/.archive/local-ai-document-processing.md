# PRP: 100% Local AI Document Processing Pipeline

**Version:** 1.0
**Date:** January 2025
**Status:** Ready for Implementation
**Confidence Score:** 9/10

---

## Executive Summary

### Overview
Replace Gemini API-based document processing with 100% local AI inference using Ollama + Qwen 2.5 32B, eliminating all external API costs while maintaining processing quality. This is a **strategic replacement** of API calls within the existing infrastructure, not a ground-up rebuild.

### Business Value
- **Cost Elimination:** $0.54 per book → $0.00 per book (100% savings)
- **Unlimited Processing:** No budget constraints, process as many documents as needed
- **Complete Privacy:** All processing happens locally, no data leaves the machine
- **Quality Priority:** Willing to accept slower processing for better results (M1 Max 64GB)

### Scope
**In Scope:**
- Replace Gemini AI cleanup with Qwen 2.5 32B via Ollama
- Replace Gemini embeddings with sentence-transformers (local)
- Update thematic bridge engine to use local LLM
- Add retry logic with exponential backoff
- Python environment setup automation
- Enhanced progress reporting for local stages

**Out of Scope:**
- Rebuilding review checkpoint system (already exists and works)
- Rebuilding Obsidian integration (already exists)
- Backward compatibility with existing Gemini-processed documents
- Multi-model selection UI (can be added later)
- Performance optimization (quality > speed)

### Key Success Criteria
- ✅ Zero external API calls during document processing
- ✅ Processing completes end-to-end without manual intervention
- ✅ Metadata quality comparable to Gemini (>90% fields populated)
- ✅ Connection detection accuracy maintained
- ✅ Review checkpoints function identically to current system
- ✅ Can resume from any failed processing phase
- ✅ Exponential backoff handles transient failures gracefully

---

## Business Context

### Current State
**Existing Infrastructure (Keep):**
- ✅ Review checkpoint system (`worker/handlers/process-document.ts:237-305`)
- ✅ Obsidian export/sync for manual review (`worker/handlers/obsidian-sync.ts`)
- ✅ Continue processing handler (`worker/handlers/continue-processing.ts`)
- ✅ UI controls in DocumentPreview (`src/components/upload/DocumentPreview.tsx`)
- ✅ Database support for review stages (migration 044)
- ✅ Background jobs with progress tracking
- ✅ 3-engine collision detection system
- ✅ Docling PDF extraction

**Current Pain Points:**
- 💰 API costs: ~$0.54 per 500-page book adds up quickly
- 📊 Budget constraints limit testing and experimentation
- 🔒 Privacy concerns with sending documents to external APIs
- 🎯 Quality limitations from token/rate limits

### Target State
**100% Local Processing:**
- 🚀 Ollama + Qwen 2.5 32B for all AI tasks
- 🧬 Sentence-transformers for embeddings (768d vectors)
- ⚡ No external dependencies (except initial model download)
- 🎨 Unlimited processing capacity
- 🔐 Complete privacy (all data stays local)

### User Profile
- **Hardware:** M1 Max with 64GB RAM (plenty of resources)
- **Priority:** Quality over speed (willing to wait for better results)
- **Usage:** Personal tool, single user, no multi-tenancy concerns
- **Workflow:** Heavy use of Obsidian for manual review
- **Technical Comfort:** Can run `ollama serve` and Python scripts

---

## Technical Requirements

### System Requirements

#### Hardware
- **Minimum:** 16GB RAM, 30GB free disk space
- **Recommended:** 32GB+ RAM, 50GB free disk space
- **Target User:** M1 Max 64GB (well above minimum)

#### Software Dependencies
```bash
# System Requirements
- macOS 12+ (M1/M2 optimized) or Linux
- Python 3.11+
- Node.js 20+
- Ollama 0.4.4+

# Python Packages (scripts/requirements.txt)
ollama==0.4.4
pydantic-ai==0.0.10
pydantic==2.0+
sentence-transformers==3.3.0
torch>=2.0.0  # For sentence-transformers
```

#### Ollama Models
```bash
# Primary model (20GB download)
ollama pull qwen2.5:32b

# Embedding model (downloaded automatically by sentence-transformers)
# all-mpnet-base-v2 (~420MB)
```

### Architecture Principles

#### 1. Extend, Don't Rebuild
The existing pipeline infrastructure is solid. We're replacing API calls, not rebuilding the system.

**Keep Existing:**
- Background job orchestration
- Review checkpoint system (2 stages: docling_extraction, ai_cleanup)
- Obsidian integration for manual review
- Database schema (minimal changes needed)
- Stage tracking and progress reporting
- Error handling patterns

**Replace:**
- Gemini API calls → Ollama + Qwen 2.5 32B
- Gemini embeddings → sentence-transformers
- Thematic bridge AI analysis → Local LLM

#### 2. Python-TypeScript Bridge Pattern
Mirror the existing Docling integration pattern (`worker/lib/docling-extractor.ts:86-221`):
- TypeScript spawns Python subprocess
- Python sends JSON progress messages via stdout
- TypeScript parses results and updates job status
- Errors propagate through stderr

#### 3. Idempotent Processing with Stage Tracking
Use existing stage tracking from `process-document.ts`:
```typescript
// Stages: extracting → extracted → markdown_saved → chunked → embedded → complete
// Can resume from any stage after failure
```

#### 4. Review Checkpoints (Already Implemented)
Two review points (keep as-is):
1. **After Docling extraction** (`review_stage: 'docling_extraction'`)
   - User reviews raw extraction in Obsidian
   - Decides whether to run AI cleanup
2. **After AI cleanup** (`review_stage: 'ai_cleanup'`)
   - User reviews cleaned markdown in Obsidian
   - Confirms before chunking and metadata extraction

### Integration Points

#### Existing Systems to Preserve
1. **Background Jobs Table**
   - Job type: `'process_document'`
   - Input data includes: `reviewBeforeChunking`, `cleanMarkdown`, `reviewDoclingExtraction`
   - Progress tracking with stages

2. **Obsidian Integration**
   - Export to vault: `exportToObsidian(documentId, userId)`
   - Sync from vault: `syncFromObsidian(documentId, userId)`
   - URI protocol: `obsidian://advanced-uri?vault=...&filepath=...`

3. **Document Status Workflow**
   - `pending` → `processing` → `awaiting_manual_review` → `completed`
   - Review stage: `null | 'docling_extraction' | 'ai_cleanup'`

4. **Connection Detection Engines**
   - Semantic similarity (vector-based, no AI)
   - Contradiction detection (metadata-based, no AI)
   - Thematic bridge (AI-powered, needs update)

---

## Implementation Blueprint

### Phase 1: Python Environment & Ollama Setup

#### Files to Create

**`scripts/setup_local_models.sh`**
```bash
#!/bin/bash
# Automated setup script for local AI environment

echo "🚀 Setting up Rhizome Local AI Environment..."

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "📥 Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
fi

# Start Ollama service (background)
echo "🔧 Starting Ollama service..."
ollama serve > /dev/null 2>&1 &
sleep 2

# Pull Qwen 2.5 32B model
echo "📦 Pulling Qwen 2.5 32B model (20GB download)..."
ollama pull qwen2.5:32b

# Verify model availability
echo "✅ Verifying model installation..."
ollama list | grep "qwen2.5:32b" || exit 1

# Install Python dependencies
echo "📦 Installing Python dependencies..."
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt

# Test imports
echo "✅ Verifying Python packages..."
python3 -c "import ollama, pydantic_ai, sentence_transformers" || exit 1

# Download embedding model (cached by sentence-transformers)
echo "📦 Downloading embedding model..."
python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-mpnet-base-v2')"

echo "✨ Setup complete! You can now process documents locally."
```

**`scripts/requirements.txt`**
```txt
# Core dependencies for local AI processing
ollama>=0.4.4
pydantic-ai>=0.0.10
pydantic>=2.9.0
sentence-transformers>=3.3.0
torch>=2.0.0
numpy>=1.24.0
```

**`worker/lib/local-ai-client.ts`**
```typescript
/**
 * Bridge for calling local AI Python scripts
 * Mirrors pattern from docling-extractor.ts:86-221
 */
import { spawn } from 'child_process'
import path from 'path'

export interface LocalAIOptions {
  timeout?: number  // Milliseconds (default: 300000 = 5 minutes)
  onProgress?: (percent: number, message: string) => void
}

export interface LocalAIResult<T = any> {
  data: T
  metadata?: {
    model: string
    duration_ms: number
    retries: number
  }
}

/**
 * Call a Python script that uses local AI (Ollama/sentence-transformers)
 * @param scriptName - Python script filename in worker/scripts/
 * @param input - Input data (will be JSON stringified)
 * @param options - Configuration options
 */
export async function callLocalAI<T = any>(
  scriptName: string,
  input: any,
  options: LocalAIOptions = {}
): Promise<LocalAIResult<T>> {
  const scriptPath = path.join(process.cwd(), 'worker/scripts', scriptName)
  const timeout = options.timeout || 300000  // 5 minute default

  return new Promise((resolve, reject) => {
    const python = spawn('python3', ['-u', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let result: LocalAIResult<T> | null = null
    let stderr = ''

    // Send input via stdin
    python.stdin.write(JSON.stringify(input))
    python.stdin.end()

    // Parse stdout for results and progress
    python.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter((l: string) => l.trim())

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)

          if (parsed.type === 'progress') {
            options.onProgress?.(parsed.percent, parsed.message)
          } else if (parsed.type === 'result') {
            result = parsed
          } else {
            // Final result without 'type' field
            result = { data: parsed }
          }
        } catch (e) {
          // Non-JSON output, ignore
          console.debug('[LocalAI] Non-JSON output:', line)
        }
      }
    })

    // Capture stderr for error reporting
    python.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Handle completion
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed with code ${code}: ${stderr}`))
      } else if (result) {
        resolve(result)
      } else {
        reject(new Error('No result from Python script'))
      }
    })

    // Timeout handling
    const timer = setTimeout(() => {
      python.kill()
      reject(new Error(`Script timeout after ${timeout}ms`))
    }, timeout)

    python.on('close', () => clearTimeout(timer))
  })
}

/**
 * Check if Ollama server is running and model is available
 */
export async function checkOllamaAvailability(model: string = 'qwen2.5:32b'): Promise<{
  serverRunning: boolean
  modelAvailable: boolean
  error?: string
}> {
  try {
    const result = await callLocalAI('check_ollama.py', { model }, { timeout: 5000 })
    return result.data
  } catch (error) {
    return {
      serverRunning: false,
      modelAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

**`worker/scripts/check_ollama.py`**
```python
#!/usr/bin/env python3
"""
Check Ollama server availability and model status
"""
import sys
import json
from ollama import Client, ResponseError

def check_availability(model: str) -> dict:
    """Check if Ollama is running and model is available"""
    try:
        client = Client(host='http://localhost:11434')

        # Check server connectivity
        try:
            models = client.list()
            server_running = True
        except Exception as e:
            return {
                'serverRunning': False,
                'modelAvailable': False,
                'error': f'Ollama server not running: {str(e)}'
            }

        # Check if specific model is available
        model_names = [m['name'] for m in models['models']]
        model_available = any(model in name for name in model_names)

        if not model_available:
            return {
                'serverRunning': True,
                'modelAvailable': False,
                'error': f'Model {model} not found. Run: ollama pull {model}'
            }

        return {
            'serverRunning': True,
            'modelAvailable': True
        }

    except Exception as e:
        return {
            'serverRunning': False,
            'modelAvailable': False,
            'error': str(e)
        }

if __name__ == '__main__':
    input_data = json.loads(sys.stdin.read())
    model = input_data.get('model', 'qwen2.5:32b')

    result = check_availability(model)
    print(json.dumps({'type': 'result', 'data': result}))
```

**Acceptance Criteria:**
- ✅ Setup script runs without errors
- ✅ Ollama service starts automatically
- ✅ Qwen 2.5 32B model downloads successfully (20GB)
- ✅ Python dependencies install without conflicts
- ✅ Embedding model downloads and caches
- ✅ `checkOllamaAvailability()` returns true for server and model

**References:**
- Ollama installation: https://ollama.com/download
- PydanticAI docs: https://ai.pydantic.dev/install/
- Sentence-transformers: https://www.sbert.net/docs/installation.html

---

### Phase 2: Replace Gemini AI Cleanup

#### Files to Modify

**`worker/lib/markdown-cleanup-ai.ts`** (existing file)
```typescript
/**
 * BEFORE: Used Gemini AI via @google/genai
 * AFTER: Uses Qwen 2.5 32B via Ollama + PydanticAI
 *
 * Keep: Multi-pass cleanup structure (3 passes)
 * Replace: API calls with local inference
 */
import { GoogleGenerativeAI } from '@google/genai'  // REMOVE THIS
import { callLocalAI } from './local-ai-client.js'  // ADD THIS

export interface CleanupResult {
  cleanedMarkdown: string
  changes: string[]
  warnings: string[]
  stats: {
    originalLength: number
    cleanedLength: number
    passCount: number
  }
}

/**
 * Clean PDF-extracted markdown using local AI (Qwen 2.5 32B)
 * Replaces: cleanPdfMarkdown() function
 */
export async function cleanPdfMarkdownLocal(
  markdown: string,
  options: {
    onProgress?: (stage: string, percent: number) => void
  } = {}
): Promise<CleanupResult> {
  console.log('[CleanupAI] Starting local AI cleanup (Qwen 2.5 32B)...')

  const result = await callLocalAI<CleanupResult>(
    'cleanup_markdown.py',
    {
      markdown,
      passes: 3,  // Same as before: artifact removal, formatting, polish
      model: 'qwen2.5:32b'
    },
    {
      timeout: 600000,  // 10 minutes (local can be slower)
      onProgress: (percent, message) => {
        // Map Python progress to worker progress
        const stage = message.includes('Pass 1') ? 'cleanup_pass_1'
          : message.includes('Pass 2') ? 'cleanup_pass_2'
          : message.includes('Pass 3') ? 'cleanup_pass_3'
          : 'cleanup_ai'

        options.onProgress?.(stage, percent)
      }
    }
  )

  console.log('[CleanupAI] Cleanup complete:', {
    originalLength: result.data.stats.originalLength,
    cleanedLength: result.data.stats.cleanedLength,
    changesMade: result.data.changes.length
  })

  return result.data
}

// Keep old function for backward compatibility (optional)
export async function cleanPdfMarkdown(...args: any[]) {
  throw new Error('Legacy Gemini cleanup deprecated. Use cleanPdfMarkdownLocal()')
}
```

#### Files to Create

**`worker/scripts/cleanup_markdown.py`**
```python
#!/usr/bin/env python3
"""
Multi-pass markdown cleanup using Qwen 2.5 32B via PydanticAI
Replaces: Gemini-based cleanup in markdown-cleanup-ai.ts
"""
import sys
import json
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from typing import List

# Define structured output for each cleanup pass
class CleanupPassResult(BaseModel):
    cleaned_content: str = Field(description="Cleaned markdown content")
    changes_made: List[str] = Field(description="List of changes applied")
    warnings: List[str] = Field(default_factory=list, description="Potential issues found")

# Initialize PydanticAI agent
cleanup_agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=CleanupPassResult,
    retries=3  # Automatic retry on validation failure
)

async def cleanup_pass_1(markdown: str) -> CleanupPassResult:
    """Pass 1: Remove artifacts and noise"""
    prompt = f"""
You are cleaning a markdown document extracted from a PDF. Your task for Pass 1:

**Remove these artifacts:**
1. Page numbers (e.g., "42", "Page 42")
2. Running headers and footers (repeated text across pages)
3. OCR artifacts (random characters, misread text)
4. Hyphenation artifacts (words split across lines like "hyphen-\\nated")

**Preserve:**
- All actual content (paragraphs, headings, lists)
- Markdown structure (# headings, - lists, > quotes)
- Technical terms and proper nouns
- Code blocks and formulas

**Document:**
```markdown
{markdown[:50000]}  # First 50k chars to stay within context
```

Return the cleaned content and list what changes you made.
"""
    result = await cleanup_agent.run(prompt)
    return result.data

async def cleanup_pass_2(markdown: str) -> CleanupPassResult:
    """Pass 2: Fix formatting issues"""
    prompt = f"""
You are fixing formatting in a partially cleaned markdown document. Pass 2 tasks:

**Fix these formatting issues:**
1. Merge incorrectly split paragraphs (text ending mid-sentence)
2. Fix hyphenation: "hyphen-\\nated" → "hyphenated"
3. Normalize inconsistent spacing (3+ newlines → 2 newlines)
4. Ensure proper heading hierarchy (h1 → h2 → h3, no skipping levels)
5. Fix broken lists and quotes

**Do NOT:**
- Make content changes (only formatting)
- Remove any actual text
- Change technical terms

**Document:**
```markdown
{markdown[:50000]}
```

Return the formatted content and list what you fixed.
"""
    result = await cleanup_agent.run(prompt)
    return result.data

async def cleanup_pass_3(markdown: str) -> CleanupPassResult:
    """Pass 3: Final polish and validation"""
    prompt = f"""
Final polish pass for cleaned markdown. Your tasks:

**Validate:**
1. Markdown syntax is correct (no broken links, lists, quotes)
2. Heading hierarchy makes sense (logical flow)
3. No remaining obvious artifacts or errors

**Minor fixes only:**
- Fix any remaining spacing issues
- Correct minor typos in formatting (not content)
- Ensure consistency (e.g., all lists use same marker)

**Report warnings:**
- If you see potential content issues (but don't fix them)
- If structure seems unusual but intentional

**Document:**
```markdown
{markdown[:50000]}
```

Return final content, any minor fixes, and warnings about potential issues.
"""
    result = await cleanup_agent.run(prompt)
    return result.data

async def multi_pass_cleanup(markdown: str, passes: int = 3) -> dict:
    """Execute all cleanup passes"""
    current_content = markdown
    all_changes = []
    all_warnings = []

    original_length = len(markdown)

    for pass_num in [1, 2, 3][:passes]:
        # Send progress update
        progress = {
            'type': 'progress',
            'percent': 0.60 + (pass_num * 0.10),  # 60%, 70%, 80%
            'message': f'AI cleanup: Pass {pass_num}/3'
        }
        print(json.dumps(progress), flush=True)

        # Execute pass
        if pass_num == 1:
            result = await cleanup_pass_1(current_content)
        elif pass_num == 2:
            result = await cleanup_pass_2(current_content)
        else:
            result = await cleanup_pass_3(current_content)

        current_content = result.cleaned_content
        all_changes.extend(result.changes_made)
        all_warnings.extend(result.warnings)

    return {
        'cleanedMarkdown': current_content,
        'changes': all_changes,
        'warnings': all_warnings,
        'stats': {
            'originalLength': original_length,
            'cleanedLength': len(current_content),
            'passCount': passes
        }
    }

if __name__ == '__main__':
    # Read input from stdin
    input_data = json.loads(sys.stdin.read())
    markdown = input_data['markdown']
    passes = input_data.get('passes', 3)

    # Run async cleanup
    import asyncio
    result = asyncio.run(multi_pass_cleanup(markdown, passes))

    # Output result
    print(json.dumps({'type': 'result', 'data': result}))
```

**Integration Point:** `worker/handlers/process-document.ts`

Find this section (around line 180):
```typescript
// BEFORE (Gemini)
const { cleanPdfMarkdown } = await import('../lib/markdown-cleanup-ai.js')
markdown = await cleanPdfMarkdown(ai, markdown, { onProgress: updateProgress })

// AFTER (Local AI)
const { cleanPdfMarkdownLocal } = await import('../lib/markdown-cleanup-ai.js')
markdown = await cleanPdfMarkdownLocal(markdown, {
  onProgress: (stage, percent) => updateProgress(percent, stage)
})
```

**Acceptance Criteria:**
- ✅ Three cleanup passes execute successfully
- ✅ PydanticAI validates output structure (auto-retry on failure)
- ✅ Progress updates show in job status
- ✅ Changes are logged for review
- ✅ Warnings surface potential issues
- ✅ Processing time <10 minutes for typical document (acceptable on M1 Max)
- ✅ Quality comparable to Gemini (manual validation)

**References:**
- PydanticAI agents: https://ai.pydantic.dev/agents/
- Ollama model options: https://github.com/ollama/ollama/blob/main/docs/modelfile.md
- Qwen 2.5 capabilities: https://qwenlm.github.io/blog/qwen2.5/

---

### Phase 3: Local Embedding Generation

#### Files to Create

**`worker/scripts/generate_embeddings.py`**
```python
#!/usr/bin/env python3
"""
Generate embeddings using sentence-transformers (local)
Replaces: Gemini text-embedding-001 API
"""
import sys
import json
from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np

# Global model cache (loaded once per process)
_model = None

def get_model(model_name: str = 'sentence-transformers/all-mpnet-base-v2') -> SentenceTransformer:
    """Load or get cached embedding model"""
    global _model
    if _model is None:
        print(json.dumps({
            'type': 'progress',
            'percent': 0.10,
            'message': f'Loading embedding model: {model_name}'
        }), flush=True)
        _model = SentenceTransformer(model_name)
    return _model

def generate_embeddings(
    texts: List[str],
    model_name: str = 'sentence-transformers/all-mpnet-base-v2',
    batch_size: int = 32
) -> List[List[float]]:
    """
    Generate embeddings for list of texts

    Args:
        texts: List of text strings to embed
        model_name: Model identifier (default: all-mpnet-base-v2)
        batch_size: Number of texts to process at once (default: 32)

    Returns:
        List of 768-dimensional embedding vectors
    """
    model = get_model(model_name)

    # Progress updates
    total_batches = (len(texts) + batch_size - 1) // batch_size
    print(json.dumps({
        'type': 'progress',
        'percent': 0.20,
        'message': f'Generating embeddings for {len(texts)} texts'
    }), flush=True)

    # Generate embeddings with progress
    embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        batch_embeddings = model.encode(
            batch,
            show_progress_bar=False,
            convert_to_numpy=True
        )
        embeddings.extend(batch_embeddings.tolist())

        # Progress update
        progress = 0.20 + (0.70 * (i + batch_size) / len(texts))
        print(json.dumps({
            'type': 'progress',
            'percent': min(progress, 0.90),
            'message': f'Embedded {min(i + batch_size, len(texts))}/{len(texts)} texts'
        }), flush=True)

    return embeddings

if __name__ == '__main__':
    input_data = json.loads(sys.stdin.read())
    texts = input_data['texts']
    model_name = input_data.get('model', 'sentence-transformers/all-mpnet-base-v2')
    batch_size = input_data.get('batch_size', 32)

    embeddings = generate_embeddings(texts, model_name, batch_size)

    # Output result
    result = {
        'embeddings': embeddings,
        'model': model_name,
        'dimensions': len(embeddings[0]) if embeddings else 0,
        'count': len(embeddings)
    }
    print(json.dumps({'type': 'result', 'data': result}))
```

#### Files to Modify

**`worker/lib/embeddings.ts`** (existing file)
```typescript
/**
 * BEFORE: Used Vercel AI SDK with @ai-sdk/google
 * AFTER: Uses sentence-transformers via Python
 *
 * Keep: 768-dimensional vectors for pgvector compatibility
 */
import { callLocalAI } from './local-ai-client.js'

/**
 * Generate embeddings using local sentence-transformers model
 * @param texts - Array of text strings to embed
 * @param model - Model name (default: all-mpnet-base-v2)
 * @returns Array of 768-dimensional embedding vectors
 */
export async function generateEmbeddings(
  texts: string[],
  model: string = 'sentence-transformers/all-mpnet-base-v2'
): Promise<number[][]> {
  console.log(`[Embeddings] Generating ${texts.length} embeddings locally...`)

  const result = await callLocalAI<{
    embeddings: number[][]
    model: string
    dimensions: number
    count: number
  }>(
    'generate_embeddings.py',
    {
      texts,
      model,
      batch_size: 32  // Optimal for most hardware
    },
    {
      timeout: 600000,  // 10 minutes for large batches
      onProgress: (percent, message) => {
        console.log(`[Embeddings] ${message}`)
      }
    }
  )

  // Validate output
  if (result.data.dimensions !== 768) {
    throw new Error(`Expected 768 dimensions, got ${result.data.dimensions}`)
  }

  if (result.data.count !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${result.data.count}`)
  }

  console.log(`[Embeddings] ✅ Generated ${result.data.count} embeddings (${result.data.dimensions}d)`)

  return result.data.embeddings
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([text])
  return embeddings[0]
}
```

**Integration Point:** `worker/handlers/process-document.ts`

Find the embedding generation section (around line 290):
```typescript
// BEFORE (Gemini via Vercel AI SDK)
import { generateEmbeddings } from '../lib/embeddings.js'
const embeddings = await generateEmbeddings(chunkTexts)  // Uses Gemini

// AFTER (sentence-transformers - same function signature!)
import { generateEmbeddings } from '../lib/embeddings.js'
const embeddings = await generateEmbeddings(chunkTexts)  // Uses local model
// No other changes needed - function signature is identical!
```

**Acceptance Criteria:**
- ✅ Embeddings are 768-dimensional (compatible with existing pgvector schema)
- ✅ Batch processing works (32 texts at a time)
- ✅ Progress updates visible in job status
- ✅ Model loads and caches (subsequent calls are fast)
- ✅ Quality comparable to Gemini embeddings (cosine similarity tests)
- ✅ No API calls to external services

**References:**
- Sentence-transformers docs: https://www.sbert.net/
- all-mpnet-base-v2 model: https://huggingface.co/sentence-transformers/all-mpnet-base-v2
- Embedding best practices: https://www.sbert.net/docs/pretrained_models.html

---

### Phase 4: Update Connection Detection Engines

#### Files to Modify

**`worker/engines/thematic-bridge.ts`** (existing file - only engine using AI)

Current pattern (from `detect-connections.ts:40-62`):
```typescript
const result = await processDocument(document_id, {
  enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
  thematicBridge: {
    minImportance: 0.6,
    minStrength: 0.6,
    maxSourceChunks: 50,
    maxCandidatesPerSource: 10,
    batchSize: 5
  }
})
```

**Changes needed:**
1. Replace Gemini AI calls with Qwen 2.5 32B
2. Keep filtering logic (importance > 0.6, cross-document, different domains)
3. Keep batch processing (5 at a time)

```typescript
/**
 * Thematic Bridge Engine - AI-powered cross-domain connections
 * MODIFIED: Replace Gemini with Qwen 2.5 32B via Ollama
 */
import { callLocalAI } from '../lib/local-ai-client.js'

/**
 * Analyze potential thematic bridge using local LLM
 * Replaces: Gemini generateContent() calls
 */
async function analyzeBridgeLocal(
  sourceChunk: ChunkWithMetadata,
  targetChunk: ChunkWithMetadata
): Promise<{
  connected: boolean
  strength: number  // 0-1
  explanation: string
  bridgeType: string
  sharedConcept?: string
}> {
  const result = await callLocalAI<any>(
    'analyze_thematic_bridge.py',
    {
      source: {
        content: sourceChunk.content.slice(0, 1000),  // First 1000 chars
        concepts: sourceChunk.metadata?.concepts || [],
        themes: sourceChunk.metadata?.themes || [],
        domain: sourceChunk.metadata?.domain
      },
      target: {
        content: targetChunk.content.slice(0, 1000),
        concepts: targetChunk.metadata?.concepts || [],
        themes: targetChunk.metadata?.themes || [],
        domain: targetChunk.metadata?.domain
      },
      model: 'qwen2.5:32b'
    },
    {
      timeout: 30000  // 30 seconds per analysis
    }
  )

  return result.data
}

// Update the main detection function to use local AI
// Rest of the engine logic stays the same (filtering, batching, scoring)
```

#### Files to Create

**`worker/scripts/analyze_thematic_bridge.py`**
```python
#!/usr/bin/env python3
"""
Analyze thematic bridge connections using Qwen 2.5 32B
Replaces: Gemini-based thematic bridge analysis
"""
import sys
import json
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from typing import Optional

class ThematicBridgeAnalysis(BaseModel):
    connected: bool = Field(description="Are these chunks thematically connected?")
    strength: float = Field(ge=0.0, le=1.0, description="Connection strength (0-1)")
    explanation: str = Field(description="Brief explanation of the connection")
    bridgeType: str = Field(description="Type of bridge: conceptual, metaphorical, causal, etc.")
    sharedConcept: Optional[str] = Field(default=None, description="Key concept linking them")

# Initialize agent
bridge_agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=ThematicBridgeAnalysis,
    retries=2
)

async def analyze_bridge(source: dict, target: dict) -> ThematicBridgeAnalysis:
    """Analyze if two chunks have a thematic bridge"""

    prompt = f"""
You are analyzing whether two text chunks have a meaningful thematic connection across different domains.

**Source Chunk:**
- Domain: {source.get('domain', 'unknown')}
- Themes: {', '.join(source.get('themes', []))}
- Key concepts: {', '.join([c['text'] for c in source.get('concepts', [])])}
- Content preview: {source['content'][:500]}

**Target Chunk:**
- Domain: {target.get('domain', 'unknown')}
- Themes: {', '.join(target.get('themes', []))}
- Key concepts: {', '.join([c['text'] for c in target.get('concepts', [])])}
- Content preview: {target['content'][:500]}

**Your task:**
Determine if there's a meaningful thematic bridge between these chunks. A bridge exists when:
1. They discuss related concepts from different angles/domains
2. One illustrates or exemplifies ideas from the other
3. They share underlying principles or patterns
4. They have causal or metaphorical relationships

**Do NOT connect if:**
- They're just similar (that's semantic similarity, not a bridge)
- The connection is trivial or surface-level
- They merely share common words without deeper meaning

Rate the connection strength:
- 0.0-0.4: Weak or no connection
- 0.5-0.7: Moderate connection worth noting
- 0.8-1.0: Strong, insightful cross-domain bridge

Return your analysis with reasoning.
"""

    result = await bridge_agent.run(prompt)
    return result.data

if __name__ == '__main__':
    input_data = json.loads(sys.stdin.read())
    source = input_data['source']
    target = input_data['target']

    import asyncio
    result = asyncio.run(analyze_bridge(source, target))

    print(json.dumps({'type': 'result', 'data': result.model_dump()}))
```

**Keep As-Is:**
- `worker/engines/semantic-similarity.ts` - Uses pgvector only (no AI)
- `worker/engines/contradiction-detection.ts` - Uses metadata only (no AI)
- `worker/engines/orchestrator.ts` - Coordination logic unchanged

**Acceptance Criteria:**
- ✅ Thematic bridge engine uses Qwen 2.5 32B
- ✅ Filtering logic unchanged (importance > 0.6, cross-document)
- ✅ Batch processing works (5 analyses at a time)
- ✅ Connection quality comparable to Gemini
- ✅ Processing time acceptable (<30s per analysis pair)
- ✅ No API calls to external services

**References:**
- Existing engine patterns: `worker/engines/` directory
- Orchestrator integration: `worker/engines/orchestrator.ts`
- Connection storage: `worker/engines/semantic-similarity.ts:saveChunkConnections()`

---

### Phase 5: Retry Logic & Recovery

#### Files to Modify/Create

**`worker/lib/retry-utils.ts`** (new file)
```typescript
/**
 * Retry utilities with exponential backoff
 * Used throughout local AI pipeline for resilience
 */

export interface RetryOptions {
  maxRetries?: number    // Default: 5
  baseDelay?: number     // Default: 1000ms
  maxDelay?: number      // Default: 16000ms
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Retry a function with exponential backoff
 * Delays: 1s, 2s, 4s, 8s, 16s (max)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 16000,
    onRetry
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // Don't retry on last attempt
      if (attempt === maxRetries - 1) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

      console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`)
      onRetry?.(attempt + 1, lastError)

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError!
}

/**
 * Check if error is retryable (vs fatal)
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()

  // Retryable: Temporary issues
  const retryable = [
    'timeout',
    'connection',
    'econnrefused',
    'enotfound',
    'network',
    'temporary'
  ]

  // Fatal: Configuration or validation issues
  const fatal = [
    'model not found',
    'validation failed',
    'invalid input',
    'authentication'
  ]

  // Check if error is fatal
  if (fatal.some(keyword => message.includes(keyword))) {
    return false
  }

  // Check if error is retryable
  return retryable.some(keyword => message.includes(keyword))
}
```

**Integration:** Update `worker/handlers/process-document.ts`

Wrap Ollama/AI calls with retry logic:
```typescript
import { withRetry, isRetryableError } from '../lib/retry-utils.js'

// Example: Wrap AI cleanup with retry
const markdown = await withRetry(
  async () => await cleanPdfMarkdownLocal(rawMarkdown, { onProgress }),
  {
    maxRetries: 3,
    onRetry: (attempt, error) => {
      console.log(`[ProcessDocument] Cleanup retry ${attempt}: ${error.message}`)
      updateProgress(50 + (attempt * 2), 'cleanup_ai', `Retry ${attempt}/3`)
    }
  }
)

// Example: Wrap embedding generation with retry
const embeddings = await withRetry(
  async () => await generateEmbeddings(chunkTexts),
  {
    maxRetries: 3,
    onRetry: (attempt) => {
      updateProgress(85 + attempt, 'embeddings', `Retry ${attempt}/3`)
    }
  }
)
```

**Stage Tracking:** Use existing pattern from `process-document.ts`

```typescript
// Stages are already tracked in database
// Can resume from any completed stage:
const stages = [
  'extracting',
  'extracted',
  'markdown_saved',
  'awaiting_manual_review',  // Checkpoint
  'chunked',
  'embedded',
  'complete'
]

// Resume from last completed stage
async function resumeProcessing(documentId: string, fromStage: string) {
  // Implementation already exists in continue-processing.ts
  // Just add retry logic around each stage
}
```

**Acceptance Criteria:**
- ✅ Exponential backoff works (1s, 2s, 4s, 8s, 16s max)
- ✅ Transient errors retry automatically (network, timeout)
- ✅ Fatal errors fail immediately (model not found, validation)
- ✅ Retry attempts logged with progress updates
- ✅ Can resume from any failed stage
- ✅ User notified on final failure with suggested actions

---

### Phase 6: Testing & Validation

#### New Test Files

**`worker/tests/local-pipeline.test.ts`**
```typescript
/**
 * End-to-end tests for local AI pipeline
 */
import { describe, test, expect, beforeAll } from '@jest/globals'
import { checkOllamaAvailability } from '../lib/local-ai-client'
import { generateEmbeddings } from '../lib/embeddings'
import { cleanPdfMarkdownLocal } from '../lib/markdown-cleanup-ai'

describe('Local AI Pipeline', () => {
  beforeAll(async () => {
    // Verify Ollama is running
    const status = await checkOllamaAvailability('qwen2.5:32b')
    if (!status.serverRunning) {
      throw new Error('Ollama not running. Start with: ollama serve')
    }
    if (!status.modelAvailable) {
      throw new Error('Qwen 2.5 32B not available. Run: ollama pull qwen2.5:32b')
    }
  })

  test('should check Ollama availability', async () => {
    const status = await checkOllamaAvailability()
    expect(status.serverRunning).toBe(true)
    expect(status.modelAvailable).toBe(true)
  })

  test('should generate embeddings locally', async () => {
    const texts = [
      'This is a test sentence.',
      'Another test sentence for embeddings.'
    ]

    const embeddings = await generateEmbeddings(texts)

    expect(embeddings).toHaveLength(2)
    expect(embeddings[0]).toHaveLength(768)  // 768 dimensions
    expect(embeddings[1]).toHaveLength(768)
  })

  test('should clean markdown with local AI', async () => {
    const dirtyMarkdown = `
Page 42

# Chapter Title

This is a para-
graph that was split.

# Chapter Title

More content here.

Page 43
    `.trim()

    const result = await cleanPdfMarkdownLocal(dirtyMarkdown)

    expect(result.cleanedMarkdown).toBeTruthy()
    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.cleanedMarkdown).not.toContain('Page 42')
    expect(result.cleanedMarkdown).not.toContain('Page 43')
  }, 120000)  // 2 minute timeout

  test('should process full document pipeline', async () => {
    // This would test: extract → clean → chunk → embed → connect
    // Implementation depends on having test fixtures
  }, 300000)  // 5 minute timeout
})
```

**`worker/scripts/validate_local_quality.py`**
```python
#!/usr/bin/env python3
"""
Validate local AI output quality against known good examples
"""
import sys
import json
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def validate_embedding_quality(test_cases: list) -> dict:
    """Validate that local embeddings maintain quality"""
    model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')

    results = []
    for case in test_cases:
        # Generate embeddings for similar and dissimilar pairs
        emb1 = model.encode([case['text1']])[0]
        emb2 = model.encode([case['text2']])[0]

        similarity = cosine_similarity([emb1], [emb2])[0][0]

        results.append({
            'pair': f"{case['text1'][:50]}... vs {case['text2'][:50]}...",
            'expected': case['expected_similarity'],
            'actual': float(similarity),
            'pass': abs(similarity - case['expected_similarity']) < 0.15
        })

    return {
        'total': len(results),
        'passed': sum(1 for r in results if r['pass']),
        'results': results
    }

if __name__ == '__main__':
    # Example test cases
    test_cases = [
        {
            'text1': 'The cat sat on the mat.',
            'text2': 'A feline rested on the rug.',
            'expected_similarity': 0.7  # High similarity
        },
        {
            'text1': 'Machine learning is fascinating.',
            'text2': 'I love cooking Italian food.',
            'expected_similarity': 0.1  # Low similarity
        }
    ]

    results = validate_embedding_quality(test_cases)
    print(json.dumps(results, indent=2))
```

#### Validation Commands

Add to `worker/package.json`:
```json
{
  "scripts": {
    "test:local-pipeline": "jest tests/local-pipeline.test.ts",
    "validate:local-quality": "python3 scripts/validate_local_quality.py",
    "validate:ollama": "python3 scripts/check_ollama.py",
    "test:full-local": "npm run validate:ollama && npm run test:local-pipeline && npm run validate:local-quality"
  }
}
```

#### Quality Comparison Checklist

**Manual Validation Steps:**
1. **Process same document with both systems:**
   - Keep one processed with Gemini
   - Reprocess with local AI
   - Compare outputs side-by-side

2. **Metadata quality:**
   - Check field population rates (should be >90%)
   - Verify concepts are relevant and well-scored
   - Validate emotional tone detection accuracy

3. **Connection detection:**
   - Compare connection counts (should be similar)
   - Verify thematic bridge quality (manual review of 10 connections)
   - Check false positive rate

4. **Review checkpoints:**
   - Test both checkpoint stages work identically
   - Verify Obsidian export/sync functions
   - Confirm continue-processing resumes correctly

**Acceptance Criteria:**
- ✅ All automated tests pass
- ✅ Ollama availability check succeeds
- ✅ Embedding quality validation passes (>85% test cases)
- ✅ Cleanup quality comparable to Gemini (manual review)
- ✅ Connection detection finds similar patterns
- ✅ Processing completes end-to-end without errors
- ✅ Zero API calls to external services (verified with network monitoring)

---

## Database Changes

### Migration 045

**File:** `supabase/migrations/045_local_ai_processing.sql`

```sql
-- Add fields to track local AI processing
-- Migration 045: Local AI processing metadata

-- Add processing engine tracking to documents
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS processing_engine TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS model_version TEXT,
ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER;

COMMENT ON COLUMN documents.processing_engine IS 'AI engine used: "gemini" (legacy) or "local" (Ollama)';
COMMENT ON COLUMN documents.model_version IS 'Model identifier (e.g., "qwen2.5:32b", "gemini-2.0-flash")';
COMMENT ON COLUMN documents.processing_duration_ms IS 'Total processing time in milliseconds';

-- Add embedding model tracking to chunks
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'sentence-transformers/all-mpnet-base-v2';

COMMENT ON COLUMN chunks.embedding_model IS 'Model used for embedding generation';

-- Add cost tracking to background jobs (will be $0 for local)
ALTER TABLE background_jobs
ADD COLUMN IF NOT EXISTS processing_cost DECIMAL(10, 4) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

COMMENT ON COLUMN background_jobs.processing_cost IS 'Cost in USD ($0.00 for local processing)';
COMMENT ON COLUMN background_jobs.retry_count IS 'Number of retry attempts';

-- Create index for filtering by processing engine
CREATE INDEX IF NOT EXISTS idx_documents_processing_engine
ON documents(processing_engine);

-- Create index for analyzing processing performance
CREATE INDEX IF NOT EXISTS idx_documents_processing_duration
ON documents(processing_duration_ms)
WHERE processing_duration_ms IS NOT NULL;
```

**Apply Migration:**
```bash
cd /Users/topher/Code/rhizome-v2
npx supabase db reset  # Applies all migrations including 045
```

---

## Environment Configuration

### Environment Variables

**`.env.local` and `worker/.env`**
```bash
# Existing variables (keep these)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Remove (no longer needed)
# GOOGLE_AI_API_KEY=<gemini key>
# GEMINI_MODEL=gemini-2.5-flash-lite

# Add: Local AI Configuration
OLLAMA_HOST=http://localhost:11434
LOCAL_LLM_MODEL=qwen2.5:32b
EMBEDDING_MODEL=sentence-transformers/all-mpnet-base-v2

# Optional: Feature flags during transition
USE_LOCAL_MODELS=true
FALLBACK_TO_GEMINI=false  # Set true if you want fallback during testing
```

### System Prerequisites

**Checklist before starting:**
```bash
# 1. Check Ollama installation
which ollama || echo "Install from: https://ollama.com/download"

# 2. Check Python version
python3 --version  # Should be 3.11+

# 3. Check available disk space
df -h  # Need ~30GB free (20GB for model, 10GB for processing)

# 4. Check available RAM
# macOS: Activity Monitor → Memory tab
# Should have 16GB+ RAM, ideally 32GB+

# 5. Verify Node.js version
node --version  # Should be 20+
```

---

## Error Handling & Edge Cases

### Common Scenarios & Solutions

#### 1. Ollama Server Not Running

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:11434`

**Detection:**
```typescript
const status = await checkOllamaAvailability()
if (!status.serverRunning) {
  throw new Error('Ollama not running. Start with: ollama serve')
}
```

**Solution:**
```bash
# Start Ollama server
ollama serve

# Or use systemd/launchd for auto-start
# macOS: brew services start ollama
```

**User-facing message:**
```
❌ Processing failed: Ollama server not running

To fix:
1. Open a terminal
2. Run: ollama serve
3. Keep terminal open
4. Click "Retry" to resume processing
```

#### 2. Model Not Downloaded

**Error:** `model 'qwen2.5:32b' not found`

**Detection & Auto-fix:**
```python
from ollama import Client, ResponseError

try:
    response = client.generate(model='qwen2.5:32b', prompt=prompt)
except ResponseError as e:
    if e.status_code == 404:
        # Auto-pull model with progress
        for progress in client.pull('qwen2.5:32b', stream=True):
            print(json.dumps({
                'type': 'progress',
                'percent': progress.get('completed', 0) / progress.get('total', 1) * 100,
                'message': f"Downloading model: {progress.get('status', '')}"
            }))
        # Retry original request
        response = client.generate(model='qwen2.5:32b', prompt=prompt)
```

#### 3. Low Confidence Metadata

**Scenario:** PydanticAI validation fails after 3 retries OR confidence score < 0.7

**Handling:**
```typescript
try {
  const metadata = await extractMetadata(chunk)

  // Check confidence
  if (metadata.confidence < 0.7) {
    // Mark for review
    await supabase.from('documents').update({
      processing_status: 'needs_review',
      review_reason: 'low_confidence_metadata',
      review_details: {
        failedChunks: [chunk.chunk_index],
        confidence: metadata.confidence
      }
    }).eq('id', documentId)

    // Offer retry in UI
  }
} catch (error) {
  if (error.message.includes('validation')) {
    // PydanticAI gave up after retries
    // Mark for review and offer manual cleanup
    await markForReview(documentId, 'metadata_validation_failed')
  }
}
```

**User notification:**
```
⚠️ Metadata extraction had low confidence (score: 0.65)

Options:
1. Accept results and continue
2. Run another cleanup pass with different prompts
3. Review and edit markdown in Obsidian, then retry
```

#### 4. Memory Exhaustion

**Scenario:** Processing 1000+ page document exceeds available RAM

**Detection:**
```typescript
// Monitor memory usage (Node.js)
const used = process.memoryUsage()
if (used.heapUsed > 8_000_000_000) {  // 8GB
  console.warn('[Memory] High memory usage detected, consider batching')
}
```

**Solution:**
```typescript
// Batch large documents
const BATCH_SIZE = 100  // Process 100 pages at a time
if (pageCount > 500) {
  for (let start = 0; start < pageCount; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, pageCount)
    await processBatch(start, end)
    // Free memory between batches
    if (global.gc) global.gc()
  }
}
```

#### 5. Phase Failure Mid-Pipeline

**User requirement:** "retry from last completed phase"

**Implementation:**
```typescript
// Track completed stages in database
const stages = [
  'extracting',    // Docling extraction
  'extracted',     // Raw markdown saved
  'cleaned',       // AI cleanup complete
  'chunked',       // Chunks created
  'embedded',      // Embeddings generated
  'connected',     // Connections detected
  'complete'       // Fully processed
]

async function resumeFromFailure(documentId: string, jobId: string) {
  // Get document to find last completed stage
  const { data: doc } = await supabase
    .from('documents')
    .select('processing_stage, markdown_path')
    .eq('id', documentId)
    .single()

  console.log(`[Resume] Resuming from stage: ${doc.processing_stage}`)

  // Resume from next stage
  switch (doc.processing_stage) {
    case 'extracted':
      // Skip extraction, start with cleanup
      await runCleanupStage(documentId, jobId)
      break
    case 'cleaned':
      // Skip cleanup, start with chunking
      await runChunkingStage(documentId, jobId)
      break
    case 'chunked':
      // Skip chunking, start with embeddings
      await runEmbeddingStage(documentId, jobId)
      break
    // ... etc
  }
}
```

#### 6. Context Window Overflow

**Scenario:** Chunk content > 128K tokens (Qwen 2.5 limit)

**Detection & Handling:**
```python
# Estimate tokens (rough: 1 token ≈ 4 chars)
estimated_tokens = len(content) / 4

if estimated_tokens > 120000:  # Leave margin
    # Truncate content
    max_chars = 120000 * 4
    content = content[:max_chars]

    # Add warning
    warnings.append(
        f"Content truncated from {estimated_tokens} to 120K tokens"
    )
```

#### 7. Exponential Backoff Exhausted

**Scenario:** All 5 retry attempts failed

**Final error handling:**
```typescript
try {
  await withRetry(async () => await riskyOperation(), { maxRetries: 5 })
} catch (error) {
  // All retries exhausted
  await supabase.from('background_jobs').update({
    status: 'failed',
    last_error: error.message,
    retry_count: 5,
    recovery_steps: JSON.stringify([
      'Check Ollama is running: ollama serve',
      'Verify model is available: ollama list',
      'Check system resources (RAM, disk space)',
      'Try manual processing in Obsidian',
      'Contact support if issue persists'
    ])
  }).eq('id', jobId)

  // Notify user with actionable steps
  throw new Error(`Processing failed after 5 retries: ${error.message}`)
}
```

---

## Implementation Order & Dependencies

### Dependency Graph

```
Phase 1: Environment Setup (no dependencies)
    ↓
Phase 2: AI Cleanup (depends on Phase 1)
    ↓
Phase 3: Embeddings (depends on Phase 1)
    ↓
Phase 4: Connection Engines (depends on Phase 1, 3)
    ↓
Phase 5: Retry Logic (depends on Phase 2, 3, 4)
    ↓
Phase 6: Testing (depends on all phases)
```

### Recommended Implementation Order

1. **Start with Phase 1** (Environment Setup)
   - Get Ollama running
   - Install Python dependencies
   - Verify everything works with `check_ollama.py`
   - **Checkpoint:** Can call Ollama from TypeScript

2. **Implement Phase 3** (Embeddings - simplest)
   - Create `generate_embeddings.py`
   - Update `worker/lib/embeddings.ts`
   - Test with small batch (10 texts)
   - **Checkpoint:** Can generate 768d embeddings locally

3. **Implement Phase 2** (AI Cleanup - core feature)
   - Create `cleanup_markdown.py` with PydanticAI
   - Update `worker/lib/markdown-cleanup-ai.ts`
   - Test with sample PDF extraction
   - **Checkpoint:** Can clean markdown end-to-end

4. **Implement Phase 4** (Connection Engines)
   - Create `analyze_thematic_bridge.py`
   - Update `worker/engines/thematic-bridge.ts`
   - Test with 2-3 chunk pairs
   - **Checkpoint:** Can detect thematic bridges locally

5. **Implement Phase 5** (Retry & Recovery)
   - Create `retry-utils.ts`
   - Add retry wrappers to all AI calls
   - Test failure scenarios
   - **Checkpoint:** Resilient to transient failures

6. **Complete Phase 6** (Testing & Validation)
   - Run full end-to-end pipeline test
   - Compare quality with Gemini baseline
   - Validate review checkpoints still work
   - **Checkpoint:** Ready for production use

### Parallel Work Opportunities

Can be done in parallel after Phase 1:
- Phase 2 (AI Cleanup) - Independent
- Phase 3 (Embeddings) - Independent

Must be sequential:
- Phase 4 needs Phase 3 (embeddings for filtering)
- Phase 5 needs Phase 2-4 (wraps all AI calls)
- Phase 6 needs everything (integration tests)

---

## External Documentation & References

### Primary Documentation

1. **Ollama Python Client**
   - URL: https://github.com/ollama/ollama-python
   - Section: README + API reference
   - Why: Complete API for local LLM inference
   - Critical: `ResponseError` handling, streaming responses

2. **PydanticAI**
   - URL: https://ai.pydantic.dev/agents/
   - Section: Agents, Models, Retries
   - Why: Structured outputs with automatic validation
   - Critical: `result_type` parameter, retry configuration

3. **Sentence-Transformers**
   - URL: https://www.sbert.net/
   - Section: Quick Start, Pre-trained Models
   - Why: Local embedding generation
   - Critical: `all-mpnet-base-v2` model (768d), batch encoding

4. **Qwen 2.5 Model**
   - URL: https://qwenlm.github.io/blog/qwen2.5/
   - Section: Model capabilities, benchmarks
   - Why: Understand model strengths/limitations
   - Critical: 128K context window, 32B parameter count

### Codebase References

**Existing patterns to mirror:**

1. **Python-TypeScript Bridge**
   - File: `/Users/topher/Code/rhizome-v2/worker/lib/docling-extractor.ts:86-221`
   - Pattern: Spawn Python, parse JSON progress, handle errors
   - Use for: All local AI calls

2. **Review Checkpoints**
   - File: `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts:237-305`
   - Pattern: Export to Obsidian, set review_stage, pause job
   - Use for: Keeping existing review workflow

3. **Continue Processing**
   - File: `/Users/topher/Code/rhizome-v2/worker/handlers/continue-processing.ts:92-159`
   - Pattern: Check review_stage, conditionally run cleanup, resume pipeline
   - Use for: Resume after review

4. **Background Jobs**
   - File: `/Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts:40-96`
   - Pattern: Stage tracking, progress updates, error handling
   - Use for: Job orchestration

5. **Connection Detection**
   - File: `/Users/topher/Code/rhizome-v2/worker/handlers/detect-connections.ts:17-99`
   - Pattern: Orchestrator with engine-specific config
   - Use for: Integration with 3-engine system

### Implementation Examples

**From external research:**

```python
# PydanticAI with Ollama (from docs)
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel

class Result(BaseModel):
    answer: str
    confidence: float

agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=Result,
    retries=3  # Auto-retry on validation failure
)

result = await agent.run("Your prompt here")
# result.data is validated Result instance
```

```python
# Sentence-transformers batch encoding (from docs)
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-mpnet-base-v2')
embeddings = model.encode(
    texts,  # List of strings
    batch_size=32,
    show_progress_bar=True,
    convert_to_numpy=True
)
# Returns numpy array of shape (len(texts), 768)
```

---

## Success Metrics & Validation

### Quantitative Metrics

**Before (Gemini API):**
- Cost: $0.54 per 500-page book
- Processing time: ~15 minutes
- Metadata population: ~95%
- Connection detection: ~85 connections per book
- API calls: ~15-20 per document

**After (100% Local):**
- Cost: $0.00 per book ✅
- Processing time: 20-30 minutes (acceptable)
- Metadata population: >90% (target)
- Connection detection: 70-90 connections (target)
- API calls: 0 (verified with network monitoring)

### Qualitative Metrics

**Metadata Quality:**
- ✅ Concepts are relevant and well-scored
- ✅ Emotional tone detection is accurate
- ✅ Importance scores match manual assessment
- ✅ Summaries are concise and informative

**Connection Quality:**
- ✅ Thematic bridges are insightful (not obvious)
- ✅ False positive rate <10%
- ✅ Cross-domain connections are meaningful
- ✅ Manual review confirms quality

**System Reliability:**
- ✅ Processing completes without manual intervention
- ✅ Transient failures retry successfully
- ✅ Fatal errors provide clear recovery steps
- ✅ Review checkpoints function identically
- ✅ Can resume from any failed stage

### Acceptance Criteria

**Must Have:**
- [ ] Zero external API calls during processing
- [ ] Processing completes end-to-end for test documents (PDF, EPUB, text)
- [ ] Metadata quality >90% field population
- [ ] Connection detection accuracy >85%
- [ ] Review checkpoints work identically to current system
- [ ] Can resume from any failed processing phase
- [ ] Exponential backoff handles transient failures
- [ ] All automated tests pass

**Nice to Have:**
- [ ] Processing time <30 minutes for 500-page book
- [ ] Model auto-download on first use
- [ ] Memory usage <16GB for typical documents
- [ ] UI shows detailed progress for each local AI stage

---

## Implementation Pseudocode

### High-Level Processing Flow

```typescript
/**
 * PSEUDOCODE: Complete local processing pipeline
 * File: worker/handlers/process-document.ts
 */

async function processDocumentLocal(job: BackgroundJob) {
  const { document_id, reviewDoclingExtraction, cleanMarkdown, reviewBeforeChunking } = job.input_data

  try {
    // STAGE 1: Check Ollama availability
    const ollamaStatus = await checkOllamaAvailability('qwen2.5:32b')
    if (!ollamaStatus.modelAvailable) {
      // Auto-pull model with progress
      await pullModelWithProgress('qwen2.5:32b', (percent) => {
        updateJobProgress(job.id, percent, 'downloading_model', `Downloading Qwen 2.5 32B: ${percent}%`)
      })
    }

    // STAGE 2: Extract (Docling - already works, no changes)
    updateJobProgress(job.id, 10, 'extracting', 'Extracting with Docling')
    const { markdown: rawMarkdown } = await extractWithDocling(pdfPath)
    await saveMarkdownToStorage(document_id, rawMarkdown, 'source-raw.md')
    updateStage('extracted')

    // CHECKPOINT 1: Review Docling extraction (optional)
    if (reviewDoclingExtraction) {
      await exportToObsidian(document_id, userId)
      updateStatus('awaiting_manual_review', 'docling_extraction')
      return  // Job completes, resume via continue-processing handler
    }

    // STAGE 3: AI Cleanup (NEW - uses Qwen 2.5 32B)
    if (cleanMarkdown) {
      updateJobProgress(job.id, 50, 'cleanup_ai', 'AI cleanup with Qwen 2.5 32B')

      const cleanedMarkdown = await withRetry(
        async () => await cleanPdfMarkdownLocal(rawMarkdown, {
          onProgress: (stage, percent) => updateJobProgress(job.id, percent, stage)
        }),
        {
          maxRetries: 3,
          onRetry: (attempt) => {
            updateJobProgress(job.id, 50 + attempt, 'cleanup_ai', `Retry ${attempt}/3`)
          }
        }
      )

      await saveMarkdownToStorage(document_id, cleanedMarkdown, 'content.md')
      updateStage('cleaned')
    } else {
      // Skip cleanup, just save raw
      await saveMarkdownToStorage(document_id, rawMarkdown, 'content.md')
      updateStage('cleaned')
    }

    // CHECKPOINT 2: Review before chunking (optional)
    if (reviewBeforeChunking) {
      await exportToObsidian(document_id, userId)
      updateStatus('awaiting_manual_review', 'ai_cleanup')
      return  // Job completes, resume via continue-processing handler
    }

    // STAGE 4: Chunking (no changes - already local)
    updateJobProgress(job.id, 70, 'chunking', 'Creating semantic chunks')
    const chunks = await createSemanticChunks(cleanedMarkdown)
    await saveChunksToDatabase(document_id, chunks)
    updateStage('chunked')

    // STAGE 5: Metadata Extraction (NEW - uses Qwen 2.5 32B)
    updateJobProgress(job.id, 75, 'metadata_extraction', 'Extracting metadata with Qwen 2.5 32B')
    const enrichedChunks = await withRetry(
      async () => await extractMetadataBatch(chunks, {
        onProgress: (current, total) => {
          const percent = 75 + (current / total) * 10
          updateJobProgress(job.id, percent, 'metadata_extraction', `Processing ${current}/${total} chunks`)
        }
      }),
      { maxRetries: 3 }
    )
    await updateChunksWithMetadata(enrichedChunks)
    updateStage('metadata_extracted')

    // STAGE 6: Embedding Generation (NEW - uses sentence-transformers)
    updateJobProgress(job.id, 85, 'embeddings', 'Generating embeddings locally')
    const chunkTexts = chunks.map(c => c.content)
    const embeddings = await withRetry(
      async () => await generateEmbeddings(chunkTexts),
      { maxRetries: 3 }
    )
    await updateChunksWithEmbeddings(chunks.map((c, i) => ({
      id: c.id,
      embedding: embeddings[i]
    })))
    updateStage('embedded')

    // STAGE 7: Connection Detection (MODIFIED - thematic bridge uses Qwen 2.5)
    updateJobProgress(job.id, 95, 'connections', 'Detecting connections')
    await detectConnectionsLocal(document_id, {
      onProgress: (percent) => updateJobProgress(job.id, 95 + (percent * 0.05), 'connections')
    })
    updateStage('connected')

    // COMPLETE
    updateStatus('completed')
    updateJobProgress(job.id, 100, 'complete', 'Processing complete')

  } catch (error) {
    // Error handling with recovery suggestions
    if (error.message.includes('Ollama not running')) {
      updateJobError(job.id, 'Ollama server not running', [
        'Start Ollama: ollama serve',
        'Keep terminal open',
        'Click Retry to resume'
      ])
    } else if (isRetryableError(error)) {
      updateJobError(job.id, 'Temporary error, will retry', [])
      throw error  // Will be retried by job system
    } else {
      updateJobError(job.id, error.message, [
        'Check logs for details',
        'Try manual review in Obsidian',
        'Contact support if issue persists'
      ])
    }
  }
}
```

### Resume from Checkpoint

```typescript
/**
 * PSEUDOCODE: Resume processing after manual review
 * File: worker/handlers/continue-processing.ts
 */

async function continueProcessingLocal(documentId: string, jobId: string) {
  // Get document to check review stage
  const doc = await getDocument(documentId)
  const reviewStage = doc.review_stage  // 'docling_extraction' | 'ai_cleanup'

  if (reviewStage === 'docling_extraction') {
    // User reviewed Docling extraction in Obsidian
    // Offer choice: run AI cleanup or skip to chunking

    const userChoice = await getUserChoice(documentId)  // From UI state

    if (userChoice.skipCleanup) {
      // Use Obsidian-edited markdown as-is
      const markdown = await downloadMarkdownFromStorage(documentId, 'content.md')
      // Skip to chunking
      await resumeFromStage(documentId, jobId, 'chunking', markdown)
    } else {
      // Run AI cleanup on Obsidian-edited markdown
      const markdown = await downloadMarkdownFromStorage(documentId, 'content.md')
      const cleaned = await cleanPdfMarkdownLocal(markdown)
      await saveMarkdownToStorage(documentId, cleaned.cleanedMarkdown, 'content.md')
      // Continue to next checkpoint or chunking
      if (userChoice.reviewAgain) {
        await exportToObsidian(documentId, userId)
        updateReviewStage('ai_cleanup')
      } else {
        await resumeFromStage(documentId, jobId, 'chunking', cleaned.cleanedMarkdown)
      }
    }
  } else if (reviewStage === 'ai_cleanup') {
    // User reviewed cleaned markdown
    // Continue to chunking
    const markdown = await downloadMarkdownFromStorage(documentId, 'content.md')
    await resumeFromStage(documentId, jobId, 'chunking', markdown)
  }
}
```

---

## Risk Assessment & Mitigation

### High-Risk Areas

#### 1. Model Performance on M1 Architecture

**Risk:** Qwen 2.5 32B might be slow on ARM (M1 Max)

**Likelihood:** Low (M1 Max has good performance)

**Impact:** Medium (processing takes >1 hour)

**Mitigation:**
- Benchmark on M1 Max before full implementation
- Consider smaller Qwen model (14B or 7B) as fallback
- User accepts any speed (per clarifications)
- Optimize batch sizes for M1

#### 2. PydanticAI Validation Failures

**Risk:** Structured output validation fails frequently, exhausts retries

**Likelihood:** Medium (LLMs sometimes produce invalid JSON)

**Impact:** Medium (processing fails, needs manual intervention)

**Mitigation:**
- Use PydanticAI's automatic retry (up to 3 attempts)
- Fallback to regex-based validation if needed
- Mark for review instead of hard failure
- Offer "try again with different prompts" option

#### 3. Ollama Server Reliability

**Risk:** Ollama crashes or becomes unresponsive during long processing

**Likelihood:** Low (Ollama is stable)

**Impact:** High (processing fails mid-pipeline)

**Mitigation:**
- Health check before each major stage
- Auto-restart Ollama if unresponsive (systemd/launchd)
- Implement retry logic with exponential backoff
- Can resume from last completed stage

#### 4. Context Window Overflow

**Risk:** Large chunks exceed 128K token context window

**Likelihood:** Low (typical chunks are <10K tokens)

**Impact:** Low (only affects very large chunks)

**Mitigation:**
- Truncate content to fit within limit
- Log warning for manual review
- Split large chunks into smaller pieces
- Most documents won't hit this limit

### Medium-Risk Areas

#### 5. Quality Degradation vs Gemini

**Risk:** Local AI produces lower quality metadata/cleanup

**Likelihood:** Medium (Qwen 2.5 32B is good but not GPT-4 level)

**Impact:** Medium (connections less insightful, more manual review needed)

**Mitigation:**
- Manual validation during Phase 6
- Adjust prompts to improve quality
- Review checkpoint system catches issues
- User can always re-process in Obsidian

#### 6. Memory Exhaustion on Large Documents

**Risk:** Processing 1000+ page books exceeds 64GB RAM

**Likelihood:** Low (64GB is ample)

**Impact:** Medium (processing fails)

**Mitigation:**
- Batch processing for large documents
- Monitor memory usage during testing
- Garbage collection between batches
- M1 Max 64GB should handle most documents

### Low-Risk Areas

#### 7. Embedding Quality Difference

**Risk:** Sentence-transformers embeddings differ from Gemini

**Likelihood:** High (different models)

**Impact:** Low (still useful for semantic search)

**Mitigation:**
- Both produce 768d vectors (compatible)
- Quality validation in Phase 6
- Can reprocess old documents if needed
- User starts fresh (no migration concerns)

#### 8. Review Checkpoint Breakage

**Risk:** Changes break existing review workflow

**Likelihood:** Very Low (we're not modifying review system)

**Impact:** High (if it happened)

**Mitigation:**
- Review system stays unchanged
- Only replacing API calls, not workflow
- Test checkpoints in Phase 6
- Obsidian integration preserved

---

## Timeline & Effort Estimate

### Per-Phase Estimates

**Phase 1: Environment Setup**
- Effort: 2-4 hours
- Files: 4 new files
- Complexity: Low (mostly scripting)
- Can block: Phases 2-6

**Phase 2: AI Cleanup Replacement**
- Effort: 6-8 hours
- Files: 2 new files, 1 modified
- Complexity: Medium (PydanticAI learning curve)
- Can block: Phase 5, 6

**Phase 3: Local Embeddings**
- Effort: 3-4 hours
- Files: 2 new files, 1 modified
- Complexity: Low (straightforward)
- Can block: Phase 4, 6

**Phase 4: Connection Engines Update**
- Effort: 4-6 hours
- Files: 2 new files, 1 modified
- Complexity: Medium (maintaining quality)
- Can block: Phase 6

**Phase 5: Retry & Recovery**
- Effort: 4-5 hours
- Files: 1 new file, multiple integrations
- Complexity: Medium (comprehensive error handling)
- Can block: Phase 6

**Phase 6: Testing & Validation**
- Effort: 6-8 hours
- Files: 3 new test files
- Complexity: High (quality validation)
- Can block: Production use

**Total Estimated Time: 25-35 hours**

### Parallel Work Strategy

**Week 1:**
- Day 1: Phase 1 (setup) - Blocking work
- Day 2-3: Phase 2 (AI cleanup) + Phase 3 (embeddings) in parallel
- Day 4-5: Phase 4 (connection engines)

**Week 2:**
- Day 1-2: Phase 5 (retry logic) + integration
- Day 3-5: Phase 6 (testing & validation)

**Total Calendar Time: 2 weeks** (assuming full-time focus)

---

## Confidence Score: 9/10

### Why 9/10 (High Confidence)

✅ **Strengths:**
1. Existing infrastructure is solid (review checkpoints, Obsidian, jobs)
2. Clear replacement strategy (API → local calls)
3. Patterns well-documented from codebase analysis
4. External research provides concrete examples
5. No complex migration logic needed
6. User clarifications eliminate ambiguity
7. Python-TypeScript bridge pattern proven (Docling)
8. Local models are stable and well-documented

✅ **Risk Mitigations:**
- Retry logic handles transient failures
- Review checkpoints catch quality issues
- Can resume from any failed stage
- M1 Max 64GB hardware is more than sufficient
- User accepts slower processing for quality

### Why Not 10/10 (Minor Unknowns)

⚠️ **Minor Risks:**
1. Qwen 2.5 32B performance on M1 Max unverified (though should be fine)
2. PydanticAI + Ollama integration is newer (but well-documented)
3. Quality comparison with Gemini needs manual validation
4. Local embedding accuracy vs Gemini needs testing

### One-Pass Implementation Feasibility

**High confidence that this PRP enables one-pass implementation because:**
1. ✅ Exact file paths with line references provided
2. ✅ Code examples mirror existing patterns
3. ✅ Clear phase-by-phase breakdown
4. ✅ Comprehensive error handling specified
5. ✅ Validation strategy defined
6. ✅ External documentation linked
7. ✅ Edge cases identified with solutions
8. ✅ Integration points clearly marked
9. ✅ Acceptance criteria measurable
10. ✅ User clarifications incorporated

**Expected outcome:** Implement all phases → run tests → deploy to production with minimal rework.

---

## Next Steps

### Immediate Actions

1. **Review this PRP**
   - Validate approach aligns with vision
   - Confirm acceptance criteria
   - Approve for implementation

2. **Environment Setup**
   - Run `scripts/setup_local_models.sh`
   - Verify Ollama + Qwen 2.5 32B working
   - Test Python dependencies

3. **Generate Task Breakdown**
   - Use `team-lead-task-breakdown` agent
   - Create detailed tasks in `docs/tasks/local-ai-document-processing.md`
   - Assign to implementation

### Implementation Workflow

```bash
# 1. Setup environment
cd /Users/topher/Code/rhizome-v2
bash scripts/setup_local_models.sh

# 2. Create feature branch
git checkout -b feature/local-ai-processing

# 3. Implement phases sequentially
# Phase 1: Environment (scripts/)
# Phase 2: AI Cleanup (worker/lib/, worker/scripts/)
# Phase 3: Embeddings (worker/lib/, worker/scripts/)
# Phase 4: Engines (worker/engines/, worker/scripts/)
# Phase 5: Retry (worker/lib/, integrations)
# Phase 6: Tests (worker/tests/)

# 4. Run validation
cd worker
npm run test:full-local

# 5. Manual quality check
# - Process test document
# - Compare with Gemini baseline
# - Validate review checkpoints

# 6. Deploy
git add .
git commit -m "feat: implement 100% local AI document processing pipeline"
git push origin feature/local-ai-processing
# Create PR and merge
```

### Success Criteria Reminder

Before marking complete, verify:
- [ ] Zero external API calls during processing
- [ ] End-to-end processing works for test documents
- [ ] Metadata quality >90% field population
- [ ] Connection detection accuracy >85%
- [ ] Review checkpoints function identically
- [ ] Can resume from failed phases
- [ ] All automated tests pass
- [ ] Manual quality validation complete

---

**END OF PRP**

_Ready for task breakdown generation and implementation._
