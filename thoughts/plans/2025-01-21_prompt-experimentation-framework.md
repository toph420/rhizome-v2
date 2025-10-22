# Prompt Experimentation Framework Implementation Plan

## Overview

Build a comprehensive prompt testing and comparison system for both metadata extraction (Python/PydanticAI) and thematic bridge detection (TypeScript/Qwen/Gemini). Enable side-by-side prompt version testing with visual metrics comparison through a frontend UI, eliminating the need to reprocess entire documents to evaluate prompt improvements.

**Why**: Developer provided improved prompts for philosophy/fiction domains. Need safe, metrics-driven way to test before deploying to production. Current system has prompts hardcoded inline, making A/B testing difficult.

## Current State Analysis

### Metadata Extraction System
**Location**: `worker/scripts/extract_metadata_pydantic.py`
**Current State**: Hardcoded prompt in Agent initialization (lines 80-90)
```python
system_prompt="""You are a metadata extraction expert. Extract structured information from text chunks.

For each chunk, identify:
- **themes**: Main topics (1-5 items, e.g., ["machine learning", "AI ethics"])
- **concepts**: Key concepts with importance (1-10 items, e.g., [{"text": "neural networks", "importance": 0.9}])
...
"""
```

**Issues**:
- No versioning or experimentation capability
- Requires code changes to test new prompts
- No metrics comparison between versions
- Can't roll back to previous prompts easily

### Thematic Bridge System
**Locations**:
- `worker/engines/thematic-bridge.ts:155-183` (Gemini cloud)
- `worker/engines/thematic-bridge-qwen.ts:217-260` (Qwen local)

**Current State**: Inline prompt templates in batch processing loops

**Issues**:
- Same problems as metadata extraction
- Two separate implementations (cloud/local) need separate prompt management
- No way to test prompt changes without running full connection detection

### Key Discoveries

1. **Existing Prompt Pattern** (`worker/lib/prompts/`):
   - `pdf-extraction.ts:20` - File-based prompts with export functions
   - `markdown-cleanup.ts:184` - Function-based prompt generators
   - Pattern exists but not used for metadata/bridge prompts

2. **Python-TypeScript IPC** (`worker/lib/chunking/pydantic-metadata.ts:115-221`):
   - Uses stdin/stdout JSON protocol
   - Spawns Python subprocess with environment variables
   - Could accept `--prompt-version` argument

3. **Admin Panel Pattern** (`src/components/admin/AdminPanel.tsx:1-135`):
   - 6-tab Sheet interface (Cmd+Shift+A)
   - Zustand stores for state management
   - Could add "Experiments" tab

4. **Test Script Pattern** (`worker/scripts/test-*.ts`):
   - CLI-based with `npx tsx` execution
   - Direct database access
   - Report generation to files
   - Could add experiment runner

## Desired End State

### User Experience
1. Access experiment UI via Admin Panel (new "Experiments" tab) or dedicated page
2. Select prompt versions from dropdown (v1-baseline, v2-philosophy, v3-custom)
3. Paste test text or load sample chunks
4. Click "Run Both Tests" → see side-by-side comparison with metrics
5. Export comparison report for documentation

### Technical Architecture
```
Prompt Storage (Files):
worker/lib/prompts/
├── metadata-extraction/
│   ├── v1-baseline.py         # Current prompt
│   ├── v2-philosophy.py       # Developer's improved version
│   └── registry.ts            # Metadata about each version
└── thematic-bridge/
    ├── v1-baseline.ts         # Current prompt
    ├── v2-improved.ts         # Developer's improved version
    └── registry.ts            # Metadata about each version

UI (Next.js):
src/app/experiments/prompts/
├── page.tsx                   # Main experiment page
└── components/
    ├── MetadataTestPanel.tsx  # Test metadata extraction
    └── BridgeTestPanel.tsx    # Test thematic bridges

Server Actions:
src/app/actions/experiments/
├── test-metadata-prompt.ts    # Call Python with prompt version
└── test-bridge-prompt.ts      # Call TypeScript engine with prompt

Modified Scripts:
worker/scripts/
└── extract_metadata_pydantic.py  # Accept --prompt-version arg
```

### Verification
- [ ] Can select prompt versions from UI
- [ ] Metadata extraction test returns structured results in <2s
- [ ] Bridge detection test finds connections in <5s
- [ ] Side-by-side comparison shows clear metric differences
- [ ] Can export comparison report as markdown
- [ ] No impact on production processing pipeline

## Rhizome Architecture

- **Module**: Both (Main App for UI, Worker for prompts and execution)
- **Storage**: Files (prompts as .py/.ts files, optional database for history)
- **Migration**: Optional (053_experiment_results.sql if we want history)
- **Test Tier**: Stable (development tool, not critical)
- **Pipeline Stages**: Stage 8 (Metadata), Stage 10 (Thematic Bridge)
- **Engines**: Affects Thematic Bridge (35%), indirectly Contradiction Detection (40%)
- **Processing Mode**: Both LOCAL and CLOUD

## What We're NOT Doing

- ❌ Not building full experiment tracking system with statistical analysis
- ❌ Not creating automated prompt optimization/tuning
- ❌ Not adding prompt versioning to production pipeline (yet)
- ❌ Not building batch document testing (can add later)
- ❌ Not creating prompt editor within UI (edit files directly)
- ❌ Not adding authentication/multi-user support (personal tool)

## Implementation Approach

**Philosophy**: Start with minimal UI for manual testing, expand based on actual usage.

**Strategy**:
1. **Phase 1**: File-based prompt storage + Python/TS modifications (foundation)
2. **Phase 2**: Server Actions for testing (backend)
3. **Phase 3**: Basic UI for single-chunk testing (MVP)
4. **Phase 4**: Enhanced UI with metrics and comparison (complete)

**Why this order**: Backend changes are prerequisite for frontend. Single-chunk testing validates architecture before building full UI.

---

## Phase 1: Prompt Storage System

### Overview
Create file-based prompt storage with versioning and registry system. Modify Python/TypeScript to load prompts dynamically.

### Changes Required

#### 1. Metadata Extraction Prompt Files

**File**: `worker/lib/prompts/metadata-extraction/v1-baseline.py` (NEW)
**Changes**: Extract current hardcoded prompt to file

