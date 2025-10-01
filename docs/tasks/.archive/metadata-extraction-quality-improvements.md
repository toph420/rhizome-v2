# Metadata Extraction Quality Improvements - Task Breakdown

**Version**: 1.0.0  
**Date**: 2025-09-30  
**Source PRP**: `docs/prps/metadata-extraction-quality-improvements.md`  
**Status**: Ready for Sprint Planning  
**Total Tasks**: 22 tasks across 3 phases  
**Estimated Effort**: 80-96 story points / 4-5 sprints  

---

## PRP Analysis Summary

### Feature Overview
**Feature Name**: Metadata Extraction Quality Improvements  
**Scope**: Enhance the quality of AI-powered metadata extraction in the document processing pipeline while maintaining performance targets (<100ms extraction times).

### Key Technical Requirements
- Fix schema duplication (50% storage reduction)
- Eliminate stop words from concept extraction
- Repair named entity recognition pipeline
- Implement document-aware context for chunk processing
- Add content type detection for structural awareness
- Replace default scoring with calculated importance metrics

### Validation Requirements
- Maintain extraction performance <100ms (current: 43-64ms)
- Achieve >90% accuracy for named entity extraction
- No stop words in top 10 extracted concepts
- Pass all existing integration tests
- Maintain 100% processing success rate

## Task Complexity Assessment

**Overall Complexity Rating**: Moderate to Complex  
**Integration Points**: 
- Database schema (migrations required)
- Worker module processors (7 extractors)
- AI prompt engineering (Gemini 2.0)
- Testing framework (validation suite)

**Technical Challenges**:
- Backward compatibility for existing documents
- Performance constraints during quality improvements
- Graceful degradation requirements
- Parallel extraction orchestration

## Phase Organization

### Phase 1: Critical Fixes (Sprint 1-2)
**Objective**: Fix fundamental quality issues blocking accurate collision detection  
**Deliverables**: 
- Schema cleanup migration executed
- Stop word filtering operational
- Entity extraction accuracy improved
**Milestones**: 
- Database schema optimized (50% storage reduction)
- No stop words in extracted concepts
- Named entities correctly categorized

### Phase 2: Quality Improvements (Sprint 2-3)
**Objective**: Enhance extraction accuracy through better preprocessing and context awareness  
**Deliverables**:
- Text preprocessing pipeline fixed
- Document context propagation implemented
- Content type detection operational
**Milestones**:
- Tokenization errors eliminated
- Chunk-level context awareness active
- Structural metadata available

### Phase 3: Advanced Features (Sprint 4-5)
**Objective**: Implement sophisticated scoring and relationship extraction  
**Deliverables**:
- Importance scoring algorithm active
- Real summarization replacing truncation
- Advanced relationship extraction
**Milestones**:
- Calculated importance scores (not defaults)
- Context-aware summaries generated
- Complex relationships identified

---

## Detailed Task Breakdown

### Phase 1: Critical Fixes

#### Task T-001: Database Schema Analysis and Migration Planning
**Priority**: Critical  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 3 story points / 4 hours  

**Dependencies**:
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-002
- **Blocked By**: None

**Acceptance Criteria**:
```gherkin
Scenario: Analyze existing schema duplication
  Given the database has duplicate metadata JSONB columns from migrations 014 and 015
  When I analyze the chunks table structure
  Then I identify all redundant columns (structural_metadata, conceptual_metadata, etc.)
  And I verify data exists in the unified metadata column
  And I create a data migration plan preserving all existing data

Scenario: Verify data integrity
  Given existing chunks with populated metadata
  When I check the unified metadata column
  Then all necessary data is present
  And no data loss would occur from column removal
```

**Implementation Details**:
```
Files to Analyze:
├── supabase/migrations/014_enhanced_metadata_fields.sql - Review single JSONB approach
├── supabase/migrations/015_add_metadata_fields.sql - Review multiple JSONB approach  
├── supabase/migrations/017_fix_document_availability_flags.sql - Migration pattern reference
└── worker/handlers/process-document.ts:131-139 - Current mapping logic
```

**Manual Testing Steps**:
1. Connect to local Supabase: `psql postgresql://postgres:postgres@localhost:54322/postgres`
2. Run: `\d chunks` to see current schema
3. Query: `SELECT COUNT(*) FROM chunks WHERE metadata IS NULL;`
4. Verify redundant columns contain same data as unified column

---

#### Task T-002: Create Schema Cleanup Migration
**Priority**: Critical  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 5 story points / 6 hours  

**Dependencies**:
- **Prerequisite Tasks**: T-001
- **Parallel Tasks**: None
- **Blocked By**: T-001 completion

**Acceptance Criteria**:
```gherkin
Scenario: Safe schema migration
  Given verified data integrity from T-001
  When migration 018_cleanup_duplicate_metadata.sql runs
  Then duplicate columns are dropped safely
  And unified metadata column remains intact
  And rollback script is provided

Scenario: Migration verification
  Given the migration has executed
  When I query the chunks table
  Then only the unified metadata JSONB column exists
  And all data is preserved
  And storage usage is reduced by ~50%
```

