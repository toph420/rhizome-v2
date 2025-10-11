# PRP: Zero-Cost AI Processing Pipeline

**Feature Name**: Zero-Cost AI Processing
**Status**: Draft
**Priority**: High
**Confidence Score**: 9/10
**Created**: 2025-01-11
**Last Updated**: 2025-01-11

---

## Overview

### Problem Statement

The current document processing pipeline uses Google Gemini AI with cloud-based processing, which:
- Incurs ongoing costs (~$0.54 per 500-page book)
- Has token limits (65k output tokens) requiring batched processing
- Sends document content to external servers (privacy concern)
- Creates dependency on external API availability

For a personal tool processing potentially hundreds of books, these limitations are significant.

### Solution Summary

Replace Google Gemini completely with a **100% local AI processing stack**:
- **Qwen 32B via Ollama** for LLM tasks (cleanup, metadata, connections)
- **PydanticAI** for structured outputs with automatic validation retry
- **Sentence Transformers** for local embedding generation
- **Complete privacy** - all processing happens on local machine
- **Zero ongoing costs** - no API fees
- **Unlimited processing** - no token limits or rate limits

### Success Criteria

- ✅ Process 500-page PDF completely locally (no cloud API calls)
- ✅ Quality matches or exceeds current Gemini output
- ✅ Zero API costs (after initial model download)
- ✅ Errors handled gracefully with retry and manual recovery options
- ✅ Existing manual review checkpoints continue working
- ✅ Resumable from any failed processing phase
- ✅ Complete removal of Gemini dependencies

---

## Technical Context

### Current Architecture (90% Complete Infrastructure)

The Rhizome V2 codebase already has most infrastructure needed:

**✅ Already Implemented:**
1. **Docling Integration** - `/worker/lib/docling-extractor.ts` + Python bridge
2. **Stage-Based Processing** - `/worker/processors/base.ts` with progress tracking
3. **Retry Logic** - Exponential backoff in `withRetry()` method
4. **Manual Review Checkpoints** - Obsidian sync at `/worker/handlers/obsidian-sync.ts`
5. **Background Job System** - `background_jobs` table with status tracking
6. **Phase Resumption** - `metadata.completed_stages` array tracks progress
7. **3-Engine Connection Detection** - `/worker/engines/` with orchestrator
8. **Chunk Matching** - Fuzzy matching for annotation recovery

**❌ Needs Implementation:**
1. Local model client abstraction (replace GoogleGenAI interface)
2. PydanticAI-based markdown cleanup
3. PydanticAI-based metadata extraction
4. Local embeddings generation
5. Update thematic-bridge engine for local model
6. Remove Gemini code after validation

### Key Files & Integration Points

**Files to Create:**
```
/worker/lib/local-model-client.ts        # Ollama client abstraction
/worker/scripts/qwen_cleanup.py          # PydanticAI cleanup
/worker/scripts/qwen_metadata.py         # PydanticAI metadata extraction
/worker/scripts/generate_embeddings.py   # Sentence transformers
/worker/lib/local-embeddings.ts          # TypeScript wrapper for embeddings
```

**Files to Modify:**
```
/worker/lib/model-config.ts              # Add local model configuration
/worker/processors/pdf-processor.ts      # Replace Gemini calls (lines ~200-230, ~400-450)
/worker/processors/epub-processor.ts     # Replace Gemini calls
/worker/engines/thematic-bridge.ts       # Replace Gemini analysis
/worker/handlers/process-document.ts     # Initialize local models instead of Gemini
```

**Files to Remove (after validation):**
```
All Gemini API key references
All @google/genai imports
All GoogleGenAI class usages
```

### External Dependencies & Documentation

**Required Packages:**
```bash
# Python (worker/scripts/)
pip install pydantic-ai ollama sentence-transformers torch

# System
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:32b  # ~20GB download
```

**Official Documentation Links:**

1. **PydanticAI** - https://ai.pydantic.dev/agents/
   - Section: Agent with result_type
   - Critical: Automatic retry on validation failure
   - Use for: Structured LLM outputs (markdown cleanup, metadata extraction)

2. **Ollama Python API** - https://github.com/ollama/ollama-python
   - Section: Client and chat methods
   - Critical: Options parameter controls generation behavior
   - Use for: Direct interaction with Qwen 32B model

3. **Sentence Transformers** - https://huggingface.co/sentence-transformers/all-mpnet-base-v2
   - Model: all-mpnet-base-v2 (768 dimensions, pgvector compatible)
   - Critical: Batch encoding for performance
   - Use for: Local embedding generation

4. **Ollama API Reference** - https://github.com/ollama/ollama/blob/main/docs/api.md
   - Section: Generate and chat endpoints
   - Critical: Options like temperature, num_predict, format
   - Use for: Fine-tuning model behavior

### Technical Patterns & Conventions

**Subprocess Communication Pattern** (from existing Docling integration):
```typescript
// Pattern: Execute Python script, parse streaming JSON output
const child = exec(`python3 ${scriptPath}`)
child.stdout?.on('data', (data: string) => {
  const lines = data.split('\n').filter(l => l.trim())
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed.type === 'progress') {
        onProgress?.(parsed.progress, parsed.message)
      } else {
        // Final result
        result = parsed
      }
    } catch (e) {
      // Accumulate non-JSON output
    }
  }
})
```

