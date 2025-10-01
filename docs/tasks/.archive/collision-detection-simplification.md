# Task Breakdown: 3-Engine Collision Detection System Simplification

## PRP Analysis Summary

**Feature**: 3-Engine Collision Detection System Simplification  
**Source PRP**: `docs/prps/collision-detection-simplification.md`  
**Priority**: High  
**Estimated Effort**: 8-11 days (1-2 sprints)  

### Key Technical Requirements
- Simplify from 7 engines to 3 focused engines
- Remove 5 shallow pattern-matching engines (Conceptual Density, Structural Pattern, Temporal Proximity, Citation Network, Emotional Resonance)
- Keep 2 existing engines (Semantic Similarity, Contradiction Detection)
- Add 1 new AI-powered engine (Thematic Bridge with Gemini integration)
- Update weight configuration: SEMANTIC_SIMILARITY: 0.25, CONTRADICTION_DETECTION: 0.40, THEMATIC_BRIDGE: 0.35

### Validation Requirements
- Performance: <500ms execution for 100 chunks
- Cost: $0.10-0.30 per document for AI engine
- Test coverage: >90% for new ThematicBridge engine
- Reliability: 99.9% uptime with graceful degradation
- Quality: Bridge connections must have >0.6 strength threshold

## Task Complexity Assessment

### Overall Complexity: **Moderate-Complex**

**Technical Complexity**: Moderate
- Leverages existing BaseEngine abstraction
- Gemini SDK already integrated in codebase
- Established patterns for retry mechanisms and caching

**Integration Points**:
- CollisionOrchestrator registration (worker/handlers/detect-connections.ts)
- EngineType enum updates (worker/engines/types.ts)
- Weight configuration system (worker/lib/weight-config.ts)
- Caching infrastructure (existing CollisionCacheManager)

**Technical Challenges**:
- Intelligent candidate filtering to control AI costs
- Batch processing optimization for Gemini API
- Error handling for AI service failures
- Performance optimization for cross-domain analysis

## Phase Organization

### Phase 1: Foundation & New Engine Creation (Days 1-4)
**Objective**: Build ThematicBridge engine with AI integration
- Create ThematicBridgeEngine class
- Implement candidate filtering logic
- Integrate Gemini API with retry mechanisms
- Add caching and error handling

### Phase 2: System Integration (Days 5-7)
**Objective**: Update system configuration and integrate new engine
- Update type definitions and enums
- Modify orchestrator initialization
- Update weight configurations
- Remove deprecated engines

### Phase 3: Testing & Validation (Days 8-10)
**Objective**: Comprehensive testing and performance validation
- Unit tests for ThematicBridge engine
- Integration tests for 3-engine system
- Performance benchmarking
- Cost analysis validation

### Phase 4: Documentation & Deployment Prep (Day 11)
**Objective**: Complete documentation and prepare for deployment
- Update architecture documentation
- Create migration notes
- Prepare rollback procedures

## Detailed Task Breakdown

---

### Task T-001: Create ThematicBridgeEngine Core Implementation

**Task ID**: T-001  
**Task Name**: Create ThematicBridgeEngine Core Implementation  
**Priority**: Critical  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Thematic Bridge Engine Design section

#### Dependencies
- **Prerequisite Tasks**: None (first task)
- **Parallel Tasks**: T-002 can start once base class is created
- **Integration Points**: BaseEngine abstract class, Gemini AI client
- **Blocked By**: None

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Engine initialization
  Given the ThematicBridgeEngine class extending BaseEngine
  When the engine is instantiated with a valid Gemini API key
  Then it should initialize the AI client successfully
  And set the engine type to THEMATIC_BRIDGE

Scenario 2: Metadata validation
  Given a chunk with metadata
  When hasRequiredMetadata is called
  Then it returns true if importance_score and concepts are present
  And returns false if either is missing

Scenario 3: Basic detection flow
  Given a source chunk with importance_score > 0.6
  When detect() is called with target chunks
  Then it filters candidates based on importance and domain
  And returns an empty array if source importance < 0.6
```

**Rule-Based Criteria**:
- [ ] Extends BaseEngine abstract class
- [ ] Implements all abstract methods (detectImpl, hasRequiredMetadata)
- [ ] Initializes Gemini client in constructor
- [ ] Defines filtering thresholds as class constants
- [ ] Returns CollisionResult[] from detectImpl

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/engines/thematic-bridge.ts - [Create: Main engine implementation]
├── worker/engines/types.ts - [Modify: Add THEMATIC_BRIDGE to EngineType enum]
└── worker/tests/engines/thematic-bridge.test.ts - [Create: Unit tests]
```

**Key Implementation Steps**:
1. Create class structure extending BaseEngine → Engine ready for implementation
2. Initialize Gemini client in constructor → AI integration ready
3. Implement hasRequiredMetadata → Validation logic complete
4. Create stub detectImpl → Basic structure ready for filtering logic

