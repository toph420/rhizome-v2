/**
 * Base test utilities for integration testing.
 * Provides mock factories, performance tracking, and test data management.
 */

import { GoogleGenerativeAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'
import type { 
  DocumentProcessorJob,
  ProcessResult,
  ProcessorMetrics 
} from '../../types/processor'

/**
 * Performance tracking utilities for measuring processing improvements.
 */
export class PerformanceTracker {
  private startTime: number = 0
  private databaseCalls: number = 0
  private apiCalls: number = 0
  private cacheHits: number = 0
  private cacheMisses: number = 0
  private memoryStart: number = 0

  start(): void {
    this.startTime = performance.now()
    this.memoryStart = process.memoryUsage().heapUsed
    this.databaseCalls = 0
    this.apiCalls = 0
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  recordDatabaseCall(): void {
    this.databaseCalls++
  }

  recordApiCall(): void {
    this.apiCalls++
  }

  recordCacheHit(): void {
    this.cacheHits++
  }

  recordCacheMiss(): void {
    this.cacheMisses++
  }

  getMetrics(): ProcessorMetrics {
    const endTime = performance.now()
    const memoryEnd = process.memoryUsage().heapUsed
    
    return {
      processingTime: endTime - this.startTime,
      databaseCalls: this.databaseCalls,
      apiCalls: this.apiCalls,
      cacheHitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
      memoryUsed: memoryEnd - this.memoryStart,
      timestamp: new Date()
    }
  }
}

/**
 * Mock factory for creating test Supabase client.
 */
export function createMockSupabase(): any {
  const mockFrom = jest.fn()
  const mockStorage = {
    from: jest.fn(() => ({
      download: jest.fn(),
      upload: jest.fn(),
      createSignedUrl: jest.fn()
    }))
  }

  const mockClient = {
    from: mockFrom,
    storage: mockStorage,
    rpc: jest.fn(),
    auth: {
      getSession: jest.fn(),
      signOut: jest.fn()
    }
  }

  // Setup chainable query builder
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    single: jest.fn(),
    limit: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis()
  })

  return mockClient
}

/**
 * Mock factory for creating test Gemini AI client.
 */
export function createMockGeminiAI(): any {
  const mockModel = {
    generateContent: jest.fn(),
    generateContentStream: jest.fn(),
    countTokens: jest.fn(),
    embedContent: jest.fn(),
    batchEmbedContents: jest.fn()
  }

  const mockFileManager = {
    uploadFile: jest.fn(),
    getFile: jest.fn(),
    deleteFile: jest.fn(),
    listFiles: jest.fn()
  }

  return {
    getGenerativeModel: jest.fn(() => mockModel),
    fileManager: mockFileManager
  }
}

/**
 * Creates a test job with default values.
 */
