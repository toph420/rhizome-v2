# Testing Guide - Rhizome V2

> **Primary Testing Documentation**  
> Last Updated: January 30, 2025  
> Status: Active - Development-Friendly Strategy

## Quick Start

```bash
# Install dependencies
npm install && cd worker && npm install && cd ..

# Start local development environment
npm run dev

# Run tests by category
npm run test:critical     # Must pass tests (E2E + core integration)
npm run test:stable       # Important tests (can fail during development)  
npm run test:flexible     # Unit tests (skip during rapid development)

# Run all tests
npm test                  # Main app tests
cd worker && npm test     # Worker module tests

# Run E2E tests
npm run test:e2e
```

## Testing Strategy Overview

Rhizome V2 uses a **development-friendly testing strategy** that categorizes tests by maintenance priority, allowing rapid iteration while maintaining quality protection.

### 🔴 Critical Tests (Must Pass)
- **E2E user journeys** - Core workflows that define product value
- **Integration smoke tests** - System connectivity and data flow
- **Core business logic** - Document processing, collision detection

```bash
npm run test:critical      # Blocks deployment if failing
```

### 🟡 Stable Tests (Fix When Broken)
- **API contract tests** - Server Actions, database operations
- **System integration** - Auth, file uploads, background jobs
- **Data layer tests** - CRUD operations, ECS functionality

```bash
npm run test:stable        # Tracked but doesn't block deployment
```

### 🟢 Flexible Tests (Clean Up During Stabilization)
- **Component tests** - React component behavior
- **Utility functions** - Helpers, formatters, validation
- **Implementation details** - Internal method testing

```bash
npm run test:flexible      # Can fail during development
```

### 🔵 Experimental Tests (New Features Only)
- **Feature spikes** - Proof of concept validation
- **Research tests** - Architecture exploration
- **Prototype validation** - Temporary integration tests

```bash
npm run test:experimental  # Manual execution only
```

## Project Structure

```
rhizome-v2/
├── tests/                    # Main app tests
│   ├── critical/            # Must-pass tests
│   ├── stable/              # Fix-when-broken tests  
│   ├── flexible/            # Clean-up-later tests
│   ├── experimental/        # New feature tests
│   ├── factories/           # Test data generators
│   ├── fixtures/            # Static test data
│   ├── mocks/               # API mocks and handlers
│   └── e2e/                 # Playwright E2E tests
├── src/lib/ecs/__tests__/   # ECS unit tests
└── worker/tests/            # Worker module tests
    ├── integration/         # Multi-component tests
    ├── engines/             # Collision detection tests
    ├── utils/               # Worker utilities
    └── fixtures/            # Worker test data
```

## Development Workflows

### Rapid Development Phase (Current)
**Focus**: Speed and user value delivery

```bash
# Daily workflow
npm run test:critical && npm run test:e2e  # Must pass
npm run test:stable || echo "Tracked but not blocking"

# Skip during rapid iteration
# npm run test:flexible  # Fix during stabilization
```

