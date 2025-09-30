# Week 2: Metadata Enrichment Tasks

> **Sprint Duration**: Feb 5 - Feb 11, 2025  
> **Goal**: Enhance metadata extraction for 7-engine collision detection requirements  
> **Expected Outcome**: Rich metadata on all chunks enabling sophisticated knowledge synthesis

## Task Identification Summary

| Task ID | Task Name | Priority | Dependencies | Effort |
|---------|-----------|----------|--------------|--------|
| T-013 | Design enhanced metadata schema | Critical | None | 4h |
| T-014 | Implement structural patterns extractor | Critical | T-013 | 6h |
| T-015 | Implement emotional tone analyzer | High | T-013 | 5h |
| T-016 | Implement key concepts extractor | Critical | T-013 | 5h |
| T-017 | Implement method signatures detector | High | T-013 | 4h |
| T-018 | Implement narrative rhythm analyzer | Medium | T-013 | 4h |
| T-019 | Create metadata extraction pipeline | Critical | T-014 to T-018 | 6h |
| T-020 | Database migration for new fields | Critical | T-013 | 3h |
| T-021 | Update all processors for metadata | Critical | T-019, T-020 | 6h |
| T-022 | Backward compatibility validation | High | T-021 | 4h |
| T-023 | Metadata quality validation | Critical | T-021 | 5h |

---

## T-013: Design Enhanced Metadata Schema

**Priority**: Critical  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 42-45

### Task Purpose
**As a** 7-engine collision detection system  
**I need** a comprehensive metadata schema  
**So that** engines have rich data for connection discovery

### Dependencies
- **Prerequisite Tasks**: Week 1 completion
- **Parallel Tasks**: None (blocks all other Week 2 tasks)
- **Integration Points**: Database schema, all extractors
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When designing schema, the system shall support 7 distinct metadata types
- **REQ-2**: While maintaining compatibility, the system shall preserve existing fields
- **REQ-3**: Where nulls exist, the system shall handle gracefully

#### Non-Functional Requirements
- **Performance**: Metadata adds < 5s to processing
- **Storage**: Metadata < 10KB per chunk
- **Flexibility**: Schema extensible for future engines

### Implementation Details

#### Files to Modify/Create
```
├── worker/types/metadata.ts - [Create: Metadata type definitions]
├── docs/metadata-schema.md - [Create: Schema documentation]
└── supabase/migrations/013_metadata_fields.sql - [Create: Migration planning]
```

#### Key Implementation Steps
1. **Step 1**: Define TypeScript interfaces → Type safety
2. **Step 2**: Document field purposes → Clear understanding
3. **Step 3**: Plan database migration → Schema changes
4. **Step 4**: Design extraction strategies → Implementation plan
5. **Step 5**: Create validation schemas → Data quality

#### Code Patterns to Follow
- **Type Pattern**: Use discriminated unions for metadata types
- **Validation Pattern**: Zod schemas for runtime validation
- **Documentation Pattern**: Clear field descriptions

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Schema completeness
  Given the metadata schema design
  When reviewing for 7-engine needs
  Then all required fields are present
  And types are properly defined
  And validation rules are clear

Scenario 2: Backward compatibility
  Given existing chunks in database
  When new schema is applied
  Then existing data remains valid
  And null handling is defined
  And no data loss occurs

Scenario 3: Extraction planning
  Given each metadata field
  When extraction strategy is defined
  Then AI prompts are documented
  And performance impact is estimated
  And quality metrics are defined
```

#### Rule-Based Criteria (Checklist)
- [ ] **Complete**: All 7 metadata types defined
- [ ] **Compatible**: Existing fields preserved
- [ ] **Documented**: Clear field descriptions
- [ ] **Validated**: Zod schemas created
- [ ] **Extensible**: Room for future growth
- [ ] **Performant**: Size limits defined

### Manual Testing Steps
1. **Setup**: Review existing chunk structure
2. **Test Case 1**: Validate schema against sample data
3. **Test Case 2**: Test null handling scenarios
4. **Test Case 3**: Verify size constraints
5. **Test Case 4**: Test validation rules

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Schema validation
npm run validate:schema

# Size analysis
npm run analyze:metadata-size
```

#### Definition of Done
- [ ] Schema fully defined in TypeScript
- [ ] Documentation complete
- [ ] Migration SQL prepared
- [ ] Validation schemas created
- [ ] Team review completed

---

## T-014: Implement Structural Patterns Extractor

**Priority**: Critical  
**Effort**: 6 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 44