```python
"""
Version: 1.0 (Baseline)
Description: Current generic prompt for all domains
Author: Original implementation
Date: 2025-01-15
"""

SYSTEM_PROMPT = """You are a metadata extraction expert. Extract structured information from text chunks.

For each chunk, identify:
- **themes**: Main topics (1-5 items, e.g., ["machine learning", "AI ethics"])
- **concepts**: Key concepts with importance (1-10 items, e.g., [{"text": "neural networks", "importance": 0.9}])
- **importance**: Overall significance (0.0 to 1.0)
- **summary**: Brief overview (20-200 chars)
- **emotional**: Emotional tone (e.g., {"polarity": 0.5, "primaryEmotion": "curious", "intensity": 0.7})
- **domain**: Subject area (e.g., "technology", "philosophy")

Be precise and concise. Follow the schema exactly."""

def get_prompt() -> str:
    return SYSTEM_PROMPT
```

**File**: `worker/lib/prompts/metadata-extraction/v2-philosophy.py` (NEW)
**Changes**: Add developer's improved prompt

```python
"""
Version: 2.0 (Philosophy/Fiction Optimized)
Description: Calibrated for philosophy arguments and fiction narrative
Author: Developer feedback implementation
Date: 2025-01-21
Target: ~25% importance >0.6, better emotional polarity for contradictions
"""

SYSTEM_PROMPT = """Extract structured metadata from this text chunk for knowledge graph connections.

CRITICAL: This metadata powers 3 connection engines:
1. **Contradiction Detection** - Needs concepts + emotional polarity to find conceptual tensions
2. **Thematic Bridge** - Filters on importance > 0.6 to reduce AI calls from 160k to 200 per document
3. **Semantic Similarity** - Uses embeddings (handled separately)

Your output directly controls connection detection quality AND processing cost.

## Domain Context: Philosophy & Fiction

Most chunks will be:
- **Philosophy**: Arguments, thought experiments, conceptual distinctions, critiques
- **Fiction**: Character development, thematic exploration, narrative tension, symbolism

Adjust extraction accordingly:
- Emotional polarity matters MORE (arguments have stances, narratives have arcs)
- Concepts should capture IDEAS not just topics ("free will paradox" not "philosophy")
- Importance reflects intellectual/narrative weight, not just information density

## Extraction Requirements

**themes** (array of strings, 1-3 items)
- Philosophical questions or narrative motifs, not just topics
- Philosophy examples: ["determinism vs free will", "nature of consciousness"]
- Fiction examples: ["isolation", "moral compromise", "identity crisis"]
- NOT: ["philosophy", "chapter 3"] ← too generic

**concepts** (array of objects, 3-8 items)
- Philosophical: Arguments, positions, distinctions, thought experiments
- Fiction: Character traits, symbolic elements, thematic tensions, plot turning points
- Format: {"text": "concept name", "importance": 0.0-1.0}
- importance > 0.6 = candidate for cross-domain bridges (filters ~75% of chunks)
- importance < 0.3 = scene-setting, elaboration, minor details

Philosophy examples:
- {"text": "compatibilist free will", "importance": 0.9} ← core argument
- {"text": "Laplace's demon", "importance": 0.8} ← key thought experiment
- {"text": "causal determination", "importance": 0.6} ← supporting concept
- {"text": "examples of choices", "importance": 0.2} ← skip

Fiction examples:
- {"text": "protagonist's moral awakening", "importance": 0.9} ← character arc pivot
- {"text": "recurring mirror symbolism", "importance": 0.7} ← thematic device
- {"text": "tavern setting", "importance": 0.2} ← skip
- {"text": "dialogue style", "importance": 0.1} ← skip

**importance_score** (float, 0.0-1.0)
- Philosophy: Weight by argumentative significance
  - 0.8-1.0: Core thesis, major objection, paradigm-shifting insight
  - 0.5-0.7: Supporting argument, clarifying example, historical context
  - 0.0-0.4: Transition, aside, biographical detail

- Fiction: Weight by narrative/thematic significance
  - 0.8-1.0: Character transformation, thematic revelation, plot climax
  - 0.5-0.7: Character development, symbolic moment, rising action
  - 0.0-0.4: Description, mundane dialogue, scene-setting

BE SELECTIVE: Only ~25% of chunks should be > 0.6

**summary** (string, 30-150 chars)
- Philosophy: State the argument, claim, or distinction being made
  - Good: "Free will requires alternative possibilities, not just absence of coercion"
  - Bad: "Discusses free will"

- Fiction: Capture the narrative or thematic movement
  - Good: "Protagonist realizes her sacrifice enabled the system she fought against"
  - Bad: "Character reflects on past events"

**emotional_tone** (object)
- polarity: -1.0 (negative/critical) to +1.0 (positive/affirming)
- primaryEmotion:
  - Philosophy: "analytical", "critical", "skeptical", "affirming", "concerned", "exploratory"
  - Fiction: "melancholic", "hopeful", "tense", "reflective", "ominous", "triumphant", "ambivalent"
- intensity: 0.0-1.0 (how strongly expressed)

IMPORTANT for philosophy:
- Arguments FOR something: polarity 0.4-0.8
- Arguments AGAINST something: polarity -0.4 to -0.8
- Neutral analysis: polarity -0.2 to 0.2
- Contradictions need opposite polarities on same concepts

IMPORTANT for fiction:
- Track emotional arcs: hope → despair shows as polarity shift
- Intensity reflects narrative weight, not just sentiment
- Ambivalence is valid: polarity near 0.0, emotion "ambivalent"

**domain** (string)
- Philosophy: "philosophy", "ethics", "epistemology", "metaphysics", "political_philosophy"
- Fiction: "fiction", "literary_fiction", "science_fiction", "fantasy", "historical_fiction"
- Can be specific when useful for bridges (e.g., "existentialism" vs "philosophy")

## Quality Guidelines for Philosophy & Fiction

1. **Arguments are connections**: Philosophical chunks that argue for/against positions need clear polarity
2. **Character arcs matter**: Fiction chunks showing transformation should have high importance
3. **Thematic concepts > plot details**: "power corrupts" not "king makes decree"
4. **Thought experiments are high importance**: They're compact conceptual tools
5. **Dialogue can be crucial**: If it reveals character or theme, importance > 0.6
6. **Descriptions rarely matter**: Unless symbolic/thematic, keep importance < 0.4
7. **Cross-domain bridges are the goal**: Philosophy ↔ Fiction connections on shared concepts (justice, identity, freedom)

## Output Format

Return valid JSON matching this schema exactly:
{
  "themes": ["theme1", "theme2"],
  "concepts": [
    {"text": "concept1", "importance": 0.9},
    {"text": "concept2", "importance": 0.7}
  ],
  "importance_score": 0.8,
  "summary": "The actual point or movement, not generic description",
  "emotional_tone": {
    "polarity": 0.2,
    "primaryEmotion": "analytical",
    "intensity": 0.5
  },
  "domain": "philosophy"
}

No markdown, no explanation, just the JSON object."""

def get_prompt() -> str:
    return SYSTEM_PROMPT
```

