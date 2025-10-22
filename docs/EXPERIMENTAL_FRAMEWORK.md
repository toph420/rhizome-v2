# Prompt Experimentation Framework

**Version**: 1.0
**Status**: Production Ready
**Last Updated**: 2025-01-21

## Overview

The Prompt Experimentation Framework enables safe, metrics-driven testing of prompt improvements before deploying to production. It provides a web UI for side-by-side comparison of different prompt versions without reprocessing entire documents.

**Why this exists**: Developer provided improved prompts for philosophy/fiction domains. We needed a way to test prompt changes without risking production quality or spending money reprocessing documents.

### Key Benefits

- **Zero Risk**: Test prompts without affecting production pipeline
- **Fast Feedback**: Test single chunks in <5 seconds vs 15-25 minutes for full documents
- **Metrics-Driven**: Side-by-side comparison with quantitative metrics
- **Cost Savings**: Avoid expensive reprocessing to evaluate prompt changes
- **Versioned Prompts**: File-based prompt storage with full version history

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend UI                          │
│  /experiments/prompts                                   │
│  ┌──────────────────┐  ┌──────────────────┐           │
│  │ MetadataTestPanel│  │ BridgeTestPanel  │           │
│  └──────────────────┘  └──────────────────┘           │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Server Actions                         │
│  src/app/actions/experiments/                           │
│  ├── test-metadata-prompt.ts (Python subprocess)        │
│  ├── test-bridge-prompt.ts (Direct Ollama)             │
│  └── get-prompt-versions.ts (Registry access)          │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                 Prompt Storage                          │
│  worker/lib/prompts/                                    │
│  ├── metadata-extraction/                               │
│  │   ├── v1-baseline.py                                │
│  │   ├── v2-philosophy.py                              │
│  │   └── registry.ts                                   │
│  └── thematic-bridge/                                   │
│      ├── v1-baseline.ts                                │
│      ├── v2-improved.ts                                │
│      └── registry.ts                                   │
└─────────────────────────────────────────────────────────┘
```

### Dual-Module Architecture

**Challenge**: Rhizome V2 uses a dual-module architecture:
- **Main App** (`src/`): Next.js 15 + React 19
- **Worker Module** (`worker/`): Node.js with separate dependencies

**Solution**: Server Actions cannot directly import worker modules due to webpack bundling constraints. We solved this by:
- **Metadata Testing**: Spawning Python subprocess with `--prompt-version` flag
- **Bridge Testing**: Inlining Ollama API calls directly in Server Actions
- **Registry Data**: Duplicating prompt metadata in Server Actions

## User Guide

### Access the UI

Navigate to `/experiments/prompts` in your browser.

### Test Metadata Extraction

**Purpose**: Compare how different prompts extract themes, concepts, importance scores, and emotional tone from text.

**Steps**:
1. **Load Sample Text**: Click "Philosophy" or "Fiction" buttons, or paste custom text
2. **Select Prompts**:
   - Prompt A: Choose version (v1-baseline or v2-philosophy)
   - Prompt B: Choose version (v1-baseline or v2-philosophy)
3. **Run Tests**: Click "Run Both Tests" to compare side-by-side
4. **Review Results**: Compare metrics across both prompts:
   - **Themes**: Main topics identified
   - **Concepts**: Key concepts with importance scores (0-1)
   - **Importance Score**: Overall chunk significance
   - **Emotional Tone**: Polarity (-1 to +1) and primary emotion
   - **Domain**: Subject area classification
   - **Processing Time**: How long extraction took
5. **Export Report**: Click "Export Comparison" to download markdown report

### Test Thematic Bridge Detection

**Purpose**: Compare how different prompts identify cross-domain connections between ideas.

**Steps**:
1. **Configure Source Chunk**:
   - Enter summary/title
   - Select domain (philosophy, fiction, technology)
   - Paste text content
2. **Configure Candidate Chunk**:
   - Enter summary/title
   - Select domain (different from source for best results)
   - Paste text content
3. **Set Parameters**:
   - **Prompt Version**: v1-baseline or v2-improved
   - **Min Strength**: Minimum bridge strength (0-1, default 0.6)
4. **Run Test**: Click "Test Bridge Detection"
5. **Review Results**:
   - **Connected**: Whether a bridge was found
   - **Strength**: Bridge strength score (0-1)
   - **Bridge Type**: conceptual, causal, temporal, etc.
   - **Explanation**: How the chunks connect
   - **Bridge Concepts**: Shared concepts linking the chunks
   - **Processing Time**: How long detection took

### Sample Chunks

**Philosophy Example**:
```
Foucault argues that disciplinary power operates through surveillance
and normalization. The panopticon represents the ultimate expression
of this power structure, where the mere possibility of observation
creates self-regulation among subjects.
```

**Fiction Example**:
```
The protagonist realized her entire adult life had been a performance.
She'd adopted the role of dutiful employee so completely that she'd
forgotten it was a choice. Now, facing the consequences of her company's
actions, she couldn't hide behind "I was just following orders."
```

**Expected Bridge**: Both explore bad faith / role-playing / identity as choice

## Developer Guide

### Adding New Prompt Versions

#### Metadata Extraction Prompts (Python)

**1. Create Prompt File**

Create `worker/lib/prompts/metadata-extraction/v3-custom.py`:

```python
"""
Version: 3.0 (Custom)
Description: Your custom prompt description
Author: Your name
Date: YYYY-MM-DD
"""

