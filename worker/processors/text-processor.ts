/**
 * Text document processor for converting plain text to structured markdown.
 * Uses AI to add structure, headings, and formatting to unstructured text.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult } from '../types/processor.js'
import { textToMarkdownWithAI, rechunkMarkdown } from '../lib/ai-chunking.js'
import { extractTimestampsWithContext } from '../lib/markdown-chunking.js'

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
 * - Timestamp preservation if present
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
    
    // Check for timestamps before conversion
    const originalTimestamps = extractTimestampsWithContext(textContent)
    const hasTimestamps = originalTimestamps.length > 0
    
    if (hasTimestamps) {
      console.log(`⏰ Found ${originalTimestamps.length} timestamps in plain text`)
    }
    
    // Convert text to markdown with AI
    const markdown = await this.withRetry(
      async () => textToMarkdownWithAI(this.ai, textContent),
      'Convert text to markdown'
    )
    
    await this.updateProgress(40, 'extract', 'chunking', 'Creating semantic chunks')
    
    // Create semantic chunks
    const chunks = await this.withRetry(
      async () => rechunkMarkdown(this.ai, markdown),
      'Semantic chunking'
    )
    
    // If original text had timestamps, try to preserve them
    if (hasTimestamps) {
      // Extract timestamps from converted markdown
      const convertedTimestamps = extractTimestampsWithContext(markdown)
      
      if (convertedTimestamps.length > 0) {
        console.log(`✅ Preserved ${convertedTimestamps.length} timestamps after conversion`)
        
        // Distribute timestamps across chunks
        chunks.forEach((chunk, index) => {
          const chunkPosition = index / chunks.length
          const timestampIndex = Math.floor(chunkPosition * convertedTimestamps.length)
          const relevantTimestamps = convertedTimestamps.slice(
            Math.max(0, timestampIndex - 1),
            Math.min(convertedTimestamps.length, timestampIndex + 2)
          )
          
          if (relevantTimestamps.length > 0) {
            Object.assign(chunk, {
              timestamps: relevantTimestamps,
              position_context: {
                confidence: 0.9, // High confidence since timestamps were preserved
                method: 'preserved',
                has_timestamps: true
              }
            })
          }
        })
      } else {
        console.warn(`⚠️  Lost timestamps during conversion. Original had ${originalTimestamps.length}`)
      }
    }
    
    await this.updateProgress(45, 'extract', 'complete', `Created ${chunks.length} chunks from text`)
    
    // Extract metadata
    const wordCount = markdown.split(/\s+/).length
    const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
    const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))
    
    // Collect document themes
    const themeFrequency = new Map<string, number>()
    chunks.forEach(chunk => {
      chunk.themes.forEach(theme => {
        themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
      })
    })
    
    const documentThemes = Array.from(themeFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme)
    
    return {
      markdown,
      chunks,
      wordCount,
      outline: outline.length > 0 ? outline.map((title, i) => ({ 
        title, 
        level: 1, 
        offset: 0 
      })) : undefined,
      metadata: {
        extra: {
          chunk_count: chunks.length,
          has_timestamps: hasTimestamps,
          timestamp_count: hasTimestamps ? originalTimestamps.length : 0,
          document_themes: documentThemes.length > 0 ? documentThemes : undefined,
          processing_mode: 'txt',
          converted_from: 'plain_text',
          original_size_kb: textKB
        }
      }
    }
  }
}