-- Migration 034: Obsidian Settings and User Preferences
-- Create user_settings table for Obsidian vault configuration
-- Purpose: Store user preferences for Obsidian sync and other settings

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  obsidian_settings JSONB,
  preferences JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one settings row per user
  UNIQUE(user_id)
);

-- Create index for fast user lookups
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- Add updated_at trigger
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_settings IS 'User-specific settings for Obsidian integration and general preferences';
COMMENT ON COLUMN user_settings.obsidian_settings IS 'Obsidian vault configuration. Example: {vaultName: "MyVault", vaultPath: "/path/to/vault", autoSync: true, syncAnnotations: true, exportPath: "Rhizome/"}';
COMMENT ON COLUMN user_settings.preferences IS 'General user preferences. Can include annotation colors, default views, etc.';

-- Insert default settings for existing dev user
INSERT INTO user_settings (user_id, obsidian_settings, preferences)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '{
    "vaultName": null,
    "vaultPath": null,
    "autoSync": false,
    "syncAnnotations": true,
    "exportPath": "Rhizome/"
  }'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (user_id) DO NOTHING;

-- RLS Policies (currently disabled for dev, but ready for production)
-- POLICY: Users can only view/edit their own settings
-- This will be enabled when real auth is implemented
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
