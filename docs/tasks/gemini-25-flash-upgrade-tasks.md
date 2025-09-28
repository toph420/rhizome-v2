# Task Breakdown: Gemini 2.5 Flash Upgrade for Large Document Processing

**Feature**: Upgrade document processing pipeline from Gemini 2.0 Flash to Gemini 2.5 Flash  
**Sprint Duration**: 1 week  
**Team Size**: 1-2 developers  
**Total Tasks**: 10 (8 core + 2 optional)  
**Generated**: 2025-09-28  

## PRP Analysis Summary

### Feature Name and Scope
- **Feature**: Gemini 2.5 Flash upgrade with 8x output token increase (8,192 → 65,536)
- **Scope**: Complete SDK replacement, model updates across 6 locations, token limit updates at 2 locations
- **Impact**: Enables processing of 500+ page documents without truncation

### Key Technical Requirements
- Replace `@google/generative-ai` package with `@google/genai` (breaking change)
- Update all model strings from `gemini-2.0-flash` to `gemini-2.5-flash`
- Increase maxOutputTokens from 8192 to 65536
- Maintain existing error handling and timeout patterns
- Update test mocks for new SDK API

### Validation Requirements
- TypeScript compilation must succeed
- All existing tests must pass with updated mocks
- Large document processing must complete without truncation
- No regression in YouTube/web/text processing capabilities

## Task Complexity Assessment

### Overall Complexity Rating
**Moderate** - Well-defined changes with clear implementation path but requires careful testing

### Integration Points
- `worker/handlers/process-document.ts` - 6 model references, 2 token limit updates
- `worker/lib/youtube-cleaning.ts` - 1 token limit update
- Test files requiring mock updates
- Package.json files in both root and worker directories

### Technical Challenges
- Complete SDK API change requiring careful migration
- Potential response format differences between SDK versions
- Test mock rewrite for new API structure
- Validation of Files API compatibility with new SDK

## Phase Organization

### Phase 1: Preparation & Package Migration (Day 1)
**Objective**: Replace SDK packages and verify basic compatibility
- Task T-001: SDK Package Replacement
- Task T-002: Import Path Updates

### Phase 2: Core Implementation (Day 2-3)
**Objective**: Update all model references and configurations
- Task T-003: Update Model References in process-document.ts
- Task T-004: Update Token Limits
- Task T-005: Implement New SDK API Pattern

### Phase 3: Testing & Validation (Day 3-4)
**Objective**: Ensure complete functionality with new SDK
- Task T-006: Update Test Mocks
- Task T-007: Integration Testing
- Task T-008: Large Document Validation

### Phase 4: Optional Enhancements (Day 5)
**Objective**: Implement cost optimization features if time permits
- Task T-009: Context Caching Implementation
- Task T-010: Performance Monitoring

## Detailed Task Breakdown

---

## Task T-001: SDK Package Replacement

**Task Name**: Replace Gemini SDK Package Dependencies  
**Priority**: Critical  
**Estimated Time**: 1 hour  
**Risk Level**: High (Breaking changes)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 25-36 (Dependencies section)

### Task Purpose
**As a** development system  
**I need** the new Gemini SDK package installed  
**So that** I can access Gemini 2.5 Flash model capabilities  

### Dependencies
- **Prerequisite Tasks**: None (first task)
- **Parallel Tasks**: None
- **Integration Points**: Package.json files in root and worker directories
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: When running npm install, the system shall have @google/genai@^1.21.0 available
- **REQ-2**: The old @google/generative-ai package shall be completely removed
- **REQ-3**: Both root and worker directories shall have consistent SDK versions

#### Technical Constraints
- Must maintain npm lockfile integrity
- Must not affect other package dependencies
- Version must be exactly ^1.21.0 or higher

### Implementation Details

#### Files to Modify
```
├── /Users/topher/Code/rhizome-v2/package.json - Remove old SDK, add new SDK
├── /Users/topher/Code/rhizome-v2/worker/package.json - Remove old SDK, add new SDK
├── /Users/topher/Code/rhizome-v2/package-lock.json - Auto-updated by npm
└── /Users/topher/Code/rhizome-v2/worker/package-lock.json - Auto-updated by npm
```