**Code Patterns to Follow**:
- **Base Engine Pattern**: `worker/engines/semantic-similarity.ts:15-40` - Class structure and initialization
- **Metadata Validation**: `worker/engines/contradiction-detection.ts:110-125` - hasRequiredMetadata implementation
- **Gemini Client Creation**: `worker/lib/ai-client.ts:18-24` - createGeminiClient pattern

#### Manual Testing Steps
1. **Setup**: Set GEMINI_API_KEY environment variable
2. **Test Case 1**: Instantiate engine and verify type property
3. **Test Case 2**: Call hasRequiredMetadata with various chunk formats
4. **Test Case 3**: Call detect with minimal input to verify no errors

---

### Task T-002: Implement Candidate Filtering Logic

**Task ID**: T-002  
**Task Name**: Implement Candidate Filtering Logic  
**Priority**: Critical  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Pre-filtering strategy

#### Dependencies
- **Prerequisite Tasks**: T-001 (base engine structure)
- **Parallel Tasks**: T-003 can start after filtering is complete
- **Integration Points**: ChunkWithMetadata interface
- **Blocked By**: T-001 completion

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Importance filtering
  Given a list of target chunks with varying importance scores
  When filterCandidates is called
  Then it returns only chunks with importance_score >= 0.6
  And excludes all chunks below threshold

Scenario 2: Cross-document filtering
  Given source and target chunks from different documents
  When filtering for cross-document connections
  Then it excludes chunks from the same document
  And prioritizes chunks from different documents

Scenario 3: Concept overlap filtering
  Given chunks with concept arrays in metadata
  When calculating concept overlap
  Then it keeps chunks with 0.2-0.7 overlap ratio
  And excludes chunks outside this range

Scenario 4: Candidate limit enforcement
  Given 50 chunks passing all filters
  When MAX_CANDIDATES is set to 15
  Then it returns top 15 by importance score
  And maintains sort order by importance
```

**Rule-Based Criteria**:
- [ ] Filters by importance threshold (0.6)
- [ ] Implements cross-document preference
- [ ] Calculates concept overlap correctly
- [ ] Respects MAX_CANDIDATES limit (15)
- [ ] Handles missing metadata gracefully
- [ ] Maintains performance with 1000+ chunks

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/engines/thematic-bridge.ts - [Modify: Add filterCandidates method]
├── worker/engines/thematic-bridge.ts - [Modify: Add calculateConceptOverlap helper]
└── worker/tests/engines/thematic-bridge.test.ts - [Modify: Add filtering tests]
```

**Key Implementation Steps**:
1. Implement filterCandidates method → Basic filtering ready
2. Add concept overlap calculation → Domain filtering enabled
3. Sort and limit candidates → Optimization complete
4. Add performance metrics → Monitoring enabled

**Code Patterns to Follow**:
- **Filtering Pattern**: `worker/engines/semantic-similarity.ts:85-110` - Similarity filtering approach
- **Metadata Access**: `worker/engines/contradiction-detection.ts:145-160` - Safe metadata access
- **Performance Optimization**: Use early returns and array methods efficiently

#### Manual Testing Steps
1. **Setup**: Create test chunks with various importance scores
2. **Test Case 1**: Filter 100 chunks, verify only high-importance returned
3. **Test Case 2**: Test with chunks from same vs different documents
4. **Test Case 3**: Verify concept overlap calculation accuracy
5. **Test Case 4**: Test performance with 1000+ chunks

---

### Task T-003: Implement Gemini AI Bridge Analysis

**Task ID**: T-003  
**Task Name**: Implement Gemini AI Bridge Analysis  
**Priority**: Critical  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - AI-powered analysis section

#### Dependencies
- **Prerequisite Tasks**: T-002 (candidate filtering complete)
- **Parallel Tasks**: T-004 can start for error handling
- **Integration Points**: Gemini API, retry mechanisms
- **Blocked By**: T-002 completion

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Single bridge analysis
  Given a source and target chunk pair
  When analyzeBridge is called
  Then it sends a structured prompt to Gemini
  And parses the JSON response correctly
  And returns BridgeAnalysis object

Scenario 2: Batch processing
  Given 15 candidate chunks
  When batchAnalyzeBridges is called
  Then it processes all candidates efficiently
  And handles partial failures gracefully
  And returns successful analyses only

Scenario 3: Prompt structure
  Given chunks with content and metadata
  When generating the prompt
  Then it includes both chunk contents
  And requests specific bridge types
  And specifies JSON response format

Scenario 4: Response validation
  Given a Gemini API response
  When parsing the bridge analysis
  Then it validates required fields exist
  And ensures strength score is 0-1
  And provides default values for missing fields
```

**Rule-Based Criteria**:
- [ ] Implements analyzeBridge method for single analysis
- [ ] Implements batchAnalyzeBridges for efficient processing
- [ ] Creates structured prompts with clear instructions
- [ ] Parses and validates JSON responses
- [ ] Handles malformed responses gracefully
- [ ] Implements retry logic for API failures

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/engines/thematic-bridge.ts - [Modify: Add analyzeBridge method]
├── worker/engines/thematic-bridge.ts - [Modify: Add batchAnalyzeBridges method]
├── worker/engines/thematic-bridge.ts - [Modify: Add prompt generation logic]
└── worker/tests/engines/thematic-bridge.test.ts - [Modify: Add AI analysis tests]
```

