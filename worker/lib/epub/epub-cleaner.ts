/**
 * Remove EPUB-specific artifacts from markdown.
 * Aggressively cleans publisher boilerplate, TOC links, CSS metadata,
 * garbled headers, and structural junk.
 *
 * Personal tool: Defaults to aggressive cleanup with logging.
 */
export function cleanEpubArtifacts(markdown: string): string {
  let cleaned = markdown
  let removedBytes = 0

  // 1. Remove CSS/style metadata (catches any that leaked through htmlToMarkdown)
  // Pattern: @page {...}, @font-face {...}, or any CSS directives
  cleaned = cleaned.replace(
    /@(?:page|font-face|media|import|charset)\s*\{[^}]*\}/g,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed CSS directive: ${match.slice(0, 50)}...`)
      return ''
    }
  )

  // 2. Remove general PDF styling metadata
  // Matches: { ...pt; ...pt; } patterns (CSS styling that leaked through)
  cleaned = cleaned.replace(
    /\{[^}]*\d+\.\d+pt[^}]*\}/g,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed styling metadata: ${match.trim()}`)
      return ''
    }
  )

  // 3. Remove garbled all-caps running headers (no spaces, 15+ chars)
  // Pattern: **THETHREESTIGMATAOFPALMERELDRITCH** or without bold
  cleaned = cleaned.replace(
    /\*\*[A-Z]{15,}\*\*/g,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed garbled bold header: ${match.substring(0, 50)}...`)
      return ''
    }
  )

  // Also without bold markers, on its own line
  cleaned = cleaned.replace(
    /^[A-Z]{15,}$/gm,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed garbled header: ${match.substring(0, 50)}...`)
      return ''
    }
  )

  // 4. Format real chapter headings (short all-caps on own line)
  // Pattern: **THREE** or **CHAPTER ONE**
  cleaned = cleaned.replace(
    /\n\n(\*\*)?([A-Z]+(?:\s+[A-Z]+){0,3})(\*\*)?\n\n/g,
    (match, _bold1, text, _bold2) => {
      const words = text.trim().split(/\s+/)

      // Only if it's 1-4 words, all caps, and looks like a heading (short enough)
      if (
        words.length <= 4 &&
        words.every((w: string) => w === w.toUpperCase()) &&
        text.length < 30 // Short enough to be a heading
      ) {
        console.log(`[epub-cleaner] Formatted as chapter heading: ${text}`)
        return `\n\n## ${text}\n\n`
      }

      return match
    }
  )

  // 5. Remove publisher boilerplate at start
  const contentStart = cleaned.search(/^#{1,2}\s+(chapter|prologue|part|introduction)/im)
  if (contentStart > 0) {
    const preContent = cleaned.slice(0, contentStart)

    const isBoilerplate = (
      preContent.match(/ISBN|copyright|publisher|all rights reserved|portions of/i) !== null ||
      (preContent.match(/\[chapter \d+[^\]]*\]\([^\)]+\)/gi)?.length ?? 0) >= 3 // TOC links
    )

    if (isBoilerplate && preContent.length < 3000) {
      removedBytes += preContent.length
      cleaned = cleaned.slice(contentStart)
    }
  }

  // 6. Remove table of contents sections (multiple consecutive TOC links)
  cleaned = cleaned.replace(
    /(?:\[(?:chapter|prologue|epilogue|part)[^\]]*\]\([^\)]+\)\s*\n){3,}/gi,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 7. Remove EPUB filename headings
  cleaned = cleaned.replace(
    /^#{1,6}\s+[\w\d]+[-_][\w\d]+[-_.]+[\w\d.]+\.x?html?\s*$/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 8. Remove standalone filename lines
  cleaned = cleaned.replace(
    /^[\w\d]+[-_][\w\d]+[-_.]+[\w\d.]+\.x?html?\s*$/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 9. Remove localhost/file:// URLs (keep text, strip link)
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((https?:\/\/localhost|file:\/\/)[^\)]+\)/g,
    '$1'
  )

  // 10. Remove "Publisher's Note" sections
  cleaned = cleaned.replace(
    /^#{1,3}\s*Publisher'?s? Note\s*\n[\s\S]*?(?=\n#{1,3}|\n\n[A-Z]|$)/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 11. Clean excessive whitespace
  cleaned = cleaned
    .replace(/\n{4,}/g, '\n\n\n')  // Max 2 blank lines
    .replace(/^---\s*\n/gm, '')    // Remove orphaned horizontal rules
    .trim()

  // Log what was removed
  if (removedBytes > 0) {
    const kb = (removedBytes / 1024).toFixed(1)
    console.log(`[epub-cleaner] Removed ${kb}KB of EPUB artifacts`)
  }

  return cleaned
}
