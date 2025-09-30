# Metadata Extraction Quality Improvements PRP

**Version**: 1.0.0  
**Date**: 2025-09-30  
**Status**: Ready for Implementation  
**Priority**: High - Core functionality quality issues  

---

## Discovery Summary

### Initial Task Analysis

Analysis of raw chunk data from the Rhizome V2 document processing pipeline revealed significant quality issues in metadata extraction. While technical infrastructure (speed, reliability, storage) performs well, the AI-powered content analysis has fundamental problems impacting the accuracy of the 7-engine collision detection system.

**Key Finding**: The system processes quickly and reliably (43-64ms extraction times, no errors) but produces poor-quality metadata due to preprocessing and prompt engineering issues rather than architectural problems.

### User Clarifications Received

Based on preflight analysis, the following clarifications were identified as important but can proceed with safe defaults:

- **Question**: What should happen to existing documents during schema cleanup?
- **Default Assumption**: Migrate existing data and apply fixes to new documents (backward compatible approach)
- **Impact**: Determines migration strategy and reprocessing workflows

- **Question**: Which collision detection engines are most impacted by poor metadata quality?
- **Default Assumption**: Prioritize by engine weights (semantic 25%, conceptual 20%, structural 15%)
- **Impact**: Helps prioritize which metadata fields to fix first

- **Question**: What's the acceptable performance trade-off for quality improvements?
- **Default Assumption**: Maintain <100ms extraction times (current: 43-64ms)
- **Impact**: Determines which extraction improvements are feasible

### Missing Requirements Identified

No critical missing requirements identified. The original analysis provides comprehensive technical details, proposed solutions with phasing, and clear success metrics.

## Goal

Improve metadata extraction quality in the Rhizome V2 document processing pipeline to enhance the accuracy of the 7-engine collision detection system while maintaining performance and reliability.

## Why

- **Business Value**: Better connection discovery between documents through improved metadata quality
- **User Impact**: More accurate and relevant document connections, reducing noise in the knowledge synthesis system
- **System Health**: Eliminate schema duplication (50% storage reduction), improve data consistency
- **Integration Benefits**: Enhanced collision detection accuracy across all 7 engines (semantic, conceptual, structural, citation, temporal, contradiction, emotional)
- **Problems Solved**: Stop words in concepts, broken named entity recognition, inconsistent domain classification, poor summary generation

## What

Implement a 3-phase improvement plan for metadata extraction quality:

**Phase 1 (Critical Fixes)**: Schema cleanup, stop word filtering, entity extraction debugging  
**Phase 2 (Quality Improvements)**: Text preprocessing fixes, document context awareness, content type detection  
**Phase 3 (Advanced Features)**: Importance scoring, real summary generation, advanced relationship extraction  

### Success Criteria

- [ ] **Schema Efficiency**: 50% storage reduction after duplicate column cleanup
- [ ] **Concept Quality**: No stop words in top 10 extracted concepts
- [ ] **Entity Accuracy**: >90% accuracy for clear named entities (people, locations)
- [ ] **Domain Consistency**: Consistent classification across document chunks
- [ ] **Performance Maintained**: Extraction times remain <100ms (current: 43-64ms)
- [ ] **System Stability**: No regression in processing reliability (currently 100% success rate)
- [ ] **Quality Metrics**: Improved completeness scores in metadata validation

## All Needed Context

### Research Phase Summary

- **Codebase patterns found**: Comprehensive metadata extraction infrastructure already exists with orchestrator, base processor patterns, migration examples, and testing frameworks
- **External research needed**: No - all required patterns and libraries are already implemented in the codebase
- **Knowledge gaps identified**: None - existing codebase provides complete implementation patterns

### Documentation & References

