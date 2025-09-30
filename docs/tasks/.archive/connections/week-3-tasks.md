# Week 3: 7-Engine Implementation Tasks

**Feature**: Connection Synthesis System - Engine Implementation  
**Source PRP**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md)  
**Duration**: 5 days  
**Objective**: Complete implementation of Engines 5-7 with unit tests  

---

## Task T-006: Implement Engine 5 - Emotional Resonance

### Task Identification
**Task ID**: T-006  
**Task Name**: Implement Emotional Resonance Engine with Tone Matching  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 737-822

#### Feature Overview
The Emotional Resonance engine detects connections between chunks that share similar emotional tones, helping users discover content with similar emotional qualities across their documents.

#### Task Purpose
**As a** connection detection system  
**I need** an emotional resonance engine using tone overlap  
**So that** chunks with similar emotional qualities are discovered and connected

#### Dependencies
- **Prerequisite Tasks**: T-001 to T-005 (Database migrations and Engines 1-4)
- **Parallel Tasks**: T-007, T-008 (can be worked simultaneously)
- **Integration Points**: Supabase PostgreSQL, chunks table with metadata
- **Blocked By**: None if T-005 complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When emotional tones are provided, the system shall calculate Jaccard similarity with candidate chunks
- **REQ-2**: When tone overlap exists (>0), the system shall create a connection
- **REQ-3**: When no tones are provided, the system shall return an empty array
- **REQ-4**: The system shall return the top 20 connections sorted by strength

#### Non-Functional Requirements
- **Performance**: Detection time <1s for typical chunk
- **Scalability**: Handle up to 10,000 chunks in database
- **Reliability**: Gracefully handle missing or malformed metadata

#### Technical Constraints
- **Technology Stack**: TypeScript, Supabase client
- **Architecture Patterns**: Functional programming, error-safe returns
- **Code Standards**: JSDoc on all exported functions
- **Database**: PostgreSQL JSONB queries on metadata->emotional_tone

### Implementation Details

#### Files to Modify/Create
```
worker/lib/engines/
└── emotional.ts - [CREATE: Emotional resonance detection engine]
worker/__tests__/engines/
└── emotional.test.ts - [CREATE: Unit tests for emotional engine]
```

#### Key Implementation Steps
1. **Step 1**: Create emotional.ts with findEmotionalResonance function → Export Connection[] type
2. **Step 2**: Implement Jaccard similarity calculation → Return 0-1 similarity score
3. **Step 3**: Query chunks with overlapping tones → Filter by documentId exclusion
4. **Step 4**: Sort and limit results → Return top 20 connections
5. **Step 5**: Add comprehensive error handling → Return empty array on errors

#### Code Patterns to Follow
- **Similar Pattern**: [worker/lib/engines/thematic.ts:789] - Jaccard similarity implementation
- **Error Handling**: [worker/lib/engines/semantic.ts:482] - Try-catch with console.error
- **Query Pattern**: [worker/lib/engines/thematic.ts:748] - JSONB overlaps query

#### Algorithm Specification
```typescript
// Algorithm:
// 1. Query chunks with overlapping emotional tones
// 2. Calculate Jaccard similarity (intersection/union)
// 3. No threshold - return all overlaps (user filters with UI)
// 4. Sort by strength descending
// 5. Return top 20 connections
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Emotional resonance detected
  Given chunk with tones ['melancholic', 'contemplative']
  And candidate chunk with tones ['melancholic', 'introspective']
  When findEmotionalResonance() is called
  Then connection returned with strength >0
  And connection_type equals 'emotional_resonance'
  And shared_tones contains ['melancholic']

Scenario 2: No tone overlap handled
  Given chunk with tones ['optimistic']
  And candidate with tones ['pessimistic', 'critical']
  When findEmotionalResonance() is called
  Then no connection returned (0% overlap)

Scenario 3: Empty tones handled gracefully
  Given chunk with no emotional tones
  When findEmotionalResonance() is called
  Then empty array returned
  And no errors thrown
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Jaccard similarity calculates correctly
- [ ] **Performance**: Detection completes in <1s
- [ ] **Error Handling**: Empty tones return empty array
- [ ] **Integration**: Works with existing chunk metadata structure
- [ ] **Quality**: 80% unit test coverage achieved
- [ ] **Documentation**: JSDoc on all exported functions

### Manual Testing Steps
1. **Setup**: Create test document with chunks having emotional_tone metadata
2. **Test Case 1**: 
   - Call findEmotionalResonance() with tones ['melancholic', 'contemplative']
   - Verify connections returned
   - Check tone_overlap in metadata
3. **Test Case 2**: 
   - Test with empty tones array
   - Verify empty array returned
4. **Performance Test**:
   ```typescript
   const start = performance.now()
   const connections = await findEmotionalResonance(chunkId, tones, docId, supabase)
   const duration = performance.now() - start
   console.log(`Detection time: ${duration}ms (target: <1000ms)`)
   ```

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
npm run build

# Linting
npm run lint

# Unit tests
npm test emotional.test.ts

# Coverage report
npm run test:coverage -- emotional.test.ts
```

