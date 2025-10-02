# Testing Troubleshooting Guide

> **Common issues and solutions for Rhizome V2 testing**  
> Updated for development-friendly testing strategy

## Quick Diagnosis

### Test Category Issues

```bash
# Check which category is failing
npm run test:critical     # Should always pass
npm run test:stable       # Fix when broken
npm run test:flexible     # Can fail during development

# Check specific modules
npm test                  # Main app
cd worker && npm test     # Worker module
```

### Common Error Patterns

| Error Pattern | Category | Action |
|---------------|----------|---------|
| E2E test failures | 🔴 Critical | **Immediate fix required** |
| Database connection errors | 🟡 Stable | Fix during next cycle |
| Component test failures | 🟢 Flexible | Clean up during stabilization |
| Mock configuration errors | Any | See [Mock Issues](#mock-issues) |

## Test Infrastructure Issues

### ESM Import Errors

**Symptoms**:
```
SyntaxError: Cannot use import statement outside a module
ReferenceError: require is not defined
```

**Solutions**:

1. **Worker Module ESM Issues**:
```bash
# Ensure NODE_OPTIONS is set correctly
export NODE_OPTIONS='--experimental-vm-modules'
cd worker && npm test
```

2. **Main App Import Issues**:
```javascript
// jest.config.js - Ensure ESM configuration
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      isolatedModules: true
    }]
  }
}
```

3. **Mixed Import/Require Issues**:
```typescript
// ❌ Don't mix
const { something } = require('./module')
import { other } from './other'

// ✅ Use consistent ESM
import { something } from './module'
import { other } from './other'
```

### Jest Configuration Problems

**Symptoms**:
```
TypeError: Cannot read properties of undefined
Config option "testEnvironment" is required
```

**Solutions**:

1. **Check Jest Config Files**:
```bash
# Main app
cat jest.config.js

# Worker module  
cat worker/jest.config.cjs
```

2. **Common Fix for Worker Module**:
```javascript
// worker/jest.config.cjs
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true
    }]
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
}
```

3. **Test Setup File Issues**:
```typescript
// worker/tests/setup.ts
import { jest } from '@jest/globals'

// Make jest available globally for ESM
global.jest = jest
```

## Mock Issues

### Supabase Client Mocking

**Symptoms**:
```
TypeError: supabase.from(...).eq is not a function
TypeError: Cannot read properties of undefined (reading 'mockResolvedValue')
```

**Solutions**:

1. **Chainable Mock Pattern**:
```typescript
// tests/mocks/supabase.ts
export function createMockSupabaseClient() {
  const createChainableMock = () => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: {}, error: null })
  })

  return {
    from: jest.fn().mockReturnValue(createChainableMock()),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null })
      }))
    }
  }
}
```

2. **Mock Reset Issues**:
```typescript
// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks()
  // Re-setup default mock behavior
  mockSupabase.from().select.mockResolvedValue({ data: [], error: null })
})
```

### Gemini API Mocking

**Symptoms**:
```
Error: Cannot find module '@google/genai'
TypeError: mockGeminiClient.generateContent.mockResolvedValue is not a function
```

**Solutions**:

1. **Proper Gemini Mocking**:
```typescript
// worker/tests/mocks/gemini.ts
jest.mock('@google/genai', () => ({
  GoogleAI: jest.fn(() => ({
    generateContent: jest.fn().mockResolvedValue({
      response: { text: () => 'Mocked response' }
    })
  }))
}))
```

2. **Dynamic Mock Control**:
```typescript
import { GoogleAI } from '@google/genai'

const mockGenerateContent = jest.fn()
;(GoogleAI as jest.Mock).mockImplementation(() => ({
  generateContent: mockGenerateContent
}))

// In tests
mockGenerateContent.mockResolvedValue(/* response */)
```

## Database and Integration Issues

### Supabase Connection Problems

**Symptoms**:
```
Error: Database connection failed
Error: relation "documents" does not exist
```

**Solutions**:

1. **Check Supabase Status**:
```bash
npx supabase status
# Should show all services running

# If not running
npx supabase start
```

2. **Reset Database**:
```bash
npx supabase db reset --local
# This runs all migrations and seeds
```

3. **Check Environment Variables**:
```bash
# .env.local (main app)
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY

# worker/.env
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

### Migration and Schema Issues

**Symptoms**:
```
Error: column "embedding" does not exist
Error: function match_chunks does not exist
```

**Solutions**:

1. **Check Migration Status**:
```bash
npx supabase migration list
# Shows applied vs pending migrations
```

2. **Apply Pending Migrations**:
```bash
npx supabase db reset --local
# Or for specific migration
npx supabase migration up
```

3. **Check Extensions**:
```sql
-- In Supabase SQL Editor
SELECT * FROM pg_extension WHERE extname = 'vector';
-- Should show pgvector extension installed
```

## Test Execution Issues

### Timeout Problems

**Symptoms**:
```
Error: Timeout - Async callback was not invoked within the 5000ms timeout
Test timeout of 60000ms exceeded
```

**Solutions**:

1. **Increase Jest Timeout**:
```typescript
// Per test
test('long running test', async () => {
  // test code
}, 30000) // 30 seconds

// Globally
jest.setTimeout(30000)
```

2. **E2E Test Timeouts**:
```typescript
// playwright.config.ts
export default defineConfig({
  timeout: 60000, // 1 minute per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  }
})
```

3. **Async Operation Issues**:
```typescript
// ❌ Don't forget await
test('async test', () => {
  processDocument(doc) // Missing await!
})

// ✅ Always await async operations
test('async test', async () => {
  await processDocument(doc)
})
```

### Memory and Performance Issues

**Symptoms**:
```
JavaScript heap out of memory
Tests are running very slowly
Worker process has failed to exit gracefully
```

**Solutions**:

1. **Increase Node Memory**:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm test
```

2. **Cleanup Test Resources**:
```typescript
// Clean up after tests
afterEach(async () => {
  await cleanup()
  jest.clearAllMocks()
})

afterAll(async () => {
  await teardownTestDatabase()
})
```

3. **Avoid Memory Leaks**:
```typescript
// ❌ Don't create large objects without cleanup
test('memory leak test', () => {
  const largeArray = new Array(1000000).fill('data')
  // Memory not released
})

// ✅ Clean up resources
test('proper cleanup test', () => {
  const largeArray = new Array(1000000).fill('data')
  // Process data
  largeArray.length = 0 // Clear array
})
```

## CI/CD Issues

### GitHub Actions Failures

**Symptoms**:
```
Error: Process completed with exit code 1
Tests are passing locally but failing in CI
```

**Solutions**:

1. **Check CI Environment Variables**:
```yaml
# .github/workflows/test.yml
env:
  NODE_ENV: test
  SUPABASE_URL: http://localhost:54321
  GOOGLE_AI_API_KEY: ${{ secrets.GOOGLE_AI_API_KEY }}
```

2. **Service Startup Issues**:
```yaml
# Add wait time for services
- name: Start Supabase
  run: |
    supabase start --exclude edge-runtime,logflyte,vector
    sleep 10  # Wait for services to be ready
```

3. **Database Migration in CI**:
```yaml
- name: Run database migrations
  run: supabase db reset --local
  # Ensures clean state for each CI run
```

### Branch-Specific Test Failures

**Symptoms**:
```
Tests pass on main but fail on feature branches
Development tests are blocking deployment
```

**Solutions**:

1. **Check Test Category Configuration**:
```yaml
# Feature branches should only run critical tests
- name: Run critical tests
  if: github.ref != 'refs/heads/main'
  run: npm run test:critical
```

2. **Verify CI Job Configuration**:
```yaml
# Development tests should not block
development-tests:
  continue-on-error: true
  run: npm run test:stable || echo "Tracked but not blocking"
```

## E2E Test Issues

### Playwright Setup Problems

**Symptoms**:
```
Error: Browser not found
TimeoutError: page.goto: Timeout 30000ms exceeded
```

**Solutions**:

1. **Install Browsers**:
```bash
npx playwright install chromium
# Or for CI
npx playwright install --with-deps chromium
```

2. **Application Startup Issues**:
```bash
# Check if app is running
curl http://localhost:3000/api/health

# Wait for app to be ready
npx wait-on http://localhost:3000 --timeout 60000
```

3. **Test Environment Setup**:
```typescript
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: 'npm run build && npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
})
```

### Page Object Issues

**Symptoms**:
```
Error: Locator not found
Test flakiness with element selection
```

**Solutions**:

1. **Use Data Test IDs**:
```typescript
// ❌ Fragile selectors
await page.click('button.bg-blue-500')

// ✅ Stable selectors
await page.click('[data-testid="upload-button"]')
```

2. **Wait for Elements**:
```typescript
// ❌ Don't assume elements exist immediately
await page.click('[data-testid="button"]')

// ✅ Wait for elements to be ready
await page.waitForSelector('[data-testid="button"]')
await page.click('[data-testid="button"]')
```

## Test Factory Issues

### Factory Reset Problems

**Symptoms**:
```
Test data persisting between tests
Unexpected test interactions
```

**Solutions**:

1. **Proper Factory Reset**:
```typescript
// tests/factories/index.ts
beforeEach(() => {
  factories.document.reset()
  factories.chunk.reset()
  factories.entity.reset()
})
```

2. **Isolated Test Data**:
```typescript
// Use unique IDs per test
test('isolated test', () => {
  const doc = factories.document.create({
    id: `test-${Date.now()}-${Math.random()}`
  })
})
```

## Development Workflow Issues

### Test Category Confusion

**Symptoms**:
```
Unclear which tests should pass/fail
Tests being fixed unnecessarily
```

**Solutions**:

1. **Use Clear Commands**:
```bash
# Must pass (blocks deployment)
npm run test:critical

# Should pass (fix when broken)  
npm run test:stable

# Can fail (clean up later)
npm run test:flexible
```

2. **Check Test Status Dashboard**:
```bash
# Overall health check
npm run test:gates

# Category-specific status
npm run test:critical && echo "✅ Critical: PASS" || echo "❌ Critical: FAIL"
npm run test:stable && echo "✅ Stable: PASS" || echo "⚠️ Stable: NEEDS FIX"
```

## Getting Help

### Diagnostic Commands

```bash
# Test environment check
npm run test:gates

# Full validation
npm test -- --verbose
cd worker && npm test -- --verbose

# Coverage analysis
npm test -- --coverage
cd worker && npm test -- --coverage

# CI simulation
./.github/workflows/test.yml # Review configuration
```

### Debug Information to Collect

When reporting issues, include:

1. **Environment Information**:
```bash
node --version
npm --version
npx supabase --version
```

2. **Test Category and Command**:
```bash
# Which command failed?
npm run test:critical
npm run test:stable
npm run test:flexible
```

3. **Error Messages**:
- Full stack trace
- Jest configuration
- Environment variables (sanitized)

4. **Context**:
- Which branch/commit
- Recent changes made
- Development vs CI environment

---

**See Also**:
- [README.md](./README.md) - Primary testing guide and quick start
- [development-workflow.md](./development-workflow.md) - Testing strategy details
- [patterns.md](./patterns.md) - Code examples and patterns