import type { EPUBMetadata } from './epub-parser.js'

/**
 * Document types for semantic chunking and metadata extraction.
 * Maps to the AI prompts in ai-chunking-batch.ts
 */
export type DocumentType = 'fiction' | 'technical_manual' | 'academic_paper'

/**
 * Infer document type from EPUB metadata.
 * Uses simple heuristics based on publisher and subjects.
 * Can be overridden in the preview UI.
 *
 * @param metadata - EPUB metadata from OPF file
 * @returns Inferred document type
 */
export function inferDocumentType(metadata: EPUBMetadata): DocumentType {
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''
  const publisher = metadata.publisher?.toLowerCase() || ''
  const title = metadata.title?.toLowerCase() || ''

  // Technical books - programming, technology, computing
  if (
    publisher.includes("o'reilly") ||
    publisher.includes('oreilly') ||
    publisher.includes('packt') ||
    publisher.includes('manning') ||
    publisher.includes('apress') ||
    publisher.includes('no starch') ||
    publisher.includes('pragmatic') ||
    subjects.includes('programming') ||
    subjects.includes('software') ||
    subjects.includes('computer') ||
    subjects.includes('technology') ||
    subjects.includes('coding') ||
    subjects.includes('development') ||
    title.includes('programming') ||
    title.includes('developer')
  ) {
    return 'technical_manual'
  }

  // Academic papers and textbooks
  if (
    subjects.includes('textbook') ||
    subjects.includes('academic') ||
    subjects.includes('education') ||
    subjects.includes('research') ||
    subjects.includes('science') ||
    subjects.includes('mathematics') ||
    subjects.includes('physics') ||
    subjects.includes('chemistry') ||
    subjects.includes('biology') ||
    publisher.includes('university press') ||
    publisher.includes('oxford') ||
    publisher.includes('cambridge') ||
    publisher.includes('springer') ||
    publisher.includes('wiley') ||
    publisher.includes('pearson')
  ) {
    return 'academic_paper'
  }

  // Default to fiction for novels, literature, etc.
  return 'fiction'
}
