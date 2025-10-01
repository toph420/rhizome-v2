# Testing Strategy Overhaul - Task Breakdown

**Feature Name**: Testing Strategy Overhaul  
**Document Version**: 1.0  
**Date**: January 29, 2025  
**Source PRP**: `/docs/prps/testing-strategy-overhaul.md`  
**Implementation Timeline**: 3 Weeks (Jan 29 - Feb 16)  

## Executive Summary

This task breakdown implements a comprehensive testing strategy overhaul for Rhizome V2, organized into three phases:
- **Week 1**: Foundation fixes and infrastructure setup
- **Week 2**: Core coverage for critical paths
- **Week 3**: E2E testing with Playwright MCP

Total estimated effort: 120 hours (3 weeks × 40 hours)

---

## Phase 1: Foundation (Week 1 - Jan 29 to Feb 2)

### Task T-001: Fix Jest ESM Configuration

**Task Name**: Configure Jest for ESM Support in Worker Module  
**Priority**: Critical  
**Estimated Hours**: 4-6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Phase 1 Requirements  
**Purpose**: Enable proper ESM module support for Jest v30 to resolve current test failures  

#### Dependencies
- **Prerequisites**: None (first task)
- **Blocks**: T-002, T-003, T-004, T-005 (all other testing tasks)

#### Technical Requirements
- Configure Jest to handle ESM modules properly
- Update package.json scripts for correct test execution
- Ensure TypeScript compilation works with ESM

#### Implementation Details

**Files to Modify/Create**:
```
├── worker/jest.config.ts - [Convert from .cjs, add ESM support]
├── worker/package.json - [Update test scripts with ESM flags]
├── worker/tsconfig.json - [Ensure ESM module resolution]
└── worker/tests/setup.ts - [Create test environment setup]
```

**Code Pattern to Follow**:
```typescript
// worker/jest.config.ts
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        target: 'esnext',
      }
    }],
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
}

export default config
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: ESM modules load correctly
  Given the Jest configuration is updated
  When running "npm test -- --listTests"
  Then all test files should be listed without import errors
  And TypeScript files should compile successfully

Scenario: Worker tests execute
  Given the ESM configuration is applied
  When running "cd worker && npm test"
  Then tests should execute without module resolution errors
```

**Checklist**:
- [ ] Jest configuration converted to TypeScript
- [ ] ESM flags added to package.json scripts
- [ ] All existing tests can be imported
- [ ] No module resolution errors

#### Validation Commands
```bash
npm test -- --listTests                    # Lists all test files
cd worker && npm test -- --listTests       # Worker tests accessible
npm test -- --version                      # Shows Jest v30.x
```

---

### Task T-002: Create Test Factories and Helpers

**Task Name**: Implement Test Data Factory Pattern  
**Priority**: High  
**Estimated Hours**: 6-8 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Test Factory Requirements  
**Purpose**: Establish reusable test data generation patterns to reduce test maintenance burden  

#### Dependencies
- **Prerequisites**: T-001 (Jest ESM configuration working)
- **Blocks**: T-005 (ECS tests need factories)

#### Technical Requirements
- Create factory functions for all major data types
- Support overrides for customization
- Include builder pattern for complex objects

#### Implementation Details

**Files to Create**:
```
├── tests/factories/
│   ├── index.ts - [Main factory export]
│   ├── document.factory.ts - [Document test data]
│   ├── chunk.factory.ts - [Chunk and embedding data]
│   ├── entity.factory.ts - [ECS entity data]
│   ├── user.factory.ts - [User and auth data]
│   └── processor.factory.ts - [Processor config data]
└── tests/helpers/
    ├── supabase.mock.ts - [Supabase client mocks]
    └── gemini.mock.ts - [Gemini API mocks]
```

**Reference Pattern**: `/Users/topher/Code/rhizome-v2/tests/integration/annotation-flow.test.ts:49-104`

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Factory creates valid test data
  Given the document factory is imported
  When calling factories.document.create()
  Then a valid document object is returned
  And all required fields are populated

Scenario: Factory supports overrides
  Given a custom title is needed
  When calling factories.document.create({ title: 'Custom' })
  Then the document has the custom title
  And other fields use defaults