**Implementation Details**:
```sql
-- Create: supabase/migrations/018_cleanup_duplicate_metadata.sql
BEGIN;

-- Verify data integrity
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM chunks WHERE metadata IS NULL) > 0 THEN
        RAISE EXCEPTION 'Found chunks with null metadata - cannot proceed';
    END IF;
END $$;

-- Drop duplicate columns
ALTER TABLE chunks 
DROP COLUMN IF EXISTS structural_metadata CASCADE,
DROP COLUMN IF EXISTS conceptual_metadata CASCADE,
DROP COLUMN IF EXISTS emotional_metadata CASCADE,
DROP COLUMN IF EXISTS temporal_metadata CASCADE,
DROP COLUMN IF EXISTS citation_metadata CASCADE,
DROP COLUMN IF EXISTS contradiction_metadata CASCADE;

-- Add verification
DO $$
BEGIN
    IF (SELECT COUNT(*) 
        FROM information_schema.columns 
        WHERE table_name = 'chunks' 
        AND column_name LIKE '%_metadata' 
        AND column_name != 'metadata') > 0 THEN
        RAISE EXCEPTION 'Duplicate metadata columns still exist';
    END IF;
END $$;

COMMIT;
```

**Manual Testing Steps**:
1. Backup database: `npx supabase db dump > backup.sql`
2. Run migration: `npx supabase migration up`
3. Verify schema: `psql -c "\d chunks"`
4. Test rollback: `npx supabase db reset`

---

#### Task T-003: Implement Stop Word Filter Utility
**Priority**: High  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 3 story points / 4 hours  

**Dependencies**:
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-001, T-002
- **Blocked By**: None

**Acceptance Criteria**:
```gherkin
Scenario: Stop word filtering
  Given a list of extracted concepts containing stop words
  When the filterStopWords function is called
  Then common English stop words are removed
  And concepts shorter than 3 characters are filtered
  And importance scores are preserved for remaining concepts

Scenario: Configurable word lists
  Given the need for future language support
  When implementing the filter
  Then stop word lists are configurable
  And language-specific lists can be added
```

**Implementation Details**:
```typescript
// Create: worker/lib/filters/stop-words.ts
export const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 
  'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'again', 'further', 'then', 'once', 'is', 'am', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
  'we', 'they', 'them', 'their', 'what', 'which', 'who', 'when',
  'where', 'why', 'how', 'all', 'each', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
  'own', 'same', 'so', 'than', 'too', 'very', 'just'
]);

export interface ConceptWithScore {
  term: string;
  importance: number;
  context?: string;
}

export function filterStopWords(
  concepts: ConceptWithScore[], 
  stopWords: Set<string> = ENGLISH_STOP_WORDS,
  minLength: number = 3
): ConceptWithScore[] {
  return concepts.filter(concept => {
    const cleaned = concept.term.toLowerCase().trim();
    return !stopWords.has(cleaned) && cleaned.length >= minLength;
  });
}

// Track filtering metrics
export function filterWithMetrics(concepts: ConceptWithScore[]) {
  const filtered = filterStopWords(concepts);
  return {
    filtered,
    metrics: {
      original_count: concepts.length,
      filtered_count: filtered.length,
      stop_words_removed: concepts.length - filtered.length
    }
  };
}
```

**Manual Testing Steps**:
1. Create test file: `worker/lib/filters/__tests__/stop-words.test.ts`
2. Test with sample concepts: ['the', 'machine', 'learning', 'and', 'artificial', 'intelligence', 'a']
3. Verify output: ['machine', 'learning', 'artificial', 'intelligence']
4. Run: `cd worker && npm test stop-words`

---

#### Task T-004: Integrate Stop Word Filtering into Concept Extractor
**Priority**: High  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 5 story points / 6 hours  

**Dependencies**:
- **Prerequisite Tasks**: T-003
- **Parallel Tasks**: T-005
- **Blocked By**: T-003 completion

**Acceptance Criteria**:
```gherkin
Scenario: Stop word removal in concept extraction
  Given the concept extractor receives AI-generated concepts
  When concepts are processed
  Then stop words are filtered before storage
  And filtering metrics are logged
  And top 10 concepts contain no stop words

Scenario: Performance maintained
  Given the current extraction time of 43-64ms
  When stop word filtering is added
  Then total extraction time remains <100ms
  And filtering adds <5ms overhead
```

