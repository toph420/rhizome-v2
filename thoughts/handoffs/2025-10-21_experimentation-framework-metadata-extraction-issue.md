# Handoff: Experimentation Framework - Metadata Extraction Issue

**Date**: 2025-10-21
**Status**: 95% Complete - One blocking issue
**Token Usage**: Running low, need fresh session

## What We Built ✅

### Fully Implemented (4 Phases Complete)

**Phase 1: Prompt Storage System** ✅
- File-based prompt versioning
- Python prompts: `worker/lib/prompts/metadata-extraction/*.py`
- TypeScript prompts: `worker/lib/prompts/thematic-bridge/*.ts`
- Registry system for both
- Modified `worker/scripts/extract_metadata_pydantic.py` to accept `--prompt-version` flag

**Phase 2: Server Actions** ✅
- `src/app/actions/experiments/test-metadata-prompt.ts` - Spawns Python subprocess
- `src/app/actions/experiments/test-bridge-prompt.ts` - Direct Ollama API calls
- `src/app/actions/experiments/get-prompt-versions.ts` - Registry access

**Phase 3: Metadata Test UI** ✅
- `src/app/experiments/prompts/page.tsx` - Main page with tabs
- `src/components/experiments/MetadataTestPanel.tsx` - Side-by-side comparison

**Phase 4: Bridge Testing & Export** ✅
- `src/components/experiments/BridgeTestPanel.tsx` - Two-chunk bridge testing
- Export to markdown functionality
- Bridge testing **WORKS PERFECTLY** (tested, confirmed)

**Documentation** ✅
- `docs/EXPERIMENTAL_FRAMEWORK.md` - Complete reference (19KB)
- `docs/testing/EXPERIMENTATION_QUICK_START.md` - Quick start guide

**Build Status**: ✅ Next.js builds successfully, no compilation errors

## What's Broken ❌

### Metadata Extraction Returns Fallback Data

**Symptom**:
- UI loads correctly
- Both prompt versions (v1-baseline, v2-philosophy) return identical results
- Results look like fallback metadata:
  ```json
  {
    "themes": ["unknown"],
    "concepts": [{"text": "general content", "importance": 0.5}],
    "importance": 0.5,
    "summary": "Content requires manual review",
    "emotional": {"polarity": 0.0, "primaryEmotion": "neutral", "intensity": 0.0},
    "domain": "general"
  }
  ```

**Root Cause**: PydanticAI cannot connect to Ollama properly

**Error Message** (from direct Python test):
```
[ERROR] Metadata extraction failed for chunk test: status_code: 404, model_name: qwen2.5:32b, body: 404 page not found
```

## Root Cause Analysis

### Ollama is Running ✅
- Verified: `ollama list` shows `qwen2.5:32b` available
- OpenAI-compatible API works: `http://127.0.0.1:11434/v1/chat/completions` ✅
- Native Ollama API works: `http://127.0.0.1:11434/api/chat` ✅

### The Problem: PydanticAI Configuration

**File**: `worker/scripts/extract_metadata_pydantic.py`
**Lines**: 94-107