```

**Checklist**:
- [ ] All major data types have factories
- [ ] Factories support partial overrides
- [ ] Helper utilities for common mocking patterns
- [ ] TypeScript types properly exported

#### Validation Commands
```bash
npm test -- tests/factories/document.factory.test.ts
npm test -- tests/factories/index.test.ts
```

---

### Task T-003: Consolidate Testing Documentation

**Task Name**: Unify Testing Documentation in Single Location  
**Priority**: Medium  
**Estimated Hours**: 3-4 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Documentation Consolidation  
**Purpose**: Reduce documentation scatter across 4+ files into single source of truth  

#### Dependencies
- **Prerequisites**: T-001 (understand current test setup)
- **Parallel**: Can run alongside T-002

#### Implementation Details

**Files to Modify/Create**:
```
├── docs/testing/README.md - [Main testing guide]
├── docs/testing/PATTERNS.md - [Common test patterns]
├── docs/testing/MOCKING.md - [Mocking strategies]
└── docs/testing/E2E.md - [E2E testing with Playwright]
```

**Files to Archive/Remove**:
- `docs/testing/CURRENT_TESTING_SETUP.md` → Archive
- `docs/testing/TESTING_GAPS_AND_IMPROVEMENT.md` → Archive
- `worker/tests/TESTING_STATUS.md` → Consolidate

#### Acceptance Criteria

**Checklist**:
- [ ] Single README.md with complete testing overview
- [ ] Quick start commands documented
- [ ] Test organization structure explained
- [ ] Coverage targets and validation gates documented
- [ ] Links to all pattern examples

#### Validation Commands
```bash
ls -la docs/testing/
grep -r "test" docs/testing/README.md
```

---

### Task T-004: Update Processor Tests for New Architecture

**Task Name**: Align Processor Tests with Refactored Architecture  
**Priority**: High  
**Estimated Hours**: 6-8 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Architecture Alignment  
**Purpose**: Fix failing tests due to processor I/O pattern changes from recent refactoring  

#### Dependencies
- **Prerequisites**: T-001 (Jest working), T-002 (factories available)
- **Blocks**: T-007 (document processing coverage)

#### Implementation Details

**Files to Modify**:
```
├── worker/processors/__tests__/pdf-processor.test.ts
├── worker/processors/__tests__/youtube-processor.test.ts
├── worker/processors/__tests__/markdown-processor.test.ts
├── worker/processors/__tests__/web-processor.test.ts
├── worker/processors/__tests__/text-processor.test.ts
└── worker/processors/__tests__/base.test.ts
```

**Reference Pattern**: New processor interface from `worker/processors/base.ts`

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Processor tests match new interface
  Given the PDFProcessor test is updated
  When running the test suite
  Then tests use correct transform() signature
  And output matches ProcessedDocument interface
  And all assertions pass
```

**Checklist**:
- [ ] All 6 processor tests updated
- [ ] Tests use new factory patterns
- [ ] Mock Gemini API correctly
- [ ] Error cases covered

#### Validation Commands
```bash
cd worker && npm test processors/
cd worker && npm test -- --coverage processors/
```

---

### Task T-005: Implement Core ECS System Tests

**Task Name**: Create Comprehensive ECS Test Suite  
**Priority**: Critical  
**Estimated Hours**: 8 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - ECS Coverage Requirements  
**Purpose**: Establish test coverage for Entity-Component-System (currently 0%)  

#### Dependencies
- **Prerequisites**: T-001 (Jest working), T-002 (factories available)
- **Parallel**: Can start after T-002

#### Implementation Details

**Files to Create**:
```
├── src/lib/ecs/__tests__/ecs.test.ts - [Core ECS operations]
├── src/lib/ecs/__tests__/entity.test.ts - [Entity lifecycle]
├── src/lib/ecs/__tests__/component.test.ts - [Component operations]
├── src/lib/ecs/__tests__/query.test.ts - [Query system]
└── src/lib/ecs/__tests__/isolation.test.ts - [User isolation]
```

**Reference Pattern**: `/Users/topher/Code/rhizome-v2/tests/integration/annotation-flow.test.ts:49-104`

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Entity creation with components
  Given a user ID and component data
  When calling ecs.createEntity()
  Then an entity ID is returned
  And components are stored correctly
  And user isolation is maintained

