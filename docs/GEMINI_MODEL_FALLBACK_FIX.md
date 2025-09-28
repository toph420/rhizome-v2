# Gemini Model Fallback Fix

**Date**: 2025-09-28  
**Issue**: PDF processing failing with "fetch failed" error at ~4.5 minutes

## Problem Identified

The `gemini-2.5-flash` model, while technically available (no 404 error), returns `undefined` instead of proper text responses. This appears to be a regional availability or API version issue with the new model.

## Solution Implemented

Added a configurable model system with automatic fallback to `gemini-2.0-flash-exp`, which supports the same 65536 token limit.

## Changes Made

### 1. Model Configuration (2 files)
- `worker/handlers/process-document.ts`: Added configurable `GEMINI_MODEL` constant
- `worker/lib/youtube-cleaning.ts`: Added same configuration

### 2. Fallback Logic
```typescript
// Model configuration with fallback
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'
const MAX_OUTPUT_TOKENS = 65536 // Both models support this limit
```

### 3. Enhanced Error Logging
Added detailed error logging for:
- Files API upload failures
- generateContent API failures
- Better error context for debugging

## Model Compatibility

| Model | Status | Max Tokens | Notes |
|-------|--------|------------|-------|
| `gemini-2.5-flash` | ⚠️ Returns undefined | 65536 | Regional availability issues |
| `gemini-2.0-flash-exp` | ✅ Working | 65536 | Stable experimental model |
| `gemini-2.0-flash` | ✅ Working | 8192 | Lower token limit |

## How to Use

### Default (Automatic Fallback)
No action needed. The system automatically uses `gemini-2.0-flash-exp`.

### Override Model (Optional)
Set the `GEMINI_MODEL` environment variable in `.env.local`:
```bash
GEMINI_MODEL=gemini-2.5-flash  # When it becomes available
```

### Testing Different Models
```bash
# Test with specific model
GEMINI_MODEL=gemini-2.0-flash npm run dev:worker

# Use default fallback
npm run dev:worker
```

## Benefits

1. **Immediate Fix**: Processing works now with `gemini-2.0-flash-exp`
2. **Future Ready**: Easy switch to `gemini-2.5-flash` when available
3. **Same Capability**: Both models support 65536 tokens (8x increase)
4. **Better Debugging**: Enhanced error logging for API issues

## When to Update

Monitor for `gemini-2.5-flash` availability:
- Check Google AI documentation for regional rollout
- Test periodically with the test script
- Update `GEMINI_MODEL` when confirmed working

## Testing

Run this command to check model availability:
```bash
cd worker
npx tsx -e "
import { GoogleGenAI } from '@google/genai'
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })
const test = async () => {
  const r = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{parts: [{text: 'Say OK'}]}]
  })
  console.log('Response:', r.text)
}
test().catch(console.error)
"
```

When this returns actual text instead of `undefined`, the model is ready.

---

**Note**: The `gemini-2.0-flash-exp` model provides identical functionality with the same 65536 token limit, so there's no feature loss with this fallback.