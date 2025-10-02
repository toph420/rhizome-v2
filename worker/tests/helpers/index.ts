/**
 * Worker Module Test Helpers
 *
 * Utilities specific to testing the worker module components
 */

import type { ProcessedDocument, ProcessResult } from '../../types/processor'
import type { EngineResult } from '../../types/engines'

/**
 * Create a mock Gemini API response
 */
export function createMockGeminiResponse(content: string = '# Test Document\n\nTest content') {
  return {
    response: {
      text: () => content
    }
  }
}

/**
 * Create a mock ProcessResult
 */
export function createMockProcessResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    markdown: overrides.markdown || '# Test Markdown',
    chunks: overrides.chunks || [],
    metadata: overrides.metadata || {},
    markdownAvailable: overrides.markdownAvailable ?? true,
    embeddingsAvailable: overrides.embeddingsAvailable ?? false,
    storagePath: overrides.storagePath || null,
    error: overrides.error || null
  }
}

/**
 * Create mock engine results for testing collision detection
 */
export function createMockEngineResults(count: number = 5): EngineResult[] {
  const results: EngineResult[] = []

  for (let i = 0; i < count; i++) {
    results.push({
      engine: 'semantic-similarity',
      sourceChunkId: `chunk-${i}`,
      targetChunkId: `chunk-${i + 10}`,
      score: Math.random(),
      metadata: {
        similarity: Math.random(),
        confidence: Math.random()
      }
    })
  }

  return results
}

/**
 * Mock Supabase client for testing
 */
export function createMockSupabaseClient() {
  return {
    from: (table: string) => ({
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn().mockResolvedValue({ data: [], error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: {}, error: null })
    }),
    storage: {
      from: (bucket: string) => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        download: jest.fn().mockResolvedValue({ data: Buffer.from('test'), error: null })
      })
    },
    rpc: jest.fn().mockResolvedValue({ data: [], error: null })
  }
}

/**
 * Mock cache manager for testing
 */
export class MockCacheManager {
  private cache = new Map<string, any>()

  async get(key: string) {
    return this.cache.get(key)
  }

  async set(key: string, value: any, ttl?: number) {
    this.cache.set(key, value)
  }

  async delete(key: string) {
    return this.cache.delete(key)
  }

  async clear() {
    this.cache.clear()
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: 0,
      misses: 0,
      hitRate: 0
    }
  }
}

/**
 * Mock performance monitor
 */
export class MockPerformanceMonitor {
  private metrics: Record<string, number[]> = {}

  startTimer(label: string) {
    return {
      end: () => {
        if (!this.metrics[label]) {
          this.metrics[label] = []
        }
        this.metrics[label].push(Math.random() * 1000)
      }
    }
  }

  recordMetric(name: string, value: number) {
    if (!this.metrics[name]) {
      this.metrics[name] = []
    }
    this.metrics[name].push(value)
  }

  getMetrics() {
    return this.metrics
  }

  reset() {
    this.metrics = {}
  }
}

/**
 * Create test file buffers for different formats
 */
export const TestFiles = {
  pdf: () => Buffer.from('Mock PDF content'),

  markdown: () => Buffer.from(`# Test Document

## Introduction
This is a test document for processing.

## Content
- Item 1
- Item 2

\`\`\`javascript
const test = 'code';
\`\`\`

## Conclusion
End of test document.`),

  text: () => Buffer.from('Plain text content for testing.'),

  html: () => Buffer.from(`<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<h1>Test Article</h1>
<p>This is test content.</p>
</body>
</html>`)
}

/**
 * Wait for async operations with timeout
 */
export function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    const check = async () => {
      try {
        if (await condition()) {
          resolve()
        } else if (Date.now() - start > timeout) {
          reject(new Error('Timeout waiting for condition'))
        } else {
          setTimeout(check, interval)
        }
      } catch (error) {
        reject(error)
      }
    }

    check()
  })
}

/**
 * Setup common test environment
 */
export function setupTestEnvironment() {
  // Set environment variables for testing
  process.env.NODE_ENV = 'test'
  process.env.SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.GOOGLE_AI_API_KEY = 'test-api-key'

  // Return cleanup function
  return () => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  }
}