/**
 * Text document processor for converting plain text to structured markdown.
 * Uses AI to add structure, headings, and formatting to unstructured text.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult } from '../types/processor.js'
import { textToMarkdownWithAI } from '../lib/ai-chunking.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
import type { MetadataExtractionProgress } from '../types/ai-metadata.js'
import { GEMINI_MODEL } from '../lib/model-config.js'

/**
 * Processor for plain text files.
 * Converts unstructured text to well-formatted markdown with AI.
 *
 * Processing stages:
 * 1. Download text file from storage (10%)
 * 2. Convert to markdown with AI (25%)
 * 3. Create semantic chunks (40%)
 *
 * Features:
 * - AI-powered structure generation
 * - Automatic heading creation
 * - List and emphasis detection
 * - Semantic chunking with metadata
 *
 * @example
 * const processor = new TextProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Converts plain text to structured markdown with chunks
 */
export class TextProcessor extends SourceProcessor {
  /**
   * Processes plain text by converting to markdown and chunking.
   * 
   * @returns Structured markdown and semantic chunks
   * @throws Error if download or AI processing fails
   */
  async process(): Promise<ProcessResult> {
    await this.updateProgress(10, 'download', 'reading', 'Reading text file')
    
    // Download file from storage
    const storagePath = this.getStoragePath()
    const textContent = await this.withRetry(
      async () => this.downloadFromStorage(`${storagePath}/source.txt`),
      'Download text file'
    )
    
    const textKB = Math.round(textContent.length / 1024)
    await this.updateProgress(25, 'extract', 'formatting', `Converting ${textKB}KB to markdown with AI`)

    // Convert text to markdown with AI
    const markdown = await this.withRetry(
      async () => textToMarkdownWithAI(this.ai, textContent),
      'Convert text to markdown'
    )

    await this.updateProgress(40, 'extract', 'chunking', 'Creating chunks with AI metadata extraction')

    // Use AI-powered chunking and metadata extraction
    const progressCallback = (progress: MetadataExtractionProgress) => {
      const percentage = 40 + Math.floor(((progress.batchesProcessed + 1) / progress.totalBatches) * 30)
      this.updateProgress(
        percentage,
        'extract',
        'metadata',
        `AI metadata: batch ${progress.batchesProcessed + 1}/${progress.totalBatches} (${progress.chunksIdentified} chunks identified)`
      )
    }

    const chunks = await this.withRetry(
      async () => batchChunkAndExtractMetadata(
        markdown,
        {
          apiKey: process.env.GOOGLE_AI_API_KEY,
          modelName: GEMINI_MODEL,
          enableProgress: true
        },
        progressCallback
      ),
      'AI metadata extraction'
    )

    await this.updateProgress(70, 'finalize', 'complete', `Created ${chunks.length} chunks with AI metadata`)

    // Convert AI chunks to ProcessedChunk format with proper metadata mapping
    const enrichedChunks = chunks.map((aiChunk, index) => {
      // Use base class helper to map metadata correctly
      return this.mapAIChunkToDatabase({
        ...aiChunk,
        chunk_index: index
      })
    })

    // Extract metadata
    const wordCount = markdown.split(/\s+/).length
    const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
    const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

    // Collect document themes from AI metadata
    const themeFrequency = new Map<string, number>()
    enrichedChunks.forEach(chunk => {
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

    return {
      markdown,
      chunks: enrichedChunks,
      wordCount,
      outline: outline.length > 0 ? outline.map((title, i) => ({
        title,
        level: 1,
        offset: 0
      })) : undefined,
      metadata: {
        extra: {
          chunk_count: enrichedChunks.length,
          document_themes: documentThemes.length > 0 ? documentThemes : undefined,
          processing_mode: 'txt',
          converted_from: 'plain_text',
          original_size_kb: textKB,
          usedAIMetadata: true
        }
      }
    }
  }
}