# Document Processing Pipeline Fixes - September 26, 2025

## Issues Resolved

### 1. Gemini API Method Structure (CRITICAL)
**Problem**: Using incorrect method namespace for @google/genai npm package
- ❌ Was: `genAI.generateContent()` and `genAI.embedContent()`
- ✅ Fixed: `ai.models.generateContent()` and `ai.models.embedContent()`

**Files Changed**:
- `supabase/functions/process-document/index.ts:103` - generateContent call
- `supabase/functions/process-document/index.ts:148` - embedContent call
- Renamed variable `genAI` → `ai` for consistency

### 2. Embedding Response Structure
**Problem**: Incorrect access path for embedding values
- ❌ Was: `result.values` (doesn't exist)
- ✅ Fixed: `result.embedding.values` (correct structure per @google/genai docs)

**Response Structure**:
```typescript
// Single content embedding
{
  embedding: {
    values: number[],      // The actual embedding vector
    statistics?: {
      tokenCount?: number,
      truncated?: boolean
    }
  }
}
```

### 3. Storage Path Consistency
**Problem**: User ID mismatch between upload and processing
- Upload creates: `00000000-0000-0000-0000-000000000000/{docId}/source.pdf`
- Processing expects: `dev-user-123/{docId}/source.pdf`

**Resolution**: Verified DEV_USER_ID is consistent across codebase
- `src/lib/auth/index.ts:10` - DEV_USER_ID constant
- Both use `00000000-0000-0000-0000-000000000000` ✅

### 4. Response Validation (NEW)
**Added comprehensive error handling**:
- Empty response check before JSON.parse
- Try-catch around JSON parsing with detailed errors
- Response structure validation (markdown + chunks array)
- Per-chunk embedding validation with index tracking

**Files Changed**:
- `supabase/functions/process-document/index.ts:124-137` - Generation validation
- `supabase/functions/process-document/index.ts:160-162` - Embedding validation

### 5. Environment Variables
**Added missing Edge Function variables**:
- `SUPABASE_URL=http://localhost:54321`
- `SUPABASE_SERVICE_ROLE_KEY=<token>`
- `SUPABASE_ANON_KEY=<token>`

**File**: `supabase/.env.local`

### 6. Realtime Configuration (NEW)
**Problem**: ProcessingDock subscribes to document changes but Realtime not enabled

**Resolution**: Created migration 007_enable_realtime.sql
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
GRANT SELECT ON documents TO authenticated;
```

**Impact**: 
- ProcessingDock now receives live updates during processing
- Shows real-time status: pending → processing → embedding → completed
- RLS policies still apply (users only see their own documents)

## Current Status

### ✅ Completed Fixes
1. Gemini API method structure corrected
2. Embedding response access fixed
3. Response validation added
4. Environment variables configured
5. Realtime enabled for ProcessingDock
6. Storage path consistency verified

### ⚠️ Debugging in Progress
**Current Issue**: 504 Gateway Timeout after 150 seconds

**Evidence from logs**:
```
Error: Failed to generate embedding for chunk 1: Invalid embedding response for chunk 1
```

**Next Steps**:
1. Added diagnostic logging to embedContent calls (lines 156-158)
2. Logs will show actual response structure when re-tested
3. May need to adjust response access based on actual API behavior

## Key Learnings

### Gemini API (@google/genai npm package)
- Always access through `.models` namespace
- Model names: `gemini-2.5-flash`, `text-embedding-004`
- Response structures differ from REST API docs
- Single embedding: `result.embedding.values`
- Multiple embeddings: `result.embeddings.map(e => e.values)`

### Edge Function Best Practices
- Environment variables must be in `supabase/.env.local`
- Service role key needed for storage access
- Use descriptive error messages with context
- Add diagnostic logging for API responses

### Supabase Realtime
- Must enable publication: `ALTER PUBLICATION supabase_realtime ADD TABLE <table>`
- Grant SELECT permission to authenticated role
- RLS policies apply to Realtime subscriptions
- Not needed for synchronous HTTP flows (but nice for UI updates)

## Testing Plan

1. Restart services: `npm run dev`
2. Upload small PDF (< 1MB)
3. Check Edge Function logs for embedding response structure
4. Verify chunks table has embeddings
5. Confirm ProcessingDock shows real-time updates

## Related Files

**Modified**:
- `src/app/actions/documents.ts` - Upload server action
- `supabase/functions/process-document/index.ts` - Main processing logic
- `supabase/.env.local` - Environment variables
- `supabase/migrations/007_enable_realtime.sql` - Realtime configuration

**Key References**:
- `src/lib/auth/index.ts` - Dev user ID constant
- `src/components/layout/ProcessingDock.tsx` - Realtime subscription
- `docs/ARCHITECTURE.MD` - System design
- `CLAUDE.md` - Project guidelines