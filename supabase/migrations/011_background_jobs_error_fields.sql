-- Add error classification fields to background_jobs table
-- Enables format-specific error handling and recovery guidance

ALTER TABLE background_jobs
  ADD COLUMN error_type TEXT,
  ADD COLUMN error_message TEXT;

-- Add constraint for error_type enum
ALTER TABLE background_jobs
  ADD CONSTRAINT background_jobs_error_type_check
  CHECK (error_type IN ('transient', 'permanent', 'paywall', 'invalid') OR error_type IS NULL);

-- Add index for querying jobs by error type
CREATE INDEX idx_background_jobs_error_type ON background_jobs(error_type)
  WHERE error_type IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN background_jobs.error_type IS 
  'Classification of error: transient (retry), permanent (fail), paywall (suggest archive), invalid (validation)';
COMMENT ON COLUMN background_jobs.error_message IS 
  'User-friendly error message with recovery guidance';