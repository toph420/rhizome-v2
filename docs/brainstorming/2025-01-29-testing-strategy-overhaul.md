# Brainstorming Session: Testing Strategy Overhaul

**Date:** January 29, 2025  
**Facilitator:** Claude Code  
**Project:** Rhizome V2  
**Session Type:** Technical Planning  
**Duration:** Comprehensive Analysis  
**Participants:** Development Team

---

## 1. Executive Summary

### Session Objective
Establish a comprehensive testing strategy for Rhizome V2 that eliminates technical debt, provides confidence in core functionality, and creates sustainable testing practices for a greenfield AI-powered document processing system.

### Key Outcomes
- Identified critical testing gaps in ECS, document processing, and collision detection
- Developed phased approach to achieve 70% coverage on critical paths
- Created documentation consolidation strategy
- Established testing patterns to prevent future debt accumulation

### Critical Decisions Made
1. **Keep Jest v30** - No migration to Vitest needed (Jest v30 is already modern and performant)
2. **Pragmatic coverage target** - 70% on critical paths vs 100% everywhere
3. **Consolidate documentation** - Single source of truth in `docs/testing/`
4. **Test-first for new features** - Prevent debt accumulation

---

## 2. Problem Statement

### Current Situation
Rhizome V2 has a functional document processing system with 7 collision detection engines, but tests are failing due to architecture refactoring. The system works correctly in production but lacks automated validation, creating risk for future development.

### Pain Points Identified
- **Configuration Debt**: Tests expect old I/O patterns (processors handling file operations)
- **Coverage Gaps**: ~10% main app coverage, 0% ECS coverage, no E2E tests
- **Documentation Scatter**: Testing docs spread across 4+ files with conflicting information
- **Knowledge Gap**: Team unfamiliar with testing best practices
- **Manual Validation**: Relying on manual testing checklist instead of automation

### Impact Analysis
- **Development Velocity**: Slower feature development due to manual validation
- **Regression Risk**: Changes could break collision detection or document processing
- **Confidence**: Uncertainty when refactoring core systems
- **Onboarding**: New developers lack clear testing guidelines

---

## 3. Proposed Solutions

### Solution A: Quick Stabilization (1 week)
**Focus**: Fix immediate breaks, establish foundation

**Implementation**:
1. Update worker tests to match new architecture (2 days)
2. Create test helpers and factories (1 day)
3. Write 5 critical ECS tests (1 day)
4. Consolidate documentation (1 day)

**Pros**: Fast, unblocks development, low risk
**Cons**: Minimal coverage increase, doesn't address E2E gap

### Solution B: Comprehensive Overhaul (4 weeks)
**Focus**: Full test coverage and infrastructure

**Implementation**:
1. Complete test migration for all components
2. Achieve 80%+ coverage across codebase
3. Full E2E suite with Playwright
4. Performance benchmarking suite
5. Visual regression testing

**Pros**: Thorough coverage, future-proof
**Cons**: High time investment, blocks feature development

### Solution C: Strategic Enhancement (Recommended) (2-3 weeks)
**Focus**: Pragmatic coverage of critical paths

**Implementation**:
1. Week 1: Fix configuration, establish patterns, document consolidation
2. Week 2: Core functionality tests (ECS, processors, engines)
3. Week 3: E2E for critical user journeys, MSW for better mocking

**Pros**: Balanced approach, maintains velocity, addresses critical risks
**Cons**: Some areas remain untested

---

## 4. Implementation Plan

### Phase 1: Foundation & Documentation (Week 1)

#### Day 1-2: Configuration Fixes
- Update Jest configuration for ESM support
- Fix TypeScript import issues
- Create `worker/tests/helpers/` directory with test utilities

#### Day 3: Test Helpers & Factories
```typescript
// tests/factories/index.ts
export const factories = {
  document: createDocumentFactory(),
  chunk: createChunkFactory(),
  entity: createEntityFactory(),
  processor: createProcessorFactory()
}
```

#### Day 4: Documentation Consolidation
- Create unified `docs/testing/README.md` as single source of truth
- Archive old testing documents
- Create `docs/testing/patterns.md` for test examples
- Update `CLAUDE.md` with testing section

