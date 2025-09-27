import axios from 'axios'
import { JSDOM } from 'jsdom'
import { Readability, isProbablyReaderable } from '@mozilla/readability'
import type { Article } from '../types/multi-format'
import { ERROR_PREFIXES } from '../types/multi-format'

/**
 * Validates if a string is a valid HTTP/HTTPS URL.
 * Uses the URL constructor for robust validation without throwing.
 * 
 * @param url - String to validate as URL
 * @returns True if valid HTTP/HTTPS URL, false otherwise
 * 
 * @example
 * isValidUrl('https://example.com') // true
 * isValidUrl('http://localhost:3000') // true
 * isValidUrl('not-a-url') // false
 * isValidUrl('ftp://example.com') // false
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Extracts article content from a web URL using Mozilla Readability algorithm.
 * Handles paywalls, 404s, timeouts, and non-article pages gracefully.
 * 
 * Timeout: 10 seconds
 * User-Agent: Identifies as Rhizome bot for ethical scraping
 * 
 * @param url - Web article URL to extract content from
 * @returns Article object with cleaned content and metadata
 * @throws {Error} With prefixed error message for UI routing:
 *   - WEB_NOT_FOUND: HTTP 404 or resource doesn't exist
 *   - WEB_PAYWALL: HTTP 403 or paywall detected (suggests archive.ph)
 *   - WEB_TIMEOUT: Request exceeded 10-second timeout
 *   - WEB_NETWORK_ERROR: Network connection failed
 *   - WEB_NOT_ARTICLE: Page is not an article (homepage, search results, etc.)
 * 
 * @example
 * const article = await extractArticle('https://example.com/article')
 * console.log(article.title) // "Article Title"
 * console.log(article.textContent) // "Plain text content..."
 */
export async function extractArticle(url: string): Promise<Article> {
  // Validate URL format first
  if (!isValidUrl(url)) {
    throw new Error(`${ERROR_PREFIXES.INVALID_URL}: Invalid URL format: ${url}`)
  }

  let response
  try {
    // Fetch HTML with timeout and bot identification
    response = await axios.get(url, {
      timeout: 10000, // 10 seconds
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RhizomeBot/2.0; +https://rhizome.app/bot)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Handle 4xx errors manually
    })
  } catch (error: any) {
    // Handle network-level errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw new Error(`${ERROR_PREFIXES.WEB_TIMEOUT}: Request timed out after 10 seconds. The server may be slow or unresponsive.`)
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
      throw new Error(`${ERROR_PREFIXES.WEB_NETWORK_ERROR}: Network connection failed. The website may be down or unreachable.`)
    }
    
    throw new Error(`${ERROR_PREFIXES.WEB_NETWORK_ERROR}: ${error.message}`)
  }

  // Handle HTTP error status codes
  if (response.status === 404) {
    throw new Error(`${ERROR_PREFIXES.WEB_NOT_FOUND}: Page not found (HTTP 404). The article may have been removed or the URL is incorrect.`)
  }

  if (response.status === 403) {
    throw new Error(`${ERROR_PREFIXES.WEB_PAYWALL}: Access forbidden (HTTP 403). This article may be behind a paywall. Try using https://archive.ph/ to find an archived version.`)
  }

  if (response.status >= 400) {
    throw new Error(`${ERROR_PREFIXES.WEB_NETWORK_ERROR}: HTTP ${response.status} error when fetching article.`)
  }

  // Parse HTML with jsdom (scripts disabled for security)
  let dom: JSDOM
  try {
    dom = new JSDOM(response.data, {
      url: url,
      runScripts: undefined, // Never execute scripts for security
      resources: undefined,  // Don't load external resources
      pretendToBeVisual: true // Needed for some Readability checks
    })
  } catch (error: any) {
    throw new Error(`${ERROR_PREFIXES.PROCESSING_ERROR}: Failed to parse HTML: ${error.message}`)
  }

  // Check if page is likely an article before processing
  const document = dom.window.document
  if (!isProbablyReaderable(document)) {
    throw new Error(`${ERROR_PREFIXES.WEB_NOT_ARTICLE}: This page doesn't appear to be an article. It may be a homepage, search results, or non-article content.`)
  }

  // Extract article content with Readability
  let reader
  try {
    reader = new Readability(document, {
      debug: false,
      maxElemsToParse: 0, // No limit
      nbTopCandidates: 5,
      charThreshold: 500
    })
  } catch (error: any) {
    throw new Error(`${ERROR_PREFIXES.PROCESSING_ERROR}: Failed to initialize Readability: ${error.message}`)
  }

  const article = reader.parse()
  
  // Clean up DOM to prevent memory leaks
  dom.window.close()

  if (!article) {
    throw new Error(`${ERROR_PREFIXES.WEB_NOT_ARTICLE}: Failed to extract article content. The page structure may not be compatible with article extraction.`)
  }

  // Return structured Article object
  return {
    title: article.title || 'Untitled',
    content: sanitizeHtml(article.content || ''),
    textContent: article.textContent || '',
    excerpt: article.excerpt || '',
    byline: article.byline || '',
    siteName: article.siteName || '',
    lang: article.lang || undefined
  }
}

/**
 * Sanitizes HTML content to remove potentially dangerous scripts and event handlers.
 * Provides basic XSS protection by stripping script tags and inline event handlers.
 * 
 * Note: For production use, consider using DOMPurify for more comprehensive sanitization.
 * This basic implementation removes:
 * - <script> tags and their content
 * - Inline event handlers (onclick, onerror, etc.)
 * - javascript: protocol in links
 * 
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML string
 * 
 * @example
 * const safe = sanitizeHtml('<p onclick="alert(1)">Hello</p>')
 * // Returns: '<p>Hello</p>'
 * 
 * const safe2 = sanitizeHtml('<script>alert(1)</script><p>Safe content</p>')
 * // Returns: '<p>Safe content</p>'
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and their content
  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  
  // Remove inline event handlers (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Remove javascript: protocol in links
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
  
  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/src\s*=\s*["']data:[^"']*["']/gi, 'src=""')
  
  return sanitized
}