**Implementation Details**:
```typescript
// Modify: worker/lib/extractors/concept-extractor.ts
import { filterWithMetrics } from '../filters/stop-words';

async function extractConcepts(content: string): Promise<ConceptMetadata> {
  try {
    // Existing AI extraction logic
    const rawConcepts = await geminiClient.generateContent(/* prompt */);
    
    // NEW: Apply stop word filtering
    const { filtered, metrics } = filterWithMetrics(rawConcepts);
    
    // Sort by importance and take top N
    const topConcepts = filtered
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);
    
    return {
      concepts: topConcepts,
      domain: determineDomain(topConcepts),
      processing_metadata: {
        stop_words_removed: metrics.stop_words_removed,
        extraction_method: 'gemini-2.0-with-filtering',
        extraction_time_ms: Date.now() - startTime
      }
    };
  } catch (error) {
    // Graceful degradation pattern
    return createPartialConceptMetadata();
  }
}
```

**Manual Testing Steps**:
1. Run extraction test: `cd worker && npm run test:integration -- concept-extraction`
2. Check logs for filtering metrics
3. Verify top concepts in test output contain no stop words
4. Measure performance: should be <100ms total

---

#### Task T-005: Debug Entity Extraction Pipeline
**Priority**: High  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 8 story points / 1 day  

**Dependencies**:
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-004
- **Blocked By**: None

**Acceptance Criteria**:
```gherkin
Scenario: Correct entity categorization
  Given text containing "Vladimir Lenin visited Moscow"
  When entity extraction runs
  Then "Vladimir Lenin" is categorized as PEOPLE
  And "Moscow" is categorized as LOCATIONS
  And neither appear in "other" category

Scenario: Improved extraction accuracy
  Given the current poor NER performance
  When prompt engineering is improved
  Then entity extraction accuracy exceeds 90%
  And confidence scores are provided
```

**Implementation Details**:
```typescript
// Modify: worker/lib/extractors/entity-extractor.ts

const ENTITY_EXTRACTION_PROMPT = `
Extract named entities from the following text. Use these strict categories:

PEOPLE: Full names of specific individuals
- Examples: "Albert Einstein", "Marie Curie", "Barack Obama"
- Include: Authors, historical figures, scientists, politicians
- Exclude: Generic roles like "the president" or "researchers"

LOCATIONS: Geographic places and landmarks  
- Examples: "New York City", "Mount Everest", "Pacific Ocean"
- Include: Countries, cities, regions, landmarks, bodies of water
- Exclude: Generic places like "the hospital" or "downtown"

ORGANIZATIONS: Companies, institutions, groups
- Examples: "Google", "United Nations", "Harvard University"
- Include: Companies, universities, governments, NGOs
- Exclude: Generic terms like "the company" or "the government"

For each entity, provide:
1. The exact text as it appears
2. The category (PEOPLE, LOCATIONS, or ORGANIZATIONS)
3. A confidence score (0.0 to 1.0)
4. Brief context from the surrounding text

Text to analyze:
{content}

Return as JSON with separate arrays for each category. Do NOT put people or locations in an "other" category.
`;

async function extractEntities(content: string): Promise<EntityMetadata> {
  const startTime = Date.now();
  
  try {
    const prompt = ENTITY_EXTRACTION_PROMPT.replace('{content}', content);
    const result = await geminiClient.generateContent({
      prompt,
      temperature: 0.1, // Lower temperature for more consistent extraction
      maxTokens: 1000
    });
    
    const parsed = JSON.parse(result);
    
    // Validate and filter by confidence threshold
    const confidenceThreshold = 0.7;
    
    return {
      people: (parsed.people || [])
        .filter(e => e.confidence >= confidenceThreshold)
        .map(e => ({ name: e.text, confidence: e.confidence, context: e.context })),
      locations: (parsed.locations || [])
        .filter(e => e.confidence >= confidenceThreshold)
        .map(e => ({ name: e.text, confidence: e.confidence, context: e.context })),
      organizations: (parsed.organizations || [])
        .filter(e => e.confidence >= confidenceThreshold)
        .map(e => ({ name: e.text, confidence: e.confidence, context: e.context })),
      other: [], // Deprecated - keep for backward compatibility but empty
      extraction_quality: {
        ner_pipeline_version: '2.0.0',
        confidence_threshold: confidenceThreshold,
        extraction_time_ms: Date.now() - startTime
      }
    };
  } catch (error) {
    logger.error('Entity extraction failed', { error, content_length: content.length });
    return createPartialEntityMetadata();
  }
}
```

**Manual Testing Steps**:
1. Create test file with known entities: "Vladimir Lenin", "Karl Marx", "China", "Europe"
2. Run: `cd worker && npm run validate:metadata:real` (uses real AI)
3. Verify entities are correctly categorized
4. Check confidence scores are reasonable (>0.7)
5. Ensure no people/locations in "other" category

---

### Phase 2: Quality Improvements

#### Task T-006: Fix Text Preprocessing in Relationship Extractor
**Priority**: Medium  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 5 story points / 6 hours  

**Dependencies**:
- **Prerequisite Tasks**: T-001, T-002 (schema must be clean)
- **Parallel Tasks**: T-007, T-008
- **Blocked By**: Phase 1 completion

