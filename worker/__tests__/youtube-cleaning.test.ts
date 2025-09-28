import { describe, test, expect, jest } from '@jest/globals'
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning'
import { GoogleGenAI } from '@google/genai'

/**
 * Test suite for YouTube transcript cleaning module.
 * Uses mocked GoogleGenAI client for deterministic testing.
 */

// Mock GoogleGenAI client
const createMockAI = (mockResponse: string | null, shouldThrow = false) => {
  const mockGenerateContent = jest.fn(async () => {
    if (shouldThrow) {
      throw new Error('AI API error')
    }
    return {
      text: mockResponse
    }
  })

  return {
    models: {
      generateContent: mockGenerateContent
    }
  } as unknown as GoogleGenAI
}

describe('YouTube Cleaning - Successful Cleaning', () => {
  test('removes timestamp links successfully', async () => {
    const rawMarkdown = `## Introduction

[[00:15](https://youtube.com/watch?v=test&t=15s)] Welcome to this video about TypeScript.

[[01:30](https://youtube.com/watch?v=test&t=90s)] Let's discuss the basics of type safety.`

    // Cleaned version: Similar length (within 0.5x-1.5x ratio)
    const cleanedMarkdown = `## Introduction

Welcome to this video about TypeScript. This is a great introduction to the language.

Let's discuss the basics of type safety and how it helps.`

    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toBe(cleanedMarkdown)
    expect(result.error).toBeUndefined()
    expect(result.cleaned).not.toContain('[[')
    expect(result.cleaned).not.toContain('youtube.com')
  })

  test('preserves content when no timestamps present', async () => {
    const rawMarkdown = 'This is a transcript without timestamps. [[00:15](https://youtube.com/watch?v=test&t=15s)] It covers topics. [[00:30](https://youtube.com/watch?v=test&t=30s)] More content here.'

    const cleanedMarkdown = 'This is a transcript without timestamps.  It covers topics.  More content here.'

    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).not.toContain('[[')
    expect(result.cleaned).not.toContain(']]')
  })

  test('preserves filler words while fixing formatting', async () => {
    const rawMarkdown = 'Um, like [[00:05](https://youtube.com/watch?v=test&t=5s)]\n\nyou know, this is,\n\nuh, a test [[00:10](https://youtube.com/watch?v=test&t=10s)] with filler words.'

    const cleanedMarkdown = 'Um, like you know, this is, uh, a test with filler words.'

    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toContain('Um')
    expect(result.cleaned).toContain('like')
    expect(result.cleaned).toContain('you know')
    expect(result.cleaned).toContain('uh')
    expect(result.cleaned).not.toContain('[[')
    expect(result.cleaned).not.toContain('\n\n') // Line breaks should be fixed
  })

  test('decodes HTML entities and fixes line breaks', async () => {
    const rawMarkdown = '&amp;gt;&amp;gt; So, all radical movements\n\nare built on [[00:15](url)]\n\nquote unquote the blood of martyrs'

    const cleanedMarkdown = '>> So, all radical movements are built on quote unquote the blood of martyrs'

    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toContain('>>')
    expect(result.cleaned).not.toContain('&amp;')
    expect(result.cleaned).not.toContain('[[')
    // Verify it's a single flowing sentence, not broken up
    expect(result.cleaned.split('\n\n').length).toBe(1)
  })
})

describe('YouTube Cleaning - Graceful Degradation', () => {
  test('returns original on empty AI response', async () => {
    const rawMarkdown = 'Original transcript content.'

    const mockAI = createMockAI('') // Empty response
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe(rawMarkdown)
    expect(result.error).toBe('AI returned empty response')
  })

  test('returns original on AI API exception', async () => {
    const rawMarkdown = 'Original transcript content.'

    const mockAI = createMockAI(null, true) // Will throw
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe(rawMarkdown)
    expect(result.error).toBe('AI API error')
  })

  test('returns original on suspicious length change', async () => {
    const rawMarkdown = 'This is a 100 character transcript that should not shrink dramatically without good reason here.'

    // AI returns something 3x longer (>1.5x threshold)
    const tooLongResponse = rawMarkdown.repeat(3)
    const mockAI = createMockAI(tooLongResponse)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe(rawMarkdown)
    expect(result.error).toContain('Suspicious length change')
    expect(result.error).toContain('3.00x')
  })

  test('returns original when cleaned text too short', async () => {
    const rawMarkdown = 'This is a 100 character transcript that should not shrink dramatically without good reason here.'

    // AI returns something <50% of original length
    const tooShortResponse = 'Short.'
    const mockAI = createMockAI(tooShortResponse)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe(rawMarkdown)
    expect(result.error).toContain('Suspicious length change')
  })
})