**Key Implementation Steps**:
1. Create prompt template → Clear AI instructions ready
2. Implement analyzeBridge → Single analysis working
3. Add JSON parsing and validation → Response handling complete
4. Implement batch processing → Efficiency optimized

**Code Patterns to Follow**:
- **Gemini Integration**: `worker/processors/pdf-processor.ts:187-220` - AI generation pattern
- **JSON Response Parsing**: Use try-catch with fallback values
- **Batch Processing**: Process in parallel with Promise.allSettled

#### Manual Testing Steps
1. **Setup**: Configure GEMINI_API_KEY and test chunks
2. **Test Case 1**: Analyze single chunk pair, verify response structure
3. **Test Case 2**: Batch process 15 candidates, check performance
4. **Test Case 3**: Test with malformed chunk data, verify error handling
5. **Test Case 4**: Simulate API failures, verify retry behavior

---

### Task T-004: Add Error Handling and Retry Logic

**Task ID**: T-004  
**Task Name**: Add Error Handling and Retry Logic  
**Priority**: High  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Error handling & resilience section

#### Dependencies
- **Prerequisite Tasks**: T-003 (AI analysis implementation)
- **Parallel Tasks**: T-005 can start independently
- **Integration Points**: Gemini API error responses
- **Blocked By**: T-003 basic implementation

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: API rate limit handling
  Given a rate limit error from Gemini
  When retry logic is triggered
  Then it waits with exponential backoff
  And retries up to 3 times
  And logs each retry attempt

Scenario 2: Network timeout handling
  Given a network timeout during API call
  When the timeout is exceeded
  Then it cancels the request
  And returns empty analysis
  And logs the timeout error

Scenario 3: Graceful degradation
  Given multiple API failures
  When all retries are exhausted
  Then the engine returns empty results
  And the orchestrator continues with other engines
  And errors are logged but not thrown

Scenario 4: Partial batch failure
  Given a batch of 15 analyses
  When 3 analyses fail after retries
  Then it returns 12 successful analyses
  And logs the 3 failures
  And continues processing
```

**Rule-Based Criteria**:
- [ ] Implements exponential backoff (1s, 2s, 4s)
- [ ] Maximum 3 retry attempts per request
- [ ] Handles rate limits, timeouts, and API errors
- [ ] Returns empty analysis on permanent failure
- [ ] Logs all errors with appropriate context
- [ ] Never throws errors that break orchestration

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/engines/thematic-bridge.ts - [Modify: Add withRetry wrapper]
├── worker/engines/thematic-bridge.ts - [Modify: Add error handling in analyzeBridge]
├── worker/lib/retry-utils.ts - [Create: Shared retry utilities if not exists]
└── worker/tests/engines/thematic-bridge.test.ts - [Modify: Add error scenario tests]
```

**Key Implementation Steps**:
1. Implement withRetry wrapper → Retry logic centralized
2. Add error type detection → Appropriate handling per error
3. Implement exponential backoff → Rate limit compliance
4. Add comprehensive logging → Debugging enabled

**Code Patterns to Follow**:
- **Retry Pattern**: Similar to PDF processor timeout handling
- **Error Logging**: Include context, chunk IDs, error type
- **Graceful Degradation**: Return empty result, don't throw

#### Manual Testing Steps
1. **Setup**: Mock Gemini client with error responses
2. **Test Case 1**: Simulate rate limit, verify backoff timing
3. **Test Case 2**: Force network timeout, check handling
4. **Test Case 3**: Test batch with mixed success/failure
5. **Test Case 4**: Verify orchestrator continues after engine failure

---

### Task T-005: Update Type Definitions and Enums

**Task ID**: T-005  
**Task Name**: Update Type Definitions and Enums  
**Priority**: High  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Type system updates section

#### Dependencies
- **Prerequisite Tasks**: T-001 (engine created)
- **Parallel Tasks**: T-006, T-007 can proceed after types updated
- **Integration Points**: All engines and orchestrator use these types
- **Blocked By**: None (can start with T-001)

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: EngineType enum update
  Given the EngineType enum in types.ts
  When THEMATIC_BRIDGE is added
  Then it has value 'thematic_bridge'
  And existing enum values remain unchanged
  And TypeScript compilation succeeds

Scenario 2: BridgeAnalysis type creation
  Given the need for bridge analysis results
  When BridgeAnalysis interface is created
  Then it includes all required fields
  And types are properly exported
  And can be imported in engine file

Scenario 3: Type backward compatibility
  Given existing code using EngineType
  When the enum is updated
  Then no existing code breaks
  And all imports continue working
  And type checking passes
```

**Rule-Based Criteria**:
- [ ] THEMATIC_BRIDGE added to EngineType enum
- [ ] BridgeAnalysis interface created with proper fields
- [ ] All types properly exported
- [ ] No breaking changes to existing types
- [ ] TypeScript compilation successful
- [ ] Documentation comments added

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/engines/types.ts - [Modify: Add THEMATIC_BRIDGE to EngineType]
├── worker/engines/types.ts - [Modify: Add BridgeAnalysis interface]
└── worker/engines/types.ts - [Modify: Export new types]
```