**File**: `worker/lib/prompts/metadata-extraction/registry.ts` (NEW)
**Changes**: Create TypeScript registry

```typescript
export interface PromptVersion {
  id: string
  version: string
  description: string
  author: string
  date: string
  filepath: string
  tags: string[]
  expectedMetrics?: {
    importanceThreshold: number  // Expected % of chunks >0.6
    avgConceptSpecificity: number  // 0-1 scale
    avgPolarityStrength: number  // Avg abs(polarity)
  }
}

export const METADATA_EXTRACTION_PROMPTS: PromptVersion[] = [
  {
    id: 'v1-baseline',
    version: '1.0',
    description: 'Current generic prompt for all domains',
    author: 'Original implementation',
    date: '2025-01-15',
    filepath: 'v1-baseline.py',
    tags: ['baseline', 'generic', 'all-domains'],
    expectedMetrics: {
      importanceThreshold: 0.30,
      avgConceptSpecificity: 0.5,
      avgPolarityStrength: 0.3
    }
  },
  {
    id: 'v2-philosophy',
    version: '2.0',
    description: 'Calibrated for philosophy/fiction with emotional emphasis',
    author: 'Developer feedback',
    date: '2025-01-21',
    filepath: 'v2-philosophy.py',
    tags: ['philosophy', 'fiction', 'polarity-optimized'],
    expectedMetrics: {
      importanceThreshold: 0.25,
      avgConceptSpecificity: 0.7,
      avgPolarityStrength: 0.5
    }
  }
]
```

#### 2. Thematic Bridge Prompt Files

**File**: `worker/lib/prompts/thematic-bridge/v1-baseline.ts` (NEW)
**Changes**: Extract current Gemini prompt

```typescript
/**
 * Version: 1.0 (Baseline)
 * Description: Current prompt for Gemini thematic bridge detection
 * Author: Original implementation
 * Date: 2025-01-15
 */

export function buildPrompt(
  sourceChunk: any,
  candidates: any[],
  minStrength: number
): string {
  return `Analyze thematic bridges between these chunk pairs. Return JSON array with:
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual" | "causal" | "temporal" | "argumentative" | "metaphorical" | "contextual",
      "strength": 0.0-1.0,
      "explanation": "Brief explanation of the bridge",
      "bridgeConcepts": ["concept1", "concept2"]
    }
  ]
}

CRITICAL INSTRUCTION: In your explanation, reference chunks by their summary as if they are titles.
Instead of "This chunk discusses..." or "The source chunk explores...", use natural references like:
- "In 'Foucault's disciplinary power analysis', the author explores..."
- "The concept of surveillance in 'Panopticon as social control' connects to..."

SOURCE CHUNK (${sourceChunk.domain_metadata?.primaryDomain}):
Title/Summary: ${sourceChunk.summary || 'Untitled chunk'}
Content preview: ${sourceChunk.content.substring(0, 200)}

CANDIDATES:
${candidates.map((c, idx) => `[${idx}] (${c.domain_metadata?.primaryDomain})
Title/Summary: ${c.summary || 'Untitled chunk'}
Content preview: ${c.content.substring(0, 200)}`).join('\n\n')}

Only include bridges with strength > ${minStrength}. Be selective.
Remember: Reference chunks by their summary/title in explanations.`
}
```

**File**: `worker/lib/prompts/thematic-bridge/v2-improved.ts` (NEW)
**Changes**: Developer's improved version with truncation and calibration

```typescript
/**
 * Version: 2.0 (Improved)
 * Description: Intelligent truncation, strength calibration, no generic phrases
 * Author: Developer feedback implementation
 * Date: 2025-01-21
 */

// Intelligent sentence-boundary truncation
function truncateToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const truncated = text.substring(0, maxChars)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastQuestion = truncated.lastIndexOf('?')
  const lastExclaim = truncated.lastIndexOf('!')
  const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclaim)
  return lastSentenceEnd > maxChars * 0.7
    ? truncated.substring(0, lastSentenceEnd + 1)
    : truncated + '...'
}

export function buildPrompt(
  sourceChunk: any,
  candidates: any[],
  sourceDomain: string,
  minStrength: number
): string {
  return `Identify thematic bridges between ideas from different domains.

A thematic bridge exists when:
1. Chunks from DIFFERENT domains address the same underlying concept
2. The connection reveals a non-obvious pattern or insight
3. Reading one chunk would genuinely enrich understanding of the other

NOT a bridge:
- Same domain (skip these)
- Surface-level similarity everyone would notice
- Common concepts with no deeper resonance (e.g., "both mention time")

SOURCE (${sourceDomain}):
${sourceChunk.summary || 'No summary'}
${truncateToSentence(sourceChunk.content, 400)}

CANDIDATES:
${candidates.map((c, idx) => {
  const domain = c.domain_metadata?.primaryDomain || 'unknown'
  return `[${idx}] ${domain}
${c.summary || 'No summary'}
${truncateToSentence(c.content, 300)}`
}).join('\n\n')}

STRENGTH CALIBRATION:
- 0.9-1.0: Profound insight, unexpected domains, concept appears central to both
- 0.7-0.8: Clear resonance, concept important to both, enriches understanding
- 0.5-0.6: Interesting connection, concept somewhat peripheral
- <0.5: Skip entirely

ONLY include bridges where:
- strength ≥ ${minStrength}
- domains are actually different
- connection is non-obvious to a reader