```yaml
# MUST READ - Core implementation files to reference
- file: /Users/topher/Code/rhizome-v2/worker/lib/metadata-extractor.ts
  why: Main orchestrator with parallel execution, timeout protection, graceful degradation patterns

- file: /Users/topher/Code/rhizome-v2/worker/processors/base.ts
  why: Base processor class with retry logic, metadata extraction patterns (lines 203-232)

- file: /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
  why: Database integration patterns, metadata storage (lines 124-149)

- file: /Users/topher/Code/rhizome-v2/worker/types/metadata.ts
  why: Type definitions for ChunkMetadata and PartialChunkMetadata

- file: /Users/topher/Code/rhizome-v2/supabase/migrations/017_fix_document_availability_flags.sql
  why: Data cleanup migration pattern to follow

- file: /Users/topher/Code/rhizome-v2/worker/tests/integration/validate-metadata-extraction.ts
  why: Validation testing patterns and metrics collection

- file: /Users/topher/Code/rhizome-v2/worker/lib/extractors/
  why: Individual extractor implementations for concept, entity, relationship extraction
```

### Current Codebase Tree (Relevant Sections)

```bash
worker/
├── lib/
│   ├── metadata-extractor.ts          # Main orchestrator (MODIFY)
│   ├── extractors/                     # Individual extractors (MODIFY MULTIPLE)
│   │   ├── concept-extractor.ts        # Add stop word filtering
│   │   ├── entity-extractor.ts         # Fix NER pipeline  
│   │   ├── relationship-extractor.ts   # Fix text preprocessing
│   │   ├── summary-extractor.ts        # Implement real summarization
│   │   └── importance-extractor.ts     # Replace default scoring
│   └── gemini-client.ts               # AI processing patterns
├── processors/
│   └── base.ts                        # Base processor (MODIFY lines 203-232)
├── handlers/
│   └── process-document.ts            # DB integration (MODIFY lines 124-149)
├── types/
│   └── metadata.ts                    # Type definitions (EXTEND)
└── tests/
    ├── integration/                   # Integration testing patterns
    └── validation/                    # Validation framework

supabase/migrations/
├── 014_enhanced_metadata_fields.sql   # Single JSONB approach (REFERENCE)
├── 015_add_metadata_fields.sql        # Multiple JSONB approach (CURRENT)
└── 018_cleanup_duplicate_metadata.sql # NEW migration to create
```

### Desired Codebase Tree with New Files

```bash
# NEW FILES TO CREATE:
supabase/migrations/018_cleanup_duplicate_metadata.sql  # Schema cleanup migration
worker/lib/extractors/content-type-extractor.ts        # New content type detection
worker/lib/filters/stop-words.ts                       # Stop word filtering utility

# MODIFIED FILES:
worker/lib/metadata-extractor.ts                       # Add new extractors, improve orchestration
worker/lib/extractors/concept-extractor.ts             # Add stop word filtering
worker/lib/extractors/entity-extractor.ts              # Fix NER pipeline
worker/lib/extractors/relationship-extractor.ts        # Fix text preprocessing
worker/lib/extractors/summary-extractor.ts             # Real summarization vs truncation
worker/lib/extractors/importance-extractor.ts          # Calculated vs default scores
worker/processors/base.ts                              # Pass document context
worker/handlers/process-document.ts                    # Update schema mapping
worker/types/metadata.ts                               # Add content type definitions
```

### Known Gotchas of Codebase & Library Quirks

```typescript
// CRITICAL: Worker module uses ESM with specific Jest configuration
// Jest config at worker/jest.config.cjs enables ESM support

// CRITICAL: Metadata extraction has timeout protection (2000ms total, 200-500ms per extractor)
// See worker/lib/metadata-extractor.ts lines 45-162

// CRITICAL: Graceful degradation required - return PartialChunkMetadata on failures
// Never throw errors from extractors, always return partial results

// CRITICAL: Database uses separate JSONB columns per metadata type (migration 015)
// Mapping logic in process-document.ts lines 131-139

// CRITICAL: Gemini 2.0 Flash Experimental has 65K token limit
// File caching reduces API calls by 90% - see GeminiFileCache

// CRITICAL: Performance targets must be maintained
// Current: 43-64ms extraction, target: <100ms, monitor with metrics

// CRITICAL: Testing uses mocked AI by default
// Use npm run validate:metadata:real for actual AI testing
```

