-- Migration 033: Fuzzy Matching Fields for Annotation Recovery
-- Add recovery tracking fields to components table
-- Purpose: Enable annotation recovery after document edits using fuzzy matching
--
-- Note: text_context is stored in position.data.textContext (component data)
-- not as a separate column. Only recovery metadata gets top-level columns.

-- Add original_chunk_index for chunk-bounded search (50-75x performance boost)
ALTER TABLE components
ADD COLUMN original_chunk_index INTEGER;

-- Add recovery_confidence (0.0-1.0) to track match quality
ALTER TABLE components
ADD COLUMN recovery_confidence FLOAT;

-- Add recovery_method to track which matching tier was used
ALTER TABLE components
ADD COLUMN recovery_method TEXT;

-- Add needs_review flag for ambiguous matches (0.75-0.85 confidence)
ALTER TABLE components
ADD COLUMN needs_review BOOLEAN DEFAULT FALSE;

-- Note: chunk_ids column already exists from migration 030_multi_chunk_annotations.sql
-- We'll use this existing column for multi-chunk annotation support

-- Create index for chunk-bounded search
CREATE INDEX idx_components_chunk_index ON components(original_chunk_index)
WHERE original_chunk_index IS NOT NULL;

-- Create index for review queue (only annotations needing review)
CREATE INDEX idx_components_needs_review ON components(needs_review)
WHERE needs_review = true;

-- Create index for recovery method filtering
CREATE INDEX idx_components_recovery_method ON components(recovery_method)
WHERE recovery_method IS NOT NULL;

-- Add check constraint for recovery_method values
ALTER TABLE components
ADD CONSTRAINT components_recovery_method_check
CHECK (recovery_method IS NULL OR recovery_method IN ('exact', 'context', 'chunk_bounded', 'trigram', 'lost'));

-- Add check constraint for recovery_confidence range
ALTER TABLE components
ADD CONSTRAINT components_recovery_confidence_check
CHECK (recovery_confidence IS NULL OR (recovery_confidence >= 0.0 AND recovery_confidence <= 1.0));

-- Add comments for documentation
COMMENT ON COLUMN components.original_chunk_index IS 'Original chunk index for chunk-bounded search. Limits search space to ±2 chunks for 50-75x performance boost';
COMMENT ON COLUMN components.recovery_confidence IS 'Fuzzy match confidence (0.0-1.0). >0.85=auto-recovered, 0.75-0.85=needs review, <0.75=lost';
COMMENT ON COLUMN components.recovery_method IS 'Matching tier used: exact, context (Levenshtein with context), chunk_bounded (Levenshtein in chunk), trigram, or lost';
COMMENT ON COLUMN components.needs_review IS 'True if fuzzy match needs manual review (confidence 0.75-0.85). Shows in AnnotationReviewTab';
COMMENT ON COLUMN components.chunk_ids IS 'Array of chunk UUIDs for multi-chunk annotations (spans multiple chunks)';
