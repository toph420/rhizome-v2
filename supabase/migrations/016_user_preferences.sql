-- Migration: User Preferences for Collision Detection Engine Weights
-- Purpose: Store user-configurable weights for 7-engine collision detection system
-- Author: Rhizome Team
-- Date: 2025-09-29

-- Create user_preferences table for storing engine weight configurations
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Engine weight configuration (stored as JSONB for flexibility)
  engine_weights JSONB NOT NULL DEFAULT '{
    "semantic-similarity": 0.25,
    "structural-pattern": 0.15,
    "temporal-proximity": 0.1,
    "conceptual-density": 0.2,
    "emotional-resonance": 0.05,
    "citation-network": 0.15,
    "contradiction-detection": 0.1
  }'::JSONB,
  
  -- Normalization method for score calculation
  normalization_method TEXT NOT NULL DEFAULT 'linear' CHECK (
    normalization_method IN ('linear', 'sigmoid', 'softmax')
  ),
  
  -- Preset template reference (optional)
  preset_name TEXT CHECK (
    preset_name IN ('balanced', 'academic', 'narrative', 'analytical', 'custom')
  ),
  
  -- Custom preset storage for user-created templates
  custom_presets JSONB DEFAULT '[]'::JSONB,
  
  -- Settings metadata
  last_modified TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure one preference set per user
  UNIQUE(user_id)
);

-- Create index for fast user lookups
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Create index on last_modified for sorting and cache invalidation
CREATE INDEX idx_user_preferences_modified ON user_preferences(last_modified DESC);

-- Add trigger to update last_modified timestamp
CREATE OR REPLACE FUNCTION update_user_preferences_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_user_preferences_modified
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_modified();

-- Add constraint to ensure engine weights sum to approximately 1.0
-- Using a CHECK constraint with tolerance for floating-point precision
ALTER TABLE user_preferences
ADD CONSTRAINT check_weights_sum CHECK (
  ABS(
    (engine_weights->>'semantic-similarity')::NUMERIC +
    (engine_weights->>'structural-pattern')::NUMERIC +
    (engine_weights->>'temporal-proximity')::NUMERIC +
    (engine_weights->>'conceptual-density')::NUMERIC +
    (engine_weights->>'emotional-resonance')::NUMERIC +
    (engine_weights->>'citation-network')::NUMERIC +
    (engine_weights->>'contradiction-detection')::NUMERIC
    - 1.0
  ) <= 0.01
);

-- Create function to get user preferences with defaults
CREATE OR REPLACE FUNCTION get_user_preferences(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  engine_weights JSONB,
  normalization_method TEXT,
  preset_name TEXT,
  custom_presets JSONB,
  last_modified TIMESTAMPTZ
) AS $$
BEGIN
  -- Return existing preferences or create default ones
  RETURN QUERY
  SELECT 
    up.id,
    up.user_id,
    up.engine_weights,
    up.normalization_method,
    up.preset_name,
    up.custom_presets,
    up.last_modified
  FROM user_preferences up
  WHERE up.user_id = p_user_id;
  
  -- If no preferences found, insert defaults and return them
  IF NOT FOUND THEN
    INSERT INTO user_preferences (user_id)
    VALUES (p_user_id)
    RETURNING
      user_preferences.id,
      user_preferences.user_id,
      user_preferences.engine_weights,
      user_preferences.normalization_method,
      user_preferences.preset_name,
      user_preferences.custom_presets,
      user_preferences.last_modified
    INTO id, user_id, engine_weights, normalization_method, preset_name, custom_presets, last_modified;
    
    RETURN NEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate and update engine weights
