-- Migration 065: Study Sessions Table
-- Purpose: Track study session stats and analytics

CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Session context
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,  -- NULL for filtered study
  filters_applied JSONB,  -- {tags: ['philosophy'], dateRange: {...}}

  -- Session timing
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,

  -- Session stats
  cards_reviewed INTEGER DEFAULT 0,
  ratings JSONB DEFAULT '{"again": 0, "hard": 0, "good": 0, "easy": 0}',
  total_time_ms INTEGER DEFAULT 0,
  average_time_per_card_ms INTEGER
);

-- Indexes
CREATE INDEX idx_study_sessions_user ON study_sessions(user_id);
CREATE INDEX idx_study_sessions_started ON study_sessions(started_at DESC);
CREATE INDEX idx_study_sessions_deck ON study_sessions(deck_id) WHERE deck_id IS NOT NULL;

-- Enable RLS
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users view own study sessions"
  ON study_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own study sessions"
  ON study_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own study sessions"
  ON study_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Helper function to update session stats
CREATE OR REPLACE FUNCTION update_study_session(
  p_session_id UUID,
  p_rating INTEGER,
  p_time_ms INTEGER
)
RETURNS void AS $$
DECLARE
  v_rating_key TEXT;
BEGIN
  -- Map rating to key
  v_rating_key := CASE p_rating
    WHEN 1 THEN 'again'
    WHEN 2 THEN 'hard'
    WHEN 3 THEN 'good'
    WHEN 4 THEN 'easy'
  END;

  -- Update session stats
  UPDATE study_sessions
  SET
    cards_reviewed = cards_reviewed + 1,
    ratings = jsonb_set(
      ratings,
      ARRAY[v_rating_key],
      to_jsonb((ratings->>v_rating_key)::INTEGER + 1)
    ),
    total_time_ms = total_time_ms + p_time_ms,
    average_time_per_card_ms = (total_time_ms + p_time_ms) / (cards_reviewed + 1)
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE study_sessions IS 'Study session tracking for analytics and stats.';
