# Brainstorming Session: Hybrid AI SDK Strategy (Gemini + Vercel AI SDK)

**Date**: September 27, 2025  
**Participants**: Topher, Claude (AI Assistant)  
**Session Type**: Technical Architecture Decision  
**Status**: Decision Made - Implementation Pending

---

## 🎯 Session Objective

Evaluate migrating from native `@google/genai` SDK to Vercel AI SDK (`@ai-sdk/google`) for future-proofing and provider flexibility, while maintaining the reliability of our working document processing pipeline.

---

## 🔍 Problem Statement

### Current State
- **Working**: Document processing pipeline using native Gemini SDK with Files API
- **Concern**: Vendor lock-in to Google Gemini
- **Motivation**: Curiosity + future-proofing before going too deep into implementation
- **Context**: Single-user application (Topher), already paying for Gemini API

### Key Questions
1. Can Vercel AI SDK provide the same capabilities as native Gemini SDK?
2. Does it support Gemini Files API for large PDFs (>15MB)?
3. What are the embedding capabilities?
4. Should we migrate existing code or use hybrid approach?
5. How does this affect our future feature plans (chat, synthesis, flashcards)?

---

## 📊 Research Findings Summary

### ✅ Vercel AI SDK Strengths
- **Embeddings**: Excellent support via `embedMany()` - cleaner API than native SDK
- **Structured Output**: Zod schemas > JSON Schema (better TypeScript integration)
- **Provider Flexibility**: Easy switching between Gemini, Claude, GPT-4
- **Streaming**: Built-in support with clean API (`streamText`)
- **Context Window**: Full 2M token support for Gemini 2.5 Pro
- **Error Handling**: Unified error types across providers
- **Token Tracking**: Automatic usage tracking
- **Performance**: No overhead - thin wrapper over native APIs

### ❌ Vercel AI SDK Limitations
- **NO Files API Support**: Only base64 encoding for PDFs (~15-20MB limit)
- **Base64 Overhead**: 33% size increase, slower for large files
- **GitHub Issue**: Open since October 2024, no resolution timeline
- **Production Impact**: Cannot process large PDFs (100+ pages) reliably

### 🔄 Native Gemini SDK Strengths
- **Files API**: Upload → URI pattern handles 100MB+ PDFs
- **Server-side Validation**: File state tracking before processing
- **Proven Reliability**: Working production code with 6 input methods
- **Large Documents**: No size limits for document processing
- **Gemini-Specific Features**: Full control over safety settings, caching

---

## 💡 Decision: Hybrid Architecture

### Strategic Approach

