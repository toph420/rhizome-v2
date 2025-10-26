-- Obsidian Sync State Table
-- Tracks vault sync status and conflict detection

CREATE TABLE obsidian_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Vault paths
  vault_path TEXT NOT NULL,  -- Relative path in vault (e.g., "Documents/Gravity's Rainbow/content.md")

  -- Hash tracking (SHA-256, first 16 chars)
  vault_hash TEXT,           -- Hash of content.md in vault
  storage_hash TEXT,         -- Hash of content.md in Storage

  -- Timestamps
  vault_modified_at TIMESTAMPTZ,
  storage_modified_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,

  -- Sync metadata
  last_sync_direction TEXT CHECK (last_sync_direction IN ('vault_to_storage', 'storage_to_vault')),
  conflict_state TEXT DEFAULT 'none' CHECK (conflict_state IN ('none', 'detected', 'resolved')),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(document_id)
);

-- Indexes
CREATE INDEX idx_obsidian_sync_state_user_id ON obsidian_sync_state(user_id);
CREATE INDEX idx_obsidian_sync_state_document_id ON obsidian_sync_state(document_id);
CREATE INDEX idx_obsidian_sync_state_conflict_state ON obsidian_sync_state(conflict_state) WHERE conflict_state = 'detected';

-- RLS Policies
ALTER TABLE obsidian_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own sync state"
  ON obsidian_sync_state FOR ALL
  USING (user_id = auth.uid());

-- Updated at trigger
CREATE TRIGGER update_obsidian_sync_state_updated_at
  BEFORE UPDATE ON obsidian_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE obsidian_sync_state IS 'Tracks Obsidian vault sync state for bi-directional sync and conflict detection';
COMMENT ON COLUMN obsidian_sync_state.vault_hash IS 'SHA-256 hash (first 16 chars) of content.md in vault';
COMMENT ON COLUMN obsidian_sync_state.storage_hash IS 'SHA-256 hash (first 16 chars) of content.md in Storage';
COMMENT ON COLUMN obsidian_sync_state.conflict_state IS 'none: no conflict, detected: both changed, resolved: user resolved';
