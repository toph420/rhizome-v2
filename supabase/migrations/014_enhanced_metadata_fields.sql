-- Enhanced metadata fields for 7-engine collision detection
-- Adds comprehensive metadata storage for sophisticated knowledge synthesis

-- Add metadata JSONB column to chunks table
ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create GIN index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_chunks_metadata 
  ON chunks USING GIN (metadata);

-- Functional indexes for common metadata queries

-- Emotional metadata indexes
CREATE INDEX IF NOT EXISTS idx_chunks_primary_emotion 
  ON chunks((metadata->'emotional'->>'primaryEmotion'))
  WHERE metadata->'emotional' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_emotional_polarity 
  ON chunks(((metadata->'emotional'->>'polarity')::float))
  WHERE metadata->'emotional' IS NOT NULL;

-- Domain metadata indexes
CREATE INDEX IF NOT EXISTS idx_chunks_primary_domain 
  ON chunks((metadata->'domain'->>'primaryDomain'))
  WHERE metadata->'domain' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chunks_technical_depth 
  ON chunks(((metadata->'domain'->>'technicalDepth')::float))
  WHERE metadata->'domain' IS NOT NULL;

-- Quality metadata indexes
CREATE INDEX IF NOT EXISTS idx_chunks_metadata_completeness 
  ON chunks(((metadata->'quality'->>'completeness')::float))
  WHERE metadata->'quality' IS NOT NULL;

-- Structural metadata indexes
CREATE INDEX IF NOT EXISTS idx_chunks_template_type 
  ON chunks((metadata->'structural'->>'templateType'))
  WHERE metadata->'structural'->>'templateType' IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN chunks.metadata IS 
  'Enhanced metadata for 7-engine collision detection. Structure:
  {
    structural: { patterns, hierarchyDepth, listTypes, hasTable, hasCode, confidence },
    emotional: { primaryEmotion, polarity, intensity, secondaryEmotions, transitions, confidence },
    concepts: { concepts, entities, relationships, domains, abstractionLevel, confidence },
    methods: { signatures, languages, namingConvention, complexity, patterns, confidence },
    narrative: { sentenceRhythm, paragraphStructure, style, fingerprint, transitions, confidence },
    references: { internalRefs, externalRefs, citationStyle, urls, crossRefs, density, confidence },
    domain: { primaryDomain, secondaryDomains, technicalDepth, jargonDensity, domainTerms, academic, confidence },
    quality: { completeness, extractedFields, totalFields, extractedAt, extractionTime, extractorVersions, errors }
  }';

-- Create function to calculate metadata completeness
CREATE OR REPLACE FUNCTION calculate_metadata_completeness(metadata JSONB)
RETURNS FLOAT AS $$
DECLARE
  field_count INT := 0;
  total_fields INT := 6; -- Base fields excluding optional 'methods'
BEGIN
  -- Check each required field
  IF metadata->'structural' IS NOT NULL THEN field_count := field_count + 1; END IF;
  IF metadata->'emotional' IS NOT NULL THEN field_count := field_count + 1; END IF;
  IF metadata->'concepts' IS NOT NULL THEN field_count := field_count + 1; END IF;
  IF metadata->'narrative' IS NOT NULL THEN field_count := field_count + 1; END IF;
  IF metadata->'references' IS NOT NULL THEN field_count := field_count + 1; END IF;
  IF metadata->'domain' IS NOT NULL THEN field_count := field_count + 1; END IF;
  
  -- Check optional methods field for code chunks
  IF metadata->'structural'->>'hasCode' = 'true' THEN
    total_fields := 7;
    IF metadata->'methods' IS NOT NULL THEN field_count := field_count + 1; END IF;
  END IF;
  
  -- Calculate completeness
  IF total_fields = 0 THEN RETURN 0; END IF;
  RETURN field_count::FLOAT / total_fields::FLOAT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create view for chunks with metadata quality
CREATE OR REPLACE VIEW chunks_with_quality AS
SELECT 
  c.*,
  calculate_metadata_completeness(c.metadata) as metadata_completeness,
  CASE 
    WHEN c.metadata->'quality'->>'extractedAt' IS NOT NULL 
    THEN (c.metadata->'quality'->>'extractedAt')::TIMESTAMPTZ
    ELSE NULL
  END as metadata_extracted_at,
  CASE
    WHEN c.metadata->'quality'->>'extractionTime' IS NOT NULL
    THEN (c.metadata->'quality'->>'extractionTime')::INT
    ELSE NULL
  END as metadata_extraction_ms
