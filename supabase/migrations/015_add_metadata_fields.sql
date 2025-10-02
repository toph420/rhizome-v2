-- Migration 013: Add enhanced metadata fields for 7-engine collision detection
-- Purpose: Support rich metadata extraction for sophisticated knowledge synthesis
-- Date: 2025-01-29

-- Add structural_metadata column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS structural_metadata JSONB;

-- Add emotional_metadata column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS emotional_metadata JSONB;

-- Add conceptual_metadata column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS conceptual_metadata JSONB;

-- Add method_metadata column (nullable for non-code chunks)
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS method_metadata JSONB;

-- Add narrative_metadata column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS narrative_metadata JSONB;

-- Add reference_metadata column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS reference_metadata JSONB;

-- Add domain_metadata column
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS domain_metadata JSONB;

-- Add quality_metadata column for tracking extraction quality
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS quality_metadata JSONB;

-- Add extraction timestamp
ALTER TABLE chunks 
ADD COLUMN IF NOT EXISTS metadata_extracted_at TIMESTAMPTZ;

-- Add indexes for JSONB queries (GIN indexes for efficient JSONB operations)
CREATE INDEX IF NOT EXISTS idx_chunks_structural_metadata ON chunks USING GIN (structural_metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_emotional_metadata ON chunks USING GIN (emotional_metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_conceptual_metadata ON chunks USING GIN (conceptual_metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_method_metadata ON chunks USING GIN (method_metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_narrative_metadata ON chunks USING GIN (narrative_metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_reference_metadata ON chunks USING GIN (reference_metadata);
CREATE INDEX IF NOT EXISTS idx_chunks_domain_metadata ON chunks USING GIN (domain_metadata);

-- Create index for quality filtering
CREATE INDEX IF NOT EXISTS idx_chunks_quality_completeness ON chunks ((quality_metadata->>'completeness'));

-- Create index for domain-based queries
CREATE INDEX IF NOT EXISTS idx_chunks_primary_domain ON chunks ((domain_metadata->>'primaryDomain'));

-- Create index for emotional polarity queries
CREATE INDEX IF NOT EXISTS idx_chunks_emotional_polarity ON chunks ((emotional_metadata->>'polarity'));

-- Add comment explaining the metadata structure
COMMENT ON COLUMN chunks.structural_metadata IS 'Structural patterns: headings, lists, tables, code blocks, sections';
COMMENT ON COLUMN chunks.emotional_metadata IS 'Emotional tone: sentiment, emotions, intensity, transitions';
COMMENT ON COLUMN chunks.conceptual_metadata IS 'Key concepts: entities, relationships, abstraction level';
COMMENT ON COLUMN chunks.method_metadata IS 'Method signatures for code chunks: functions, parameters, complexity';
COMMENT ON COLUMN chunks.narrative_metadata IS 'Writing style: rhythm, formality, technicality, fingerprint';
COMMENT ON COLUMN chunks.reference_metadata IS 'References: citations, URLs, cross-references, density';
COMMENT ON COLUMN chunks.domain_metadata IS 'Domain classification: primary/secondary domains, technical depth';
COMMENT ON COLUMN chunks.quality_metadata IS 'Extraction quality: completeness, errors, timing';
COMMENT ON COLUMN chunks.metadata_extracted_at IS 'Timestamp when metadata was last extracted';

-- Create a view for chunks with complete metadata (helper for queries)
CREATE OR REPLACE VIEW chunks_with_metadata AS
SELECT 
  c.*,
  (quality_metadata->>'completeness')::numeric as metadata_completeness,
  (emotional_metadata->>'polarity')::numeric as emotional_polarity,
  (domain_metadata->>'primaryDomain')::text as primary_domain,
  (narrative_metadata->'style'->>'technicality')::numeric as technicality,
  CASE 
    WHEN quality_metadata->>'completeness' IS NOT NULL 
    AND (quality_metadata->>'completeness')::numeric > 0.8 
    THEN true 
    ELSE false 
  END as has_quality_metadata
FROM chunks c;

-- Grant appropriate permissions
GRANT SELECT ON chunks_with_metadata TO authenticated;
GRANT SELECT ON chunks_with_metadata TO anon;

-- Add trigger to update metadata_extracted_at when metadata columns are updated
CREATE OR REPLACE FUNCTION update_metadata_extracted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.structural_metadata IS DISTINCT FROM NEW.structural_metadata OR
      OLD.emotional_metadata IS DISTINCT FROM NEW.emotional_metadata OR
      OLD.conceptual_metadata IS DISTINCT FROM NEW.conceptual_metadata OR
      OLD.method_metadata IS DISTINCT FROM NEW.method_metadata OR
      OLD.narrative_metadata IS DISTINCT FROM NEW.narrative_metadata OR
      OLD.reference_metadata IS DISTINCT FROM NEW.reference_metadata OR
      OLD.domain_metadata IS DISTINCT FROM NEW.domain_metadata OR
      OLD.quality_metadata IS DISTINCT FROM NEW.quality_metadata) THEN
    NEW.metadata_extracted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER update_metadata_extracted_at_trigger
BEFORE UPDATE ON chunks
FOR EACH ROW
EXECUTE FUNCTION update_metadata_extracted_at();

-- Migration verification query (can be run to check if migration succeeded)
DO $$ 
DECLARE 
  column_count INTEGER;
BEGIN 
  SELECT COUNT(*) INTO column_count 
  FROM information_schema.columns 
  WHERE table_name = 'chunks' 
  AND column_name IN (
    'structural_metadata', 'emotional_metadata', 'conceptual_metadata',
    'method_metadata', 'narrative_metadata', 'reference_metadata', 
    'domain_metadata', 'quality_metadata', 'metadata_extracted_at'
  );
  
  IF column_count = 9 THEN
    RAISE NOTICE 'Migration 013 completed successfully: All metadata columns added';
  ELSE
    RAISE EXCEPTION 'Migration 013 failed: Expected 9 columns, found %', column_count;
  END IF;
END $$;