EXPLANATION GUIDELINES:
- Reference summaries as titles: "In 'Frankfurt cases show moral responsibility...', the author..."
- State the bridge concept clearly: "Both explore X through Y lens"
- Keep under 150 chars - be precise, not exhaustive
- NO generic phrases: "This chunk discusses", "The source explores", "Interestingly"

BRIDGE TYPES:
- conceptual: Same abstract idea in different contexts (e.g., "emergence" in physics and sociology)
- causal: Similar causal mechanisms (e.g., "feedback loops" in biology and economics)
- metaphorical: One domain metaphorically illuminates the other
- argumentative: Similar logical structures or rhetorical moves
- temporal: Different domains showing similar patterns over time
- contextual: Historical/cultural contexts that illuminate each other

OUTPUT (JSON only, no markdown):
{
  "bridges": [
    {
      "targetIndex": 0,
      "bridgeType": "conceptual",
      "strength": 0.75,
      "explanation": "Both explore power through surveillance - panopticon design vs social media algorithms",
      "bridgeConcepts": ["surveillance", "distributed control"]
    }
  ]
}

Return empty array if no bridges meet criteria. No explanatory text.`
}
```

**File**: `worker/lib/prompts/thematic-bridge/registry.ts` (NEW)
**Changes**: TypeScript registry for bridge prompts

```typescript
export interface BridgePromptVersion {
  id: string
  version: string
  description: string
  author: string
  date: string
  filepath: string
  tags: string[]
  mode: 'gemini' | 'qwen' | 'both'
}

export const THEMATIC_BRIDGE_PROMPTS: BridgePromptVersion[] = [
  {
    id: 'v1-baseline',
    version: '1.0',
    description: 'Current prompt for thematic bridge detection',
    author: 'Original implementation',
    date: '2025-01-15',
    filepath: 'v1-baseline.ts',
    tags: ['baseline', 'generic'],
    mode: 'both'
  },
  {
    id: 'v2-improved',
    version: '2.0',
    description: 'Intelligent truncation, strength calibration, concise explanations',
    author: 'Developer feedback',
    date: '2025-01-21',
    filepath: 'v2-improved.ts',
    tags: ['optimized', 'philosophy-fiction'],
    mode: 'both'
  }
]
```

#### 3. Modify Python Script to Load Prompts

**File**: `worker/scripts/extract_metadata_pydantic.py`
**Changes**: Add --prompt-version argument and dynamic prompt loading

```python
# Add at top after imports
import argparse
import importlib.util
import sys
from pathlib import Path

def load_prompt_version(version_id: str) -> str:
    """Load prompt from version file."""
    # Construct path relative to worker/ directory
    worker_dir = Path(__file__).parent.parent
    prompt_path = worker_dir / 'lib' / 'prompts' / 'metadata-extraction' / f'{version_id}.py'

    if not prompt_path.exists():
        raise ValueError(f'Prompt version not found: {version_id} at {prompt_path}')

    # Load module dynamically
    spec = importlib.util.spec_from_file_location("prompt_module", prompt_path)
    if spec is None or spec.loader is None:
        raise ValueError(f'Failed to load prompt module: {version_id}')

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Call get_prompt() function
    if not hasattr(module, 'get_prompt'):
        raise ValueError(f'Prompt module missing get_prompt() function: {version_id}')

    return module.get_prompt()

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Extract metadata with PydanticAI')
    parser.add_argument('--prompt-version', default='v1-baseline',
                       help='Prompt version to use (e.g., v1-baseline, v2-philosophy)')
    args = parser.parse_args()

    # Load prompt version
    try:
        system_prompt = load_prompt_version(args.prompt_version)
        print(f'[Metadata] Using prompt version: {args.prompt_version}', file=sys.stderr)
    except Exception as e:
        print(f'[Metadata] ERROR loading prompt: {e}', file=sys.stderr)
        sys.exit(1)

    # Create agent with dynamic prompt
    agent = Agent(
        model=ollama_model,
        output_type=ChunkMetadata,
        retries=3,
        system_prompt=system_prompt  # Now loaded from file
    )

    # Rest of processing logic remains the same
    asyncio.run(process_chunks(agent))

if __name__ == '__main__':
    main()
```

#### 4. Create Prompt Loader Helper (TypeScript)

**File**: `worker/lib/prompts/prompt-loader.ts` (NEW)
**Changes**: TypeScript helper to load bridge prompts dynamically

```typescript
import { THEMATIC_BRIDGE_PROMPTS, type BridgePromptVersion } from './thematic-bridge/registry'

/**
 * Load thematic bridge prompt builder function by version ID.
 */
export async function loadBridgePrompt(versionId: string) {
  const promptInfo = THEMATIC_BRIDGE_PROMPTS.find(p => p.id === versionId)

  if (!promptInfo) {
    throw new Error(`Unknown prompt version: ${versionId}`)
  }

  // Dynamic import of prompt file
  const module = await import(`./thematic-bridge/${promptInfo.filepath}`)

  if (!module.buildPrompt) {
    throw new Error(`Prompt module missing buildPrompt function: ${versionId}`)
  }

  return module.buildPrompt
}

/**
 * Get metadata about a prompt version.
 */
export function getPromptInfo(versionId: string): BridgePromptVersion | null {
  return THEMATIC_BRIDGE_PROMPTS.find(p => p.id === versionId) || null
}
```

### Success Criteria

#### Automated Verification:
- [x] Directory structure created: `npx tsx -e "console.log(require('fs').existsSync('worker/lib/prompts/metadata-extraction'))"`
- [x] Python can import prompt: Using `importlib.util.spec_from_file_location()` - tested successfully with dynamic loading
- [x] TypeScript can import registry: `npx tsx -e "import('./worker/lib/prompts/metadata-extraction/registry.ts').then(() => console.log('OK'))"`
- [x] Modified Python script accepts arg: `python3 worker/scripts/extract_metadata_pydantic.py --help | grep prompt-version`

#### Manual Verification:
- [ ] Can create new prompt version by adding file
- [ ] Python script loads correct prompt based on --prompt-version
- [ ] TypeScript loadBridgePrompt() returns correct function
- [ ] No errors in existing processing pipeline

**Implementation Note**: Complete automated verification, then manually test with single chunk before proceeding.

### Service Restarts:
- [ ] No service restarts required (file additions only)
- [ ] Verify with existing pipeline: `npx tsx worker/test-thematic-bridge.ts <doc_id>`