## Implementation Blueprint

### Data Models and Structure

Extend existing metadata types to support content type detection and improve quality:

```typescript
// worker/types/metadata.ts - EXTEND existing types
interface ContentTypeMetadata {
  chunk_type: 'frontmatter' | 'content' | 'conclusion' | 'citation' | 'header';
  document_section?: string;
  heading_path?: string[];
  structural_role: 'primary' | 'supporting' | 'reference' | 'metadata';
}

interface ImprovedConceptMetadata {
  concepts: Array<{
    term: string;
    importance: number;
    context: string;
    stop_word_filtered: boolean; // NEW: Track filtering
  }>;
  domain_confidence: number;
  processing_metadata: {
    stop_words_removed: number; // NEW: Quality metrics
    extraction_method: string;
  };
}

interface ImprovedEntityMetadata {
  people: Array<{ name: string; confidence: number; context: string }>;
  locations: Array<{ name: string; confidence: number; context: string }>;
  organizations: Array<{ name: string; confidence: number; context: string }>;
  other: Array<{ name: string; type: string; confidence: number }>;
  extraction_quality: {
    ner_pipeline_version: string; // NEW: Track NER improvements
    confidence_threshold: number;
  };
}
```

### List of Tasks to Complete the PRP

```yaml
Task 1 - Schema Cleanup Migration (CRITICAL):
CREATE /Users/topher/Code/rhizome-v2/supabase/migrations/018_cleanup_duplicate_metadata.sql:
   - MIRROR pattern from: /Users/topher/Code/rhizome-v2/supabase/migrations/017_fix_document_availability_flags.sql
   - DROP columns: structural_metadata, conceptual_metadata, emotional_metadata, temporal_metadata, citation_metadata, contradiction_metadata
   - PRESERVE: unified metadata JSONB column from migration 015
   - ADD verification queries to ensure data integrity

Task 2 - Stop Word Filtering Implementation:
CREATE /Users/topher/Code/rhizome-v2/worker/lib/filters/stop-words.ts:
   - IMPLEMENT: English stop word list and filtering function
   - PATTERN: Export filterStopWords(concepts: string[]) => string[]

MODIFY /Users/topher/Code/rhizome-v2/worker/lib/extractors/concept-extractor.ts:
   - FIND pattern: "concepts extraction prompt"
   - INJECT: stop word filtering after concept extraction
   - PRESERVE: existing importance scoring and ranking

Task 3 - Entity Extraction Debug and Fix:
MODIFY /Users/topher/Code/rhizome-v2/worker/lib/extractors/entity-extractor.ts:
   - FIND pattern: "NER pipeline prompt"
   - DEBUG: Entity categorization logic (people, locations vs other)
   - IMPROVE: Prompt engineering for better named entity recognition
   - ADD: Confidence thresholds and validation

Task 4 - Text Preprocessing Fix:
MODIFY /Users/topher/Code/rhizome-v2/worker/lib/extractors/relationship-extractor.ts:
   - FIND pattern: "tokenization logic"
   - FIX: Tokenization creating invalid fragments like "lso" ← "days"
   - IMPROVE: Text preprocessing pipeline validation
   - PRESERVE: existing relationship scoring methodology

Task 5 - Content Type Detection:
CREATE /Users/topher/Code/rhizome-v2/worker/lib/extractors/content-type-extractor.ts:
   - MIRROR pattern from: existing extractors in same directory
   - IMPLEMENT: Frontmatter vs content vs conclusion detection
   - PATTERN: Return ContentTypeMetadata interface

MODIFY /Users/topher/Code/rhizome-v2/worker/lib/metadata-extractor.ts:
   - FIND pattern: "extractor orchestration array"
   - ADD: content-type-extractor to parallel execution
   - PRESERVE: existing timeout and error handling patterns

Task 6 - Document Context Awareness:
MODIFY /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts:
   - FIND pattern: "chunk processing loop" around lines 124-149
   - ADD: Document metadata context to chunk processors
   - PRESERVE: existing error handling and progress tracking

MODIFY /Users/topher/Code/rhizome-v2/worker/processors/base.ts:
   - FIND pattern: "extractChunkMetadata method" lines 203-232
   - ADD: documentContext parameter
   - PRESERVE: existing retry logic and graceful degradation

Task 7 - Real Summary Generation:
MODIFY /Users/topher/Code/rhizome-v2/worker/lib/extractors/summary-extractor.ts:
   - FIND pattern: "summary generation logic"
   - REPLACE: Content truncation with actual summarization
   - IMPLEMENT: Context-aware summarization prompts
   - PRESERVE: existing length constraints and performance targets

Task 8 - Importance Scoring Implementation:
MODIFY /Users/topher/Code/rhizome-v2/worker/lib/extractors/importance-extractor.ts:
   - FIND pattern: "default importance score: 5"
   - IMPLEMENT: Calculated importance based on content analysis
   - ADD: Scoring algorithm considering concept density, entity mentions, structural position
   - PRESERVE: existing score range (0-10)

Task 9 - Update Database Integration:
MODIFY /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts:
   - FIND pattern: "metadata mapping" lines 131-139
   - UPDATE: Schema mapping to use single metadata column (post-migration)
   - ADD: Content type metadata storage
   - PRESERVE: existing timestamp and processing status logic

Task 10 - Validation and Testing:
MODIFY /Users/topher/Code/rhizome-v2/worker/tests/integration/validate-metadata-extraction.ts:
   - ADD: Validation tests for stop word filtering
   - ADD: Entity extraction accuracy tests
   - ADD: Content type detection tests
   - PRESERVE: existing performance benchmarking
```