#### Day 5: Critical ECS Tests
```typescript
// src/lib/ecs/__tests__/ecs.test.ts
describe('ECS Core Operations', () => {
  test('creates entities with components')
  test('queries entities by component types')
  test('handles component updates')
  test('manages entity lifecycle')
  test('enforces user isolation')
})
```

### Phase 2: Core Coverage (Week 2)

#### Document Processing Pipeline
- Test all 6 input formats (PDF, YouTube, Web, Markdown, Text, Paste)
- Verify Gemini API integration
- Test error recovery mechanisms
- Validate chunk generation

#### Collision Detection System
- Test all 7 engines independently
- Verify orchestrator coordination
- Test weight configuration system
- Validate score normalization

#### Database Operations
- Test availability flags (`markdown_available`, `embeddings_available`)
- Verify storage patterns (files vs database)
- Test embedding generation and storage

### Phase 3: E2E & Advanced Testing (Week 3)

#### Playwright Setup
```bash
npm init playwright@latest
# Create tests/e2e/ directory
```

#### Critical User Journeys
1. Upload document → Process → Read flow
2. Select text → Create annotation → Save
3. View connections → Adjust weights → See updates

#### MSW for API Mocking
```typescript
// tests/mocks/handlers.ts
export const handlers = [
  http.post('*/gemini/process', mockGeminiResponse),
  http.post('*/supabase/embeddings', mockEmbeddingResponse)
]
```

---

## 5. Technical Specifications

### Testing Architecture

```
rhizome-v2/
├── docs/testing/                 # Consolidated documentation
│   ├── README.md                # Main testing guide
│   ├── patterns.md              # Code examples
│   ├── coverage-report.md       # Current coverage metrics
│   └── troubleshooting.md       # Common issues
├── tests/                       # Shared test infrastructure
│   ├── factories/               # Test data generators
│   ├── fixtures/                # Static test data
│   ├── mocks/                   # MSW handlers
│   └── e2e/                     # Playwright tests
├── src/
│   ├── lib/ecs/__tests__/      # ECS unit tests
│   └── app/actions/__tests__/   # Server action tests
└── worker/
    └── tests/
        ├── unit/                # Pure function tests
        ├── integration/         # Multi-component tests
        └── helpers/             # Worker-specific utilities
```

### Testing Standards

**Naming Conventions**:
- Test files: `*.test.ts` or `*.spec.ts`
- Test descriptions: Behavior-focused, not implementation
- Test data: Prefix with `mock` or `test`

**Coverage Targets**:
- Critical paths: 70% minimum
- Utility functions: 90% minimum
- UI Components: 50% minimum
- Experimental features: No requirement

**Test Categories**:
1. **Unit Tests**: Pure functions, isolated components
2. **Integration Tests**: Multiple components, database operations
3. **E2E Tests**: Full user workflows
4. **Performance Tests**: Response times, throughput
5. **Smoke Tests**: Basic functionality validation

---

## 6. Resource Requirements

### Human Resources
- **Developer Time**: 80-120 hours over 3 weeks
- **Review Time**: 8-12 hours for documentation review
- **Training Time**: 4-6 hours for testing best practices

### Technical Resources
- **CI/CD Pipeline**: GitHub Actions configuration needed
- **Testing Infrastructure**: Playwright browsers, test database
- **Monitoring**: Coverage reporting tools

### Tool Requirements
- Jest v30 (already installed)
- Playwright (needs installation)
- MSW (needs installation)
- Coverage reporters (istanbul, already in Jest)

---

## 7. Risk Analysis

### Identified Risks

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|-------------------|
| Test maintenance burden | Medium | High | Use factories and helpers to reduce duplication |
| Flaky E2E tests | High | Medium | Implement retry logic, use stable selectors |
| Configuration complexity | Low | Medium | Document setup clearly, use presets |
| Performance impact | Low | Low | Run tests in parallel, use test filtering |
| Knowledge gaps | Medium | Medium | Create comprehensive examples and patterns |