**Key Implementation Steps**:
1. Add THEMATIC_BRIDGE to EngineType enum → Type available
2. Create BridgeAnalysis interface → Structure defined
3. Update exports → Types accessible
4. Run TypeScript compiler → Verify no errors

**Code Patterns to Follow**:
- **Enum Pattern**: `worker/engines/types.ts:58-66` - Existing EngineType structure
- **Interface Pattern**: `worker/engines/types.ts:38-53` - CollisionResult interface style
- **Export Pattern**: Maintain existing export structure

#### Manual Testing Steps
1. **Setup**: Open types.ts in editor
2. **Test Case 1**: Add enum value, run tsc --noEmit
3. **Test Case 2**: Import new types in engine file
4. **Test Case 3**: Verify existing imports still work
5. **Test Case 4**: Check IDE autocomplete recognizes new types

---

### Task T-006: Update Weight Configuration System

**Task ID**: T-006  
**Task Name**: Update Weight Configuration System  
**Priority**: High  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Weight configuration updates

#### Dependencies
- **Prerequisite Tasks**: T-005 (types updated)
- **Parallel Tasks**: T-007 can proceed in parallel
- **Integration Points**: WeightConfigManager, orchestrator
- **Blocked By**: T-005 completion

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Default weights update
  Given the DEFAULT preset in WeightConfigManager
  When weights are updated for 3 engines
  Then SEMANTIC_SIMILARITY = 0.25
  And CONTRADICTION_DETECTION = 0.40
  And THEMATIC_BRIDGE = 0.35
  And sum equals 1.0

Scenario 2: Deprecated engine removal
  Given weight configurations with 7 engines
  When updating to 3-engine system
  Then deprecated engine weights are removed
  And only 3 engine weights remain
  And presets are updated accordingly

Scenario 3: Preset updates
  Given existing weight presets
  When updating for 3-engine system
  Then all presets use only 3 engines
  And weights sum to 1.0 for each preset
  And descriptions reflect new focus
```

**Rule-Based Criteria**:
- [ ] DEFAULT weights updated to specified values
- [ ] All presets updated for 3 engines only
- [ ] Weights properly normalized (sum to 1.0)
- [ ] Deprecated engine weights removed
- [ ] Preset descriptions updated
- [ ] Backward compatibility maintained

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/lib/weight-config.ts - [Modify: Update DEFAULT preset]
├── worker/lib/weight-config.ts - [Modify: Update all presets for 3 engines]
├── worker/lib/weight-config.ts - [Modify: Remove deprecated engine references]
└── worker/tests/lib/weight-config.test.ts - [Modify: Update tests for 3 engines]
```

**Key Implementation Steps**:
1. Update DEFAULT preset weights → Core configuration ready
2. Update SEMANTIC_FOCUS preset → Academic use case covered
3. Update remaining presets → All configurations updated
4. Remove deprecated engine references → Cleanup complete

**Code Patterns to Follow**:
- **Preset Structure**: `worker/lib/weight-config.ts:58-75` - Preset configuration pattern
- **Weight Validation**: Ensure sum equals 1.0
- **Documentation**: Update preset descriptions and recommendations

#### Manual Testing Steps
1. **Setup**: Load WeightConfigManager
2. **Test Case 1**: Verify DEFAULT weights match specification
3. **Test Case 2**: Check all presets sum to 1.0
4. **Test Case 3**: Ensure no deprecated engine references remain
5. **Test Case 4**: Test preset selection and application

---

### Task T-007: Modify Orchestrator Registration

**Task ID**: T-007  
**Task Name**: Modify Orchestrator Registration  
**Priority**: Critical  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Orchestrator updates section

#### Dependencies
- **Prerequisite Tasks**: T-005 (types), T-006 (weights)
- **Parallel Tasks**: Can proceed with T-008 after
- **Integration Points**: All collision detection requests
- **Blocked By**: T-005, T-006 completion

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Engine registration update
  Given the orchestrator initialization
  When engines are registered
  Then only 3 engines are registered
  And deprecated engines are not included
  And ThematicBridgeEngine is registered with API key

Scenario 2: Concurrency update
  Given the orchestrator configuration
  When maxConcurrency is set
  Then it equals 3 (reduced from 7)
  And parallel execution still works
  And performance is maintained

Scenario 3: Timeout adjustment
  Given the need for AI processing time
  When globalTimeout is configured
  Then it's increased to 10000ms
  And individual engine timeouts respected
  And no premature timeouts occur
```

**Rule-Based Criteria**:
- [ ] Only 3 engines registered
- [ ] maxConcurrency set to 3
- [ ] globalTimeout increased to 10000ms
- [ ] ThematicBridgeEngine receives API key
- [ ] Deprecated engines removed from imports
- [ ] Orchestrator initialization successful

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/handlers/detect-connections.ts - [Modify: Update engine imports]
├── worker/handlers/detect-connections.ts - [Modify: Update orchestrator config]
├── worker/handlers/detect-connections.ts - [Modify: Register only 3 engines]
└── worker/tests/handlers/detect-connections.test.ts - [Modify: Update tests]
```