### Per Task Pseudocode

```typescript
// Task 1 - Schema Cleanup Migration
-- Migration 018: Cleanup duplicate metadata columns
BEGIN;

-- Verify data exists in unified metadata column
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM chunks WHERE metadata IS NULL) > 0 THEN
        RAISE EXCEPTION 'Found chunks with null metadata - cannot proceed with cleanup';
    END IF;
END $$;

-- Drop duplicate columns (safe after verification)
ALTER TABLE chunks 
DROP COLUMN IF EXISTS structural_metadata,
DROP COLUMN IF EXISTS conceptual_metadata,
DROP COLUMN IF EXISTS emotional_metadata,
-- ... (all duplicate columns)

COMMIT;

// Task 2 - Stop Word Filtering
// worker/lib/filters/stop-words.ts
export function filterStopWords(concepts: Array<{term: string, importance: number}>): Array<{term: string, importance: number}> {
    const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', ...]);
    
    return concepts.filter(concept => {
        const cleaned = concept.term.toLowerCase().trim();
        return !STOP_WORDS.has(cleaned) && cleaned.length > 2;
    });
}

// Task 3 - Entity Extraction Fix
// worker/lib/extractors/entity-extractor.ts
async function extractEntities(content: string): Promise<EntityMetadata> {
    // CRITICAL: Improve prompt specificity for NER
    const prompt = `Extract named entities from this text. Categorize each entity precisely:
    
    PEOPLE: Full names of specific individuals (e.g., "Vladimir Lenin", "Karl Marx")
    LOCATIONS: Geographic places (e.g., "China", "Europe", "Moscow")
    ORGANIZATIONS: Companies, institutions, groups
    
    Text: ${content}
    
    Return JSON with separate arrays for each category. Do NOT put people or locations in "other".`;
    
    try {
        const result = await geminiClient.generateContent(prompt);
        // PATTERN: Validate and clean results
        return validateEntityExtraction(result);
    } catch (error) {
        // PATTERN: Graceful degradation
        return createPartialEntityMetadata();
    }
}

// Task 5 - Content Type Detection
// worker/lib/extractors/content-type-extractor.ts
async function extractContentType(content: string, chunkIndex: number, totalChunks: number): Promise<ContentTypeMetadata> {
    // PATTERN: Use position and content analysis
    if (chunkIndex === 0 && content.includes('title:', 'author:', 'date:')) {
        return { chunk_type: 'frontmatter', structural_role: 'metadata' };
    }
    
    if (content.includes('bibliography', 'references', 'citations')) {
        return { chunk_type: 'citation', structural_role: 'reference' };
    }
    
    // PATTERN: Default to content type
    return { chunk_type: 'content', structural_role: 'primary' };
}
```