### Contingency Plans
- **If tests remain broken**: Continue with manual validation checklist
- **If E2E too complex**: Start with critical path only
- **If time constrained**: Implement Phase 1 only, defer rest

---

## 8. Next Steps & Action Items

### Immediate Actions (This Week)
- [ ] **@DevLead**: Review and approve this plan
- [ ] **@Developer**: Start Phase 1 configuration fixes
- [ ] **@Developer**: Create test factory structure
- [ ] **@DevOps**: Prepare CI environment for testing

### Week 1 Deliverables
- [ ] Fixed Jest configuration for worker module
- [ ] Consolidated testing documentation in `docs/testing/`
- [ ] Test helpers and factories implemented
- [ ] 5 core ECS tests passing
- [ ] Updated `CLAUDE.md` with testing guidelines

### Week 2 Deliverables
- [ ] Document processing tests (all 6 formats)
- [ ] Collision detection tests (all 7 engines)
- [ ] Database operation tests
- [ ] Coverage report showing >50% on critical paths

### Week 3 Deliverables
- [ ] Playwright installed and configured
- [ ] 3 E2E tests for critical user journeys
- [ ] MSW mocking infrastructure
- [ ] Final coverage >70% on critical paths

### Documentation Updates Required
1. Create `docs/testing/README.md` - Main testing guide
2. Create `docs/testing/patterns.md` - Test examples and patterns
3. Update `CLAUDE.md` - Add testing section
4. Archive old test documents to `docs/testing/archive/`
5. Create `docs/testing/coverage-report.md` - Track coverage metrics

### Success Criteria
- [ ] All worker tests passing
- [ ] ECS system has test coverage
- [ ] Critical user paths have E2E tests
- [ ] Documentation consolidated and clear
- [ ] Team can confidently make changes without breaking core functionality

---

## Appendix A: Test Pattern Examples

### Unit Test Pattern
```typescript
describe('PDFProcessor', () => {
  let processor: PDFProcessor;
  
  beforeEach(() => {
    processor = new PDFProcessor();
  });
  
  describe('transform', () => {
    it('extracts text from PDF buffer', async () => {
      const pdfBuffer = factories.pdf.create();
      const result = await processor.transform(pdfBuffer, {
        source_type: 'pdf',
        fileName: 'test.pdf'
      });
      
      expect(result.markdown).toBeDefined();
      expect(result.chunks).toHaveLength(greaterThan(0));
    });
  });
});
```

### Integration Test Pattern
```typescript
describe('Document Processing Pipeline', () => {
  it('processes document end-to-end', async () => {
    const document = factories.document.create();
    
    // Upload
    const uploadResult = await uploadDocument(document);
    expect(uploadResult.success).toBe(true);
    
    // Process
    await waitForProcessing(uploadResult.documentId);
    
    // Verify
    const processed = await getDocument(uploadResult.documentId);
    expect(processed.markdown_available).toBe(true);
    expect(processed.embeddings_available).toBe(true);
  });
});
```

### E2E Test Pattern
```typescript
test('user can upload and read document', async ({ page }) => {
  // Navigate to upload
  await page.goto('/upload');
  
  // Upload file
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles('tests/fixtures/sample.pdf');
  
  // Wait for processing
  await page.waitForSelector('[data-testid="processing-complete"]');
  
  // Navigate to reader
  await page.click('[data-testid="read-document"]');
  
  // Verify content
  await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible();
  await expect(page).toHaveURL(/\/read\/.+/);
});
```

---

## Appendix B: Coverage Metrics Tracking

### Current Baseline (January 2025)
- Main Application: ~10%
- Worker Module: ~30% (broken tests)
- ECS System: 0%
- E2E Coverage: 0%

### Target Metrics (End of Phase 3)
- Main Application: 50%
- Worker Module: 70%
- ECS System: 80%
- E2E Coverage: Critical paths only

### Measurement Method
```bash
# Generate coverage report
npm run test:coverage

# View in browser
npm run test:coverage:open

# CI reporting
npm run test:ci -- --coverage
```

---

*End of Brainstorming Session Document*