#### Definition of Done
- [ ] Function returns valid Connection[] array
- [ ] Jaccard similarity implementation matches fuzzy-matching.ts pattern
- [ ] All unit tests pass (minimum 5 tests)
- [ ] Detection time <1s verified
- [ ] JSDoc documentation complete
- [ ] Code review passed

### Resources & References

#### Documentation Links
- **PostgreSQL JSONB**: https://www.postgresql.org/docs/current/functions-json.html
- **Jaccard Similarity**: https://en.wikipedia.org/wiki/Jaccard_index

#### Code References
- **Jaccard Implementation**: [worker/lib/fuzzy-matching.ts:100-147] - Proven implementation with 88.52% coverage
- **JSONB Query Pattern**: [worker/lib/engines/thematic.ts:748-753] - Overlaps operator usage
- **Error Handling**: [worker/lib/engines/semantic.ts:443-485] - Safe error handling pattern

### Notes & Comments

#### Implementation Notes
- No threshold applied - let users filter with UI sliders
- Return all matches with tone overlap >0
- Jaccard similarity provides normalized 0-1 score
- Empty tones should return empty array, not error

#### Risk Factors
- **Low Risk**: Algorithm is straightforward Jaccard calculation
- **Medium Risk**: JSONB overlaps operator performance with large datasets
- **Mitigation**: Add index on metadata->emotional_tone if performance degrades

#### Estimated Time
**2 hours** (1.5h implementation, 0.5h testing)

---

## Task T-007: Implement Engine 6 - Methodological Echoes

### Task Identification
**Task ID**: T-007  
**Task Name**: Implement Methodological Echoes Engine with Method Signatures  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 824-932

#### Feature Overview
The Methodological Echoes engine detects connections between chunks that use similar analytical approaches or methodologies, helping identify content with similar reasoning patterns.

#### Task Purpose
**As a** connection detection system  
**I need** a methodological echo engine using method signature comparison  
**So that** chunks with similar analytical approaches are discovered

#### Dependencies
- **Prerequisite Tasks**: T-001 to T-006
- **Parallel Tasks**: T-008 (can be worked simultaneously)
- **Integration Points**: Supabase PostgreSQL, chunks table
- **Blocked By**: None if T-006 in progress or complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When method signatures are provided, the system shall calculate custom method similarity
- **REQ-2**: When method similarity ≥0.3, the system shall create a connection
- **REQ-3**: When exact method matches exist, they shall be weighted higher than partial matches
- **REQ-4**: The system shall handle substring matches for partial similarity

#### Non-Functional Requirements
- **Performance**: Detection time <1s for typical chunk
- **Scalability**: Process all chunks in database (no pre-filtering)
- **Accuracy**: Distinguish between exact and partial method matches

#### Technical Constraints
- **Technology Stack**: TypeScript, Supabase client
- **Algorithm**: Custom similarity (not pure Jaccard)
- **Database**: Query all chunks, filter in application layer

### Implementation Details

#### Files to Modify/Create
```
worker/lib/engines/
└── methodological.ts - [CREATE: Methodological echo detection engine]
worker/__tests__/engines/
└── methodological.test.ts - [CREATE: Unit tests for methodological engine]
```

