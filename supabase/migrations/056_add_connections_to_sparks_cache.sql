-- Migration 056: Add connections to sparks_cache
--
-- Purpose: Store spark connections in cache for UI display
-- Connections are stored as JSONB array matching SparkConnection[] type
--
-- Structure:
-- {
--   "chunkId": "uuid",
--   "type": "origin" | "mention" | "inherited",
--   "strength": 0.0-1.0,
--   "metadata": { optional fields }
-- }
--
-- This is denormalized cache data - source of truth remains in:
-- 1. ECS components table (spark component)
-- 2. Storage JSON files ({userId}/sparks/{sparkId}/content.json)

-- Add connections column as JSONB array
ALTER TABLE sparks_cache
ADD COLUMN connections JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for connections querying (e.g., find sparks connected to chunk X)
CREATE INDEX IF NOT EXISTS idx_sparks_cache_connections
  ON sparks_cache USING gin(connections);

-- Add comment explaining the structure
COMMENT ON COLUMN sparks_cache.connections IS
  'JSONB array of SparkConnection objects.

  Structure: [
    {
      "chunkId": "uuid",
      "type": "origin" | "mention" | "inherited",
      "strength": number,
      "metadata": { optional fields }
    }
  ]

  Connection types:
  - origin (1.0): Chunk where spark was created
  - mention (0.9): Chunks explicitly referenced in content
  - inherited (0.6-0.7): Connections from origin chunk

  Source of truth: Storage JSON and ECS components table.
  This is cache only - rebuildable from source.';
