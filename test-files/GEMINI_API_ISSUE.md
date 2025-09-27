# Gemini API Hanging Issue - Investigation Summary

## Date: 2025-09-26

## Problem Description

Documents uploaded to Rhizome V2 get stuck at 30% progress (extract stage) and never complete processing. The worker appears to hang indefinitely when calling the Gemini API for PDF extraction.

## Investigation Findings

### Root Cause: Gemini API Calls Hanging

The `ai.models.generateContent()` call for PDF extraction appears to hang without timing out or throwing errors. This happens consistently across multiple documents.

**Observed Behavior:**
- Jobs reach 30% (extract stage) within seconds
- Worker logs show "calling Gemini API..." but never completes
- No error messages or exceptions are thrown
- Jobs remain stuck for 10+ minutes
- API connectivity is confirmed working (embedding API responds instantly)

### What We Tried

1. **✅ Fixed Worker Job Selection Logic**
   - Original bug: Worker only queried `status='pending'`, ignoring stuck `'processing'` jobs
   - Fix: Added stale job recovery for jobs stuck >10 minutes
   - Result: Worker now recovers stuck jobs, but they still hang on Gemini API

2. **✅ Added Promise.race Timeout**
   - Added 2-minute timeout using `Promise.race([geminiPromise, timeoutPromise])`
   - Result: Timeout never triggers (API call never resolves OR rejects)

3. **✅ Added SDK-Level Timeout**
   - Configured `GoogleGenAI({ httpOptions: { timeout: 120000 } })`
   - Result: Still hanging (worker restart may not have applied this yet)

4. **✅ Verified API Key and Connectivity**
   - Embedding API (`embedContent`) works instantly
   - API key is valid and rate limits not exceeded
   - Network connectivity confirmed

### Technical Details

**SDK Version:** `@google/genai@^0.3.0`

**API Call That Hangs:**
```typescript
const result = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{
    parts: [
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 }},
      { text: EXTRACTION_PROMPT }
    ]
  }],
  config: {
    responseMimeType: 'application/json',
    responseSchema: EXTRACTION_SCHEMA
  }
})
```

**PDF Sizes Tested:**
- 169 KB (propositions.pdf) - HUNG
- 734 KB (unlock-the-art.pdf) - HUNG  
- One document DID complete successfully (storytelling.pdf, 734 KB)

### Current Hypotheses

1. **PDF Content Issue**: Certain PDF structures or content may cause Gemini to hang
2. **Schema Validation**: The `responseSchema` might be causing infinite processing
3. **Base64 Encoding Issue**: Large base64 payloads may hit undocumented limits
4. **SDK Bug**: The @google/genai SDK may have issues with PDF processing
5. **API Backend Issue**: Gemini API backend may be experiencing issues

### Next Steps

1. **Test Without Schema**: Try calling without `responseSchema` to see if that's the issue
2. **Test With Plain Text**: Upload markdown/txt files to bypass PDF extraction entirely
3. **Test Direct HTTP Calls**: Bypass the SDK and call the API directly
4. **Switch to Older SDK**: Try `@google/generative-ai` (deprecated but may work)
5. **File Size Limits**: Create very small test PDFs (<10 KB)

## Workaround

Until the Gemini API hanging issue is resolved:

1. **Use Markdown/Text Files**: Upload `.md` or `.txt` files directly (bypasses PDF extraction)
2. **Manual Processing**: Convert PDFs to markdown externally before uploading
3. **Reduce Timeout**: Set aggressive timeouts (30-60s) to fail fast

## Files Changed

- `worker/index.ts` - Added stale job recovery
- `worker/handlers/process-document.ts` - Added timeouts and logging
- `src/components/layout/ProcessingDock.tsx` - Fixed dev user ID detection
- `src/components/library/UploadZone.tsx` - Added markdown file support

## Test Files Created

- `test-files/small-test.md` - ~100 words, markdown format
- `test-files/medium-test.txt` - ~500 words, plain text format

## References

- Gemini API Docs: https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference
- SDK Repository: https://github.com/googleapis/js-genai
- NPM Package: https://www.npmjs.com/package/@google/genai