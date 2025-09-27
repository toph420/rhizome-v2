import { getUserFriendlyError } from '../errors'

describe('Error Message Translation System', () => {
  describe('getUserFriendlyError', () => {
    test('should translate rate limit errors', () => {
      const rateLimitError = new Error('Rate limit exceeded (429)')
      const result = getUserFriendlyError(rateLimitError)
      
      expect(result).toBe('AI service rate limit reached. Will retry automatically in a few minutes.')
    })

    test('should translate rate limit errors with different casing', () => {
      const rateLimitError = new Error('API RATE LIMIT EXCEEDED')
      const result = getUserFriendlyError(rateLimitError)
      
      expect(result).toBe('AI service rate limit reached. Will retry automatically in a few minutes.')
    })

    test('should translate 429 HTTP status errors', () => {
      const httpError = new Error('HTTP 429 Too Many Requests')
      const result = getUserFriendlyError(httpError)
      
      expect(result).toBe('AI service rate limit reached. Will retry automatically in a few minutes.')
    })

    test('should translate PDF corruption errors', () => {
      const pdfError = new Error('Invalid PDF structure detected')
      const result = getUserFriendlyError(pdfError)
      
      expect(result).toBe('PDF file appears corrupted or password-protected. Please try a different file.')
    })

    test('should translate password-protected PDF errors', () => {
      const passwordError = new Error('PDF is password protected')
      const result = getUserFriendlyError(passwordError)
      
      expect(result).toBe('PDF file appears corrupted or password-protected. Please try a different file.')
    })

    test('should translate corrupted file errors', () => {
      const corruptedError = new Error('File appears to be corrupted')
      const result = getUserFriendlyError(corruptedError)
      
      expect(result).toBe('PDF file appears corrupted or password-protected. Please try a different file.')
    })

    test('should translate timeout errors', () => {
      const timeoutError = new Error('Request timed out after 30 seconds')
      const result = getUserFriendlyError(timeoutError)
      
      expect(result).toBe('Request timed out. Will retry automatically.')
    })

    test('should translate different timeout error formats', () => {
      const timeoutError = new Error('Connection timeout occurred')
      const result = getUserFriendlyError(timeoutError)
      
      expect(result).toBe('Request timed out. Will retry automatically.')
    })

    test('should translate quota exceeded errors', () => {
      const quotaError = new Error('API quota exceeded for this project')
      const result = getUserFriendlyError(quotaError)
      
      expect(result).toBe('AI service quota exceeded. Please check your API limits or wait for quota reset.')
    })

    test('should translate quota errors with different wording', () => {
      const quotaError = new Error('Monthly quota has been exceeded')
      const result = getUserFriendlyError(quotaError)
      
      expect(result).toBe('AI service quota exceeded. Please check your API limits or wait for quota reset.')
    })

    test('should translate authentication errors', () => {
      const authError = new Error('Unauthorized access: invalid API key')
      const result = getUserFriendlyError(authError)
      
      expect(result).toBe('Authentication failed. Please check your API key configuration.')
    })

    test('should translate 403 HTTP status errors', () => {
      const forbiddenError = new Error('HTTP 403 Forbidden')
      const result = getUserFriendlyError(forbiddenError)
      
      expect(result).toBe('Authentication failed. Please check your API key configuration.')
    })

    test('should translate not found errors', () => {
      const notFoundError = new Error('Resource not found')
      const result = getUserFriendlyError(notFoundError)
      
      expect(result).toBe('Resource not found. The document or file may have been deleted.')
    })

    test('should translate 404 HTTP status errors', () => {
      const httpError = new Error('HTTP 404 Not Found')
      const result = getUserFriendlyError(httpError)
      
      expect(result).toBe('Resource not found. The document or file may have been deleted.')
    })

    test('should translate network connection errors', () => {
      const networkError = new Error('Network connection failed')
      const result = getUserFriendlyError(networkError)
      
      expect(result).toBe('Network connection error. Will retry automatically.')
    })

    test('should translate ECONNREFUSED errors', () => {
      const connError = new Error('connect ECONNREFUSED 127.0.0.1:443')
      const result = getUserFriendlyError(connError)
      
      expect(result).toBe('Network connection error. Will retry automatically.')
    })

    test('should translate ECONNRESET errors', () => {
      const resetError = new Error('socket hang up ECONNRESET')
      const result = getUserFriendlyError(resetError)
      
      expect(result).toBe('Network connection error. Will retry automatically.')
    })

    test('should translate service unavailable errors', () => {
      const serviceError = new Error('Service temporarily unavailable')
      const result = getUserFriendlyError(serviceError)
      
      expect(result).toBe('Service temporarily unavailable. Will retry automatically.')
    })

    test('should translate 503 HTTP status errors', () => {
      const httpError = new Error('HTTP 503 Service Unavailable')
      const result = getUserFriendlyError(httpError)
      
      expect(result).toBe('Service temporarily unavailable. Will retry automatically.')
    })

    test('should preserve original message for unknown errors', () => {
      const unknownError = new Error('Unexpected custom error occurred')
      const result = getUserFriendlyError(unknownError)
      
      expect(result).toBe('Processing error: Unexpected custom error occurred')
    })

    test('should handle errors with empty messages', () => {
      const emptyError = new Error('')
      const result = getUserFriendlyError(emptyError)
      
      expect(result).toBe('Processing error: ')
    })

    test('should handle multiple error keywords in message', () => {
      // Should match the first applicable pattern (rate limit takes precedence)
      const mixedError = new Error('Rate limit exceeded due to quota being exceeded')
      const result = getUserFriendlyError(mixedError)
      
      expect(result).toBe('AI service rate limit reached. Will retry automatically in a few minutes.')
    })

    test('should be case insensitive for all error types', () => {
      const cases = [
        { error: new Error('RATE LIMIT'), expected: 'AI service rate limit reached. Will retry automatically in a few minutes.' },
        { error: new Error('INVALID PDF'), expected: 'PDF file appears corrupted or password-protected. Please try a different file.' },
        { error: new Error('TIMEOUT'), expected: 'Request timed out. Will retry automatically.' },
        { error: new Error('QUOTA'), expected: 'AI service quota exceeded. Please check your API limits or wait for quota reset.' },
        { error: new Error('UNAUTHORIZED'), expected: 'Authentication failed. Please check your API key configuration.' },
        { error: new Error('NOT FOUND'), expected: 'Resource not found. The document or file may have been deleted.' },
        { error: new Error('NETWORK'), expected: 'Network connection error. Will retry automatically.' },
        { error: new Error('UNAVAILABLE'), expected: 'Service temporarily unavailable. Will retry automatically.' }
      ]

      cases.forEach(({ error, expected }) => {
        expect(getUserFriendlyError(error)).toBe(expected)
      })
    })

    test('should handle complex error messages with context', () => {
      const complexError = new Error('Failed to process document: API rate limit exceeded (429) - retry after 60 seconds')
      const result = getUserFriendlyError(complexError)
      
      expect(result).toBe('AI service rate limit reached. Will retry automatically in a few minutes.')
    })

    test('should prioritize error types correctly', () => {
      // Test error type priority: rate limit should be detected first even if other keywords present
      const priorityTests = [
        {
          error: new Error('Network timeout but rate limit exceeded'),
          expected: 'AI service rate limit reached. Will retry automatically in a few minutes.',
          description: 'Rate limit should take priority over timeout'
        },
        {
          error: new Error('Invalid PDF caused timeout'),
          expected: 'PDF file appears corrupted or password-protected. Please try a different file.',
          description: 'PDF error should take priority over timeout'
        },
        {
          error: new Error('Timeout during network connection'),
          expected: 'Request timed out. Will retry automatically.',
          description: 'Timeout should take priority over network'
        }
      ]

      priorityTests.forEach(({ error, expected, description }) => {
        expect(getUserFriendlyError(error)).toBe(expected)
      })
    })
  })
})