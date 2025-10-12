# Phase 1: Core Infrastructure

## Overview
- **Tasks Covered**: Task 1-4 (Database Migration, Dependencies, Ollama Setup, Client Module)
- **Estimated Time**: 3-4 days
- **Risk Level**: Medium
- **Dependencies**: None (foundational phase, blocks all other phases)

## Prerequisites
- PostgreSQL database running (via Supabase)
- Python 3.10+ installed and accessible
- Node.js 18+ installed
- Access to terminal with admin privileges (for Ollama installation)
- 64GB RAM M1 Max machine (for Qwen 32B model)

## Context & Background

### Feature Overview
This phase establishes the foundational infrastructure for the 100% local document processing pipeline. It replaces cloud AI services (Gemini) with local alternatives: Docling for PDF extraction, Ollama with Qwen 32B for LLM tasks, and Transformers.js for embeddings. This enables zero-cost processing with complete privacy.

### Why This Matters
- **Cost Elimination**: Save $0.50-3 per document, $500-3000 per 1000 books
- **Complete Privacy**: No data leaves local machine, no cloud API calls
- **Foundation**: All subsequent phases depend on this infrastructure

### Technical Context
The system uses a dual-module architecture:
- **Worker Module** (`/worker/`): Node.js background processing with Python subprocess integration
- **Main App** (`/`): Next.js 15 with React 19 for UI

This phase sets up:
1. Database schema changes to store structural metadata (pages, headings, bboxes)
2. Python dependencies for Docling and PydanticAI
3. Ollama local LLM server with Qwen 32B model
4. TypeScript client for Ollama integration

## Tasks

### Task 1: Database Migration #045

**Files to Create**:
- `supabase/migrations/045_add_local_pipeline_columns.sql`

**Pattern to Follow**:
- `supabase/migrations/041_*.sql` - Latest migration format
- `supabase/migrations/016_user_preferences.sql` - Example of adding columns with indexes

#### Implementation Steps

```sql
-- Migration: 045_add_local_pipeline_columns.sql
-- Purpose: Add structural metadata and quality tracking for local pipeline

-- Add columns to chunks table for structural metadata
ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS page_start INTEGER,
ADD COLUMN IF NOT EXISTS page_end INTEGER,
ADD COLUMN IF NOT EXISTS heading_level INTEGER,
ADD COLUMN IF NOT EXISTS section_marker TEXT,
ADD COLUMN IF NOT EXISTS bboxes JSONB,
ADD COLUMN IF NOT EXISTS position_confidence TEXT CHECK (position_confidence IN ('exact', 'high', 'medium', 'synthetic')),
ADD COLUMN IF NOT EXISTS position_method TEXT,
ADD COLUMN IF NOT EXISTS position_validated BOOLEAN DEFAULT false;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chunks_pages ON chunks(document_id, page_start, page_end);
CREATE INDEX IF NOT EXISTS idx_chunks_section ON chunks(document_id, section_marker);
CREATE INDEX IF NOT EXISTS idx_chunks_confidence ON chunks(position_confidence);

-- Add comments for documentation
COMMENT ON COLUMN chunks.page_start IS 'Starting page number from PDF (for citations)';
COMMENT ON COLUMN chunks.page_end IS 'Ending page number from PDF (for citations)';
COMMENT ON COLUMN chunks.heading_level IS 'TOC hierarchy depth (1 = top level)';
COMMENT ON COLUMN chunks.section_marker IS 'For EPUB citations (e.g., chapter_003)';
COMMENT ON COLUMN chunks.bboxes IS 'PDF coordinates for highlighting [{page, l, t, r, b}]';
COMMENT ON COLUMN chunks.position_confidence IS 'Quality of chunk position matching';
COMMENT ON COLUMN chunks.position_method IS 'Which matching layer succeeded (exact_match, embedding_match, etc)';
COMMENT ON COLUMN chunks.position_validated IS 'User manually validated position';
```