SYSTEM_PROMPT = """Your custom prompt text here.

Make sure it follows the required output schema:
{
  "themes": [...],
  "concepts": [...],
  "importance_score": 0.0-1.0,
  "summary": "...",
  "emotional_tone": {...},
  "domain": "..."
}
"""

def get_prompt() -> str:
    return SYSTEM_PROMPT
```

**2. Update Registry**

Edit `worker/lib/prompts/metadata-extraction/registry.ts`:

```typescript
export const METADATA_EXTRACTION_PROMPTS: PromptVersion[] = [
  // ... existing versions
  {
    id: 'v3-custom',
    version: '3.0',
    description: 'Your custom prompt description',
    author: 'Your name',
    date: 'YYYY-MM-DD',
    filepath: 'v3-custom.py',
    tags: ['custom', 'your-tags'],
    expectedMetrics: {
      importanceThreshold: 0.25,
      avgConceptSpecificity: 0.7,
      avgPolarityStrength: 0.5
    }
  }
]
```

**3. Update UI Registry**

Edit `src/app/actions/experiments/get-prompt-versions.ts`:

```typescript
const METADATA_EXTRACTION_PROMPTS = [
  // ... existing versions
  {
    id: 'v3-custom',
    version: '3.0',
    description: 'Your custom prompt description',
    author: 'Your name',
    date: 'YYYY-MM-DD',
    tags: ['custom', 'your-tags']
  }
]
```

**4. Update UI Selector**

Edit `src/components/experiments/MetadataTestPanel.tsx` to add dropdown option:

```typescript
<SelectContent>
  <SelectItem value="v1-baseline">v1: Baseline</SelectItem>
  <SelectItem value="v2-philosophy">v2: Philosophy/Fiction</SelectItem>
  <SelectItem value="v3-custom">v3: Custom</SelectItem>
</SelectContent>
```

#### Thematic Bridge Prompts (TypeScript)

**1. Create Prompt File**

Create `worker/lib/prompts/thematic-bridge/v3-custom.ts`:

```typescript
/**
 * Version: 3.0 (Custom)
 * Description: Your custom prompt description
 * Author: Your name
 * Date: YYYY-MM-DD
 */