### Task Purpose
**As a** collision detection engine  
**I need** structural pattern extraction from chunks  
**So that** I can identify similar document organization

### Dependencies
- **Prerequisite Tasks**: T-013 (schema design)
- **Parallel Tasks**: T-015, T-016, T-017, T-018
- **Integration Points**: AI processing, chunk analysis
- **Blocked By**: T-013

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When analyzing chunks, the system shall identify structural patterns
- **REQ-2**: While extracting, the system shall detect headings, lists, sections
- **REQ-3**: Where patterns repeat, the system shall recognize templates

#### Non-Functional Requirements
- **Performance**: Extraction < 500ms per chunk
- **Accuracy**: >85% pattern identification
- **Granularity**: Support nested structures

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/extractors/structural-patterns.ts - [Create: Pattern extractor]
├── worker/lib/extractors/prompts/structural.ts - [Create: AI prompts]
└── worker/tests/extractors/structural.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Create pattern detection logic → Core algorithm
2. **Step 2**: Implement AI prompt for structure → Enhanced detection
3. **Step 3**: Add pattern classification → Pattern types
4. **Step 4**: Create confidence scoring → Quality metrics
5. **Step 5**: Add caching for patterns → Performance

#### Code Patterns to Follow
- **Extraction Pattern**: Input chunk → AI analysis → structured output
- **Prompt Pattern**: Clear, specific instructions with examples
- **Scoring Pattern**: 0-1 confidence scores

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: List detection
  Given a chunk with bullet points
  When structural extraction runs
  Then list pattern is identified
  And list type is classified
  And items are counted

Scenario 2: Section hierarchy
  Given nested headings in content
  When analyzing structure
  Then hierarchy levels are detected
  And parent-child relationships mapped
  And outline structure extracted

Scenario 3: Template recognition
  Given repeated document patterns
  When comparing structures
  Then templates are identified
  And variations noted
  And confidence scores assigned
```

#### Rule-Based Criteria (Checklist)
- [ ] **Detection**: All major patterns identified
- [ ] **Classification**: Pattern types defined
- [ ] **Scoring**: Confidence metrics working
- [ ] **Performance**: <500ms per chunk
- [ ] **Accuracy**: >85% correct identification
- [ ] **Testing**: Comprehensive test coverage

### Manual Testing Steps
1. **Setup**: Prepare chunks with various structures
2. **Test Case 1**: Test list detection (bullet, numbered, nested)
3. **Test Case 2**: Test heading hierarchy extraction
4. **Test Case 3**: Test table/grid detection
5. **Test Case 4**: Measure extraction performance

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Unit tests
npm test extractors/structural-patterns.test.js

# Performance test
npm run benchmark:structural-extraction

# Accuracy validation
npm run validate:structural-accuracy
```

#### Definition of Done
- [ ] Extractor implemented
- [ ] AI prompts optimized
- [ ] Performance targets met
- [ ] Accuracy >85%
- [ ] Tests passing

---

## T-015: Implement Emotional Tone Analyzer

**Priority**: High  
**Effort**: 5 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 44

### Task Purpose
**As a** collision detection engine  
**I need** emotional tone analysis of content  
**So that** I can match documents by sentiment and mood

### Dependencies
- **Prerequisite Tasks**: T-013 (schema design)
- **Parallel Tasks**: T-014, T-016, T-017, T-018
- **Integration Points**: AI sentiment analysis
- **Blocked By**: T-013

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When analyzing text, the system shall detect emotional tone
- **REQ-2**: While processing, the system shall identify sentiment polarity
- **REQ-3**: Where emotions mix, the system shall capture complexity

#### Non-Functional Requirements
- **Performance**: Analysis < 300ms per chunk
- **Accuracy**: >80% sentiment agreement with human labels
- **Granularity**: Multiple emotion detection

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/extractors/emotional-tone.ts - [Create: Tone analyzer]
├── worker/lib/extractors/prompts/emotional.ts - [Create: Sentiment prompts]
└── worker/tests/extractors/emotional.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Create emotion taxonomy → Emotion categories
2. **Step 2**: Implement AI sentiment analysis → Core detection
3. **Step 3**: Add polarity scoring (-1 to +1) → Quantification
4. **Step 4**: Detect mixed emotions → Complexity handling
5. **Step 5**: Add confidence scoring → Quality metrics