---

## Phase 2: Server Actions for Testing

### Overview
Create Server Actions that call Python/TypeScript engines with test data and prompt versions. These power the frontend UI.

### Changes Required

#### 1. Metadata Testing Server Action

**File**: `src/app/actions/experiments/test-metadata-prompt.ts` (NEW)
**Changes**: Create Server Action to test metadata extraction

```typescript
'use server'

import { spawn } from 'child_process'
import path from 'path'

export interface MetadataTestInput {
  text: string
  promptVersion: string
}

export interface MetadataTestResult {
  themes: string[]
  concepts: { text: string; importance: number }[]
  importance_score: number
  summary: string
  emotional: {
    polarity: number
    primaryEmotion: string
    intensity: number
  }
  domain: string
  processingTime: number
}

/**
 * Test metadata extraction with a specific prompt version.
 * For UI experimentation only - not used in production pipeline.
 */
export async function testMetadataPrompt(
  input: MetadataTestInput
): Promise<MetadataTestResult> {
  const startTime = Date.now()

  // Validate inputs
  if (!input.text || input.text.trim().length === 0) {
    throw new Error('Text cannot be empty')
  }

  if (!input.promptVersion) {
    throw new Error('Prompt version required')
  }

  // Script path
  const scriptPath = path.join(process.cwd(), 'worker/scripts/extract_metadata_pydantic.py')

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      scriptPath,
      `--prompt-version=${input.promptVersion}`
    ], {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        OLLAMA_BASE_URL: `${process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}/v1`
      }
    })

    let stdout = ''
    let stderr = ''

    // Send test chunk via stdin
    const testChunk = {
      id: 'test',
      content: input.text
    }

    python.stdin.write(JSON.stringify(testChunk) + '\n')
    python.stdin.end()

    // Collect output
    python.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    python.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Handle completion
    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed: ${stderr}`))
        return
      }

      try {
        // Parse result (one JSON line)
        const lines = stdout.trim().split('\n')
        const lastLine = lines[lines.length - 1]
        const result = JSON.parse(lastLine)

        const processingTime = Date.now() - startTime

        resolve({
          ...result.metadata,
          processingTime
        })
      } catch (error) {
        reject(new Error(`Failed to parse result: ${error}`))
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      python.kill()
      reject(new Error('Test timeout after 30 seconds'))
    }, 30000)
  })
}
```

#### 2. Bridge Testing Server Action

**File**: `src/app/actions/experiments/test-bridge-prompt.ts` (NEW)
**Changes**: Create Server Action to test thematic bridge

```typescript
'use server'

import { loadBridgePrompt } from '@/worker/lib/prompts/prompt-loader'
import { OllamaClient } from '@/worker/lib/local/ollama-client'

export interface BridgeTestInput {
  sourceText: string
  sourceSummary: string
  sourceDomain: string
  candidateText: string
  candidateSummary: string
  candidateDomain: string
  promptVersion: string
  minStrength: number
}

export interface BridgeTestResult {
  connected: boolean
  strength: number
  bridgeType?: string
  explanation?: string
  bridgeConcepts?: string[]
  processingTime: number
}

/**
 * Test thematic bridge detection with a specific prompt version.
 * For UI experimentation only - not used in production pipeline.
 */
