import '@testing-library/jest-dom'

// Mock Next.js environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Mock crypto.randomUUID for tests
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9)
  } as Crypto
}

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = jest.fn()
}

// Mock TextEncoder/TextDecoder for jsdom
if (!global.TextEncoder) {
  global.TextEncoder = require('util').TextEncoder
  global.TextDecoder = require('util').TextDecoder
}