#### Code Patterns to Follow
- **Emotion Model**: Plutchik's wheel or similar
- **Scoring Pattern**: Normalized -1 to +1 range
- **Multi-label Pattern**: Multiple emotions per chunk

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Basic sentiment
  Given text with clear emotion
  When tone analysis runs
  Then primary emotion is identified
  And polarity score is accurate
  And confidence is high

Scenario 2: Mixed emotions
  Given complex emotional content
  When analyzing tone
  Then multiple emotions detected
  And relative strengths provided
  And complexity captured

Scenario 3: Neutral content
  Given factual, neutral text
  When analyzing tone
  Then neutral tone identified
  And polarity near zero
  And appropriate confidence
```

#### Rule-Based Criteria (Checklist)
- [ ] **Categories**: Emotion taxonomy defined
- [ ] **Detection**: Primary emotions identified
- [ ] **Scoring**: Polarity scores accurate
- [ ] **Complexity**: Mixed emotions handled
- [ ] **Performance**: <300ms per chunk
- [ ] **Validation**: Human agreement >80%

### Manual Testing Steps
1. **Setup**: Prepare emotionally varied chunks
2. **Test Case 1**: Test positive sentiment detection
3. **Test Case 2**: Test negative sentiment detection
4. **Test Case 3**: Test neutral/factual content
5. **Test Case 4**: Test mixed emotion scenarios

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Unit tests
npm test extractors/emotional-tone.test.js

# Accuracy validation
npm run validate:sentiment-accuracy

# Performance benchmark
npm run benchmark:tone-analysis
```

#### Definition of Done
- [ ] Analyzer implemented
- [ ] Emotion taxonomy defined
- [ ] Accuracy validated >80%
- [ ] Performance <300ms
- [ ] Tests comprehensive

---

## T-016: Implement Key Concepts Extractor

**Priority**: Critical  
**Effort**: 5 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 44

### Task Purpose
**As a** collision detection engine  
**I need** key concept extraction from chunks  
**So that** I can identify thematic connections

### Dependencies
- **Prerequisite Tasks**: T-013 (schema design)
- **Parallel Tasks**: T-014, T-015, T-017, T-018
- **Integration Points**: NLP, entity extraction
- **Blocked By**: T-013

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When analyzing chunks, the system shall extract key concepts
- **REQ-2**: While extracting, the system shall rank by importance
- **REQ-3**: Where concepts relate, the system shall note relationships

#### Non-Functional Requirements
- **Performance**: Extraction < 400ms per chunk
- **Quality**: Precision > 0.75, Recall > 0.70
- **Limit**: 5-10 concepts per chunk

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/extractors/key-concepts.ts - [Create: Concept extractor]
├── worker/lib/extractors/prompts/concepts.ts - [Create: Extraction prompts]
└── worker/tests/extractors/concepts.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Create concept extraction logic → Core algorithm
2. **Step 2**: Implement importance ranking → Prioritization
3. **Step 3**: Add relationship detection → Concept links
4. **Step 4**: Create deduplication logic → Clean results
5. **Step 5**: Add domain detection → Context awareness

#### Code Patterns to Follow
- **Extraction Pattern**: TF-IDF + AI enhancement
- **Ranking Pattern**: Importance scores 0-1
- **Relationship Pattern**: Graph-like connections

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Concept extraction
  Given a chunk with technical content
  When concept extraction runs
  Then key terms are identified
  And ranked by importance
  And limited to 10 concepts

Scenario 2: Relationship detection
  Given related concepts in text
  When analyzing relationships
  Then connections are identified
  And relationship types noted
  And strength scores provided

Scenario 3: Domain specificity
  Given domain-specific content
  When extracting concepts
  Then domain terms prioritized
  And context preserved
  And jargon handled correctly
```

#### Rule-Based Criteria (Checklist)
- [ ] **Extraction**: Key concepts identified
- [ ] **Ranking**: Importance scores accurate
- [ ] **Relationships**: Connections mapped
- [ ] **Quality**: Precision > 0.75
- [ ] **Limit**: 5-10 concepts per chunk
- [ ] **Performance**: <400ms extraction

### Manual Testing Steps
1. **Setup**: Prepare diverse content chunks
2. **Test Case 1**: Extract from technical content
3. **Test Case 2**: Extract from narrative content
4. **Test Case 3**: Test relationship detection
5. **Test Case 4**: Validate importance ranking

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Unit tests
npm test extractors/key-concepts.test.js

# Quality metrics
npm run validate:concept-quality

# Performance test
npm run benchmark:concept-extraction
```

#### Definition of Done
- [ ] Extractor implemented
- [ ] Ranking algorithm working
- [ ] Relationships detected
- [ ] Quality metrics met
- [ ] Performance validated