**Acceptance Criteria**:
```gherkin
Scenario: Fixed tokenization
  Given text with phrases like "these days"
  When relationship extraction tokenizes the text
  Then complete words are preserved
  And fragments like "lso" and "ys" are not created
  And relationships maintain semantic meaning

Scenario: Validated preprocessing
  Given the text preprocessing pipeline
  When text is processed
  Then word boundaries are respected
  And punctuation is handled correctly
  And no data corruption occurs
```

**Implementation Details**:
```typescript
// Modify: worker/lib/extractors/relationship-extractor.ts

// Replace broken tokenization with proper word boundary detection
function tokenizeText(text: string): string[] {
  // Remove extra whitespace and normalize
  const normalized = text.replace(/\s+/g, ' ').trim();
  
  // Use proper word boundary regex
  const words = normalized.match(/\b[\w']+\b/g) || [];
  
  // Filter out single characters and numbers
  return words.filter(word => 
    word.length > 1 && 
    !(/^\d+$/.test(word)) &&
    !(/^[^a-zA-Z]+$/.test(word))
  );
}

// Improve relationship extraction with fixed tokenization
async function extractRelationships(content: string): Promise<RelationshipMetadata> {
  const tokens = tokenizeText(content);
  
  // Build co-occurrence matrix with proper tokens
  const cooccurrences = new Map<string, Map<string, number>>();
  const windowSize = 5;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i].toLowerCase();
    
    for (let j = i + 1; j < Math.min(i + windowSize, tokens.length); j++) {
      const related = tokens[j].toLowerCase();
      
      if (!cooccurrences.has(token)) {
        cooccurrences.set(token, new Map());
      }
      
      const current = cooccurrences.get(token)!.get(related) || 0;
      cooccurrences.get(token)!.set(related, current + 1);
    }
  }
  
  // Convert to relationships array with strength scores
  const relationships = [];
  for (const [source, targets] of cooccurrences.entries()) {
    for (const [target, count] of targets.entries()) {
      if (count >= 2) { // Minimum co-occurrence threshold
        relationships.push({
          source,
          target,
          type: 'co-occurrence',
          strength: Math.min(count / 10, 1.0) // Normalize strength
        });
      }
    }
  }
  
  return {
    relationships: relationships.slice(0, 50), // Top 50 relationships
    extraction_method: 'co-occurrence-fixed-tokenization'
  };
}
```

**Manual Testing Steps**:
1. Test tokenization with: "These days, machine learning is everywhere."
2. Verify tokens: ["These", "days", "machine", "learning", "is", "everywhere"]
3. Check no fragments like "lso", "ys", "ing"
4. Run integration test: `cd worker && npm test relationship-extractor`

---

#### Task T-007: Create Content Type Detector
**Priority**: Medium  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 5 story points / 6 hours  

**Dependencies**:
- **Prerequisite Tasks**: None
- **Parallel Tasks**: T-006, T-008
- **Blocked By**: None

**Acceptance Criteria**:
```gherkin
Scenario: Detect frontmatter
  Given a chunk containing "title:", "author:", "date:" patterns
  When content type detection runs
  Then chunk_type is "frontmatter"
  And structural_role is "metadata"

Scenario: Detect citations
  Given a chunk containing bibliography or references
  When content type detection runs
  Then chunk_type is "citation"
  And structural_role is "reference"

Scenario: Detect main content
  Given a regular content chunk
  When content type detection runs
  Then chunk_type is "content"
  And structural_role is "primary"
```

**Implementation Details**:
```typescript
// Create: worker/lib/extractors/content-type-extractor.ts

import { BaseExtractor } from './base';
import { ContentTypeMetadata } from '../../types/metadata';

export class ContentTypeExtractor extends BaseExtractor {
  private readonly FRONTMATTER_INDICATORS = [
    'title:', 'author:', 'date:', 'abstract:', 'keywords:',
    'published:', 'tags:', 'category:', 'summary:'
  ];
  
  private readonly CITATION_INDICATORS = [
    'references', 'bibliography', 'citations', 'works cited',
    'sources', 'footnotes', 'endnotes'
  ];
  
  private readonly CONCLUSION_INDICATORS = [
    'conclusion', 'summary', 'in conclusion', 'to summarize',
    'final thoughts', 'key takeaways', 'wrap up'
  ];
  
  async extract(
    content: string, 
    context?: {
      chunkIndex: number;
      totalChunks: number;
      documentTitle?: string;
      previousChunkType?: string;
    }
  ): Promise<ContentTypeMetadata> {
    const lowerContent = content.toLowerCase();
    
    // Check position-based heuristics
    if (context?.chunkIndex === 0) {
      // First chunk often contains frontmatter
      if (this.containsMultipleIndicators(lowerContent, this.FRONTMATTER_INDICATORS, 2)) {
        return {
          chunk_type: 'frontmatter',
          structural_role: 'metadata',
          confidence: 0.9
        };
      }
    }
    
    if (context && context.chunkIndex >= context.totalChunks - 2) {
      // Last chunks often contain citations
      if (this.containsIndicators(lowerContent, this.CITATION_INDICATORS)) {
        return {
          chunk_type: 'citation',
          structural_role: 'reference',
          confidence: 0.85
        };
      }
      
      if (this.containsIndicators(lowerContent, this.CONCLUSION_INDICATORS)) {
        return {
          chunk_type: 'conclusion',
          structural_role: 'primary',
          confidence: 0.8
        };
      }
    }
    
    // Check for headers (markdown or plain text)
    const headerMatch = content.match(/^#+\s+(.+)$/m) || content.match(/^([A-Z][^.!?]*):?\s*$/m);
    if (headerMatch) {
      return {
        chunk_type: 'header',
        structural_role: 'primary',
        heading_text: headerMatch[1],
        confidence: 0.75
      };
    }
    
    // Default to content
    return {
      chunk_type: 'content',
      structural_role: 'primary',
      confidence: 0.7
    };
  }
  
  private containsIndicators(content: string, indicators: string[]): boolean {
    return indicators.some(indicator => content.includes(indicator));
  }
  
  private containsMultipleIndicators(content: string, indicators: string[], threshold: number): boolean {
    const count = indicators.filter(indicator => content.includes(indicator)).length;
    return count >= threshold;
  }
}

export const contentTypeExtractor = new ContentTypeExtractor();
```