#### Key Implementation Steps
1. **Step 1**: Uninstall @google/generative-ai from worker directory → Package removed
2. **Step 2**: Uninstall @google/generative-ai from root directory → Package removed
3. **Step 3**: Install @google/genai@^1.21.0 in worker directory → Package added
4. **Step 4**: Install @google/genai@^1.21.0 in root directory → Package added
5. **Step 5**: Verify package.json files updated correctly → Dependencies correct

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Successful package replacement
  Given the old @google/generative-ai package is installed
  When I run the uninstall and install commands
  Then @google/genai should be in package.json
  And @google/generative-ai should not exist in package.json

Scenario 2: Version verification
  Given the new SDK is installed
  When I check the package version
  Then it should be version 1.21.0 or higher
```

#### Rule-Based Criteria (Checklist)
- [ ] Old SDK completely removed from both directories
- [ ] New SDK installed in both directories
- [ ] Package.json files updated correctly
- [ ] Package-lock.json files regenerated
- [ ] No npm warnings or errors during installation

### Manual Testing Steps
1. **Setup**: Navigate to worker directory
2. **Test Case 1**: Run `npm ls @google/generative-ai` - should return empty
3. **Test Case 2**: Run `npm ls @google/genai` - should show version ^1.21.0
4. **Test Case 3**: Repeat tests in root directory

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Verify package removal
npm ls @google/generative-ai 2>/dev/null || echo "✅ Old package removed"

# Verify new package
npm ls @google/genai | grep "1.21" && echo "✅ New package installed"

# Check for conflicts
npm audit
```

---

## Task T-002: Update Import Paths

**Task Name**: Update All Import Statements to New SDK  
**Priority**: Critical  
**Estimated Time**: 30 minutes  
**Risk Level**: Medium (Compilation failures if missed)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 46-47, 105

### Task Purpose
**As a** codebase  
**I need** all imports updated to the new SDK package  
**So that** TypeScript compilation succeeds  

### Dependencies
- **Prerequisite Tasks**: T-001 (SDK Package Replacement)
- **Parallel Tasks**: None
- **Integration Points**: All files importing Gemini SDK
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: All occurrences of `@google/generative-ai` shall be replaced with `@google/genai`
- **REQ-2**: The import structure shall match new SDK API (`GoogleGenAI` not `GoogleGenerativeAI`)
- **REQ-3**: TypeScript compilation shall succeed after changes

### Implementation Details

#### Files to Modify
```
├── /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts:48 - Update import
├── /Users/topher/Code/rhizome-v2/worker/lib/youtube-cleaning.ts - Check for imports
└── /Users/topher/Code/rhizome-v2/worker/__tests__/*.test.ts - Update test imports
```

#### Key Implementation Steps
1. **Step 1**: Search for all `@google/generative-ai` imports → Identify all locations
2. **Step 2**: Replace with `import { GoogleGenAI } from '@google/genai'` → Imports updated
3. **Step 3**: Update class name from GoogleGenerativeAI to GoogleGenAI → API aligned
4. **Step 4**: Run TypeScript compilation → Verify no import errors

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Import updates
  Given files have old SDK imports
  When I update all import statements
  Then TypeScript should recognize the new imports
  And compilation should not show import errors

Scenario 2: API compatibility
  Given the new import structure
  When TypeScript compiles the code
  Then GoogleGenAI class should be properly recognized
```

#### Rule-Based Criteria (Checklist)
- [ ] All `@google/generative-ai` imports replaced
- [ ] GoogleGenAI class name used consistently
- [ ] No TypeScript import errors
- [ ] Test file imports updated

### Manual Testing Steps
1. **Test Case 1**: Run `rg "@google/generative-ai"` - should return no results
2. **Test Case 2**: Run `rg "@google/genai"` - should show all updated imports
3. **Test Case 3**: Run `npm run build` in worker directory - should compile

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Search for old imports (should be empty)
rg "@google/generative-ai" --type ts

# Verify new imports exist
rg "@google/genai" --type ts

# Compile TypeScript
cd worker && npm run build
```

---

## Task T-003: Update Model References in process-document.ts

**Task Name**: Update All Gemini Model String References  
**Priority**: Critical  
**Estimated Time**: 45 minutes  
**Risk Level**: Low (Simple string replacements)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 89-95

### Task Purpose
**As a** document processing system  
**I need** to use the Gemini 2.5 Flash model  
**So that** I can process larger documents  