export function buildPrompt(
  sourceChunk: any,
  candidates: any[],
  sourceDomain: string,
  minStrength: number
): string {
  return `Your custom prompt template here.

SOURCE (${sourceDomain}):
${sourceChunk.summary}
${sourceChunk.content}

CANDIDATES:
${candidates.map((c, idx) => `[${idx}] ${c.domain_metadata?.primaryDomain}
${c.summary}
${c.content}`).join('\n\n')}

Return JSON: { "bridges": [...] }
`
}
```

**2. Update Registry**

Edit `worker/lib/prompts/thematic-bridge/registry.ts`:

```typescript
export const THEMATIC_BRIDGE_PROMPTS: BridgePromptVersion[] = [
  // ... existing versions
  {
    id: 'v3-custom',
    version: '3.0',
    description: 'Your custom prompt description',
    author: 'Your name',
    date: 'YYYY-MM-DD',
    filepath: 'v3-custom.ts',
    tags: ['custom', 'your-tags'],
    mode: 'both'
  }
]
```

**3. Update Server Action**

Edit `src/app/actions/experiments/test-bridge-prompt.ts` to add prompt builder:

```typescript
function buildBridgePrompt(input: BridgeTestInput, version: string): string {
  if (version === 'v3-custom') {
    return buildV3CustomPrompt(input)
  }
  // ... existing versions
}

function buildV3CustomPrompt(input: BridgeTestInput): string {
  return `Your custom prompt template...`
}
```

**4. Update UI Registry**

Edit `src/app/actions/experiments/get-prompt-versions.ts` and UI selector similar to metadata prompts.

### Testing Your Changes

**1. Verify Prompt Loads**

```bash
# Test Python prompt loading
cd worker
OLLAMA_BASE_URL=http://localhost:11434 python3 scripts/extract_metadata_pydantic.py --prompt-version=v3-custom --help