---

## T-017: Implement Method Signatures Detector

**Priority**: High  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 44

### Task Purpose
**As a** collision detection engine  
**I need** method signature detection in code chunks  
**So that** I can match similar implementations

### Dependencies
- **Prerequisite Tasks**: T-013 (schema design)
- **Parallel Tasks**: T-014, T-015, T-016, T-018
- **Integration Points**: Code parsing, pattern matching
- **Blocked By**: T-013

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When analyzing code, the system shall detect function signatures
- **REQ-2**: While parsing, the system shall extract parameters and types
- **REQ-3**: Where patterns exist, the system shall identify conventions

#### Non-Functional Requirements
- **Performance**: Detection < 200ms per chunk
- **Accuracy**: >90% for common languages
- **Coverage**: Support JS, TS, Python, Java

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/extractors/method-signatures.ts - [Create: Signature detector]
├── worker/lib/extractors/patterns/code.ts - [Create: Language patterns]
└── worker/tests/extractors/signatures.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Create regex patterns for languages → Pattern library
2. **Step 2**: Implement signature extraction → Core detection
3. **Step 3**: Add parameter parsing → Detailed analysis
4. **Step 4**: Detect naming conventions → Style patterns
5. **Step 5**: Add complexity scoring → Quality metrics

#### Code Patterns to Follow
- **Regex Pattern**: Language-specific patterns
- **AST Pattern**: Optional parsing for accuracy
- **Normalization Pattern**: Standardized output

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Function detection
  Given JavaScript code chunk
  When signature detection runs
  Then functions are identified
  And parameters extracted
  And return types noted

Scenario 2: Class methods
  Given object-oriented code
  When analyzing methods
  Then class context preserved
  And method signatures extracted
  And visibility noted

Scenario 3: Multiple languages
  Given code in various languages
  When detection runs
  Then language identified
  And appropriate patterns used
  And signatures extracted correctly
```

#### Rule-Based Criteria (Checklist)
- [ ] **Detection**: Functions found accurately
- [ ] **Parsing**: Parameters extracted
- [ ] **Languages**: JS, TS, Python, Java
- [ ] **Accuracy**: >90% detection rate
- [ ] **Performance**: <200ms per chunk
- [ ] **Patterns**: Conventions identified

### Manual Testing Steps
1. **Setup**: Prepare code chunks in multiple languages
2. **Test Case 1**: Test JavaScript function detection
3. **Test Case 2**: Test TypeScript with types
4. **Test Case 3**: Test Python method detection
5. **Test Case 4**: Test Java class methods

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Unit tests
npm test extractors/method-signatures.test.js

# Language coverage
npm run test:language-coverage

# Accuracy validation
npm run validate:signature-accuracy
```

#### Definition of Done
- [ ] Detector implemented
- [ ] Multi-language support
- [ ] >90% accuracy
- [ ] Performance <200ms
- [ ] Tests comprehensive

---

## T-018: Implement Narrative Rhythm Analyzer

**Priority**: Medium  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 44

### Task Purpose
**As a** collision detection engine  
**I need** narrative rhythm analysis  
**So that** I can match documents by writing style

### Dependencies
- **Prerequisite Tasks**: T-013 (schema design)
- **Parallel Tasks**: T-014, T-015, T-016, T-017
- **Integration Points**: Text analysis, style detection
- **Blocked By**: T-013

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When analyzing text, the system shall detect rhythm patterns
- **REQ-2**: While processing, the system shall measure sentence variation
- **REQ-3**: Where style changes, the system shall note transitions

#### Non-Functional Requirements
- **Performance**: Analysis < 300ms per chunk
- **Metrics**: Quantifiable rhythm scores
- **Sensitivity**: Detect subtle style changes

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/extractors/narrative-rhythm.ts - [Create: Rhythm analyzer]
├── worker/lib/extractors/metrics/rhythm.ts - [Create: Rhythm metrics]
└── worker/tests/extractors/rhythm.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Create rhythm metrics → Measurement system
2. **Step 2**: Implement sentence analysis → Length patterns
3. **Step 3**: Add paragraph structure → Flow analysis
4. **Step 4**: Detect style transitions → Change points
5. **Step 5**: Create rhythm fingerprint → Unique signature

#### Code Patterns to Follow
- **Metrics Pattern**: Statistical measures
- **Window Pattern**: Sliding window analysis
- **Fingerprint Pattern**: Unique style signature

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Rhythm detection
  Given narrative text
  When rhythm analysis runs
  Then sentence patterns identified
  And variation measured
  And rhythm score calculated