### Dependencies
- **Prerequisite Tasks**: T-002 (Import updates)
- **Parallel Tasks**: T-004 (Can be done simultaneously)
- **Integration Points**: process-document.ts handler
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: All 6 occurrences of `gemini-2.0-flash` shall be replaced with `gemini-2.5-flash`
- **REQ-2**: Model string updates at lines 164, 221, 255, 305, 394, 730
- **REQ-3**: The model string must be exactly `gemini-2.5-flash` (not `gemini-2.5-flash-001`)

### Implementation Details

#### Files to Modify
```
└── /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
    ├── Line 164 - Update model string in markdown extraction
    ├── Line 221 - Update model string in web processing
    ├── Line 255 - Update model string in text processing
    ├── Line 305 - Update model string in paste processing
    ├── Line 394 - Update model string in PDF processing
    └── Line 730 - Update model string in youtube cleaning call
```

#### Key Implementation Steps
1. **Step 1**: Open process-document.ts → File ready for editing
2. **Step 2**: Replace model string at line 164 → Markdown processing updated
3. **Step 3**: Replace model string at line 221 → Web processing updated
4. **Step 4**: Replace model string at line 255 → Text processing updated
5. **Step 5**: Replace model string at line 305 → Paste processing updated
6. **Step 6**: Replace model string at line 394 → PDF processing updated
7. **Step 7**: Replace model string at line 730 → YouTube processing updated

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Model string updates
  Given the file has 6 model references
  When I update all model strings
  Then all should reference gemini-2.5-flash
  And no gemini-2.0-flash strings should remain

Scenario 2: Exact string format
  Given the model string requirements
  When I set the model name
  Then it should be exactly "gemini-2.5-flash"
  And not include version suffixes like "-001"
```

#### Rule-Based Criteria (Checklist)
- [ ] Line 164 updated to `gemini-2.5-flash`
- [ ] Line 221 updated to `gemini-2.5-flash`
- [ ] Line 255 updated to `gemini-2.5-flash`
- [ ] Line 305 updated to `gemini-2.5-flash`
- [ ] Line 394 updated to `gemini-2.5-flash`
- [ ] Line 730 updated to `gemini-2.5-flash`
- [ ] No `gemini-2.0-flash` strings remain

### Manual Testing Steps
1. **Test Case 1**: Search file for `gemini-2.0-flash` - should return 0 results
2. **Test Case 2**: Search file for `gemini-2.5-flash` - should return 6 results
3. **Test Case 3**: Verify each line number has correct model string

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Count old model references (should be 0)
grep -c "gemini-2.0-flash" worker/handlers/process-document.ts

# Count new model references (should be 6)
grep -c "gemini-2.5-flash" worker/handlers/process-document.ts

# Verify specific lines
sed -n '164p;221p;255p;305p;394p;730p' worker/handlers/process-document.ts | grep "gemini-2.5-flash"
```

---

## Task T-004: Update Token Limits

**Task Name**: Increase Max Output Token Limits to 65536  
**Priority**: Critical  
**Estimated Time**: 30 minutes  
**Risk Level**: Low (Simple number changes)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 97-99

### Task Purpose
**As a** document processing system  
**I need** increased token limits  
**So that** I can extract content from 500+ page documents  

### Dependencies
- **Prerequisite Tasks**: T-002 (Import updates)
- **Parallel Tasks**: T-003 (Can be done simultaneously)
- **Integration Points**: process-document.ts, youtube-cleaning.ts
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: maxOutputTokens at line 404 shall be updated from 8192 to 65536
- **REQ-2**: maxOutputTokens at line 734 (youtube-cleaning.ts) shall be updated to 65536
- **REQ-3**: The value must be exactly 65536 (not 65535 or other variations)

### Implementation Details

#### Files to Modify
```
├── /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
│   └── Line 404 - Update maxOutputTokens from 8192 to 65536
└── /Users/topher/Code/rhizome-v2/worker/lib/youtube-cleaning.ts
    └── Line 734 - Update maxOutputTokens to 65536
```

#### Key Implementation Steps
1. **Step 1**: Open process-document.ts → Navigate to line 404
2. **Step 2**: Change `maxOutputTokens: 8192` to `maxOutputTokens: 65536` → PDF processing updated
3. **Step 3**: Open youtube-cleaning.ts → Navigate to line 734
4. **Step 4**: Update maxOutputTokens to 65536 → YouTube processing updated
5. **Step 5**: Verify no other token limit references need updating → Complete

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Token limit increase
  Given the current limit is 8192
  When I update the maxOutputTokens values
  Then they should be exactly 65536
  And represent an 8x increase in capacity