# Test TypeScript imports
npx tsx -e "import('/Users/topher/Code/rhizome-v2-worktree-1/worker/lib/prompts/thematic-bridge/v3-custom.ts').then(() => console.log('OK'))"
```

**2. Build Application**

```bash
npx next build
```

**3. Test in UI**

1. Start development server: `npm run dev`
2. Navigate to `/experiments/prompts`
3. Select your new prompt version
4. Run tests with sample chunks
5. Verify results match expectations

### Prompt Design Guidelines

**Metadata Extraction Prompts**:
- **Be specific about output schema**: Include exact field names and types
- **Calibrate importance scores**: Specify what makes a chunk important (0.8+ for core content, 0.4- for transitions)
- **Guide emotional polarity**: Explain when to use positive/negative values
- **Domain-specific examples**: Show what good extraction looks like for target domain
- **Concept specificity**: Emphasize capturing IDEAS not just topics

**Thematic Bridge Prompts**:
- **Define bridge criteria**: When does a connection qualify as a bridge?
- **Strength calibration**: Be explicit about 0.9-1.0 vs 0.5-0.6 connections
- **Filter instructions**: Tell AI to skip weak or obvious connections
- **Explanation format**: Guide how to reference chunks (by summary as title)
- **Bridge type taxonomy**: Define conceptual, causal, temporal, etc.

## Technical Reference

### Metadata Test Flow

```
1. User enters text → MetadataTestPanel
2. User selects prompt versions (A & B)
3. Click "Run Both Tests" → parallel Server Action calls
4. testMetadataPrompt(promptA) + testMetadataPrompt(promptB)
5. Each spawns: python3 extract_metadata_pydantic.py --prompt-version=X
6. Python loads prompt from worker/lib/prompts/metadata-extraction/X.py
7. Python calls Ollama with loaded prompt
8. Results returned via stdout → parsed → displayed side-by-side
```

### Bridge Test Flow

```
1. User enters source + candidate chunks → BridgeTestPanel
2. User selects prompt version
3. Click "Test Bridge Detection" → Server Action call
4. testBridgePrompt() builds prompt inline (v1 or v2)
5. Direct fetch to Ollama API (http://localhost:11434/api/chat)
6. Ollama returns JSON with bridges array
7. Results parsed → displayed with strength/type/explanation
```

### Environment Variables

```bash
# Main App (.env.local)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama server for bridge testing
OLLAMA_MODEL=qwen2.5:32b              # Model for local testing

# Worker (worker/.env)
OLLAMA_HOST=http://127.0.0.1:11434    # Ollama server for metadata extraction
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M  # Model for metadata extraction
```

### File Structure

```
/
├── docs/
│   └── EXPERIMENTAL_FRAMEWORK.md          # This file
├── src/
│   ├── app/
│   │   ├── experiments/prompts/
│   │   │   └── page.tsx                  # Main UI page
│   │   └── actions/experiments/
│   │       ├── test-metadata-prompt.ts   # Metadata testing action
│   │       ├── test-bridge-prompt.ts     # Bridge testing action
│   │       └── get-prompt-versions.ts    # Registry access
│   └── components/experiments/
│       ├── MetadataTestPanel.tsx         # Metadata comparison UI
│       └── BridgeTestPanel.tsx           # Bridge testing UI
└── worker/
    ├── lib/prompts/
    │   ├── metadata-extraction/
    │   │   ├── v1-baseline.py           # Generic prompt
    │   │   ├── v2-philosophy.py         # Philosophy/fiction optimized
    │   │   └── registry.ts              # Metadata registry
    │   ├── thematic-bridge/
    │   │   ├── v1-baseline.ts           # Generic prompt
    │   │   ├── v2-improved.ts           # Improved with calibration
    │   │   └── registry.ts              # Bridge registry
    │   └── prompt-loader.ts             # Dynamic loader (worker-side)
    └── scripts/
        └── extract_metadata_pydantic.py # Modified to accept --prompt-version
```

## Examples

### Example: Adding a Technical Domain Prompt

**Goal**: Create a prompt optimized for technical/code documentation.

**Step 1**: Create `v3-technical.py`

```python
"""
Version: 3.0 (Technical)
Description: Optimized for code, APIs, and technical documentation
Author: Engineering Team
Date: 2025-01-21
Target: High concept specificity for APIs, libraries, patterns
"""

SYSTEM_PROMPT = """Extract metadata from technical documentation.

CONTEXT: This chunk is from code documentation, API references, or technical guides.

## Extraction Requirements

**themes** (1-3 items)
- Technical concepts, not just topic names
- Examples: ["REST API design", "dependency injection", "reactive programming"]
- NOT: ["programming", "tutorial", "documentation"]

**concepts** (3-8 items)
- APIs, libraries, design patterns, algorithms
- Format: {"text": "concept", "importance": 0.0-1.0}
- importance > 0.7 = core API/pattern, must understand
- importance 0.4-0.6 = helper function, nice to know
- importance < 0.3 = boilerplate, skip

**importance_score** (0.0-1.0)
- 0.8-1.0: Core API contract, architecture decision, critical pattern
- 0.5-0.7: Implementation detail, helper method, configuration
- 0.0-0.4: Example code, boilerplate, setup instructions

**summary** (30-150 chars)
- Describe what this code/API does, not how
- Good: "Middleware validates JWT tokens before route handlers"
- Bad: "Code that checks tokens"

**emotional_tone**
- polarity: Usually neutral (-0.2 to 0.2) for documentation
- primaryEmotion: "analytical", "instructional", "cautionary"
- intensity: 0.3-0.5 (technical docs are rarely intense)

**domain**
- Be specific: "backend_api", "frontend_react", "devops", "data_engineering"

Output JSON only, no markdown.
{
  "themes": ["REST API design"],
  "concepts": [
    {"text": "JWT middleware", "importance": 0.9},
    {"text": "Express.js routing", "importance": 0.7}
  ],
  "importance_score": 0.8,
  "summary": "Middleware validates JWT tokens before route handlers",
  "emotional_tone": {
    "polarity": 0.0,
    "primaryEmotion": "instructional",
    "intensity": 0.4
  },
  "domain": "backend_api"
}
"""

def get_prompt() -> str:
    return SYSTEM_PROMPT
```

**Step 2**: Update registries (both TypeScript and Server Action)

**Step 3**: Test with technical sample:

```
Sample Text:
"The useEffect hook in React handles side effects in function components.
It runs after every render by default, but you can optimize by passing a
dependency array. Empty array means run once on mount."

Expected Output:
- themes: ["React hooks", "side effects"]
- concepts: [{"text": "useEffect", "importance": 0.9}, {"text": "dependency array", "importance": 0.7}]
- importance: 0.8
- domain: "frontend_react"
```

### Example: Comparing Prompts

**Scenario**: Test if v2-philosophy improves emotional polarity detection vs v1-baseline.

**Test Text** (philosophical argument):
```
Mill's harm principle is fundamentally flawed. It assumes we can clearly
distinguish between self-regarding and other-regarding actions, but this
distinction breaks down in practice. Nearly every action affects others
indirectly.
```

**Expected Differences**:
- **v1-baseline**: Might assign neutral polarity (~0.0)
- **v2-philosophy**: Should detect critical stance (polarity -0.6 to -0.8)

**Run Both Tests** → **Export Comparison** → Verify v2 captures argumentative stance

## Troubleshooting

### Python Script Errors

**Error**: `Prompt version not found: v3-custom`

**Solution**: Check file exists at `worker/lib/prompts/metadata-extraction/v3-custom.py`

**Error**: `Module missing get_prompt() function`

**Solution**: Ensure your Python file has:
```python
def get_prompt() -> str:
    return SYSTEM_PROMPT
```

### Ollama Connection Errors

**Error**: `fetch failed` or `ECONNREFUSED`

**Solution**:
1. Check Ollama is running: `ollama list`
2. Verify environment variable: `echo $OLLAMA_HOST`
3. Test manually: `curl http://localhost:11434/api/tags`

### Build Errors

**Error**: `Module not found: Can't resolve worker/...`

**Solution**: Never import worker code directly into `src/`. Use:
- Subprocess calls for Python scripts
- Inline API calls for TypeScript logic
- Duplicate data in Server Actions

### UI Not Showing New Prompt

**Checklist**:
1. ✅ Added to `worker/lib/prompts/*/registry.ts`
2. ✅ Added to `src/app/actions/experiments/get-prompt-versions.ts`
3. ✅ Added to UI dropdown in `src/components/experiments/*TestPanel.tsx`
4. ✅ Rebuilt application: `npx next build`
5. ✅ Restarted dev server: `npm run dev`

## Best Practices

### Iteration Workflow

1. **Start with baseline**: Copy v1-baseline, make small changes
2. **Test incrementally**: Add one improvement at a time
3. **Document rationale**: Explain why each change should improve results
4. **Compare side-by-side**: Use the UI to verify improvements
5. **Export reports**: Save comparison markdown for documentation
6. **Iterate**: Refine based on results

### Prompt Versioning

- **Semantic versioning**: v1.0, v2.0, v3.0 for major changes
- **Descriptive IDs**: `v2-philosophy` not `v2-better`
- **Keep history**: Never delete old prompts, add new versions
- **Tag appropriately**: Use tags to indicate domain/purpose

### Testing Strategy

**Quick Tests** (single chunk, <5 seconds):
- Validate prompt syntax and output format
- Check basic functionality
- Verify metrics are in expected ranges

**Batch Tests** (multiple chunks, run outside UI):
- Statistical comparison across chunk types
- Domain-specific performance
- Edge case handling

**Production Validation** (reprocess single document):
- Final check before deploying to production
- Compare full document results
- Verify connection quality

### When to Deploy to Production

✅ **Deploy when**:
- New prompt shows consistent improvement across 10+ test chunks
- Metrics align with expected values (importance distribution, polarity strength)
- No regressions on edge cases
- Exported reports document clear improvements

❌ **Don't deploy when**:
- Only tested on 1-2 chunks
- Results are inconsistent across chunk types
- Metrics show unexpected distribution shifts
- Unknown impact on connection engines

### Deployment Process

1. **Test thoroughly** in experimentation UI
2. **Update production prompt**:
   - Metadata: Modify `worker/scripts/extract_metadata_pydantic.py` default prompt
   - Bridge: Modify `worker/engines/thematic-bridge.ts` or `thematic-bridge-qwen.ts`
3. **Update default** in `--prompt-version` argument (if using dynamic loading)
4. **Document changes** in changelog
5. **Monitor** first few documents processed with new prompt

## Performance Metrics

### Typical Processing Times

| Test Type | Input | Expected Time | Actual Performance |
|-----------|-------|---------------|-------------------|
| Metadata | 500 char chunk | <2 seconds | 1.2-1.8s (Ollama local) |
| Bridge | 2 chunks | <5 seconds | 2.5-4.5s (Ollama local) |
| Export | Comparison report | Instant | <100ms (client-side) |

### Cost Comparison

| Approach | Cost per Test | Cost per Document |
|----------|---------------|-------------------|
| Experimentation UI (local) | $0.00 | N/A |
| Experimentation UI (cloud) | ~$0.001 | N/A |
| Full reprocessing (local) | N/A | $0.00 + time |
| Full reprocessing (cloud) | N/A | $0.20-0.60 |

**Savings**: Testing 20 prompt variations = $0 (local) vs $4-12 (cloud reprocessing)

## Limitations

### What This Framework Does NOT Do

- ❌ **Automated optimization**: No AI-driven prompt tuning
- ❌ **Batch document testing**: Only single-chunk tests (can be added)
- ❌ **Statistical analysis**: No p-values or confidence intervals
- ❌ **A/B testing in production**: No split traffic between prompt versions
- ❌ **Prompt editing in UI**: Must edit files directly
- ❌ **Multi-user support**: Personal tool only

### Constraints

- **Local Ollama required**: Metadata testing needs Ollama running
- **Manual testing**: No automated test suites for prompts
- **Single chunk context**: Can't test prompts on full document context
- **No prompt composition**: Can't mix/match prompt sections in UI

## Future Enhancements

### Potential Additions

**Batch Testing** (High Priority):
- Upload CSV of test chunks
- Run all chunks through multiple prompts
- Generate statistical comparison report
- Identify systematic improvements/regressions

**Prompt Editor** (Medium Priority):
- Edit prompts directly in UI
- Save as temporary versions
- Quick iteration without file editing

**Metrics Dashboard** (Medium Priority):
- Visualize importance score distributions
- Track polarity accuracy over time
- Compare concept specificity across versions

**Production A/B Testing** (Low Priority):
- Route X% of documents to experimental prompt
- Compare connection quality metrics
- Auto-promote if improvements confirmed

## References

- **Implementation Plan**: `thoughts/plans/2025-01-21_prompt-experimentation-framework.md`
- **Worker Module**: `worker/README.md`
- **Processing Pipeline**: `docs/PROCESSING_PIPELINE.md`
- **Connection Engines**: `worker/engines/` (orchestrator.ts)

## Changelog

### v1.0 (2025-01-21)

**Added**:
- File-based prompt versioning system
- Metadata extraction testing (Python subprocess)
- Thematic bridge testing (Direct Ollama)
- Side-by-side comparison UI
- Export to markdown functionality
- Two metadata prompts (v1-baseline, v2-philosophy)
- Two bridge prompts (v1-baseline, v2-improved)

**Technical**:
- Solved dual-module import issue with inline approach
- 4-phase implementation completed
- Full Next.js build compatibility

---

**Questions or issues?** Check `thoughts/plans/2025-01-21_prompt-experimentation-framework.md` for implementation details.
