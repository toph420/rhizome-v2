-- Migration 048: Add chunk validation and correction system
-- Supports LOCAL mode quality assurance workflow for reviewing and correcting chunk positions

-- Add validation warning text (human-readable message)
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS validation_warning TEXT;

-- Add validation details (structured metadata)
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS validation_details JSONB;

-- Add flag for overlap-corrected chunks
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS overlap_corrected BOOLEAN DEFAULT FALSE;

-- Add flag for user-validated/corrected positions
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS position_corrected BOOLEAN DEFAULT FALSE;

-- Add correction history (audit trail)
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS correction_history JSONB DEFAULT '[]'::JSONB;

-- Create indexes for efficient querying

-- Index for finding chunks that need validation
-- Supports: WHERE validation_warning IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_chunks_needs_validation
  ON chunks (document_id, validation_warning)
  WHERE validation_warning IS NOT NULL;

-- Index for finding overlap-corrected chunks
-- Supports: WHERE overlap_corrected = TRUE
CREATE INDEX IF NOT EXISTS idx_chunks_overlap_corrected
  ON chunks (document_id, overlap_corrected)
  WHERE overlap_corrected = TRUE;

-- Add column documentation
COMMENT ON COLUMN chunks.validation_warning IS
  'Human-readable validation warning (e.g., "Overlap correction: [500, 700] → [550, 700]")';

COMMENT ON COLUMN chunks.validation_details IS
  'Structured validation metadata with type, offsets, confidence changes, etc.';

COMMENT ON COLUMN chunks.overlap_corrected IS
  'TRUE if chunk offsets were adjusted during bulletproof matching to prevent overlap';

COMMENT ON COLUMN chunks.position_corrected IS
  'TRUE if user has validated or manually corrected chunk position';

COMMENT ON COLUMN chunks.correction_history IS
  'Array of correction history entries with timestamps, offsets, and reasons';
