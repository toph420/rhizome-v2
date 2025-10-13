/**
 * Build context strings from Docling structural metadata.
 *
 * Used to enhance embeddings with document structure information
 * WITHOUT modifying the stored chunk content.
 *
 * Research backing:
 * - Metadata context improves retrieval by 15-25%
 * - More efficient than chunk overlap (no token duplication)
 * - Preserves citation information
 */

export interface ChunkWithMetadata {
  content: string
  heading_path?: string[] | null
  page_start?: number | null
  page_end?: number | null
  section_marker?: string | null
}

/**
 * Build context string from structural metadata.
 *
 * Examples:
 * - PDF: "Chapter 3 > Results > Discussion | Page 42"
 * - EPUB: "Part II > Chapter 5 > The Awakening"
 */
export function buildMetadataContext(chunk: ChunkWithMetadata): string {
  const parts: string[] = []

  // Add heading hierarchy (most important)
  if (chunk.heading_path && chunk.heading_path.length > 0) {
    parts.push(chunk.heading_path.join(' > '))
  }

  // Add page context (for PDFs, citation support)
  if (chunk.page_start !== null && chunk.page_start !== undefined) {
    if (chunk.page_end && chunk.page_end !== chunk.page_start) {
      parts.push(`Pages ${chunk.page_start}-${chunk.page_end}`)
    } else {
      parts.push(`Page ${chunk.page_start}`)
    }
  }

  // Add section marker (for EPUBs)
  if (chunk.section_marker && !chunk.page_start) {
    parts.push(chunk.section_marker.replace(/_/g, ' '))
  }

  return parts.join(' | ')
}

/**
 * Create enhanced text for embedding.
 *
 * Prepends metadata context to chunk content.
 * The stored content remains unchanged - this is ONLY for embeddings.
 */
export function createEnhancedEmbeddingText(chunk: ChunkWithMetadata): string {
  const context = buildMetadataContext(chunk)

  if (!context) {
    return chunk.content
  }

  return `${context}\n\n${chunk.content}`
}

/**
 * Validate that enhancement doesn't exceed token limits.
 */
export function validateEnhancedText(
  originalText: string,
  enhancedText: string,
  maxTokens: number = 1024
): { valid: boolean; estimatedTokens: number; warning?: string } {
  // Rough token estimate: 1 token ≈ 4 characters
  const estimatedTokens = Math.ceil(enhancedText.length / 4)

  if (estimatedTokens > maxTokens) {
    return {
      valid: false,
      estimatedTokens,
      warning: `Enhanced text (~${estimatedTokens} tokens) exceeds limit (${maxTokens})`
    }
  }

  // Context should be <10% of total (sanity check)
  const contextRatio = (enhancedText.length - originalText.length) / enhancedText.length
  if (contextRatio > 0.1) {
    return {
      valid: true,
      estimatedTokens,
      warning: `Context is ${(contextRatio * 100).toFixed(1)}% of total (expected <10%)`
    }
  }

  return { valid: true, estimatedTokens }
}