#### Critical Gotchas

**GOTCHA 1: Check Migration Number**
```bash
# Always verify current latest migration before creating new one
ls -la supabase/migrations/ | tail -5

# Current latest: 041
# Your new migration should be: 045
# Format: NNN_descriptive_name.sql where NNN is zero-padded
```

**GOTCHA 2: PRESERVE Existing Columns**
The PRP warns: "PRESERVE existing recovery_confidence, recovery_method columns"
- Do NOT drop or modify `recovery_confidence` column
- Do NOT drop or modify `recovery_method` column
- These are used by existing fuzzy matcher, new columns are ADDITIONAL

**GOTCHA 3: JSONB Format for bboxes**
```typescript
// bboxes will store array of objects like this:
[
  { page: 5, l: 100, t: 200, r: 300, b: 400 },
  { page: 5, l: 100, t: 450, r: 300, b: 550 }
]

// Each bbox is for PDF highlighting:
// l = left edge, t = top edge, r = right edge, b = bottom edge
// Coordinates are in PDF coordinate space (not screen pixels)
```

#### Validation

```bash
# Apply migration
npx supabase db reset

# Verify columns exist
npx supabase db execute "
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'chunks'
  AND column_name IN ('page_start', 'page_end', 'heading_level', 'section_marker', 'bboxes', 'position_confidence', 'position_method', 'position_validated')
  ORDER BY column_name;
"

# Expected output: 8 rows showing new columns
# page_start: integer, YES
# page_end: integer, YES
# heading_level: integer, YES
# section_marker: text, YES
# bboxes: jsonb, YES
# position_confidence: text, YES
# position_method: text, YES
# position_validated: boolean, YES

# Verify indexes exist
npx supabase db execute "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'chunks'
  AND indexname LIKE 'idx_chunks_%'
  ORDER BY indexname;
"

# Expected: At least idx_chunks_pages, idx_chunks_section, idx_chunks_confidence
```

---

### Task 2: Install External Dependencies