FROM chunks c;

-- Create function to get chunks by emotion
CREATE OR REPLACE FUNCTION get_chunks_by_emotion(
  emotion_type TEXT,
  min_polarity FLOAT DEFAULT -1,
  max_polarity FLOAT DEFAULT 1,
  min_confidence FLOAT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  document_id UUID,
  content TEXT,
  primary_emotion TEXT,
  polarity FLOAT,
  confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.document_id,
    c.content,
    c.metadata->'emotional'->>'primaryEmotion',
    (c.metadata->'emotional'->>'polarity')::FLOAT,
    (c.metadata->'emotional'->>'confidence')::FLOAT
  FROM chunks c
  WHERE c.metadata->'emotional'->>'primaryEmotion' = emotion_type
    AND (c.metadata->'emotional'->>'polarity')::FLOAT BETWEEN min_polarity AND max_polarity
    AND (c.metadata->'emotional'->>'confidence')::FLOAT >= min_confidence;
END;
$$ LANGUAGE plpgsql;

-- Create function to get chunks by domain
CREATE OR REPLACE FUNCTION get_chunks_by_domain(
  domain_type TEXT,
  min_technical_depth FLOAT DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  document_id UUID,
  content TEXT,
  primary_domain TEXT,
  technical_depth FLOAT,
  jargon_density FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.document_id,
    c.content,
    c.metadata->'domain'->>'primaryDomain',
    (c.metadata->'domain'->>'technicalDepth')::FLOAT,
    (c.metadata->'domain'->>'jargonDensity')::FLOAT
  FROM chunks c
  WHERE c.metadata->'domain'->>'primaryDomain' = domain_type
    AND (c.metadata->'domain'->>'technicalDepth')::FLOAT >= min_technical_depth;
END;
$$ LANGUAGE plpgsql;

-- Create function to find structurally similar chunks
CREATE OR REPLACE FUNCTION find_similar_structure(
  template_type TEXT DEFAULT NULL,
  min_hierarchy_depth INT DEFAULT 0,
  has_code BOOLEAN DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  document_id UUID,
  content TEXT,
  template TEXT,
  hierarchy_depth INT,
  pattern_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.document_id,
    c.content,
    c.metadata->'structural'->>'templateType',
    (c.metadata->'structural'->>'hierarchyDepth')::INT,
    jsonb_array_length(c.metadata->'structural'->'patterns')
  FROM chunks c
  WHERE (template_type IS NULL OR c.metadata->'structural'->>'templateType' = template_type)
    AND (c.metadata->'structural'->>'hierarchyDepth')::INT >= min_hierarchy_depth
    AND (has_code IS NULL OR (c.metadata->'structural'->>'hasCode')::BOOLEAN = has_code);
END;
$$ LANGUAGE plpgsql;

-- Migration rollback support
-- To rollback, run:
-- ALTER TABLE chunks DROP COLUMN IF EXISTS metadata;
-- DROP INDEX IF EXISTS idx_chunks_metadata;
-- DROP INDEX IF EXISTS idx_chunks_primary_emotion;
-- DROP INDEX IF EXISTS idx_chunks_emotional_polarity;
-- DROP INDEX IF EXISTS idx_chunks_primary_domain;
-- DROP INDEX IF EXISTS idx_chunks_technical_depth;
-- DROP INDEX IF EXISTS idx_chunks_metadata_completeness;
-- DROP INDEX IF EXISTS idx_chunks_template_type;
-- DROP FUNCTION IF EXISTS calculate_metadata_completeness(JSONB);
-- DROP VIEW IF EXISTS chunks_with_quality;
-- DROP FUNCTION IF EXISTS get_chunks_by_emotion(TEXT, FLOAT, FLOAT, FLOAT);
-- DROP FUNCTION IF EXISTS get_chunks_by_domain(TEXT, FLOAT);
-- DROP FUNCTION IF EXISTS find_similar_structure(TEXT, INT, BOOLEAN);