**Manual Testing Steps**:
1. Test with frontmatter: "title: My Document\nauthor: John Doe\ndate: 2024-01-01"
2. Test with citations: "References\n1. Smith et al. (2023)..."
3. Test with content: "This is the main body of the document..."
4. Verify correct type detection for each

---

#### Task T-008: Add Content Type to Metadata Orchestrator
**Priority**: Medium  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 3 story points / 4 hours  

**Dependencies**:
- **Prerequisite Tasks**: T-007
- **Parallel Tasks**: T-006
- **Blocked By**: T-007 completion

**Acceptance Criteria**:
```gherkin
Scenario: Content type extraction integrated
  Given the metadata orchestrator runs
  When processing a chunk
  Then content type detection is included
  And results are stored in metadata
  And extraction time remains <100ms
```

**Implementation Details**:
```typescript
// Modify: worker/lib/metadata-extractor.ts

import { contentTypeExtractor } from './extractors/content-type-extractor';

// Add to extractor array
const extractors = [
  { name: 'concepts', fn: conceptExtractor.extract, timeout: 500 },
  { name: 'entities', fn: entityExtractor.extract, timeout: 500 },
  { name: 'relationships', fn: relationshipExtractor.extract, timeout: 400 },
  { name: 'sentiment', fn: sentimentExtractor.extract, timeout: 200 },
  { name: 'summary', fn: summaryExtractor.extract, timeout: 300 },
  { name: 'importance', fn: importanceExtractor.extract, timeout: 200 },
  { name: 'content_type', fn: contentTypeExtractor.extract, timeout: 100 } // NEW
];

// Update ChunkMetadata type to include content_type
interface ChunkMetadata {
  concepts?: ConceptMetadata;
  entities?: EntityMetadata;
  relationships?: RelationshipMetadata;
  sentiment?: SentimentMetadata;
  summary?: string;
  importance?: number;
  content_type?: ContentTypeMetadata; // NEW
  extraction_timestamp: string;
  extraction_version: string;
}
```

---

#### Task T-009: Implement Document Context Propagation
**Priority**: High  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 8 story points / 1 day  

**Dependencies**:
- **Prerequisite Tasks**: T-001, T-002
- **Parallel Tasks**: None
- **Blocked By**: Schema cleanup

**Acceptance Criteria**:
```gherkin
Scenario: Document context available to extractors
  Given a document being processed in chunks
  When each chunk is processed
  Then extractors receive document-level context
  And context includes title, total chunks, position
  And domain classification is consistent across chunks

Scenario: Context improves extraction quality
  Given extractors with document context
  When processing chunks
  Then extraction quality improves
  And domain consistency is maintained
```

**Implementation Details**:
```typescript
// Modify: worker/handlers/process-document.ts

interface DocumentContext {
  documentId: string;
  title: string;
  totalChunks: number;
  sourceType: string;
  documentMetadata?: {
    author?: string;
    publishDate?: string;
    domain?: string;
  };
}

async function processChunks(
  chunks: ProcessedChunk[],
  document: Document
): Promise<void> {
  // Create document context
  const context: DocumentContext = {
    documentId: document.id,
    title: document.title,
    totalChunks: chunks.length,
    sourceType: document.source_type,
    documentMetadata: document.metadata
  };
  
  // Process chunks with context
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Pass context to metadata extraction
    const metadata = await extractChunkMetadata(
      chunk.content,
      {
        ...context,
        chunkIndex: i,
        previousChunkType: i > 0 ? chunks[i-1].metadata?.content_type : undefined
      }
    );
    
    // Store chunk with enriched metadata
    await storeChunk({
      ...chunk,
      metadata,
      document_context: context
    });
  }
}

// Modify: worker/processors/base.ts
protected async extractChunkMetadata(
  content: string,
  context?: DocumentContext
): Promise<ChunkMetadata> {
  try {
    // Pass context to metadata extractor
    return await this.metadataExtractor.extract(content, context);
  } catch (error) {
    // Graceful degradation
    return this.createPartialMetadata();
  }
}
```