**Error Classification Pattern** (from `/worker/lib/errors.ts`):
```typescript
export function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase()

  // Transient errors - retry possible
  if (message.includes('rate limit') || message.includes('timeout'))
    return 'transient'

  // Permanent errors - fail gracefully
  if (message.includes('not found') || message.includes('404'))
    return 'permanent'

  return 'unknown'
}
```

**Retry Pattern with Exponential Backoff** (from `/worker/processors/base.ts:169-212`):
```typescript
protected async withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      const errorType = classifyError(error)
      if (errorType === 'permanent') throw error

      if (attempt === maxRetries) throw error

      const delay = Math.min(2000 * Math.pow(2, attempt), 16000)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Should never reach here')
}
```

**Stage Tracking Pattern** (from `/worker/handlers/process-document.ts:499-529`):
```typescript
async function updateStage(supabase: any, jobId: string, stage: string) {
  const { data: job } = await supabase
    .from('background_jobs')
    .select('metadata')
    .eq('id', jobId)
    .single()

  const metadata = job?.metadata || {}
  const completedStages = metadata.completed_stages || []

  await supabase
    .from('background_jobs')
    .update({
      metadata: {
        ...metadata,
        processing_stage: stage,
        completed_stages: [...completedStages, stage],
        stage_timestamps: {
          ...metadata.stage_timestamps,
          [stage]: new Date().toISOString()
        }
      }
    })
    .eq('id', jobId)
}
```

---

## User Stories & Requirements

### Primary User Stories

**As a user, I want to:**
1. Process documents without API costs so I can process unlimited books
2. Keep all content private (no cloud uploads) for sensitive research materials
3. Process documents of any length without token limits
4. Prioritize quality over speed (willing to wait for better results)
5. Have processing resume automatically if interrupted
6. Review extraction/cleanup quality at checkpoints before proceeding

### User Clarifications Received

From user responses:
- **Migration Strategy**: Clean slate - will reprocess all documents, no need for backward compatibility
- **Rollback Strategy**: Not needed - full commitment to local processing
- **Performance Expectations**: Speed doesn't matter, quality is priority (M1 Max 64GB available)
- **Setup Experience**: Manual setup acceptable (documented steps)
- **Quality Threshold**: Must match or exceed Gemini quality
- **Processing Mode**: Local processing mandatory, Gemini will be completely removed
- **Review Checkpoints**: Already implemented in Obsidian sync handler
- **Error Recovery**: Retry from last completed phase with exponential backoff

### Non-Functional Requirements

**Performance:**
- No speed requirements - quality prioritized
- M1 Max 64GB system can handle Qwen 32B
- Batch processing acceptable (5-10 chunks at a time)

**Reliability:**
- Resume from any failed phase automatically
- Exponential backoff for transient errors
- Manual intervention for permanent errors (clear error messages)
- Graceful degradation (mark for review if quality uncertain)

**Quality:**
- Markdown cleanup: Remove artifacts, fix formatting
- Metadata extraction: Complete fields (themes, concepts, emotional_tone, importance_score)
- Embeddings: 768 dimensions for pgvector compatibility
- Connections: Same/better quality than current Gemini analysis

---

## Implementation Blueprint

### Phase 1: Local Model Client Abstraction

**Goal**: Create adapter layer that makes Ollama look like GoogleGenAI interface

**Pseudocode:**
```typescript
// /worker/lib/local-model-client.ts

export interface LocalModelConfig {
  host: string  // 'http://localhost:11434'
  model: string // 'qwen2.5:32b'
  timeout: number
}

export class LocalModelClient {
  private ollama: OllamaClient

  constructor(config: LocalModelConfig) {
    this.ollama = new OllamaClient({ host: config.host })
  }

  // Match GoogleGenAI interface for drop-in replacement
  async generateContent(request: {
    model: string
    contents: Array<{ parts: Array<{ text: string }> }>
    config?: { maxOutputTokens?: number }
  }): Promise<{ text: string }> {
    const prompt = request.contents[0].parts[0].text

    const response = await this.ollama.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      options: {
        num_predict: request.config?.maxOutputTokens || 2000,
        temperature: 0.7,
        top_k: 40,
        top_p: 0.9
      },
      stream: false
    })

    return { text: response.message.content }
  }

  // Specialized methods for Python subprocess calls
  async cleanMarkdown(markdown: string, options: CleanupOptions): Promise<string> {
    const script = path.join(process.cwd(), 'worker/scripts/qwen_cleanup.py')
    return await this.executePythonScript(script, { markdown, options })
  }

  async extractMetadata(chunk: string): Promise<ChunkMetadata> {
    const script = path.join(process.cwd(), 'worker/scripts/qwen_metadata.py')
    return await this.executePythonScript(script, { chunk })
  }

  private async executePythonScript(
    scriptPath: string,
    input: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = exec(`python3 ${scriptPath}`)

      child.stdin?.write(JSON.stringify(input))
      child.stdin?.end()

      let output = ''
      let lastResult: any = null

      child.stdout?.on('data', (data: string) => {
        const lines = data.split('\n').filter(l => l.trim())
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            if (parsed.type === 'progress') {
              // Emit progress event
            } else {
              lastResult = parsed
            }
          } catch (e) {
            output += line
          }
        }
      })

      child.stderr?.on('data', (data: string) => {
        console.error('Python stderr:', data)
      })

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Script failed with code ${code}`))
        } else if (lastResult) {
          resolve(lastResult)
        } else {
          try {
            resolve(JSON.parse(output))
          } catch (e) {
            reject(new Error('Failed to parse output'))
          }
        }
      })
    })
  }
}
```

**Integration Point:**
- File: `/worker/handlers/process-document.ts` (lines ~50-70)
- Replace: `new GoogleGenAI(apiKey)`
- With: `new LocalModelClient({ host: 'http://localhost:11434', model: 'qwen2.5:32b' })`

### Phase 2: PydanticAI Markdown Cleanup

**Goal**: Replace Gemini cleanup with local Qwen + PydanticAI validation

**Python Script:**
```python
# /worker/scripts/qwen_cleanup.py