Scenario 2: Style transitions
  Given text with style changes
  When analyzing rhythm
  Then transitions detected
  And change points marked
  And patterns documented

Scenario 3: Consistent style
  Given uniform writing style
  When analyzing rhythm
  Then consistency recognized
  And low variation scored
  And signature stable
```

#### Rule-Based Criteria (Checklist)
- [ ] **Metrics**: Rhythm scores defined
- [ ] **Detection**: Pattern identification
- [ ] **Transitions**: Style changes found
- [ ] **Fingerprint**: Unique signatures
- [ ] **Performance**: <300ms analysis
- [ ] **Validation**: Metrics meaningful

### Manual Testing Steps
1. **Setup**: Prepare varied narrative styles
2. **Test Case 1**: Test academic writing rhythm
3. **Test Case 2**: Test creative writing rhythm
4. **Test Case 3**: Test technical documentation
5. **Test Case 4**: Test style transitions

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Unit tests
npm test extractors/narrative-rhythm.test.js

# Metric validation
npm run validate:rhythm-metrics

# Performance test
npm run benchmark:rhythm-analysis
```

#### Definition of Done
- [ ] Analyzer implemented
- [ ] Metrics calculated
- [ ] Transitions detected
- [ ] Performance <300ms
- [ ] Tests complete

---

## T-019: Create Metadata Extraction Pipeline

**Priority**: Critical  
**Effort**: 6 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 42-45, 70-71

### Task Purpose
**As a** document processing system  
**I need** a unified metadata extraction pipeline  
**So that** all extractors work together efficiently

### Dependencies
- **Prerequisite Tasks**: T-014 to T-018 (all extractors)
- **Parallel Tasks**: T-020
- **Integration Points**: All extractors, processors
- **Blocked By**: T-014, T-015, T-016, T-017, T-018

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing chunks, the system shall run all extractors
- **REQ-2**: While extracting, the system shall parallelize where possible
- **REQ-3**: Where errors occur, the system shall handle gracefully

#### Non-Functional Requirements
- **Performance**: Total extraction < 2 seconds per chunk
- **Reliability**: Partial failures don't stop pipeline
- **Orchestration**: Efficient parallel execution

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/metadata-extractor.ts - [Create: Pipeline orchestrator]
├── worker/lib/extractors/index.ts - [Create: Extractor exports]
└── worker/tests/metadata-pipeline.test.js - [Create: Integration tests]
```

#### Key Implementation Steps
1. **Step 1**: Create pipeline orchestrator → Central coordinator
2. **Step 2**: Implement parallel execution → Performance optimization
3. **Step 3**: Add error boundaries → Graceful degradation
4. **Step 4**: Create result aggregation → Combined metadata
5. **Step 5**: Add pipeline monitoring → Performance tracking

#### Code Patterns to Follow
- **Pipeline Pattern**: Promise.allSettled for parallel
- **Error Pattern**: Partial success handling
- **Aggregation Pattern**: Merge metadata objects

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Full extraction
  Given a chunk to process
  When pipeline executes
  Then all extractors run
  And results are aggregated
  And metadata is complete

Scenario 2: Parallel execution
  Given multiple extractors
  When pipeline runs
  Then independent extractors run in parallel
  And dependent ones run sequentially
  And performance is optimized

Scenario 3: Partial failure
  Given one extractor fails
  When pipeline completes
  Then other extractors succeed
  And partial metadata returned
  And error is logged
```

#### Rule-Based Criteria (Checklist)
- [ ] **Integration**: All extractors connected
- [ ] **Parallelization**: Efficient execution
- [ ] **Error Handling**: Graceful degradation
- [ ] **Performance**: <2s per chunk total
- [ ] **Monitoring**: Metrics collected
- [ ] **Testing**: Full integration tests

### Manual Testing Steps
1. **Setup**: Prepare diverse test chunks
2. **Test Case 1**: Run full pipeline, verify all metadata
3. **Test Case 2**: Simulate extractor failure, verify recovery
4. **Test Case 3**: Measure parallel vs sequential performance
5. **Test Case 4**: Test with various chunk types

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Integration tests
npm test metadata-pipeline.test.js

# Performance benchmark
npm run benchmark:metadata-pipeline

