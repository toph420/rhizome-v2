# Testing Quick Start Guide

> **Get up and running with Rhizome V2 testing in 5 minutes**

## Prerequisites

- Node.js 20+
- Docker (for Supabase)
- Git

## 1. Environment Setup

```bash
# Clone and install
git clone <repo-url>
cd rhizome-v2
npm install
cd worker && npm install && cd ..

# Start Supabase
npx supabase start

# Environment files
cp .env.example .env.local
cp worker/.env.example worker/.env
```

## 2. Run Your First Tests

```bash
# Quick smoke test
npm test -- --testNamePattern="smoke"

# Worker tests (core functionality)
cd worker && npm test

# All tests with coverage
npm run test:coverage
```

## 3. E2E Tests

```bash
# Install browsers
npx playwright install

# Run E2E tests
npx playwright test

# Interactive mode
npx playwright test --ui
```

## 4. Development Workflow

### TDD Cycle
```bash
# 1. Watch mode
npm test -- --watch

# 2. Write failing test
# 3. Make it pass
# 4. Refactor
```

### Before Committing
```bash
# Run full test suite
npm test
cd worker && npm test
npx playwright test

# Check coverage
npm run test:coverage
```

## 5. Common Commands

```bash
# Test specific file
npm test -- ecs.test.ts

# Debug test
npm test -- --detectOpenHandles ecs.test.ts

# Test with verbose output
npm test -- --verbose

# Update snapshots
npm test -- --updateSnapshot
```

## 6. Creating New Tests

### Unit Test Template
```typescript
// src/lib/example/__tests__/example.test.ts
import { exampleFunction } from '../example'
import { factories } from '@/tests/factories'

describe('exampleFunction', () => {
  it('should do expected behavior when given valid input', () => {
    // Arrange
    const input = factories.example.create()
    
    // Act
    const result = exampleFunction(input)
    
    // Assert
    expect(result).toBe(expectedValue)
  })
})
```

### E2E Test Template
```typescript
// tests/e2e/example.spec.ts
import { test, expect } from '@playwright/test'

test('user can complete example workflow', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="example-button"]')
  await expect(page).toHaveURL(/\/example/)
})
```

## 7. Troubleshooting

### Common Issues

**"Cannot find module" errors**
```bash
# Clear caches
npm run clean
npm install
```

**ESM import issues**
```bash
# Check jest.config.ts has ESM settings
NODE_OPTIONS='--experimental-vm-modules' npm test
```

**Timeout errors**
```bash
# Increase timeout
jest.setTimeout(30000)
```

**Database connection issues**
```bash
# Restart Supabase
npx supabase stop
npx supabase start
npx supabase db reset
```

### Getting Help

1. Check [Testing Patterns](./patterns.md) for examples
2. See [README.md](./README.md) for comprehensive guide
3. Check existing tests for patterns
4. Search GitHub issues for similar problems

## Next Steps

- Read [Testing Patterns](./patterns.md) for best practices
- Review [Coverage Analysis](./coverage-analysis.md) for metrics
- Check CI/CD pipeline status in GitHub Actions
- Join team testing discussions

---

**Happy Testing! 🧪**