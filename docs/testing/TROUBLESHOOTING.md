# Testing Troubleshooting Guide

> **Solutions for common testing issues in Rhizome V2**

## Jest Issues

### ESM Module Resolution Errors

**Problem**: `Cannot use import statement outside a module`

```bash
# Solution 1: Check NODE_OPTIONS
NODE_OPTIONS='--experimental-vm-modules' npm test

# Solution 2: Verify jest.config.ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true
    }]
  }
}
```

### TypeScript Compilation Errors

**Problem**: `TypeScript compilation failed`

```bash
# Check tsconfig.json
{
  "compilerOptions": {
    "module": "esnext",
    "target": "esnext",
    "moduleResolution": "node"
  }
}

# Clear TypeScript cache
npx tsc --build --clean
npm test
```

### Memory Issues

**Problem**: `JavaScript heap out of memory`

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test

# Run tests in sequence instead of parallel
npm test -- --runInBand
```

### Timeout Issues

**Problem**: `Test timeout exceeded`

```typescript
// Solution 1: Increase global timeout
jest.setTimeout(30000)

// Solution 2: Per-test timeout
it('slow test', async () => {
  // test code
}, 60000)

// Solution 3: Check for hanging promises
npm test -- --detectOpenHandles
```

## Supabase Database Issues

### Connection Refused

**Problem**: `connect ECONNREFUSED ::1:54322`

```bash
# Check Supabase status
npx supabase status

# Restart Supabase stack
npx supabase stop
npx supabase start

# Reset database
npx supabase db reset
```

### Migration Errors

**Problem**: `Migration failed` or `Table does not exist`

```bash
# Reset to clean state
npx supabase db reset

# Apply migrations manually
npx supabase migration up

# Check migration status
npx supabase db diff --schema public
```

### Permission Errors

**Problem**: `permission denied for table`

```bash
# Check RLS policies
npx supabase dashboard

# Verify service role key
echo $SUPABASE_SERVICE_ROLE_KEY

# Use anon key for client operations
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Playwright E2E Issues

### Browser Installation

**Problem**: `browserType.launch: Executable doesn't exist`

```bash
# Install browsers
npx playwright install

# Install system dependencies
npx playwright install-deps

# Use specific browser
npx playwright install chromium
```

### Page Load Timeouts

**Problem**: `Test timeout exceeded while waiting for page`

```typescript
// Solution 1: Increase timeout
test.setTimeout(60000)

// Solution 2: Wait for specific elements
await page.waitForSelector('[data-testid="app-loaded"]')

// Solution 3: Check network issues
await page.waitForLoadState('networkidle')
```

### Element Not Found

**Problem**: `locator.click: Element not found`

```typescript
// Solution 1: Wait for element
await page.waitForSelector('[data-testid="button"]')

// Solution 2: Check if element exists
const element = page.locator('[data-testid="button"]')
await expect(element).toBeVisible()

// Solution 3: Debug with screenshots
await page.screenshot({ path: 'debug.png' })
```

### Navigation Issues

**Problem**: `Page didn't navigate to expected URL`

```typescript
// Solution 1: Wait for navigation
await Promise.all([
  page.waitForNavigation(),
  page.click('[data-testid="link"]')
])

// Solution 2: Check URL pattern
await page.waitForURL(/\/expected-path/)

// Solution 3: Debug current URL
console.log('Current URL:', page.url())
```

## Worker Module Issues

### AI API Failures

**Problem**: `Google AI API rate limit exceeded`

```typescript
// Solution 1: Use mocks in tests
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'mocked response' }
      })
    })
  }))
}))

// Solution 2: Implement retry logic
const retryWithBackoff = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 2 ** i * 1000))
    }
  }
}
```

### File System Permissions

**Problem**: `EACCES: permission denied`

```bash
# Check file permissions
ls -la tests/fixtures/

# Fix permissions
chmod 644 tests/fixtures/*

# Use relative paths
const filePath = path.join(__dirname, 'fixtures', 'test.pdf')
```