describe('YouTube Cleaning - Edge Cases', () => {
  test('handles empty input gracefully', async () => {
    const mockAI = createMockAI('Should not be called')
    const result = await cleanYoutubeTranscript(mockAI, '')

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe('')
    expect(result.error).toBe('Empty transcript provided')
  })

  test('handles whitespace-only input', async () => {
    const mockAI = createMockAI('Should not be called')
    const result = await cleanYoutubeTranscript(mockAI, '   \n\t  ')

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe('   \n\t  ')
    expect(result.error).toBe('Empty transcript provided')
  })

  test('handles very short transcripts', async () => {
    const rawMarkdown = 'Hi there! [[00:01](https://youtube.com/watch?v=test&t=1s)]'

    const cleanedMarkdown = 'Hi there! '
    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toBe(cleanedMarkdown)
  })

  test('handles transcripts with special characters', async () => {
    const rawMarkdown = 'Transcript with special chars: <>&"\'`~@#$%^&*()'

    const cleanedMarkdown = 'Transcript with special chars: <>&"\'`~@#$%^&*()'
    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toBe(cleanedMarkdown)
    // Verify special chars preserved
    expect(result.cleaned).toContain('<>&')
    expect(result.cleaned).toContain('#$%')
  })
})

describe('YouTube Cleaning - Length Validation', () => {
  test('accepts low length ratio when many timestamps present', async () => {
    // Simulate high timestamp density (timestamps = 60% of content)
    const timestamps = Array(50).fill('[[00:15](https://youtube.com/watch?v=abc123&t=15s)]').join(' ')
    const content = 'Some actual spoken content here. '.repeat(10)
    const rawMarkdown = timestamps + ' ' + content // ~4200 chars total, ~3500 timestamps

    const cleanedMarkdown = content // ~330 chars (only 8% of original)
    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toBe(cleanedMarkdown)
  })

  test('rejects when cleaned text exceeds original length', async () => {
    const rawMarkdown = 'Short text [[00:15](url)]' // 25 chars

    const cleanedMarkdown = 'AI hallucinated extra content that was not in the original transcript' // 70 chars > original
    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe(rawMarkdown)
    expect(result.error).toContain('Suspicious length change')
  })

  test('rejects when AI removes too much content (not just timestamps)', async () => {
    const rawMarkdown = 'Here is some actual spoken content [[00:15](url)] and more content [[00:20](url)] continuing.' // ~95 chars

    const cleanedMarkdown = 'short' // 5 chars - AI removed content, not just timestamps
    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(false)
    expect(result.cleaned).toBe(rawMarkdown)
    expect(result.error).toContain('Suspicious length change')
  })

  test('accepts moderate timestamp density with proper cleaning', async () => {
    const rawMarkdown = 'Spoken text here [[00:05](url)] more text [[00:10](url)] final part' // ~70 chars

    const cleanedMarkdown = 'Spoken text here  more text  final part' // ~40 chars (57% of original)
    const mockAI = createMockAI(cleanedMarkdown)
    const result = await cleanYoutubeTranscript(mockAI, rawMarkdown)

    expect(result.success).toBe(true)
    expect(result.cleaned).toBe(cleanedMarkdown)
  })
})

describe('YouTube Cleaning - No Exceptions', () => {
  test('never throws exceptions on any error', async () => {
    const inputs: string[] = [
      '', // Empty
      'Normal text', // Valid
      'A'.repeat(10000), // Very long
      '\n\n\n' // Only newlines
    ]

    for (const input of inputs) {
      const mockAI = createMockAI(null, true) // Always throws
      // Should not throw - function handles all errors
      await expect(
        cleanYoutubeTranscript(mockAI, input)
      ).resolves.toBeDefined()
    }
  })

  test('always returns CleaningResult structure', async () => {
    const mockAI = createMockAI(null, true) // Will throw
    const result = await cleanYoutubeTranscript(mockAI, 'test')

    expect(result).toHaveProperty('cleaned')
    expect(result).toHaveProperty('success')
    expect(typeof result.cleaned).toBe('string')
    expect(typeof result.success).toBe('boolean')
  })
})