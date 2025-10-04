/**
 * Shared metadata types for unified document preview across all source types.
 * Used by API routes, components, and actions to ensure consistent metadata handling.
 */

/**
 * Document type classifications for chunking strategy.
 * Influences how the worker segments and processes content.
 */
export type DocumentType =
  | 'fiction'              // Narrative structure, character-focused
  | 'nonfiction_book'      // Informational, concept-focused
  | 'academic_paper'       // Research-oriented, citation-heavy
  | 'technical_manual'     // Instructional, reference-style
  | 'article'              // Short-form, topic-focused
  | 'essay'                // Analytical, argument-focused

/**
 * Metadata detected from document sources.
 * Used for preview, editing, and worker routing.
 */
export interface DetectedMetadata {
  title: string
  author: string
  type: DocumentType
  year?: string           // Publication year (string for flexibility)
  publisher?: string
  isbn?: string           // EPUB only
  description?: string    // AI-generated or from source
  coverImage?: string     // base64 data URI, HTTP URL, or undefined
  language?: string       // ISO 639-1 code (default: 'en')
}

/**
 * Convert base64 data URI to Blob for upload to Supabase Storage.
 * Used for EPUB cover images.
 *
 * @param base64 - Data URI format: "data:image/jpeg;base64,..."
 * @returns Blob with correct MIME type
 */
export function base64ToBlob(base64: string): Blob {
  const [header, data] = base64.split(',')
  const mimeMatch = header.match(/:(.*?);/)
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg'

  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }

  return new Blob([array], { type: mimeType })
}
