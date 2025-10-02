# Testing Rules for Rhizome

---

## Core Philosophy Rules

### RULE 1: Personal Tool Testing Strategy
```
This is a personal tool for ONE user. Test accordingly:

✅ DO:
- Test what's expensive to debug (stitching, fuzzy matching, cost explosions)
- Test what loses user data (annotation recovery, chunk remapping)
- Test algorithmic correctness (filtering logic, scoring weights)
- Write tests for code that runs $0.50 per execution

❌ DON'T:
- Test obvious UI rendering (user will see it broken)
- Test simple CRUD operations (break immediately if wrong)
- Test external API responses (can't control them)
- Write tests for code the user will manually verify anyway
```

### RULE 2: Data Loss Hierarchy
```
CRITICAL (Never lose):
1. Annotations - Hours of manual user work, irreplaceable
2. Full markdown documents (content.md) - Source of truth

IMPORTANT (Expensive to regenerate):
3. Chunks with metadata - Cost ~$0.20 per document to regenerate
4. Embeddings - Cost ~$0.02 per document

REPLACEABLE (Can regenerate):
5. Connections - Auto-detected, can be recomputed
6. Processing status - Temporary state

TEST IN THIS ORDER: Annotations > Documents > Chunks > Everything else
```

### RULE 3: Cost-Aware Testing
```
Before writing any test that calls AI APIs:

1. Calculate cost: How much per test run?
2. If > $0.01 per test → Mock the AI calls
3. If testing filtering → Use real chunked data as fixtures
4. If testing pipelines → Use one small test document (<20 pages)

Example:
❌ BAD: test('process 500-page book', async () => { /* $0.54 per run */ })
✅ GOOD: test('process 10-page essay', async () => { /* $0.03 per run */ })
✅ BEST: test('filtering logic', () => { /* $0 - uses fixtures */ })
```

---

## Test Categorization Rules

### RULE 4: Critical Tests (Must Write)

Write a critical test when code:
- Handles annotation position recovery after content edits
- Handles chunk remapping after document reprocessing
- Implements fuzzy matching for stitching batched extractions
- Implements filtering logic for ThematicBridge engine (cost control)
- Calculates connection scores with user preference weights
- Processes the main document pipeline end-to-end

**Test file location**: `tests/critical/` or `worker/tests/critical/`

**Example pattern**:
```typescript
// tests/critical/annotation-recovery.test.ts
describe('Annotation Position Recovery', () => {
  test('recovers position after minor edit', () => {
    const original = "The opening scene introduces Slothrop.";
    const edited = "The opening scene introduces Tyrone Slothrop.";
    const annotation = { position: { start: 0, end: 38 } };
    
    const recovered = recoverPosition(annotation, original, edited);
    
    expect(recovered.position.start).toBe(0);
    expect(recovered.position.end).toBe(45); // Adjusted for "Tyrone "
    expect(recovered.confidence).toBeGreaterThan(0.95);
  });
});
```

### RULE 5: Stable Tests (Write When Feature Stabilizes)

Write a stable test when code:
- Implements Server Actions with complex logic
- Handles database CRUD with business rules
- Integrates multiple system components
- Manages file storage operations with versioning

**Test file location**: `tests/stable/`

**When to write**: After feature works, before moving to next feature

### RULE 6: Flexible Tests (Skip During Rapid Development)

Write a flexible test when code:
- Implements React component rendering logic
- Implements utility functions (formatters, validators)
- Handles simple data transformations

**Test file location**: `tests/flexible/`

**When to write**: During stabilization sprints, not during feature development

### RULE 7: Experimental Tests (Feature Spikes Only)

Write an experimental test when:
- Prototyping a new connection engine
- Researching an architecture change
- Validating a proof of concept

**Test file location**: `tests/experimental/`

**Lifecycle**: Delete or promote to another category within 2 weeks

---

## Specific Test Requirements

### RULE 8: Annotation Testing (MANDATORY)

Every annotation-related code change MUST include tests for:

```typescript
// 1. Position recovery after content edits
test('recovers after typo fix', () => { /* ... */ });
test('recovers after paragraph insertion', () => { /* ... */ });
test('detects when annotated text deleted', () => { /* ... */ });

// 2. Chunk remapping after reprocessing
test('remaps to new chunk with same boundaries', () => { /* ... */ });
test('handles chunks that were split', () => { /* ... */ });
test('handles chunks that were merged', () => { /* ... */ });
test('flags orphaned annotations', () => { /* ... */ });

// 3. Round-trip persistence
test('saves and loads annotations correctly', () => { /* ... */ });
test('recovers annotations after content edit', () => { /* ... */ });
test('version control for annotations', () => { /* ... */ });
```

