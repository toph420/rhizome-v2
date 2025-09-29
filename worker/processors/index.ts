/**
 * Barrel export file for document processors.
 * Re-exports all processor classes and types for convenient importing.
 */

export { SourceProcessor } from './base.js'
export type { BackgroundJob } from './base.js'
export type { 
  ProcessResult,
  ProcessedChunk,
  DocumentMetadata,
  OutlineSection,
  PositionContext,
  ProgressUpdate,
  ProcessingOptions
} from '../types/processor.js'

// Processor exports
export { PDFProcessor } from './pdf-processor.js'
export { YouTubeProcessor } from './youtube-processor.js'
export { WebProcessor } from './web-processor.js'
export { MarkdownAsIsProcessor, MarkdownCleanProcessor } from './markdown-processor.js'
export { TextProcessor } from './text-processor.js'
export { PasteProcessor } from './paste-processor.js'

// Router export
export { ProcessorRouter } from './router.js'