**Key Implementation Steps**:
1. Remove deprecated engine imports → Clean imports
2. Update orchestrator configuration → Settings adjusted
3. Register only 3 engines → Simplified system active
4. Pass API key to ThematicBridge → AI engine ready

**Code Patterns to Follow**:
- **Registration Pattern**: `worker/handlers/detect-connections.ts:48-54` - Engine array creation
- **Configuration**: `worker/handlers/detect-connections.ts:35-44` - Orchestrator config
- **API Key Access**: Use process.env.GOOGLE_AI_API_KEY

#### Manual Testing Steps
1. **Setup**: Set environment variables including GOOGLE_AI_API_KEY
2. **Test Case 1**: Initialize orchestrator, verify 3 engines registered
3. **Test Case 2**: Run detection, verify all 3 engines execute
4. **Test Case 3**: Check parallel execution with 3 engines
5. **Test Case 4**: Verify timeout handling for long operations

---

### Task T-008: Remove Deprecated Engine Files

**Task ID**: T-008  
**Task Name**: Remove Deprecated Engine Files  
**Priority**: Medium  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Cleanup section

#### Dependencies
- **Prerequisite Tasks**: T-007 (orchestrator updated)
- **Parallel Tasks**: T-009 can start after
- **Integration Points**: None (cleanup task)
- **Blocked By**: T-007 completion

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: File removal
  Given the 5 deprecated engine files
  When they are deleted
  Then the files no longer exist
  And git tracks the deletions
  And no broken imports remain

Scenario 2: Import cleanup
  Given files importing deprecated engines
  When imports are removed
  Then no import errors occur
  And TypeScript compilation succeeds
  And no dead code remains

Scenario 3: Test cleanup
  Given tests for deprecated engines
  When test files are removed
  Then test suite still runs
  And no test failures occur
  And coverage remains acceptable
```

**Rule-Based Criteria**:
- [ ] Delete conceptual-density.ts
- [ ] Delete structural-pattern.ts
- [ ] Delete temporal-proximity.ts
- [ ] Delete citation-network.ts
- [ ] Delete emotional-resonance.ts
- [ ] Remove all related test files
- [ ] Clean up any remaining imports
- [ ] Verify build succeeds

#### Implementation Details

**Files to Delete**:
```
├── worker/engines/conceptual-density.ts - [Delete]
├── worker/engines/structural-pattern.ts - [Delete]
├── worker/engines/temporal-proximity.ts - [Delete]
├── worker/engines/citation-network.ts - [Delete]
├── worker/engines/emotional-resonance.ts - [Delete]
├── worker/tests/engines/conceptual-density.test.ts - [Delete if exists]
├── worker/tests/engines/structural-pattern.test.ts - [Delete if exists]
├── worker/tests/engines/temporal-proximity.test.ts - [Delete if exists]
├── worker/tests/engines/citation-network.test.ts - [Delete if exists]
└── worker/tests/engines/emotional-resonance.test.ts - [Delete if exists]
```

**Key Implementation Steps**:
1. Delete engine files → Remove deprecated code
2. Delete test files → Clean test suite
3. Search for remaining imports → Find references
4. Clean up found references → No dead code

**Code Patterns to Follow**:
- Use git rm for proper tracking
- Search with grep -r "EngineNameHere" worker/
- Verify with TypeScript compiler

#### Manual Testing Steps
1. **Setup**: Ensure git status is clean
2. **Test Case 1**: Delete files, check git status
3. **Test Case 2**: Run TypeScript compiler, verify no errors
4. **Test Case 3**: Run test suite, ensure passing
5. **Test Case 4**: Search for remaining references

---

### Task T-009: Add ThematicBridge Engine Tests

**Task ID**: T-009  
**Task Name**: Add ThematicBridge Engine Tests  
**Priority**: High  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Testing requirements

#### Dependencies
- **Prerequisite Tasks**: T-001, T-002, T-003 (engine implementation)
- **Parallel Tasks**: T-010 can proceed in parallel
- **Integration Points**: Jest test framework
- **Blocked By**: Core engine implementation

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Unit test coverage
  Given the ThematicBridge engine implementation
  When test coverage is measured
  Then it exceeds 90%
  And all public methods are tested
  And edge cases are covered

Scenario 2: Mock Gemini client
  Given the need to test without API calls
  When tests run
  Then Gemini client is mocked
  And predictable responses returned
  And no actual API calls made

Scenario 3: Filter testing
  Given the candidate filtering logic
  When filter tests run
  Then all filter criteria are verified
  And performance is tested with 1000+ chunks
  And edge cases handled

Scenario 4: Error scenario testing
  Given various error conditions
  When error tests run
  Then retry logic is verified
  And graceful degradation tested
  And all error types covered
```

**Rule-Based Criteria**:
- [ ] >90% code coverage achieved
- [ ] All public methods have tests
- [ ] Gemini client properly mocked
- [ ] Filter logic comprehensively tested
- [ ] Error scenarios covered
- [ ] Performance tests included
- [ ] Integration tests with orchestrator