Scenario: Query entities by component types
  Given entities with various components exist
  When querying for ['flashcard', 'study']
  Then only matching entities are returned
  And results are scoped to user

Scenario: Component updates
  Given an existing component
  When updating component data
  Then the update succeeds
  And version tracking works
  And user authorization is checked
```

**Checklist**:
- [ ] Entity CRUD operations tested
- [ ] Component lifecycle tested
- [ ] Query system tested
- [ ] User isolation verified
- [ ] Error cases handled
- [ ] >80% code coverage achieved

#### Validation Commands
```bash
npm test -- src/lib/ecs/__tests__/
npm test -- --coverage src/lib/ecs/
```

---

## Phase 2: Core Coverage (Week 2 - Feb 3 to Feb 9)

### Task T-006: Test All Document Input Formats

**Task Name**: Comprehensive Document Processing Tests  
**Priority**: High  
**Estimated Hours**: 8 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Document Processing Coverage  
**Purpose**: Validate all 6 input formats process correctly  

#### Dependencies
- **Prerequisites**: T-004 (processor tests fixed)
- **Parallel**: Can run alongside T-007, T-008

#### Implementation Details

**Test Coverage Required**:
1. PDF processing with Gemini Files API
2. YouTube transcript extraction and cleaning
3. Web page content extraction
4. Markdown processing (as-is and clean modes)
5. Plain text processing
6. Paste content handling

**Files to Create/Modify**:
```
├── worker/__tests__/integration/pdf-flow.test.ts
├── worker/__tests__/integration/youtube-flow.test.ts
├── worker/__tests__/integration/web-flow.test.ts
├── worker/__tests__/integration/markdown-flow.test.ts
├── worker/__tests__/integration/text-flow.test.ts
└── worker/__tests__/integration/paste-flow.test.ts
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: PDF processing end-to-end
  Given a valid PDF file
  When processing through the pipeline
  Then markdown is extracted
  And chunks are generated
  And embeddings are created
  And metadata is preserved

Scenario: YouTube processing with timestamps
  Given a YouTube URL with transcript
  When processing the video
  Then transcript is cleaned
  And timestamps are preserved
  And fuzzy positioning works
```

**Checklist**:
- [ ] All 6 formats have integration tests
- [ ] Error recovery tested for each format
- [ ] Gemini API failures handled
- [ ] Output validation for each format

#### Validation Commands
```bash
cd worker && npm test __tests__/integration/
cd worker && npm test -- --coverage handlers/
```

---

### Task T-007: Test Collision Detection Engines

**Task Name**: Validate All 7 Collision Detection Engines  
**Priority**: Critical  
**Estimated Hours**: 8 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Collision Engine Coverage  
**Purpose**: Ensure all connection discovery engines work correctly  

#### Dependencies
- **Prerequisites**: T-001 (Jest working), T-002 (factories)
- **Parallel**: Can run alongside T-006, T-008

#### Implementation Details

**Engines to Test**:
1. Semantic Similarity (25% weight)
2. Conceptual Density (20% weight)
3. Structural Pattern (15% weight)
4. Citation Network (15% weight)
5. Temporal Proximity (10% weight)
6. Contradiction Detection (10% weight)
7. Emotional Resonance (5% weight)

**Files to Create**:
```
├── worker/__tests__/engines/semantic-similarity.test.ts
├── worker/__tests__/engines/conceptual-density.test.ts
├── worker/__tests__/engines/structural-pattern.test.ts
├── worker/__tests__/engines/citation-network.test.ts
├── worker/__tests__/engines/temporal-proximity.test.ts
├── worker/__tests__/engines/contradiction-detection.test.ts
├── worker/__tests__/engines/emotional-resonance.test.ts
└── worker/__tests__/engines/orchestrator.test.ts
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Engine score calculation
  Given a set of test chunks
  When running semantic similarity engine
  Then scores are between 0 and 1
  And similar content scores higher
  And dissimilar content scores lower

Scenario: Orchestrator coordination
  Given all 7 engines are available
  When orchestrator runs analysis
  Then all engines are invoked
  And scores are normalized
  And weights are applied correctly
