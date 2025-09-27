# Archived Edge Functions

This directory contains Edge Functions that have been replaced by other implementations.

## process-document

**Status**: Archived on 2025-09-26  
**Reason**: Replaced by background worker system

The `process-document` Edge Function has been migrated to a background worker architecture to eliminate timeout limitations (150s limit) and enable processing of documents of any size.

### Migration Details

- **Old**: Synchronous Edge Function with 150s timeout limit
- **New**: Asynchronous background worker with unlimited processing time
- **Location**: `worker/handlers/process-document.ts`

### Key Improvements

1. **No Timeout Limits**: Process documents of any size (500+ pages, 2+ hour processing)
2. **Real-time Progress**: Live updates via Supabase Realtime subscriptions
3. **Graceful Failure Recovery**: Stage-based checkpoints allow resume from failure
4. **Progressive Availability**: Users can read markdown while embeddings generate
5. **Auto-retry**: Transient errors (rate limits, network) automatically retry with exponential backoff

### Architecture

The new system uses:
- `background_jobs` table for job tracking
- Background worker polling for pending jobs
- 5-stage processing pipeline (download → extract → save_markdown → embed → complete)
- Checkpoint system at save_markdown stage
- Progress tracking with percent and stage info

See `PRPs/background-processing-system.md` for complete implementation details.

### Emergency Fallback

This archived function is kept for reference and potential emergency fallback. To use:
1. Move back to `supabase/functions/process-document/`
2. Update `src/app/actions/documents.ts` to invoke function instead of creating background job
3. Restart Edge Functions server

**Note**: Using the archived function will reintroduce the 150s timeout limitation.