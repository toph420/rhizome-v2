# Schema Safety Guidelines

**Purpose**: Prevent schema mismatch errors between TypeScript code and PostgreSQL database.

## The Problem

When refactoring code (especially extracting code into managers/utilities), it's easy to make assumptions about database schema that aren't accurate:

**Example Issues Found**:
- ✅ Fixed: `user_id` in chunks table (doesn't exist)
- ✅ Fixed: `chunk_count` in documents table (doesn't exist)
- ✅ Fixed: `processed_at` vs `processing_completed_at` (wrong name)
- ✅ Fixed: Missing Chonkie metadata fields (chunker_type, token_count, etc.)

## Prevention Strategy

### 1. **Always Check Schema First** 🔍

Before writing any insert/update code:

```bash
# Check table schema
psql postgresql://postgres:postgres@localhost:54322/postgres -c "\d table_name"

# Or during development
npx supabase db diff --local
```

### 2. **Use TypeScript Database Types** 📝

Generate types from schema (future enhancement):

```typescript
// Import generated types
import type { Database } from '@/types/supabase'
type Chunk = Database['public']['Tables']['chunks']['Insert']

// TypeScript will catch field mismatches!
const chunk: Chunk = {
  document_id: '...',
  user_id: '...',  // ❌ Error: Property 'user_id' does not exist
  content: '...'
}
```

### 3. **Validation Layer Pattern** ✅

For critical inserts, validate before saving:

```typescript
// worker/lib/schema-validators.ts (future)
import { z } from 'zod'

export const ChunkInsertSchema = z.object({
  document_id: z.string().uuid(),
  content: z.string(),
  chunk_index: z.number().int(),
  // ... all actual schema fields
  // Zod will error if you add fields that don't exist!
})

// In manager:
const validated = ChunkInsertSchema.parse(chunkData)
await supabase.from('chunks').insert(validated)
```

### 4. **Schema Documentation** 📚

Keep schema docs updated:

```typescript
/**
 * Inserts chunks into database.
 *
 * SCHEMA: chunks table (migration 047)
 * Required: document_id, content, chunk_index
 * Optional: All metadata fields, page_start/end, heading_path
 * Auto: id, created_at, is_current
 *
 * NOTE: user_id NOT stored in chunks (comes via RLS from documents table)
 * NOTE: embedding added in separate step
 */
async function saveChunks(chunks: ProcessedChunk[]) {
  // ...
}
```

### 5. **Testing Against Real Schema** 🧪

Test inserts with actual database:

```typescript
// tests/integration/schema-validation.test.ts
describe('Schema validation', () => {
  it('should insert chunks with all fields', async () => {
    const chunk = {
      document_id: testDocId,
      content: 'test',
      chunk_index: 0,
      chunker_type: 'recursive',
      token_count: 100
      // ... all fields
    }

    const { error } = await supabase.from('chunks').insert(chunk)
    expect(error).toBeNull() // Catches schema mismatches!
  })
})
```

### 6. **Verify Status Enums & UI Expectations** 🎯

**Problem**: Backend sets status values that don't match what frontend expects.

```typescript
// ❌ WRONG - UI won't recognize this
await supabase.from('documents').update({
  processing_status: 'processed'  // UI checks for 'completed'!
})

// ✅ CORRECT - Match UI expectations
await supabase.from('documents').update({
  processing_status: 'completed',      // UI checks this value
  markdown_available: true,             // UI checks this flag
  embeddings_available: true            // UI checks this flag
})
```

**Always check**:
- What status values does the UI expect? (Check components like `DocumentList.tsx`)
- What boolean flags does the UI check? (e.g., `markdown_available && embeddings_available`)
- Are there CHECK constraints on status fields? (Check migrations)

### 7. **Code Review Checklist** ✓

When reviewing code that touches database:

- [ ] Verified all field names match schema (`\d table_name`)
- [ ] No assumptions about fields that don't exist
- [ ] Field types match (text vs integer, timestamp format)
- [ ] Required fields included
- [ ] Optional fields handled (can be undefined/null)
- [ ] Defaults understood (don't set fields with DB defaults)
- [ ] Status enums match UI expectations
- [ ] Boolean flags set when UI requires them

### 8. **Migration-First Development** 🔄

When adding new functionality:

1. **Migration first**: Add schema fields
2. **Types second**: Update TypeScript types
3. **Code last**: Use the new fields

```bash
# Wrong order (causes errors):
1. Write code with new field
2. Create migration later
3. Deploy → error!

# Right order:
1. npx supabase migration new add_chunk_token_count
2. Add column in migration
3. Run migration locally
4. Update TypeScript code
```

---

## Quick Reference: Tables & Critical Fields

### `chunks` table
**Required**: document_id, content, chunk_index, chunker_type
**Optional**: All metadata, embeddings, page numbers, heading paths
**Auto**: id, created_at, is_current
**NOT in table**: user_id (comes via RLS)

### `documents` table
**Required**: id, user_id, title, storage_path
**Optional**: author, word_count, outline, metadata, page_count
**Auto**: created_at, updated_at
**Naming**: `processing_completed_at` (not `processed_at`)
**Status**: Must be `'completed'` (not `'processed'`) for UI to show Read/Preview buttons
**Flags**: Set `markdown_available` and `embeddings_available` to `true` when done

### `connections` table
**Required**: source_chunk_id, target_chunk_id, connection_type, strength
**Optional**: metadata (jsonb)
**Auto**: id, discovered_at, auto_detected
**User fields**: user_validated, user_starred, validated_at (default null)

### `background_jobs` table
**Required**: id, job_type, input_data, status
**Optional**: progress, output_data, metadata
**Auto**: created_at
**Naming**: `completed_at`, `failed_at` (not `processed_at`)

---

## Red Flags 🚩

Watch for these patterns:

```typescript
// ❌ Hardcoded field that might not exist
const chunk = {
  user_id: userId,  // Does this field exist?
  chunk_count: 10   // Or is it auto-calculated?
}

// ❌ Copy-paste from old code
// (Schema might have changed since!)
await supabase.from('chunks').insert(oldChunkFormat)

// ❌ Assuming field names
processed_at: ...  // Is it processed_at or processing_completed_at?

// ❌ Wrong enum/status values
processing_status: 'processed'  // UI expects 'completed'!

// ❌ Missing required fields
const chunk = {
  content: '...'  // Forgot document_id, chunk_index!
}

// ❌ Missing boolean flags
// UI checks markdown_available AND embeddings_available
await supabase.from('documents').update({
  processing_status: 'completed'  // Not enough! Missing flags
})
```

---

## Action Items

### Immediate
- [x] Fix DocumentProcessingManager schema issues
- [x] Audit ConnectionDetectionManager (✅ all good)
- [x] Verify engine ChunkConnection types (✅ all good)

### Short-term
- [ ] Generate TypeScript types from Supabase schema
- [ ] Add Zod validation for critical inserts
- [ ] Create schema validation test suite

### Long-term
- [ ] Pre-commit hook: Check for common patterns
- [ ] CI check: Validate against local Supabase instance
- [ ] Documentation: Schema change process

---

## When in Doubt

1. **Check the schema**: `psql ... -c "\d table_name"`
2. **Read recent migrations**: `supabase/migrations/*.sql`
3. **Test locally**: Insert sample data and verify
4. **Ask**: "Does this field actually exist in the DB?"

**Remember**: TypeScript types don't enforce database schema! The database is the source of truth.