#### Implementation Details

**Files to Create/Modify**:
```
├── worker/tests/engines/thematic-bridge.test.ts - [Create: Main test file]
├── worker/tests/mocks/gemini-mock.ts - [Create: Gemini client mock]
├── worker/tests/fixtures/bridge-test-data.ts - [Create: Test fixtures]
└── worker/tests/integration/three-engine-system.test.ts - [Create: Integration test]
```

**Key Implementation Steps**:
1. Create test structure → Test file ready
2. Implement Gemini mock → API calls simulated
3. Write filter tests → Core logic verified
4. Add error scenario tests → Resilience confirmed
5. Create integration test → System validation

**Code Patterns to Follow**:
- **Test Structure**: `worker/tests/engines/semantic-similarity.test.ts` - Test organization
- **Mocking Pattern**: Use jest.mock() for Gemini client
- **Fixture Pattern**: Create reusable test data

#### Manual Testing Steps
1. **Setup**: Install test dependencies
2. **Test Case 1**: Run jest with coverage flag
3. **Test Case 2**: Verify all tests pass
4. **Test Case 3**: Check coverage report
5. **Test Case 4**: Run performance tests separately

---

### Task T-010: Update Orchestrator Tests

**Task ID**: T-010  
**Task Name**: Update Orchestrator Tests  
**Priority**: Medium  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Testing section

#### Dependencies
- **Prerequisite Tasks**: T-007 (orchestrator changes)
- **Parallel Tasks**: T-011 can proceed after
- **Integration Points**: Orchestrator test suite
- **Blocked By**: T-007 completion

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Registration tests
  Given the updated orchestrator
  When registration tests run
  Then they verify 3 engines registered
  And deprecated engines not present
  And configuration correct

Scenario 2: Concurrency tests
  Given maxConcurrency of 3
  When parallel execution tested
  Then 3 engines run concurrently
  And no more than 3 at once
  And results properly aggregated

Scenario 3: Weight application tests
  Given the 3-engine weights
  When scoring tests run
  Then weights correctly applied
  And scores properly normalized
  And final rankings accurate
```

**Rule-Based Criteria**:
- [ ] Tests updated for 3-engine system
- [ ] Deprecated engine tests removed
- [ ] Concurrency tests adjusted
- [ ] Weight tests updated
- [ ] Integration tests passing
- [ ] No obsolete test code

#### Implementation Details

**Files to Modify**:
```
├── worker/tests/handlers/detect-connections.test.ts - [Modify: Update for 3 engines]
├── worker/tests/engines/orchestrator.test.ts - [Modify: Update orchestrator tests]
└── worker/tests/integration/collision-detection.test.ts - [Modify: Integration tests]
```

**Key Implementation Steps**:
1. Update engine count assertions → Tests reflect 3 engines
2. Remove deprecated engine tests → Clean test suite
3. Update weight calculations → Correct math verified
4. Fix concurrency tests → Match new limits

**Code Patterns to Follow**:
- **Assertion Updates**: Change from 7 to 3 engines
- **Weight Verification**: Ensure sum equals 1.0
- **Mock Updates**: Only mock 3 engines

#### Manual Testing Steps
1. **Setup**: Run existing tests to see failures
2. **Test Case 1**: Update and run orchestrator tests
3. **Test Case 2**: Verify integration tests pass
4. **Test Case 3**: Check test coverage maintained
5. **Test Case 4**: Run full test suite

---

### Task T-011: Integration Validation Suite

**Task ID**: T-011  
**Task Name**: Integration Validation Suite  
**Priority**: High  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Validation gates section

#### Dependencies
- **Prerequisite Tasks**: T-009, T-010 (tests created)
- **Parallel Tasks**: T-012 can proceed after
- **Integration Points**: Full system validation
- **Blocked By**: All implementation tasks

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: End-to-end validation
  Given the complete 3-engine system
  When integration tests run
  Then document processing succeeds
  And connections are detected
  And results match expectations

Scenario 2: Performance validation
  Given performance benchmarks
  When benchmark tests run
  Then <500ms for 100 chunks achieved
  And memory usage acceptable
  And cache hit rate >70%

Scenario 3: Cost validation
  Given AI usage tracking
  When cost analysis runs
  Then cost per document calculated
  And falls within $0.10-0.30 range
  And projections documented
```

**Rule-Based Criteria**:
- [ ] Full document processing tested
- [ ] Performance benchmarks passing
- [ ] Cost analysis documented
- [ ] Quality metrics validated
- [ ] Error scenarios tested
- [ ] Rollback procedure verified

#### Implementation Details

**Files to Create/Modify**:
```
├── worker/tests/validation/three-engine-validation.ts - [Create: Validation suite]
├── worker/tests/benchmarks/three-engine-performance.ts - [Create: Performance tests]
├── worker/tests/validation/cost-analysis.ts - [Create: Cost tracking]
└── docs/validation/three-engine-report.md - [Create: Validation report]
```

