# Processing Pipeline Improvements - January 2025

## Session Summary
Comprehensive improvements to document processing pipeline focusing on error handling, user feedback, and JSON parsing reliability.

## Critical Changes Made

### 1. Enhanced Error Handling & Timeouts
**File**: `worker/handlers/process-document.ts`

**Changes**:
- Added application-level timeout wrapper (8 minutes) to `generateContent` call
- Integrated `getUserFriendlyError()` for user-facing error messages
- Removed 25+ verbose console.logs, replaced with structured progress updates
- Added comprehensive error context for debugging

**Key Pattern**:
```typescript
const generationPromise = ai.models.generateContent({...})
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('...')), 8 * 60 * 1000)
)
result = await Promise.race([generationPromise, timeoutPromise])
```

### 2. Granular Progress Updates
**Files**: `worker/handlers/process-document.ts`, `src/components/layout/ProcessingDock.tsx`

**Progress Structure**:
- **Stage**: High-level phase (download, extract, save_markdown, embed, complete)
- **Substage**: Current operation (uploading, validating, analyzing, embedding)
- **Details**: Contextual info (file sizes, time elapsed, chunk counts)

**Key Progress Points**:
- 12%: Downloaded file with size
- 15%: Uploading to Gemini
- 20%: Validating file
- 25%: AI analyzing document (with time estimate)
- 30%: Still analyzing (updates every 30s with elapsed time)
- 40%: Extraction complete (chunks, KB, timing)
- 60-99%: Embedding progress (chunk X/Y)
- 100%: Processing complete

### 3. JSON Parsing Reliability
**Package Added**: `jsonrepair@3.13.1`

**Problem Solved**: Gemini can return malformed JSON with unescaped quotes, newlines, special characters causing parse failures.

**Multi-Layer Defense**:
1. Improved prompt with explicit JSON formatting instructions
2. Schema validation via Gemini config
3. Try-catch with automatic repair using `jsonrepair` library
4. Detailed error messages with context
5. Applied to both PDF extraction AND markdown chunking functions

**Repair Function**:
```typescript
import { jsonrepair } from 'jsonrepair'

function repairCommonJsonIssues(jsonString: string): string {
  // Extract from markdown code blocks
  // Clean whitespace
  // Use jsonrepair for professional fixing
  return jsonrepair(jsonString)
}
```

**Handles**:
- Unescaped quotes: `"He said "hello""` → `"He said \"hello\""`
- Single quotes: `{'key': 'value'}` → `{"key": "value"}`
- Trailing commas, missing commas, comments, unquoted keys
- Markdown code block wrappers

### 4. Race Condition Fix - Progress Bar Stuck at 100%
**File**: `worker/handlers/process-document.ts`, `src/components/layout/ProcessingDock.tsx`

**Problem**: Progress reached 100% but UI showed spinner because status update came in separate database operation.

**Solution**:
- **Atomic Update**: Combined progress and status update in single database write
- **Polling Fallback**: Added 5-second polling to catch missed real-time events

**Before** (race condition):
```typescript
await updateProgress(supabase, job.id, 100, 'complete', ...)  // UPDATE 1
await supabase.from('background_jobs').update({ status: 'completed' })  // UPDATE 2
```

**After** (atomic):
```typescript
await supabase.from('background_jobs').update({
  status: 'completed',
  completed_at: new Date().toISOString(),
  progress: { percent: 100, stage: 'complete', ... }  // Single UPDATE
})
```

## Model Changes
**Note**: User changed model from `gemini-2.5-flash` to `gemini-2.0-flash` (lines 132, 323)

## Files Modified
1. `worker/handlers/process-document.ts` - Major refactoring
2. `worker/lib/errors.ts` - Already had getUserFriendlyError helper
3. `worker/package.json` - Added jsonrepair dependency
4. `src/components/layout/ProcessingDock.tsx` - Enhanced substage display, added polling

## Architecture Insights

### Background Worker Pattern
- Node.js process polls `background_jobs` table every 5 seconds
- Uses Supabase Files API for PDFs (not inline data)
- Checkpoint/resume support via `completed_stages` tracking
- Retry logic with exponential backoff

### Progress Update Pattern
```typescript
await updateProgress(
  supabase, 
  jobId, 
  percent: number,
  stage: string,
  substage?: string,
  details?: string
)
```

### Error Propagation
Worker throws error → `getUserFriendlyError()` converts → stored in `last_error` → displayed in ProcessingDock

## Testing Recommendations
1. **JSON Stress Tests**: PDFs with quotes, code blocks, tables, special characters
2. **Large Files**: Test Files API path (>20MB)
3. **Timeout Scenarios**: Complex PDFs that take 5+ minutes
4. **Race Conditions**: Rapid completion (small files) to verify atomic update

## Performance Characteristics
- Small PDFs (<1MB): ~1-2 minutes
- Medium PDFs (1-5MB): ~2-5 minutes  
- Large PDFs (5-10MB): ~5-10 minutes
- Timeout: 8 minutes application, 10 minutes HTTP

## Known Limitations
1. Maximum 1,000 PDF pages (Gemini limit)
2. Files API auto-deletes after 48 hours
3. Rate limiting: Pause every 10 embedding requests
4. Embedding model: `gemini-embedding-001` (768 dimensions)

## Future Considerations
- Consider batching embedding requests for very large documents
- Add retry-specific error messages (e.g., "Retrying in X seconds...")
- Track processing time metrics for optimization
- Add validation for chunk quality (min/max sizes)