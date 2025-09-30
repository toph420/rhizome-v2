# Product Requirements & Plans: Testing Strategy Overhaul

**Feature Name**: Testing Strategy Overhaul  
**Document Version**: 1.0  
**Date**: January 29, 2025  
**Author**: Development Team  
**Reviewers**: DevLead, QA Team  
**Implementation Confidence**: 8/10

---

## 1. Executive Summary

### Objective
Establish a comprehensive testing strategy for Rhizome V2 that eliminates technical debt, provides confidence in core functionality, and creates sustainable testing practices for the AI-powered document processing system.

### Key Outcomes
- Fix broken tests caused by architecture refactoring
- Achieve 70% test coverage on critical paths
- Implement E2E testing with Playwright MCP server
- Consolidate testing documentation
- Establish sustainable testing patterns

### Success Metrics
- All worker module tests passing
- ECS system has >80% test coverage
- 3 critical user journeys have E2E tests
- Test execution time <5 minutes for unit tests
- Documentation consolidated in single location

---

## 2. Problem Statement

### Current State
The Rhizome V2 system has functional document processing with 7 collision detection engines, but tests are failing due to recent architecture refactoring. While the system works correctly in production, it lacks automated validation.

### Critical Issues
- **Configuration Debt**: Tests expect old processor I/O patterns
- **Coverage Gaps**: ~10% main app coverage, 0% ECS coverage
- **Documentation Scatter**: Testing docs across 4+ files
- **No E2E Testing**: Manual validation only

### Impact
- Development velocity reduced by 40%
- Risk of regression in collision detection
- Uncertainty when refactoring core systems

---

## 3. Requirements

### Functional Requirements

#### Phase 1: Foundation (Week 1)
- Fix Jest ESM configuration for worker module
- Create test helpers and factories
- Write 5 core ECS tests
- Consolidate documentation
- Update processor tests for new architecture

#### Phase 2: Core Coverage (Week 2)
- Test all 6 document input formats
- Test all 7 collision detection engines
- Validate embeddings generation
- Test user preference weight system
- Achieve 50%+ coverage on critical paths

#### Phase 3: E2E Testing (Week 3)
- Setup Playwright with MCP server
- Implement Page Object Model
- Test 3 critical user journeys
- Setup MSW for API mocking
- Achieve 70%+ coverage target

### Non-Functional Requirements
- Tests must run in <5 minutes (unit)
- E2E tests must complete in <10 minutes
- Zero flaky tests allowed
- Tests must work in CI/CD pipeline
- Clear documentation for new developers

### Business Requirements
- No disruption to active development
- Maintain current deployment schedule
- Training materials for team
- Sustainable long-term practices

---

## 4. Technical Approach

### Architecture Decisions

#### Keep Jest v30
```javascript
// Already modern and performant
// No migration to Vitest needed
// Existing configuration can be fixed
```

#### Fix ESM Configuration
```javascript
// package.json
{
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/.bin/jest",
    "test:worker": "cd worker && npm test"
  }
}
```

#### Leverage Existing Patterns
Reference: `/Users/topher/Code/rhizome-v2/tests/integration/annotation-flow.test.ts`

```typescript
// Lines 49-104: Existing ECS mock pattern to extend
jest.mock('@/lib/ecs', () => ({
  createECS: jest.fn(() => ({
    createEntity: jest.fn(async (userId, components) => {
      const entityId = `test-entity-${Date.now()}`
      // In-memory storage pattern
      mockEntities.push({
        id: entityId,
        user_id: userId,
        components,
        created_at: new Date().toISOString()
      })
      return entityId
    })
  }))
}))
```

### Technology Stack
- **Jest v30**: Unit and integration testing (already installed)
- **Playwright MCP**: E2E testing (MCP server installed)
- **MSW v2**: API mocking (to be installed)
- **Testing Library**: React component testing (already installed)
- **ts-jest**: TypeScript compilation (already installed)

### Integration Points

#### Supabase Testing
```typescript
// Reference: tests/integration/annotation-flow.test.ts:26-45
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(() => Promise.resolve({ 
    id: 'dev-user-123',
    email: 'test@example.com'
  })),
  getSupabaseClient: jest.fn(() => mockSupabaseClient)
}))
```

