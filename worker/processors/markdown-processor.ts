/**
 * Markdown document processors for both as-is and AI-enhanced processing.
 * Provides two processing modes: fast heading-based chunking and AI semantic chunking.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult } from '../types/processor.js'
import { cleanMarkdownWithAI } from '../lib/ai-chunking.js'
import { batchChunkAndExtractMetadata } from '../lib/ai-chunking-batch.js'
import type { MetadataExtractionProgress } from '../types/ai-metadata.js'
import { GEMINI_MODEL } from '../lib/model-config.js'

/**
 * Processor for markdown files saved as-is without AI processing.
 * Uses heading-based chunking for fast processing.
 * 
 * Processing stages:
 * 1. Download markdown from storage (10%)
 * 2. Chunk by headings with no AI (30-45%)
 * 
 * Features:
 * - Fast processing (<5 seconds for 100KB)
 * - Heading-based semantic boundaries  
 * - Timestamp extraction for video transcripts
 * - No external API calls
 * 
 * @example
 * const processor = new MarkdownAsIsProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Returns markdown and chunks in <5 seconds
 */
export class MarkdownAsIsProcessor extends SourceProcessor {
  /**
   * Processes markdown document using heading-based chunking.
   * Fast path with no AI processing.
   * 
   * @returns Processed markdown and chunks
   * @throws Error if download or chunking fails
   */
  async process(): Promise<ProcessResult> {
    await this.updateProgress(10, 'download', 'reading', 'Reading markdown file')
    
    // Download file from storage
    const storagePath = this.getStoragePath()
    const markdown = await this.withRetry(
      async () => this.downloadFromStorage(`${storagePath}/source.md`),
      'Download markdown'
    )
    
    const markdownKB = Math.round(markdown.length / 1024)
    await this.updateProgress(30, 'extract', 'chunking', `Processing ${markdownKB}KB with AI metadata extraction`)

    // Use AI-powered chunking and metadata extraction
    const progressCallback = (progress: MetadataExtractionProgress) => {
      const percentage = 30 + Math.floor(((progress.batchesProcessed + 1) / progress.totalBatches) * 40)
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

    // Extract basic metadata
    const wordCount = markdown.split(/\s+/).length
    const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
    const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

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
          processing_mode: 'markdown_asis',
          usedAIMetadata: true
        }
      }
    }
  }
}

/**
 * Processor for markdown files with AI cleaning and enhancement.
 * Uses Gemini to improve formatting and create semantic chunks.
 * 
 * Processing stages:
 * 1. Download markdown from storage (10%)
 * 2. Clean markdown with AI (25%)
 * 3. Create semantic chunks with metadata (40%)
 * 
 * Features:
 * - AI-powered formatting improvements
 * - Semantic chunking with themes
 * - Importance scoring for chunks
 * - Auto-generated summaries
 * 
 * @example
 * const processor = new MarkdownCleanProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Returns cleaned markdown with rich chunk metadata
 */
export class MarkdownCleanProcessor extends SourceProcessor {
  /**
   * Processes markdown with AI cleaning and semantic chunking.
   * Enhanced path for better quality output.
   * 
   * @returns Cleaned markdown and semantic chunks
   * @throws Error if download, cleaning, or chunking fails
   */
  async process(): Promise<ProcessResult> {
    await this.updateProgress(10, 'download', 'reading', 'Reading markdown file')
    
    // Download file from storage
    const storagePath = this.getStoragePath()
    const rawMarkdown = await this.withRetry(
      async () => this.downloadFromStorage(`${storagePath}/source.md`),
      'Download markdown'
    )
    
    const markdownKB = Math.round(rawMarkdown.length / 1024)
    await this.updateProgress(25, 'extract', 'cleaning', `Cleaning ${markdownKB}KB markdown with AI`)
    
    // Clean markdown with AI for better formatting
    const markdown = await this.withRetry(
      async () => cleanMarkdownWithAI(this.ai, rawMarkdown),
      'Clean markdown with AI'
    )
    
    await this.updateProgress(40, 'extract', 'chunking', 'Creating semantic chunks with AI metadata')

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

    // Extract enhanced metadata
    const wordCount = markdown.split(/\s+/).length
    const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
    const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))

    // Calculate document-level themes from chunk themes (AI metadata includes themes)
    const themeFrequency = new Map<string, number>()
    enrichedChunks.forEach(chunk => {
      if (chunk.themes) {
        chunk.themes.forEach(theme => {
          themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
        })
      }
    })

    // Get top 5 document themes
    const documentThemes = Array.from(themeFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme)

    // Calculate average importance score from AI metadata
    const avgImportance = enrichedChunks.reduce((sum, chunk) => sum + (chunk.importance_score || 0), 0) / enrichedChunks.length

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
          document_themes: documentThemes,
          avg_importance: Math.round(avgImportance * 100) / 100,
          processing_mode: 'markdown_clean',
          was_cleaned: true,
          usedAIMetadata: true
        }
      }
    }
  }
}