Scenario 2: Consistency across files
  Given multiple files use token limits
  When all are updated
  Then they should all use the same 65536 value
```

#### Rule-Based Criteria (Checklist)
- [ ] process-document.ts:404 shows `maxOutputTokens: 65536`
- [ ] youtube-cleaning.ts:734 shows `maxOutputTokens: 65536`
- [ ] No instances of 8192 remain in model configurations
- [ ] Values are exactly 65536 (not 65535)

### Manual Testing Steps
1. **Test Case 1**: Check line 404 in process-document.ts for 65536
2. **Test Case 2**: Check line 734 in youtube-cleaning.ts for 65536
3. **Test Case 3**: Search for any remaining 8192 values in config objects

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Verify old limit is gone
grep "maxOutputTokens.*8192" worker/handlers/process-document.ts

# Verify new limits
grep "maxOutputTokens.*65536" worker/handlers/process-document.ts
grep "maxOutputTokens.*65536" worker/lib/youtube-cleaning.ts

# Check exact value
grep -E "maxOutputTokens:\s*65536" worker/handlers/process-document.ts worker/lib/youtube-cleaning.ts
```

---

## Task T-005: Implement New SDK API Pattern

**Task Name**: Update SDK Client Initialization and API Calls  
**Priority**: Critical  
**Estimated Time**: 2 hours  
**Risk Level**: High (API breaking changes)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 103-142

### Task Purpose
**As a** document processing system  
**I need** to use the new SDK API correctly  
**So that** all AI model calls function properly  

### Dependencies
- **Prerequisite Tasks**: T-001, T-002, T-003, T-004 (All previous tasks)
- **Parallel Tasks**: None
- **Integration Points**: All AI model invocations
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Client initialization shall use `new GoogleGenAI({ apiKey, apiVersion, httpOptions })`
- **REQ-2**: Model calls shall use `ai.models.generateContent()` method
- **REQ-3**: Configuration shall include responseMimeType and responseSchema
- **REQ-4**: Timeout shall remain at 600000ms (10 minutes)

### Implementation Details

#### Files to Modify
```
└── /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
    ├── Lines 48-53 - Update client initialization
    ├── Lines 393-407 - Update generateContent call structure
    └── All other generateContent calls - Update to new API pattern
```

#### Key Implementation Steps
1. **Step 1**: Update client initialization with new constructor → Client properly initialized
2. **Step 2**: Add apiVersion: 'v1' to initialization → Use stable API version
3. **Step 3**: Update generateContent calls to new structure → API calls compatible
4. **Step 4**: Verify config object structure matches new SDK → Configuration correct
5. **Step 5**: Test with actual API call → Verify connectivity

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Client initialization
  Given the new SDK is installed
  When I initialize the GoogleGenAI client
  Then it should accept an object with apiKey, apiVersion, and httpOptions
  And the timeout should be set to 600000ms

Scenario 2: API call structure
  Given the initialized client
  When I call ai.models.generateContent()
  Then it should accept model, contents, and config parameters
  And return a valid response object

Scenario 3: Error handling
  Given the new API structure
  When an error occurs
  Then existing error handling should still function
  And timeouts should trigger after 10 minutes
```

#### Rule-Based Criteria (Checklist)
- [ ] Client initialization uses new constructor pattern
- [ ] apiVersion set to 'v1' (not 'beta')
- [ ] httpOptions includes timeout of 600000
- [ ] All generateContent calls updated to new structure
- [ ] Config objects include responseMimeType and responseSchema
- [ ] Files API calls use fileData structure correctly
- [ ] Error handling patterns maintained

### Manual Testing Steps
1. **Setup**: Ensure GEMINI_API_KEY environment variable is set
2. **Test Case 1**: Run a simple text generation to verify connectivity
3. **Test Case 2**: Process a small PDF to verify Files API
4. **Test Case 3**: Trigger a timeout to verify error handling

### Validation & Quality Gates

#### Code Quality Checks
```bash
# TypeScript compilation
cd worker && npm run build

# Verify new client pattern
grep "new GoogleGenAI" worker/handlers/process-document.ts

# Check for apiVersion
grep "apiVersion.*'v1'" worker/handlers/process-document.ts