export function createTestJob(overrides?: Partial<DocumentProcessorJob>): DocumentProcessorJob {
  return {
    id: 'test-job-123',
    user_id: 'test-user',
    document_id: 'test-doc-456',
    source_type: 'pdf',
    source_identifier: 'test.pdf',
    storage_path: 'test-user/test-doc-456/source.pdf',
    status: 'pending',
    progress: 0,
    stage: 'initializing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  }
}

/**
 * Output validator for checking processing results.
 */
export class OutputValidator {
  /**
   * Validates that a ProcessResult has all required fields.
   */
  static validateProcessResult(result: ProcessResult): ValidationResult {
    const errors: string[] = []
    
    // Check required fields
    if (!result.markdown) errors.push('Missing markdown content')
    if (!result.chunks || !Array.isArray(result.chunks)) errors.push('Missing or invalid chunks array')
    if (!result.metadata) errors.push('Missing metadata')
    
    // Validate chunks
    if (result.chunks) {
      result.chunks.forEach((chunk, index) => {
        if (!chunk.content) errors.push(`Chunk ${index} missing content`)
        if (typeof chunk.chunk_index !== 'number') errors.push(`Chunk ${index} missing index`)
        if (!chunk.themes && result.source_type !== 'markdown_asis') {
          errors.push(`Chunk ${index} missing themes`)
        }
        // Check embeddings only if enabled
        if (chunk.embedding && !Array.isArray(chunk.embedding)) {
          errors.push(`Chunk ${index} has invalid embedding`)
        }
      })
    }
    
    // Validate metadata
    if (result.metadata) {
      if (!result.metadata.total_chunks) errors.push('Metadata missing total_chunks')
      if (!result.metadata.processing_time) errors.push('Metadata missing processing_time')
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Validates error handling follows expected patterns.
   */
  static validateErrorHandling(error: any, expectedPrefix?: string): boolean {
    if (!error.message) return false
    
    if (expectedPrefix) {
      return error.message.startsWith(expectedPrefix)
    }
    
    // Check for any known error prefix
    const knownPrefixes = [
      'YOUTUBE_', 'WEB_', 'PDF_', 'MARKDOWN_', 'TEXT_', 'PASTE_'
    ]
    
    return knownPrefixes.some(prefix => error.message.startsWith(prefix))
  }
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Test data factory for creating realistic test documents.
 */
export class TestDataFactory {
  static createPDFBuffer(): Buffer {
    // Create a minimal valid PDF buffer for testing
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> >> >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test PDF Content) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000274 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
365
%%EOF`
    
    return Buffer.from(pdfContent)
  }

  static createYouTubeTranscript(): any[] {
    return [
      { text: "Welcome to this video", offset: 0, duration: 3000 },
      { text: "Today we'll discuss testing", offset: 3000, duration: 4000 },
      { text: "Integration tests are important", offset: 7000, duration: 3500 }
    ]
  }

  static createWebArticleHTML(): string {
    return `<!DOCTYPE html>
    <html>
      <head>
        <title>Test Article</title>
        <meta property="og:title" content="Test Article">
        <meta property="article:author" content="Test Author">
        <meta property="article:published_time" content="2024-01-01">
      </head>
      <body>
        <article>
          <h1>Test Article Title</h1>
          <p>This is the first paragraph of test content.</p>
          <h2>Section One</h2>
          <p>More content here for testing.</p>
          <h2>Section Two</h2>
          <p>Final section of test content.</p>
        </article>
      </body>
    </html>`
  }

  static createMarkdownContent(): string {
    return `# Test Document

## Introduction

This is a test markdown document for integration testing.

## Main Content

- Point one
- Point two  
- Point three

### Subsection

More detailed content here.

## Conclusion

Final thoughts on the test content.`
  }

  static createPlainText(): string {
    return `Test Document

This is plain text content for testing.

It has multiple paragraphs.

And should be converted to structured markdown.`
  }
}

/**
 * Mock implementation tracker for verifying call patterns.
 */
export class MockTracker {
  private calls: Map<string, any[]> = new Map()

  track(name: string, args: any): void {
    if (!this.calls.has(name)) {
      this.calls.set(name, [])
    }
    this.calls.get(name)!.push(args)
  }

  getCalls(name: string): any[] {
    return this.calls.get(name) || []
  }

  getCallCount(name: string): number {
    return this.getCalls(name).length
  }

  reset(): void {
    this.calls.clear()
  }

  /**
   * Verifies expected database operation reduction (50x target).
   */
  verifyDatabaseOptimization(beforeCount: number, afterCount: number): boolean {
    const reduction = beforeCount / afterCount
    return reduction >= 50
  }
}

/**
 * Integration test reporter for generating test summaries.
 */
export class IntegrationTestReporter {
  private results: TestResult[] = []

  recordTest(name: string, metrics: ProcessorMetrics, passed: boolean): void {
    this.results.push({
      name,
      metrics,
      passed,
      timestamp: new Date()
    })
  }

  generateReport(): string {
    const totalTests = this.results.length
    const passedTests = this.results.filter(r => r.passed).length
    const failedTests = totalTests - passedTests
    
    const avgProcessingTime = this.results.reduce((sum, r) => sum + r.metrics.processingTime, 0) / totalTests
    const avgDbCalls = this.results.reduce((sum, r) => sum + r.metrics.databaseCalls, 0) / totalTests
    const avgCacheHitRate = this.results.reduce((sum, r) => sum + r.metrics.cacheHitRate, 0) / totalTests
    
    return `
=================================================
       INTEGRATION TEST REPORT
=================================================

Test Summary:
  Total Tests: ${totalTests}
  Passed: ${passedTests} ✅
  Failed: ${failedTests} ❌
  Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%

Performance Metrics:
  Avg Processing Time: ${avgProcessingTime.toFixed(2)}ms
  Avg Database Calls: ${avgDbCalls.toFixed(1)}
  Avg Cache Hit Rate: ${(avgCacheHitRate * 100).toFixed(1)}%

Individual Test Results:
${this.results.map(r => 
  `  ${r.passed ? '✅' : '❌'} ${r.name}
     Processing: ${r.metrics.processingTime.toFixed(2)}ms
     DB Calls: ${r.metrics.databaseCalls}
     Cache Hits: ${(r.metrics.cacheHitRate * 100).toFixed(1)}%`
).join('\n')}

=================================================
`
  }

  exportJSON(): any {
    return {
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        timestamp: new Date()
      },
      results: this.results
    }
  }
}

interface TestResult {
  name: string
  metrics: ProcessorMetrics
  passed: boolean
  timestamp: Date
}

interface ProcessorMetrics {
  processingTime: number
  databaseCalls: number
  apiCalls: number
  cacheHitRate: number
  memoryUsed: number
  timestamp: Date
}

/**
 * Environment setup for integration tests.
 */
export function setupTestEnvironment(): void {
  // Set test environment variables
  process.env.NODE_ENV = 'test'
  process.env.SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  
  // Mock console methods to reduce noise
  global.console.log = jest.fn()
  global.console.info = jest.fn()
  
  // Keep error and warn for debugging
  const originalError = global.console.error
  const originalWarn = global.console.warn
  
  global.console.error = (...args: any[]) => {
    if (!args[0]?.includes('Expected')) {
      originalError(...args)
    }
  }
  
  global.console.warn = (...args: any[]) => {
    if (!args[0]?.includes('Deprecation')) {
      originalWarn(...args)
    }
  }
}

/**
 * Cleanup function for after tests.
 */
export function cleanupTestEnvironment(): void {
  jest.restoreAllMocks()
  jest.clearAllMocks()
}