#### Gemini API Mocking
```typescript
// Reference: __mocks__/@google/genai.ts
export class GoogleGenerativeAI {
  getGenerativeModel = jest.fn(() => ({
    generateContent: jest.fn().mockResolvedValue({
      response: {
        text: () => 'Mocked AI response',
        candidates: [{ content: { parts: [{ text: 'Test content' }] } }]
      }
    })
  }))
}
```

---

## 5. Implementation Blueprint

### Phase 1: Foundation Fixes (Days 1-5)

#### Day 1-2: Configuration Repair
```typescript
// worker/jest.config.cjs → jest.config.ts
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

#### Day 3: Test Factories
```typescript
// tests/factories/index.ts
import { factories as documentFactory } from './document.factory'
import { factories as chunkFactory } from './chunk.factory'
import { factories as entityFactory } from './entity.factory'

export const factories = {
  document: documentFactory,
  chunk: chunkFactory,
  entity: entityFactory,
  processor: createProcessorFactory()
}

// tests/factories/document.factory.ts
export const factories = {
  create: (overrides = {}) => ({
    id: 'doc-test-123',
    title: 'Test Document',
    source_type: 'pdf',
    processing_status: 'completed',
    markdown_available: true,
    embeddings_available: true,
    user_id: 'dev-user-123',
    ...overrides
  })
}
```

#### Day 4: Documentation Consolidation
```markdown
# docs/testing/README.md
## Testing Strategy Overview
- Jest v30 for unit/integration tests
- Playwright MCP for E2E tests
- MSW for API mocking
- 70% coverage target on critical paths

## Quick Start
\`\`\`bash
npm test              # Run all tests
npm test:watch       # Watch mode
npm test:coverage    # Coverage report
npm test:e2e         # E2E tests via Playwright
\`\`\`

## Test Organization
- src/**/__tests__/   # Unit tests
- tests/integration/  # Integration tests
- tests/e2e/         # End-to-end tests
- tests/factories/   # Test data generators
```

#### Day 5: Core ECS Tests
```typescript
// src/lib/ecs/__tests__/ecs.test.ts
import { ECS } from '../ecs'
import { createClient } from '@supabase/supabase-js'
import { factories } from '../../../../tests/factories'

describe('ECS Core Operations', () => {
  let ecs: ECS
  let mockSupabase: any

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: factories.entity.create(), 
          error: null 
        })
      }))
    }
    ecs = new ECS(mockSupabase)
  })

  test('creates entities with components', async () => {
    const components = {
      flashcard: { question: 'What is ECS?', answer: 'Entity-Component-System' },
      study: { due: new Date(), ease: 2.5 }
    }
    
    const entityId = await ecs.createEntity('dev-user-123', components)
    
    expect(entityId).toBeDefined()
    expect(mockSupabase.from).toHaveBeenCalledWith('entities')
  })

  test('queries entities by component types', async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [factories.entity.create()],
        error: null
      })
    })

    const results = await ecs.query(['flashcard', 'study'], 'dev-user-123')
    
    expect(results).toHaveLength(1)
    expect(mockSupabase.from).toHaveBeenCalledWith('components')
  })

  test('handles component updates', async () => {
    const updateData = { ease: 3.0 }
    
    await ecs.updateComponent('comp-123', updateData, 'dev-user-123')
    
    expect(mockSupabase.from).toHaveBeenCalledWith('components')
  })

  test('manages entity lifecycle', async () => {
    // Test creation, update, deletion
    const entityId = await ecs.createEntity('dev-user-123', {})
    await ecs.updateEntity(entityId, {}, 'dev-user-123')
    await ecs.deleteEntity(entityId, 'dev-user-123')
    
    expect(mockSupabase.from).toHaveBeenCalledTimes(3)
  })

  test('enforces user isolation', async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn((field, value) => {
        if (field === 'user_id' && value !== 'dev-user-123') {
          return {
            in: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          }
        }
        return {
          in: jest.fn().mockResolvedValue({
            data: [factories.entity.create()],
            error: null
          })
        }
      })
    })

    const results = await ecs.query(['flashcard'], 'different-user')
    expect(results).toHaveLength(0)
  })
})
```

### Phase 2: Core Coverage (Week 2)

