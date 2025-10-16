-- Phase 3: Add pause/resume capability to background jobs
-- Supports job control: pause, resume, checkpoint tracking
-- Created: 2025-10-15

-- 1. Add pause/resume tracking fields
ALTER TABLE background_jobs
  ADD COLUMN paused_at TIMESTAMPTZ,
  ADD COLUMN resumed_at TIMESTAMPTZ,
  ADD COLUMN pause_reason TEXT,
  ADD COLUMN resume_count INTEGER DEFAULT 0;

-- 2. Add checkpoint tracking fields
ALTER TABLE background_jobs
  ADD COLUMN last_checkpoint_path TEXT,
  ADD COLUMN last_checkpoint_stage TEXT,
  ADD COLUMN checkpoint_hash TEXT;

-- 3. Update status constraint to include 'paused'
ALTER TABLE background_jobs
  DROP CONSTRAINT IF EXISTS background_jobs_status_check;

ALTER TABLE background_jobs
  ADD CONSTRAINT background_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'paused', 'completed', 'failed', 'cancelled'));

-- 4. Add index for paused jobs queries
CREATE INDEX idx_background_jobs_paused
  ON background_jobs(status, paused_at)
  WHERE status = 'paused';

-- 5. Add index for checkpoint queries
CREATE INDEX idx_background_jobs_checkpoint
  ON background_jobs(last_checkpoint_path)
  WHERE last_checkpoint_path IS NOT NULL;

-- 6. Add comments for documentation
COMMENT ON COLUMN background_jobs.paused_at IS
  'Timestamp when job was paused by user or system';

COMMENT ON COLUMN background_jobs.resumed_at IS
  'Timestamp when job was last resumed from paused state';

COMMENT ON COLUMN background_jobs.pause_reason IS
  'Reason for pause (e.g., "User requested pause", "System maintenance")';

COMMENT ON COLUMN background_jobs.resume_count IS
  'Number of times job has been resumed (0 = never paused)';

COMMENT ON COLUMN background_jobs.last_checkpoint_path IS
  'Storage path to last successful checkpoint (e.g., "documents/{userId}/{docId}/stage-chunking.json")';

COMMENT ON COLUMN background_jobs.last_checkpoint_stage IS
  'Processing stage of last checkpoint (e.g., "extraction", "chunking", "embedding")';

COMMENT ON COLUMN background_jobs.checkpoint_hash IS
  'Hash of checkpoint data for validation on resume (detects corruption)';
