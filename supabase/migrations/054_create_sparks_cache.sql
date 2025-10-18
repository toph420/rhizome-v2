-- Migration 054: Sparks query cache
--
-- CRITICAL: This table is NOT source of truth.
-- Source of truth: Storage JSON files at {userId}/sparks/{sparkId}/content.json
-- This table: Denormalized cache for fast timeline/search queries only
--
-- Rebuild process:
-- 1. DELETE FROM sparks_cache WHERE user_id = ?
-- 2. Read all Storage JSON files
-- 3. INSERT denormalized rows
--
-- Loss of this table = zero data loss (rebuild from Storage)

CREATE TABLE IF NOT EXISTS sparks_cache (
  -- Reference to ECS entity
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Denormalized for queries (copied from Storage JSON)
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,

  -- Origin tracking (for filtering)
  origin_chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Search optimization
  tags TEXT[] DEFAULT '{}',
  embedding vector(768),

  -- Storage reference (for integrity checks)
  storage_path TEXT NOT NULL, -- '{userId}/sparks/{sparkId}/content.json'

  -- Timestamps
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sparks_cache_user_time
  ON sparks_cache(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sparks_cache_origin
  ON sparks_cache(origin_chunk_id)
  WHERE origin_chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sparks_cache_document
  ON sparks_cache(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sparks_cache_tags
  ON sparks_cache USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_sparks_cache_embedding
  ON sparks_cache USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search on content
CREATE INDEX IF NOT EXISTS idx_sparks_cache_content_fts
  ON sparks_cache USING gin(to_tsvector('english', content));

-- Enable RLS
ALTER TABLE sparks_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies (users see only their sparks)
CREATE POLICY "Users view own sparks cache"
  ON sparks_cache FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own sparks cache"
  ON sparks_cache FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own sparks cache"
  ON sparks_cache FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own sparks cache"
  ON sparks_cache FOR DELETE
  USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE sparks_cache IS
  'CACHE ONLY - NOT SOURCE OF TRUTH.

  Source: {userId}/sparks/{sparkId}/content.json in Storage
  Purpose: Fast timeline/search queries only
  Rebuild: DELETE + re-insert from Storage JSON
  Data loss: Zero (fully rebuildable)

  This table can be dropped and rebuilt at any time.';

COMMENT ON COLUMN sparks_cache.entity_id IS
  'References entities table. Spark data in components table with component_type=spark.';

COMMENT ON COLUMN sparks_cache.storage_path IS
  'Path to source JSON in Storage. Used for integrity verification and rebuilds.';

COMMENT ON COLUMN sparks_cache.cached_at IS
  'When this cache row was last rebuilt from Storage.';
