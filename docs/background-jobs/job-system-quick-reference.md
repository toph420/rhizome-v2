# Job System Quick Reference

## File Locations

### Frontend Components
- **Job Store**: `src/stores/admin/background-jobs.ts` - Zustand state management, polling, UI sync
- **Processing Dock**: `src/components/layout/ProcessingDock.tsx` - Real-time job widget (bottom-right)
- **Job List**: `src/components/admin/JobList.tsx` - Filterable job history
- **Jobs Tab**: `src/components/admin/tabs/JobsTab.tsx` - Admin panel controls
- **Admin Actions**: `src/app/actions/admin.ts` - Job management (clear, fail, delete, pause)

### Worker Handlers
- **process-document**: `worker/handlers/process-document.ts` - Main document processing (8 stages)
- **import-document**: `worker/handlers/import-document.ts` - Storage to DB import (5 stages)
- **export-document**: `worker/handlers/export-document.ts` - DB to ZIP export (8 stages)
- **reprocess-connections**: `worker/handlers/reprocess-connections.ts` - Smart connection regeneration
- **detect-connections**: `worker/handlers/detect-connections.ts` - Async connection detection
- **Base Processor**: `worker/processors/base.ts` - Common methods: updateProgress, saveStageResult, withRetry

### Database
- **Schema**: `supabase/migrations/008_background_jobs.sql`
- **Errors**: `supabase/migrations/011_background_jobs_error_fields.sql`

---

## Job Types

| Type | Handler | Display | Stages | Checkpoints |
|---|---|---|---|---|
| `process_document` | process-document.ts | "Processing..." | 8 | Yes |
| `import_document` | import-document.ts | "Importing" | 5 | Yes |
| `export_documents` | export-document.ts | "Exporting N" | 8 | Partial |
| `reprocess_connections` | reprocess-connections.ts | "Reprocessing" | 5 | Minimal |
| `detect_connections` | detect-connections.ts | (unmapped) | 3 | No |
| `obsidian_export` | obsidian-sync.ts | (unmapped) | ? | ? |
| `obsidian_sync` | obsidian-sync.ts | (unmapped) | ? | ? |
| `readwise_import` | readwise-import.ts | (unmapped) | ? | ? |

---

## Progress Tracking

### Fields
- `progress` (0-100): Numeric percentage
- `stage`: Current processing stage name
- `details`: Human-readable message
- `percent`: Alternative field (same as progress)

### Update Pattern
```typescript
await updateProgress(supabase, jobId, percent, stage, status, message)
```

### Database Storage
```sql
progress JSONB = {
  "percent": 50,
  "stage": "chunking",
  "details": "Processing chunk 234 of 500"
}
```

---

## Storage Checkpoints

### Naming Convention
- **Intermediate**: `documents/{userId}/{docId}/stage-{stageName}.json`
- **Final**: `documents/{userId}/{docId}/{stageName}.json`

### Examples
- `stage-extraction.json` - After Docling extraction
- `stage-chunking.json` - After chunking
- `chunks.json` (final) - Final processed chunks
- `metadata.json` (final) - Document metadata
- `manifest.json` (final) - Document structure

### Usage
```typescript
protected async saveStageResult(
  stage: string,
  data: any,
  options?: { final?: boolean }
): Promise<void>
```

---

## Current Status Field Values

- `pending` - Waiting to process
- `processing` - Currently running
- `completed` - Finished successfully
- `failed` - Failed with error
- `cancelled` - Cancelled by user

**Missing**: `paused` (proposed for pause/resume feature)

---

## Key Gaps for Pause/Resume

1. **No pause state** - Only pending/processing/completed/failed
2. **No checkpoint linking** - Saved but not tracked in job metadata
3. **No resumption logic** - If failed, must restart from beginning
4. **No retry polling** - Retry fields exist but unused
5. **UI not showing all job types** - Only 3 of 7 types displayed
6. **No stage filtering** - Can't filter by processing stage

---

## Implementation Roadmap

### Phase 1: Schema (Non-Breaking)
- Add `paused_at`, `pause_reason` fields
- Add `last_checkpoint_path`, `last_checkpoint_stage` fields
- Add `resumed_at`, `resume_count` fields
- Index for pause/resume queries

### Phase 2: Handler Updates
- Track checkpoints in job metadata
- Implement resumption logic per handler
- Add stage-data to progress object

### Phase 3: UI Features
- Expand job type labels (all 7 types)
- Add "Pause Job" button
- Show checkpoint info in detail view
- Add "Resume from checkpoint" button

### Phase 4: Retry System
- Polling loop for failed jobs
- Use retry_count/max_retries/next_retry_at
- Error classification for retry eligibility
- Exponential backoff

---

## Testing Checklist

- [ ] Pause job at different stages
- [ ] Resume from checkpoint
- [ ] Verify data integrity after resume
- [ ] Test retry with transient error
- [ ] Test permanent error (no retry)
- [ ] Test concurrent jobs + pause
- [ ] Verify storage cleanup on job delete
- [ ] Test all 7 job types display

---

## Common Commands

### Admin Actions
```typescript
// Pause
await pauseJob(jobId)

// Resume
await resumeJob(jobId)

// Cancel
await cancelAndDeleteJob(jobId)

// Retry
await forceFailJob(jobId)

// Clear
await clearCompletedJobs()
await clearFailedJobs()
```

### Database Queries
```sql
-- Active jobs
SELECT * FROM background_jobs 
WHERE status IN ('pending', 'processing') 
ORDER BY created_at DESC;

-- Failed jobs eligible for retry
SELECT * FROM background_jobs 
WHERE status = 'failed' 
  AND retry_count < max_retries 
  AND next_retry_at < NOW();

-- Jobs with checkpoints
SELECT * FROM background_jobs 
WHERE progress->>'checkpoint_path' IS NOT NULL;
```