import sys
import json
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel

class CleanedMarkdown(BaseModel):
    """Structured output for cleaned markdown"""
    cleaned_content: str = Field(description="Cleaned markdown content")
    changes_made: list[str] = Field(description="List of changes applied")
    warnings: list[str] = Field(default_factory=list, description="Potential issues")

# Initialize agent with automatic retry
agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=CleanedMarkdown,
    retries=3  # Auto-retry on validation failure
)

async def cleanup_markdown(markdown: str) -> CleanedMarkdown:
    """Clean markdown using PydanticAI with structured output"""

    prompt = f"""Clean this markdown document by removing artifacts while preserving all content.

Your tasks:
1. Remove page numbers (standalone numbers like "42" or "Page 42")
2. Remove running headers/footers (repeated text across pages)
3. Fix hyphenation across line breaks (e.g., "hyphen-\\nated" → "hyphenated")
4. Normalize excessive whitespace (max 2 newlines between paragraphs)
5. Preserve all markdown structure (headings, lists, quotes, code blocks)
6. Do NOT remove actual content or change meaning

Document:
```markdown
{markdown}
```

Return the cleaned markdown and list all changes you made.
"""

    # Report progress
    print(json.dumps({
        'type': 'progress',
        'stage': 'cleaning',
        'progress': 0.6,
        'message': 'Cleaning markdown with PydanticAI'
    }))
    sys.stdout.flush()

    # PydanticAI automatically retries on validation failure
    result = await agent.run(prompt)
    return result.data

if __name__ == '__main__':
    input_data = json.loads(sys.stdin.read())
    markdown = input_data['markdown']

    result = await cleanup_markdown(markdown)

    # Return final result as JSON
    print(json.dumps({
        'cleaned_markdown': result.cleaned_content,
        'changes': result.changes_made,
        'warnings': result.warnings
    }))
```

**Integration Point:**
- File: `/worker/processors/pdf-processor.ts` (lines ~200-230)
- Replace: Gemini `generateContent()` call
- With: `await localModel.cleanMarkdown(rawMarkdown, options)`

### Phase 3: PydanticAI Metadata Extraction

**Goal**: Extract rich metadata with validation

**Python Script:**
```python
# /worker/scripts/qwen_metadata.py

import sys
import json
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from typing import List

class Concept(BaseModel):
    """A concept mentioned in the chunk"""
    text: str = Field(min_length=1, description="Concept name")
    importance: float = Field(ge=0.0, le=1.0, description="Importance score 0-1")

class EmotionalTone(BaseModel):
    """Emotional characteristics of the chunk"""
    polarity: float = Field(ge=-1.0, le=1.0, description="Negative to positive")
    primaryEmotion: str = Field(
        pattern='^(neutral|joy|sadness|anger|fear|anxiety|excitement)$',
        description="Primary emotion"
    )
    intensity: float = Field(ge=0.0, le=1.0, description="Emotion strength")

class ChunkMetadata(BaseModel):
    """Complete metadata for a document chunk"""
    themes: List[str] = Field(min_length=1, max_length=5, description="2-3 key themes")
    concepts: List[Concept] = Field(min_length=1, description="5-10 key concepts")
    importance_score: float = Field(ge=0.0, le=1.0, description="Chunk importance")
    summary: str = Field(min_length=20, max_length=300, description="Brief summary")
    emotional_tone: EmotionalTone
    domain: str | None = Field(None, description="Primary domain (science, history, etc.)")

# Initialize agent
agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=ChunkMetadata,
    retries=3
)

