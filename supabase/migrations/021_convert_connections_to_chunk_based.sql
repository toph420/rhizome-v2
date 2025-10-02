-- Convert connections table from entity-based to chunk-based
-- Connections are the atomic unit of the system per APP_VISION.md

-- Drop the existing entity-based connections table
DROP TABLE IF EXISTS connections CASCADE;

-- Create chunk-based connections table
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chunk references (the atomic unit)
  source_chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  target_chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,

  -- Connection metadata
  connection_type TEXT NOT NULL CHECK (connection_type IN (
    'semantic_similarity',
    'contradiction_detection',
    'thematic_bridge'
  )),
  strength FLOAT NOT NULL CHECK (strength >= 0 AND strength <= 1),
  auto_detected BOOLEAN NOT NULL DEFAULT TRUE,
  user_validated BOOLEAN DEFAULT NULL,  -- NULL = not reviewed, true/false = user decision

  -- Discovery tracking
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,

  -- Constraints
  CONSTRAINT connections_no_self_reference CHECK (source_chunk_id != target_chunk_id),
  CONSTRAINT connections_unique_pair UNIQUE (source_chunk_id, target_chunk_id, connection_type)
);

-- Indexes for fast lookups
CREATE INDEX idx_connections_source ON connections(source_chunk_id);
CREATE INDEX idx_connections_target ON connections(target_chunk_id);
CREATE INDEX idx_connections_type ON connections(connection_type);
CREATE INDEX idx_connections_strength ON connections(strength) WHERE strength >= 0.6;

-- Bidirectional lookup (find all connections for a chunk)
CREATE INDEX idx_connections_bidirectional ON connections(source_chunk_id, target_chunk_id);

-- Index for user validation filtering
CREATE INDEX idx_connections_validated ON connections(user_validated) WHERE user_validated IS NOT NULL;

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can view connections for their own chunks
CREATE POLICY "Users can view their own connections"
  ON connections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.id = connections.source_chunk_id
      AND d.user_id = auth.uid()
    )
  );

-- RLS policy: Users can insert connections for their own chunks
CREATE POLICY "Users can create connections for their chunks"
  ON connections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.id = connections.source_chunk_id
      AND d.user_id = auth.uid()
    )
  );

-- RLS policy: Users can update validation on their connections
CREATE POLICY "Users can validate their own connections"
  ON connections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.id = connections.source_chunk_id
      AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE c.id = connections.source_chunk_id
      AND d.user_id = auth.uid()
    )
  );

-- Comments for documentation
COMMENT ON TABLE connections IS 'Chunk-to-chunk connections detected by 3-engine system (semantic_similarity, contradiction_detection, thematic_bridge)';
COMMENT ON COLUMN connections.connection_type IS 'Engine that detected this connection: semantic_similarity | contradiction_detection | thematic_bridge';
COMMENT ON COLUMN connections.strength IS 'Connection strength score from 0 (weak) to 1 (strong)';
COMMENT ON COLUMN connections.user_validated IS 'NULL=not reviewed, true=confirmed by user, false=rejected by user';
COMMENT ON COLUMN connections.metadata IS 'Engine-specific metadata (raw_similarity, importance_score, threshold_used, engine_version, etc.)';