CREATE OR REPLACE FUNCTION update_engine_weights(
  p_user_id UUID,
  p_weights JSONB,
  p_normalization_method TEXT DEFAULT NULL,
  p_preset_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sum NUMERIC;
  v_normalized_weights JSONB;
BEGIN
  -- Calculate sum of weights
  v_sum := (
    (p_weights->>'semantic-similarity')::NUMERIC +
    (p_weights->>'structural-pattern')::NUMERIC +
    (p_weights->>'temporal-proximity')::NUMERIC +
    (p_weights->>'conceptual-density')::NUMERIC +
    (p_weights->>'emotional-resonance')::NUMERIC +
    (p_weights->>'citation-network')::NUMERIC +
    (p_weights->>'contradiction-detection')::NUMERIC
  );
  
  -- Normalize weights if sum is not 1
  IF ABS(v_sum - 1.0) > 0.01 THEN
    v_normalized_weights := jsonb_build_object(
      'semantic-similarity', ((p_weights->>'semantic-similarity')::NUMERIC / v_sum)::NUMERIC(3,3),
      'structural-pattern', ((p_weights->>'structural-pattern')::NUMERIC / v_sum)::NUMERIC(3,3),
      'temporal-proximity', ((p_weights->>'temporal-proximity')::NUMERIC / v_sum)::NUMERIC(3,3),
      'conceptual-density', ((p_weights->>'conceptual-density')::NUMERIC / v_sum)::NUMERIC(3,3),
      'emotional-resonance', ((p_weights->>'emotional-resonance')::NUMERIC / v_sum)::NUMERIC(3,3),
      'citation-network', ((p_weights->>'citation-network')::NUMERIC / v_sum)::NUMERIC(3,3),
      'contradiction-detection', ((p_weights->>'contradiction-detection')::NUMERIC / v_sum)::NUMERIC(3,3)
    );
  ELSE
    v_normalized_weights := p_weights;
  END IF;
  
  -- Update or insert preferences
  INSERT INTO user_preferences (
    user_id, 
    engine_weights, 
    normalization_method,
    preset_name
  )
  VALUES (
    p_user_id, 
    v_normalized_weights,
    COALESCE(p_normalization_method, 'linear'),
    p_preset_name
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    engine_weights = v_normalized_weights,
    normalization_method = COALESCE(p_normalization_method, user_preferences.normalization_method),
    preset_name = COALESCE(p_preset_name, EXCLUDED.preset_name);
  
  RETURN v_normalized_weights;
END;
$$ LANGUAGE plpgsql;

-- Create function to save custom preset
CREATE OR REPLACE FUNCTION save_custom_preset(
  p_user_id UUID,
  p_preset_name TEXT,
  p_preset_config JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_presets JSONB;
  v_updated_presets JSONB;
BEGIN
  -- Get existing custom presets
  SELECT custom_presets INTO v_existing_presets
  FROM user_preferences
  WHERE user_id = p_user_id;
  
  -- If no preferences exist, create them
  IF v_existing_presets IS NULL THEN
    INSERT INTO user_preferences (user_id, custom_presets)
    VALUES (p_user_id, '[]'::JSONB)
    RETURNING custom_presets INTO v_existing_presets;
  END IF;
  
  -- Remove existing preset with same name if it exists
  v_updated_presets := (
    SELECT jsonb_agg(preset)
    FROM jsonb_array_elements(v_existing_presets) AS preset
    WHERE preset->>'name' != p_preset_name
  );
  
  -- Add new/updated preset
  v_updated_presets := COALESCE(v_updated_presets, '[]'::JSONB) || 
    jsonb_build_object(
      'name', p_preset_name,
      'config', p_preset_config,
      'created_at', NOW()
    );
  
  -- Update user preferences
  UPDATE user_preferences
  SET custom_presets = v_updated_presets
  WHERE user_id = p_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON TABLE user_preferences IS 'Stores user-configurable weights for the 7-engine collision detection system';
COMMENT ON COLUMN user_preferences.engine_weights IS 'JSON object containing weight values (0-1) for each detection engine';
COMMENT ON COLUMN user_preferences.normalization_method IS 'Method used to normalize scores: linear, sigmoid, or softmax';
COMMENT ON COLUMN user_preferences.preset_name IS 'Reference to a predefined weight configuration template';
COMMENT ON COLUMN user_preferences.custom_presets IS 'Array of user-created preset configurations';