---

### Phase 3: Advanced Features

#### Task T-010: Implement Calculated Importance Scoring
**Priority**: Low  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 5 story points / 6 hours  

**Dependencies**:
- **Prerequisite Tasks**: Phase 1 & 2 complete
- **Parallel Tasks**: T-011, T-012
- **Blocked By**: T-009

**Acceptance Criteria**:
```gherkin
Scenario: Dynamic importance calculation
  Given a chunk of content
  When importance scoring runs
  Then score is calculated based on:
    - Concept density
    - Entity mentions
    - Structural position
    - Relationship count
  And score ranges from 0-10
  And default score of 5 is never used

Scenario: Context-aware scoring
  Given document context is available
  When calculating importance
  Then position in document affects score
  And frontmatter has lower importance
  And main content has higher importance
```

**Implementation Details**:
```typescript
// Modify: worker/lib/extractors/importance-extractor.ts

interface ImportanceFactors {
  conceptDensity: number;      // 0-1, weight: 0.3
  entityCount: number;          // 0-1, weight: 0.2
  structuralPosition: number;   // 0-1, weight: 0.2
  relationshipDensity: number;  // 0-1, weight: 0.15
  uniqueTermRatio: number;      // 0-1, weight: 0.15
}

async function calculateImportance(
  content: string,
  metadata: Partial<ChunkMetadata>,
  context?: DocumentContext
): Promise<number> {
  const factors: ImportanceFactors = {
    // Concept density: number of concepts per 100 words
    conceptDensity: calculateConceptDensity(content, metadata.concepts),
    
    // Entity count: normalized by content length
    entityCount: calculateEntityScore(metadata.entities),
    
    // Structural position: higher for middle chunks
    structuralPosition: calculatePositionScore(context),
    
    // Relationship density
    relationshipDensity: calculateRelationshipDensity(metadata.relationships),
    
    // Unique term ratio: vocabulary diversity
    uniqueTermRatio: calculateUniqueTermRatio(content)
  };
  
  // Weighted sum
  const score = 
    factors.conceptDensity * 0.3 +
    factors.entityCount * 0.2 +
    factors.structuralPosition * 0.2 +
    factors.relationshipDensity * 0.15 +
    factors.uniqueTermRatio * 0.15;
  
  // Scale to 0-10 range
  return Math.round(score * 10 * 10) / 10; // One decimal place
}

function calculatePositionScore(context?: DocumentContext): number {
  if (!context) return 0.5; // Default middle score
  
  const { chunkIndex, totalChunks } = context;
  const position = chunkIndex / totalChunks;
  
  // Bell curve: higher score for middle chunks
  if (position < 0.1 || position > 0.9) return 0.3;  // Intro/outro
  if (position < 0.3 || position > 0.7) return 0.7;  // Early/late
  return 1.0; // Core content
}
```

---

#### Task T-011: Implement Real Summary Generation
**Priority**: Low  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 8 story points / 1 day  

**Dependencies**:
- **Prerequisite Tasks**: Phase 1 & 2 complete
- **Parallel Tasks**: T-010, T-012
- **Blocked By**: None

**Acceptance Criteria**:
```gherkin
Scenario: Context-aware summarization
  Given a chunk of content
  When summary generation runs
  Then actual summarization occurs (not truncation)
  And summary captures key points
  And summary length is 50-150 characters
  And context from document is considered

Scenario: Quality summaries
  Given various content types
  When summaries are generated
  Then summaries are coherent
  And main ideas are preserved
  And no truncation artifacts appear
```

**Implementation Details**:
```typescript
// Modify: worker/lib/extractors/summary-extractor.ts

const SUMMARY_PROMPT = `
Generate a concise summary of the following content in 50-150 characters.
Focus on the main idea or key point. Be specific and informative.

Context:
- Document: {documentTitle}
- Section: {sectionType}
- Position: Chunk {chunkIndex} of {totalChunks}

Content to summarize:
{content}