async def extract_metadata(chunk_content: str, chunk_index: int) -> ChunkMetadata:
    """Extract semantic metadata from chunk"""

    prompt = f"""Analyze this text chunk and extract metadata.

Text:
```
{chunk_content}
```

Extract:
1. **themes**: 2-3 key topics (e.g., ["entropy", "thermodynamics"])
2. **concepts**: 5-10 important entities with importance scores 0-1
   - Higher importance = more central to this chunk
   - Examples: {{"text": "V-2 rocket", "importance": 0.9}}
3. **importance_score**: 0-1, how central is this chunk to the overall document?
4. **summary**: One-sentence description (20-300 chars)
5. **emotional_tone**:
   - polarity: -1 (negative) to +1 (positive)
   - primaryEmotion: neutral, joy, sadness, anger, fear, anxiety, excitement
   - intensity: 0 (mild) to 1 (strong)
6. **domain**: Primary field (e.g., "science", "history", "philosophy")

Be precise and analytical.
"""

    # Report progress
    print(json.dumps({
        'type': 'progress',
        'stage': 'extracting_metadata',
        'progress': 0.7 + (chunk_index * 0.001),  # Incremental progress
        'message': f'Processing chunk {chunk_index}'
    }))
    sys.stdout.flush()

    result = await agent.run(prompt)
    return result.data

async def batch_extract_metadata(chunks: List[dict]) -> List[dict]:
    """Process chunks in batches"""
    results = []

    for i, chunk in enumerate(chunks):
        try:
            metadata = await extract_metadata(chunk['content'], i)
            results.append({
                **chunk,
                'themes': metadata.themes,
                'concepts': [c.model_dump() for c in metadata.concepts],
                'importance_score': metadata.importance_score,
                'summary': metadata.summary,
                'emotional_tone': metadata.emotional_tone.model_dump(),
                'domain': metadata.domain
            })
        except Exception as e:
            # Graceful degradation - return chunk with empty metadata
            print(json.dumps({
                'type': 'warning',
                'message': f'Failed to extract metadata for chunk {i}: {str(e)}'
            }), file=sys.stderr)
            sys.stderr.flush()

            results.append({
                **chunk,
                'themes': [],
                'concepts': [],
                'importance_score': 0.5,
                'summary': '',
                'emotional_tone': {
                    'polarity': 0.0,
                    'primaryEmotion': 'neutral',
                    'intensity': 0.0
                },
                'domain': None
            })

    return results

if __name__ == '__main__':
    chunks = json.loads(sys.stdin.read())
    results = await batch_extract_metadata(chunks)
    print(json.dumps(results))
```

**Integration Point:**
- File: `/worker/processors/pdf-processor.ts` (lines ~400-450)
- Replace: Gemini batched metadata extraction
- With: `await localModel.extractMetadata(chunk.content)`

### Phase 4: Local Embeddings Generation

**Goal**: Generate 768d embeddings locally with sentence-transformers

**Python Script:**
```python
# /worker/scripts/generate_embeddings.py

import sys
import json
from sentence_transformers import SentenceTransformer
from typing import List
import torch

# Global model cache
_model = None

def get_model(model_name: str = 'sentence-transformers/all-mpnet-base-v2') -> SentenceTransformer:
    """Get cached model or load it"""
    global _model
    if _model is None:
        _model = SentenceTransformer(model_name)
    return _model

def generate_embeddings(texts: List[str], model_name: str) -> List[List[float]]:
    """Generate embeddings for list of texts"""
    model = get_model(model_name)

    # Report progress
    print(json.dumps({
        'type': 'progress',
        'stage': 'generating_embeddings',
        'progress': 0.85,
        'message': f'Generating embeddings for {len(texts)} chunks'
    }))
    sys.stdout.flush()

    # Encode with optimal settings
    embeddings = model.encode(
        texts,
        batch_size=32,  # Balance speed vs memory
        show_progress_bar=False,  # Don't spam stdout
        device='cuda' if torch.cuda.is_available() else 'cpu',
        normalize_embeddings=True  # For cosine similarity
    )

    return embeddings.tolist()

if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    embeddings = generate_embeddings(data['texts'], data.get('model', 'sentence-transformers/all-mpnet-base-v2'))
    print(json.dumps(embeddings))
```

**TypeScript Wrapper:**
```typescript
// /worker/lib/local-embeddings.ts

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

export async function generateEmbeddings(
  texts: string[],
  model = 'sentence-transformers/all-mpnet-base-v2'
): Promise<number[][]> {
  const scriptPath = path.join(process.cwd(), 'worker/scripts/generate_embeddings.py')
  const input = JSON.stringify({ texts, model })

  const { stdout } = await execAsync(
    `echo '${input.replace(/'/g, "\\'")}' | python3 ${scriptPath}`
  )

  // Parse JSON output
  const lines = stdout.split('\n').filter(l => l.trim())
  let embeddings: number[][] = []

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (Array.isArray(parsed)) {
        embeddings = parsed
      }
    } catch (e) {
      // Skip progress messages
    }
  }

  return embeddings
}
```

**Integration Point:**
- File: `/worker/processors/pdf-processor.ts` (after metadata extraction)
- Replace: `await this.generateEmbeddings(chunks)` (Gemini embeddings)
- With: `await generateEmbeddings(chunks.map(c => c.content))`

### Phase 5: Update Connection Detection

**Goal**: Replace Gemini analysis in thematic-bridge engine

**Modification:**
```typescript
// /worker/engines/thematic-bridge.ts