**Key Implementation Steps**:
1. Create validation suite → Comprehensive testing ready
2. Implement performance benchmarks → Metrics verified
3. Add cost tracking → Budget compliance confirmed
4. Generate validation report → Documentation complete

**Code Patterns to Follow**:
- **Validation Pattern**: `worker/tests/validation/` - Existing validation approach
- **Benchmark Pattern**: `worker/benchmarks/` - Performance testing
- **Reporting**: Generate markdown report with metrics

#### Manual Testing Steps
1. **Setup**: Prepare test documents and environment
2. **Test Case 1**: Run full validation suite
3. **Test Case 2**: Execute performance benchmarks
4. **Test Case 3**: Analyze cost metrics
5. **Test Case 4**: Review generated report

---

### Task T-012: Performance Benchmarking

**Task ID**: T-012  
**Task Name**: Performance Benchmarking  
**Priority**: Medium  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Performance requirements

#### Dependencies
- **Prerequisite Tasks**: T-011 (validation suite)
- **Parallel Tasks**: T-013 can proceed after
- **Integration Points**: Benchmark framework
- **Blocked By**: System implementation complete

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Execution time benchmark
  Given 100 test chunks
  When benchmark runs
  Then execution time measured
  And remains under 500ms
  And results documented

Scenario 2: Memory usage benchmark
  Given various document sizes
  When processing documents
  Then memory usage tracked
  And stays under 1GB
  And no memory leaks detected

Scenario 3: Cache performance
  Given repeated queries
  When cache hit rate measured
  Then exceeds 70%
  And performance improvement documented
  And cache size monitored
```

**Rule-Based Criteria**:
- [ ] Execution time <500ms for 100 chunks
- [ ] Memory usage <1GB per worker
- [ ] Cache hit rate >70%
- [ ] No memory leaks detected
- [ ] Results reproducible
- [ ] Comparison with 7-engine system

#### Implementation Details

**Files to Create/Modify**:
```
├── worker/benchmarks/three-engine-benchmark.ts - [Create: Main benchmark]
├── worker/benchmarks/comparison-benchmark.ts - [Create: 7 vs 3 engine comparison]
└── worker/benchmarks/reports/three-engine-performance.md - [Create: Report]
```

**Key Implementation Steps**:
1. Create benchmark scenarios → Test cases ready
2. Implement timing measurements → Metrics captured
3. Add memory profiling → Resource usage tracked
4. Generate comparison report → Analysis complete

**Code Patterns to Follow**:
- **Benchmark Pattern**: `worker/benchmarks/semantic-engine-benchmark.ts` - Existing benchmark
- **Measurement**: Use performance.now() for timing
- **Reporting**: Generate markdown with charts/tables

#### Manual Testing Steps
1. **Setup**: Prepare benchmark data sets
2. **Test Case 1**: Run performance benchmark
3. **Test Case 2**: Monitor memory usage
4. **Test Case 3**: Test cache effectiveness
5. **Test Case 4**: Compare with 7-engine baseline

---

### Task T-013: Update Documentation

**Task ID**: T-013  
**Task Name**: Update Documentation  
**Priority**: Low  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Documentation section

#### Dependencies
- **Prerequisite Tasks**: All implementation tasks
- **Parallel Tasks**: T-014 can proceed in parallel
- **Integration Points**: Project documentation
- **Blocked By**: Implementation complete

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Architecture documentation
  Given the new 3-engine system
  When documentation updated
  Then architecture diagrams reflect changes
  And engine descriptions accurate
  And weight system documented

Scenario 2: API documentation
  Given the ThematicBridge engine
  When API docs updated
  Then new engine documented
  And bridge types explained
  And usage examples provided

Scenario 3: Migration guide
  Given the system changes
  When migration notes created
  Then transition steps documented
  And rollback procedure included
  And FAQ section added
```

**Rule-Based Criteria**:
- [ ] Architecture diagram updated
- [ ] Engine descriptions revised
- [ ] API documentation complete
- [ ] Migration guide created
- [ ] Examples updated
- [ ] README files updated

#### Implementation Details

**Files to Modify/Create**:
```
├── docs/ARCHITECTURE.md - [Modify: Update collision detection section]
├── worker/README.md - [Modify: Update engine list and descriptions]
├── docs/migration/three-engine-migration.md - [Create: Migration guide]
└── docs/api/thematic-bridge-engine.md - [Create: API documentation]
```

**Key Implementation Steps**:
1. Update architecture diagrams → Visual docs current
2. Revise engine descriptions → Accurate documentation
3. Create migration guide → Transition documented
4. Add API examples → Usage clear

**Code Patterns to Follow**:
- **Documentation Style**: Match existing markdown format
- **Diagram Tools**: Use mermaid or ASCII diagrams
- **Examples**: Include code snippets

#### Manual Testing Steps
1. **Setup**: Review current documentation
2. **Test Case 1**: Update and preview markdown
3. **Test Case 2**: Verify links work
4. **Test Case 3**: Check code examples compile
5. **Test Case 4**: Review for completeness

---

### Task T-014: Create Rollback Procedures

