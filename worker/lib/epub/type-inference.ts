import type { EPUBMetadata } from './epub-parser.js'

/**
 * Document types for semantic chunking and metadata extraction.
 * Maps to the AI prompts in ai-chunking-batch.ts
 */
export type DocumentType = 'fiction' | 'technical_manual' | 'academic_paper'

/**
 * Infer document type from EPUB metadata.
 * Uses priority-based heuristics to prevent misclassification.
 * Can be overridden in the preview UI.
 *
 * Priority order:
 * 1. Fiction (check first to prevent "science fiction" → academic)
 * 2. Technical manuals
 * 3. Academic papers
 * 4. Default to fiction
 *
 * @param metadata - EPUB metadata from OPF file
 * @returns Inferred document type
 */
export function inferDocumentType(metadata: EPUBMetadata): DocumentType {
  const subjects = metadata.subjects?.join(' ').toLowerCase() || ''
  const publisher = metadata.publisher?.toLowerCase() || ''
  const title = metadata.title?.toLowerCase() || ''
  const author = metadata.author?.toLowerCase() || ''

  // PRIORITY 1: Fiction detection (highest priority to prevent false positives)
  // Check for explicit fiction indicators
  if (
    subjects.match(/fiction|novel|science fiction|fantasy|mystery|thriller|romance|adventure/i) ||
    title.match(/\b(dream|darkness|sheep|dune|foundation|dragons|chronicles)\b/i) ||
    author.match(/le guin|ursula|dick|philip k\.|asimov|bradbury|butler|octavia|heinlein|clarke|herbert/i) ||
    publisher.includes('tor') ||
    publisher.includes('orbit') ||
    publisher.includes('daw') ||
    publisher.includes('ballantine') ||
    publisher.includes('del rey')
  ) {
    return 'fiction'
  }

  // PRIORITY 2: Technical books - programming, technology, computing
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

  // PRIORITY 3: Academic papers and textbooks
  // Only match after ruling out fiction (prevents "science fiction" → academic)
  if (
    subjects.includes('textbook') ||
    subjects.includes('academic') ||
    subjects.includes('education') ||
    subjects.includes('research') ||
    subjects.match(/\b(science|mathematics|physics|chemistry|biology)\b/i) || // Use word boundaries
    publisher.includes('university press') ||
    publisher.includes('oxford') ||
    publisher.includes('cambridge') ||
    publisher.includes('springer') ||
    publisher.includes('wiley') ||
    publisher.includes('pearson')
  ) {
    return 'academic_paper'
  }

  // Default to fiction for novels, literature, unknown types
  return 'fiction'
}