// BEFORE (lines ~150-200): Gemini analysis
const analysis = await this.ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{
    parts: [{
      text: `Analyze if these chunks connect thematically:\n\nChunk 1:\n${source.content}\n\nChunk 2:\n${target.content}`
    }]
  }]
})

// AFTER: Local model analysis
const analysis = await this.localModel.analyzeThematicBridge(source, target)

// Add to LocalModelClient:
async analyzeThematicBridge(
  source: ChunkWithMetadata,
  target: ChunkWithMetadata
): Promise<{ connected: boolean; strength: number; explanation: string }> {
  const prompt = `Analyze if these chunks connect thematically across different domains.

Chunk 1 (${source.domain || 'unknown'}):
${source.content.slice(0, 500)}
Concepts: ${source.metadata?.concepts?.map(c => c.text).join(', ')}

Chunk 2 (${target.domain || 'unknown'}):
${target.content.slice(0, 500)}
Concepts: ${target.metadata?.concepts?.map(c => c.text).join(', ')}

Are these discussing similar concepts from different perspectives?
If yes, what's the shared insight? Rate connection strength 0-1.`

  const response = await this.ollama.chat({
    model: this.model,
    messages: [{ role: 'user', content: prompt }],
    options: {
      temperature: 0.3,  // Lower for more factual analysis
      num_predict: 300,
      format: 'json'  // Force JSON output
    }
  })

  // Parse structured response
  const result = JSON.parse(response.message.content)
  return {
    connected: result.connected,
    strength: result.strength,
    explanation: result.explanation
  }
}
```

**Integration Point:**
- File: `/worker/engines/thematic-bridge.ts` (lines ~150-200)
- Replace: Gemini analysis loop
- With: Local model analysis (keep all filtering logic unchanged)

### Phase 6: Remove Gemini Code

**Goal**: Clean removal after validation

**Files to Update:**
```typescript
// Remove these imports:
import { GoogleGenAI } from '@google/genai'

// Remove these env vars:
GEMINI_API_KEY
GOOGLE_AI_API_KEY

// Remove from package.json:
"@google/genai": "^0.3.0"

// Update model-config.ts:
export const MODEL_CONFIG = {
  local: {
    llm: 'qwen2.5:32b',
    embeddings: 'sentence-transformers/all-mpnet-base-v2'
  }
  // Remove 'gemini' section entirely
}
```

**Validation Before Removal:**
1. Process same document with both systems
2. Compare chunk count, metadata completeness, connection count
3. Manual review of output quality
4. Only proceed with removal after user approval

---

## Error Handling & Recovery

### Local Model Specific Errors

**1. Ollama Not Running**
```typescript
// Detection
try {
  await fetch('http://localhost:11434/api/tags')
} catch (error) {
  throw new PermanentError('Ollama is not running. Please start: ollama serve')
}

// Classification: Permanent
// User Action Required: Start Ollama
// No Auto-Retry
```

**2. Model Not Loaded**
```typescript
// Detection
if (error.message.includes('model not found')) {
  // Auto-recover: Pull model
  await exec('ollama pull qwen2.5:32b')
  // Retry operation
}

// Classification: Recoverable (one-time)
// Auto-Recovery: Pull model
// Retry After Success
```

**3. Insufficient Memory (OOM)**
```typescript
// Detection
if (error.message.toLowerCase().includes('memory')) {
  throw new PermanentError(
    'Insufficient memory for Qwen 32B. Try closing other applications or using smaller model.'
  )
}

// Classification: Permanent (for this model size)
// User Action Required: Free memory or use smaller model
// No Auto-Retry
```

**4. PydanticAI Validation Failure**
```typescript
// Detection: Automatic by PydanticAI
// Auto-Retry: Up to 3 times
// Fallback: Direct Ollama API with manual parsing
// Mark for Review: If all retries fail

if (retriesExhausted) {
  await markForManualReview(chunk, {
    reason: 'PydanticAI validation failed after 3 retries',
    last_error: error.message
  })
}
```

**5. Python Subprocess Crash**
```typescript
// Detection: Non-zero exit code
child.on('close', (code) => {
  if (code !== 0) {
    const errorType = classifyError(new Error(stderrOutput))

    if (errorType === 'transient') {
      // Retry with exponential backoff
      return await this.withRetry(operation, operationName)
    } else {
      // Permanent error - show full details
      throw new Error(`Python script failed: ${stderrOutput}`)
    }
  }
})
```

### Resume from Last Completed Phase

Existing infrastructure in `background_jobs.metadata.completed_stages`:

**Resumable Stages:**
```typescript
const RESUMABLE_STAGES = [
  'docling_extraction',    // Can resume: markdown in storage
  'local_cleanup',         // Can resume: raw markdown in storage
  'local_metadata',        // Can resume: chunks exist without metadata
  'local_embeddings',      // Can resume: chunks exist without embeddings
  'detect_connections'     // Can resume: chunks with embeddings exist
]