**Rationale**: Annotations are user work. Never lose them. Ever.

### RULE 9: Stitching Testing (MANDATORY)

Every change to batch stitching logic MUST include tests for:

```typescript
// 1. Exact overlap detection
test('finds exact overlap between batches', () => { /* ... */ });

// 2. Fuzzy matching for OCR variations
test('handles extra whitespace', () => { /* ... */ });
test('handles missing characters', () => { /* ... */ });

// 3. Fallback behavior
test('falls back to paragraph boundary when no match', () => { /* ... */ });

// 4. Multi-batch stitching
test('stitches 6 batches without duplicates', () => { /* ... */ });
```

**Rationale**: Stitching breaks silently. Manual verification of 150k word document is impossible.

### RULE 10: Filtering Testing (MANDATORY)

Every change to ThematicBridge filtering MUST include tests for:

```typescript
// 1. Importance threshold
test('filters chunks below importance threshold', () => { /* ... */ });

// 2. Cross-document filtering
test('excludes same document chunks', () => { /* ... */ });

// 3. Concept overlap sweet spot
test('filters to 0.2-0.7 concept overlap range', () => { /* ... */ });

// 4. Candidate limit
test('limits to top 15 candidates', () => { /* ... */ });

// 5. Cost verification
test('total AI calls < 300 for 382-chunk book', () => { /* ... */ });
```

**Rationale**: Bad filtering causes cost explosion ($0.20 → $20 per book).

### RULE 11: Connection Scoring Testing (REQUIRED)

Every change to scoring logic MUST include tests for:

```typescript
// 1. Weight application
test('applies personal weights correctly', () => { /* ... */ });

// 2. Weight validation
test('weights sum to 1.0', () => { /* ... */ });

// 3. Priority verification
test('contradiction weighted highest', () => { /* ... */ });

// 4. Real-time adjustment
test('updates scores when weights change', () => { /* ... */ });
```

---

## Test Data Rules

### RULE 12: Use Real Fixtures, Not Fake Data

```
❌ NEVER DO THIS:
const chunk = {
  content: "Lorem ipsum dolor sit amet",
  concepts: [{ text: "concept1", importance: 0.5 }]
};

✅ ALWAYS DO THIS:
// __fixtures__/chunks.ts
export const realChunks = {
  gravityRainbow_chunk0: {
    content: "The opening scene of Pynchon's novel introduces...",
    concepts: [
      { text: "V-2 rocket", importance: 0.9 },
      { text: "Pavlovian conditioning", importance: 0.8 }
    ],
    emotional_tone: { polarity: -0.3, primaryEmotion: "anxiety" }
  }
};
```

**How to generate fixtures**:
1. Process one real book manually
2. Export `chunks` table to JSON
3. Pick representative samples (high/low importance, different domains)
4. Version control the fixtures file
5. Use in tests via `import { realChunks } from '@/tests/fixtures/chunks'`

### RULE 13: Fixture Organization

```
tests/fixtures/
├── chunks.ts              # Real processed chunks from 3-5 books
├── documents.ts           # Sample markdown documents
├── annotations.ts         # Sample annotations with various scenarios
├── connections.ts         # Known good connections
└── content-edits.ts       # Real content edit scenarios

worker/tests/fixtures/
├── pdf-samples/           # Small test PDFs (<20 pages)
├── extraction-results/    # Real Gemini extraction outputs
└── metadata-results/      # Real metadata extraction outputs
```

---

## Code Pattern Rules

### RULE 14: Test Structure Pattern

```typescript
// ✅ CORRECT TEST STRUCTURE
describe('ComponentName or FunctionName', () => {
  // Setup shared test data
  const fixtures = {
    simple: { /* minimal case */ },
    complex: { /* edge case */ },
    error: { /* failure case */ }
  };

  // Reset state between tests
  beforeEach(() => {
    // Clean slate for each test
  });

  // Test the happy path first
  test('handles normal case correctly', () => {
    const result = functionUnderTest(fixtures.simple);
    expect(result).toMatchExpectedOutput();
  });

  // Then test edge cases
  test('handles edge case X', () => { /* ... */ });
  
  // Then test error cases
  test('handles error case Y', () => { /* ... */ });

  // Cleanup
  afterEach(() => {
    // Restore state if needed
  });
});
```