**Files to Modify**:
- Create `worker/requirements.txt` (if it doesn't exist)
- Verify `worker/package.json`

**Pattern to Follow**:
- Existing Python scripts in `worker/scripts/docling_extract.py` use subprocess pattern
- Worker module has separate package.json from main app

#### Implementation Steps

**Step 1: Install Python Packages**

```bash
# Navigate to worker directory (Python scripts live here)
cd /Users/topher/Code/rhizome-v2/worker

# Install Docling with all dependencies
pip install docling==2.55.1

# Install PydanticAI with Ollama support
# CRITICAL: Must use [ollama] extra, not just pydantic-ai
pip install 'pydantic-ai[ollama]'

# Install sentence-transformers (for metadata extraction)
pip install sentence-transformers

# Install transformers (Python side, for tokenizer)
pip install transformers
```

**Step 2: Create/Update requirements.txt**

```txt
# worker/requirements.txt
docling==2.55.1
pydantic-ai[ollama]>=0.0.13
sentence-transformers>=2.2.2
transformers>=4.35.0
```

**Step 3: Install Node.js Packages**

```bash
# Still in worker directory
npm install ollama --workspace=worker

# Install Hugging Face Transformers.js
npm install @huggingface/transformers --workspace=worker
```

#### Critical Gotchas

**GOTCHA 1: Python Version Requirement**
```bash
# PydanticAI requires Python 3.10+
python --version
# If < 3.10.0, install newer Python first

# Check which Python is used
which python
# Should be Python 3.10 or higher
```

**GOTCHA 2: PydanticAI Ollama Extra**
```bash
# ❌ WRONG - Missing ollama support
pip install pydantic-ai

# ✅ CORRECT - Includes Ollama dependencies
pip install 'pydantic-ai[ollama]'

# The [ollama] extra installs httpx and other deps needed for local models
```

**GOTCHA 3: Large Download Warning**
```bash
# Docling dependencies are LARGE (~2GB+)
# Includes: easyocr, torch, detectron2
# Ensure sufficient disk space before installing

# Expected download size: 2-3 GB
# Expected install time: 5-10 minutes on fast connection
```

**GOTCHA 4: Worker Package Isolation**
```bash
# Worker has its own package.json and node_modules
# DO NOT install these packages in root package.json

# ✅ CORRECT
npm install ollama --workspace=worker

# ❌ WRONG
npm install ollama  # Installs in root, not worker
```

#### Validation

```bash
# Verify Python packages installed
python -c "import docling; print(f'Docling version: {docling.__version__}')"
# Expected: Docling version: 2.55.1

python -c "from pydantic_ai import Agent; print('PydanticAI OK')"
# Expected: PydanticAI OK (no errors)

python -c "import sentence_transformers; print('sentence-transformers OK')"
# Expected: sentence-transformers OK

python -c "import transformers; print('transformers OK')"
# Expected: transformers OK

# Verify Node packages installed
cd worker
node -e "const {Ollama} = require('ollama'); console.log('Ollama JS SDK OK')"
# Expected: Ollama JS SDK OK

node -e "const {pipeline} = require('@huggingface/transformers'); console.log('Transformers.js OK')"
# Expected: Transformers.js OK

# Check package.json updated
cat package.json | grep -A2 dependencies
# Expected: Should list ollama and @huggingface/transformers
```

---

### Task 3: Ollama Model Setup

**Files to Modify**: None (system-level installation)

**Pattern to Follow**:
- Ollama is a standalone server similar to how Supabase runs locally
- Model is pulled once and cached locally

#### Implementation Steps

**Step 1: Install Ollama**

```bash
# macOS installation
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
# Expected: ollama version 0.x.x

# Start Ollama server (runs as background service)
ollama serve
# Expected: Server starts on http://127.0.0.1:11434
```

**Step 2: Pull Qwen 32B Model**

```bash
# Pull Qwen 32B with Q4_K_M quantization
# This is a ~20GB download, will take 10-30 minutes
ollama pull qwen2.5:32b-instruct-q4_K_M

# Expected output:
# pulling manifest
# pulling 8934d96d3f08... 100%
# pulling 8c17c2ebb0ea... 100%
# pulling 7c23fb36d801... 100%
# verifying sha256 digest
# writing manifest
# success
```

**Step 3: Verify Model Works**

```bash
# Test model with simple prompt
ollama run qwen2.5:32b-instruct-q4_K_M "What is 2+2?"

# Expected: Should respond with "4" or similar
# First run may be slow (loading model into memory)
# Subsequent runs will be faster
```

#### Critical Gotchas

**GOTCHA 1: Memory Requirements**
```bash
# Qwen 32B Q4_K_M requires ~20-24GB RAM
# M1 Max with 64GB is sufficient

# If you see OOM errors, use smaller model:
ollama pull qwen2.5:14b-instruct-q4_K_M  # ~8GB RAM
# or
ollama pull qwen2.5:7b-instruct-q4_K_M   # ~4GB RAM

# Update OLLAMA_MODEL env var to match
```

**GOTCHA 2: Quantization Matters**
```bash
# ❌ WRONG - Q8 quantization is too slow on M1
ollama pull qwen2.5:32b-instruct-q8_0

# ✅ CORRECT - Q4_K_M balances speed and quality
ollama pull qwen2.5:32b-instruct-q4_K_M

# Q4_K_M = 4-bit quantization with K-means optimization
# Best for M1 Max: fast inference, good quality
```

**GOTCHA 3: Disk Space Check**
```bash
# Check available disk space BEFORE pulling
df -h /

# Need at least 25GB free space
# Model: ~20GB
# Temporary files during pull: ~5GB
```

**GOTCHA 4: Ollama Server Must Run**
```bash
# Ollama server MUST be running for processing to work
# Check if server is running:
curl http://localhost:11434/api/tags

# If error "connection refused", start server:
ollama serve

# To run server in background:
nohup ollama serve > /tmp/ollama.log 2>&1 &
```

#### Validation

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags | jq
# Expected: JSON response with list of installed models

# Verify Qwen model is installed
ollama list | grep qwen2.5:32b
# Expected output:
# qwen2.5:32b-instruct-q4_K_M  [hash]  [size]  [date]

# Test model inference
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:32b-instruct-q4_K_M",
  "prompt": "Respond with only the word: SUCCESS",
  "stream": false
}'
# Expected: JSON with "response" field containing "SUCCESS"

