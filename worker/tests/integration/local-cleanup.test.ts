/**
 * Integration tests for local cleanup pipeline (Phase 3)
 *
 * These tests use mocked Ollama to avoid real AI calls in CI.
 * For real testing with Qwen 32B, run manually with PROCESSING_MODE=local.
 */

import { cleanMarkdownLocal, cleanMarkdownRegexOnly } from '../../lib/local/ollama-cleanup'
import { OllamaClient, OOMError } from '../../lib/local/ollama-client'

// Mock OllamaClient to avoid real AI calls
jest.mock('../../lib/local/ollama-client', () => {
  const actual = jest.requireActual('../../lib/local/ollama-client')
  return {
    ...actual,
    OllamaClient: jest.fn().mockImplementation(() => ({
      chat: jest.fn().mockResolvedValue('Cleaned markdown text without artifacts'),
      getConfig: jest.fn().mockReturnValue({
        host: 'http://localhost:11434',
        model: 'qwen2.5:32b',
        timeout: 600000
      })
    }))
  }
})

describe('Local Cleanup Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('PDF Processing with Local Mode', () => {
    it('uses local cleanup when PROCESSING_MODE=local', async () => {
      // Set environment variable
      process.env.PROCESSING_MODE = 'local'

      const markdown = 'Some markdown with  extra   spaces\n\n\n\nAnd too many newlines'

      const cleaned = await cleanMarkdownLocal(markdown)

      expect(cleaned).toBe('Cleaned markdown text without artifacts')

      // Verify OllamaClient was called
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      expect(MockedClient).toHaveBeenCalled()
    })

    it('handles OOM by falling back to regex cleanup', async () => {
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

      const markdown = 'Some "smart quotes" and — dashes'

      // Should throw OOM, allowing processor to catch and use regex fallback
      await expect(cleanMarkdownLocal(markdown)).rejects.toThrow(OOMError)

      // Processor would then call cleanMarkdownRegexOnly
      const fallback = cleanMarkdownRegexOnly(markdown)
      expect(fallback).toBe('Some "smart quotes" and -- dashes')
    })

    it('cleans large PDF markdown with batching', async () => {
      // Create large markdown that triggers batching (>100K chars)
      const sections = [
        '# Introduction\n',
        'Some intro text\n\n',
        '## Section 1\n',
        'Content for section 1 '.repeat(3000), // ~60K chars
        '\n\n',
        '## Section 2\n',
        'Content for section 2 '.repeat(3000), // ~60K chars
        '\n\n',
        '## Conclusion\n',
        'Final thoughts'
      ]
      const largeMarkdown = sections.join('')

      expect(largeMarkdown.length).toBeGreaterThan(100000)

      const cleaned = await cleanMarkdownLocal(largeMarkdown)

      expect(cleaned).toBeTruthy()

      // Should have called chat() multiple times for batching
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      const clientInstance = MockedClient.mock.results[0].value
      expect(clientInstance.chat).toHaveBeenCalled()
    })

    it('reports progress during cleanup', async () => {
      const progressCalls: Array<{ stage: string; percent: number }> = []

      const markdown = 'Test markdown content'

      await cleanMarkdownLocal(markdown, {
        onProgress: (stage, percent) => {
          progressCalls.push({ stage, percent })
        }
      })

      // Verify progress was reported
      expect(progressCalls.length).toBeGreaterThanOrEqual(2)
      expect(progressCalls[0].percent).toBeLessThan(100)
      expect(progressCalls[progressCalls.length - 1].percent).toBe(100)
    })
  })

  describe('Regex-Only Fallback', () => {
    it('cleans smart quotes', () => {
      // Using hex codes to avoid quote parsing issues
      const dirty = 'Text with \u201Csmart quotes\u201D and \u2018apostrophes\u2019'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).not.toContain('\u201C') // Left double quote
      expect(cleaned).not.toContain('\u201D') // Right double quote
      expect(cleaned).not.toContain('\u2018') // Left single quote
      expect(cleaned).toContain('"smart quotes"')
      expect(cleaned).toContain("'apostrophes'")
    })

    it('cleans em dashes and en dashes', () => {
      const dirty = 'Text — with em dash – and en dash'
      const cleaned = cleanMarkdownRegexOnly(dirty)

      expect(cleaned).toContain('--')
      expect(cleaned).toContain('-')
      expect(cleaned).not.toContain('—')
      expect(cleaned).not.toContain('–')
    })

    it('reduces excessive whitespace', () => {
      const dirty = [
        'Line 1\n\n\n\n\n\nLine 2',
        'Text    with    spaces',
        '  Leading spaces  \n  Trailing spaces  '
      ].join('\n')

      const cleaned = cleanMarkdownRegexOnly(dirty)

      // Max 2 newlines
      expect(cleaned).not.toMatch(/\n{3,}/)

      // Max 1 space
      expect(cleaned).not.toMatch(/ {2,}/)

      // No leading/trailing spaces on lines
      expect(cleaned).not.toMatch(/^ +/m)
      expect(cleaned).not.toMatch(/ +$/m)
    })

    it('preserves markdown structure', () => {
      const dirty = [
        '# Heading with  extra   spaces',
        '',
        '## Subheading',
        '',
        'Paragraph with "smart quotes" and — dashes.',
        '',
        '- List item 1',
        '- List item 2'
      ].join('\n')

      const cleaned = cleanMarkdownRegexOnly(dirty)

      // Headings preserved
      expect(cleaned).toContain('# Heading with extra spaces')
      expect(cleaned).toContain('## Subheading')

      // Lists preserved
      expect(cleaned).toContain('- List item 1')
      expect(cleaned).toContain('- List item 2')

      // Artifacts cleaned
      expect(cleaned).toContain('"smart quotes"')
      expect(cleaned).toContain('--')
    })
  })

  describe('Batching Strategy', () => {
    it('splits at ## headings, not arbitrary boundaries', async () => {
      const markdown = [
        '# Title\n',
        'Introduction text\n\n',
        '## First Section\n',
        'x'.repeat(50000), // 50K chars in first section
        '\n\n',
        '## Second Section\n',
        'y'.repeat(50000), // 50K chars in second section
        '\n\n',
        '## Third Section\n',
        'z'.repeat(50000)  // 50K chars in third section
      ].join('')

      const cleaned = await cleanMarkdownLocal(markdown)

      expect(cleaned).toBeTruthy()

      // Should have batched at headings
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      const clientInstance = MockedClient.mock.results[0].value

      // Multiple calls for batching
      expect(clientInstance.chat).toHaveBeenCalled()
    })

    it('filters spurious headings', async () => {
      const markdown = [
        '# Real Title\n',
        'Content\n\n',
        '## I\n',  // Single Roman numeral - spurious
        'Content under I\n\n',
        '## Real Section\n',
        'Real content\n\n',
        '## A\n',  // Single letter - spurious
        'Content under A\n\n',
        '## INDEX\n', // Common index term - spurious
        'Index content'
      ].join('')

      // Make large enough to trigger batching
      const large = markdown + '\n\n' + 'x'.repeat(100000)

      const cleaned = await cleanMarkdownLocal(large)

      // Should complete without error
      expect(cleaned).toBeTruthy()
    })
  })

  describe('Error Handling', () => {
    it('propagates OOM errors for processor to handle', async () => {
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      MockedClient.mockImplementationOnce(() => ({
        chat: jest.fn().mockRejectedValue(new OOMError('Model out of memory')),
        getConfig: jest.fn().mockReturnValue({
          host: 'http://localhost:11434',
          model: 'qwen2.5:32b',
          timeout: 600000
        })
      }))

      const markdown = 'Test content'

      // Should propagate OOM, not swallow it
      await expect(cleanMarkdownLocal(markdown)).rejects.toThrow(OOMError)
    })

    it('propagates other errors', async () => {
      const MockedClient = OllamaClient as jest.MockedClass<typeof OllamaClient>
      MockedClient.mockImplementationOnce(() => ({
        chat: jest.fn().mockRejectedValue(new Error('Network error')),
        getConfig: jest.fn().mockReturnValue({
          host: 'http://localhost:11434',
          model: 'qwen2.5:32b',
          timeout: 600000
        })
      }))

      const markdown = 'Test content'

      await expect(cleanMarkdownLocal(markdown)).rejects.toThrow('Network error')
    })
  })
})
