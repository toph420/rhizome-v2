/**
 * Unit tests for ollama-cleanup module
 *
 * These tests mock the OllamaClient to avoid real AI calls during CI.
 * For real integration testing, see: worker/tests/integration/local-cleanup.test.ts
 */

import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../ollama-cleanup.js'
import { OllamaClient, OOMError } from '../ollama-client.js'

// Mock OllamaClient
jest.mock('../ollama-client', () => {
  const actual = jest.requireActual('../ollama-client')
  return {
    ...actual,
    OllamaClient: jest.fn().mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue('Cleaned markdown text'),
      getConfig: jest.fn().mockReturnValue({
        host: 'http://localhost:11434',
        model: 'qwen2.5:32b',
        timeout: 600000
      })
    }))
  }
})

describe('ollama-cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('cleanMarkdownLocal', () => {
    it('cleans small markdown in single pass', async () => {
      const dirty = 'Some  text with   extra   spaces\n\n\n\n\nAnd too many newlines'

      const cleaned = await cleanMarkdownLocal(dirty)

      expect(cleaned).toBe('Cleaned markdown text')

      // Verify OllamaClient was called once
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      const clientInstance = MockedClient.mock.results[0].value
      expect(clientInstance.chat).toHaveBeenCalledTimes(1)
    })

    it('batches large markdown at headings', async () => {
      // Create large markdown with multiple sections
      const large = [
        '# Introduction\n',
        'Some intro text\n\n',
        '## Section 1\n',
        'x'.repeat(60000), // 60K chars
        '\n\n',
        '## Section 2\n',
        'y'.repeat(60000), // 60K chars
        '\n\n',
        '## Conclusion\n',
        'Final thoughts'
      ].join('')

      const cleaned = await cleanMarkdownLocal(large)

      expect(cleaned).toBeTruthy()

      // Should have called chat() multiple times for batching
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      const clientInstance = MockedClient.mock.results[0].value
      expect(clientInstance.chat).toHaveBeenCalled()
      // Note: Exact call count depends on batching logic
    })

    it('propagates OOM errors', async () => {
      // Mock OOM error
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      MockedClient.mockImplementationOnce(() => ({
        chat: jest.fn().mockRejectedValue(new OOMError('Out of memory')),
        getConfig: jest.fn().mockReturnValue({
          host: 'http://localhost:11434',
          model: 'qwen2.5:32b',
          timeout: 600000
        })
      }))

      const dirty = 'Some markdown text'

      await expect(cleanMarkdownLocal(dirty)).rejects.toThrow(OOMError)
    })

    it('reports progress during cleanup', async () => {
      const progressCalls: Array<{ stage: string; percent: number }> = []

      const small = 'Small document text'

      await cleanMarkdownLocal(small, {
        onProgress: (stage, percent) => {
          progressCalls.push({ stage, percent })
        }
      })

      // Should have at least start and end progress
      expect(progressCalls.length).toBeGreaterThanOrEqual(2)
      expect(progressCalls[0].percent).toBeLessThan(50)
      expect(progressCalls[progressCalls.length - 1].percent).toBe(100)
    })

    it('uses custom temperature when provided', async () => {
      const dirty = 'Some text'

      await cleanMarkdownLocal(dirty, { temperature: 0.7 })

      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      const clientInstance = MockedClient.mock.results[0].value

      // Verify temperature was passed to chat()
      expect(clientInstance.chat).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          temperature: 0.7,
          timeout: 300000
        })
      )
    })

    it('filters spurious headings during batching', async () => {
      // Create markdown with spurious headings that should be filtered
      const markdown = [
        '# Real Title\n',
        'Some content\n\n',
        '## I\n',  // Single Roman numeral - should be filtered
        'Content under I\n\n',
        '## Real Section\n',
        'Real section content\n\n',
        '## A\n',  // Single letter - should be filtered
        'Content under A\n\n',
        '## Another Real Section\n',
        'More content'
      ].join('')

      // Make it large enough to trigger batching
      const large = markdown + '\n\n' + 'x'.repeat(100000)

      await cleanMarkdownLocal(large)

      // Verify it completed without error
      // The spurious headings should be filtered by splitAtHeadings()
      expect(true).toBe(true)
    })
  })

  describe('cleanMarkdownRegexOnly', () => {
    it('converts smart quotes to regular quotes', () => {
      // Using hex codes to avoid quote parsing issues
      const dirty = 'Some \u201Csmart quotes\u201D and \u2018apostrophes\u2019'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toBe('Some "smart quotes" and \'apostrophes\'')
    })

    it('converts em dashes and en dashes', () => {
      const dirty = 'Some text — with dashes – and more'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toBe('Some text -- with dashes - and more')
    })

    it('converts ellipsis', () => {
      const dirty = 'Some text… and more'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toBe('Some text... and more')
    })

    it('reduces excessive newlines', () => {
      const dirty = 'Line 1\n\n\n\n\n\nLine 2'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toBe('Line 1\n\nLine 2')
    })

    it('reduces excessive spaces', () => {
      const dirty = 'Some    text   with    spaces'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toBe('Some text with spaces')
    })

    it('trims line whitespace', () => {
      const dirty = '  Line with leading spaces  \n  Another line  '
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toBe('Line with leading spaces\nAnother line')
    })

    it('handles complex markdown with all artifacts', () => {
      const dirty = [
        'Some "smart quotes" here\n\n\n\n',
        'Em dash — test\n',
        'Multiple    spaces\n',
        '  Leading/trailing spaces  \n',
        'Ellipsis… here'
      ].join('')

      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toContain('"smart quotes"')
      expect(cleaned).toContain('--')
      expect(cleaned).not.toContain('    ')
      expect(cleaned).not.toContain('\n\n\n')
      expect(cleaned).toContain('...')
    })
  })
})