# Check model size (should be ~20GB)
ollama list
# Look at SIZE column for qwen2.5:32b-instruct-q4_K_M
```

---

### Task 4: Create Ollama Client Module

**Files to Create**:
- `worker/lib/local/ollama-client.ts`

**Pattern to Follow**:
- `worker/lib/markdown-cleanup-ai.ts` (lines 85-140) - Existing AI client initialization pattern
- `worker/lib/model-config.ts` - Configuration patterns

#### Implementation Steps

```typescript
// worker/lib/local/ollama-client.ts

import Ollama from 'ollama'

interface OllamaOptions {
  temperature?: number
  stream?: boolean
  timeout?: number
}

interface OllamaConfig {
  host: string
  model: string
  timeout: number
}

export class OllamaClient {
  private client: Ollama
  private config: OllamaConfig

  constructor() {
    // Read from environment with defaults
    this.config = {
      host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'qwen2.5:32b-instruct-q4_K_M',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '600000', 10) // 10 minutes default
    }

    this.client = new Ollama({ host: this.config.host })
  }

  /**
   * Send a chat message to Ollama and get response
   *
   * @param prompt - The prompt to send
   * @param options - Temperature, streaming, etc.
   * @returns The model's text response
   */
  async chat(prompt: string, options: OllamaOptions = {}): Promise<string> {
    const { temperature = 0.3, stream = false } = options

    try {
      const response = await this.client.chat({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        stream,
        options: {
          temperature,
          num_predict: -1 // No limit on output length
        }
      })

      // CRITICAL: stream must be false for simple responses
      // Streaming breaks JSON parsing in structured outputs
      if (stream) {
        throw new Error('Use chat() with stream: false, or use chatStream() for streaming')
      }

      return response.message.content
    } catch (error: any) {
      // Enhanced error handling
      if (error.message?.includes('out of memory')) {
        throw new OOMError('Qwen model out of memory - try smaller model or reduce context')
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama server not running - start with: ollama serve')
      }
      throw error
    }
  }

  /**
   * Generate structured JSON output from prompt
   * Uses format enforcement for reliable JSON responses
   *
   * @param prompt - Prompt requesting JSON response
   * @param schema - Optional JSON schema for validation
   * @returns Parsed JSON object
   */
  async generateStructured(prompt: string, schema?: object): Promise<any> {
    // CRITICAL: Must use stream: false for structured outputs
    // Streaming breaks JSON parsing
    const response = await this.client.chat({
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      format: 'json', // Ollama will enforce JSON format
      options: {
        temperature: 0.1 // Low temperature for consistent structure
      }
    })

    try {
      const parsed = JSON.parse(response.message.content)

      // TODO: Add schema validation here if schema provided
      // Could use Zod or Ajv for validation

      return parsed
    } catch (error) {
      throw new Error(`Failed to parse JSON from Ollama response: ${error}`)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config }
  }
}

/**
 * Custom error for out-of-memory conditions
 * Allows graceful degradation to smaller models
 */
export class OOMError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OOMError'
  }
}

/**
 * Test connection to Ollama server
 * Useful for health checks and startup validation
 */