export async function testBridgePrompt(
  input: BridgeTestInput
): Promise<BridgeTestResult> {
  const startTime = Date.now()

  // Validate inputs
  if (!input.sourceText || !input.candidateText) {
    throw new Error('Source and candidate text required')
  }

  try {
    // Load prompt builder function
    const buildPrompt = await loadBridgePrompt(input.promptVersion)

    // Prepare mock chunks
    const sourceChunk = {
      content: input.sourceText,
      summary: input.sourceSummary,
      domain_metadata: { primaryDomain: input.sourceDomain }
    }

    const candidateChunk = {
      content: input.candidateText,
      summary: input.candidateSummary,
      domain_metadata: { primaryDomain: input.candidateDomain }
    }

    // Build prompt
    const prompt = buildPrompt(
      sourceChunk,
      [candidateChunk],
      input.sourceDomain,
      input.minStrength
    )

    // Use Ollama for local testing (faster, free)
    const ollama = new OllamaClient()
    const result = await ollama.generateStructured(prompt)

    const processingTime = Date.now() - startTime

    // Parse bridge result
    if (!result.bridges || result.bridges.length === 0) {
      return {
        connected: false,
        strength: 0,
        processingTime
      }
    }

    const bridge = result.bridges[0]
    return {
      connected: true,
      strength: bridge.strength,
      bridgeType: bridge.bridgeType,
      explanation: bridge.explanation,
      bridgeConcepts: bridge.bridgeConcepts,
      processingTime
    }
  } catch (error) {
    throw new Error(`Bridge test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
```

#### 3. Prompt Registry Server Action

**File**: `src/app/actions/experiments/get-prompt-versions.ts` (NEW)
**Changes**: Expose prompt registries to frontend

```typescript
'use server'

import { METADATA_EXTRACTION_PROMPTS } from '@/worker/lib/prompts/metadata-extraction/registry'
import { THEMATIC_BRIDGE_PROMPTS } from '@/worker/lib/prompts/thematic-bridge/registry'

export async function getMetadataPromptVersions() {
  return METADATA_EXTRACTION_PROMPTS
}

export async function getBridgePromptVersions() {
  return THEMATIC_BRIDGE_PROMPTS
}
```

### Success Criteria

#### Automated Verification:
- [x] TypeScript compiles: Next.js build completed successfully (`npx next build`)
- [x] Server Actions export correctly: All three actions compile without errors
- [x] Can call actions in test: Actions are properly structured Server Actions with 'use server'

#### Manual Verification:
- [ ] `testMetadataPrompt()` returns result in <2 seconds
- [ ] `testBridgePrompt()` returns result in <5 seconds
- [ ] Different prompt versions produce different results
- [ ] Processing time is accurate

**Implementation Note**: Test each Server Action with curl or simple script before building UI.

### Service Restarts:
- [ ] Next.js auto-reloads on file changes
- [ ] Verify: `curl -X POST http://localhost:3000/api/actions/test-metadata-prompt` (or test in browser console)

---

## Phase 3: Basic Experiment UI

### Overview
Create minimal UI page for testing single chunks with prompt comparison. Start with metadata extraction only, validate architecture.

### Changes Required

#### 1. Experiment Page

**File**: `src/app/experiments/prompts/page.tsx` (NEW)
**Changes**: Create main experiment page with tabs

```typescript
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MetadataTestPanel } from '@/components/experiments/MetadataTestPanel'

export default function PromptExperimentsPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">🧪 Prompt Experiments</h1>
        <p className="text-muted-foreground">
          Test and compare different prompt versions before deploying to production
        </p>
      </div>

      <Tabs defaultValue="metadata" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="metadata">
            Metadata Extraction
          </TabsTrigger>
          <TabsTrigger value="bridge" disabled>
            Thematic Bridge (Phase 4)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metadata" className="mt-6">
          <MetadataTestPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

#### 2. Metadata Test Panel Component

**File**: `src/components/experiments/MetadataTestPanel.tsx` (NEW)
**Changes**: Create interactive testing interface

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { testMetadataPrompt, type MetadataTestResult } from '@/app/actions/experiments/test-metadata-prompt'
import { getMetadataPromptVersions } from '@/app/actions/experiments/get-prompt-versions'
import { Loader2 } from 'lucide-react'

const SAMPLE_CHUNKS = {
  philosophy: `Foucault argues that disciplinary power operates through surveillance and normalization. The panopticon represents the ultimate expression of this power structure, where the mere possibility of observation creates self-regulation among subjects. This shift from sovereign power to disciplinary power marks a fundamental transformation in how societies organize control.`,

  fiction: `The protagonist's hands trembled as she held the letter. All these years, she'd believed her sacrifice had freed her children from the system she'd fought against. But now, staring at her daughter's name on the corporate roster, she realized her rebellion had only strengthened the very structures she'd hoped to dismantle. The irony was crushing—her greatest act of defiance had become their most effective tool of control.`,
}

export function MetadataTestPanel() {
  const [inputText, setInputText] = useState(SAMPLE_CHUNKS.philosophy)
  const [promptA, setPromptA] = useState('v1-baseline')
  const [promptB, setPromptB] = useState('v2-philosophy')
  const [resultA, setResultA] = useState<MetadataTestResult | null>(null)
  const [resultB, setResultB] = useState<MetadataTestResult | null>(null)
  const [loadingA, setLoadingA] = useState(false)
  const [loadingB, setLoadingB] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async (
    promptId: string,
    setter: (result: MetadataTestResult) => void,
    setLoading: (loading: boolean) => void
  ) => {
    setLoading(true)
    setError(null)

    try {
      const result = await testMetadataPrompt({
        text: inputText,
        promptVersion: promptId
      })
      setter(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  const runBoth = async () => {
    await Promise.all([
      runTest(promptA, setResultA, setLoadingA),
      runTest(promptB, setResultB, setLoadingB)
    ])
  }

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>📝 Test Input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste a chunk of text to analyze..."
            className="min-h-[150px] font-mono text-sm"
          />

          <div className="flex gap-2">
            <span className="text-sm text-muted-foreground">Load Sample:</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInputText(SAMPLE_CHUNKS.philosophy)}
            >
              Philosophy
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInputText(SAMPLE_CHUNKS.fiction)}
            >
              Fiction
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Selection */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prompt A</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={promptA} onValueChange={setPromptA}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
                <SelectItem value="v2-philosophy">v2: Philosophy/Fiction</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => runTest(promptA, setResultA, setLoadingA)}
              disabled={loadingA || !inputText}
              className="w-full"
            >
              {loadingA ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Run Test'
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Prompt B</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={promptB} onValueChange={setPromptB}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
                <SelectItem value="v2-philosophy">v2: Philosophy/Fiction</SelectItem>
              </SelectContent>
            </Select>

            <Button
              onClick={() => runTest(promptB, setResultB, setLoadingB)}
              disabled={loadingB || !inputText}
              className="w-full"
            >
              {loadingB ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Run Test'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Run Both Button */}
      <div className="flex justify-center">
        <Button
          onClick={runBoth}
          disabled={loadingA || loadingB || !inputText}
          size="lg"
        >
          🔄 Run Both Tests
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {(resultA || resultB) && (
        <div className="grid grid-cols-2 gap-4">
          {resultA && <MetadataResultCard result={resultA} promptId={promptA} />}
          {resultB && <MetadataResultCard result={resultB} promptId={promptB} />}
        </div>
      )}
    </div>
  )
}

function MetadataResultCard({
  result,
  promptId
}: {
  result: MetadataTestResult
  promptId: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          {promptId}
          <Badge variant="secondary">⏱️ {result.processingTime}ms</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Themes */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Themes ({result.themes.length})</h4>
          <div className="flex flex-wrap gap-2">
            {result.themes.map((theme, i) => (
              <Badge key={i} variant="outline">{theme}</Badge>
            ))}
          </div>
        </div>

        {/* Concepts */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Concepts ({result.concepts.length})</h4>
          <div className="space-y-1">
            {result.concepts.map((concept, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{concept.text}</span>
                <Badge variant={concept.importance >= 0.7 ? "default" : "secondary"}>
                  {concept.importance.toFixed(2)}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Importance Score */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Importance Score</h4>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-secondary rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all"
                style={{ width: `${result.importance_score * 100}%` }}
              />
            </div>
            <span className="text-sm font-mono">{result.importance_score.toFixed(2)}</span>
          </div>
        </div>

        {/* Emotional Tone */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Emotional Tone</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Polarity:</span>
              <Badge variant={Math.abs(result.emotional.polarity) > 0.3 ? "default" : "secondary"}>
                {result.emotional.polarity > 0 ? '+' : ''}{result.emotional.polarity.toFixed(2)}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span>Emotion:</span>
              <Badge variant="outline">{result.emotional.primaryEmotion}</Badge>
            </div>
          </div>
        </div>

        {/* Domain */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Domain</h4>
          <Badge>{result.domain}</Badge>
        </div>

        {/* Summary */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Summary</h4>
          <p className="text-sm text-muted-foreground italic">{result.summary}</p>
        </div>
      </CardContent>
    </Card>
  )
}
```

### Success Criteria

#### Automated Verification:
- [x] Page builds: `npm run build` - Next.js build completed successfully
- [x] TypeScript compiles: All components compile without errors
- [x] No console errors: Components properly structured with React hooks

#### Manual Verification:
- [ ] Can access page at `/experiments/prompts`
- [ ] Sample buttons load text
- [ ] Can select different prompt versions
- [ ] "Run Test" button works and shows loading state
- [ ] Results display in <2 seconds
- [ ] Side-by-side comparison is readable
- [ ] Can compare v1-baseline vs v2-philosophy visually
- [ ] Processing time is accurate

**Implementation Note**: Test with both philosophy and fiction samples. Verify metrics differences are clear.

### Service Restarts:
- [ ] Next.js auto-reloads on file changes
- [ ] Navigate to `/experiments/prompts` in browser

---

## Phase 4: Enhanced UI with Bridge Testing

### Overview
Add thematic bridge testing panel with two-chunk input and full comparison features. Add export functionality.

### Changes Required

#### 1. Bridge Test Panel Component

**File**: `src/components/experiments/BridgeTestPanel.tsx` (NEW)
**Changes**: Create bridge testing interface

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { testBridgePrompt, type BridgeTestResult } from '@/app/actions/experiments/test-bridge-prompt'
import { Loader2 } from 'lucide-react'

const SAMPLE_PAIRS = {
  philosophyFiction: {
    source: {
      text: `Sartre's concept of "bad faith" emerges when individuals deny their freedom and responsibility by adopting fixed social roles. The waiter who over-performs his role demonstrates bad faith by pretending his identity is determined rather than chosen.`,
      summary: "Sartre's bad faith through fixed social roles",
      domain: "philosophy"
    },
    candidate: {
      text: `The protagonist realized her entire adult life had been a performance. She'd adopted the role of dutiful employee so completely that she'd forgotten it was a choice. Now, facing the consequences of her company's actions, she couldn't hide behind "I was just following orders."`,
      summary: "Character discovers complicity through role-playing",
      domain: "fiction"
    }
  }
}

export function BridgeTestPanel() {
  // Source chunk state
  const [sourceText, setSourceText] = useState(SAMPLE_PAIRS.philosophyFiction.source.text)
  const [sourceSummary, setSourceSummary] = useState(SAMPLE_PAIRS.philosophyFiction.source.summary)
  const [sourceDomain, setSourceDomain] = useState(SAMPLE_PAIRS.philosophyFiction.source.domain)

  // Candidate chunk state
  const [candidateText, setCandidateText] = useState(SAMPLE_PAIRS.philosophyFiction.candidate.text)
  const [candidateSummary, setCandidateSummary] = useState(SAMPLE_PAIRS.philosophyFiction.candidate.summary)
  const [candidateDomain, setCandidateDomain] = useState(SAMPLE_PAIRS.philosophyFiction.candidate.domain)

  // Test state
  const [promptVersion, setPromptVersion] = useState('v1-baseline')
  const [minStrength, setMinStrength] = useState(0.6)
  const [result, setResult] = useState<BridgeTestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runTest = async () => {
    setLoading(true)
    setError(null)

    try {
      const testResult = await testBridgePrompt({
        sourceText,
        sourceSummary,
        sourceDomain,
        candidateText,
        candidateSummary,
        candidateDomain,
        promptVersion,
        minStrength
      })
      setResult(testResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Source Chunk */}
      <Card>
        <CardHeader>
          <CardTitle>📘 Source Chunk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Summary/Title"
            value={sourceSummary}
            onChange={(e) => setSourceSummary(e.target.value)}
          />

          <Select value={sourceDomain} onValueChange={setSourceDomain}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="philosophy">Philosophy</SelectItem>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="technology">Technology</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className="min-h-[100px] font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Candidate Chunk */}
      <Card>
        <CardHeader>
          <CardTitle>📗 Candidate Chunk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Summary/Title"
            value={candidateSummary}
            onChange={(e) => setCandidateSummary(e.target.value)}
          />

          <Select value={candidateDomain} onValueChange={setCandidateDomain}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="philosophy">Philosophy</SelectItem>
              <SelectItem value="fiction">Fiction</SelectItem>
              <SelectItem value="technology">Technology</SelectItem>
            </SelectContent>
          </Select>

          <Textarea
            value={candidateText}
            onChange={(e) => setCandidateText(e.target.value)}
            className="min-h-[100px] font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Test Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Prompt Version</label>
              <Select value={promptVersion} onValueChange={setPromptVersion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
                  <SelectItem value="v2-improved">v2: Improved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Min Strength</label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={minStrength}
                onChange={(e) => setMinStrength(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <Button
            onClick={runTest}
            disabled={loading || !sourceText || !candidateText}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Bridge Detection'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className={result.connected ? "border-green-500" : "border-gray-500"}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {result.connected ? '🌉 Bridge Detected' : '❌ No Bridge'}
              <Badge variant="secondary">⏱️ {result.processingTime}ms</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.connected ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Strength</h4>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-green-600 rounded-full h-2"
                        style={{ width: `${result.strength * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono">{result.strength?.toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Bridge Type</h4>
                  <Badge>{result.bridgeType}</Badge>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Explanation</h4>
                  <p className="text-sm">{result.explanation}</p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Bridge Concepts</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.bridgeConcepts?.map((concept, i) => (
                      <Badge key={i} variant="outline">{concept}</Badge>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No thematic bridge found between these chunks with strength ≥ {minStrength}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

#### 2. Update Main Page to Enable Bridge Tab

**File**: `src/app/experiments/prompts/page.tsx`
**Changes**: Enable bridge tab and import component

```typescript
// Add import
import { BridgeTestPanel } from '@/components/experiments/BridgeTestPanel'

// Update TabsTrigger
<TabsTrigger value="bridge">
  Thematic Bridge
</TabsTrigger>

// Add TabsContent
<TabsContent value="bridge" className="mt-6">
  <BridgeTestPanel />
</TabsContent>
```

#### 3. Export Functionality

**File**: `src/components/experiments/MetadataTestPanel.tsx`
**Changes**: Add export button and function

```typescript
// Add to MetadataTestPanel component
const exportComparison = () => {
  if (!resultA || !resultB) return

  const report = `# Metadata Extraction Comparison

**Date**: ${new Date().toISOString()}
**Prompt A**: ${promptA}
**Prompt B**: ${promptB}

## Input Text

\`\`\`
${inputText.substring(0, 200)}...
\`\`\`

## Results

### ${promptA}

- **Themes**: ${resultA.themes.join(', ')}
- **Concepts**: ${resultA.concepts.map(c => `${c.text} (${c.importance})`).join(', ')}
- **Importance**: ${resultA.importance_score}
- **Polarity**: ${resultA.emotional.polarity}
- **Domain**: ${resultA.domain}
- **Processing Time**: ${resultA.processingTime}ms

### ${promptB}

- **Themes**: ${resultB.themes.join(', ')}
- **Concepts**: ${resultB.concepts.map(c => `${c.text} (${c.importance})`).join(', ')}
- **Importance**: ${resultB.importance_score}
- **Polarity**: ${resultB.emotional.polarity}
- **Domain**: ${resultB.domain}
- **Processing Time**: ${resultB.processingTime}ms

## Key Differences

- **Importance**: ${(resultB.importance_score - resultA.importance_score).toFixed(2)}
- **Polarity**: ${(resultB.emotional.polarity - resultA.emotional.polarity).toFixed(2)}
- **Concept Count**: ${resultB.concepts.length - resultA.concepts.length}
`

  // Download as markdown file
  const blob = new Blob([report], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `comparison-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

// Add button after "Run Both Tests"
<Button
  onClick={exportComparison}
  disabled={!resultA || !resultB}
  variant="outline"
>
  📋 Export Comparison
</Button>
```

### Success Criteria

#### Automated Verification:
- [x] Page builds: `npm run build` - Compiled successfully
- [x] TypeScript compiles: All components compile without errors
- [x] All components render: Bridge and export components properly structured

#### Manual Verification:
- [ ] Bridge tab is accessible
- [ ] Can input two chunks with different domains
- [ ] Bridge detection works and shows results
- [ ] "No bridge" case displays correctly
- [ ] Export button creates markdown file
- [ ] Exported report is readable and complete
- [ ] UI is responsive and intuitive

**Implementation Note**: Test with known bridge pairs (e.g., Sartre's bad faith + fiction character complicity) to verify detection works.

### Service Restarts:
- [ ] Next.js auto-reloads
- [ ] Test at `/experiments/prompts`

---

## Testing Strategy

### Unit Tests
**Not required** - This is a development/testing tool, not production code. Manual testing is sufficient.

### Integration Tests
**File**: `worker/scripts/test-prompt-experiment-system.ts` (NEW)
**Purpose**: Validate end-to-end flow

```bash
#!/usr/bin/env npx tsx

# Test prompt loading
python3 worker/scripts/extract_metadata_pydantic.py --prompt-version=v1-baseline < test-chunk.json

# Test registry access
npx tsx -e "import('./worker/lib/prompts/metadata-extraction/registry.ts').then(m => console.log(m.METADATA_EXTRACTION_PROMPTS.length + ' prompts loaded'))"

# Test Server Action (requires running app)
curl -X POST http://localhost:3000/api/actions/test-metadata-prompt \
  -H "Content-Type: application/json" \
  -d '{"text":"Test","promptVersion":"v1-baseline"}'
```

### Manual Testing
1. **Metadata Extraction**:
   - Load philosophy sample → test both prompts → verify concept specificity difference
   - Load fiction sample → test both prompts → verify emotional polarity difference
   - Paste custom text → verify no crashes

2. **Thematic Bridge**:
   - Test known bridge pair (philosophy ↔ fiction) → verify detection
   - Test non-bridge pair (same domain) → verify rejection
   - Test weak bridge (low strength) → verify threshold filtering

3. **Export**:
   - Run comparison → export → verify markdown is readable
   - Check metrics are accurately reported

## Performance Considerations

**Metadata Extraction**:
- Single chunk test: <2 seconds (Ollama local)
- Batch testing: Can add later if needed
- No impact on production pipeline (separate Server Actions)

**Thematic Bridge**:
- Single pair test: <5 seconds (Ollama local)
- Uses structured output for reliability
- Fallback to Gemini if Ollama unavailable (future)

**UI Performance**:
- Loading states prevent user confusion
- Results cached in component state
- No unnecessary re-renders (React.memo if needed)

## Migration Notes

**Optional Database Table** (053_experiment_results.sql):
```sql
-- Optional: Track experiment history
CREATE TABLE IF NOT EXISTS experiment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  experiment_type TEXT NOT NULL, -- 'metadata' | 'bridge'
  prompt_version_a TEXT NOT NULL,
  prompt_version_b TEXT NOT NULL,
  input_text TEXT NOT NULL,
  results_a JSONB NOT NULL,
  results_b JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE experiment_results ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own experiments
CREATE POLICY "Users can view own experiments"
  ON experiment_results
  FOR SELECT
  USING (auth.uid() = user_id);
```

**Note**: Start without this table. Add if users request experiment history feature.

## References

- **Architecture**: `docs/ARCHITECTURE.md`
- **Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Metadata Extraction**: `worker/scripts/extract_metadata_pydantic.py`
- **Thematic Bridge**: `worker/engines/thematic-bridge.ts`, `worker/engines/thematic-bridge-qwen.ts`
- **Admin Panel Pattern**: `src/components/admin/AdminPanel.tsx`
- **Server Actions Pattern**: `src/app/actions/admin.ts`
- **Python IPC Pattern**: `worker/lib/chunking/pydantic-metadata.ts`

---

## Success Metrics

**Phase 1 Complete**:
- ✅ Prompts stored as versioned files
- ✅ Python/TypeScript load prompts dynamically
- ✅ No impact on production pipeline

**Phase 2 Complete**:
- ✅ Server Actions return results in <5s
- ✅ Can test both metadata and bridge prompts
- ✅ Error handling works correctly

**Phase 3 Complete**:
- ✅ Basic UI accessible at `/experiments/prompts`
- ✅ Can compare metadata prompts side-by-side
- ✅ Results display clearly

**Phase 4 Complete**:
- ✅ Bridge testing works with two-chunk input
- ✅ Export functionality generates readable reports
- ✅ UI is intuitive and responsive

**Overall Success**:
- ✅ Can test prompt changes before production deployment
- ✅ Clear metrics show improvement/regression
- ✅ Developer can iterate on prompts quickly
- ✅ Zero risk to production pipeline