# Error simulation
npm run test:pipeline-failures
```

#### Definition of Done
- [ ] Pipeline orchestrator complete
- [ ] All extractors integrated
- [ ] Parallel execution working
- [ ] Error handling robust
- [ ] Performance targets met

---

## T-020: Database Migration for New Fields

**Priority**: Critical  
**Effort**: 3 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 289-290

### Task Purpose
**As a** document processing system  
**I need** database schema updated with metadata fields  
**So that** enriched metadata can be stored

### Dependencies
- **Prerequisite Tasks**: T-013 (schema design)
- **Parallel Tasks**: T-019
- **Integration Points**: PostgreSQL, existing data
- **Blocked By**: T-013

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When migration runs, the system shall add new JSONB columns
- **REQ-2**: While migrating, the system shall preserve existing data
- **REQ-3**: Where nulls exist, the system shall handle appropriately

#### Non-Functional Requirements
- **Performance**: Migration < 5 minutes for 100K chunks
- **Safety**: Rollback capability required
- **Compatibility**: No breaking changes

### Implementation Details

#### Files to Modify/Create
```
├── supabase/migrations/013_add_metadata_fields.sql - [Create: Migration]
├── worker/types/database.ts - [Update: Type definitions]
└── scripts/migration-test.js - [Create: Migration validation]
```

#### Key Implementation Steps
1. **Step 1**: Create migration SQL → Schema changes
2. **Step 2**: Add JSONB columns → Flexible storage
3. **Step 3**: Create indexes → Query performance
4. **Step 4**: Update type definitions → Type safety
5. **Step 5**: Test rollback → Safety verification

#### Code Patterns to Follow
- **Migration Pattern**: Incremental, reversible changes
- **JSONB Pattern**: Flexible schema with validation
- **Index Pattern**: GIN indexes for JSONB queries

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Migration execution
  Given existing chunks table
  When migration runs
  Then new columns are added
  And existing data preserved
  And indexes created

Scenario 2: Rollback capability
  Given applied migration
  When rollback executed
  Then schema reverts cleanly
  And no data lost
  And system functional

Scenario 3: Null handling
  Given existing chunks without metadata
  When querying new fields
  Then nulls handled gracefully
  And no errors occur
  And defaults applied
```

#### Rule-Based Criteria (Checklist)
- [ ] **Columns**: All metadata fields added
- [ ] **Indexes**: Performance indexes created
- [ ] **Safety**: Rollback tested
- [ ] **Compatibility**: Existing code works
- [ ] **Performance**: Migration time acceptable
- [ ] **Documentation**: Schema changes documented

### Manual Testing Steps
1. **Setup**: Backup existing database
2. **Test Case 1**: Apply migration to test database
3. **Test Case 2**: Verify column existence and types
4. **Test Case 3**: Test rollback procedure
5. **Test Case 4**: Query performance with new indexes

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Apply migration (test environment)
npx supabase migration up

# Verify schema
npx supabase db dump --schema-only

# Test rollback
npx supabase migration down

