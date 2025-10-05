-- Migration 038: Connection Validation Enhancement
-- Add starring and timestamp to existing validation system
--
-- Note: user_validated column already exists from migration 021
--
-- Design: Star = Validate + Important
-- - user_validated = true: Connection is useful (validate or star)
-- - user_validated = false: Connection rejected
-- - user_validated = null: Not yet reviewed
-- - user_starred = true: Important connection (implies validated)
--
-- Recovery queries use: WHERE user_validated = true (includes both validated and starred)

-- Add missing columns (user_validated already exists from migration 021)
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS user_starred BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

-- Index for starred connections (for future "show starred only" feature)
-- Note: idx_connections_validated already exists from migration 021 for user_validated
CREATE INDEX IF NOT EXISTS idx_connections_user_starred
  ON connections(user_starred)
  WHERE user_starred = true;

-- Comments for documentation
COMMENT ON COLUMN connections.user_starred IS
  'True = starred (important connection, implies validated), False = only validated or rejected. Star is subset of validate.';

COMMENT ON COLUMN connections.validated_at IS
  'Timestamp when user provided feedback (validate, reject, or star). Used for learning system analysis.';
