# BUG-024: Obsidian Sync Jobs Not Visible in UI

**Status**: ✅ RESOLVED
**Priority**: P2 (Medium)
**Discovered**: 2025-10-16
**Resolved**: 2025-10-20
**Affects**: ProcessingDock, JobsTab
**Resolution**: Migration 060 + code standardization

---

## Problem

When Obsidian sync operations are triggered, the background job runs successfully in the worker but is **invisible in the UI** (ProcessingDock and potentially Jobs tab).

## Actual Root Cause (Corrected)

**Naming convention mismatch** between database inserts and UI expectations:

- **Database**: Used kebab-case (`'obsidian-sync'`, `'detect-connections'`)
- **UI Components**: Expected snake_case (`'obsidian_sync'`, `'detect_connections'`)

The auto-discovery mechanism was working correctly, but jobs weren't displayed because the switch statements in `ProcessingDock.tsx` and `JobList.tsx` didn't match the kebab-case job types.

**Original hypothesis** (auto-discovery not working) was incorrect - the store WAS finding the jobs, but the UI couldn't recognize them due to the naming mismatch.

## ~~Original Root Cause~~ (Incorrect)

~~The `/api/obsidian/sync/route.ts` creates background jobs directly in the database:~~

```typescript
// src/app/api/obsidian/sync/route.ts:69-79
const { data: job } = await supabase
  .from('background_jobs')
  .insert({
    job_type: 'obsidian-sync',
    status: 'pending',
    user_id: devUserId,
    input_data: { documentId, userId: devUserId },
    max_retries: 3
  })
  .select()
  .single()
```

**But it never registers the job in the Zustand store**, so:
- ✅ Worker can see and process the job (polls database)
- ❌ ProcessingDock shows nothing (reads from Zustand store)
- ❌ User has no visibility into sync progress

## Impact

- **User Experience**: Users clicking "Sync with Obsidian" see no feedback that sync is running
- **Data Integrity**: No impact - jobs run correctly in background
- **Workaround**: Refresh page or check database directly

## Observed Behavior

1. User clicks "Sync with Obsidian" button
2. API route creates `obsidian-sync` job in database
3. Worker picks up job and starts processing (visible in worker logs)
4. **UI shows nothing** - no progress indicator, no job card
5. Job completes successfully (verified in database)

## Expected Behavior

1. User clicks "Sync with Obsidian" button
2. Job appears in ProcessingDock with progress indicator
3. User sees: "Obsidian Sync" with progress percentage
4. Job completes and disappears from ProcessingDock

## Reproduction

```bash
# 1. Start services
npm run dev

# 2. Navigate to document reader
# 3. Click "Sync with Obsidian" button
# 4. Observe: No job appears in ProcessingDock (bottom-left)

# 5. Verify job exists in database:
psql -c "SELECT id, job_type, status, progress FROM background_jobs ORDER BY created_at DESC LIMIT 1;"
# Shows: obsidian-sync job with status 'processing'
```

## Suggested Fix

**Option 1: Auto-Discovery During Polling** (Recommended)

Enhance `background-jobs.ts` polling to auto-register newly discovered jobs:

```typescript
// src/stores/admin/background-jobs.ts

const poll = async () => {
  const { data: dbJobs } = await supabase
    .from('background_jobs')
    .select('*')
    .in('status', ['pending', 'processing', 'paused'])
    .order('created_at', { ascending: false })

  // Auto-register jobs that aren't in the store yet
  dbJobs?.forEach(dbJob => {
    const existingJob = get().jobs.get(dbJob.id)
    if (!existingJob) {
      console.log(`[BackgroundJobs] Auto-discovered job ${dbJob.id} (${dbJob.job_type})`)
      get().registerJob(dbJob.id, dbJob.job_type, dbJob.metadata)
    }
  })

  // ... rest of polling logic
}
```

**Benefits**:
- Catches jobs created by any source (API routes, direct inserts, etc.)
- No changes needed to API routes
- Works for all job types, not just obsidian-sync

**Option 2: Add Server-to-Client Notification**

Use Supabase Realtime to notify client when new jobs are created:

```typescript
// Subscribe to background_jobs inserts
supabase
  .channel('background_jobs_channel')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'background_jobs',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    const newJob = payload.new
    registerJob(newJob.id, newJob.job_type, newJob.metadata)
  })
  .subscribe()
```

**Benefits**:
- Real-time updates, no polling lag
- Clean separation of concerns

**Drawbacks**:
- Requires Realtime subscription setup
- More complex implementation

## Affected Files

- `src/app/api/obsidian/sync/route.ts` - Creates job without UI notification
- `src/stores/admin/background-jobs.ts` - Polling logic doesn't auto-discover
- `src/components/layout/ProcessingDock.tsx` - Displays jobs from store only

## Related Issues

- None

## Test Plan

1. Implement fix (Option 1 recommended)
2. Trigger Obsidian sync operation
3. Verify job appears in ProcessingDock immediately
4. Verify job shows progress updates
5. Verify job disappears when complete
6. Test with other job types to ensure no regression

## Notes

- Same issue affected ALL kebab-case job types: `detect-connections`, `obsidian-export`, `obsidian-sync`, `readwise-import`, `scan-vault`, `import-from-vault`
- ProcessingDock and JobList already had correct snake_case switch statements
- The display names and icons were already implemented correctly

---

## Resolution (2025-10-20)

**Fixed by standardizing all job types to snake_case:**

**Files Updated:**
1. `supabase/migrations/060_standardize_job_type_naming.sql` - Database migration (28 jobs updated)
2. `worker/index.ts` - JOB_HANDLERS keys (11 job types)
3. `worker/handlers/process-document.ts` - Query + insert
4. `worker/handlers/continue-processing.ts` - Query + insert
5. `src/app/actions/integrations.ts` - 5 job type inserts
6. `scripts/trigger-connection-detection.ts` - Query + insert
7. `tests/integration/database/background-jobs.test.ts` - Test data
8. `src/stores/admin/background-jobs.ts` - Added missing job types to TypeScript interface

**Migration Results:**
- Updated 2 `detect-connections` → `detect_connections`
- Updated 13 `scan-vault` → `scan_vault`
- Updated 13 `import-from-vault` → `import_from_vault`

**Verification:**
All job types now use consistent snake_case naming throughout the entire stack:
- Database: `detect_connections`, `obsidian_export`, etc.
- Worker: Same
- Frontend: Same
- Tests: Same

Jobs are now **immediately visible** in both ProcessingDock and Admin Panel with proper names, icons, and controls.
