# Job System Documentation Index

## Overview

The Rhizome V2 job system manages background processing of documents through a comprehensive task queue, state management, and worker coordination system. This documentation explores the complete architecture including frontend UI, backend handlers, database schema, and opportunities for implementing pause/resume/retry functionality.

## Documents

### 1. Main Architecture Report
**File**: `job-system-architecture.md` (879 lines, 25KB)

Comprehensive analysis covering:
- Job store state management (Zustand)
- 7 job types with display mappings
- Progress tracking mechanisms
- Storage-based checkpointing (saveStageResult)
- Detailed handler analysis (5 main handlers)
- Database schema and fields
- Admin panel components
- Current gaps and opportunities
- Recommendations for pause/resume/retry
- Risk assessment and implementation roadmap

**Best for**: Complete understanding of how the system works

### 2. Quick Reference Guide
**File**: `job-system-quick-reference.md` (130 lines, 5.2KB)

Quick lookup including:
- File locations (all relevant files)
- Job types table
- Progress tracking fields
- Storage checkpoint naming
- Status values
- Key gaps summary
- Implementation roadmap overview
- Testing checklist
- Common commands

**Best for**: Finding files, remembering field names, quick lookups

## Key Findings Summary

### Current Architecture Strengths
- Multi-stage processing with automatic checkpointing
- 70% of infrastructure ready for pause/resume
- Storage-based portability (critical for resumability)
- Error classification system
- Comprehensive admin controls
- Real-time UI updates (2s polling)

### Main Gaps Identified
1. No `paused` status (only pending/processing/completed/failed)
2. Checkpoints not linked to job metadata
3. No resumption logic in handlers
4. Retry system fields exist but unused
5. Only 3 of 7 job types have UI display labels
6. No stage-based filtering or granular control

### Implementation Opportunities
- Schema additions for pause/resume (non-breaking)
- Handler updates (~200 lines each)
- UI enhancements (pause button, checkpoint display)
- Retry polling loop (100-150 lines)

**Estimated Effort**: 2-3 days for full implementation

## Navigation by Task

### I need to understand...
- **How jobs are displayed to users** → ProcessingDock + JobList in architecture doc
- **How progress is tracked** → Section 3 (Progress Tracking) + Section 9 (Current Practice)
- **How handlers save checkpoints** → Section 4 (saveStageResult) + Section 5 (Handler Analysis)
- **What database fields exist** → Section 6 (Database Schema)
- **How to add pause functionality** → Section 10 (Gaps) + Section 12 (Roadmap)
- **Where specific files are** → Quick Reference + Section 11 (Summary Tables)

### I want to implement...
- **Pause/resume feature** → Section 12 (Roadmap) + Section 13 (Code Examples)
- **Automatic retry** → Section 10 (Gap 5) + Section 12 (Phase 4)
- **Better UI display** → Section 10 (Gap 6) + Section 13 (Example 3)
- **Stage filtering** → Section 10 (Gap 7)
- **Checkpoint visibility** → Section 10 (Gap 8)

### I'm debugging...
- **Job stuck in processing** → Check Job Types table + see forceFailJob in admin.ts
- **Progress not updating** → Check polling mechanism in Section 3 + zustand store
- **Missing checkpoints** → Check saveStageResult implementation + handler code
- **Orphaned documents** → See fixOrphanedDocuments in admin.ts

## File Location Quick Reference

### Must-Know Files
```
Frontend UI:
  src/stores/admin/background-jobs.ts              # Zustand store + polling
  src/components/layout/ProcessingDock.tsx         # Real-time widget
  src/components/admin/JobList.tsx                 # Job history
  src/app/actions/admin.ts                         # Job management actions

Worker Handlers:
  worker/handlers/process-document.ts              # Main processor
  worker/handlers/import-document.ts               # Import handler
  worker/handlers/export-document.ts               # Export handler
  worker/handlers/reprocess-connections.ts         # Connection handler
  worker/processors/base.ts                        # Base class + methods

Database:
  supabase/migrations/008_background_jobs.sql      # Schema
  supabase/migrations/011_background_jobs_error_fields.sql  # Error fields
```

## Related Documentation

See also:
- `docs/PROCESSING_PIPELINE.md` - Full processing pipeline
- `docs/ARCHITECTURE.md` - System-wide architecture
- `docs/STORAGE_FIRST_PORTABILITY_GUIDE.md` - Storage patterns

## How to Use These Docs

1. **Start here** if new to job system: Read quick reference first, then browse main architecture
2. **Implementing a feature**: Go to Implementation Roadmap section
3. **Debugging an issue**: Search for keywords (job stuck, checkpoint, retry)
4. **Need specific file location**: Check quick reference tables

## Job Types at a Glance

| Type | Stages | Checkpoints | UI Display |
|---|---|---|---|
| process_document | 8 | Yes | "Processing..." |
| import_document | 5 | Yes | "Importing" |
| export_documents | 8 | Partial | "Exporting N" |
| reprocess_connections | 5 | Minimal | "Reprocessing" |
| detect_connections | 3 | No | (unmapped) |
| obsidian_export | ? | ? | (unmapped) |
| obsidian_sync | ? | ? | (unmapped) |
| readwise_import | ? | ? | (unmapped) |

## Common Quick Answers

**Q: Where is the job store?**
A: `src/stores/admin/background-jobs.ts` (Zustand)

**Q: How often does UI update?**
A: Every 2 seconds via polling

**Q: How are checkpoints saved?**
A: Via `BaseProcessor.saveStageResult()` → Storage

**Q: What stages exist for document processing?**
A: Check cache → AI processing → markdown save → chunking → embedding → connection detection

**Q: Can I pause a job right now?**
A: No, only cancel. Pause feature is gap #1

**Q: How many job types are there?**
A: 7 total, but only 4 have full UI support

**Q: Are there database fields for retry?**
A: Yes (retry_count, max_retries, next_retry_at) but not used yet

---

**Last Updated**: October 15, 2025
**Coverage**: Very thorough (all major components and gaps identified)
**Estimated Time to Read**: 30 min (quick reference) to 2 hours (full architecture)