async function resumeProcessing(jobId: string, documentId: string) {
  const { data: job } = await supabase
    .from('background_jobs')
    .select('metadata')
    .eq('id', jobId)
    .single()

  const completedStages = job.metadata.completed_stages || []
  const lastStage = completedStages[completedStages.length - 1]

  // Determine next stage
  const nextStage = getNextStage(lastStage)

  // Resume from next stage
  return await processFromStage(documentId, nextStage, jobId)
}
```

---

## Testing Strategy

### Unit Tests (Mock Ollama)

**Test Coverage:**
```typescript
// /worker/__tests__/local-model-client.test.ts

import { LocalModelClient } from '@/worker/lib/local-model-client'

describe('LocalModelClient', () => {
  let mockOllama: any
  let client: LocalModelClient

  beforeEach(() => {
    mockOllama = {
      chat: jest.fn().mockResolvedValue({
        message: { content: 'Cleaned markdown content' }
      })
    }

    client = new LocalModelClient({
      host: 'http://localhost:11434',
      model: 'qwen2.5:32b'
    })
    // Inject mock
    ;(client as any).ollama = mockOllama
  })

  it('should clean markdown via subprocess', async () => {
    const result = await client.cleanMarkdown('raw markdown', {})
    expect(result).toContain('Cleaned markdown content')
    expect(mockOllama.chat).not.toHaveBeenCalled() // Uses subprocess, not direct
  })

  it('should handle subprocess failure with retry', async () => {
    // Mock subprocess failure
    const execMock = jest.fn()
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce({ stdout: '{"cleaned_markdown": "success"}' })

    // Test retry logic
    const result = await client.cleanMarkdown('raw', {})
    expect(execMock).toHaveBeenCalledTimes(2)
  })
})
```

### Integration Tests (Real Model)

**Test with Actual Qwen Model:**
```typescript
// /worker/__tests__/integration/local-processing.test.ts

describe('Local Processing Integration', () => {
  // Skip unless INTEGRATION_TESTS=true
  const skipUnlessIntegration = process.env.INTEGRATION_TESTS ? it : it.skip

  skipUnlessIntegration('should process document end-to-end locally', async () => {
    const testPdf = path.join(__dirname, 'fixtures/sample.pdf')

    const result = await processDocument(testPdf, {
      useLocalModels: true,
      reviewCheckpoints: false
    })

    expect(result.status).toBe('completed')
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.chunks[0].themes).toBeDefined()
    expect(result.chunks[0].embedding).toHaveLength(768)
  }, 300000) // 5 minute timeout for local processing
})
```

### Quality Validation Tests

**Compare Local vs Gemini Output:**
```typescript
// /worker/__tests__/quality/comparison.test.ts

describe('Quality Comparison', () => {
  it('should match Gemini chunk count ±10%', async () => {
    const geminiResult = await processWithGemini(testDoc)
    const localResult = await processWithLocal(testDoc)

    const diff = Math.abs(geminiResult.chunks.length - localResult.chunks.length)
    const tolerance = geminiResult.chunks.length * 0.1

    expect(diff).toBeLessThanOrEqual(tolerance)
  })

  it('should have complete metadata for all chunks', async () => {
    const result = await processWithLocal(testDoc)

    for (const chunk of result.chunks) {
      expect(chunk.themes.length).toBeGreaterThan(0)
      expect(chunk.concepts.length).toBeGreaterThan(0)
      expect(chunk.importance_score).toBeGreaterThanOrEqual(0)
      expect(chunk.importance_score).toBeLessThanOrEqual(1)
      expect(chunk.summary).toBeTruthy()
      expect(chunk.emotional_tone).toBeDefined()
    }
  })
})
```

### Validation Commands

From project's package.json + new commands:

```bash
# Existing tests (worker module)
cd worker && npm test                    # All tests
cd worker && npm run test:unit           # Unit tests only
cd worker && npm run test:integration    # Integration tests

# New validation commands (add to package.json)
cd worker && npm run test:local-models   # Test local model integration
cd worker && npm run validate:local-quality  # Compare quality vs baseline

