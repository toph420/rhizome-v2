/**
 * Text Cleanup Utilities
 *
 * Post-processing cleanup for PDF-extracted markdown to remove page artifacts
 * that Gemini might miss. This catches predictable patterns like page numbers,
 * running headers, and footers that interrupt sentence flow.
 *
 * Cost: $0 (runs locally with regex)
 * Speed: Instant (milliseconds)
 */

/**
 * Clean page artifacts from extracted PDF markdown.
 *
 * Handles common patterns:
 * - Standalone page numbers between sentence fragments
 * - Running headers/footers (author names, chapter titles)
 * - Page number + header combinations
 * - Preserves intentional paragraph breaks
 *
 * @param markdown - Raw markdown from Gemini extraction
 * @returns Cleaned markdown with artifacts removed
 *
 * @example
 * // Input: "...in terms of\n\n303 Author Name\n\nstrict laws..."
 * // Output: "...in terms of strict laws..."
 */
export function cleanPageArtifacts(markdown: string): string {
  let cleaned = markdown

  // Pattern 1: Standalone page numbers
  // Matches: \n\n123\n\n (page number on its own line)
  // Between lowercase text (sentence fragments: "word\n\n123\n\nword")
  cleaned = cleaned.replace(/([a-z,;:])\n\n\d{1,4}\n\n([a-z])/g, '$1 $2')

  // Pattern 2: Page number + header text combinations
  // Matches: \n\n303 Author Name\n\n or \n\n47 Chapter Title\n\n
  // Between sentence fragments (lowercase before and after)
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n\d{1,4}\s+[A-Z][^\n]+\n\n([a-z])/g,
    '$1 $2'
  )

  // Pattern 3: Running headers/footers without page numbers
  // Matches: \n\nAuthor Name\n\n or \n\nChapter Title\n\n
  // Between sentence fragments (lowercase before, lowercase after)
  // Only if the header is short (< 60 chars, typical header length)
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n([A-Z][^\n]{1,60})\n\n([a-z])/g,
    (match, before, header, after) => {
      // Only remove if header doesn't end with sentence-ending punctuation
      // (preserves actual content that happens to be capitalized)
      if (!/[.!?]$/.test(header.trim())) {
        return `${before} ${after}`
      }
      return match // Keep original if it looks like real content
    }
  )

  // Pattern 4: Roman numeral page numbers with ALL CAPS section labels
  // Matches: \n\nxii PREFACE\n\n or \n\niv INTRODUCTION\n\n
  // Common in book front matter (preface, introduction, etc.)
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n[ivxlcdm]+\s+[A-Z][A-Z\s]+\n\n([a-z])/gi,
    '$1 $2'
  )

  // Pattern 5: "Page N" or "p. N" style markers
  // Matches: \n\nPage 47\n\n or \n\np. 123\n\n
  cleaned = cleaned.replace(/([a-z,;:])\n\n[Pp](?:age)?\.?\s*\d{1,4}\n\n([a-z])/g, '$1 $2')

  // Pattern 6: Clean up multiple consecutive spaces (from our replacements)
  cleaned = cleaned.replace(/ {2,}/g, ' ')

  // Pattern 7: Normalize paragraph breaks
  // Preserve intentional breaks (3+ newlines = semantic paragraph break)
  // But normalize to exactly 2 newlines for consistency
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // Pattern 8: Remove trailing/leading whitespace on lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')

  return cleaned
}

/**
 * Aggressive cleanup for particularly messy PDFs.
 *
 * Use this if the standard cleanup doesn't catch enough artifacts.
 * More aggressive = higher chance of removing legitimate content.
 *
 * @param markdown - Raw markdown from Gemini extraction
 * @returns Aggressively cleaned markdown
 */
export function aggressiveCleanPageArtifacts(markdown: string): string {
  let cleaned = markdown

  // Remove ANY line that's just a number + capitalized text between sentences
  // More aggressive than standard cleanup
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n\d{1,4}[^\n]*\n\n([a-z])/g,
    '$1 $2'
  )

  // Remove ANY short capitalized line between sentences
  // (assumes headers are rarely longer than 80 chars)
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n[A-Z][^\n]{1,80}\n\n([a-z])/g,
    (match, before, after) => `${before} ${after}`
  )

  // Apply standard cleanup patterns too
  cleaned = cleaned.replace(/ {2,}/g, ' ')
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  cleaned = cleaned
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')

  return cleaned
}
