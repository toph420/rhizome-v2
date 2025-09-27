-- Generic job tracking table for background processing
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  
  -- Job type discrimination
  job_type TEXT NOT NULL,  -- 'process_document', 'detect_connections', etc.
  entity_type TEXT,         -- 'document', 'deck', 'spark'
  entity_id UUID,
  
  -- Job state
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  progress JSONB DEFAULT '{}',   -- { stage: 'extract', percent: 30, stage_data: {...} }
  input_data JSONB DEFAULT '{}', -- Job-specific parameters
  
  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient polling
CREATE INDEX idx_background_jobs_status ON background_jobs(status);
CREATE INDEX idx_background_jobs_user ON background_jobs(user_id);
CREATE INDEX idx_background_jobs_entity ON background_jobs(entity_type, entity_id);
CREATE INDEX idx_background_jobs_retry ON background_jobs(status, next_retry_at) 
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Enable Realtime for frontend subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE background_jobs;