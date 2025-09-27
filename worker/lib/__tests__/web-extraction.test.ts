/**
 * Unit tests for web article extraction utilities.
 * Tests URL validation, article content extraction with Readability, and HTML sanitization.
 */

import { isValidUrl, extractArticle, sanitizeHtml } from '../web-extraction'
import { ERROR_PREFIXES } from '../../types/multi-format'
import type { Article } from '../../types/multi-format'

// Mock external dependencies
jest.mock('axios')
jest.mock('jsdom')
jest.mock('@mozilla/readability')

import axios from 'axios'
import { JSDOM } from 'jsdom'
import { Readability, isProbablyReaderable } from '@mozilla/readability'

describe('Web Extraction Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('isValidUrl', () => {
    it('returns true for valid HTTP URL', () => {
      expect(isValidUrl('http://example.com')).toBe(true)
    })

    it('returns true for valid HTTPS URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true)
    })

    it('returns true for URL with path and query', () => {
      expect(isValidUrl('https://example.com/article?id=123')).toBe(true)
    })

    it('returns true for localhost URL', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true)
    })

    it('returns false for invalid string', () => {
      expect(isValidUrl('not-a-url')).toBe(false)
    })

    it('returns false for FTP URL', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false)
    })

    it('returns false for file protocol', () => {
      expect(isValidUrl('file:///path/to/file')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isValidUrl('')).toBe(false)
    })

    it('returns false for malformed URL', () => {
      expect(isValidUrl('ht tp://example.com')).toBe(false)
    })

    it('does not throw exception for invalid input', () => {
      expect(() => isValidUrl('completely-invalid')).not.toThrow()
    })
  })

  describe('extractArticle', () => {
    const mockArticleHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Article</title></head>
        <body>
          <article>
            <h1>Test Article Title</h1>
            <p>This is test article content.</p>
          </article>
        </body>
      </html>
    `

    const mockArticle: Article = {
      title: 'Test Article Title',
      content: '<article><h1>Test Article Title</h1><p>This is test article content.</p></article>',
      textContent: 'Test Article Title This is test article content.',
      excerpt: 'This is test article',
      byline: 'Test Author',
      siteName: 'Test Site',
      lang: 'en'
    }

    it('successfully extracts article from valid URL', async () => {
      // Mock axios response
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: mockArticleHtml,
        headers: {}
      })

      // Mock JSDOM with close method
      const mockWindow = {
        document: {
          querySelector: jest.fn()
        },
        close: jest.fn()
      }
      ;(JSDOM as any).mockImplementation(() => ({
        window: mockWindow
      }))

      // Mock Readability
      ;(isProbablyReaderable as jest.Mock).mockReturnValue(true)
      ;(Readability as any).mockImplementation(() => ({
        parse: () => mockArticle
      }))

      const result = await extractArticle('https://example.com/article')

      expect(result).toEqual(mockArticle)
      expect(axios.get).toHaveBeenCalledWith(
        'https://example.com/article',
        expect.objectContaining({
          timeout: 10000,
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('RhizomeBot')
          })
        })
      )
    })

    it('throws error with WEB_NOT_FOUND prefix for 404 status', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 404,
        data: 'Not Found'
      })

      await expect(extractArticle('https://example.com/missing')).rejects.toThrow(
        ERROR_PREFIXES.WEB_NOT_FOUND
      )
    })

    it('throws error with WEB_PAYWALL prefix for 403 status', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 403,
        data: 'Forbidden'
      })

      const error = await extractArticle('https://example.com/paywalled').catch(e => e)
      expect(error.message).toContain(ERROR_PREFIXES.WEB_PAYWALL)
      expect(error.message).toContain('archive.ph')
    })

    it('throws error with WEB_TIMEOUT prefix for timeout', async () => {
      const timeoutError: any = new Error('timeout of 10000ms exceeded')
      timeoutError.code = 'ECONNABORTED'
      ;(axios.get as jest.Mock).mockRejectedValue(timeoutError)

      const error = await extractArticle('https://example.com/slow').catch(e => e)
      expect(error.message).toContain(ERROR_PREFIXES.WEB_TIMEOUT)
      expect(error.message).toContain('10 seconds')
    })

    it('throws error with WEB_NETWORK_ERROR prefix for ENOTFOUND', async () => {
      const networkError: any = new Error('getaddrinfo ENOTFOUND')
      networkError.code = 'ENOTFOUND'
      ;(axios.get as jest.Mock).mockRejectedValue(networkError)

      await expect(extractArticle('https://nonexistent-domain.invalid')).rejects.toThrow(
        ERROR_PREFIXES.WEB_NETWORK_ERROR
      )
    })

    it('throws error with WEB_NETWORK_ERROR prefix for ECONNREFUSED', async () => {
      const connectionError: any = new Error('connect ECONNREFUSED')
      connectionError.code = 'ECONNREFUSED'
      ;(axios.get as jest.Mock).mockRejectedValue(connectionError)

      await expect(extractArticle('https://example.com')).rejects.toThrow(
        ERROR_PREFIXES.WEB_NETWORK_ERROR
      )
    })

    it('throws error with WEB_NETWORK_ERROR prefix for ECONNRESET', async () => {
      const resetError: any = new Error('socket hang up')
      resetError.code = 'ECONNRESET'
      ;(axios.get as jest.Mock).mockRejectedValue(resetError)

      await expect(extractArticle('https://example.com')).rejects.toThrow(
        ERROR_PREFIXES.WEB_NETWORK_ERROR
      )
    })

    it('throws error with WEB_NOT_ARTICLE prefix for non-article page', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: '<html><body><nav>Menu</nav><div>Not an article</div></body></html>'
      })

      const mockWindow = {
        document: {
          querySelector: jest.fn()
        },
        close: jest.fn()
      }
      ;(JSDOM as any).mockImplementation(() => ({
        window: mockWindow
      }))

      // Mock Readability to indicate page is not readable
      ;(isProbablyReaderable as jest.Mock).mockReturnValue(false)

      await expect(extractArticle('https://example.com/homepage')).rejects.toThrow(
        ERROR_PREFIXES.WEB_NOT_ARTICLE
      )
    })

    it('throws error with INVALID_URL prefix for invalid URL format', async () => {
      await expect(extractArticle('not-a-url')).rejects.toThrow(
        ERROR_PREFIXES.INVALID_URL
      )
    })

    it('sets appropriate User-Agent header', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: mockArticleHtml
      })

      const mockWindow = {
        document: {
          querySelector: jest.fn()
        },
        close: jest.fn()
      }
      ;(JSDOM as any).mockImplementation(() => ({
        window: mockWindow
      }))

      ;(isProbablyReaderable as jest.Mock).mockReturnValue(true)
      ;(Readability as any).mockImplementation(() => ({
        parse: () => mockArticle
      }))

      await extractArticle('https://example.com/article')

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('RhizomeBot')
          })
        })
      )
    })

    it('handles 500 server errors', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 500,
        data: 'Internal Server Error'
      })

      await expect(extractArticle('https://example.com/broken')).rejects.toThrow('HTTP 500')
    })

    it('respects 10 second timeout setting', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: mockArticleHtml
      })

      const mockWindow = {
        document: {
          querySelector: jest.fn()
        },
        close: jest.fn()
      }
      ;(JSDOM as any).mockImplementation(() => ({
        window: mockWindow
      }))

      ;(isProbablyReaderable as jest.Mock).mockReturnValue(true)
      ;(Readability as any).mockImplementation(() => ({
        parse: () => mockArticle
      }))

      await extractArticle('https://example.com/article')

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeout: 10000
        })
      )
    })

    it('follows redirects with maxRedirects setting', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: mockArticleHtml
      })

      const mockWindow = {
        document: {
          querySelector: jest.fn()
        },
        close: jest.fn()
      }
      ;(JSDOM as any).mockImplementation(() => ({
        window: mockWindow
      }))

      ;(isProbablyReaderable as jest.Mock).mockReturnValue(true)
      ;(Readability as any).mockImplementation(() => ({
        parse: () => mockArticle
      }))

      await extractArticle('https://example.com/redirect')

      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          maxRedirects: 5
        })
      )
    })
  })

  describe('sanitizeHtml', () => {
    it('removes script tags from HTML', () => {
      const dirtyHtml = '<div>Content<script>alert("xss")</script></div>'
      const clean = sanitizeHtml(dirtyHtml)

      expect(clean).not.toContain('<script>')
      expect(clean).not.toContain('alert')
      expect(clean).toContain('Content')
    })

    it('removes event handlers from HTML', () => {
      const dirtyHtml = '<div onclick="malicious()">Click me</div>'
      const clean = sanitizeHtml(dirtyHtml)

      expect(clean).not.toContain('onclick')
      expect(clean).toContain('Click me')
    })

    it('removes onerror handlers from HTML', () => {
      const dirtyHtml = '<img src="x" onerror="malicious()" />'
      const clean = sanitizeHtml(dirtyHtml)

      expect(clean).not.toContain('onerror')
    })

    it('preserves safe HTML elements', () => {
      const safeHtml = '<p>Paragraph</p><h1>Heading</h1><a href="/safe">Link</a>'
      const clean = sanitizeHtml(safeHtml)

      expect(clean).toContain('<p>')
      expect(clean).toContain('<h1>')
      expect(clean).toContain('href')
    })

    it('handles empty string input', () => {
      const clean = sanitizeHtml('')
      expect(clean).toBe('')
    })

    it('handles HTML without dangerous content', () => {
      const safeHtml = '<article><h1>Title</h1><p>Content</p></article>'
      const clean = sanitizeHtml(safeHtml)

      expect(clean).toBe(safeHtml)
    })

    it('removes multiple script tags', () => {
      const dirtyHtml = '<div><script>bad1()</script>Text<script>bad2()</script></div>'
      const clean = sanitizeHtml(dirtyHtml)

      expect(clean).not.toContain('<script>')
      expect(clean).toContain('Text')
    })

    it('handles nested HTML structures', () => {
      const html = '<div><p>Outer<span>Inner</span></p></div>'
      const clean = sanitizeHtml(html)

      expect(clean).toContain('Outer')
      expect(clean).toContain('Inner')
    })
  })
})