# Performance test
npm run test:migration-performance
```

#### Definition of Done
- [ ] Migration SQL created
- [ ] Types updated
- [ ] Rollback tested
- [ ] Performance validated
- [ ] Documentation updated

---

## T-021: Update All Processors for Metadata

**Priority**: Critical  
**Effort**: 6 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 42-45

### Task Purpose
**As a** document processing system  
**I need** all processors updated to extract metadata  
**So that** every chunk has enriched metadata

### Dependencies
- **Prerequisite Tasks**: T-019, T-020
- **Parallel Tasks**: None
- **Integration Points**: All processor classes
- **Blocked By**: T-019, T-020

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When processing, each processor shall extract metadata
- **REQ-2**: While saving chunks, metadata shall be included
- **REQ-3**: Where extraction fails, defaults shall be applied

#### Non-Functional Requirements
- **Performance**: Metadata adds < 5s total
- **Consistency**: All processors use same pipeline
- **Quality**: Metadata completeness > 90%

### Implementation Details

#### Files to Modify/Create
```
├── worker/processors/base.ts - [Modify: Add metadata extraction]
├── worker/processors/*.ts - [Modify: All processor classes]
└── worker/tests/processors/*-metadata.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Update base processor → Metadata support
2. **Step 2**: Integrate pipeline in each processor → Consistent extraction
3. **Step 3**: Update chunk creation → Include metadata
4. **Step 4**: Add fallback defaults → Handle failures
5. **Step 5**: Test all processors → Verify completeness

#### Code Patterns to Follow
- **Integration Pattern**: Call pipeline in process()
- **Default Pattern**: Sensible defaults for failures
- **Consistency Pattern**: Same pipeline for all

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: PDF metadata extraction
  Given a PDF document
  When PDFProcessor processes it
  Then chunks have all metadata fields
  And extraction pipeline was used
  And metadata is stored

Scenario 2: YouTube metadata
  Given a YouTube video
  When YouTubeProcessor runs
  Then transcript chunks have metadata
  And timestamp context preserved
  And emotional tone captured

Scenario 3: Extraction failure
  Given metadata extraction error
  When processing continues
  Then default metadata applied
  And chunk still created
  And error logged
```

#### Rule-Based Criteria (Checklist)
- [ ] **Coverage**: All processors updated
- [ ] **Integration**: Pipeline used consistently
- [ ] **Storage**: Metadata saved to database
- [ ] **Defaults**: Fallback values work
- [ ] **Performance**: Within time budget
- [ ] **Testing**: All processors tested

### Manual Testing Steps
1. **Setup**: Prepare test documents for each type
2. **Test Case 1**: Process PDF, verify metadata
3. **Test Case 2**: Process YouTube, check all fields
4. **Test Case 3**: Process all other types
5. **Test Case 4**: Simulate extraction failure

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Run all processor tests
npm test processors/*-metadata.test.js

# Integration test
npm run test:metadata-integration

# Completeness check
npm run validate:metadata-completeness
```

#### Definition of Done
- [ ] All processors updated
- [ ] Pipeline integrated
- [ ] Metadata stored correctly
- [ ] Defaults working
- [ ] All tests passing

---

## T-022: Backward Compatibility Validation

**Priority**: High  
**Effort**: 4 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 45, 291

### Task Purpose
**As a** production system  
**I need** backward compatibility validated  
**So that** existing documents continue working

### Dependencies
- **Prerequisite Tasks**: T-021
- **Parallel Tasks**: T-023
- **Integration Points**: Existing data, legacy chunks
- **Blocked By**: T-021

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When querying old chunks, the system shall handle missing metadata
- **REQ-2**: While processing, the system shall not break on null fields
- **REQ-3**: Where upgrades needed, the system shall migrate gracefully

#### Non-Functional Requirements
- **Compatibility**: 100% existing functionality preserved
- **Performance**: No degradation for old data
- **Migration**: Optional upgrade path

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/compatibility.ts - [Create: Compatibility layer]
├── scripts/validate-compatibility.js - [Create: Validation script]
└── worker/tests/compatibility.test.js - [Create: Tests]
```

#### Key Implementation Steps
1. **Step 1**: Create compatibility layer → Null handling
2. **Step 2**: Test with existing data → Verify functionality
3. **Step 3**: Add migration utility → Optional upgrade
4. **Step 4**: Document upgrade path → Clear instructions
5. **Step 5**: Validate all queries → No breakage

#### Code Patterns to Follow
- **Null Safety Pattern**: Optional chaining, defaults
- **Migration Pattern**: Batch update utility
- **Version Pattern**: Schema versioning

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Old chunk queries
  Given chunks without metadata
  When querying or displaying
  Then system handles gracefully
  And no errors occur
  And functionality preserved

Scenario 2: Mixed data
  Given old and new chunks together
  When processing or searching
  Then both types work correctly
  And no discrimination occurs
  And results are consistent

Scenario 3: Optional migration
  Given old chunks to upgrade
  When migration utility runs
  Then metadata is backfilled
  And data integrity maintained
  And process is reversible
```

#### Rule-Based Criteria (Checklist)
- [ ] **Compatibility**: Old chunks work
- [ ] **Null Handling**: No crashes
- [ ] **Performance**: No degradation
- [ ] **Migration**: Utility created
- [ ] **Documentation**: Upgrade guide
- [ ] **Testing**: Full coverage

### Manual Testing Steps
1. **Setup**: Use production data copy
2. **Test Case 1**: Query old chunks, verify working
3. **Test Case 2**: Mix old and new data
4. **Test Case 3**: Run migration utility
5. **Test Case 4**: Test rollback scenario

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Compatibility tests
npm test compatibility.test.js

# Validation script
node scripts/validate-compatibility.js

# Migration test
npm run test:migration-utility
```

#### Definition of Done
- [ ] Compatibility layer created
- [ ] Old data tested
- [ ] Migration utility working
- [ ] Documentation complete
- [ ] No regressions found

---

## T-023: Metadata Quality Validation

**Priority**: Critical  
**Effort**: 5 hours

### Source PRP Document
**Reference**: docs/prps/document-processor-stabilization.md - Lines 292-293

### Task Purpose
**As a** quality assurance process  
**I need** metadata quality validation  
**So that** 7-engine collision detection has reliable data

### Dependencies
- **Prerequisite Tasks**: T-021
- **Parallel Tasks**: T-022
- **Integration Points**: All extractors, validation metrics
- **Blocked By**: T-021

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When validating metadata, the system shall check completeness
- **REQ-2**: While measuring quality, the system shall calculate accuracy
- **REQ-3**: Where issues found, the system shall report specifics

#### Non-Functional Requirements
- **Coverage**: Test 100+ diverse documents
- **Metrics**: Quantifiable quality scores
- **Reporting**: Clear quality reports

### Implementation Details

#### Files to Modify/Create
```
├── worker/lib/validation/metadata-quality.ts - [Create: Quality validator]
├── scripts/validate-metadata-quality.js - [Create: Validation runner]
├── worker/tests/fixtures/validation-set/ - [Create: Test documents]
└── docs/metadata-quality-report.md - [Create: Results report]
```

#### Key Implementation Steps
1. **Step 1**: Create validation framework → Quality checks
2. **Step 2**: Define quality metrics → Measurement system
3. **Step 3**: Build test corpus → Diverse documents
4. **Step 4**: Run validation suite → Quality assessment
5. **Step 5**: Generate quality report → Documentation

#### Code Patterns to Follow
- **Validation Pattern**: Schema + semantic checks
- **Metric Pattern**: Precision, recall, F1 scores
- **Report Pattern**: Markdown tables with metrics

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Completeness check
  Given processed chunks with metadata
  When validation runs
  Then completeness percentage calculated
  And missing fields identified
  And report generated

Scenario 2: Accuracy validation
  Given ground truth annotations
  When comparing with extracted metadata
  Then accuracy metrics calculated
  And error patterns identified
  And improvements suggested

Scenario 3: Quality thresholds
  Given defined quality targets
  When validation completes
  Then pass/fail determined
  And specific issues listed
  And action items created
```

#### Rule-Based Criteria (Checklist)
- [ ] **Completeness**: >90% fields populated
- [ ] **Accuracy**: >80% extraction accuracy
- [ ] **Coverage**: 100+ documents tested
- [ ] **Reporting**: Clear metrics dashboard
- [ ] **Actionable**: Specific improvements identified
- [ ] **Automated**: Can run in CI/CD

### Manual Testing Steps
1. **Setup**: Prepare validation corpus
2. **Test Case 1**: Run completeness validation
3. **Test Case 2**: Check accuracy metrics
4. **Test Case 3**: Test edge cases
5. **Test Case 4**: Generate final report

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Run validation suite
npm run validate:metadata-quality

# Generate report
npm run report:metadata-quality

# Check thresholds
npm run test:quality-gates

# CI/CD integration
npm run ci:metadata-validation
```

#### Definition of Done
- [ ] Validation framework complete
- [ ] Metrics defined and calculated
- [ ] Test corpus created (100+ docs)
- [ ] Quality report generated
- [ ] All thresholds met
- [ ] CI/CD integration ready

---

## Summary & Delivery Checklist

### Week 2 Deliverables
- [ ] Enhanced metadata schema designed (T-013)
- [ ] Structural patterns extractor (T-014)
- [ ] Emotional tone analyzer (T-015)
- [ ] Key concepts extractor (T-016)
- [ ] Method signatures detector (T-017)
- [ ] Narrative rhythm analyzer (T-018)
- [ ] Unified extraction pipeline (T-019)
- [ ] Database migration completed (T-020)
- [ ] All processors updated (T-021)
- [ ] Backward compatibility verified (T-022)
- [ ] Metadata quality validated (T-023)

### Success Metrics
- ✅ All chunks have 7 metadata fields populated
- ✅ Metadata extraction adds <5s to processing
- ✅ Backward compatibility maintained (100%)
- ✅ Extraction accuracy >80%
- ✅ Field completeness >90%

### Risk Mitigation
- **If extraction slow**: Optimize AI prompts, reduce parallel calls
- **If accuracy low**: Refine prompts, add validation layers
- **If migration fails**: Use rollback, fix issues, retry
- **If compatibility broken**: Add more null checks, test thoroughly

### Handoff Requirements
- [ ] All extractors tested and integrated
- [ ] Database migration applied successfully
- [ ] Quality metrics meet thresholds
- [ ] Backward compatibility confirmed
- [ ] Documentation updated
- [ ] Ready for Week 3 7-engine implementation