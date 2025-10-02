
# General Testing Patterns for Rhizome

> **Generic but useful patterns for mocking, async, and error handling**  
> Use these as building blocks, but prefer critical-patterns.md for Rhizome-specific scenarios

## Table of Contents
1. [Mocking Patterns](#mocking-patterns)
2. [Async Testing Patterns](#async-testing-patterns)
3. [Error Testing Patterns](#error-testing-patterns)
4. [E2E Patterns](#e2e-patterns)

---

## Mocking Patterns

### Supabase Client Mocking

```typescript
// tests/mocks/supabase.ts
export function createMockSupabaseClient() {
  const mockSelect = jest.fn()
  const mockInsert = jest.fn()
  const mockUpdate = jest.fn()
  const mockDelete = jest.fn()
  const mockEq = jest.fn()
  const mockSingle = jest.fn()
  const mockFrom = jest.fn()
  
  // Create chainable mock
  const chainableMock = {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    single: mockSingle.mockResolvedValue({ data: {}, error: null })
  }
  
  mockFrom.mockReturnValue(chainableMock)
  
  return {
    from: mockFrom,
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: {}, error: null }),
        download: jest.fn().mockResolvedValue({ 
          data: new Blob(['content'], { type: 'application/pdf' }), 
          error: null 
        }),
        list: jest.fn().mockResolvedValue({ data: [], error: null }),
        remove: jest.fn().mockResolvedValue({ data: null, error: null })
      }))
    },
    rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ 
        data: { user: { id: 'test-user' } }, 
        error: null 
      })
    }
  }
}

// Usage in tests
import { createMockSupabaseClient } from '@/tests/mocks/supabase'

beforeEach(() => {
  jest.clearAllMocks()
})

test('queries documents correctly', async () => {
  const supabase = createMockSupabaseClient()
  
  supabase.from().select.mockResolvedValue({
    data: [{ id: 'doc-1', title: 'Test Doc' }],
    error: null
  })
  
  const result = await getDocuments('user-id')
  
  expect(supabase.from).toHaveBeenCalledWith('documents')
  expect(result).toHaveLength(1)
})
```

### Gemini API Mocking

```typescript
// worker/tests/mocks/gemini.ts
export const mockGeminiClient = {
  generateContent: jest.fn(),
  embedContent: jest.fn()
}

export function mockGeminiSuccess(response: any) {
  mockGeminiClient.generateContent.mockResolvedValue({
    response: { 
      text: () => typeof response === 'string' 
        ? response 
        : JSON.stringify(response)
    }
  })
}

export function mockGeminiError(message: string) {
  mockGeminiClient.generateContent.mockRejectedValue(
    new Error(message)
  )
}

export function mockGeminiEmbedding(dimension: number = 768) {
  const embedding = Array(dimension).fill(0).map(() => Math.random())
  mockGeminiClient.embedContent.mockResolvedValue({
    embedding: { values: embedding }
  })
}

// Usage
beforeEach(() => {
  jest.clearAllMocks()
  mockGeminiSuccess({
    markdown: '# Processed Content',
    chunks: [{ content: 'Test chunk', metadata: {} }]
  })
})

test('processes content with Gemini', async () => {
  const result = await extractContent('test.pdf')
  
  expect(mockGeminiClient.generateContent).toHaveBeenCalled()
  expect(result.markdown).toContain('#')
})

test('handles Gemini rate limit', async () => {
  mockGeminiError('Rate limit exceeded')
  
  await expect(extractContent('test.pdf'))
    .rejects
    .toThrow('Rate limit')
})
```

### File System Mocking

```typescript
// tests/mocks/fs.ts
import { jest } from '@jest/globals'

export function mockFileSystem() {
  const files = new Map<string, string>()
  
  return {
    readFile: jest.fn((path: string) => {
      if (!files.has(path)) {
        return Promise.reject(new Error('File not found'))
      }
      return Promise.resolve(files.get(path))
    }),
    
    writeFile: jest.fn((path: string, content: string) => {
      files.set(path, content)
      return Promise.resolve()
    }),
    
    exists: jest.fn((path: string) => {
      return Promise.resolve(files.has(path))
    }),
    
    // Helper to seed files
    seed: (path: string, content: string) => {
      files.set(path, content)
    },
    
    // Helper to get all files
    getAll: () => Array.from(files.entries())
  }
}

// Usage
test('saves document to file system', async () => {
  const fs = mockFileSystem()
  
  await saveDocument('storage/doc_123/content.md', '# Test')
  
  expect(fs.writeFile).toHaveBeenCalledWith(
    'storage/doc_123/content.md',
    '# Test'
  )
})
```

---

## Async Testing Patterns

### Testing Promise Chains

```typescript
describe('Async Operations', () => {
  test('waits for operation completion', async () => {
    const document = { id: 'doc-1', status: 'pending' }
    
    // Start async operation
    const promise = processDocument(document)
    
    // Can check intermediate state
    expect(document.status).toBe('processing')
    
    // Wait for completion
    const result = await promise
    
    // Assert final state
    expect(result.status).toBe('completed')
  })

  test('handles concurrent operations', async () => {
    const documents = [
      { id: 'doc-1' },
      { id: 'doc-2' },
      { id: 'doc-3' }
    ]
    
    // Start all concurrently
    const promises = documents.map(doc => processDocument(doc))
    
    // Wait for all
    const results = await Promise.all(promises)
    
    // All should succeed
    expect(results.every(r => r.status === 'completed')).toBe(true)
  })

  test('handles partial failures in batch', async () => {
    const documents = [
      { id: 'doc-1', valid: true },
      { id: 'doc-2', valid: false }, // Will fail
      { id: 'doc-3', valid: true }
    ]
    
    const results = await Promise.allSettled(
      documents.map(doc => processDocument(doc))
    )
    
    const successful = results.filter(r => r.status === 'fulfilled')
    const failed = results.filter(r => r.status === 'rejected')
    
    expect(successful).toHaveLength(2)
    expect(failed).toHaveLength(1)
  })
})
```

### Testing with Timeouts

```typescript
describe('Timeout Handling', () => {
  test('respects operation timeout', async () => {
    const slowOperation = new Promise(resolve => {
      setTimeout(resolve, 5000) // 5 seconds
    })
    
    await expect(
      Promise.race([
        slowOperation,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 1000)
        )
      ])
    ).rejects.toThrow('Timeout')
  })

  test('retries on timeout', async () => {
    let attempts = 0
    
    const operation = async () => {
      attempts++
      if (attempts < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        throw new Error('Timeout')
      }
      return 'success'
    }
    
    const result = await retryOnTimeout(operation, { maxRetries: 3 })
    
    expect(result).toBe('success')
    expect(attempts).toBe(3)
  }, 10000) // Extend Jest timeout
})
```

### Testing Retry Logic

```typescript
describe('Retry Behavior', () => {
  test('retries failed operations', async () => {
    let attempt = 0
    const flaky = jest.fn().mockImplementation(async () => {
      attempt++
      if (attempt < 3) throw new Error('Temporary failure')
      return 'success'
    })
    
    const result = await retry(flaky, { maxAttempts: 3, delay: 100 })
    
    expect(result).toBe('success')
    expect(flaky).toHaveBeenCalledTimes(3)
  })

  test('stops retrying after max attempts', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('Always fails'))
    
    await expect(
      retry(failing, { maxAttempts: 3, delay: 10 })
    ).rejects.toThrow('Always fails')
    
    expect(failing).toHaveBeenCalledTimes(3)
  })

  test('uses exponential backoff', async () => {
    const delays: number[] = []
    let attempt = 0
    
    const operation = jest.fn().mockImplementation(async () => {
      attempt++
      if (attempt < 4) throw new Error('Retry')
      return 'success'
    })
    
    await retry(operation, {
      maxAttempts: 4,
      delay: 100,
      backoff: 'exponential',
      onRetry: (delay) => delays.push(delay)
    })
    
    // Delays should be: 100, 200, 400
    expect(delays).toEqual([100, 200, 400])
  })
})
```

---

## Error Testing Patterns

### Testing Error Boundaries

```typescript
describe('Error Handling', () => {
  test('handles database connection failures', async () => {
    const supabase = createMockSupabaseClient()
    supabase.from().select.mockRejectedValue(
      new Error('Connection timeout')
    )
    
    const result = await getDocuments('user-id')
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection timeout')
  })

  test('handles malformed API responses', async () => {
    mockGeminiClient.generateContent.mockResolvedValue({
      response: { text: () => 'Invalid JSON {' }
    })
    
    await expect(processContent())
      .rejects
      .toThrow('Invalid response format')
  })

  test('handles network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(
      new Error('Network request failed')
    )
    
    await expect(uploadFile('test.pdf'))
      .rejects
      .toThrow('Network request failed')
  })
})
```

### Testing Input Validation

```typescript
describe('Input Validation', () => {
  test('rejects invalid file types', async () => {
    const invalidFile = new File(['content'], 'test.exe', {
      type: 'application/x-msdownload'
    })
    
    await expect(validateFileUpload(invalidFile))
      .rejects
      .toThrow('Unsupported file type')
  })

  test('rejects oversized files', async () => {
    const oversizedFile = new File(
      ['x'.repeat(100_000_000)], 
      'huge.pdf',
      { type: 'application/pdf' }
    )
    
    await expect(validateFileUpload(oversizedFile))
      .rejects
      .toThrow('File too large')
  })

  test('validates document ID format', () => {
    expect(() => validateDocumentId('valid-id-123')).not.toThrow()
    expect(() => validateDocumentId('invalid id')).toThrow()
    expect(() => validateDocumentId('')).toThrow()
  })
})
```

### Testing Error Recovery

```typescript
describe('Error Recovery', () => {
  test('recovers from partial processing failure', async () => {
    const document = { id: 'doc-1', chunks: [] }
    
    // Mock one chunk failing
    const processChunk = jest.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Chunk failed'))
      .mockResolvedValueOnce({ success: true })
    
    const result = await processDocumentWithRecovery(document)
    
    expect(result.status).toBe('partial_success')
    expect(result.processedChunks).toBe(2)
    expect(result.failedChunks).toBe(1)
  })

  test('saves progress before failing', async () => {
    const document = { id: 'doc-1' }
    const saveProgress = jest.fn()
    
    try {
      await processDocumentWithCheckpoints(document, {
        onCheckpoint: saveProgress
      })
    } catch (error) {
      // Even if it fails, progress should be saved
      expect(saveProgress).toHaveBeenCalled()
    }
  })
})
```

---

## E2E Patterns

### Basic Page Navigation

```typescript
// tests/e2e/navigation.spec.ts
import { test, expect } from '@playwright/test'

test('user can navigate through app', async ({ page }) => {
  // Start at homepage
  await page.goto('/')
  
  // Navigate to documents
  await page.click('text=Documents')
  await expect(page).toHaveURL('/documents')
  
  // Open a document
  await page.click('[data-testid="document-card"]:first-child')
  await expect(page).toHaveURL(/\/read\//)
  
  // Verify content loaded
  await expect(page.locator('[data-testid="document-content"]'))
    .toBeVisible()
})
```

### Form Interactions

```typescript
test('user can create annotation', async ({ page }) => {
  await page.goto('/read/test-doc')
  
  // Select text
  await page.locator('[data-testid="document-content"]')
    .locator('text=important concept')
    .first()
    .dblclick()
  
  // Open annotation form
  await page.click('[data-testid="create-annotation"]')
  
  // Fill form
  await page.fill('[data-testid="annotation-note"]', 'This is key')
  await page.selectOption('[data-testid="annotation-color"]', 'yellow')
  
  // Save
  await page.click('[data-testid="save-annotation"]')
  
  // Verify annotation appears
  await expect(page.locator('.annotation-marker')).toBeVisible()
  await expect(page.locator('.annotation-sidebar'))
    .toContainText('This is key')
})
```

### Waiting for Async Operations

```typescript
test('waits for document processing', async ({ page }) => {
  await page.goto('/upload')
  
  // Upload file
  await page.setInputFiles('input[type="file"]', 'fixtures/test.pdf')
  
  // Wait for processing (up to 2 minutes)
  await expect(page.locator('[data-testid="status"]'))
    .toHaveText('completed', { timeout: 120000 })
  
  // Verify results
  await expect(page.locator('[data-testid="chunk-count"]'))
    .toContainText(/\d+ chunks/)
})
```

### Testing Error States

```typescript
test('shows error on upload failure', async ({ page }) => {
  await page.goto('/upload')
  
  // Mock network failure
  await page.route('**/api/upload', route => {
    route.abort('failed')
  })
  
  // Try to upload
  await page.setInputFiles('input[type="file"]', 'fixtures/test.pdf')
  
  // Verify error message
  await expect(page.locator('[data-testid="error-message"]'))
    .toBeVisible()
  await expect(page.locator('[data-testid="error-message"]'))
    .toContainText('Upload failed')
})