#### Key Implementation Steps
1. **Step 1**: Create methodological.ts with findMethodologicalEchoes → Export function
2. **Step 2**: Implement custom method similarity calculation → Weight exact vs partial matches
3. **Step 3**: Query all chunks from database → Filter by documentId
4. **Step 4**: Calculate similarity for each candidate → Apply 0.3 threshold
5. **Step 5**: Sort and return top 20 connections → Include shared methods in metadata

#### Code Patterns to Follow
- **Query Pattern**: Query all chunks (no JSONB filtering)
- **Custom Algorithm**: Weighted similarity (exact=1.0, partial=0.5)
- **Error Handling**: Try-catch with console.error pattern

#### Algorithm Specification
```typescript
// Custom Method Similarity Algorithm:
// 1. Count exact matches (weight = 1.0)
// 2. Count partial matches where m1.includes(m2) or m2.includes(m1) (weight = 0.5)
// 3. Total score = (exactMatches + partialMatches * 0.5) / max(methods1.length, methods2.length)
// 4. Filter: score ≥ 0.3
// 5. Return top 20 sorted by strength
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Exact method match detected
  Given chunk with methods ['dialectical', 'genealogical']
  And candidate with methods ['dialectical', 'empirical']
  When findMethodologicalEchoes() is called
  Then connection returned with strength ≥0.3
  And shared_methods contains ['dialectical']
  And method_similarity calculated correctly

Scenario 2: Partial method match detected
  Given chunk with methods ['phenomenological']
  And candidate with methods ['phenomenological-analysis']
  When findMethodologicalEchoes() is called
  Then partial match detected (substring)
  And weighted at 0.5 instead of 1.0

Scenario 3: Low similarity filtered
  Given chunk with methods ['quantitative']
  And candidate with methods ['qualitative', 'interpretive']
  When findMethodologicalEchoes() is called
  Then no connection returned (similarity <0.3)

Scenario 4: Empty methods handled
  Given chunk with no method signatures
  When findMethodologicalEchoes() is called
  Then empty array returned
  And no errors thrown
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Custom similarity algorithm implemented correctly
- [ ] **Performance**: Processes all chunks in <1s
- [ ] **Accuracy**: Exact matches weighted higher than partial
- [ ] **Threshold**: 0.3 minimum similarity enforced
- [ ] **Quality**: Unit tests cover exact, partial, and no matches
- [ ] **Documentation**: JSDoc explains custom algorithm

### Manual Testing Steps
1. **Setup**: Create chunks with method_signatures in metadata
2. **Test Exact Match**: 
   ```typescript
   const methods = ['dialectical', 'genealogical']
   const connections = await findMethodologicalEchoes(chunkId, methods, docId, supabase)
   console.log('Exact matches found:', connections.filter(c => 
     c.metadata.shared_methods.includes('dialectical')
   ))
   ```
3. **Test Partial Match**:
   - Create chunk with 'phenomenological'
   - Create candidate with 'phenomenological-analysis'
   - Verify partial match detected
4. **Performance Test**: Measure with 1000+ chunks

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Run all quality checks
npm run build && npm run lint && npm test methodological.test.ts
```

#### Definition of Done
- [ ] Custom similarity algorithm matches specification
- [ ] Exact matches weighted 1.0, partial 0.5
- [ ] Threshold 0.3 correctly filters results
- [ ] Top 20 connections returned
- [ ] All unit tests pass
- [ ] Detection time <1s verified

### Resources & References

#### Code References
- **Custom Algorithm Example**: New implementation (no existing pattern)
- **Query All Chunks**: Different from other engines (no pre-filtering)
- **Substring Matching**: JavaScript includes() method

### Notes & Comments

#### Implementation Notes
- This engine uses a custom similarity metric, not Jaccard
- Must query all chunks since we can't filter method_signatures efficiently in PostgreSQL
- Performance may be slower due to full table scan
- Consider caching if performance becomes an issue

#### Risk Factors
- **Medium Risk**: Full table scan may be slow with large datasets
- **Mitigation**: Add application-level caching if needed
- **Alternative**: Create GIN index on metadata if PostgreSQL supports

#### Estimated Time
**2.5 hours** (2h implementation with custom algorithm, 0.5h testing)

---

## Task T-008: Implement Engine 7 - Temporal Rhythms

