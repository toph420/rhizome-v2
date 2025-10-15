/**
 * Parse inline metadata from Docling markdown with embedded chunk markers.
 * Replaces bulletproof matching for documents with inline metadata.
 *
 * Format:
 * <!-- CHUNK id="chunk-0" page_start="1" page_end="2" heading="Introduction" heading_level="2" -->
 * Content here...
 * <!-- /CHUNK -->
 */

export interface InlineChunkMetadata {
  id: string
  content: string
  start_offset: number
  end_offset: number
  page_start: number | null
  page_end: number | null
  heading_path: string[] | null
  heading_level: number | null
  section_marker: string | null
}

const CHUNK_START_REGEX = /<!-- CHUNK (.*?) -->/g
const CHUNK_END_REGEX = /<!-- \/CHUNK -->/g

/**
 * Parse inline metadata from markdown with embedded chunk markers.
 *
 * @param markdown - Markdown string with inline metadata comments
 * @returns Array of parsed chunks with metadata and content
 */
export function parseInlineMetadata(markdown: string): InlineChunkMetadata[] {
  const chunks: InlineChunkMetadata[] = []

  // Find all chunk start markers
  const startMatches: Array<{ index: number; meta: Record<string, string> }> = []
  let match

  // Reset regex lastIndex
  CHUNK_START_REGEX.lastIndex = 0

  while ((match = CHUNK_START_REGEX.exec(markdown)) !== null) {
    const metaString = match[1]
    const meta = parseMetaAttributes(metaString)
    startMatches.push({ index: match.index, meta })
  }

  if (startMatches.length === 0) {
    console.warn('[InlineMetadataParser] No chunk markers found in markdown')
    return []
  }

  // Extract content between markers
  for (let i = 0; i < startMatches.length; i++) {
    const start = startMatches[i]
    const nextStart = startMatches[i + 1]

    // Find content between <!-- CHUNK --> and <!-- /CHUNK -->
    const startMarkerEnd = markdown.indexOf('-->', start.index) + 3

    // Find the next /CHUNK marker
    const endMarkerStart = nextStart
      ? markdown.lastIndexOf('<!-- /CHUNK -->', nextStart.index)
      : markdown.lastIndexOf('<!-- /CHUNK -->')

    if (endMarkerStart === -1 || endMarkerStart < startMarkerEnd) {
      console.warn(`[InlineMetadataParser] Malformed chunk ${i}: Missing or misplaced end marker`)
      continue
    }

    // Extract content (trim to remove newlines around markers)
    const content = markdown.slice(startMarkerEnd, endMarkerStart).trim()

    // Parse metadata
    const chunk: InlineChunkMetadata = {
      id: start.meta.id || `chunk-${i}`,
      content,
      start_offset: startMarkerEnd,
      end_offset: endMarkerStart,
      page_start: start.meta.page_start ? parseInt(start.meta.page_start, 10) : null,
      page_end: start.meta.page_end ? parseInt(start.meta.page_end, 10) : null,
      heading_path: start.meta.heading ? [start.meta.heading] : null,
      heading_level: start.meta.heading_level ? parseInt(start.meta.heading_level, 10) : null,
      section_marker: start.meta.section_marker || null,
    }

    chunks.push(chunk)
  }

  console.log(`[InlineMetadataParser] Parsed ${chunks.length} chunks from inline metadata`)

  return chunks
}

/**
 * Parse HTML comment attributes into key-value pairs.
 *
 * Example: 'id="chunk-0" page_start="1"' → { id: 'chunk-0', page_start: '1' }
 *
 * @param metaString - Attribute string from HTML comment
 * @returns Object with parsed attributes
 */
function parseMetaAttributes(metaString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /(\w+)="([^"]*)"/g
  let match

  while ((match = attrRegex.exec(metaString)) !== null) {
    const key = match[1]
    let value = match[2]

    // Unescape HTML entities
    value = value.replace(/&quot;/g, '"')

    attrs[key] = value
  }

  return attrs
}

/**
 * Strip inline metadata markers from markdown, leaving only clean content.
 * Useful for final display or storage after metadata has been extracted.
 *
 * @param markdown - Markdown with inline metadata
 * @returns Clean markdown without markers
 */
export function stripInlineMetadata(markdown: string): string {
  // Remove all chunk markers
  let clean = markdown.replace(/<!-- CHUNK .*? -->\n?/g, '')
  clean = clean.replace(/<!-- \/CHUNK -->\n?/g, '')

  // Normalize multiple blank lines to single blank lines
  clean = clean.replace(/\n{3,}/g, '\n\n')

  return clean.trim()
}

/**
 * Check if markdown contains inline metadata markers.
 *
 * @param markdown - Markdown to check
 * @returns True if inline metadata markers are present
 */
export function hasInlineMetadata(markdown: string): boolean {
  return markdown.includes('<!-- CHUNK') && markdown.includes('<!-- /CHUNK -->')
}

/**
 * Validate inline metadata structure.
 * Checks that all chunks have matching start/end markers.
 *
 * @param markdown - Markdown with inline metadata
 * @returns Object with validation result and any errors
 */
export function validateInlineMetadata(markdown: string): {
  valid: boolean
  errors: string[]
  chunkCount: number
} {
  const errors: string[] = []

  // Count start and end markers
  const startCount = (markdown.match(/<!-- CHUNK/g) || []).length
  const endCount = (markdown.match(/<!-- \/CHUNK -->/g) || []).length

  if (startCount !== endCount) {
    errors.push(`Mismatched markers: ${startCount} start markers, ${endCount} end markers`)
  }

  // Check for nested markers (not allowed)
  const nestedPattern = /<!-- CHUNK.*?<!-- CHUNK/
  if (nestedPattern.test(markdown)) {
    errors.push('Nested CHUNK markers detected (not allowed)')
  }

  // Try to parse
  try {
    const chunks = parseInlineMetadata(markdown)
    if (chunks.length === 0 && startCount > 0) {
      errors.push('Failed to parse any chunks despite markers being present')
    }

    return {
      valid: errors.length === 0,
      errors,
      chunkCount: chunks.length,
    }
  } catch (error) {
    errors.push(`Parsing failed: ${error instanceof Error ? error.message : String(error)}`)
    return {
      valid: false,
      errors,
      chunkCount: 0,
    }
  }
}
