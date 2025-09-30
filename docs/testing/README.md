# Testing Guide - Rhizome V2

> **Single Source of Truth for Testing**
> Last Updated: January 2025
> Status: Phase 1 Implementation In Progress

## Quick Start

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- src/lib/ecs          # ECS tests
npm test -- worker/processors    # Worker tests

# Run with coverage
npm run test:coverage

# Run E2E tests (when available)
npm run test:e2e
```

## Testing Philosophy

### Core Principles
- **Pragmatic Coverage**: 70% on critical paths > 100% everywhere
- **Test What Matters**: User journeys > implementation details
- **Fast Feedback**: Unit tests run in <1s, integration <10s
- **Isolation**: Tests should not depend on external services

### What We Test
1. **Critical Paths** (70% coverage target)
   - Document processing pipeline
   - 7-engine collision detection system
   - ECS operations
   - User data flows

2. **Supporting Systems** (50% coverage target)
   - UI components
   - Utility functions
   - Configuration systems

3. **Experimental Features** (No coverage requirement)
   - New engines
   - Beta features

## Project Structure

```
rhizome-v2/
├── tests/                    # Shared test infrastructure
│   ├── factories/           # Test data generators
│   ├── fixtures/            # Static test data
│   ├── mocks/               # MSW handlers & mocks
│   └── e2e/                 # Playwright E2E tests
├── src/
│   ├── lib/ecs/__tests__/  # ECS unit tests
│   └── app/actions/__tests__/ # Server action tests
└── worker/
    └── tests/
        ├── unit/            # Pure function tests
        ├── integration/     # Multi-component tests
        └── helpers/         # Worker-specific utilities
```

## Test Categories

### 1. Unit Tests
Test individual functions and components in isolation.

```typescript
// Example: src/lib/ecs/__tests__/ecs.test.ts
import { ecs } from '../ecs'
import { factories } from '@/tests/factories'