export async function testOllamaConnection(): Promise<boolean> {
  try {
    const client = new OllamaClient()
    const response = await client.chat('Respond with: OK', { timeout: 5000 })
    return response.toLowerCase().includes('ok')
  } catch (error) {
    console.error('[Ollama] Connection test failed:', error)
    return false
  }
}
```

#### Critical Gotchas

**GOTCHA 1: Streaming Must Be Disabled for Structured Outputs**
```typescript
// ❌ WRONG - Streaming breaks JSON parsing
const response = await ollama.chat({
  stream: true,  // Breaks JSON!
  format: 'json'
})

// ✅ CORRECT - Stream false for JSON
const response = await ollama.chat({
  stream: false,  // Required for reliable JSON
  format: 'json'
})

// From PRP lines 294-299:
// "CRITICAL: Ollama streaming must be disabled for structured outputs
// Streaming breaks JSON parsing for PydanticAI"
```

**GOTCHA 2: Timeout Configuration**
```typescript
// Default timeout is 10 minutes (600000 ms)
// Large documents may need more time
// Set via environment: OLLAMA_TIMEOUT=900000  (15 minutes)

// If you see timeout errors, increase this value
```

**GOTCHA 3: Error Handling for OOM**
```typescript
// From PRP lines 315-325:
// "GOTCHA: Qwen 32B Q4_K_M requires ~20-24GB RAM
// M1 Max with 64GB is fine, but smaller machines will OOM"

// Always catch OOM and suggest fallback
try {
  const response = await ollama.chat(prompt)
} catch (error) {
  if (error instanceof OOMError) {
    // Log and mark for review, don't crash
    console.error('Qwen OOM - falling back to regex cleanup')
  }
}
```

**GOTCHA 4: Pattern from Existing Code**
```typescript
// Mirror pattern from worker/lib/markdown-cleanup-ai.ts (lines 85-140)
// Key elements:
// 1. Configuration from environment
// 2. Error handling with specific error types
// 3. Progress callbacks for long operations
// 4. Batching for large documents
```

#### Validation

```bash
# Create a test file
cat > worker/lib/local/__tests__/ollama-client.test.ts << 'EOF'
import { OllamaClient, testOllamaConnection } from '../ollama-client'

describe('OllamaClient', () => {
  it('should connect to Ollama server', async () => {
    const connected = await testOllamaConnection()
    expect(connected).toBe(true)
  })

  it('should send chat message', async () => {
    const client = new OllamaClient()
    const response = await client.chat('What is 2+2? Reply with only the number.')
    expect(response).toContain('4')
  })

  it('should generate structured JSON', async () => {
    const client = new OllamaClient()
    const result = await client.generateStructured(
      'Return JSON: {"success": true, "value": 42}'
    )
    expect(result.success).toBe(true)
    expect(result.value).toBe(42)
  })
})
EOF

# Run test
cd worker
npm test -- ollama-client.test.ts

# Expected: All tests pass
# If Ollama not running: Tests will fail with ECONNREFUSED