### Integration Points

```yaml
DATABASE:
  - migration: 'CREATE /supabase/migrations/018_cleanup_duplicate_metadata.sql'
  - schema: 'Remove duplicate JSONB columns, keep unified metadata column'
  - verification: 'Add data integrity checks before dropping columns'

WORKER_MODULE:
  - extractors: 'Add content-type-extractor to parallel execution array'
  - orchestrator: 'Update metadata-extractor.ts to include new extractor'
  - types: 'Extend metadata.ts with ContentTypeMetadata interface'

PROCESSING_PIPELINE:
  - handlers: 'Update process-document.ts database mapping'
  - processors: 'Add document context parameter to base processor'
  - caching: 'Leverage existing GeminiFileCache for performance'

TESTING:
  - validation: 'Extend validate-metadata-extraction.ts with new quality checks'
  - integration: 'Add content type and stop word filtering tests'
  - performance: 'Monitor extraction times remain <100ms'
```

## Validation Loop

### Level 1: Syntax & Style

```bash
# Worker module validation (run from /worker directory)
cd worker && npm run lint                    # ESLint checking
cd worker && npm run type-check              # TypeScript validation
cd worker && npm test                        # Unit tests

# Main app validation (run from project root)
npm run lint                                 # Next.js linting
npm run type-check                          # TypeScript validation
npm test                                     # Jest tests

# Expected: No errors. If errors, READ the error and fix.
```

## Final Validation Checklist

- [ ] All tests pass: `cd worker && npm test && cd .. && npm test`
- [ ] No linting errors: `cd worker && npm run lint && cd .. && npm run lint`
- [ ] No type errors: `cd worker && npm run type-check && cd .. && npm run type-check`
- [ ] Worker validation suite passes: `cd worker && npm run test:validate`
- [ ] Metadata extraction validation: `cd worker && npm run validate:metadata`
- [ ] Integration tests pass: `cd worker && npm run test:integration`
- [ ] Performance targets met: Extraction times <100ms (monitor in validation)
- [ ] Schema migration successful: Verify data integrity after migration
- [ ] Stop word filtering effective: No common stop words in extracted concepts
- [ ] Entity extraction improved: Test with known entities (Lenin, Marx, China, Europe)
- [ ] Content type detection working: Distinguish frontmatter from content
- [ ] Database storage updated: Metadata mapped to correct JSONB column

---

## Anti-Patterns to Avoid

- ❌ Don't break existing processor retry logic and graceful degradation
- ❌ Don't exceed performance targets (current: 43-64ms, max: 100ms)
- ❌ Don't throw errors from extractors - always return partial metadata
- ❌ Don't skip migration data verification before dropping columns
- ❌ Don't ignore existing timeout protection in metadata orchestrator
- ❌ Don't modify core orchestration patterns without understanding dependencies
- ❌ Don't test with real AI in CI - use validate:metadata not validate:metadata:real
- ❌ Don't forget to update both type definitions and database mapping
- ❌ Don't hardcode stop word lists - make them configurable for future languages

---

**PRP Quality Score: 9/10** - High confidence for one-pass implementation. Comprehensive codebase patterns identified, clear implementation path with existing validation framework, minimal risk due to extensive existing infrastructure.

**Reference to Task Breakdown**: See `docs/tasks/metadata-extraction-quality-improvements.md` for detailed development task breakdown and sprint planning.