Requirements:
- Capture the essential message
- Use complete sentences
- No truncation or ellipsis
- Be specific, not generic
`;

async function generateSummary(
  content: string,
  context?: DocumentContext
): Promise<string> {
  // For very short content, return as-is if coherent
  if (content.length < 150 && content.includes('.')) {
    return content.trim();
  }
  
  try {
    const prompt = SUMMARY_PROMPT
      .replace('{documentTitle}', context?.title || 'Unknown')
      .replace('{sectionType}', context?.sectionType || 'content')
      .replace('{chunkIndex}', String(context?.chunkIndex || 0))
      .replace('{totalChunks}', String(context?.totalChunks || 1))
      .replace('{content}', content.slice(0, 1000)); // Limit input length
    
    const summary = await geminiClient.generateContent({
      prompt,
      temperature: 0.3, // Lower for consistency
      maxTokens: 50
    });
    
    // Validate summary length and quality
    if (summary.length > 150) {
      // Truncate at sentence boundary
      const sentences = summary.match(/[^.!?]+[.!?]/g) || [];
      return sentences[0] || summary.slice(0, 147) + '...';
    }
    
    return summary;
  } catch (error) {
    // Fallback to intelligent truncation
    return createFallbackSummary(content);
  }
}

function createFallbackSummary(content: string): string {
  // Find first complete sentence
  const firstSentence = content.match(/^[^.!?]+[.!?]/)?.[0];
  if (firstSentence && firstSentence.length <= 150) {
    return firstSentence.trim();
  }
  
  // Truncate at word boundary
  const truncated = content.slice(0, 147);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace) + '...';
}
```

---

#### Task T-012: Enhance Relationship Extraction
**Priority**: Low  
**Source PRP Document**: docs/prps/metadata-extraction-quality-improvements.md  
**Estimated Effort**: 8 story points / 1 day  

**Dependencies**:
- **Prerequisite Tasks**: T-006
- **Parallel Tasks**: T-010, T-011
- **Blocked By**: T-006 (tokenization must be fixed)

**Acceptance Criteria**:
```gherkin
Scenario: Extract semantic relationships
  Given content with related concepts
  When relationship extraction runs
  Then semantic relationships are identified
  And relationship types are classified
  And strength scores are calculated
  And directional relationships are captured

Scenario: Advanced relationship types
  Given various content patterns
  When analyzing relationships
  Then multiple types are detected:
    - causal (causes, leads to)
    - temporal (before, after)
    - hierarchical (part of, contains)
    - comparative (similar to, contrasts with)
```

**Implementation Details**:
```typescript
// Modify: worker/lib/extractors/relationship-extractor.ts

interface TypedRelationship {
  source: string;
  target: string;
  type: 'causal' | 'temporal' | 'hierarchical' | 'comparative' | 'co-occurrence';
  direction: 'forward' | 'backward' | 'bidirectional';
  strength: number;
  context?: string;
}

const RELATIONSHIP_PATTERNS = {
  causal: [
    /(\w+)\s+(?:causes?|leads?\s+to|results?\s+in|produces?)\s+(\w+)/gi,
    /(\w+)\s+(?:because\s+of|due\s+to|caused\s+by)\s+(\w+)/gi
  ],
  temporal: [
    /(\w+)\s+(?:before|prior\s+to|preceded\s+by)\s+(\w+)/gi,
    /(\w+)\s+(?:after|following|succeeded\s+by)\s+(\w+)/gi
  ],
  hierarchical: [
    /(\w+)\s+(?:is\s+part\s+of|belongs\s+to|contained\s+in)\s+(\w+)/gi,
    /(\w+)\s+(?:contains?|includes?|comprises?)\s+(\w+)/gi
  ],
  comparative: [
    /(\w+)\s+(?:similar\s+to|like|resembles?)\s+(\w+)/gi,
    /(\w+)\s+(?:differs?\s+from|contrasts?\s+with|unlike)\s+(\w+)/gi
  ]
};

async function extractAdvancedRelationships(
  content: string,
  entities?: EntityMetadata
): Promise<TypedRelationship[]> {
  const relationships: TypedRelationship[] = [];
  
  // Pattern-based extraction
  for (const [type, patterns] of Object.entries(RELATIONSHIP_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        relationships.push({
          source: match[1].toLowerCase(),
          target: match[2].toLowerCase(),
          type: type as TypedRelationship['type'],
          direction: determineDirection(type, pattern),
          strength: 0.8, // Pattern matches have high confidence
          context: match[0]
        });
      }
    }
  }
  
  // Entity-based relationships
  if (entities) {
    relationships.push(...extractEntityRelationships(content, entities));
  }
  
  // Add co-occurrence relationships
  relationships.push(...extractCooccurrences(content));
  
  // Deduplicate and rank
  return deduplicateAndRank(relationships);
}

function determineDirection(
  type: string, 
  pattern: RegExp
): 'forward' | 'backward' | 'bidirectional' {
  if (type === 'comparative') return 'bidirectional';
  if (pattern.source.includes('by')) return 'backward';
  return 'forward';
}
```

---

## Sprint Organization

### Sprint 1 (Week 1-2): Critical Foundation
**Goal**: Fix fundamental quality issues  
**Tasks**: T-001, T-002, T-003, T-004, T-005  
**Deliverables**: 
- Schema cleaned up (50% storage reduction)
- Stop word filtering operational
- Entity extraction fixed