```

**Checklist**:
- [ ] Each engine has unit tests
- [ ] Score normalization tested
- [ ] Weight application verified
- [ ] Caching behavior tested
- [ ] Performance benchmarks met

#### Validation Commands
```bash
cd worker && npm test __tests__/engines/
cd worker && npm test -- --coverage engines/
```

---

### Task T-008: Test User Preference Weight System

**Task Name**: Validate Dynamic Weight Configuration  
**Priority**: Medium  
**Estimated Hours**: 4-6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - User Preference System  
**Purpose**: Verify user-configurable weight system works correctly  

#### Dependencies
- **Prerequisites**: T-007 (engines tested)
- **Parallel**: Can run alongside T-006

#### Implementation Details

**Files to Create**:
```
├── tests/integration/user-preferences.test.ts
├── tests/integration/weight-normalization.test.ts
└── tests/integration/preset-configs.test.ts
```

**Test Scenarios**:
- Custom weight configuration
- Preset configurations (balanced, academic, narrative, analytical)
- Normalization methods (linear, sigmoid, softmax)
- Weight persistence and retrieval

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Custom weight adjustment
  Given a user adjusts semantic similarity to 0.35
  When saving preferences
  Then the weight is persisted
  And collision detection uses new weight
  And results reflect the change

Scenario: Preset application
  Given a user selects "academic" preset
  When applied to collision detection
  Then citation network weight increases
  And emotional resonance decreases
```

**Checklist**:
- [ ] Weight CRUD operations tested
- [ ] Normalization methods verified
- [ ] Preset configurations tested
- [ ] Database persistence verified

#### Validation Commands
```bash
npm test tests/integration/user-preferences.test.ts
npm test tests/integration/weight-normalization.test.ts
```

---

### Task T-009: Database Operation Tests

**Task Name**: Test Supabase Integration Layer  
**Priority**: High  
**Estimated Hours**: 6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Database Coverage  
**Purpose**: Validate all database operations and migrations  

#### Dependencies
- **Prerequisites**: T-002 (mock helpers available)
- **Blocks**: T-012 (E2E tests need DB mocks)

#### Implementation Details

**Files to Create**:
```
├── tests/integration/database/documents.test.ts
├── tests/integration/database/chunks.test.ts
├── tests/integration/database/embeddings.test.ts
├── tests/integration/database/background-jobs.test.ts
└── tests/integration/database/migrations.test.ts
```

**Operations to Test**:
- Document CRUD with storage paths
- Chunk creation with embeddings
- Background job processing
- User isolation
- Transaction rollback

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Document creation with storage
  Given a new document upload
  When creating database record
  Then document is stored
  And storage path is recorded
  And processing job is queued

Scenario: Embedding storage with pgvector
  Given chunk embeddings are generated
  When storing in database
  Then 768-dimensional vectors are saved
  And similarity search works
```

**Checklist**:
- [ ] All CRUD operations tested
- [ ] Transaction handling verified
- [ ] Error recovery tested
- [ ] Migration scripts validated

#### Validation Commands
```bash
npm test tests/integration/database/
npx supabase db reset # Verify migrations work
```

---

### Task T-010: Achieve 50% Coverage Milestone

**Task Name**: Coverage Analysis and Gap Filling  
**Priority**: Medium  
**Estimated Hours**: 4 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Coverage Targets  
**Purpose**: Reach 50% test coverage on critical paths  

#### Dependencies
- **Prerequisites**: T-006, T-007, T-008, T-009 complete
- **Deliverable**: Coverage report and gap analysis

#### Implementation Details

**Actions Required**:
1. Generate coverage report
2. Identify critical path gaps
3. Write targeted tests for gaps
4. Document coverage improvements

#### Acceptance Criteria

**Checklist**:
- [ ] Coverage report generated
- [ ] Critical paths identified
- [ ] 50% coverage achieved
- [ ] Gap analysis documented
- [ ] CI/CD thresholds configured

#### Validation Commands
```bash
npm test -- --coverage --coverageThreshold='{"global":{"lines":50,"statements":50}}'
cd worker && npm test -- --coverage
```

---

## Phase 3: E2E Testing & Polish (Week 3 - Feb 10 to Feb 16)

### Task T-011: Configure Playwright with MCP Server

**Task Name**: Setup Playwright MCP for E2E Testing  
**Priority**: Critical  
**Estimated Hours**: 4-6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - E2E Testing Setup  
**Purpose**: Enable browser automation testing with Playwright MCP  
**Note**: Playwright MCP server is already installed  

#### Dependencies
- **Prerequisites**: Core tests passing (Phase 2)
- **Blocks**: T-012, T-013 (all E2E tests)

#### Implementation Details

**Files to Create**:
```
├── playwright.config.ts - [Playwright configuration]
├── tests/e2e/setup/auth.setup.ts - [Authentication state]
├── tests/e2e/setup/global.setup.ts - [Global test setup]
└── tests/e2e/fixtures/index.ts - [Custom test fixtures]
```

**Configuration Pattern**:
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Playwright executes tests
  Given Playwright is configured
  When running "npx playwright test --list"
  Then all E2E tests are discovered
  And browser launches successfully

Scenario: MCP server integration
  Given Playwright MCP is available
  When using MCP commands
  Then browser automation works
  And screenshots can be captured
```

