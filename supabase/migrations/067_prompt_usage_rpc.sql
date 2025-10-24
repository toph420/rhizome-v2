-- RPC function to increment prompt usage atomically
CREATE OR REPLACE FUNCTION increment_prompt_usage(prompt_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE prompt_templates
  SET
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE id = prompt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION increment_prompt_usage TO authenticated;