**Team Allocation**:
- Developer 1: T-001, T-002 (Database schema)
- Developer 2: T-003, T-004 (Stop word filtering)  
- Developer 3: T-005 (Entity extraction)

### Sprint 2 (Week 2-3): Quality Improvements - Part 1
**Goal**: Begin quality enhancements  
**Tasks**: T-006, T-007, T-008  
**Deliverables**:
- Text preprocessing fixed
- Content type detection implemented
- Orchestrator updated

**Team Allocation**:
- Developer 1: T-006 (Relationship tokenization)
- Developer 2: T-007, T-008 (Content type detection)
- Developer 3: Continue T-005 refinements + testing

### Sprint 3 (Week 3-4): Quality Improvements - Part 2
**Goal**: Complete quality improvements  
**Tasks**: T-009  
**Deliverables**:
- Document context propagation complete
- Consistent domain classification

**Team Allocation**:
- Full team: T-009 (Complex integration task)
- Parallel: Integration testing and validation

### Sprint 4 (Week 4-5): Advanced Features
**Goal**: Implement sophisticated scoring  
**Tasks**: T-010, T-011, T-012  
**Deliverables**:
- Importance scoring calculated
- Real summaries generated
- Advanced relationships extracted

**Team Allocation**:
- Developer 1: T-010 (Importance scoring)
- Developer 2: T-011 (Summary generation)
- Developer 3: T-012 (Relationship extraction)

### Sprint 5 (Week 5): Integration & Polish
**Goal**: Full system validation  
**Tasks**: Integration testing, performance tuning, documentation  
**Deliverables**:
- All acceptance criteria met
- Performance targets maintained
- Production ready

---

## Implementation Recommendations

### Suggested Team Structure
- **Tech Lead**: Architecture decisions, code reviews, integration
- **Backend Developer 1**: Database migrations, schema optimization
- **Backend Developer 2**: AI/ML extractors, prompt engineering
- **QA Engineer**: Validation suite, performance testing

### Optimal Task Sequencing
1. **Critical Path**: T-001 → T-002 → T-009 (schema must be clean before context propagation)
2. **Parallel Track 1**: T-003 → T-004 (stop word filtering)
3. **Parallel Track 2**: T-005 (entity extraction can start immediately)
4. **Parallel Track 3**: T-007 → T-008 (content type detection)

### Parallelization Opportunities
- Phase 1 tasks T-003 and T-005 can run in parallel
- Phase 2 tasks T-006, T-007 can run in parallel
- Phase 3 all tasks can run in parallel after Phase 2

### Resource Allocation Suggestions
- Allocate most experienced developer to T-009 (document context) - most complex
- AI/ML expertise needed for T-005, T-011, T-012
- Database expertise needed for T-001, T-002
- Junior developers can handle T-003, T-007

---

## Critical Path Analysis

### Tasks on Critical Path
1. **T-001**: Database schema analysis (blocks T-002)
2. **T-002**: Schema migration (blocks T-009)
3. **T-009**: Document context propagation (blocks Phase 3)
4. **T-010**: Importance scoring (depends on context)

### Potential Bottlenecks
- **Schema Migration**: T-002 requires careful data validation
- **Document Context**: T-009 touches multiple system components
- **AI Rate Limits**: Tasks using Gemini API may hit rate limits

### Schedule Optimization Suggestions
- Start T-005 (entity extraction) immediately - no dependencies
- Run T-003/T-004 in parallel with database work
- Batch AI operations to avoid rate limits
- Use feature flags for gradual rollout

---

## Risk Mitigation

### High Risk Areas
1. **Schema Migration**: Data loss risk → Implement comprehensive backups
2. **Performance Regression**: Extraction >100ms → Add performance monitoring
3. **AI Quality**: Prompt changes break extraction → Extensive validation testing

### Mitigation Strategies
- Create rollback scripts for all migrations
- Implement feature flags for new extractors
- Maintain performance benchmarks in CI/CD
- Use canary deployments for production rollout

---

## Success Metrics

### Phase 1 Success Criteria
- ✅ Storage reduced by 50%
- ✅ Zero stop words in top 10 concepts
- ✅ Entity extraction accuracy >90%

### Phase 2 Success Criteria  
- ✅ No tokenization errors
- ✅ Content types correctly identified
- ✅ Domain consistency across chunks

### Phase 3 Success Criteria
- ✅ No default importance scores
- ✅ Summaries are actual summaries
- ✅ Multiple relationship types detected

### Overall Success Criteria
- ✅ Extraction time <100ms maintained
- ✅ All existing tests pass
- ✅ Validation suite shows quality improvement
- ✅ 100% processing success rate maintained

---

**Document Generated**: 2025-09-30  
**Total Estimated Effort**: 80-96 story points across 22 tasks  
**Recommended Timeline**: 4-5 weeks with 3-developer team  
**Confidence Level**: High - comprehensive patterns exist in codebase