**Checklist**:
- [ ] Playwright config created
- [ ] MCP server connected
- [ ] Browser launches
- [ ] Test discovery works
- [ ] Reports generated

#### Validation Commands
```bash
npx playwright test --list
npx playwright install # Install browsers if needed
npx playwright test --project=chromium
```

---

### Task T-012: Implement Page Object Model

**Task Name**: Create Page Objects for Key UI Components  
**Priority**: High  
**Estimated Hours**: 6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Page Object Pattern  
**Purpose**: Create maintainable E2E test structure  

#### Dependencies
- **Prerequisites**: T-011 (Playwright configured)
- **Enables**: T-013 (journey tests use page objects)

#### Implementation Details

**Files to Create**:
```
├── tests/e2e/page-objects/
│   ├── BasePage.ts - [Common page functionality]
│   ├── LibraryPage.ts - [Document library page]
│   ├── DocumentReaderPage.ts - [Reading interface]
│   ├── UploadModal.ts - [Upload component]
│   ├── ConnectionPanel.ts - [Connections sidebar]
│   └── AnnotationToolbar.ts - [Text selection tools]
```

**Pattern Example**:
```typescript
// tests/e2e/page-objects/DocumentReaderPage.ts
export class DocumentReaderPage extends BasePage {
  readonly selectors = {
    title: '[data-testid="document-title"]',
    content: '[data-testid="markdown-content"]',
    annotationBtn: '[data-testid="create-annotation"]',
    connectionPanel: '[data-testid="connections-panel"]',
  }

  async selectText(text: string) {
    // Implementation
  }

  async createAnnotation(note: string) {
    // Implementation
  }
}
```

#### Acceptance Criteria

**Checklist**:
- [ ] All major pages have objects
- [ ] Selectors use data-testid
- [ ] Methods are reusable
- [ ] TypeScript types included
- [ ] Documentation provided

#### Validation Commands
```bash
npx tsc --noEmit tests/e2e/page-objects/*.ts
npx playwright test tests/e2e/page-objects.test.ts
```

---

### Task T-013: Test Critical User Journeys

**Task Name**: Implement 3 Core E2E Test Scenarios  
**Priority**: Critical  
**Estimated Hours**: 8 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Critical Journeys  
**Purpose**: Validate complete user workflows end-to-end  

#### Dependencies
- **Prerequisites**: T-011 (Playwright ready), T-012 (page objects)
- **Parallel**: Can run alongside T-014

#### Implementation Details

**Critical Journeys to Test**:
1. Upload → Process → Read Document Flow
2. Select Text → Create Annotation → Save
3. View Connections → Adjust Weights → Update

**Files to Create**:
```
├── tests/e2e/journeys/upload-process-read.spec.ts
├── tests/e2e/journeys/annotation-creation.spec.ts
├── tests/e2e/journeys/connection-tuning.spec.ts
└── tests/e2e/journeys/critical-paths.spec.ts
```

#### Acceptance Criteria