# System validation
ollama list                              # Verify qwen2.5:32b present
curl http://localhost:11434/api/tags     # Test Ollama connectivity
python3 -c "from sentence_transformers import SentenceTransformer; print('OK')"  # Test embeddings
```

---

## Acceptance Criteria

**Must Have (Blocking):**
- [ ] Process 500-page PDF completely locally (zero cloud API calls)
- [ ] Output quality matches current Gemini baseline (manual review)
- [ ] All metadata fields populated correctly (themes, concepts, emotional_tone, importance)
- [ ] Embeddings are 768-dimensional and compatible with pgvector
- [ ] Errors handled gracefully (Ollama not running, model not loaded, OOM)
- [ ] Processing resumes from last completed phase after failure
- [ ] Existing review checkpoints continue working (Obsidian sync)
- [ ] Gemini code completely removed (no lingering imports or API keys)

**Should Have (Important):**
- [ ] Clear error messages with actionable steps
- [ ] Progress reporting at each stage
- [ ] Manual review option after metadata extraction (existing UI)
- [ ] Validation tests pass with >90% confidence
- [ ] Documentation updated (CLAUDE.md, README.md)

**Nice to Have (Optional):**
- [ ] Performance metrics (time per stage)
- [ ] Quality metrics compared to Gemini (automated comparison)
- [ ] Batch size optimization (currently 5-10 chunks)
- [ ] GPU acceleration for embeddings (if available)

---

## Risk Assessment

### High Risk Items

**Risk**: Qwen 32B produces lower quality output than Gemini
- **Mitigation**: Quality validation tests before Gemini removal
- **Contingency**: Keep Gemini code until user validates quality
- **Detection**: Manual review + automated comparison tests

**Risk**: PydanticAI validation fails frequently with nested models
- **Mitigation**: Fallback to direct Ollama API with manual parsing
- **Contingency**: Mark for manual review if both methods fail
- **Detection**: Monitor validation failure rate in logs

**Risk**: Ollama crashes or hangs on long operations
- **Mitigation**: Subprocess timeouts (5 minutes per operation)
- **Contingency**: Retry with shorter context or smaller batch
- **Detection**: Timeout errors in subprocess execution

### Medium Risk Items

**Risk**: Python subprocess communication issues (stdout buffering)
- **Mitigation**: Explicit `sys.stdout.flush()` after each print
- **Contingency**: Write to temp file as fallback
- **Detection**: Timeout waiting for subprocess output

**Risk**: Local embeddings are slower than Gemini
- **Mitigation**: Batch processing (32 at a time), GPU acceleration if available
- **Contingency**: User doesn't care about speed (M1 Max 64GB)
- **Detection**: Performance metrics logging

### Low Risk Items

**Risk**: Model download takes long time (~20GB for Qwen 32B)
- **Mitigation**: One-time setup, documented in installation steps
- **Contingency**: User already accepted manual setup
- **Detection**: N/A (expected behavior)

---

## Deployment Plan

### Pre-Deployment Checklist

**System Requirements:**
- [ ] Ollama installed: `curl -fsSL https://ollama.com/install.sh | sh`
- [ ] Qwen 32B model pulled: `ollama pull qwen2.5:32b`
- [ ] Python 3.11+ with venv
- [ ] Python packages: `pip install pydantic-ai ollama sentence-transformers torch`
- [ ] Verify Ollama running: `curl http://localhost:11434/api/tags`
- [ ] Verify model loaded: `ollama list | grep qwen2.5:32b`

**Code Changes:**
- [ ] All new files created
- [ ] All existing files modified
- [ ] All tests passing
- [ ] Quality validation complete (user approval)

### Deployment Steps

**Phase 1: Setup (One-Time)**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull model (20GB download, takes ~15 minutes)
ollama pull qwen2.5:32b

# Verify installation
ollama list
ollama run qwen2.5:32b "test" # Should generate response

# Install Python dependencies
cd worker/scripts
python3 -m venv venv
source venv/bin/activate
pip install pydantic-ai ollama sentence-transformers torch

# Verify Python setup
python3 -c "from pydantic_ai import Agent; print('OK')"
python3 -c "from sentence_transformers import SentenceTransformer; print('OK')"
```

**Phase 2: Code Deployment**
```bash
# Create feature branch
git checkout -b feature/zero-cost-ai-processing

# Install dependencies (none new for Node.js side)
npm install

# Run tests
cd worker && npm test
cd worker && npm run test:local-models

# Validate quality (process test document)
cd worker && npm run validate:local-quality
```

**Phase 3: Validation**
```bash
# Process test document
npm run dev
# Upload test PDF via UI
# Review output quality in Obsidian
# Compare with previous Gemini output

# If quality acceptable:
git add .
git commit -m "feat: implement zero-cost AI processing with Qwen 32B"
```

**Phase 4: Remove Gemini**
```bash
# Only after user validates quality
npm uninstall @google/genai
# Remove GEMINI_API_KEY from .env.local
# Remove GOOGLE_AI_API_KEY from worker/.env
# Remove all GoogleGenAI imports
# Remove Gemini config from model-config.ts

git add .
git commit -m "chore: remove Gemini dependencies"
```

### Rollback Plan

**If Issues Discovered:**
```bash
# Rollback to last working commit
git revert HEAD  # If Gemini removal commit
git revert HEAD~1  # If implementation commit

# Restart services
npm run stop
npm run dev