### Task Identification
**Task ID**: T-008  
**Task Name**: Implement Temporal Rhythms Engine with Narrative Pattern Analysis  
**Priority**: High  

### Context & Background

#### Source PRP Document
**Reference**: [docs/prps/connection-synthesis-system.md](/docs/prps/connection-synthesis-system.md) - Lines 934-1084

#### Feature Overview
The Temporal Rhythms engine detects connections between chunks with similar narrative patterns, rhythm, and momentum, helping identify content with similar storytelling or argumentative flow.

#### Task Purpose
**As a** connection detection system  
**I need** a temporal rhythm engine using narrative pattern analysis  
**So that** chunks with similar narrative flow and pacing are discovered

#### Dependencies
- **Prerequisite Tasks**: T-001 to T-007
- **Parallel Tasks**: None (last engine)
- **Integration Points**: Requires chunk content, not just metadata
- **Blocked By**: None if T-007 in progress or complete

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When chunk content is provided, the system shall analyze narrative rhythm
- **REQ-2**: The system shall detect patterns: buildup, reveal, reflection, argument, example
- **REQ-3**: The system shall calculate density (themes per sentence) and momentum
- **REQ-4**: When rhythm similarity ≥0.3, the system shall create a connection

#### Non-Functional Requirements
- **Performance**: Detection time <1s despite content analysis
- **Accuracy**: Heuristic pattern detection based on keywords
- **Robustness**: Handle short chunks (<3 sentences) gracefully

#### Technical Constraints
- **Technology Stack**: TypeScript, text analysis
- **Algorithm**: Heuristic-based pattern detection
- **Content Access**: Must query chunk content, not just metadata

### Implementation Details

#### Files to Modify/Create
```
worker/lib/engines/
└── temporal.ts - [CREATE: Temporal rhythm detection engine]
worker/__tests__/engines/
└── temporal.test.ts - [CREATE: Unit tests for temporal engine]
```

#### Key Implementation Steps
1. **Step 1**: Create analyzeRhythm function → Detect pattern, density, momentum
2. **Step 2**: Implement pattern detection heuristics → Use keyword indicators
3. **Step 3**: Calculate rhythm similarity → Pattern match + density + momentum scores
4. **Step 4**: Query all chunks with content → Compare rhythms
5. **Step 5**: Filter by 0.3 threshold → Return top 20 connections

#### Code Patterns to Follow
- **Content Analysis**: New pattern (other engines use metadata only)
- **Heuristic Detection**: Keyword-based pattern identification
- **Complex Algorithm**: Multi-factor similarity calculation

#### Algorithm Specification
```typescript
interface Rhythm {
  pattern: 'buildup' | 'reveal' | 'reflection' | 'argument' | 'example'
  density: number  // themes per sentence
  momentum: number // density * sentence count
}

// Pattern Detection Heuristics:
// - 'argument': contains 'therefore', 'thus', 'because'
// - 'example': contains 'for example', 'such as', 'instance'
// - 'reveal': contains 'however', 'but', 'although'
// - 'buildup': contains 'consider', 'imagine', 'suppose'
// - 'reflection': default if no other patterns match

// Rhythm Similarity:
// - Pattern match: 0.5 if exact match, 0.0 if different
// - Density similarity: 1 - |density1 - density2| (max 0.3 weight)
// - Momentum similarity: 1 - |momentum1 - momentum2| / 10 (max 0.2 weight)
// - Total: patternScore + densityScore + momentumScore
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Similar rhythm detected
  Given chunk with 'argument' pattern and high density
  And candidate with 'argument' pattern and similar density
  When findTemporalRhythms() is called
  Then connection returned with strength ≥0.3
  And source_rhythm and target_rhythm in metadata
  And rhythm_similarity calculated correctly

Scenario 2: Different patterns reduce similarity
  Given chunk with 'buildup' pattern
  And candidate with 'reveal' pattern
  When findTemporalRhythms() is called
  Then pattern score is 0.0
  And total similarity may be <0.3 (filtered)

Scenario 3: Short chunks handled
  Given chunk with <3 sentences
  When analyzeRhythm() is called
  Then returns null
  And no connection created

Scenario 4: Keyword-based pattern detection
  Given chunk containing 'therefore' and 'because'
  When analyzeRhythm() is called
  Then pattern detected as 'argument'
  And pattern used in similarity calculation
```