# Verify timeout setting
grep "timeout.*600000" worker/handlers/process-document.ts
```

---

## Task T-006: Update Test Mocks

**Task Name**: Rewrite Test Mocks for New SDK API  
**Priority**: High  
**Estimated Time**: 1.5 hours  
**Risk Level**: Medium (Test failures if incorrect)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 204-225

### Task Purpose
**As a** test suite  
**I need** mocks that match the new SDK API  
**So that** tests can run without making actual API calls  

### Dependencies
- **Prerequisite Tasks**: T-005 (New API implementation)
- **Parallel Tasks**: None
- **Integration Points**: All test files using Gemini mocks
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: Mock structure shall match new GoogleGenAI class API
- **REQ-2**: Mocked methods shall return expected response formats
- **REQ-3**: All existing tests shall pass with new mocks

### Implementation Details

#### Files to Modify
```
├── /Users/topher/Code/rhizome-v2/worker/__tests__/youtube-cleaning.test.ts - Update mocks
├── /Users/topher/Code/rhizome-v2/worker/__tests__/process-document.test.ts - Update if exists
└── Any other test files with Gemini mocks
```

#### Key Implementation Steps
1. **Step 1**: Create new mock factory for GoogleGenAI class → Mock structure ready
2. **Step 2**: Update jest.mock() calls to use new package name → Import mocking updated
3. **Step 3**: Ensure mock returns match expected response format → Responses compatible
4. **Step 4**: Run test suite to verify all tests pass → Tests validated

#### Code Patterns to Follow
```typescript
// New mock pattern from PRP
const createMockAI = (mockResponse: any, shouldThrow = false) => {
  return {
    models: {
      generateContent: jest.fn(async (config) => {
        if (shouldThrow) throw new Error('Test error');
        return { text: JSON.stringify(mockResponse) };
      })
    }
  } as unknown as GoogleGenAI;
};
```

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Mock compatibility
  Given the new SDK API structure
  When tests run with updated mocks
  Then all tests should pass
  And mock calls should be properly tracked

Scenario 2: Error simulation
  Given the mock with error flag
  When shouldThrow is true
  Then the mock should throw expected errors
  And error handling tests should pass
```

#### Rule-Based Criteria (Checklist)
- [ ] Mock structure matches GoogleGenAI class
- [ ] jest.mock uses '@google/genai' package name
- [ ] generateContent mock returns proper format
- [ ] Error throwing capability maintained
- [ ] All existing tests pass
- [ ] Mock call tracking works

### Manual Testing Steps
1. **Test Case 1**: Run `npm test` in worker directory
2. **Test Case 2**: Verify mock is called correct number of times
3. **Test Case 3**: Test error scenarios with shouldThrow flag

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Run test suite
cd worker && npm test

# Check test coverage
cd worker && npm test -- --coverage

# Verify no skipped tests
npm test 2>&1 | grep -i "skip" && echo "⚠️ Tests skipped" || echo "✅ No skipped tests"
```

---

## Task T-007: Integration Testing

**Task Name**: Perform End-to-End Integration Testing  
**Priority**: High  
**Estimated Time**: 2 hours  
**Risk Level**: Medium (May reveal compatibility issues)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 300-308

### Task Purpose
**As a** quality assurance process  
**I need** to verify the complete processing pipeline  
**So that** all document types work with the new SDK  

### Dependencies
- **Prerequisite Tasks**: T-001 through T-006 (All implementation tasks)
- **Parallel Tasks**: T-008 (Can run different test types in parallel)
- **Integration Points**: All document processing pipelines
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: PDF processing shall complete without errors
- **REQ-2**: YouTube transcript processing shall work correctly
- **REQ-3**: Web extraction shall function as before
- **REQ-4**: Text and markdown processing shall be unaffected

### Implementation Details

#### Test Scenarios
```
├── PDF Processing - Test with 10-page academic paper
├── YouTube Processing - Test with 30-minute video
├── Web Extraction - Test with medium.com article
├── Markdown Processing - Test with existing markdown file
└── Text Processing - Test with plain text input
```

#### Key Implementation Steps
1. **Step 1**: Start local development environment → Services running
2. **Step 2**: Upload test PDF document → Processing initiated
3. **Step 3**: Monitor processing stages → Verify each stage completes
4. **Step 4**: Check output quality → Markdown extracted correctly
5. **Step 5**: Repeat for each document type → All pipelines validated

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: PDF processing
  Given a 10-page PDF document
  When I upload and process it
  Then extraction should complete within 2 minutes
  And all content should be present in markdown

Scenario 2: YouTube processing
  Given a YouTube video URL
  When processing is triggered
  Then transcript should be cleaned successfully
  And chunks should have proper metadata

Scenario 3: Error recovery
  Given a processing error occurs
  When the error handler activates
  Then it should provide meaningful error messages
  And not crash the system
```

