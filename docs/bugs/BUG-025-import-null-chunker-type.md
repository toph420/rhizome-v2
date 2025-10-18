# BUG-025: Import Fails with NULL chunker_type from Legacy Storage Exports

**Status**: Fixed
**Priority**: P1 (High)
**Discovered**: 2025-10-16
**Fixed**: 2025-10-16
**Affects**: Import workflow for documents processed before Session 8 (2025-10-15)

---

## Problem

Import fails with error:
```
Failed to insert chunks: null value in column "chunker_type" of relation "chunks" violates not-null constraint
```

When importing legacy documents (processed before Session 8 Chonkie integration).

## Root Cause

Migration 050 added `chunker_type` column with `NOT NULL` constraint and `DEFAULT 'recursive'`.

However, documents processed before this migration have `chunker_type: null` in their Storage exports (`chunks.json`).

The import handler explicitly passes `chunk.chunker_type` (which is NULL) to the INSERT, bypassing the column's DEFAULT value.

**PostgreSQL behavior**: DEFAULT only applies when column is omitted from INSERT, not when explicitly set to NULL.

## Impact

- **Data Loss Risk**: HIGH - prevents restoring legacy documents from Storage backups
- **Backward Compatibility**: BROKEN - all pre-Session 8 documents can't be imported
- **User Experience**: Import fails silently with database error

## Affected Code

`worker/handlers/import-document.ts:263`:
```typescript
// BEFORE (Bug)
chunker_type: chunk.chunker_type,  // Passes NULL → violates NOT NULL

// AFTER (Fixed)
chunker_type: chunk.chunker_type || 'hybrid',  // Fallback for legacy exports
```

## Observed Behavior

1. User tries to import "Renewable Energy" document (processed pre-Session 8)
2. Storage export has `chunker_type: null`
3. Import handler passes NULL to database
4. PostgreSQL rejects: "null value in column 'chunker_type' violates not-null constraint"
5. Import job fails, no chunks restored

## Expected Behavior

1. Import handler detects NULL `chunker_type`
2. Falls back to 'hybrid' (what legacy documents used)
3. Import succeeds, chunks restored with correct chunker_type

## Fix Applied

**File**: `worker/handlers/import-document.ts`
**Line**: 263
**Change**: Added `|| 'hybrid'` fallback for legacy exports

```typescript
chunker_type: chunk.chunker_type || 'hybrid', // Fallback for legacy exports (pre-Session 8)
```

**Rationale**: Use 'hybrid' because:
- That's what all legacy documents were actually processed with
- Matches the HybridChunker (deprecated) used before Chonkie integration
- Ensures accurate historical record

## Test Plan

1. ✅ Process document before Session 8 (or simulate with NULL chunker_type in Storage)
2. ✅ Delete chunks from database
3. ✅ Import from Storage
4. ✅ Verify import succeeds
5. ✅ Verify chunker_type = 'hybrid' in database

## Related Issues

- Session 8: Added chunker_type field (2025-10-15)
- Migration 050: Added NOT NULL constraint with DEFAULT
- T-024: Chonkie Metadata Portability Test (discovered during testing)

## Notes

- This bug would affect ALL users with documents processed before 2025-10-15
- Critical for backward compatibility and disaster recovery scenarios
- Storage exports should ideally be regenerated with chunker_type populated, but fallback ensures graceful degradation