**Original Configuration** (didn't work):
```python
ollama_model = OpenAIChatModel(
    model_name='qwen2.5:32b',
    provider='ollama'  # Gets 404 error
)
```

**What We Tried**:

1. ❌ **Attempt 1**: Added `/v1` to OLLAMA_BASE_URL in Server Action
   - Result: Double `/v1/v1` path (wrong)

2. ❌ **Attempt 2**: Removed `/v1` from Server Action, let PydanticAI add it
   - Result: Still got 404

3. ❌ **Attempt 3**: Used `base_url` parameter
   - Error: `OpenAIChatModel.__init__() got an unexpected keyword argument 'base_url'`

4. ❌ **Attempt 4**: Used custom `http_client` with AsyncOpenAI
   - Error: `OpenAIChatModel.__init__() got an unexpected keyword argument 'http_client'`

**Current State**: Script still uses broken configuration (lines 94-107)

## What We Know

### PydanticAI OpenAIChatModel API
From experimentation, we know:
- ✅ `model_name` parameter works
- ❌ `provider='ollama'` gets 404
- ❌ `base_url` not accepted
- ❌ `http_client` not accepted

### Valid Parameters (Need to Research)
We need to check PydanticAI docs for:
- How to configure OpenAIChatModel with custom endpoint
- Whether we should use a different model class for Ollama
- What the correct provider configuration is

## Solution Approaches

### Option 1: Use Different PydanticAI Model Class (Recommended)
PydanticAI might have an `OllamaModel` class instead of using OpenAI with provider:

```python
from pydantic_ai.models.ollama import OllamaModel  # Check if this exists

ollama_model = OllamaModel(
    model_name='qwen2.5:32b',
    base_url=ollama_base_url  # Or similar
)
```

**Action**: Check `pydantic_ai.models` for available model classes

### Option 2: Use OpenAI Library Directly
Instead of PydanticAI's OpenAIChatModel, use OpenAI library with Pydantic validation:

```python
from openai import OpenAI
from pydantic import BaseModel

client = OpenAI(
    base_url=f'{ollama_base_url}/v1',
    api_key='ollama'
)

# Manual call + Pydantic validation
response = client.chat.completions.create(
    model='qwen2.5:32b',
    messages=[...]
)
result = ChunkMetadata.model_validate_json(response.choices[0].message.content)
```

**Pros**: Full control, known to work
**Cons**: Loses PydanticAI's automatic retry logic

### Option 3: Fix PydanticAI Provider Configuration
Research the correct way to configure `provider='ollama'`:

```python
# Maybe needs environment variable?
os.environ['OLLAMA_API_BASE'] = ollama_base_url  # Different var name?

# Or maybe different provider syntax?
ollama_model = OpenAIChatModel(
    model_name='qwen2.5:32b',
    provider=OllamaProvider(base_url=ollama_base_url)  # Check docs
)
```

**Action**: Check PydanticAI documentation for Ollama provider setup

### Option 4: Bypass Python, Use Direct Ollama (Quick Fix)
Rewrite `test-metadata-prompt.ts` to call Ollama directly like bridge testing does:

```typescript
// Similar to test-bridge-prompt.ts
const response = await fetch(`${ollamaHost}/v1/chat/completions`, {
  method: 'POST',
  // ... build metadata extraction prompt inline
})
```

**Pros**: Guaranteed to work (bridge testing works this way)
**Cons**: Loses prompt file versioning for metadata extraction

## Recommended Next Steps

### Immediate (Next Session)

1. **Research PydanticAI Documentation**
   ```bash
   # Check what's available
   python3 -c "from pydantic_ai import models; print(dir(models))"

   # Check OpenAIChatModel signature
   python3 -c "from pydantic_ai.models.openai import OpenAIChatModel; help(OpenAIChatModel.__init__)"
   ```

2. **Try Option 1 First** (Different Model Class)
   - Most likely to be correct approach
   - Check if `OllamaModel` or similar exists

3. **If Option 1 Fails, Use Option 2** (OpenAI Direct)
   - Known working solution
   - Can always optimize later

4. **Test Fix**
   ```bash
   echo '{"id": "test", "content": "Foucault argues..."}' | \
     OLLAMA_BASE_URL=http://127.0.0.1:11434 \
     python3 worker/scripts/extract_metadata_pydantic.py --prompt-version=v1-baseline
   ```

5. **Verify in UI**
   - Start app: `npm run dev`
   - Test at `/experiments/prompts`
   - Should see different results for v1 vs v2

### Future Improvements

Once working:
1. Test with real document chunks
2. Create v3 prompts for other domains (technical, etc.)
3. Consider batch testing feature
4. Add metrics visualization

## Files to Review

**Python Script** (needs fixing):
- `worker/scripts/extract_metadata_pydantic.py` (lines 94-107)

**Working Bridge Testing** (reference for solution):
- `src/app/actions/experiments/test-bridge-prompt.ts` (lines 37-85)
  - Shows direct Ollama API calls work perfectly

**Server Action** (metadata, calls Python):
- `src/app/actions/experiments/test-metadata-prompt.ts`

**UI Components**:
- `src/app/experiments/prompts/page.tsx`
- `src/components/experiments/MetadataTestPanel.tsx`
- `src/components/experiments/BridgeTestPanel.tsx` ✅ (works!)

## Environment

**Ollama**: Running ✅
- Host: `http://127.0.0.1:11434`
- Model: `qwen2.5:32b` (19GB, Q4_K_M)
- OpenAI API: ✅ Working at `/v1/chat/completions`
- Native API: ✅ Working at `/api/chat`

**Environment Variables**:
```bash
OLLAMA_HOST=http://127.0.0.1:11434  # In .env.local
OLLAMA_MODEL=qwen2.5:32b
```

## Quick Reference Commands

```bash
# Test Ollama directly
curl -s http://127.0.0.1:11434/v1/chat/completions -X POST \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:32b","messages":[{"role":"user","content":"test"}]}'

# Test Python script
echo '{"id": "test", "content": "Test text"}' | \
  OLLAMA_BASE_URL=http://127.0.0.1:11434 \
  python3 worker/scripts/extract_metadata_pydantic.py --prompt-version=v1-baseline

# Start dev server
npm run dev

# Access UI
# http://localhost:3000/experiments/prompts
```

## Summary

**What Works**: 95% of framework (UI, bridge testing, storage, docs)
**What's Broken**: Metadata extraction (PydanticAI → Ollama connection)
**Root Cause**: Incorrect PydanticAI configuration for Ollama
**Fix Needed**: 5-10 minutes to research correct PydanticAI setup or use OpenAI direct

**The framework is basically complete** - just needs the Python↔Ollama connection fixed!

---

**For Next Session**: Start with researching PydanticAI's Ollama setup, then apply Option 1 or 2 above.
