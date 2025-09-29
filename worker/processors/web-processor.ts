import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { isValidUrl, extractArticle } from '../lib/web-extraction.js'
import { ERROR_PREFIXES } from '../types/multi-format.js'
import { Type } from '@google/genai'

/**
 * Processes web articles by extracting content using Mozilla Readability.
 * Handles paywalls, timeouts, and network failures gracefully.
 * 
 * Processing stages:
 * 1. URL validation (5%)
 * 2. Article fetching and extraction (10-30%)
 * 3. Content cleaning with AI (30-60%)
 * 4. Semantic chunking (60-90%)
 * 5. Completion (100%)
 * 
 * @example
 * const processor = new WebProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Returns: { markdown, chunks, metadata }
 */
export class WebProcessor extends SourceProcessor {

  /**
   * Processes a web URL to extract article content.
   * 
   * @returns ProcessResult with markdown, chunks, and metadata
   * @throws {Error} With prefixed error messages for UI routing:
   *   - WEB_INVALID_URL: Invalid URL format
   *   - WEB_NOT_FOUND: HTTP 404
   *   - WEB_PAYWALL: HTTP 403 or paywall detected  
   *   - WEB_TIMEOUT: Request timeout
   *   - WEB_NOT_ARTICLE: Page is not an article
   */
  async process(): Promise<ProcessResult> {
    const sourceUrl = this.job.input_data?.source_url || ''
    
    try {
      // Stage 1: URL validation (5%)
      await this.updateProgress(5, 'download', 'validating', 'Validating web URL')
      
      if (!sourceUrl) {
        throw new Error('Source URL required for web article processing')
      }

      if (!isValidUrl(sourceUrl)) {
        throw new Error(`${ERROR_PREFIXES.INVALID_URL}: Invalid web URL format`)
      }

      // Stage 2: Article fetching and extraction (10-30%)
      await this.updateProgress(10, 'download', 'fetching', 'Fetching web article')
      
      let article
      try {
        // Use retry logic for transient network failures
        // The base class withRetry will handle all transient errors automatically
        article = await this.withRetry(
          async () => await extractArticle(sourceUrl),
          'article extraction'
        )
      } catch (error: any) {
        // Re-throw with cleaner error messages
        if (error.message.includes(ERROR_PREFIXES.WEB_PAYWALL)) {
          throw new Error(`${ERROR_PREFIXES.WEB_PAYWALL}: This article appears to be behind a paywall. Try using https://archive.ph/ to find an archived version.`)
        }
        throw error
      }

      await this.updateProgress(30, 'extract', 'processing', 'Article extracted successfully')

      // Stage 3: Content cleaning with AI (30-60%)
      await this.updateProgress(35, 'extract', 'cleaning', 'Cleaning article content with AI')
      
      const cleaningPrompt = `Convert this web article to clean, well-formatted markdown. 
Preserve the article structure but remove any ads, navigation, and boilerplate content.
Focus on the main article content only.

Title: ${article.title}
Author: ${article.byline || 'Unknown'}
Site: ${article.siteName || 'Unknown'}
Language: ${article.lang || 'en'}

Content:
${article.textContent}`

      const cleaningResult = await this.withRetry(
        async () => {
          const result = await this.ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: [{
              parts: [{ text: cleaningPrompt }]
            }],
            config: {
              temperature: 0.3,
              topP: 0.9,
              maxOutputTokens: 50000
            }
          })
          return result
        },
        'article cleaning'
      )

      const markdown = cleaningResult.text || ''
      if (!markdown) {
        throw new Error('AI failed to clean article content')
      }

      await this.updateProgress(60, 'extract', 'cleaned', 'Article cleaned and formatted')

      // Stage 4: Semantic chunking (60-90%)
      await this.updateProgress(65, 'extract', 'chunking', 'Creating semantic chunks')
      
      const chunks = await this.withRetry(
        async () => await this.rechunkMarkdown(markdown),
        'markdown chunking'
      )

      await this.updateProgress(90, 'extract', 'complete', `Created ${chunks.length} chunks`)

      // Stage 5: Prepare metadata
      const metadata = {
        title: article.title,
        author: article.byline || undefined,
        site_name: article.siteName || undefined,
        language: article.lang || 'en',
        excerpt: article.excerpt || undefined,
        source_url: sourceUrl,
        chunk_count: chunks.length,
        word_count: markdown.split(/\s+/).length
      }

      // Final progress
      await this.updateProgress(100, 'complete', 'success', 'Web article processed successfully')

      return {
        markdown,
        chunks,
        metadata
      }
    } catch (error: any) {
      // Log error details for debugging
      console.error('❌ Web processing failed:', {
        url: sourceUrl,
        error: error.message,
        stack: error.stack
      })

      // Ensure user-friendly error messages
      if (error.message.includes(ERROR_PREFIXES.WEB_NOT_ARTICLE)) {
        throw new Error('This page doesn\'t appear to be an article. It may be a homepage or search results page.')
      }
      
      if (error.message.includes(ERROR_PREFIXES.WEB_NOT_FOUND)) {
        throw new Error('The article could not be found (404). It may have been removed or the URL is incorrect.')
      }

      // Re-throw other errors as-is
      throw error
    }
  }

  /**
   * Rechunks markdown content into semantic chunks using AI.
   * This is a temporary implementation until rechunkMarkdown is extracted to lib.
   * 
   * @param markdown - Markdown content to chunk
   * @returns Array of processed chunks with metadata
   */
  private async rechunkMarkdown(markdown: string): Promise<ProcessedChunk[]> {
    const result = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [{
        parts: [
          { text: `Break this markdown document into semantic chunks (complete thoughts, 200-2000 characters).
CRITICAL: Every chunk MUST have:
- content: The actual chunk text (STRING, required)
- themes: Array of 2-3 specific topics covered (e.g., ["authentication", "security"]) (ARRAY of STRINGS, required)
- importance_score: Float 0.0-1.0 representing how central this content is to the document (NUMBER, required)
- summary: One sentence describing what this chunk covers (STRING, required)
Return JSON with this exact structure: {chunks: [{content, themes, importance_score, summary}]}
${markdown}` }
        ]
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            chunks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: { type: Type.STRING },
                  themes: { type: Type.ARRAY, items: { type: Type.STRING }},
                  importance_score: { type: Type.NUMBER },
                  summary: { type: Type.STRING }
                },
                required: ['content', 'themes', 'importance_score', 'summary']
              }
            }
          },
          required: ['chunks']
        }
      }
    })

    if (!result.text) {
      throw new Error('AI returned empty response during chunking')
    }

    const response = JSON.parse(result.text)
    if (!response.chunks || !Array.isArray(response.chunks)) {
      throw new Error('Invalid chunking response structure')
    }

    // Map to ProcessedChunk format
    return response.chunks.map((chunk: any, index: number) => ({
      content: chunk.content,
      themes: chunk.themes,
      importance: chunk.importance_score * 10, // Convert 0-1 to 0-10
      summary: chunk.summary,
      chunkIndex: index
    }))
  }
}