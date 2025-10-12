# Dual-Engine Thematic Bridge Testing

Compare Gemini vs Qwen performance for thematic bridge detection to evaluate if local Qwen can replace cloud Gemini.

## Overview

This test suite runs both Gemini and Qwen engines on the same document in parallel to compare:

- **Agreement rate**: How often they detect the same connections
- **Strength correlation**: How similar their confidence scores are
- **Unique connections**: Quality of connections each finds that the other misses
- **Cost savings**: Qwen is 100% local ($0/book vs $0.20/book)

## Prerequisites

### 1. Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Qwen model
ollama pull qwen2.5:32b-instruct-q4_K_M

# Start Ollama server
ollama serve
```

### 2. Environment Variables

Ensure your `worker/.env` has:
```bash
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:32b-instruct-q4_K_M
OLLAMA_TIMEOUT=600000

GOOGLE_AI_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
```

### 3. Test Documents

Documents must be fully processed with:
- Chunks extracted
- Metadata generated (concepts, themes, domains)
- Importance scores calculated
- At least some chunks with `importance_score > 0.6`

## Usage

### Step 1: List Testable Documents

```bash
cd worker
npm run test:list-documents
```

This shows all documents ready for testing with:
- Document ID
- Title
- Number of high-importance chunks
- Source type

### Step 2: Run Dual-Engine Test

```bash
cd worker
npm run test:dual-bridge <document_id>
```

Or directly:
```bash
npx tsx worker/scripts/test-dual-bridge.ts <document_id>
```

## Test Output

### Comparison Report

The test generates a comprehensive report:

```
=================================================================
📊 COMPARISON RESULTS
=================================================================

Agreement Rate: 85.2%
Avg Strength Difference: 0.112

Detection Breakdown:
  Both detected: 34 (68.0%)
  Gemini only: 8 (16.0%)
  Qwen only: 8 (16.0%)

Strength Correlation (both detected):
  Max difference: 0.234
  Min difference: 0.012
  Median difference: 0.098
```

### Disagreement Analysis

Shows sample connections each engine found uniquely:

**Gemini-Only Connections** (potential Qwen misses):
```
[1] Strength: 0.82
Source (literature): Pynchon's paranoid atmosphere in Gravity's Rainbow
  Explores institutional control through surveillance...
Target (technology): Zuboff's surveillance capitalism framework
  Examines behavioral data as control mechanism...
Explanation: Both examine how surveillance enables institutional control...
```

**Qwen-Only Connections** (potential false positives or Gemini misses):
```
[1] Strength: 0.76
Source (philosophy): Foucault's disciplinary power
  Power operates through normalization and observation...
Target (technology): AI recommendation algorithms
  Systems shape behavior through prediction...
Explanation: Both analyze how observation mechanisms shape behavior...
```

### Recommendation

The test provides an automated recommendation:

**✅ PROCEED with Qwen**
- Agreement rate ≥80%
- Avg strength difference ≤0.15
- Qwen-only connections ≤20% of both-detected
- Benefits: $0.20/book savings, privacy, no rate limits

**⚠️ BORDERLINE**
- Agreement rate 70-80%
- Manual review needed
- Consider hybrid approach

**❌ KEEP Gemini**
- Agreement rate <70%
- Qwen missing too many connections or adding noise
- Quality gap too large

## Decision Framework

### Proceed with Qwen If:
- Agreement rate >80%
- Avg strength difference <0.15
- Qwen-only connections are valid (manual review)
- No pattern of missing cross-domain bridges (the core use case)

### Use Hybrid Approach If:
- Agreement 70-80%
- Some quality gaps but manageable
- Use Qwen for high-confidence (>0.7), Gemini for borderline (0.4-0.7)

### Keep Gemini If:
- Agreement <70%
- Qwen making up connections (false positives)
- Missing the "aha" cross-domain moments that make Rhizome valuable

## Recommended Testing Process

### 1. Test on Diverse Documents (2-3 books)

**Literary work**: Fiction, philosophy (e.g., Gravity's Rainbow)
- Tests abstract concept bridging
- Validates cross-domain literary → technical connections

**Technical book**: Technology, science (e.g., Surveillance Capitalism)
- Tests concrete concept analysis
- Validates technical → literary connections

**Mixed domain**: Business, history (where bridges are most valuable)
- Tests real-world use case
- Validates diverse concept bridging

### 2. Manual Review Process

For each test:
1. Check **agreement rate** and **strength correlation**
2. Review 5-10 **Gemini-only** connections
   - Are these the "magic" insights that justify Gemini's cost?
   - Or are they marginal connections Qwen reasonably filtered?
3. Review 5-10 **Qwen-only** connections
   - Are these valid insights Gemini missed?
   - Or are they false positives polluting the graph?
4. Check for **cross-domain bridges**
   - This is Rhizome's core value
   - If Qwen consistently misses these, keep Gemini

### 3. Decision Criteria

**Switch to Qwen if:**
- 2/3 tests show agreement >75%
- Manual review shows Qwen-only are valid
- No pattern of missing cross-domain bridges
- **Savings**: $0.20/book × books/year

**Hybrid approach if:**
- Tests show 70-80% agreement
- Qwen good for obvious bridges, Gemini for subtle ones
- Implement:
  ```typescript
  if (qwenStrength > 0.7) return qwenResult;
  else if (qwenStrength > 0.4) return geminiAnalyze(pair);
  else return { connected: false };
  ```

**Keep Gemini if:**
- Tests show <70% agreement
- Qwen missing key cross-domain insights
- False positives polluting graph
- Quality matters more than cost for personal tool

## Cost Analysis

### Annual Savings Calculator

```
Books processed per year: N
Gemini cost per book: $0.20
Qwen cost per book: $0.00

