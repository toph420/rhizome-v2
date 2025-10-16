-- Add updated_at column to background_jobs for heartbeat tracking
-- Supports Phase 2: Visual Progress Updates (heartbeat mechanism)

ALTER TABLE background_jobs
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for efficient heartbeat queries (jobs updated recently)
CREATE INDEX idx_background_jobs_updated_at ON background_jobs(updated_at DESC)
  WHERE status IN ('pending', 'processing');

-- Add trigger to auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_background_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER background_jobs_updated_at_trigger
  BEFORE UPDATE ON background_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_background_jobs_updated_at();

-- Add comment for documentation
COMMENT ON COLUMN background_jobs.updated_at IS
  'Timestamp of last update (auto-updated by trigger). Used for heartbeat indicator in UI (green pulse shows job updated within 10s).';