**Given-When-Then**:
```gherkin
Scenario: Complete document upload flow
  Given a user is on the library page
  When uploading a PDF document
  Then processing status is shown
  And document becomes available
  And can be opened in reader

Scenario: Annotation persistence
  Given a document is open
  When creating an annotation
  Then it appears in the panel
  And persists after reload
  And shows in connections

Scenario: Weight adjustment impact
  Given connections are displayed
  When adjusting engine weights
  Then connections recalculate
  And new scores appear
  And preferences are saved
```

**Checklist**:
- [ ] Upload flow tested
- [ ] Annotation flow tested
- [ ] Connection tuning tested
- [ ] Error scenarios covered
- [ ] Performance acceptable

#### Validation Commands
```bash
npx playwright test tests/e2e/journeys/
npx playwright show-report
```

---

### Task T-014: Setup MSW for API Mocking

**Task Name**: Configure Mock Service Worker  
**Priority**: Medium  
**Estimated Hours**: 4-6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - API Mocking  
**Purpose**: Enable predictable API responses for E2E tests  

#### Dependencies
- **Prerequisites**: T-011 (Playwright setup)
- **Enhances**: T-013 (provides stable test data)

#### Implementation Details

**Files to Create**:
```
├── tests/e2e/mocks/handlers.ts - [API mock handlers]
├── tests/e2e/mocks/server.ts - [MSW server setup]
├── tests/e2e/mocks/data.ts - [Mock response data]
└── public/mockServiceWorker.js - [MSW service worker]
```

**Setup Commands**:
```bash
npm install --save-dev msw@2
npx msw init public/ --save
```

**Handler Pattern**:
```typescript
// tests/e2e/mocks/handlers.ts
import { rest } from 'msw'

export const handlers = [
  rest.get('/api/documents', (req, res, ctx) => {
    return res(ctx.json(mockDocuments))
  }),
  rest.post('/api/process', (req, res, ctx) => {
    return res(ctx.json({ status: 'processing' }))
  }),
]
```

#### Acceptance Criteria

**Checklist**:
- [ ] MSW installed and configured
- [ ] Mock handlers for all APIs
- [ ] Integration with Playwright
- [ ] Predictable test data
- [ ] Error scenarios mockable

#### Validation Commands
```bash
npm test tests/e2e/mocks/
npx playwright test --grep @mock
```

---

### Task T-015: Achieve 70% Coverage Target

**Task Name**: Final Coverage Push and Validation  
**Priority**: High  
**Estimated Hours**: 6 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Coverage Goals  
**Purpose**: Reach 70% test coverage on critical paths  

#### Dependencies
- **Prerequisites**: All Phase 1-3 tasks complete
- **Deliverable**: Final coverage report and documentation

#### Implementation Details

**Actions Required**:
1. Run full test suite with coverage
2. Identify remaining gaps
3. Write additional tests as needed
4. Configure CI/CD thresholds
5. Document coverage metrics

#### Acceptance Criteria

**Checklist**:
- [ ] 70% line coverage achieved
- [ ] 70% statement coverage achieved
- [ ] Critical paths covered
- [ ] CI/CD configured
- [ ] Reports documented

#### Validation Commands
```bash
# Full validation suite
npm run test:all
npm test -- --coverage --coverageThreshold='{"global":{"lines":70,"statements":70}}'
cd worker && npm test -- --coverage
npx playwright test
```

---

### Task T-016: Finalize Documentation and Training

**Task Name**: Complete Testing Documentation Package  
**Priority**: Medium  
**Estimated Hours**: 4 hours  

#### Context & Background
**Source PRP**: `docs/prps/testing-strategy-overhaul.md` - Documentation  
**Purpose**: Ensure sustainable testing practices with clear documentation  

#### Dependencies
- **Prerequisites**: All testing tasks complete
- **Deliverable**: Complete testing guide

#### Implementation Details

**Documentation to Complete**:
```
├── docs/testing/README.md - [Complete overview]
├── docs/testing/QUICK_START.md - [Developer onboarding]
├── docs/testing/PATTERNS.md - [Best practices]
├── docs/testing/TROUBLESHOOTING.md - [Common issues]
└── docs/testing/CI_CD.md - [Pipeline configuration]
```

**Training Materials**:
- Video walkthrough of test suite
- Example test patterns
- Debugging guide
- Coverage analysis guide

