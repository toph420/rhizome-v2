# Enhanced Metadata Schema Documentation

> **Version**: 1.0.0  
> **Created**: 2025-01-29  
> **Purpose**: Define comprehensive metadata structure for 7-engine collision detection system

## Overview

The enhanced metadata schema enables sophisticated document collision detection and knowledge synthesis through 7 distinct metadata categories. Each category feeds a specialized detection engine that identifies connections between documents based on different dimensions of similarity.

## Schema Structure

### Core Metadata Object

```typescript
ChunkMetadata {
  structural: StructuralMetadata    // Document organization patterns
  emotional: EmotionalMetadata      // Sentiment and tone
  concepts: ConceptualMetadata      // Key concepts and entities
  methods?: MethodMetadata          // Code signatures (optional)
  narrative: NarrativeMetadata      // Writing style and rhythm
  references: ReferenceMetadata     // Citations and cross-references
  domain: DomainMetadata            // Domain-specific signals
  quality: QualityMetadata          // Extraction metrics
}
```

## 7 Metadata Categories

### 1. Structural Metadata
**Purpose**: Identifies document organization and formatting patterns  
**Engine**: Structural Collision Engine  
**Key Fields**:
- `patterns[]`: Detected structural patterns (headings, lists, tables, code)
- `hierarchyDepth`: Maximum nesting depth
- `listTypes[]`: Types of lists found
- `templateType`: Recognized document template

**Use Cases**:
- Finding similarly structured documents
- Identifying document templates
- Matching organizational patterns

### 2. Emotional Metadata
**Purpose**: Captures sentiment and emotional content  
**Engine**: Emotional Resonance Engine  
**Key Fields**:
- `primaryEmotion`: Dominant emotion (Plutchik's wheel)
- `polarity`: Sentiment score (-1 to +1)
- `intensity`: Emotional strength (0-1)
- `secondaryEmotions[]`: Additional emotions present

**Use Cases**:
- Matching documents by emotional tone
- Finding contrasting viewpoints
- Identifying mood shifts in narratives

### 3. Conceptual Metadata
**Purpose**: Extracts key concepts, entities, and themes  
**Engine**: Conceptual Similarity Engine  
**Key Fields**:
- `concepts[]`: Ranked key concepts
- `entities{}`: Named entities (people, orgs, locations)
- `relationships[]`: Concept connections
- `abstractionLevel`: Concrete vs abstract (0-1)

**Use Cases**:
- Topic-based document matching
- Entity relationship mapping
- Concept network building

### 4. Method Metadata (Code Only)
**Purpose**: Detects programming patterns and signatures  
**Engine**: Code Pattern Engine  
**Key Fields**:
- `signatures[]`: Function/method signatures
- `languages[]`: Programming languages
- `namingConvention`: Code style patterns
- `complexity{}`: Code complexity metrics

**Use Cases**:
- Finding similar code implementations
- Identifying coding patterns
- Matching by complexity level

### 5. Narrative Metadata
**Purpose**: Analyzes writing style and rhythm  
**Engine**: Stylistic Rhythm Engine  
**Key Fields**:
- `sentenceRhythm{}`: Sentence length patterns
- `paragraphStructure{}`: Paragraph metrics
- `style{}`: Formality, technicality, verbosity scores
- `fingerprint`: Unique style signature

**Use Cases**:
- Author attribution
- Style matching
- Writing pattern analysis

### 6. Reference Metadata
**Purpose**: Tracks citations and cross-references  
**Engine**: Reference Network Engine  
**Key Fields**:
- `internalRefs`: Same-document references
- `externalRefs[]`: External citations
- `citationStyle`: Academic citation format
- `crossRefs[]`: Links to other chunks

**Use Cases**:
- Citation network analysis
- Reference tracking
- Academic paper connections

### 7. Domain Metadata
**Purpose**: Captures domain-specific signals  
**Engine**: Domain Expertise Engine  
**Key Fields**:
- `primaryDomain`: Main subject area
- `technicalDepth`: Expertise level (0-1)
- `jargonDensity`: Technical terms per 100 words
- `academic{}`: Academic paper indicators

**Use Cases**:
- Domain-specific search
- Expertise level matching
- Academic vs general content

## Quality Assurance

### Quality Metadata
Every extraction includes quality metrics:
- `completeness`: Percentage of fields extracted (0-1)
- `extractedFields`: Count of successful extractions
- `extractionTime`: Processing duration (ms)
- `errors[]`: Any extraction failures

### Graceful Degradation
When extractors fail, the system:
1. Returns partial metadata with available fields
2. Logs specific errors in `quality.errors[]`
3. Provides default values for missing fields
4. Maintains overall system functionality

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Total extraction time | <2s per chunk | All extractors combined |
| Individual extractor | <500ms | Per metadata category |
| Metadata size | <10KB per chunk | JSONB storage |
| Completeness | >90% | Fields successfully extracted |
| Accuracy | >80% | Validated against ground truth |

## Backward Compatibility

### Existing Fields Preserved
- `themes[]` → Mapped to `concepts.concepts[]`
- `importance` → Preserved as-is
- `summary` → Preserved as-is
- `positionContext` → Preserved as-is

### Migration Strategy
1. New chunks: Full metadata extraction
2. Existing chunks: Operate with partial metadata
3. Optional: Batch upgrade utility available
4. No breaking changes to existing queries

## Database Storage

### JSONB Column Structure
```sql
ALTER TABLE chunks
  ADD COLUMN metadata JSONB DEFAULT '{}';

-- GIN index for efficient queries
CREATE INDEX idx_chunks_metadata ON chunks USING GIN (metadata);

-- Functional indexes for common queries
CREATE INDEX idx_chunks_primary_emotion ON chunks((metadata->'emotional'->>'primaryEmotion'));
CREATE INDEX idx_chunks_primary_domain ON chunks((metadata->'domain'->>'primaryDomain'));
CREATE INDEX idx_chunks_completeness ON chunks(((metadata->'quality'->>'completeness')::float));
```

## Usage Examples

### Querying by Emotion
```sql
SELECT * FROM chunks 
WHERE metadata->'emotional'->>'primaryEmotion' = 'joy'
  AND (metadata->'emotional'->>'polarity')::float > 0.5;
```

### Finding Similar Structure
```sql
SELECT * FROM chunks
WHERE metadata->'structural' @> '{"templateType": "academic_paper"}'
  AND (metadata->'structural'->>'hierarchyDepth')::int > 3;
```

### Cross-Domain Search
```sql
SELECT * FROM chunks
WHERE metadata->'domain'->>'primaryDomain' = 'technical'
  AND metadata->'concepts'->'entities'->'technologies' ? 'React';
```

## Extractor Versions

Track extractor versions for reproducibility:
```typescript
extractorVersions: {
  'structural': '1.0.0',
  'emotional': '1.0.0',
  'concepts': '1.0.0',
  'methods': '1.0.0',
  'narrative': '1.0.0',
  'references': '1.0.0',
  'domain': '1.0.0'
}
```

## Future Extensions

The schema is designed for extensibility:
- Additional metadata categories can be added
- Existing categories can be enhanced
- New collision engines can be introduced
- Machine learning models can be integrated

## Validation

Use provided TypeScript functions:
- `validateMetadata()`: Check completeness
- `isCompleteMetadata()`: Type guard
- `mergeWithDefaults()`: Fill missing fields

## Success Metrics

- ✅ All 7 metadata types defined
- ✅ Backward compatibility maintained
- ✅ Extensible JSONB structure
- ✅ Performance targets established
- ✅ Validation utilities provided
- ✅ Quality metrics included