### RULE 15: Async Testing Pattern

```typescript
// ✅ CORRECT ASYNC PATTERN
test('processes document correctly', async () => {
  const doc = fixtures.document.simple;
  
  // Start async operation
  const promise = processDocument(doc);
  
  // Can check intermediate state
  expect(doc.status).toBe('processing');
  
  // Wait for completion
  const result = await promise;
  
  // Assert final state
  expect(result.status).toBe('completed');
  expect(result.chunks.length).toBeGreaterThan(0);
});

// ❌ WRONG - No await
test('processes document', () => {
  processDocument(doc); // Missing await!
  expect(doc.status).toBe('completed'); // Will fail
});
```

### RULE 16: Error Testing Pattern

```typescript
// ✅ CORRECT ERROR TESTING
test('handles API failure gracefully', async () => {
  mockGeminiError('Rate limit exceeded');
  
  const doc = fixtures.document.simple;
  
  // Test that it throws
  await expect(processDocument(doc)).rejects.toThrow('Rate limit');
  
  // Test error state is recorded
  expect(doc.processing_status).toBe('failed');
  expect(doc.error_message).toContain('Rate limit');
});
```

### RULE 17: Mock Pattern

```typescript
// ✅ CORRECT MOCKING - Mock at module boundary
jest.mock('@google/genai', () => ({
  GoogleAI: jest.fn(() => ({
    generateContent: jest.fn().mockResolvedValue({
      text: '# Processed Content\n\nTest output'
    })
  }))
}));

// ❌ WRONG - Mocking internal functions
jest.mock('../internal-helper'); // Don't mock your own code
```

---

## Quality Gate Rules

### RULE 18: Critical Tests Must Pass

```
Before ANY commit that touches these areas:
- Annotation recovery logic → Run annotation tests
- Stitching logic → Run stitching tests
- Filtering logic → Run filtering tests
- Scoring logic → Run scoring tests

Command: npm run test:critical

If ANY critical test fails:
1. Fix the test or the code
2. Do NOT commit until passing
3. Do NOT skip tests with .skip()
```

### RULE 19: Cost Validation

```
Before committing changes to AI-calling code:

1. Check test output for cost warnings
2. Verify total AI calls < 300 per document
3. If cost increased, explain why in commit message

Example commit message:
"feat: improve thematic bridge precision

- Increased candidates from 10 to 15 per chunk
- Cost impact: $0.20 → $0.25 per document (+25%)
- Justification: User requested better cross-domain connections"
```

### RULE 20: Coverage Direction, Not Percentage

```
DON'T focus on coverage percentage goals.

DO track coverage direction:
- Is critical path coverage increasing?
- Are new features covered by E2E tests?
- Do we have fixtures for real data?

✅ GOOD: "Added E2E test for new reader sidebar feature"
❌ BAD: "Increased coverage from 67% to 68%"
```

---

## Test Maintenance Rules

### RULE 21: When Tests Fail

```
Critical test failing?
→ Fix immediately, block all other work

Stable test failing?
→ Fix within 1 week, document if can't fix

Flexible test failing?
→ Note for stabilization sprint, continue development

Experimental test failing?
→ Delete or move to appropriate category
```

### RULE 22: Test Cleanup Schedule

```
Weekly:
- Run `npm run test:critical` → must pass
- Run `npm run test:stable` → track failures
- Note failing flexible tests for later

Monthly:
- Clean up experimental/ directory
- Move stabilized features to appropriate category
- Update fixtures with new real data

Quarterly:
- Review test categorization
- Archive obsolete tests
- Update this document
```

### RULE 23: Test Lifecycle

```
New feature → Start with E2E test (critical/)
             ↓
Feature working → Add integration test (stable/)
                  ↓
Feature stable → Add unit tests (flexible/)
                 ↓
Feature complete → All tests passing and categorized
```

---

## Specific Technology Rules

### RULE 24: Jest Configuration

```typescript
// jest.config.js - Use this structure
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Only run tests in these directories
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/tests/**/*.test.ts'
  ],
  
  // Fast tests only
  testTimeout: 5000,
  
  // Coverage for critical algorithms only
  collectCoverageFrom: [
    'src/processors/stitcher.ts',
    'src/engines/*/filter.ts',
    'src/engines/scoring.ts',
    'src/ecs/annotations/recovery.ts',
    'src/ecs/annotations/remap.ts'
  ],
  
  // Don't aim for 100%
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 50,
      functions: 60,
      lines: 60
    }
  }
};
```