describe('ECS.createEntity', () => {
  it('creates entity with components', async () => {
    const userId = 'test-user'
    const components = {
      flashcard: { question: 'Q', answer: 'A' }
    }

    const entityId = await ecs.createEntity(userId, components)

    expect(entityId).toBeDefined()
    expect(typeof entityId).toBe('string')
  })
})
```

### 2. Integration Tests
Test multiple components working together.

```typescript
// Example: worker/tests/integration/pipeline.test.ts
describe('Document Processing Pipeline', () => {
  it('processes PDF end-to-end', async () => {
    const document = factories.document.createPDF()
    const result = await processDocument(document)

    expect(result.markdown).toBeDefined()
    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.embeddingsAvailable).toBe(true)
  })
})
```

### 3. E2E Tests
Test complete user journeys in a real browser.

```typescript
// Example: tests/e2e/upload-flow.spec.ts
test('user uploads and reads document', async ({ page }) => {
  await page.goto('/upload')
  await page.setInputFiles('input[type=file]', 'tests/fixtures/sample.pdf')
  await page.waitForSelector('[data-testid="processing-complete"]')
  await page.click('[data-testid="read-document"]')
  await expect(page).toHaveURL(/\/read\//)
})
```

## Using Test Factories

Test factories provide consistent test data generation:

```typescript
import { factories } from '@/tests/factories'

// Create test documents
const doc = factories.document.create()
const processedDoc = factories.document.createProcessed()
const pdfDoc = factories.document.createPDF()

// Create test chunks
const chunk = factories.chunk.create()
const chunks = factories.chunk.createMany(10, 'doc-id')

// Create ECS entities
const flashcard = factories.entity.createFlashcard({
  question: 'What is ECS?',
  answer: 'Entity-Component-System'
})

// Reset factories between tests
beforeEach(() => {
  factories.document.reset()
  factories.chunk.reset()
  factories.entity.reset()
})
```

## Mocking Strategies

### External Services
Use MSW for mocking HTTP requests:

```typescript
// tests/mocks/handlers.ts
import { http } from 'msw'

export const handlers = [
  http.post('*/gemini/process', () => {
    return new Response(JSON.stringify({
      markdown: '# Processed Content',
      chunks: []
    }))
  })
]
```

### Supabase
Use the mock client from test helpers:

```typescript
import { createMockSupabaseClient } from '@/worker/tests/helpers'

const supabase = createMockSupabaseClient()
supabase.from('documents').insert.mockResolvedValue({
  data: [{ id: 'doc-1' }],
  error: null
})
```

## Running Tests

### Development Workflow
```bash
# Watch mode for TDD
npm test -- --watch

# Run specific test file
npm test -- ecs.test.ts

# Run with coverage
npm test -- --coverage

# Debug a specific test
npm test -- --detectOpenHandles ecs.test.ts
```

### CI/CD Pipeline
```yaml
# .github/workflows/test.yml
- name: Run Tests
  run: |
    npm test -- --ci --coverage
    npm run test:e2e -- --reporter=github
```

## Coverage Requirements

### Current Targets
| Module | Target | Current | Status |
|--------|--------|---------|--------|
| Main App | 50% | ~10% | 🔴 |
| Worker | 70% | ~30% | 🟡 |
| ECS | 80% | 0% | 🔴 |
| E2E | Critical paths | 0% | 🔴 |

### Measurement
```bash
# Generate coverage report
npm run test:coverage

# View in browser
npm run test:coverage:open

# CI reporting
npm run test:ci -- --coverage
```

## Common Patterns

### Testing Async Operations
```typescript
it('handles async processing', async () => {
  const promise = processDocument(doc)

  // Assert loading state
  expect(getStatus()).toBe('processing')

  // Wait for completion
  await promise

  // Assert final state
  expect(getStatus()).toBe('completed')
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

### Testing with Time
```typescript
import { delay } from '@/tests/factories/utils'

it('respects retry delays', async () => {
  const start = Date.now()

  await retryWithBackoff(failingOperation)

  const elapsed = Date.now() - start
  expect(elapsed).toBeGreaterThan(3000) // 3 retries with delays
})
```

## Troubleshooting

### Common Issues

**ESM Import Errors**
```bash
# Solution: Ensure NODE_OPTIONS is set
NODE_OPTIONS='--experimental-vm-modules' npm test
```

**TypeScript Compilation Errors**
```bash
# Solution: Check tsconfig in jest.config.cjs
transform: {
  '^.+\\.tsx?$': ['ts-jest', {
    useESM: true,
    isolatedModules: true
  }]
}
```

**Timeout Issues**
```typescript
// Increase timeout for slow operations
jest.setTimeout(30000) // 30 seconds

// Or per test
it('processes large document', async () => {
  // test code
}, 60000)
```

## Best Practices

### 1. Test Naming
- Use descriptive names that explain the behavior
- Follow pattern: `should [expected behavior] when [condition]`
- Group related tests with `describe` blocks

### 2. Test Independence
- Each test should be able to run in isolation
- Use `beforeEach`/`afterEach` for setup/teardown
- Reset factories and mocks between tests

### 3. Assertion Quality
- Test behavior, not implementation
- Use specific assertions (`toBe` > `toBeTruthy`)
- Include edge cases and error paths

### 4. Performance
- Keep unit tests fast (<100ms each)
- Use mocks to avoid external dependencies
- Parallelize test execution where possible

## Next Steps

### Phase 1 (Current)
- [x] Fix Jest ESM configuration
- [x] Create test factories
- [x] Consolidate documentation
- [ ] Write core ECS tests
- [ ] Update CLAUDE.md

### Phase 2 (Next Week)
- [ ] Document processing tests
- [ ] Collision detection tests
- [ ] Database operation tests
- [ ] Coverage >50% on critical paths

### Phase 3 (Week 3) ✅ COMPLETED
- [x] Playwright E2E setup
- [x] Critical user journey tests
- [x] Page Object Model implementation
- [x] CI/CD pipeline integration
- [ ] MSW for API mocking (optional)
- [ ] Coverage >70% on critical paths

## Resources

### Internal Documentation
- [Testing Status](./TESTING_STATUS.md) - Current test health
- [Testing Patterns](./patterns.md) - Code examples
- [Coverage Report](./coverage-report.md) - Latest metrics

### External Resources
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/)
- [MSW Documentation](https://mswjs.io/docs/)
- [Playwright Documentation](https://playwright.dev/docs/intro)