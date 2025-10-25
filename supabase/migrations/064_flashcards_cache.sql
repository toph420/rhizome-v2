-- Migration 064: Flashcards Cache Table
-- Purpose: Denormalized cache for fast study queries
-- Source of Truth: Storage JSON files at {userId}/flashcards/{cardId}.json
-- Pattern: Exactly like sparks_cache at supabase/migrations/054_create_sparks_cache.sql

-- CRITICAL: This table is NOT source of truth.
-- Source of truth: Storage JSON files at {userId}/flashcards/{cardId}.json
-- This table: Denormalized cache for fast study queries only
-- Rebuild process: DELETE + re-insert from Storage JSON

CREATE TABLE IF NOT EXISTS flashcards_cache (
  -- Reference to ECS entity
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Denormalized card data (copied from Storage JSON)
  card_type TEXT NOT NULL,  -- 'basic' | 'cloze'
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  content TEXT,  -- For cloze
  cloze_index INTEGER,
  cloze_count INTEGER,

  -- Status
  status TEXT NOT NULL,  -- 'draft' | 'active' | 'suspended'

  -- Deck assignment
  deck_id UUID REFERENCES decks(id) ON DELETE SET NULL,
  deck_added_at TIMESTAMPTZ,

  -- SRS state (denormalized for query performance)
  next_review TIMESTAMPTZ,
  last_review TIMESTAMPTZ,
  stability FLOAT,
  difficulty FLOAT,
  reps INTEGER,
  lapses INTEGER,
  srs_state INTEGER,  -- 0=New, 1=Learning, 2=Review, 3=Relearning
  is_mature BOOLEAN,  -- TRUE when stability > 21 days

  -- Source tracking
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  chunk_ids UUID[],
  connection_id UUID,
  annotation_id UUID,
  generation_job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,

  -- Search optimization
  tags TEXT[] DEFAULT '{}',

  -- Storage reference (for integrity checks)
  storage_path TEXT NOT NULL,  -- '{userId}/flashcards/{cardId}.json'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_flashcards_cache_user_time
  ON flashcards_cache(user_id, created_at DESC);

CREATE INDEX idx_flashcards_cache_deck
  ON flashcards_cache(deck_id)
  WHERE deck_id IS NOT NULL;

CREATE INDEX idx_flashcards_cache_status
  ON flashcards_cache(user_id, status);

-- Study query: due cards
CREATE INDEX idx_flashcards_cache_due
  ON flashcards_cache(user_id, next_review)
  WHERE status = 'active' AND next_review IS NOT NULL;

-- Filter by tags
CREATE INDEX idx_flashcards_cache_tags
  ON flashcards_cache USING gin(tags);

-- Disable RLS (service role has full access - personal tool pattern)
ALTER TABLE flashcards_cache DISABLE ROW LEVEL SECURITY;

-- Comments
COMMENT ON TABLE flashcards_cache IS
  'CACHE ONLY - NOT SOURCE OF TRUTH.

  Source: {userId}/flashcards/{cardId}.json in Storage
  Purpose: Fast study queries only
  Rebuild: DELETE + re-insert from Storage JSON
  Data loss: Zero (fully rebuildable)

  This table can be dropped and rebuilt at any time.';

COMMENT ON COLUMN flashcards_cache.entity_id IS
  'References entities table. Flashcard data in components table with component_type=Card.';

COMMENT ON COLUMN flashcards_cache.storage_path IS
  'Path to source JSON in Storage. Used for integrity verification and rebuilds.';

COMMENT ON COLUMN flashcards_cache.cached_at IS
  'When this cache row was last rebuilt from Storage.';
