/**
 * Jest setup file for worker module tests
 * 
 * Configures global test environment, mocks, and utilities
 */

// Ensure jest globals are available
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals'

// Make globals available
global.jest = jest
global.describe = describe
global.it = it
global.expect = expect
global.beforeEach = beforeEach
global.afterEach = afterEach

// Add console polyfills for better error reporting
if (!global.console) {
  global.console = console
}

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.GOOGLE_AI_API_KEY = 'test-google-api-key'
process.env.GEMINI_MODEL = 'gemini-2.5-flash-lite'

// Global test utilities
global.setupMockChain = () => {
  const chain = {
    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    order: jest.fn().mockResolvedValue({ data: [], error: null }),
    limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    or: jest.fn().mockResolvedValue({ data: [], error: null }),
    in: jest.fn().mockReturnValue({
      order: jest.fn().mockResolvedValue({ data: [], error: null })
    })
  }
  // Make methods return the chain for chaining
  chain.eq.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

// Increase timeout for integration tests
jest.setTimeout(30000)