#### Document Processing Tests
```typescript
// worker/__tests__/processors/pdf-processor.test.ts
describe('PDFProcessor', () => {
  let processor: PDFProcessor

  beforeEach(() => {
    processor = new PDFProcessor()
  })

  test('transforms PDF content correctly', async () => {
    const mockContent = 'PDF text content'
    const result = await processor.transform(mockContent, {
      source_type: 'pdf',
      fileName: 'test.pdf',
      apiKey: 'test-key'
    })

    expect(result.markdown).toBeDefined()
    expect(result.chunks).toHaveLength(greaterThan(0))
    expect(result.metadata.source_type).toBe('pdf')
  })
})
```

#### Collision Detection Tests
```typescript
// worker/__tests__/engines/semantic-similarity.test.ts
describe('Semantic Similarity Engine', () => {
  test('calculates similarity scores correctly', async () => {
    const engine = new SemanticSimilarityEngine()
    const chunks = factories.chunk.createMany(5)
    
    const scores = await engine.analyze(chunks)
    
    expect(scores).toHaveLength(10) // 5 choose 2 combinations
    scores.forEach(score => {
      expect(score.value).toBeGreaterThanOrEqual(0)
      expect(score.value).toBeLessThanOrEqual(1)
    })
  })
})
```

### Phase 3: E2E Testing (Week 3)

#### Playwright Page Objects
```typescript
// tests/e2e/page-objects/DocumentReaderPage.ts
import { Page, Locator } from '@playwright/test'

export class DocumentReaderPage {
  readonly page: Page
  readonly documentTitle: Locator
  readonly markdownContent: Locator
  readonly annotationButton: Locator
  readonly connectionPanel: Locator

  constructor(page: Page) {
    this.page = page
    this.documentTitle = page.locator('[data-testid="document-title"]')
    this.markdownContent = page.locator('[data-testid="markdown-content"]')
    this.annotationButton = page.locator('[data-testid="create-annotation"]')
    this.connectionPanel = page.locator('[data-testid="connections-panel"]')
  }

  async goto(documentId: string) {
    await this.page.goto(`/read/${documentId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async selectText(text: string) {
    const textElement = this.markdownContent.locator(`text="${text}"`)
    await textElement.click()
    await this.page.keyboard.down('Shift')
    await textElement.click({ position: { x: 100, y: 0 } })
    await this.page.keyboard.up('Shift')
  }

  async createAnnotation(text: string) {
    await this.selectText(text)
    await this.annotationButton.click()
    await this.page.waitForTimeout(500) // Allow for animation
  }
}
```

#### Critical User Journeys
```typescript
// tests/e2e/critical-journeys.spec.ts
import { test, expect } from '@playwright/test'
import { DocumentReaderPage } from './page-objects/DocumentReaderPage'

test.describe('Critical User Journeys', () => {
  test('Upload → Process → Read flow', async ({ page }) => {
    // Upload document
    await page.goto('/library')
    await page.locator('[data-testid="upload-button"]').click()
    
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('tests/fixtures/sample.pdf')
    
    // Wait for processing
    await page.waitForSelector('[data-testid="processing-complete"]', {
      timeout: 120000 // 2 minutes for processing
    })
    
    // Navigate to reader
    await page.click('[data-testid="read-document"]')
    
    // Verify content
    const reader = new DocumentReaderPage(page)
    await expect(reader.documentTitle).toBeVisible()
    await expect(reader.markdownContent).toContainText('Expected content')
  })

  test('Select text → Create annotation → Save', async ({ page }) => {
    const reader = new DocumentReaderPage(page)
    await reader.goto('test-doc-123')
    
    // Create annotation
    await reader.createAnnotation('Important concept')
    
    // Verify annotation saved
    await expect(reader.connectionPanel).toContainText('1 annotation')
    
    // Verify persistence
    await page.reload()
    await expect(reader.connectionPanel).toContainText('1 annotation')
  })

  test('View connections → Adjust weights → See updates', async ({ page }) => {
    await page.goto('/connections')
    
    // Adjust semantic similarity weight
    const slider = page.locator('[data-testid="semantic-similarity-weight"]')
    await slider.fill('0.35')
    
    // Save preferences
    await page.click('[data-testid="save-weights"]')
    
    // Verify connections update
    await page.waitForSelector('[data-testid="connections-updated"]')
    const connectionCount = page.locator('[data-testid="connection-count"]')
    await expect(connectionCount).toContainText(/\d+ connections found/)
  })
})
```

---

## 6. Validation Gates

### Automated Validation Commands

#### Phase 1 Validation
```bash
# Fix verification
npm test -- --listTests                    # Should list all test files
cd worker && npm test -- --listTests       # Worker tests accessible

