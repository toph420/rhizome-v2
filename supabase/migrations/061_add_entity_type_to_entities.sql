-- Add entity_type column to entities table for ECS system
-- This allows us to identify what type of entity (annotation, spark, flashcard, etc)

ALTER TABLE entities
ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'unknown';

-- Add index for common queries filtering by entity type
CREATE INDEX idx_entities_entity_type ON entities(entity_type);

-- Add check constraint for valid entity types
ALTER TABLE entities
ADD CONSTRAINT entities_entity_type_check
CHECK (entity_type IN ('annotation', 'spark', 'flashcard', 'unknown'));

-- Update existing entities based on their components
-- (This handles any existing entities in the database)
UPDATE entities e
SET entity_type = CASE
  WHEN EXISTS (
    SELECT 1 FROM components c
    WHERE c.entity_id = e.id
    AND c.component_type = 'Position'
  ) THEN 'annotation'
  WHEN EXISTS (
    SELECT 1 FROM components c
    WHERE c.entity_id = e.id
    AND c.component_type = 'Spark'
  ) THEN 'spark'
  ELSE 'unknown'
END
WHERE entity_type = 'unknown';

COMMENT ON COLUMN entities.entity_type IS 'Type of entity in ECS system (annotation, spark, flashcard, etc)';
