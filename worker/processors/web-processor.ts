/**
 * Web Processor with Chonkie Unified Chunking Pipeline
 *
 * CHONKIE INTEGRATION: Simplified 8-stage processing flow
 * 1. URL Validation (5%)
 * 2. Article Fetching (10-30%) - Mozilla Readability extraction
 * 3. AI Cleaning (30-40%) - Gemini content cleanup
 * 4. Chonkie Chunking (40-50%) - User-selected strategy (9 options)
 * 5. Metadata Enrichment (50-75%) - PydanticAI + Ollama
 * 6. Local Embeddings (75-90%) - Transformers.js
 * 7. Finalize (90-100%) - Storage + manifest
 *
 * Handles paywalls, timeouts, and network failures gracefully.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult, ProcessedChunk } from '../types/processor.js'
import { isValidUrl, extractArticle } from '../lib/web-extraction.js'
import { ERROR_PREFIXES } from '../types/multi-format.js'
import { GEMINI_MODEL } from '../lib/model-config.js'
// Chonkie Integration
import { chunkWithChonkie } from '../lib/chonkie/chonkie-chunker.js'
import type { ChonkieStrategy } from '../lib/chonkie/types.js'
// Local metadata enrichment
import { extractMetadataBatch, type ChunkInput } from '../lib/chunking/pydantic-metadata.js'
// Local embeddings
import { generateEmbeddingsLocal } from '../lib/local/embeddings-local.js'
import { generateEmbeddings } from '../lib/embeddings.js'
// Storage
import { hashMarkdown } from '../lib/cached-chunks.js'
// Statistics
import { calculateChunkStatistics, logChunkStatistics } from '../lib/chunking/chunk-statistics.js'

/**
 * Processes web articles by extracting content using Mozilla Readability.
 * Handles paywalls, timeouts, and network failures gracefully.
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
    // Start heartbeat for UI pulse indicator
    this.startHeartbeat()

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

      // Stage 3: Content cleaning with AI (30-40%)
      await this.updateProgress(33, 'extract', 'cleaning', 'Cleaning article content with AI')

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
            model: GEMINI_MODEL,
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

      console.log(`[WebProcessor] Cleaned article: ${markdown.length} characters`)
      await this.updateProgress(40, 'extract', 'cleaned', 'Article cleaned and formatted')

      // Checkpoint 1: Save cleaned markdown
      await this.saveStageResult('cleanup', { markdown })

      // Stage 4: Chonkie Chunking (40-50%)
      const chunkerStrategy: ChonkieStrategy = (this.job.input_data?.chunkerStrategy as ChonkieStrategy) || 'recursive'
      const chunkSize = this.job.input_data?.chunkSize as number | undefined
      console.log(`[WebProcessor] Stage 4: Chunking with Chonkie strategy: ${chunkerStrategy}`)

      await this.updateProgress(43, 'chunking', 'processing', `Chunking with ${chunkerStrategy} strategy`)

      const chonkieChunks = await chunkWithChonkie(markdown, {
        chunker_type: chunkerStrategy,
        ...(chunkSize ? { chunk_size: chunkSize } : {}),  // Let wrapper apply strategy-specific defaults
        timeout: 300000
      })

      console.log(`[WebProcessor] Chonkie created ${chonkieChunks.length} chunks using ${chunkerStrategy} strategy`)
      await this.updateProgress(50, 'chunking', 'complete', `${chonkieChunks.length} chunks created`)

      // Convert Chonkie chunks to ProcessedChunk format
      let finalChunks: ProcessedChunk[] = chonkieChunks.map((chunk, index) => ({
        document_id: this.job.document_id,
        chunk_index: index,
        content: chunk.text,
        start_offset: chunk.start_index,
        end_offset: chunk.end_index,
        token_count: chunk.token_count || 0,
        word_count: chunk.text.split(/\s+/).length,
        heading_path: null,
        heading_level: null,
        page_start: null,
        page_end: null,
        section_marker: null,
        bboxes: null,
        metadata_overlap_count: 0,
        metadata_confidence: 'none',
        metadata_interpolated: false,
        themes: [],
        importance_score: 0.5,
        summary: null,
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null
      }))

      // Checkpoint 2: Save chunks before enrichment
      await this.saveStageResult('chunking', finalChunks)

      // Log chunk statistics
      const chunkingStats = calculateChunkStatistics(finalChunks, 512)
      logChunkStatistics(chunkingStats, 'Web Article Chunks (After Chonkie)')

      // Stage 5: Metadata Enrichment (50-75%)
      console.log('[WebProcessor] Stage 5: Starting local metadata enrichment (PydanticAI + Ollama)')
      await this.updateProgress(53, 'metadata', 'processing', 'Extracting structured metadata')

      try {
        const BATCH_SIZE = 10
        const enrichedChunks: ProcessedChunk[] = []

        for (let i = 0; i < finalChunks.length; i += BATCH_SIZE) {
          const batch = finalChunks.slice(i, i + BATCH_SIZE)

          const batchInput: ChunkInput[] = batch.map(chunk => ({
            id: `${this.job.document_id}-${chunk.chunk_index}`,
            content: chunk.content
          }))

          console.log(`[WebProcessor] Processing metadata batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalChunks.length / BATCH_SIZE)}`)

          const metadataMap = await extractMetadataBatch(batchInput, {
            onProgress: (processed, _total) => {
              const overallProgress = 53 + Math.floor(((i + processed) / finalChunks.length) * 22)
              this.updateProgress(overallProgress, 'metadata', 'processing', `Enriching chunk ${i + processed}/${finalChunks.length}`)
            }
          })

          for (const chunk of batch) {
            const chunkId = `${this.job.document_id}-${chunk.chunk_index}`
            const metadata = metadataMap.get(chunkId)

            if (metadata) {
              enrichedChunks.push({
                ...chunk,
                themes: metadata.themes,
                importance_score: metadata.importance,
                summary: metadata.summary,
                emotional_metadata: {
                  polarity: metadata.emotional.polarity,
                  primaryEmotion: metadata.emotional.primaryEmotion as any,
                  intensity: metadata.emotional.intensity
                },
                conceptual_metadata: {
                  concepts: metadata.concepts as any
                },
                domain_metadata: {
                  primaryDomain: metadata.domain as any,
                  confidence: 0.8
                },
                metadata_extracted_at: new Date().toISOString()
              })
            } else {
              console.warn(`[WebProcessor] Metadata extraction failed for chunk ${chunk.chunk_index} - using defaults`)
              enrichedChunks.push(chunk)
            }
          }

          const progress = 53 + Math.floor(((i + batch.length) / finalChunks.length) * 22)
          await this.updateProgress(progress, 'metadata', 'processing', `Batch ${Math.floor(i / BATCH_SIZE) + 1} complete`)
        }

        finalChunks = enrichedChunks

        console.log(`[WebProcessor] Local metadata enrichment complete: ${finalChunks.length} chunks enriched`)
        await this.updateProgress(75, 'metadata', 'complete', 'Metadata enrichment done')

        // Checkpoint 3: Save enriched chunks
        await this.saveStageResult('metadata', finalChunks, { final: true })

      } catch (error: any) {
        console.error(`[WebProcessor] Metadata enrichment failed: ${error.message}`)
        console.warn('[WebProcessor] Continuing with default metadata')
        await this.updateProgress(75, 'metadata', 'fallback', 'Using default metadata')
      }

      // Stage 6: Local Embeddings (75-90%)
      console.log('[WebProcessor] Stage 6: Starting local embeddings generation (Transformers.js)')
      await this.updateProgress(78, 'embeddings', 'processing', 'Generating local embeddings')

      try {
        const chunkTexts = finalChunks.map(chunk => chunk.content)

        console.log(`[WebProcessor] Generating embeddings for ${chunkTexts.length} chunks (Xenova/all-mpnet-base-v2)`)

        const startTime = Date.now()
        const embeddings = await generateEmbeddingsLocal(chunkTexts)
        const embeddingTime = Date.now() - startTime

        console.log(`[WebProcessor] Local embeddings complete: ${embeddings.length} vectors (768d) in ${(embeddingTime / 1000).toFixed(1)}s`)

        if (embeddings.length !== finalChunks.length) {
          throw new Error(`Embedding count mismatch: expected ${finalChunks.length}, got ${embeddings.length}`)
        }

        finalChunks = finalChunks.map((chunk, idx) => ({
          ...chunk,
          embedding: embeddings[idx]
        }))

        console.log('[WebProcessor] Embeddings attached to all chunks')
        await this.updateProgress(90, 'embeddings', 'complete', 'Local embeddings generated')

      } catch (error: any) {
        console.error(`[WebProcessor] Local embeddings failed: ${error.message}`)
        console.warn('[WebProcessor] Falling back to Gemini embeddings')

        try {
          const chunkContents = finalChunks.map(chunk => chunk.content)
          const embeddings = await generateEmbeddings(chunkContents)

          finalChunks = finalChunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx]
          }))

          console.log('[WebProcessor] Gemini embeddings fallback successful')
          await this.updateProgress(90, 'embeddings', 'fallback', 'Using Gemini embeddings')

        } catch (fallbackError: any) {
          console.error(`[WebProcessor] Gemini embeddings also failed: ${fallbackError.message}`)
          await this.updateProgress(90, 'embeddings', 'failed', 'Embeddings generation failed')
        }
      }

      // Stage 7: Finalize (90-100%)
      console.log('[WebProcessor] Stage 7: Finalizing document processing')
      await this.updateProgress(95, 'finalize', 'formatting', 'Finalizing')

      // Checkpoint 4: Save final chunks
      await this.saveStageResult('chunks', finalChunks, { final: true })

      // Checkpoint 5: Save manifest
      const manifestData = {
        document_id: this.job.document_id,
        processing_mode: 'local',
        source_type: 'web_url',
        source_url: sourceUrl,
        files: {
          'chunks.json': { size: JSON.stringify(finalChunks).length, type: 'final' },
          'metadata.json': { size: markdown.length, type: 'final' },
          'manifest.json': { size: 0, type: 'final' }
        },
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).length,
        processing_time: Date.now() - (this.job.created_at ? new Date(this.job.created_at).getTime() : Date.now()),
        markdown_hash: hashMarkdown(markdown),
        chunker_strategy: chunkerStrategy
      }
      await this.saveStageResult('manifest', manifestData, { final: true })

      await this.updateProgress(100, 'complete', 'success', 'Web article processed successfully')

      // Collect document themes
      const themeFrequency = new Map<string, number>()
      finalChunks.forEach(chunk => {
        if (chunk.themes) {
          chunk.themes.forEach(theme => {
            themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
          })
        }
      })

      const documentThemes = Array.from(themeFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme)

      // Prepare metadata
      const metadata = {
        title: article.title,
        author: article.byline || undefined,
        site_name: article.siteName || undefined,
        language: article.lang || 'en',
        excerpt: article.excerpt || undefined,
        source_url: sourceUrl,
        chunk_count: finalChunks.length,
        word_count: markdown.split(/\s+/).length,
        extra: {
          document_themes: documentThemes.length > 0 ? documentThemes : undefined,
          chunker_strategy: chunkerStrategy
        }
      }

      return {
        markdown,
        chunks: finalChunks,
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
    } finally {
      // Always stop heartbeat
      this.stopHeartbeat()
    }
  }

}
