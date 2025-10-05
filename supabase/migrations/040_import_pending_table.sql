-- Migration: 040_import_pending_table.sql
-- Purpose: Store pending Readwise import highlights for manual review
-- Created: 2025-10-05

-- ============================================================================
-- IMPORT PENDING TABLE
-- ============================================================================

CREATE TABLE import_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  document_id UUID REFERENCES documents ON DELETE CASCADE NOT NULL,

  -- Import source
  source TEXT NOT NULL, -- 'readwise_reader' | 'readwise_export'

  -- Original Readwise highlight data
  highlight_data JSONB NOT NULL,
  -- Structure: { text, note?, color?, location?, highlighted_at, book_id?, title?, author? }

  -- Suggested fuzzy match from worker
  suggested_match JSONB NOT NULL,
  -- Structure: { text, startOffset, endOffset, confidence, method }

  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_entity_id UUID REFERENCES entities ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query pattern: Get pending imports for a document
CREATE INDEX idx_import_pending_user_doc_status
  ON import_pending(user_id, document_id, status);

-- Query by status for batch operations
CREATE INDEX idx_import_pending_status
  ON import_pending(status)
  WHERE status = 'pending';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE import_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pending imports" ON import_pending
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_import_pending_updated_at
  BEFORE UPDATE ON import_pending
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE import_pending IS
  'Stores fuzzy-matched Readwise highlights pending manual review.
   Confidence range: 0.7-0.8 (below 0.7 = failed, above 0.8 = auto-accepted).
   After review, creates annotation entity and updates created_entity_id.';

COMMENT ON COLUMN import_pending.highlight_data IS
  'Original Readwise highlight data (text, note, color, location, etc.)';

COMMENT ON COLUMN import_pending.suggested_match IS
  'Fuzzy match result from worker (text, offsets, confidence, method)';

COMMENT ON COLUMN import_pending.confidence IS
  'Match confidence score (0.7-0.8 range for manual review)';

COMMENT ON COLUMN import_pending.status IS
  'Review status: pending (needs review), accepted (created annotation), rejected (discarded)';
