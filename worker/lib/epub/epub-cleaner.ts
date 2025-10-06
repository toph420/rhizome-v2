/**
 * Remove EPUB-specific artifacts from markdown.
 * Aggressively cleans publisher boilerplate, TOC links, CSS metadata,
 * garbled headers, repeated titles, and structural junk.
 *
 * Personal tool: Defaults to aggressive cleanup with logging.
 */
export function cleanEpubArtifacts(markdown: string): string {
  let cleaned = markdown
  let removedBytes = 0

  // 1. Remove repeated title blocks at document start
  // Pattern: Same word/title repeated 5+ times (bold or plain) within first 1000 chars
  const firstSection = cleaned.slice(0, 1000)
  const titlePattern = /(?:\*\*)?([A-Z][a-z]{2,20})(?:\*\*)?\s*\n/gi
  const matches = [...firstSection.matchAll(titlePattern)]

  if (matches.length >= 5) {
    // Check if the same word appears repeatedly
    const words = matches.map(m => m[1].toLowerCase())
    const wordCounts = words.reduce((acc, word) => {
      acc[word] = (acc[word] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // If any word appears 5+ times, remove the entire repetitive block
    const repeatedWord = Object.entries(wordCounts).find(([_, count]) => count >= 5)
    if (repeatedWord) {
      console.log(`[epub-cleaner] Found repeated title: "${repeatedWord[0]}" (${repeatedWord[1]} times)`)

      // Find where the repetition ends (first real content paragraph)
      const endOfRepetition = cleaned.search(/\n\n(?:By |Chapter |#{1,3}\s+Chapter|[A-Z][a-z]+\s+[a-z]{3,})/i)

      if (endOfRepetition > 0 && endOfRepetition < 1500) {
        removedBytes += endOfRepetition
        cleaned = cleaned.slice(endOfRepetition).trim()
        console.log(`[epub-cleaner] Removed ${endOfRepetition} chars of repeated title block`)
      }
    }
  }

  // 2. Remove standalone "Cover" text
  cleaned = cleaned.replace(
    /^\*\*Cover\*\*$|^Cover$/gm,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed standalone Cover text`)
      return ''
    }
  )

  // 3. Remove EPUB chapter filename artifacts
  // Pattern: "BookTitle - Author-0002" or "Title - Author Name-0003"
  cleaned = cleaned.replace(
    /^.+?\s+-\s+[A-Z][a-z]+[-\s]*-?\d{4,}$/gm,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed filename artifact: ${match}`)
      return ''
    }
  )

  // 4. Remove "By Author, Name" lines
  cleaned = cleaned.replace(
    /^By\s+[A-Z][a-z]+,\s*[A-Z]\.?[A-Z]?\.?$/gm,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed author attribution: ${match}`)
      return ''
    }
  )

  // 5. Remove standalone title repetitions (plain word on its own line, appears 3+ times in a row)
  // Pattern: "Crash\nCrash\nCrash" → delete all
  cleaned = cleaned.replace(
    /^([A-Z][a-z]{2,15})(?:\n\1){2,}$/gm,
    (match, word) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed repeated standalone title: ${word}`)
      return ''
    }
  )

  // 6. Remove CSS/style metadata (catches any that leaked through htmlToMarkdown)
  // Pattern: @page {...}, @font-face {...}, or any CSS directives
  cleaned = cleaned.replace(
    /@(?:page|font-face|media|import|charset)\s*\{[^}]*\}/g,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed CSS directive: ${match.slice(0, 50)}...`)
      return ''
    }
  )

  // 7. Remove general PDF styling metadata
  // Matches: { ...pt; ...pt; } patterns (CSS styling that leaked through)
  cleaned = cleaned.replace(
    /\{[^}]*\d+\.\d+pt[^}]*\}/g,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed styling metadata: ${match.trim()}`)
      return ''
    }
  )

  // 8. Remove garbled all-caps running headers (no spaces, 15+ chars)
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

  // 9. Format real chapter headings (short all-caps or "Chapter N" on own line)
  // Pattern: **THREE** or **CHAPTER ONE** or **Chapter 1**
  cleaned = cleaned.replace(
    /\n\n(\*\*)?([A-Z]+(?:\s+[A-Z]+){0,3}|Chapter\s+\d+)(\*\*)?\n\n/gi,
    (match, _bold1, text, _bold2) => {
      const words = text.trim().split(/\s+/)

      // Chapter numbers or short all-caps headings
      if (
        text.match(/^Chapter\s+\d+$/i) ||
        (words.length <= 4 && words.every((w: string) => w === w.toUpperCase()) && text.length < 30)
      ) {
        console.log(`[epub-cleaner] Formatted as chapter heading: ${text}`)
        return `\n\n## ${text}\n\n`
      }

      return match
    }
  )

  // 10. Remove publisher boilerplate at start
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

  // 11. Remove table of contents sections (multiple consecutive TOC links)
  cleaned = cleaned.replace(
    /(?:\[(?:chapter|prologue|epilogue|part)[^\]]*\]\([^\)]+\)\s*\n){3,}/gi,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 12. Remove EPUB filename headings
  cleaned = cleaned.replace(
    /^#{1,6}\s+[\w\d]+[-_][\w\d]+[-_.]+[\w\d.]+\.x?html?\s*$/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 13. Remove standalone filename lines
  cleaned = cleaned.replace(
    /^[\w\d]+[-_][\w\d]+[-_.]+[\w\d.]+\.x?html?\s*$/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 14. Remove localhost/file:// URLs (keep text, strip link)
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((https?:\/\/localhost|file:\/\/)[^\)]+\)/g,
    '$1'
  )

  // 15. Remove "Publisher's Note" sections
  cleaned = cleaned.replace(
    /^#{1,3}\s*Publisher'?s? Note\s*\n[\s\S]*?(?=\n#{1,3}|\n\n[A-Z]|$)/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 16. Clean excessive whitespace
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