**Task ID**: T-014  
**Task Name**: Create Rollback Procedures  
**Priority**: Medium  
**Source PRP Document**: `docs/prps/collision-detection-simplification.md` - Rollback plan section

#### Dependencies
- **Prerequisite Tasks**: Core implementation complete
- **Parallel Tasks**: Final task
- **Integration Points**: Deployment configuration
- **Blocked By**: None (can be prepared early)

#### Acceptance Criteria

**Given-When-Then Scenarios**:
```gherkin
Scenario 1: Immediate rollback procedure
  Given a critical issue in production
  When rollback is needed
  Then procedure restores 7-engine system
  And no data loss occurs
  And service continues operating

Scenario 2: Configuration rollback
  Given weight configuration issues
  When reverting weights needed
  Then original weights restored
  And system reconfigured
  And changes logged

Scenario 3: Gradual rollback option
  Given performance issues
  When gradual rollback chosen
  Then specific engines disabled
  And monitoring continues
  And A/B testing possible
```

**Rule-Based Criteria**:
- [ ] Immediate rollback documented
- [ ] Configuration restore procedure
- [ ] Gradual rollback option
- [ ] No data migration needed
- [ ] Monitoring plan included
- [ ] Testing procedure defined

#### Implementation Details

**Files to Create**:
```
├── docs/rollback/three-engine-rollback.md - [Create: Rollback procedures]
├── scripts/rollback-to-seven-engines.sh - [Create: Rollback script]
└── worker/config/seven-engine-backup.json - [Create: Backup configuration]
```

**Key Implementation Steps**:
1. Document immediate rollback → Emergency procedure ready
2. Create rollback script → Automation available
3. Backup configuration → Original settings preserved
4. Define monitoring plan → Issues detected quickly

**Code Patterns to Follow**:
- **Script Pattern**: Bash script for quick execution
- **Configuration Backup**: JSON format for easy restore
- **Documentation**: Step-by-step procedures

#### Manual Testing Steps
1. **Setup**: Create test environment
2. **Test Case 1**: Practice immediate rollback
3. **Test Case 2**: Test configuration restore
4. **Test Case 3**: Verify gradual rollback
5. **Test Case 4**: Confirm no data loss

## Implementation Recommendations

### Suggested Team Structure
- **Lead Developer**: Tasks T-001, T-003, T-007 (core engine and integration)
- **Backend Developer**: Tasks T-002, T-004, T-005, T-006 (implementation details)
- **QA Engineer**: Tasks T-009, T-010, T-011, T-012 (testing and validation)
- **DevOps/Documentation**: Tasks T-008, T-013, T-014 (cleanup and documentation)

### Optimal Task Sequencing
1. **Day 1-2**: T-001 (engine creation) + T-005 (types) in parallel
2. **Day 3-4**: T-002 (filtering) + T-006 (weights) 
3. **Day 5-6**: T-003 (AI integration) + T-004 (error handling)
4. **Day 7**: T-007 (orchestrator) + T-008 (cleanup)
5. **Day 8-9**: T-009, T-010 (testing)
6. **Day 10**: T-011, T-012 (validation and benchmarking)
7. **Day 11**: T-013, T-014 (documentation and rollback)

### Parallelization Opportunities
- T-001 and T-005 can start simultaneously (different developers)
- T-006 can proceed in parallel with T-002
- T-009 and T-010 can be developed concurrently
- T-013 and T-014 can be prepared throughout development

### Resource Allocation Suggestions
- Ensure GEMINI_API_KEY available for all developers
- Set up shared test environment with sample documents
- Allocate budget for API testing (~$50 for development testing)
- Provision monitoring tools for performance tracking

## Critical Path Analysis

### Tasks on Critical Path
1. **T-001** → T-002 → T-003 → T-007 → T-011
   - Core engine implementation flow
   - Cannot be parallelized
   - Estimated 7-8 days minimum

### Potential Bottlenecks
- **Gemini API Integration** (T-003): May require debugging and optimization
- **Performance Validation** (T-011): Could reveal issues requiring rework
- **Cost Optimization** (T-003/T-004): May need multiple iterations

### Schedule Optimization Suggestions
- Start T-005 and T-006 immediately (parallel with T-001)
- Prepare test data and mocks early (reduces T-009 timeline)
- Begin documentation updates during implementation (T-013)
- Create rollback procedures proactively (T-014)

## Quality Score Assessment

**Task Breakdown Quality Score: 9/10**

**Strengths**:
- Comprehensive task definitions with clear acceptance criteria
- Specific file paths and code references for each task
- Detailed Given-When-Then scenarios for validation
- Clear dependency mapping and parallelization opportunities
- Integration with existing codebase patterns

**Areas for Enhancement**:
- Could add specific performance metrics for each task
- Risk mitigation strategies for individual tasks
- More detailed resource requirements per task

**Confidence Level**: Very high confidence for successful implementation
- All patterns exist in codebase
- Clear technical approach defined
- Comprehensive testing strategy
- Rollback procedures ensure safety

---

**Template Version**: 1.0  
**Generated**: 2025-01-30  
**Source PRP**: docs/prps/collision-detection-simplification.md