### RULE 25: Playwright E2E Structure

```typescript
// tests/e2e/upload-process-read.spec.ts
import { test, expect } from '@playwright/test';

test('complete document workflow', async ({ page }) => {
  // 1. Upload
  await page.goto('/documents');
  await page.setInputFiles('input[type="file"]', 'fixtures/test-essay.pdf');
  
  // 2. Wait for processing
  await expect(page.locator('.processing-status')).toHaveText('completed', {
    timeout: 120000 // 2 minutes for processing
  });
  
  // 3. Read and verify
  await page.click('text="Read"');
  await expect(page.locator('.document-content')).toBeVisible();
  await expect(page.locator('.connection-sidebar')).toBeVisible();
  
  // 4. Check connections exist
  const connections = page.locator('.connection-item');
  await expect(connections).toHaveCountGreaterThan(0);
});
```

---

## What NOT to Test

### RULE 26: Skip These Tests

```
❌ NEVER TEST:
1. React component rendering (just look at it)
2. Simple CRUD with no logic (breaks obviously)
3. External API responses (can't control)
4. JSON serialization (JavaScript basics)
5. Database schema (migrations catch issues)
6. UI text changes (visual verification)
7. TypeScript type checking (compiler handles)

WHY: Manual verification is faster and more reliable
```

### RULE 27: Don't Test Through the UI

```
❌ BAD:
test('annotation saves correctly', async () => {
  render(<AnnotationForm />);
  await userEvent.type(input, 'My note');
  await userEvent.click(saveButton);
  expect(await loadAnnotations()).toContain('My note');
});

✅ GOOD:
test('annotation saves correctly', async () => {
  const annotation = fixtures.annotation.simple;
  await saveAnnotations(storagePath, [annotation]);
  const loaded = await loadAnnotations(storagePath);
  expect(loaded[0]).toMatchObject(annotation);
});
```

---

## Documentation Rules

### RULE 28: Test Documentation Requirements

```
Every test file must have:
1. Description comment at top explaining what's being tested
2. Rationale for why these tests exist
3. Setup instructions if complex

Example:
```typescript
/**
 * Annotation Recovery Tests
 * 
 * Tests fuzzy position recovery after content edits.
 * 
 * WHY: Annotations represent hours of user work. If content.md
 * is edited (typo fix, paragraph added), annotation positions
 * become invalid. These tests ensure we can recover them.
 * 
 * CRITICAL: Failing these tests means potential data loss.
 */
```

### RULE 29: Commit Message Requirements

```
When changing tests, commit message must include:

feat/fix/refactor: brief description

- What changed in the tests
- Why the change was needed  
- Cost impact if relevant
- Breaking changes if any

Example:
"refactor: improve annotation recovery fuzzy matching

- Added OCR variation handling
- Increased confidence threshold from 0.7 to 0.8
- All existing annotations tested - no breakage
- No cost impact (local computation)"
```

---

## Emergency Procedures

### RULE 30: Data Loss Prevention

```
IF annotation tests fail:
1. STOP all development immediately
2. Verify no user data is at risk
3. Fix the failing tests
4. Run manual recovery check:
   - Load real annotations.json
   - Verify all positions recoverable
   - Test chunk remapping
5. Only resume development when verified safe

IF stitching tests fail:
1. STOP processing any documents
2. Check last processed document for corruption
3. Fix stitching logic
4. Reprocess last document to verify
5. Resume processing

IF filtering tests fail and cost exploded:
1. Check background_jobs for runaway costs
2. Pause job processing if needed
3. Fix filtering logic
4. Resume with manual cost monitoring
```

---

## Summary Checklist

When an AI coding agent writes code for Rhizome, follow this checklist:

```
[ ] Does code handle annotations? → Write critical tests (RULE 8)
[ ] Does code implement stitching? → Write critical tests (RULE 9)
[ ] Does code call AI APIs? → Write filtering tests (RULE 10)
[ ] Does code calculate scores? → Write scoring tests (RULE 11)
[ ] Are tests using real fixtures? → Check RULE 12
[ ] Are tests in correct category? → Check RULES 4-7
[ ] Do critical tests pass? → Check RULE 18
[ ] Is cost validated? → Check RULE 19
[ ] Is test documented? → Check RULE 28
[ ] Is commit message clear? → Check RULE 29
```

**The Golden Rule**: If losing this data would make the user angry, test it. If the user can see it's broken immediately, don't test it.