# Manual verification
node -e "
const { OllamaClient } = require('./lib/local/ollama-client.ts');
const client = new OllamaClient();
client.chat('Say: SUCCESS').then(r => console.log('Response:', r));
"
# Expected: Response: SUCCESS (or similar affirmative)
```

---

## Integration Points

### Database
- **Migration**: `045_add_local_pipeline_columns.sql`
- **Tables Modified**: `chunks` (8 new columns)
- **Indexes Created**: 3 new indexes for efficient querying

### Python Environment
- **Packages**: docling, pydantic-ai[ollama], sentence-transformers, transformers
- **Requirements**: Python 3.10+, ~2-3GB disk space for packages
- **Scripts Location**: `worker/scripts/`

### Node.js Worker Module
- **Packages**: ollama, @huggingface/transformers
- **New Directory**: `worker/lib/local/` for local processing utilities
- **Configuration**: Environment variables for Ollama

### External Services
- **Ollama Server**: Must run on http://127.0.0.1:11434
- **Model Storage**: ~/.ollama/models/ (~20GB for Qwen 32B)

## External References

### Documentation Links
- **Ollama Installation**: https://ollama.com/download
- **Qwen Model Specs**: https://ollama.com/library/qwen2.5:32b-instruct
- **Ollama JS SDK**: https://github.com/ollama/ollama-js
- **PydanticAI Install**: https://ai.pydantic.dev/install/
- **Docling PyPI**: https://pypi.org/project/docling/

### Codebase References
- **Migration Pattern**: `supabase/migrations/041_*.sql` (latest migration format)
- **Python Subprocess**: `worker/lib/docling-extractor.ts:86-221` (IPC pattern)
- **AI Client Pattern**: `worker/lib/markdown-cleanup-ai.ts:85-140` (configuration)

## Validation Checklist

- [ ] Migration 045 applied successfully (`npx supabase db reset`)
- [ ] All 8 new columns exist in chunks table
- [ ] Indexes created: idx_chunks_pages, idx_chunks_section, idx_chunks_confidence
- [ ] Python 3.10+ installed and accessible
- [ ] docling package installed (`python -c "import docling"`)
- [ ] pydantic-ai[ollama] installed (`python -c "from pydantic_ai import Agent"`)
- [ ] Ollama server running (`curl http://localhost:11434/api/tags`)
- [ ] Qwen 32B model pulled (`ollama list | grep qwen2.5:32b`)
- [ ] Ollama JS SDK installed (`node -e "require('ollama')"`)
- [ ] OllamaClient module created and imports successfully
- [ ] Test connection works (`testOllamaConnection()` returns true)
- [ ] No TypeScript errors (`cd worker && npm run type-check`)

## Success Criteria

✅ **Database Ready**
- Migration 045 applied
- All columns and indexes created
- No errors in database schema

✅ **Python Environment Ready**
- All packages installed without errors
- Import tests pass for all libraries
- Python version 3.10+

✅ **Ollama Operational**
- Server running and accessible
- Qwen 32B model downloaded
- Test prompt responds correctly

✅ **Client Module Functional**
- OllamaClient compiles without TypeScript errors
- Connection test succeeds
- Chat and structured generation work

✅ **Ready for Phase 2**
- All Phase 1 tasks complete
- No blockers for Docling integration
- Environment variables documented

---

## Notes & Additional Context

### Why Q4_K_M Quantization?
The PRP specifies Q4_K_M quantization (not Q8) because:
- **Speed**: 2-3x faster inference on M1 Max
- **Memory**: ~20GB vs ~40GB for Q8
- **Quality**: Minimal quality loss for cleanup/metadata tasks
- **Reference**: PRP lines 163-164

### Hardware Requirements
From PRP line 18: "Hardware Context: 64GB M1 Max (sufficient for Qwen 32B Q4_K_M quantization)"

If you have less RAM:
- 32GB: Use Qwen 14B (Q4_K_M)
- 16GB: Use Qwen 7B (Q4_K_M)
- Update OLLAMA_MODEL environment variable accordingly

### Why This Phase Blocks Everything
All subsequent phases depend on:
1. **Database schema**: Phases 4-6 store structural metadata
2. **Python environment**: Phases 2, 5 use Python scripts
3. **Ollama**: Phases 3, 5 use local LLM
4. **Client module**: Phase 3 uses OllamaClient

### Cost Savings Calculation
Current Gemini costs (per 500-page book):
- Extraction: $0.12
- Cleanup: $0.08
- Metadata: $0.20
- Embeddings: $0.02
- **Total**: $0.42 per book

Local pipeline costs: **$0.00**

1000 books: **Save $420**
10,000 books: **Save $4,200**

### Next Steps
After completing Phase 1, proceed to:
- **Phase 2**: Docling Integration (Tasks 5-7)
- Uses Python environment from Task 2
- Uses database schema from Task 1
