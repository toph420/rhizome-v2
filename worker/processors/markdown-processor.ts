/**
 * Markdown document processors for both as-is and AI-enhanced processing.
 * Provides two processing modes: fast heading-based chunking and AI semantic chunking.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult } from '../types/processor.js'
import { extractTimestampsWithContext } from '../lib/markdown-chunking.js'
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

    // Extract timestamps before AI processing (for video transcripts)
    const timestamps = extractTimestampsWithContext(markdown)
    const hasTimestamps = timestamps.length > 0

    if (hasTimestamps) {
      console.log(`📝 Found ${timestamps.length} timestamps in markdown`)
    }

    // Use AI-powered chunking and metadata extraction
    const progressCallback = (progress: MetadataExtractionProgress) => {
      const percentage = 30 + Math.floor((progress.currentBatch / progress.totalBatches) * 40)
      this.updateProgress(
        percentage,
        'extract',
        'metadata',
        `AI metadata: batch ${progress.currentBatch}/${progress.totalBatches}`
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

    // Add timestamp data to chunks if available
    if (hasTimestamps) {
      const chunkCount = chunks.length
      const timestampsPerChunk = Math.ceil(timestamps.length / chunkCount)

      chunks.forEach((chunk, index) => {
        const startIdx = index * timestampsPerChunk
        const endIdx = Math.min((index + 1) * timestampsPerChunk, timestamps.length)
        const chunkTimestamps = timestamps.slice(startIdx, endIdx)

        if (chunkTimestamps.length > 0) {
          // Add timestamp context to chunk
          Object.assign(chunk, {
            timestamps: chunkTimestamps,
            position_context: {
              confidence: 0.8,
              method: 'distribution',
              has_timestamps: true
            }
          })
        }
      })
    }

    await this.updateProgress(70, 'finalize', 'complete', `Created ${chunks.length} chunks with AI metadata`)

    // Convert AI chunks to ProcessedChunk format with proper metadata mapping
    const enrichedChunks = chunks.map((aiChunk, index) => {
      // Use base class helper to map metadata correctly
      const base = this.mapAIChunkToDatabase({
        ...aiChunk,
        chunk_index: index
      })

      // Re-add timestamps that were set before AI processing
      if (hasTimestamps && (aiChunk as any).timestamps) {
        return {
          ...base,
          timestamps: (aiChunk as any).timestamps,
          position_context: (aiChunk as any).position_context
        }
      }

      return base
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
          has_timestamps: hasTimestamps,
          timestamp_count: timestamps.length,
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

    // Extract timestamps before AI processing
    const timestamps = extractTimestampsWithContext(markdown)
    const hasTimestamps = timestamps.length > 0

    if (hasTimestamps) {
      console.log(`📝 Found ${timestamps.length} timestamps in cleaned markdown`)
    }

    // Use AI-powered chunking and metadata extraction
    const progressCallback = (progress: MetadataExtractionProgress) => {
      const percentage = 40 + Math.floor((progress.currentBatch / progress.totalBatches) * 30)
      this.updateProgress(
        percentage,
        'extract',
        'metadata',
        `AI metadata: batch ${progress.currentBatch}/${progress.totalBatches}`
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

    // If timestamps exist, try to match them to chunks
    if (hasTimestamps) {
      chunks.forEach((chunk, index) => {
        // Find closest timestamps based on chunk position
        const chunkPosition = index / chunks.length
        const timestampIndex = Math.floor(chunkPosition * timestamps.length)
        const relevantTimestamps = timestamps.slice(
          Math.max(0, timestampIndex - 1),
          Math.min(timestamps.length, timestampIndex + 2)
        )

        if (relevantTimestamps.length > 0) {
          Object.assign(chunk, {
            timestamps: relevantTimestamps,
            position_context: {
              confidence: 0.7,
              method: 'cleaned_fuzzy',
              has_timestamps: true
            }
          })
        }
      })
    }

    await this.updateProgress(70, 'finalize', 'complete', `Created ${chunks.length} chunks with AI metadata`)

    // Convert AI chunks to ProcessedChunk format with proper metadata mapping
    const enrichedChunks = chunks.map((aiChunk, index) => {
      // Use base class helper to map metadata correctly
      const base = this.mapAIChunkToDatabase({
        ...aiChunk,
        chunk_index: index
      })

      // Re-add timestamps that were set before AI processing
      if (hasTimestamps && (aiChunk as any).timestamps) {
        return {
          ...base,
          timestamps: (aiChunk as any).timestamps,
          position_context: (aiChunk as any).position_context
        }
      }

      return base
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
          has_timestamps: hasTimestamps,
          timestamp_count: timestamps.length,
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