#### Rule-Based Criteria (Checklist)
- [ ] **Functional**: Pattern detection works with keywords
- [ ] **Performance**: Processes content analysis in <1s
- [ ] **Accuracy**: Rhythm similarity combines 3 factors correctly
- [ ] **Robustness**: Short chunks return null rhythm
- [ ] **Quality**: Unit tests cover all 5 patterns
- [ ] **Documentation**: Heuristics clearly documented

### Manual Testing Steps
1. **Setup**: Create chunks with varying content patterns
2. **Test Pattern Detection**:
   ```typescript
   const testContent = "Therefore, we must conclude that consciousness emerges because of complexity."
   const rhythm = analyzeRhythm(testContent, ['consciousness', 'complexity'])
   console.log('Detected pattern:', rhythm.pattern) // Should be 'argument'
   ```
3. **Test Rhythm Similarity**:
   ```typescript
   const rhythm1 = { pattern: 'argument', density: 0.5, momentum: 2.5 }
   const rhythm2 = { pattern: 'argument', density: 0.6, momentum: 3.0 }
   const similarity = calculateRhythmSimilarity(rhythm1, rhythm2)
   console.log('Similarity:', similarity) // Should be >0.5
   ```
4. **Performance Test**: Process 100 chunks with content analysis

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Full validation suite
npm run build
npm run lint
npm test temporal.test.ts
```

#### Definition of Done
- [ ] Pattern detection identifies all 5 patterns
- [ ] Rhythm similarity combines pattern, density, momentum
- [ ] Content analysis doesn't break <1s performance target
- [ ] Short chunks handled gracefully
- [ ] All unit tests pass
- [ ] JSDoc explains heuristic approach

### Resources & References

#### Documentation Links
- **Text Analysis**: No external library (pure JavaScript)
- **Pattern Recognition**: Heuristic-based approach

#### Code References
- **New Pattern**: This is the only engine that analyzes content
- **Sentence Splitting**: JavaScript split() with regex
- **Keyword Detection**: JavaScript includes() method

### Notes & Comments

#### Implementation Notes
- Most complex engine due to content analysis
- Heuristic approach may need tuning based on real documents
- Consider caching rhythm analysis results for performance
- Pattern detection is simplified - could be enhanced with NLP later

#### Risk Factors
- **High Risk**: Content analysis may exceed 1s time limit
- **Mitigation**: 
  - Cache rhythm analysis results
  - Limit to first 1000 characters if needed
  - Run async with other engines in parallel
- **Fallback**: Disable this engine if performance unacceptable

#### Estimated Time
**3 hours** (2h for complex algorithm implementation, 1h for testing and optimization)

---

## Week 3 Summary

### Total Estimated Time
- T-006: 2 hours (Emotional Resonance)
- T-007: 2.5 hours (Methodological Echoes)  
- T-008: 3 hours (Temporal Rhythms)
- **Total**: 7.5 hours

### Critical Dependencies
- All engines depend on T-001 (database migrations)
- Engines can be developed in parallel after T-005
- T-008 is most complex and risky (content analysis)

### Key Risks
1. **T-008 Performance**: Content analysis may exceed 1s target
   - Mitigation: Implement caching, run in parallel
2. **JSONB Queries**: PostgreSQL operators need verification
   - Mitigation: Test early, have fallback to app-layer filtering
3. **Full Table Scans**: T-007 queries all chunks
   - Mitigation: Add caching layer if needed

### Validation Gate (End of Week 3)
- [ ] All 7 engines implemented (T-002 through T-008)
- [ ] Each engine has ≥5 unit tests with 80% coverage
- [ ] Each engine detection time <1s verified
- [ ] All engines return valid Connection[] format
- [ ] `npm run build` passes with no errors
- [ ] `npm run lint` passes with no warnings
- [ ] Ready for Week 4 parallel pipeline integration

### Next Steps
After completing Week 3 engines:
1. Begin Week 4 Task T-009 (Background job handler)
2. Integrate all 7 engines with Promise.all()
3. Implement connection storage with limits
4. Add progress tracking for ProcessingDock

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-09-28  
**Week**: 3 of 6  
**Status**: Ready for Implementation