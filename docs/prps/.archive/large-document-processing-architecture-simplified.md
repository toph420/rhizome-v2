# PRP: Large Document Processing - Simplified

**Status**: Ready for Implementation  
**Priority**: High  
**Confidence Level**: 9/10 (3-4 hour fix)  
**Created**: 2025-09-30  
**Philosophy**: Ship broken things, fix when they annoy me

## Problem Statement

The PDF processor fails on large books (400+ pages like Gravity's Rainbow) because it tries to extract markdown AND create semantic chunks in a single AI call, hitting Gemini's 65K token limit. The fix is simple: separate these concerns like other processors already do.

## Key Architectural Insight

**Collision detection operates on metadata, not chunk boundaries.** The 7 engines run on themes, concepts, patterns, and tone - all extracted AFTER chunking. Slightly messier chunk boundaries don't matter as long as each chunk has enough content (300-500 words) for accurate metadata extraction.

This makes chunk quality a secondary concern, not a primary risk.

## Solution: Clean Separation (Already Proven)

Use the same pattern as `MarkdownCleanProcessor` - separate extraction from chunking:

1. **Extract**: AI gets only clean markdown from PDF (80% token reduction)
2. **Chunk**: Local algorithm processes markdown into chunks  
3. **Enrich**: Existing metadata pipeline for collision detection

**Benefits**:
- Handles unlimited document sizes
- More reliable (simpler AI prompt)
- Uses battle-tested `simpleMarkdownChunking()` 
- No impact on collision detection quality

## Implementation Blueprint

The implementation is mostly **removing complexity**, not adding it.

### Current Problem (`worker/processors/pdf-processor.ts`)

```typescript
// Lines 21-53: Complex prompt asking for markdown + chunks
const result = await this.ai.generateContent({
  systemInstruction: COMPLEX_EXTRACTION_AND_CHUNKING_PROMPT,
  generationConfig: {
    responseSchema: STRUCTURED_JSON_SCHEMA // Causes token explosion
  }
})
```

### Target Solution (Follow MarkdownCleanProcessor Pattern)

```typescript
// Step 1: Extract only markdown
const markdown = await this.withRetry(
  async () => this.extractMarkdownOnly(fileUrl),
  'Extract markdown from PDF'
)

// Step 2: Chunk locally (function already imported line 10)
const chunks = simpleMarkdownChunking(markdown, {
  minChunkSize: 200,
  maxChunkSize: 500,
  preferredChunkSize: 350
})

// Step 3: Let base class handle metadata enrichment
return { chunks, markdown }
```

### Specific Code Changes

**1. Simplify Extraction Prompt**
- Remove chunks request from system instruction
- Remove structured JSON output schema
- Return plain markdown text

**2. Update `parseExtractionResult()`** 
- Always use `simpleMarkdownChunking()` (already imported line 10)
- Remove JSON parsing complexity (lines 279-346)
- Keep error handling and retry logic

**3. Pattern Already Exists**
- Lines 321-332 already use `simpleMarkdownChunking()` as fallback
- Just make it the primary path instead of fallback

## Validation Strategy

**Real-world validation**: Process Gravity's Rainbow and read it.

**Technical validation**:
```bash
cd worker
npm run test:all-sources      # All processor tests
npm run validate:metadata     # Metadata extraction validation
```

**Success criteria**:
- Gravity's Rainbow processes without token errors
- Reading experience feels natural
- Connections surface in sidebar during reading

## Why This Works

1. **Function already imported**: `simpleMarkdownChunking()` on line 10
2. **Pattern already proven**: MarkdownCleanProcessor uses identical separation
3. **Fallback already exists**: Lines 321-332 show it works when AI chunking fails
4. **Greenfield architecture**: No backward compatibility concerns
5. **Metadata unaffected**: Collision engines use data added AFTER chunking

## Implementation Tasks

**Week 1: Implementation (3-4 hours)**
1. Modify extraction prompt to request only markdown
2. Remove structured output schema for chunks  
3. Update `parseExtractionResult()` to always use local chunking
4. Test with Gravity's Rainbow PDF

**Week 2: Real-world Validation**
1. Read Gravity's Rainbow in the document reader
2. Evaluate connection quality in sidebar
3. Note any chunk boundaries that feel awkward
4. Fix if annoyingly wrong, ship if good enough

## Rollback Strategy

Git branch. If fundamentally broken, `git revert`.

No environment flags, migration tracking, or monitoring implementation needed.

## Confidence Assessment

**9/10 for success** because:
- ✅ Pattern already working in MarkdownCleanProcessor
- ✅ Function already imported and used as fallback
- ✅ Simplification (removing code) not addition
- ✅ No impact on collision detection engines
- ✅ Comprehensive test infrastructure ready

The only reason it's not 10/10: untested assumption that chunk quality won't affect reading experience. But that's what Week 2 validation is for.

---

**Philosophy**: This is a personal knowledge synthesis tool. Success is measured by: "Can I process and read Gravity's Rainbow with useful connections surfacing?" Everything else is secondary.