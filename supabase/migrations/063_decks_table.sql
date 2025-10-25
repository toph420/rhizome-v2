-- Migration 063: Decks Table
-- Purpose: Hierarchical deck organization with system decks (Inbox, Archive)
-- Pattern: Regular table (NOT ECS)

-- Drop existing decks table and dependencies
DROP TABLE IF EXISTS entity_decks CASCADE;
DROP TABLE IF EXISTS study_sessions CASCADE;
DROP TABLE IF EXISTS decks CASCADE;

CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,

  -- Deck metadata
  name TEXT NOT NULL,
  description TEXT,

  -- Hierarchical structure
  parent_id UUID REFERENCES decks(id) ON DELETE CASCADE,  -- NULL for root decks

  -- System decks (Inbox, Archive)
  is_system BOOLEAN DEFAULT FALSE,  -- Cannot delete system decks

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_decks_user ON decks(user_id);
CREATE INDEX idx_decks_parent ON decks(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_decks_system ON decks(user_id, is_system) WHERE is_system = TRUE;

-- Enable RLS
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

-- RLS policies (users see only their decks)
CREATE POLICY "Users view own decks"
  ON decks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own decks"
  ON decks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own decks"
  ON decks FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own non-system decks"
  ON decks FOR DELETE
  USING (user_id = auth.uid() AND is_system = FALSE);

-- Updated_at trigger
CREATE TRIGGER update_decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE decks IS 'Hierarchical flashcard deck organization. System decks (Inbox, Archive) created on user signup.';
COMMENT ON COLUMN decks.parent_id IS 'Parent deck ID for nested structure. NULL for root decks.';
COMMENT ON COLUMN decks.is_system IS 'TRUE for Inbox/Archive decks. System decks cannot be deleted.';
