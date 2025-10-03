import { SourceProcessor } from './base.js'
import { PDFProcessor } from './pdf-processor.js'
import { EPUBProcessor } from './epub-processor.js'
import { YouTubeProcessor } from './youtube-processor.js'
import { WebProcessor } from './web-processor.js'
import { MarkdownAsIsProcessor, MarkdownCleanProcessor } from './markdown-processor.js'
import { TextProcessor } from './text-processor.js'
import { PasteProcessor } from './paste-processor.js'
import type { SourceType } from '../types/multi-format.js'

/**
 * Processor router for selecting the appropriate processor based on source type.
 * This implements the Factory pattern to create the correct processor instance
 * for each document source type.
 */
export class ProcessorRouter {
  /**
   * Creates the appropriate processor instance based on source type.
   * 
   * @param sourceType - The type of source document to process
   * @param ai - GoogleGenAI instance
   * @param supabase - Supabase client instance
   * @param job - Background job data
   * @returns The appropriate processor instance
   * @throws {Error} If source type is unknown or invalid
   */
  static createProcessor(
    sourceType: SourceType,
    ai: any,
    supabase: any,
    job: any
  ): SourceProcessor {
    console.log(`🏗️ Creating processor for source type: ${sourceType}`)
    
    switch (sourceType) {
      case 'pdf':
        console.log('📄 Using PDFProcessor')
        return new PDFProcessor(ai, supabase, job)

      case 'epub':
        console.log('📚 Using EPUBProcessor')
        return new EPUBProcessor(ai, supabase, job)

      case 'youtube':
        console.log('🎬 Using YouTubeProcessor')
        return new YouTubeProcessor(ai, supabase, job)

      case 'web_url':
        console.log('🌐 Using WebProcessor')
        return new WebProcessor(ai, supabase, job)

      case 'markdown_asis':
        console.log('📝 Using MarkdownAsIsProcessor (no AI)')
        return new MarkdownAsIsProcessor(ai, supabase, job)

      case 'markdown_clean':
        console.log('✨ Using MarkdownCleanProcessor (with AI)')
        return new MarkdownCleanProcessor(ai, supabase, job)

      case 'txt':
        console.log('📄 Using TextProcessor')
        return new TextProcessor(ai, supabase, job)

      case 'paste':
        console.log('📋 Using PasteProcessor')
        return new PasteProcessor(ai, supabase, job)

      default:
        const validTypes = ['pdf', 'epub', 'youtube', 'web_url', 'markdown_asis', 'markdown_clean', 'txt', 'paste']
        throw new Error(
          `Unknown source type: ${sourceType}. Valid types are: ${validTypes.join(', ')}`
        )
    }
  }
  
  /**
   * Validates that a source type is supported.
   * 
   * @param sourceType - The source type to validate
   * @returns True if valid, false otherwise
   */
  static isValidSourceType(sourceType: string): sourceType is SourceType {
    const validTypes: SourceType[] = ['pdf', 'epub', 'youtube', 'web_url', 'markdown_asis', 'markdown_clean', 'txt', 'paste']
    return validTypes.includes(sourceType as SourceType)
  }
  
  /**
   * Gets a human-readable name for a source type.
   * 
   * @param sourceType - The source type
   * @returns Human-readable name
   */
  static getSourceTypeName(sourceType: SourceType): string {
    const names: Record<SourceType, string> = {
      pdf: 'PDF Document',
      epub: 'EPUB Book',
      youtube: 'YouTube Video',
      web_url: 'Web Article',
      markdown_asis: 'Markdown (As-Is)',
      markdown_clean: 'Markdown (Enhanced)',
      txt: 'Plain Text',
      paste: 'Pasted Content'
    }
    return names[sourceType] || sourceType
  }
}