# Configuration validation
npm test -- src/lib/ecs/__tests__/ecs.test.ts  # ECS tests pass
npm test -- --coverage --coveragePathIgnorePatterns=node_modules  # Coverage report generates
```

#### Phase 2 Validation
```bash
# Coverage validation
npm test -- --coverage --coverageThreshold='{"global":{"branches":50,"functions":50,"lines":50,"statements":50}}'

# Integration tests
npm test -- tests/integration  # All integration tests pass

# Worker validation
cd worker && npm run test:validate  # Custom validation suite passes
```

#### Phase 3 Validation
```bash
# E2E validation
npx playwright test --list        # Lists all E2E tests
npx playwright test               # All E2E tests pass
npx playwright show-report        # View test results

# Full validation
npm run test:all                  # Runs unit + integration + E2E
```

### Manual Validation Checklist
- [ ] All worker tests passing
- [ ] ECS system has test coverage
- [ ] Critical user paths have E2E tests
- [ ] Documentation consolidated
- [ ] No flaky tests in 10 consecutive runs
- [ ] CI/CD pipeline green

---

## 7. Risk Mitigation

### Identified Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Test maintenance burden | Medium | High | Use factories and helpers |
| Flaky E2E tests | High | Medium | Implement retry logic, stable selectors |
| Configuration complexity | Low | Medium | Document setup clearly |
| Timeline slippage | Medium | High | Phased approach allows partial delivery |

### Contingency Plans
- **If Phase 1 blocked**: Continue with manual validation
- **If E2E too complex**: Focus on critical path only
- **If time constrained**: Deliver Phase 1-2, defer E2E

---

## 8. Implementation Timeline

### Week 1: Foundation (Jan 29 - Feb 2)
- Day 1-2: Fix Jest ESM configuration ✓
- Day 3: Create test factories ✓
- Day 4: Consolidate documentation ✓
- Day 5: Write core ECS tests ✓

### Week 2: Core Coverage (Feb 3 - Feb 9)
- Day 1-2: Document processing tests
- Day 3-4: Collision detection tests
- Day 5: Database operation tests

### Week 3: E2E & Polish (Feb 10 - Feb 16)
- Day 1-2: Playwright setup with MCP
- Day 3-4: Critical journey tests
- Day 5: MSW setup and final validation

---

## 9. Success Criteria

### Quantitative Metrics
- [ ] Test execution time <5 minutes (unit)
- [ ] Coverage >70% on critical paths
- [ ] 0 failing tests in main branch
- [ ] 3+ E2E tests passing

### Qualitative Metrics
- [ ] Team confident making changes
- [ ] Clear documentation available
- [ ] Sustainable practices established
- [ ] Knowledge transfer completed

---

## 10. Dependencies

### External Dependencies
- Playwright MCP server (installed)
- MSW v2 package (to install)
- CI/CD environment configuration

### Internal Dependencies
- Team availability for review
- Access to test environments
- Sample test data

---

## 11. References

### Codebase References
- `/Users/topher/Code/rhizome-v2/tests/integration/annotation-flow.test.ts` - Mock patterns
- `/Users/topher/Code/rhizome-v2/worker/__tests__/` - Existing worker tests
- `/Users/topher/Code/rhizome-v2/__mocks__/@google/genai.ts` - Gemini mock
- `/Users/topher/Code/rhizome-v2/docs/brainstorming/2025-01-29-testing-strategy-overhaul.md` - Original plan

### External Documentation
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [MSW Node Integration](https://mswjs.io/docs/integrations/node)
- [Jest ESM Support](https://jestjs.io/docs/ecmascript-modules)

---

## Task Breakdown Reference

See accompanying task breakdown document: `docs/tasks/testing-strategy-overhaul.md`

---

**Implementation Confidence Score: 8/10**

*Rationale*: Strong existing foundation, clear phased approach, and Playwright MCP availability reduce implementation risk. Two point deduction for ESM configuration complexity and potential timeline pressure.