### Memory Leaks

**Problem**: `Possible EventEmitter memory leak detected`

```typescript
// Solution 1: Clean up in afterEach
afterEach(() => {
  jest.clearAllMocks()
  jest.restoreAllMocks()
})

// Solution 2: Remove listeners
afterEach(async () => {
  await supabase.removeAllChannels()
})

// Solution 3: Increase listener limit temporarily
process.setMaxListeners(0)
```

## Coverage Issues

### Incorrect Coverage Reports

**Problem**: Coverage shows 0% for files that have tests

```bash
# Solution 1: Check coverage configuration
npm test -- --coverage --coverageReporters=text

# Solution 2: Clear coverage cache
rm -rf coverage/
npm test -- --coverage

# Solution 3: Include/exclude patterns
{
  "collectCoverageFrom": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts"
  ]
}
```

### Istanbul Configuration Issues

**Problem**: `Unknown coverage provider`

```javascript
// jest.config.ts
export default {
  coverageProvider: 'v8', // or 'babel'
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}'
  ]
}
```

## CI/CD Issues

### GitHub Actions Failures

**Problem**: Tests pass locally but fail in CI

```yaml
# Solution 1: Use same Node version
- uses: actions/setup-node@v4
  with:
    node-version: '20'

# Solution 2: Install dependencies correctly
- run: npm ci
- run: cd worker && npm ci

# Solution 3: Set environment variables
env:
  NODE_ENV: test
  CI: true
```

### Docker/Container Issues

**Problem**: `Port already in use` in CI

```yaml
# Solution 1: Use dynamic ports
services:
  postgres:
    ports:
      - 5432:5432

# Solution 2: Kill existing processes
- run: docker stop $(docker ps -q) || true

# Solution 3: Use GitHub service containers
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_PASSWORD: postgres
```

## Debug Tools

### Jest Debug

```bash
# Debug specific test
node --inspect-brk node_modules/.bin/jest --runInBand test.js

# Debug with Chrome DevTools
npm test -- --inspect-brk --runInBand

# Verbose output
npm test -- --verbose
```

### Playwright Debug

```bash
# Debug mode
npx playwright test --debug

# Headed mode
npx playwright test --headed

# Step through
npx playwright test --debug --project=chromium
```

### Console Debugging

```typescript
// Debug test data
console.log('Test data:', JSON.stringify(testData, null, 2))

// Debug async operations
console.log('Before async operation')
await asyncOperation()
console.log('After async operation')

// Debug with Jest
console.log('Current state:', expect.getState())
```

## Performance Issues

### Slow Test Execution

**Problem**: Test suite takes too long

```bash
# Solution 1: Run tests in parallel
npm test -- --maxWorkers=4

# Solution 2: Optimize imports
// Use specific imports instead of barrel exports
import { specificFunction } from './specific-module'

# Solution 3: Profile test execution
npm test -- --verbose --no-cache
```

### Memory Usage

**Problem**: High memory usage during tests

```bash
# Monitor memory usage
npm test -- --logHeapUsage

# Limit workers
npm test -- --maxWorkers=2

# Clear modules between tests
afterEach(() => {
  jest.resetModules()
})
```

## Getting Help

### Debugging Checklist

1. ✅ Check error message carefully
2. ✅ Verify environment variables
3. ✅ Confirm dependencies are installed
4. ✅ Check service status (Supabase)
5. ✅ Clear caches and restart
6. ✅ Run minimal reproduction case
7. ✅ Check recent code changes

### Resources

- **Internal**: Check existing tests for working patterns
- **Jest**: https://jestjs.io/docs/troubleshooting
- **Playwright**: https://playwright.dev/docs/debug
- **Supabase**: https://supabase.com/docs/reference/cli
- **Team**: Ask in development channel

### Escalation Path

1. Search existing issues in repository
2. Check documentation and patterns
3. Create minimal reproduction case
4. Ask team for help with specific error message
5. File issue with reproduction steps

---

**Remember**: Most testing issues have been solved before. Check existing patterns first!