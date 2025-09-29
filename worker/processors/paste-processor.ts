/**
 * Paste content processor for handling user-pasted text.
 * Automatically detects format and applies appropriate processing.
 */

import { SourceProcessor } from './base.js'
import type { ProcessResult } from '../types/processor.js'
import { cleanMarkdownWithAI, textToMarkdownWithAI, rechunkMarkdown } from '../lib/ai-chunking.js'
import { simpleMarkdownChunking, extractTimestampsWithContext } from '../lib/markdown-chunking.js'
import { cleanYoutubeTranscript } from '../lib/youtube-cleaning.js'

/**
 * Content format detection result.
 */
interface FormatDetection {
  /** Detected format type */
  format: 'transcript' | 'markdown' | 'code' | 'plain_text'
  /** Confidence score 0-1 */
  confidence: number
  /** Whether content has timestamps */
  hasTimestamps: boolean
  /** Whether content appears to be YouTube transcript */
  isYouTubeTranscript: boolean
  /** Detected programming language if code */
  language?: string
}

/**
 * Processor for pasted content from users.
 * Automatically detects format and applies appropriate processing.
 * 
 * Processing stages:
 * 1. Format detection (10%)
 * 2. Content processing based on format (10-40%)
 * 3. Chunking with appropriate method (40-45%)
 * 
 * Features:
 * - Automatic format detection
 * - YouTube transcript handling
 * - Markdown preservation or enhancement
 * - Code block formatting
 * - Timestamp extraction and linking
 * 
 * @example
 * const processor = new PasteProcessor(ai, supabase, job)
 * const result = await processor.process()
 * // Intelligently processes based on detected format
 */