**Quality Gates**:
- ✅ Critical tests must pass (blocks deploy)
- ✅ E2E tests must pass (blocks deploy)
- ⚠️ Unit test coverage advisory only (doesn't block)

### Stabilization Phase
**Focus**: Technical debt cleanup and test maintenance

```bash
# Stabilization workflow  
npm run test:critical       # Must pass
npm run test:stable         # Fix all failures
npm run test:flexible       # Clean up test debt
npm run test:experimental   # Archive or promote
```

### New Feature Development Pattern

```typescript
// 1. Start with E2E test for user journey
test('User can upload and process document', async () => {
  // Test complete user workflow
});

// 2. Create integration smoke test
test('Document processing pipeline works', async () => {
  // Test core system integration
});

// 3. Skip detailed unit tests during prototyping
// Focus on making the feature work

// 4. Add unit tests when feature stabilizes
// Move from experimental/ to appropriate category

// 5. Clean up test debt in stabilization sprints
```

## Core Testing Patterns

### Using Test Factories

```typescript
import { factories } from '@/tests/factories'

// Create test data
const doc = factories.document.create()
const processedDoc = factories.document.createProcessed()
const chunks = factories.chunk.createMany(10, 'doc-id')

// Create ECS entities
const flashcard = factories.entity.createFlashcard({
  question: 'What is ECS?',
  answer: 'Entity-Component-System'
})

// Reset between tests
beforeEach(() => {
  factories.document.reset()
  factories.chunk.reset()
})
```

### Testing Async Operations

```typescript
it('handles document processing workflow', async () => {
  const doc = factories.document.create()
  
  // Start processing
  const promise = processDocument(doc)
  
  // Assert loading state
  expect(doc.processing_status).toBe('processing')
  
  // Wait for completion
  const result = await promise
  
  // Assert final state
  expect(result.status).toBe('completed')
  expect(result.chunks.length).toBeGreaterThan(0)
})
```

### Testing Error Cases

```typescript
it('handles processing failures gracefully', async () => {
  const doc = factories.document.create()
  mockGeminiError('Rate limit exceeded')

  await expect(processDocument(doc)).rejects.toThrow()
  expect(doc.processing_status).toBe('failed')
  expect(doc.error_message).toContain('Rate limit')
})
```

### Mocking External Services

```typescript
// Supabase mocking
import { createMockSupabaseClient } from '@/tests/helpers'

const supabase = createMockSupabaseClient()
supabase.from('documents').insert.mockResolvedValue({
  data: [{ id: 'doc-1' }],
  error: null
})

// Gemini API mocking (worker tests)
jest.mock('@google/genai', () => ({
  GoogleAI: jest.fn(() => ({
    generateContent: jest.fn().mockResolvedValue({
      text: '# Processed Content'
    })
  }))
}))
```

## CI/CD Integration

The testing strategy integrates with GitHub Actions through flexible job configuration:

```yaml
# Critical tests must pass (blocks deployment)
critical-tests:
  run: npm run test:critical && npm run test:e2e

# Development tests can fail (tracked but not blocking)  
development-tests:
  run: npm run test:stable || echo "Tracked but not blocking"
  continue-on-error: true
```

### Branch-Specific Behavior
- **Feature branches**: Critical tests only
- **Develop branch**: Critical + stable tests  
- **Main branch**: All test categories
- **Release branches**: Full validation + performance

## Coverage Philosophy

We focus on **coverage direction** rather than absolute percentages:

### Current Phase Targets
```
E2E Coverage: 100% critical user journeys
Integration: 60% core system paths
Unit Tests: 30% stable APIs  
Overall: 40% weighted average
```

### Measurement Commands
```bash
# Generate coverage reports
npm test -- --coverage
cd worker && npm test -- --coverage

# Quality gate validation
npm run test:gates

# Full validation for releases
npm run test:all
```

## Documentation Navigation

- **[development-workflow.md](./development-workflow.md)** - Comprehensive strategy guide with examples
- **[patterns.md](./patterns.md)** - Code examples and testing patterns
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[.archive/](./.archive/)** - Historical documentation and task reports

## Best Practices

### Test Writing Guidelines
1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Use descriptive names** - Test names should explain the expected behavior
3. **Keep tests independent** - Each test should run in isolation
4. **Mock external dependencies** - Tests shouldn't depend on external services
5. **Test edge cases** - Include error conditions and boundary cases

### Performance Guidelines
- Keep unit tests fast (<100ms each)
- Use factories for consistent test data
- Parallelize test execution where possible
- Clean up resources in teardown methods

### Maintenance Schedule
- **Weekly**: Run critical + stable tests, note failing flexible tests
- **Monthly**: Review test categorization, clean up experimental tests  
- **Quarterly**: Assess strategy effectiveness, adjust coverage targets

---

**Next Steps**: See [development-workflow.md](./development-workflow.md) for detailed implementation guidance and team workflows.