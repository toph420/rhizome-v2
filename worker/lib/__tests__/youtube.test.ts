/**
 * Unit tests for YouTube utility functions.
 * Tests video ID extraction, transcript fetching with retry logic, and markdown formatting.
 */

import { extractVideoId, fetchTranscriptWithRetry, formatTranscriptToMarkdown } from '../youtube'
import { ERROR_PREFIXES } from '../../types/multi-format'
import type { TranscriptSegment } from '../../types/multi-format'

// Mock youtube-transcript-plus library
jest.mock('youtube-transcript-plus', () => ({
  fetchTranscript: jest.fn()
}))

import { fetchTranscript } from 'youtube-transcript-plus'

describe('YouTube Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset any timers
    jest.clearAllTimers()
  })

  describe('extractVideoId', () => {
    it('extracts ID from youtube.com/watch URL', () => {
      const id = extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })

    it('extracts ID from youtu.be short URL', () => {
      const id = extractVideoId('https://youtu.be/dQw4w9WgXcQ')
      expect(id).toBe('dQw4w9WgXcQ')
    })

    it('extracts ID from youtube.com/shorts URL', () => {
      const id = extractVideoId('https://youtube.com/shorts/abc123def45')
      expect(id).toBe('abc123def45')
    })

    it('extracts ID from youtube.com/embed URL', () => {
      const id = extractVideoId('https://youtube.com/embed/xyz789abc12')
      expect(id).toBe('xyz789abc12')
    })

    it('extracts ID from URL with additional query parameters', () => {
      const id = extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s&feature=share')
      expect(id).toBe('dQw4w9WgXcQ')
    })

    it('returns null for invalid YouTube URL', () => {
      const id = extractVideoId('not-a-youtube-url')
      expect(id).toBeNull()
    })

    it('returns null for malformed YouTube URL', () => {
      const id = extractVideoId('https://youtube.com/watch?v=invalid')
      expect(id).toBeNull()
    })

    it('returns null for non-YouTube domain', () => {
      const id = extractVideoId('https://vimeo.com/12345678')
      expect(id).toBeNull()
    })

    it('returns null for empty string', () => {
      const id = extractVideoId('')
      expect(id).toBeNull()
    })
  })

  describe('fetchTranscriptWithRetry', () => {
    it('returns transcript segments for valid video', async () => {
      const mockTranscript = [
        { text: 'Hello world', duration: 2, offset: 0, lang: 'en' },
        { text: 'Welcome to the video', duration: 3, offset: 2, lang: 'en' }
      ]

      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockTranscript)

      const result = await fetchTranscriptWithRetry('dQw4w9WgXcQ')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        text: 'Hello world',
        duration: 2,
        offset: 0,
        lang: 'en'
      })
      expect(fetchTranscript).toHaveBeenCalledWith('dQw4w9WgXcQ')
      expect(fetchTranscript).toHaveBeenCalledTimes(1)
    })

    it('throws structured error for disabled transcripts', async () => {
      const error = new Error('Transcript is disabled for this video')
      ;(fetchTranscript as jest.Mock).mockRejectedValue(error)

      await expect(fetchTranscriptWithRetry('disabled_video_id')).rejects.toThrow(
        ERROR_PREFIXES.YOUTUBE_TRANSCRIPT_DISABLED
      )
    })

    it('throws structured error for unavailable video', async () => {
      const error = new Error('Video unavailable')
      ;(fetchTranscript as jest.Mock).mockRejectedValue(error)

      await expect(fetchTranscriptWithRetry('unavailable_id')).rejects.toThrow(
        ERROR_PREFIXES.YOUTUBE_VIDEO_UNAVAILABLE
      )
    })

    it('throws structured error for private video', async () => {
      const error = new Error('Video is private')
      ;(fetchTranscript as jest.Mock).mockRejectedValue(error)

      await expect(fetchTranscriptWithRetry('private_id')).rejects.toThrow(
        ERROR_PREFIXES.YOUTUBE_VIDEO_UNAVAILABLE
      )
    })

    it('throws structured error for invalid video ID', async () => {
      const error = new Error('Invalid video ID')
      ;(fetchTranscript as jest.Mock).mockRejectedValue(error)

      await expect(fetchTranscriptWithRetry('invalid')).rejects.toThrow(
        ERROR_PREFIXES.YOUTUBE_INVALID_ID
      )
    })

    it('implements exponential backoff retry logic for rate limits', async () => {
      jest.useFakeTimers()
      
      const rateLimitError = new Error('Rate limit exceeded')
      let attemptCount = 0

      ;(fetchTranscript as jest.Mock).mockImplementation(() => {
        attemptCount++
        if (attemptCount < 3) {
          return Promise.reject(rateLimitError)
        }
        return Promise.resolve([{ text: 'Success', duration: 1, offset: 0 }])
      })

      const promise = fetchTranscriptWithRetry('rate_limited_id', 3)
      
      // Fast-forward through retry delays
      await jest.runAllTimersAsync()
      
      const result = await promise

      expect(result).toHaveLength(1)
      expect(attemptCount).toBe(3)
      expect(fetchTranscript).toHaveBeenCalledTimes(3)

      jest.useRealTimers()
    })

    it('respects maxRetries parameter', async () => {
      const error = new Error('Temporary network error')
      ;(fetchTranscript as jest.Mock).mockRejectedValue(error)

      await expect(fetchTranscriptWithRetry('video_id', 1)).rejects.toThrow()

      // Should attempt: initial + 1 retry = 2 total attempts
      expect(fetchTranscript).toHaveBeenCalledTimes(2)
    })

    it('handles network timeout errors as transient', async () => {
      const timeoutError = new Error('Request timed out')
      ;(fetchTranscript as jest.Mock).mockRejectedValue(timeoutError)

      await expect(fetchTranscriptWithRetry('video_id', 0)).rejects.toThrow()
      
      // Verify error is not immediately classified as permanent
      try {
        await fetchTranscriptWithRetry('video_id', 0)
      } catch (error: any) {
        expect(error.message).not.toContain('DISABLED')
        expect(error.message).not.toContain('UNAVAILABLE')
      }
    })

    it('transforms library response to TranscriptSegment type', async () => {
      const mockLibraryResponse = [
        { text: 'Test', duration: 1, offset: 0, lang: 'en', extra_field: 'ignored' }
      ]

      ;(fetchTranscript as jest.Mock).mockResolvedValue(mockLibraryResponse)

      const result = await fetchTranscriptWithRetry('video_id')

      // Should only include TranscriptSegment fields
      expect(result[0]).toEqual({
        text: 'Test',
        duration: 1,
        offset: 0,
        lang: 'en'
      })
      expect(result[0]).not.toHaveProperty('extra_field')
    })
  })

  describe('formatTranscriptToMarkdown', () => {
    const mockTranscript: TranscriptSegment[] = [
      { text: 'Hello world', duration: 2, offset: 0 },
      { text: 'Second segment', duration: 3, offset: 2 },
      { text: 'Third segment', duration: 4, offset: 125 } // 2:05
    ]

    const videoUrl = 'https://youtube.com/watch?v=abc123'

    it('formats transcript with MM:SS timestamps', () => {
      const markdown = formatTranscriptToMarkdown(mockTranscript, videoUrl)

      expect(markdown).toContain('[00:00]')
      expect(markdown).toContain('[00:02]')
      expect(markdown).toContain('[02:05]')
    })

    it('generates correct YouTube deep links', () => {
      const markdown = formatTranscriptToMarkdown(mockTranscript, videoUrl)

      expect(markdown).toContain('https://youtube.com/watch?v=abc123&t=0s')
      expect(markdown).toContain('https://youtube.com/watch?v=abc123&t=2s')
      expect(markdown).toContain('https://youtube.com/watch?v=abc123&t=125s')
    })

    it('formats timestamps as HH:MM:SS for durations >= 1 hour', () => {
      const longTranscript: TranscriptSegment[] = [
        { text: 'Introduction', duration: 5, offset: 0 },
        { text: 'One hour mark', duration: 5, offset: 3600 }, // 1:00:00
        { text: 'Later', duration: 5, offset: 3665 } // 1:01:05
      ]

      const markdown = formatTranscriptToMarkdown(longTranscript, videoUrl)

      expect(markdown).toContain('[00:00]')
      expect(markdown).toContain('[01:00:00]') // Zero-padded hours
      expect(markdown).toContain('[01:01:05]') // Zero-padded hours
    })

    it('preserves transcript text content', () => {
      const markdown = formatTranscriptToMarkdown(mockTranscript, videoUrl)

      expect(markdown).toContain('Hello world')
      expect(markdown).toContain('Second segment')
      expect(markdown).toContain('Third segment')
    })

    it('handles empty transcript array', () => {
      const markdown = formatTranscriptToMarkdown([], videoUrl)

      expect(markdown).toBe('')
    })

    it('formats transcript with proper line breaks', () => {
      const markdown = formatTranscriptToMarkdown(mockTranscript, videoUrl)

      // Should have multiple lines
      const lines = markdown.trim().split('\n').filter(line => line.trim())
      expect(lines.length).toBeGreaterThan(0)
    })

    it('handles transcript with missing lang field', () => {
      const transcriptWithoutLang: TranscriptSegment[] = [
        { text: 'No language specified', duration: 2, offset: 0 }
      ]

      const markdown = formatTranscriptToMarkdown(transcriptWithoutLang, videoUrl)

      expect(markdown).toContain('No language specified')
      expect(markdown).toContain('[00:00]')
    })

    it('creates clickable markdown links for timestamps', () => {
      const markdown = formatTranscriptToMarkdown(mockTranscript, videoUrl)

      // Check markdown link format: [timestamp](url)
      expect(markdown).toMatch(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]\(https:\/\/youtube\.com\/watch\?v=\w+&t=\d+s\)/)
    })
  })
})