export class PasteProcessor extends SourceProcessor {
  /**
   * Detects the format of pasted content.
   * 
   * @param content - Pasted content to analyze
   * @returns Format detection result
   */
  private detectFormat(content: string): FormatDetection {
    // Check for timestamps (YouTube transcript indicator)
    const timestampRegex = /\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g
    const timestampMatches = content.match(timestampRegex) || []
    const hasTimestamps = timestampMatches.length > 5 // More than 5 timestamps suggests transcript
    
    // Check for YouTube transcript patterns
    const isYouTubeTranscript = hasTimestamps && (
      content.includes('[[') || // YouTube timestamp format [[MM:SS](url)]
      timestampMatches.length > 20 || // Many timestamps
      /\[\d{1,2}:\d{2}\]\s+\w+/g.test(content) // Timestamp followed by text pattern
    )
    
    // Check for markdown indicators
    const hasMarkdownHeaders = /^#{1,6}\s+/m.test(content)
    const hasMarkdownLists = /^[\*\-\+]\s+/m.test(content) || /^\d+\.\s+/m.test(content)
    const hasMarkdownEmphasis = /\*\*.+\*\*/.test(content) || /__.+__/.test(content)
    const hasMarkdownLinks = /\[.+\]\(.+\)/.test(content)
    const markdownScore = [hasMarkdownHeaders, hasMarkdownLists, hasMarkdownEmphasis, hasMarkdownLinks]
      .filter(Boolean).length / 4
    
    // Check for code indicators
    const hasCodeBlocks = /```[\s\S]*```/.test(content) || /^    /m.test(content)
    const hasCodePatterns = /function\s+\w+|class\s+\w+|const\s+\w+|import\s+/g.test(content)
    const hasBraces = /[{}\[\]()<>]/.test(content)
    const codeScore = [hasCodeBlocks, hasCodePatterns, hasBraces].filter(Boolean).length / 3
    
    // Detect programming language if code
    let language: string | undefined
    if (codeScore > 0.5) {
      if (/import\s+.*from\s+['"]|export\s+/m.test(content)) language = 'javascript'
      else if (/def\s+\w+|import\s+\w+|from\s+\w+\s+import/m.test(content)) language = 'python'
      else if (/package\s+\w+|func\s+\w+|import\s+"/.test(content)) language = 'go'
      else if (/fn\s+\w+|impl\s+\w+|use\s+\w+/.test(content)) language = 'rust'
      else if (/class\s+\w+.*\{|interface\s+\w+/.test(content)) language = 'java'
    }
    
    // Determine format based on scores
    if (isYouTubeTranscript) {
      return {
        format: 'transcript',
        confidence: 0.9,
        hasTimestamps: true,
        isYouTubeTranscript: true
      }
    } else if (markdownScore >= 0.5) {
      return {
        format: 'markdown',
        confidence: markdownScore,
        hasTimestamps,
        isYouTubeTranscript: false
      }
    } else if (codeScore >= 0.5) {
      return {
        format: 'code',
        confidence: codeScore,
        hasTimestamps: false,
        isYouTubeTranscript: false,
        language
      }
    } else {
      return {
        format: 'plain_text',
        confidence: 0.5,
        hasTimestamps,
        isYouTubeTranscript: false
      }
    }
  }
  
  /**
   * Processes pasted content with format-specific handling.
   * 
   * @returns Processed markdown and chunks
   * @throws Error if processing fails
   */
  async process(): Promise<ProcessResult> {
    await this.updateProgress(10, 'extract', 'analyzing', 'Analyzing pasted content format')
    
    // Get pasted content from job input
    const pastedContent = this.job.input_data.pasted_content
    if (!pastedContent) {
      throw new Error('Pasted content required for paste processing')
    }
    
    const contentKB = Math.round(pastedContent.length / 1024)
    
    // Detect content format
    const detection = this.detectFormat(pastedContent)
    console.log(`📋 Detected format: ${detection.format} (confidence: ${detection.confidence})`)
    
    let markdown: string
    let chunks: any[]
    let wasTranscript = false
    
    // Process based on detected format
    switch (detection.format) {
      case 'transcript': {
        await this.updateProgress(20, 'extract', 'cleaning', `Cleaning YouTube transcript (${contentKB}KB)`)
        
        // Check if we have source URL for better processing
        const sourceUrl = this.job.input_data.source_url
        
        // Clean transcript using YouTube cleaner
        const cleanResult = await this.withRetry(
          async () => cleanYoutubeTranscript(this.ai, pastedContent),
          'Clean YouTube transcript'
        )
        
        if (cleanResult.success && cleanResult.cleaned) {
          markdown = cleanResult.cleaned
          console.log(`✅ Successfully cleaned transcript`)
        } else {
          // Fallback to basic cleaning
          console.warn(`⚠️  YouTube cleaning failed: ${cleanResult.error}. Using fallback.`)
          markdown = await this.withRetry(
            async () => textToMarkdownWithAI(this.ai, pastedContent),
            'Convert transcript to markdown'
          )
        }
        
        wasTranscript = true
        break
      }
      
      case 'markdown': {
        await this.updateProgress(20, 'extract', 'processing', `Processing markdown content (${contentKB}KB)`)
        
        // Check if markdown needs cleaning
        const needsCleaning = detection.confidence < 0.7
        
        if (needsCleaning) {
          markdown = await this.withRetry(
            async () => cleanMarkdownWithAI(this.ai, pastedContent),
            'Clean markdown'
          )
        } else {
          // Already clean markdown
          markdown = pastedContent
        }
        break
      }
      
      case 'code': {
        await this.updateProgress(20, 'extract', 'formatting', `Formatting code as markdown (${detection.language || 'unknown language'})`)
        
        // Wrap code in markdown code block if not already
        if (!pastedContent.includes('```')) {
          markdown = `# Code Snippet\n\n\`\`\`${detection.language || ''}\n${pastedContent}\n\`\`\``
        } else {
          markdown = pastedContent
        }
        
        // Add structure with AI if needed
        if (pastedContent.length > 500) {
          markdown = await this.withRetry(
            async () => this.ai.models.generateContent({
              model: 'gemini-2.0-flash-exp',
              contents: [{
                parts: [{
                  text: `Add markdown documentation structure to this code. Include:
- A title describing what the code does
- Brief description
- Code blocks with syntax highlighting
- Any important notes

Code:
${pastedContent}`
                }]
              }]
            }).then(r => r.text || markdown),
            'Document code'
          )
        }
        break
      }
      
      default: {
        await this.updateProgress(20, 'extract', 'formatting', `Converting plain text to markdown (${contentKB}KB)`)
        
        // Convert plain text to markdown
        markdown = await this.withRetry(
          async () => textToMarkdownWithAI(this.ai, pastedContent),
          'Convert to markdown'
        )
        break
      }
    }
    
    await this.updateProgress(40, 'extract', 'chunking', 'Creating content chunks')
    
    // Choose chunking method based on content type and size
    if (markdown.length < 2000 && detection.format !== 'transcript') {
      // Small content - use simple chunking
      chunks = simpleMarkdownChunking(markdown)
    } else {
      // Large content or transcript - use semantic chunking
      chunks = await this.withRetry(
        async () => rechunkMarkdown(this.ai, markdown),
        'Semantic chunking'
      )
    }
    
    // Handle timestamps if present
    if (detection.hasTimestamps) {
      const timestamps = extractTimestampsWithContext(markdown)
      
      if (timestamps.length > 0) {
        console.log(`⏰ Preserved ${timestamps.length} timestamps`)
        
        // Add timestamps to chunks
        chunks.forEach((chunk, index) => {
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
                confidence: wasTranscript ? 0.95 : 0.8,
                method: wasTranscript ? 'transcript_preserved' : 'timestamp_detected',
                has_timestamps: true
              }
            })
          }
        })
      }
    }
    
    await this.updateProgress(45, 'extract', 'complete', `Created ${chunks.length} chunks`)
    
    // Extract metadata
    const wordCount = markdown.split(/\s+/).length
    const headingMatches = markdown.match(/^#{1,6}\s+.+$/gm) || []
    const outline = headingMatches.slice(0, 10).map(h => h.replace(/^#+\s+/, ''))
    
    // Collect themes if semantic chunking was used
    let documentThemes: string[] | undefined
    if (chunks.length > 0 && 'themes' in chunks[0]) {
      const themeFrequency = new Map<string, number>()
      chunks.forEach(chunk => {
        if (chunk.themes) {
          chunk.themes.forEach((theme: string) => {
            themeFrequency.set(theme, (themeFrequency.get(theme) || 0) + 1)
          })
        }
      })
      
      documentThemes = Array.from(themeFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme]) => theme)
    }
    
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
          detected_format: detection.format,
          format_confidence: detection.confidence,
          has_timestamps: detection.hasTimestamps,
          was_transcript: wasTranscript,
          detected_language: detection.language,
          document_themes: documentThemes,
          processing_mode: 'paste',
          original_size_kb: contentKB
        }
      }
    }
  }
}