# Verify Gemini still works
# Process document with Gemini
```

---

## Task Breakdown (High-Level)

**Detailed task breakdown available at**: `docs/tasks/zero-cost-ai-processing/`

**Overview:**
1. **Setup & Configuration** (1-2 hours)
   - Install Ollama and pull Qwen 32B model
   - Setup Python environment
   - Create local model configuration

2. **Local Model Client** (2-3 hours)
   - Create LocalModelClient class
   - Implement subprocess communication pattern
   - Add error handling for Ollama-specific errors

3. **PydanticAI Cleanup Script** (2-3 hours)
   - Create qwen_cleanup.py with structured output
   - Integrate with LocalModelClient
   - Update PDF processor to use local cleanup

4. **PydanticAI Metadata Script** (3-4 hours)
   - Create qwen_metadata.py with nested Pydantic models
   - Implement batch processing
   - Update processors to use local metadata extraction

5. **Local Embeddings** (1-2 hours)
   - Create generate_embeddings.py script
   - Create TypeScript wrapper
   - Update embedding generation calls

6. **Connection Detection Update** (2-3 hours)
   - Update thematic-bridge.ts for local model
   - Test connection quality
   - Verify filtering logic unchanged

7. **Testing & Validation** (4-5 hours)
   - Write unit tests with mocked Ollama
   - Run integration tests with real model
   - Compare quality with Gemini baseline
   - User validation review

8. **Remove Gemini Code** (1 hour)
   - Remove dependencies
   - Remove imports
   - Clean up configuration
   - Final validation

**Total Estimated Time**: 16-23 hours of development work

---

## Documentation & Knowledge Transfer

### Files to Update

**Primary Documentation:**
- `CLAUDE.md` - Update AI processing section, remove Gemini references
- `README.md` - Update tech stack, add local model setup instructions
- `worker/README.md` - Update processor documentation

**New Documentation:**
```
docs/local-processing-setup.md    # Installation and configuration guide
docs/troubleshooting-ollama.md    # Common issues and solutions
docs/quality-validation.md        # How to validate output quality
```

### Key Concepts for Developers

**Local Model Architecture:**
- LocalModelClient acts as adapter between Node.js and Python scripts
- PydanticAI provides structured outputs with automatic retry
- Subprocess communication uses streaming JSON for progress reporting
- Stage tracking enables resumable processing

**Error Handling Philosophy:**
- Transient errors: Auto-retry with exponential backoff
- Permanent errors: Clear message with actionable steps
- Validation errors: Mark for manual review after retries exhausted
- System errors: Resume from last completed stage

**Testing Approach:**
- Unit tests: Mock Ollama for fast feedback
- Integration tests: Real model for quality validation
- Comparison tests: Validate against Gemini baseline
- Manual review: Final quality gate before Gemini removal

---

## Appendix

### Reference Implementation: PydanticAI + Ollama

**Complete Example:**
```python
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.ollama import OllamaModel
from ollama import Client, ResponseError

class ExtractionResult(BaseModel):
    success: bool
    data: dict
    confidence: float = Field(ge=0.0, le=1.0)

# Method 1: PydanticAI Agent (preferred for structured output)
agent = Agent(
    model=OllamaModel('qwen2.5:32b'),
    result_type=ExtractionResult,
    retries=3
)

result = await agent.run(prompt)

# Method 2: Direct Ollama (fallback)
client = Client(host='http://localhost:11434')

try:
    response = client.chat(
        model='qwen2.5:32b',
        messages=[{'role': 'user', 'content': prompt}],
        options={
            'temperature': 0.7,
            'num_predict': 2000,
            'top_k': 40,
            'top_p': 0.9,
            'format': 'json'  # Force JSON output
        }
    )
except ResponseError as e:
    if e.status_code == 404:
        # Model not found - pull it
        client.pull('qwen2.5:32b')
        # Retry
```

### Configuration Reference

**Ollama Options:**
```python
{
    'temperature': 0.7,        # Creativity (0=deterministic, 2=very creative)
    'top_k': 40,               # Consider top 40 tokens
    'top_p': 0.9,              # Nucleus sampling threshold
    'num_predict': 2000,       # Max output tokens
    'stop': ['```', 'END'],    # Stop sequences
    'format': 'json',          # Force JSON output
    'seed': 42                 # Reproducibility (optional)
}
```

**Sentence Transformers Models:**
```python
# Recommended: all-mpnet-base-v2
# - 768 dimensions (pgvector compatible)
# - Best quality for semantic similarity
# - Moderate speed

# Alternative: all-MiniLM-L6-v2
# - 384 dimensions (requires DB schema change)
# - Faster but lower quality
# - Good for prototyping
```

### Validation Queries

**Check Ollama Status:**
```bash
# Is Ollama running?
curl http://localhost:11434/api/tags

# List loaded models
ollama list

# Check model details
ollama show qwen2.5:32b

# Test generation
ollama run qwen2.5:32b "Generate a short poem about AI"
```

**Check Python Environment:**
```bash
# Verify all packages installed
pip list | grep -E "(pydantic-ai|ollama|sentence-transformers)"

# Test imports
python3 -c "from pydantic_ai import Agent; from ollama import Client; from sentence_transformers import SentenceTransformer; print('All packages OK')"

# Test model loading
python3 -c "from sentence_transformers import SentenceTransformer; model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2'); print(f'Model loaded: {model}')"
```

---

**End of PRP Document**

**Next Steps:**
1. Review this PRP for completeness and accuracy
2. Generate detailed task breakdown with pseudocode and line references
3. Begin implementation starting with Phase 1 (Setup & Configuration)

**Document Version**: 1.0
**Confidence Score**: 9/10
- High confidence due to 90% existing infrastructure
- Slight uncertainty around PydanticAI nested model validation (known issue, has workaround)
- All external research validated with official documentation