Annual savings = N × $0.20

Examples:
- 100 books/year: $20 saved
- 500 books/year: $100 saved
- 1,000 books/year: $200 saved
```

### Break-Even Analysis

Gemini advantages:
- Proven quality
- No local GPU needed
- Cloud infrastructure managed

Qwen advantages:
- Zero per-book cost
- Complete privacy
- No rate limits
- Works offline
- Faster (if local GPU)

**Break-even point**: ~50-100 books
- At 100 books: $20 savings justifies 1-2 hours setup + testing
- At 500 books: $100 savings makes Qwen compelling
- At 1,000 books: $200 savings makes Qwen essential

## Troubleshooting

### Ollama Not Responding
```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/version

# Start Ollama
ollama serve

# Check logs
ollama logs
```

### Out of Memory Errors
```bash
# Use smaller model
ollama pull qwen2.5:14b-instruct-q4_K_M

# Update .env
OLLAMA_MODEL=qwen2.5:14b-instruct-q4_K_M
```

### No Testable Documents
```bash
# Process documents first with full pipeline
npm run dev  # Start worker

# Upload a document through the UI
# Wait for processing to complete (status: completed)

# Verify chunks exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM chunks WHERE importance_score > 0.6;"
```

### Test Fails with Missing Metadata
```bash
# Ensure documents processed with metadata extraction
# Check domain_metadata is not null
psql $DATABASE_URL -c "SELECT id, title FROM documents WHERE id NOT IN (SELECT DISTINCT document_id FROM chunks WHERE domain_metadata IS NOT NULL);"

# Reprocess documents missing metadata
```

## Implementation Files

- **`worker/engines/thematic-bridge.ts`** - Gemini implementation
- **`worker/engines/thematic-bridge-qwen.ts`** - Qwen implementation
- **`worker/scripts/test-dual-bridge.ts`** - Comparison test script
- **`worker/scripts/list-testable-documents.ts`** - Document listing helper
- **`worker/lib/local/ollama-client.ts`** - Ollama client wrapper

## Next Steps

After testing:

1. **If proceeding with Qwen:**
   - Update orchestrator to use `runThematicBridgeQwen()`
   - Remove Gemini API key requirement for thematic bridge
   - Update documentation

2. **If using hybrid:**
   - Implement threshold-based routing
   - Add configuration for hybrid mode
   - Track cost savings

3. **If keeping Gemini:**
   - Document why Qwen wasn't sufficient
   - Keep Qwen code for future re-evaluation
   - Consider testing again with Qwen 3.0 or larger models

## Philosophy

This is a **personal knowledge tool** optimized for **connection quality** over cost. The test helps you make an informed decision based on your specific:

- Reading material (technical vs literary vs mixed)
- Volume (100 vs 1,000 books/year)
- Privacy needs (API vs local)
- Quality bar (good enough vs perfect)

**Test with real data. Trust your judgment on which connections matter.**