#### Acceptance Criteria

**Checklist**:
- [ ] All documentation complete
- [ ] Quick start guide tested
- [ ] Patterns documented
- [ ] CI/CD setup documented
- [ ] Team training completed

#### Validation Commands
```bash
ls -la docs/testing/
grep -r "TODO" docs/testing/ # Should return nothing
```

---

## Cross-Cutting Concerns

### Task T-017: CI/CD Pipeline Integration

**Task Name**: Configure GitHub Actions for Test Automation  
**Priority**: High  
**Estimated Hours**: 4 hours  
**Can Start**: After T-010 (Phase 2)  

#### Implementation Details

**Files to Create**:
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- --coverage
      - run: cd worker && npm test
      - run: npx playwright install
      - run: npx playwright test
```

---

### Task T-018: Performance Benchmarking

**Task Name**: Establish Test Performance Baselines  
**Priority**: Low  
**Estimated Hours**: 3 hours  
**Can Start**: After T-015 (all tests complete)  

#### Acceptance Criteria
- Unit tests complete in <5 minutes
- E2E tests complete in <10 minutes
- No flaky tests in 10 runs

---

## Implementation Schedule

### Week 1 (Jan 29 - Feb 2)
- **Monday-Tuesday**: T-001 (Jest ESM) - 6 hrs
- **Tuesday-Wednesday**: T-002 (Factories) - 8 hrs
- **Wednesday**: T-003 (Documentation) - 4 hrs
- **Thursday**: T-004 (Processor Tests) - 8 hrs
- **Friday**: T-005 (ECS Tests) - 8 hrs

### Week 2 (Feb 3 - Feb 9)
- **Monday-Tuesday**: T-006 (Input Formats) - 8 hrs
- **Tuesday-Wednesday**: T-007 (Engines) - 8 hrs
- **Thursday**: T-008 (Weights) - 6 hrs
- **Thursday-Friday**: T-009 (Database) - 6 hrs
- **Friday**: T-010 (Coverage Check) - 4 hrs

### Week 3 (Feb 10 - Feb 16)
- **Monday**: T-011 (Playwright Setup) - 6 hrs
- **Tuesday**: T-012 (Page Objects) - 6 hrs
- **Wednesday-Thursday**: T-013 (User Journeys) - 8 hrs
- **Thursday**: T-014 (MSW Setup) - 6 hrs
- **Friday AM**: T-015 (Final Coverage) - 6 hrs
- **Friday PM**: T-016 (Documentation) - 4 hrs

### Ongoing/Parallel
- T-017 (CI/CD) - Can start Week 2
- T-018 (Performance) - End of Week 3

---

## Resource Requirements

### Team Allocation
- **Lead Developer**: T-001, T-005, T-007, T-011, T-013
- **Senior Developer**: T-002, T-004, T-006, T-012
- **Developer**: T-003, T-008, T-009, T-014, T-016
- **DevOps**: T-017, T-018
- **QA Review**: T-010, T-015

### Skills Needed
- Jest/TypeScript expertise (T-001, T-002)
- ECS architecture knowledge (T-005)
- Playwright experience (T-011, T-012, T-013)
- MSW familiarity (T-014)
- CI/CD configuration (T-017)

---

## Risk Mitigation

### High-Risk Tasks
1. **T-001 (Jest ESM)**: Critical blocker - allocate best resource
2. **T-005 (ECS Tests)**: Complex architecture - pair programming recommended
3. **T-013 (User Journeys)**: Integration complexity - allow buffer time

### Contingency Plans
- If T-001 blocked > 2 days: Consider Vitest migration
- If E2E too complex: Focus on 1 critical journey
- If time constrained: Defer T-014, T-018

---

## Success Metrics

### Quantitative
- All 18 tasks completed
- 70% test coverage achieved
- <5 min unit test execution
- <10 min E2E execution
- 0 flaky tests

### Qualitative
- Team confidence increased
- Clear documentation available
- Sustainable practices established
- Knowledge transfer complete

---

**Document Version**: 1.0  
**Generated**: January 29, 2025  
**Source PRP**: `/docs/prps/testing-strategy-overhaul.md`  
**Total Estimated Effort**: 120 hours