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
 * - Garbled headers (all caps, no spaces from poor OCR)
 * - PDF metadata (CSS styling, margin settings)
 * - Page number + header combinations
 * - Formats standalone chapter numbers as headings
 * - Preserves intentional paragraph breaks
 *
 * @param markdown - Raw markdown from Gemini extraction
 * @returns Cleaned markdown with artifacts removed
 *
 * @example
 * // Input: "...in terms of\n\n303 Author Name\n\nstrict laws..."
 * // Output: "...in terms of strict laws..."
 *
 * @example
 * // Input: "**THETHREESTIGMATAOFPALMERELDRITCH**\n\n@page { margin: 5pt }\n\n**THREE**\n\nIn a bar..."
 * // Output: "## THREE\n\nIn a bar..."
 */
export function cleanPageArtifacts(markdown: string): string {
  let cleaned = markdown

  // Pattern 1: Remove garbled all-caps running headers (no spaces, 20+ chars)
  // Matches: **THETHREESTIGMATAOFPALMERELDRITCH** or THETHREESTIGMATAOFPALMERELDRITCH
  // These are typically book titles with poor OCR/extraction
  cleaned = cleaned.replace(
    /\*\*[A-Z]{20,}\*\*\s*\n/g,
    (match) => {
      console.log(`[text-cleanup] Removed garbled bold header: ${match.trim().substring(0, 50)}...`)
      return ''
    }
  )

  cleaned = cleaned.replace(
    /^[A-Z]{20,}\s*$/gm,
    (match) => {
      console.log(`[text-cleanup] Removed garbled header: ${match.trim().substring(0, 50)}...`)
      return ''
    }
  )

  // Pattern 2: Remove PDF/CSS metadata
  // Matches: @page { margin-bottom: 5.000000pt; ... } or similar CSS directives
  cleaned = cleaned.replace(
    /@page\s*\{[^}]+\}\s*/g,
    (match) => {
      console.log(`[text-cleanup] Removed PDF @page metadata: ${match.trim().substring(0, 50)}...`)
      return ''
    }
  )

  // Pattern 3: Remove general PDF styling metadata
  // Matches: { ...pt; ...pt; } patterns (PDF styling that leaked through)
  cleaned = cleaned.replace(
    /\{[^}]*\d+\.\d+pt[^}]*\}\s*/g,
    (match) => {
      console.log(`[text-cleanup] Removed styling metadata: ${match.trim()}`)
      return ''
    }
  )

  // Pattern 4: Standalone page numbers
  // Matches: \n\n123\n\n (page number on its own line)
  // Between lowercase text (sentence fragments: "word\n\n123\n\nword")
  cleaned = cleaned.replace(/([a-z,;:])\n\n\d{1,4}\n\n([a-z])/g, '$1 $2')

  // Pattern 5: Page number + header text combinations
  // Matches: \n\n303 Author Name\n\n or \n\n47 Chapter Title\n\n
  // Between sentence fragments (lowercase before and after)
  cleaned = cleaned.replace(
    /([a-z"')\].,;:])\n\n(\d{1,4})\n\n([A-Z][A-Za-z\s]{3,60})\n\n([A-Z])/g,
    (_match, before, pageNum, header, after) => {
      console.log(`[text-cleanup] Removed page ${pageNum} + header: "${header}"`)
      return `${before}\n\n${after}`
    }
  )

  // Pattern 6: Running headers/footers without page numbers
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

  // Pattern 7: Roman numeral page numbers with ALL CAPS section labels
  // Matches: \n\nxii PREFACE\n\n or \n\niv INTRODUCTION\n\n
  // Common in book front matter (preface, introduction, etc.)
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n[ivxlcdm]+\s+[A-Z][A-Z\s]+\n\n([a-z])/gi,
    '$1 $2'
  )

  // Pattern 8: "Page N" or "p. N" style markers
  // Matches: \n\nPage 47\n\n or \n\np. 123\n\n
  cleaned = cleaned.replace(/([a-z,;:])\n\n[Pp](?:age)?\.?\s*\d{1,4}\n\n([a-z])/g, '$1 $2')

  // Pattern 9: Split sentences that were interrupted by artifacts
  // Matches: word\n\n123 Header Text\n\nword
  cleaned = cleaned.replace(
    /([a-z,;:])\n\n\d{1,4}\s+[A-Z][^\n]+\n\n([a-z])/g,
    '$1 $2'
  )

  // Pattern 10: Format standalone chapter numbers/titles as headings
  // Matches: **THREE** or THREE (short all-caps text, 1-3 words)
  // Only if it appears after cleanup and isn't already a heading
  cleaned = cleaned.replace(
    /\n\n(\*\*)?([A-Z]+(?:\s+[A-Z]+){0,2})(\*\*)?\n\n/g,
    (match, _bold1, text, _bold2) => {
      const words = text.split(/\s+/)
      // Only if it's short (1-3 words) and all caps (likely chapter heading)
      if (words.length <= 3 && words.every((w: string) => w === w.toUpperCase())) {
        console.log(`[text-cleanup] Formatted as chapter heading: ${text}`)
        return `\n\n## ${text}\n\n`
      }
      return match
    }
  )

  // Pattern 11: Clean up multiple consecutive spaces (from our replacements)
  cleaned = cleaned.replace(/ {2,}/g, ' ')

  // Pattern 12: Normalize paragraph breaks
  // Preserve intentional breaks but avoid excessive whitespace
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

  // Pattern 13: Remove trailing/leading whitespace on lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')

  return cleaned.trim()
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
    (_match, before, after) => `${before} ${after}`
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