```
┌─────────────────────────────────────────────────┐
│         Rhizome V2 AI Architecture              │
├─────────────────────────────────────────────────┤
│                                                  │
│  📦 Background Worker (Document Processing)     │
│  ├─ PDF Processing: Native Gemini SDK          │
│  │  └─ Reason: Files API required (>15MB)      │
│  └─ Embeddings: Vercel AI SDK                  │
│     └─ Reason: Cleaner API, batch support      │
│                                                  │
│  🌐 Next.js API Routes (Future Features)        │
│  ├─ Document Chat: Vercel AI SDK               │
│  ├─ Flashcard Generation: Vercel AI SDK        │
│  ├─ Synthesis/Insights: Vercel AI SDK          │
│  └─ Reason: Streaming, provider flexibility    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Rationale

**Use Native Gemini SDK For:**
- ✅ Background document processing (PDFs, YouTube, web articles)
- ✅ Large file handling via Files API
- ✅ Production-critical processing pipeline
- ✅ Any operation requiring >15MB file uploads

**Use Vercel AI SDK For:**
- ✅ ALL embeddings (immediate migration target)
- ✅ Future interactive features (chat, flashcards, synthesis)
- ✅ Streaming responses to users
- ✅ Provider experimentation (Gemini, Claude, GPT-4)

---

## 📋 Implementation Plan

### Phase 1: Embeddings Migration (Immediate - Low Risk)

**Goal**: Migrate embeddings to Vercel AI SDK while keeping document processing intact.

**Changes Required**:
1. Create `worker/lib/embeddings.ts` with Vercel AI SDK
2. Update `worker/handlers/process-document.ts` to use new embeddings module
3. Test vector equivalence with existing documents
4. Deploy and monitor

**Estimated Time**: 2-3 hours  
**Risk Level**: 🟢 LOW (embeddings are stateless, easy rollback)

**Benefits**:
- Cleaner API: `embedMany()` vs native `embedContent()`
- Batch processing: More efficient
- Validation: Immediate exposure to Vercel SDK in production

### Phase 2: Documentation Updates (Immediate)

**Goal**: Document hybrid approach for future development.

**Files to Update**:
1. `CLAUDE.md` - Add hybrid SDK strategy section
2. `docs/AI_DOCUMENTATION.md` - NEW: Comprehensive AI architecture guide
3. `docs/GEMINI_PROCESSING.md` - Add note about hybrid usage

**Content**:
- Decision rationale (Files API limitation)
- When to use each SDK
- Future feature planning notes
- Model name corrections (gemini-embedding-001)

### Phase 3: Future Features (Deferred to Phase 2-3 of MVP)

**When Building New Features**:
- ✅ Default to Vercel AI SDK
- ✅ Use Gemini as primary model (user preference)
- ✅ Keep door open for Claude/GPT-4 experimentation
- ✅ Use streaming for real-time user feedback

**Planned Features with Vercel AI SDK**:
- **Document Chat**: Interactive Q&A with documents (Phase 3)
- **Flashcard Generation**: AI-powered card creation (Phase 2)
- **Synthesis Insights**: Cross-document connections (Phase 3)
- **Connection Explanations**: Why documents relate (Phase 3)

---

## 🔧 Technical Specifications

### Embedding Model Configuration

```typescript
// Vercel AI SDK - Correct Model Name
import { google } from '@ai-sdk/google'
import { embedMany } from 'ai'

const { embeddings } = await embedMany({
  model: google.textEmbeddingModel('gemini-embedding-001', {
    outputDimensionality: 768 // Match pgvector dimensions
  }),
  values: chunks // Batch processing
})

// Returns: number[][] - Direct access, no nested structure
```

**Model Details**:
- **Name**: `gemini-embedding-001` (NOT text-embedding-004)
- **Dimensions**: 768 (configurable: 128-3072)
- **Languages**: 100+ languages
- **Status**: Current recommended model
- **Rate Limits**: 1500 requests/minute (free tier)

### Document Processing (Unchanged)

```typescript
// Native Gemini SDK - Keep for Files API
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY })

// Upload large PDF
const uploadedFile = await ai.files.upload({
  file: pdfBlob,
  config: { mimeType: 'application/pdf' }
})