#### Rule-Based Criteria (Checklist)
- [ ] PDF processing completes successfully
- [ ] YouTube processing maintains quality
- [ ] Web extraction works as expected
- [ ] Markdown processing unchanged
- [ ] Text processing functional
- [ ] Error messages are informative
- [ ] No timeout errors for normal documents
- [ ] Processing times remain reasonable

### Manual Testing Steps
1. **Setup**: Run `npm run dev` to start all services
2. **Test Case 1**: Upload test-10page.pdf and monitor processing
3. **Test Case 2**: Process YouTube URL "https://youtube.com/watch?v=..."
4. **Test Case 3**: Extract article from "https://medium.com/..."
5. **Test Case 4**: Process sample markdown and text files
6. **Cleanup**: Check for any error logs or warnings

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Start services
npm run dev

# Monitor logs for errors
tail -f supabase/logs/*.log | grep ERROR

# Check processing status
npm run status

# Run benchmark if available
npm run benchmark:annotations
```

---

## Task T-008: Large Document Validation

**Task Name**: Validate Large Document Processing Capability  
**Priority**: High  
**Estimated Time**: 1 hour  
**Risk Level**: Low (Validation only)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 309-353

### Task Purpose
**As a** validation process  
**I need** to confirm large document handling  
**So that** the 8x token increase is properly utilized  

### Dependencies
- **Prerequisite Tasks**: T-007 (Integration testing)
- **Parallel Tasks**: Can run with T-007
- **Integration Points**: Document processing pipeline
- **Blocked By**: None

### Technical Requirements

#### Functional Requirements
- **REQ-1**: System shall process 200+ page documents without truncation
- **REQ-2**: Content extraction shall be complete with no data loss
- **REQ-3**: Processing shall complete within 10-minute timeout
- **REQ-4**: Memory usage shall remain stable

### Implementation Details

#### Test Documents
```
├── 50-page-document.pdf - Baseline test
├── 100-page-document.pdf - Medium complexity
├── 200-page-document.pdf - Target capability
└── 500-page-book.pdf - Stress test
```

#### Key Implementation Steps
1. **Step 1**: Prepare test documents of varying sizes → Test suite ready
2. **Step 2**: Process 50-page document → Establish baseline
3. **Step 3**: Process 100-page document → Verify scaling
4. **Step 4**: Process 200-page document → Confirm target capability
5. **Step 5**: Attempt 500-page document → Test limits

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: 200-page processing
  Given a 200-page PDF document
  When processing is triggered
  Then it should complete without truncation
  And all content should be in the markdown output

Scenario 2: No token limit errors
  Given the 65536 token limit
  When processing large documents
  Then no "token limit exceeded" errors should occur
  And no content should be cut off

Scenario 3: Performance validation
  Given various document sizes
  When measuring processing time
  Then time should scale linearly with size
  And not hit the 10-minute timeout
```

#### Rule-Based Criteria (Checklist)
- [ ] 50-page document processes successfully
- [ ] 100-page document processes completely
- [ ] 200-page document has no truncation
- [ ] 500-page document attempts (may require chunking)
- [ ] No token limit errors
- [ ] Processing times under 10 minutes
- [ ] Memory usage stable
- [ ] Output quality maintained

### Manual Testing Steps
1. **Setup**: Prepare test PDFs of various sizes
2. **Test Case 1**: Upload 50-page PDF, verify complete extraction
3. **Test Case 2**: Upload 100-page PDF, check processing time
4. **Test Case 3**: Upload 200-page PDF, validate no truncation
5. **Test Case 4**: Upload 500-page PDF, document behavior

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Create verification script
cat > verify-large-doc.js << 'EOF'
import { GoogleGenAI } from '@google/genai';

async function verifyLargeOutput() {
  const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    apiVersion: 'v1'
  });

  // Generate large output
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: 'Generate a 50,000 word essay about the history of computing',
    config: { maxOutputTokens: 65536 }
  });
  
  const wordCount = response.text.split(' ').length;
  console.log('✅ Large output test:', wordCount, 'words');
  console.log('Token capacity utilized:', Math.round((wordCount / 50000) * 100) + '%');
}

verifyLargeOutput().catch(console.error);
EOF

# Run verification
node verify-large-doc.js
```

---

## Task T-009: Context Caching Implementation (Optional)

**Task Name**: Implement Context Caching for Cost Optimization  
**Priority**: Medium (Optional enhancement)  
**Estimated Time**: 3 hours  
**Risk Level**: Low (Optional feature)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 145-202

### Task Purpose
**As a** cost optimization feature  
**I need** context caching for repeated processing  
**So that** re-chunking operations cost 50% less  

### Dependencies
- **Prerequisite Tasks**: T-001 through T-008 (Core implementation complete)
- **Parallel Tasks**: T-010
- **Integration Points**: Document processing pipeline
- **Blocked By**: None (optional)

### Technical Requirements

#### Functional Requirements
- **REQ-1**: System shall cache documents over 1024 tokens
- **REQ-2**: Cache shall persist for 1 hour (3600 seconds)
- **REQ-3**: Re-processing with cache shall cost 50% less
- **REQ-4**: Cache management shall be automatic

### Implementation Details

#### Files to Create
```
└── /Users/topher/Code/rhizome-v2/worker/lib/context-caching.ts - New caching module
```

#### Files to Modify
```
└── /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts - Integrate caching
```

#### Key Implementation Steps
1. **Step 1**: Create DocumentCacheManager class → Cache infrastructure ready
2. **Step 2**: Implement cache creation method → Can store document context
3. **Step 3**: Implement cache retrieval method → Can reuse cached context
4. **Step 4**: Add TTL management → Caches expire after 1 hour
5. **Step 5**: Integrate with process-document.ts → Caching operational

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Cache creation
  Given a document over 1024 tokens
  When processing completes
  Then a cache entry should be created
  And it should have a 1-hour TTL

Scenario 2: Cache reuse
  Given an existing cache for a document
  When re-processing is triggered
  Then the cached context should be used
  And API costs should be reduced

Scenario 3: Cache expiration
  Given a cache older than 1 hour
  When attempting to use it
  Then it should be considered expired
  And new processing should occur
```

#### Rule-Based Criteria (Checklist)
- [ ] DocumentCacheManager class created
- [ ] Cache creation for large documents
- [ ] Cache retrieval functionality
- [ ] TTL management (1 hour)
- [ ] Integration with main pipeline
- [ ] Cost reduction verified
- [ ] Memory efficient implementation

### Manual Testing Steps
1. **Test Case 1**: Process large document, verify cache created
2. **Test Case 2**: Re-process same document, verify cache used
3. **Test Case 3**: Wait 1+ hour, verify cache expired
4. **Test Case 4**: Monitor API costs for cached vs non-cached

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Type checking
cd worker && npm run build

# Verify caching module exists
test -f worker/lib/context-caching.ts && echo "✅ Cache module created"

# Check integration
grep "DocumentCacheManager" worker/handlers/process-document.ts
```

---

## Task T-010: Performance Monitoring (Optional)

**Task Name**: Add Performance Metrics and Monitoring  
**Priority**: Low (Optional enhancement)  
**Estimated Time**: 1 hour  
**Risk Level**: Low (Monitoring only)  

### Source PRP Document
**Reference**: docs/prps/gemini-25-flash-upgrade.md - Lines 408-412

### Task Purpose
**As a** operations capability  
**I need** performance monitoring  
**So that** I can track improvements from the upgrade  

### Dependencies
- **Prerequisite Tasks**: T-001 through T-008
- **Parallel Tasks**: T-009
- **Integration Points**: Logging system
- **Blocked By**: None (optional)

### Technical Requirements

#### Functional Requirements
- **REQ-1**: System shall log processing times for each document
- **REQ-2**: System shall track token usage per request
- **REQ-3**: System shall measure memory consumption
- **REQ-4**: Metrics shall be easily accessible

### Implementation Details

#### Files to Modify
```
└── /Users/topher/Code/rhizome-v2/worker/handlers/process-document.ts
    ├── Add performance timing
    ├── Log token usage
    └── Track memory metrics
```

#### Key Implementation Steps
1. **Step 1**: Add timing markers at start/end → Duration tracked
2. **Step 2**: Log token counts from responses → Usage visible
3. **Step 3**: Add memory snapshots → Memory tracked
4. **Step 4**: Create metrics summary → Performance visible

### Acceptance Criteria

#### Given-When-Then Scenarios
```gherkin
Scenario 1: Performance logging
  Given document processing
  When processing completes
  Then timing metrics should be logged
  And token usage should be recorded

Scenario 2: Metrics visibility
  Given collected metrics
  When viewing logs
  Then performance data should be clear
  And trends should be identifiable
```

#### Rule-Based Criteria (Checklist)
- [ ] Processing time logged
- [ ] Token usage tracked
- [ ] Memory consumption measured
- [ ] Metrics logged in structured format
- [ ] No performance impact from monitoring

### Manual Testing Steps
1. **Test Case 1**: Process document, check timing logs
2. **Test Case 2**: Verify token counts in logs
3. **Test Case 3**: Review memory usage patterns

### Validation & Quality Gates

#### Code Quality Checks
```bash
# Check for performance logs
tail -f worker/logs/*.log | grep -E "processing_time|token_usage"

# Verify metrics collection
grep "performance" worker/handlers/process-document.ts
```

---

## Implementation Recommendations

### Suggested Team Structure
- **Senior Developer**: Tasks T-001 through T-005 (Core implementation)
- **Junior Developer**: Tasks T-006 through T-008 (Testing and validation)
- **Optional**: Tasks T-009-T-010 can be deferred or assigned based on capacity

### Optimal Task Sequencing
```
Day 1: T-001 → T-002 (Package migration)
Day 2: T-003 + T-004 (parallel) → T-005 (API implementation)
Day 3: T-006 → T-007 (Testing)
Day 4: T-008 (Large document validation)
Day 5: T-009 + T-010 (Optional enhancements if time permits)
```

### Parallelization Opportunities
- T-003 and T-004 can be done simultaneously (different file sections)
- T-007 and T-008 can run in parallel (different test types)
- T-009 and T-010 are independent (can be split between developers)

### Resource Allocation Suggestions
- Ensure GEMINI_API_KEY is available to all developers
- Prepare test documents in advance (various sizes)
- Set up shared test environment for validation
- Document any issues found during implementation

## Critical Path Analysis

### Tasks on Critical Path
1. **T-001**: SDK Package Replacement (blocks everything)
2. **T-002**: Import Updates (blocks compilation)
3. **T-005**: API Implementation (blocks functionality)
4. **T-007**: Integration Testing (blocks release)

### Potential Bottlenecks
- **SDK Compatibility**: If new SDK has unexpected breaking changes
- **API Response Format**: If response structure differs from expected
- **Large Document Testing**: Requires preparation of test documents
- **Environment Setup**: All developers need API keys

### Schedule Optimization Suggestions
- Start T-001 immediately (no dependencies)
- Prepare test documents in parallel with development
- Have backup plan if SDK has compatibility issues
- Consider feature flag for gradual rollout

## Risk Summary

### High Risk Items
- **T-001**: SDK package replacement (breaking changes)
- **T-005**: API implementation (compatibility unknown)

### Medium Risk Items
- **T-002**: Import updates (compilation failures)
- **T-006**: Test mock updates (test suite stability)
- **T-007**: Integration testing (may reveal issues)

### Low Risk Items
- **T-003**: Model string updates (simple replacements)
- **T-004**: Token limit updates (number changes)
- **T-008**: Validation testing (testing only)
- **T-009**: Context caching (optional feature)
- **T-010**: Performance monitoring (optional)

## Definition of Done

### Sprint Completion Criteria
- [ ] All TypeScript compilation succeeds
- [ ] All existing tests pass with new SDK
- [ ] 200+ page documents process without truncation
- [ ] No regression in existing functionality
- [ ] Documentation updated with new capabilities
- [ ] Performance metrics show improvement
- [ ] Code reviewed and approved
- [ ] Deployed to staging environment

---

**Generated**: 2025-09-28  
**Sprint Duration**: 5 days  
**Estimated Total Effort**: ~15 hours core + 4 hours optional  
**Confidence Level**: 9/10  

**Next Steps**:
1. Review task breakdown with team
2. Assign tasks based on expertise
3. Begin with T-001 (SDK package replacement)
4. Set up daily standup for progress tracking