// Process with URI reference
const result = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: [{
    parts: [
      { fileData: { fileUri: uploadedFile.uri, mimeType: 'application/pdf' } },
      { text: EXTRACTION_PROMPT }
    ]
  }]
})
```

---

## 🎯 Success Criteria

### Embeddings Migration
- ✅ Vector equivalence: New embeddings match native SDK output
- ✅ No performance regression: Processing time stays <2 minutes
- ✅ Error handling: Graceful failures with context
- ✅ Monitoring: Track success rate >95%

### Documentation Quality
- ✅ Clear decision rationale documented
- ✅ When-to-use-what matrix available
- ✅ Code examples for both SDKs
- ✅ Future feature planning documented

### Developer Experience
- ✅ Consistent patterns across codebase
- ✅ Easy to understand which SDK for what
- ✅ Clear migration path for future features
- ✅ Type safety maintained

---

## ⚠️ Risks & Mitigation

### Risk 1: Vercel AI SDK Breaking Changes
**Likelihood**: Medium  
**Impact**: Medium  
**Mitigation**: Pin exact versions, test before upgrading, maintain native SDK as fallback

### Risk 2: Embedding Vector Drift
**Likelihood**: Low  
**Impact**: High (would break similarity search)  
**Mitigation**: Validate vector equivalence during migration, keep test documents

### Risk 3: Future Files API Support Never Arrives
**Likelihood**: Medium  
**Impact**: Low (hybrid approach already accounts for this)  
**Mitigation**: Already decided to keep native SDK for document processing

### Risk 4: Performance Overhead from Abstraction
**Likelihood**: Low  
**Impact**: Low  
**Mitigation**: Research confirmed minimal overhead, monitor in production

---

## 📝 Action Items

### Immediate (This Week)
- [ ] Implement `worker/lib/embeddings.ts` with Vercel AI SDK
- [ ] Update `worker/handlers/process-document.ts` to use new embeddings
- [ ] Test embedding vector equivalence
- [ ] Update `CLAUDE.md` with hybrid strategy
- [ ] Create `docs/AI_DOCUMENTATION.md` comprehensive guide
- [ ] Update `docs/GEMINI_PROCESSING.md` with hybrid notes

### Short-term (Phase 2 - Study System)
- [ ] Use Vercel AI SDK for flashcard generation
- [ ] Validate structured output with Zod schemas
- [ ] Monitor embeddings performance in production

### Long-term (Phase 3 - Synthesis)
- [ ] Implement document chat with Vercel AI SDK
- [ ] Build synthesis insights with streaming
- [ ] Experiment with Claude for specific use cases
- [ ] Evaluate provider cost optimization

---

## 🔄 Open Questions

### Technical
1. **Q**: Should we batch embed with delays for rate limiting?  
   **A**: Monitor rate limits; add if needed (1500 req/min is generous)

2. **Q**: What if Vercel AI SDK adds Files API support later?  
   **A**: Re-evaluate migration, but no urgency to change working code

3. **Q**: Should we abstract SDK choice behind interface?  
   **A**: No - premature optimization. Hybrid approach is explicit and clear.

### Product
1. **Q**: Will we experiment with other providers (Claude, GPT-4)?  
   **A**: Possibly for synthesis/chat features, but Gemini is primary

2. **Q**: Should we optimize for cost across providers?  
   **A**: Not a priority (single user, already paying), but flexibility enables it

---

## 📚 References

### Documentation
- [Vercel AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core)
- [Vercel AI SDK Embeddings](https://ai-sdk.dev/docs/ai-sdk-core/embeddings)
- [Google Provider Docs](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Gemini Files API](https://ai.google.dev/gemini-api/docs/files)

### GitHub Issues
- [Vercel AI SDK #3847](https://github.com/vercel/ai/issues/3847) - Files API support request (open)

### Research Reports
- See: Research agent output (this session)
- See: Archon knowledge base queries

---

## ✅ Decisions Made

### Final Architecture Decision
**APPROVED**: Hybrid approach using both native Gemini SDK and Vercel AI SDK strategically

**Rationale**:
- Files API limitation in Vercel SDK makes it unsuitable for large PDF processing
- Embeddings work perfectly with Vercel SDK (better API)
- Future features benefit from Vercel SDK's provider flexibility
- Low risk, high value approach that future-proofs without disrupting working code

### Model Selection
**PRIMARY MODEL**: Gemini (2.5 Flash for speed, 2.5 Pro for quality)  
**EMBEDDING MODEL**: gemini-embedding-001 (768 dimensions)  
**FUTURE EXPERIMENTATION**: Open to Claude/GPT-4 for specific use cases

### Migration Scope
- ✅ Migrate: Embeddings to Vercel AI SDK
- ❌ Keep: Document processing with native Gemini SDK
- ⏰ Defer: Interactive features (use Vercel SDK when built)

---

## 🎉 Session Outcome

**Status**: ✅ **Decision Complete - Implementation Pending**

**Key Takeaway**: Best of both worlds approach maintains reliability of working code while gaining future flexibility through strategic Vercel AI SDK adoption where it provides value.

**Next Session**: Implementation of embeddings migration + documentation updates

---

**Session Notes**:
- Topher is solo developer paying for Gemini API
- Curiosity-driven exploration, not urgent problem
- Future-proofing is goal, not immediate cost optimization
- Pragmatic approach: use right tool for each job
- Model name correction noted: gemini-embedding-001 (not text-embedding-004)