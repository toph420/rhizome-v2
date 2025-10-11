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

  // 1.5 Aggressive title deduplication (remove duplicate headings in any case)
  // Pattern: # Title followed by **Title** or plain Title within 500 chars
  let duplicatesRemoved = 0
  const headingPattern = /^#\s+(.+)$/gm
  const headings = [...cleaned.matchAll(headingPattern)]

  for (const heading of headings) {
    if (!heading.index) continue

    const headingText = heading[1].trim()
    const searchStart = heading.index + heading[0].length
    const searchEnd = Math.min(searchStart + 500, cleaned.length)
    const searchRegion = cleaned.substring(searchStart, searchEnd)

    // Escape regex special characters
    const escapedText = headingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Match: **Title** or Title (on own line with optional surrounding whitespace)
    // Use case-insensitive and allow minor variations
    const duplicatePattern = new RegExp(
      `\\n\\n(?:\\*\\*)?${escapedText}(?:\\*\\*)?\\s*\\n`,
      'gi'
    )

    const beforeCleaning = cleaned.length
    cleaned = cleaned.substring(0, searchStart) +
              searchRegion.replace(duplicatePattern, '\n\n') +
              cleaned.substring(searchEnd)

    const removed = beforeCleaning - cleaned.length
    if (removed > 0) {
      duplicatesRemoved++
      removedBytes += removed
      console.log(`[epub-cleaner] Removed duplicate title after heading: "${headingText.substring(0, 50)}"`)
    }
  }

  if (duplicatesRemoved > 0) {
    console.log(`[epub-cleaner] Total duplicate titles removed: ${duplicatesRemoved}`)
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
  // DELETE if immediately after a # heading (duplicate), FORMAT otherwise
  cleaned = cleaned.replace(
    /\n\n(\*\*)?([A-Z]+(?:\s+[A-Z]+){0,3}|Chapter\s+\d+)(\*\*)?\n\n/gi,
    (match, _bold1, text, _bold2, offset) => {
      const words = text.trim().split(/\s+/)

      // DELETE if this appears right after a # heading (within 500 chars)
      // Increased window to catch duplicates after longer front matter
      const beforeMatch = cleaned.substring(Math.max(0, offset - 500), offset)
      if (beforeMatch.match(/#\s+[^\n]+\n\n$/)) {
        console.log(`[epub-cleaner] Deleting duplicate heading: ${text} (already formatted)`)
        return '\n\n' // Delete entirely, not just remove bold
      }

      // Chapter numbers or short all-caps headings (for internal sections)
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

  // 11. Remove ALL navigation links (TOC, cover, title page, etc.)
  // Pattern: [Any text](any_file.html#anchor) - catches all EPUB navigation
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\([^)]*\.x?html[^)]*\)/gi,
    (match, linkText) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed navigation link: [${linkText}]`)
      return ''
    }
  )

  // 11b. Remove table of contents headers/sections
  // Pattern: "Contents" or "Table of Contents" as standalone heading
  cleaned = cleaned.replace(
    /^#{0,3}\s*(?:Contents|Table of Contents)\s*$/gim,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed TOC heading: ${match}`)
      return ''
    }
  )

  // 11c. AGGRESSIVE FRONT MATTER REMOVAL
  // Remove everything before first numbered chapter or substantial heading
  // Catches: ## 1, ## I, ## Chapter 1, ## CHAPTER I, etc.
  const firstChapter = cleaned.search(/^##\s+(?:\d+|[IVX]+|Chapter\s+\d+|CHAPTER\s+[IVX]+)/m)

  if (firstChapter > 100 && firstChapter < 8000) {
    const frontMatter = cleaned.slice(0, firstChapter)

    // Remove if it contains typical front matter markers
    const hasBoilerplate = (
      frontMatter.match(/cover|title page|dedication|introduction|preface|contents/i) ||
      frontMatter.match(/TO\s+[A-Z]/i) ||  // Dedications like "TO TIM AND SERENA"
      frontMatter.split('\n---\n').length > 3 ||  // Multiple --- separators (chapter files)
      (frontMatter.match(/^#\s/gm)?.length ?? 0) > 5  // Many top-level headings
    )

    if (hasBoilerplate) {
      removedBytes += firstChapter
      cleaned = cleaned.slice(firstChapter)
      console.log(`[epub-cleaner] Removed ${(firstChapter / 1024).toFixed(1)}KB front matter before chapter 1`)
    }
  }

  // 12. Remove ALL EPUB filename artifacts (comprehensive pattern)
  // Matches: filename.html, **filename.html**, # filename.html
  cleaned = cleaned.replace(
    /(?:^|\n)(?:#{1,6}\s+)?(?:\*\*)?[\w\d]+[-_]+[\w\d]+[-_.]*[\w\d.]*\.x?html?(?:\*\*)?(?:\n|$)/gim,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed filename artifact: ${match.trim()}`)
      return '\n'
    }
  )

  // 13. Format standalone chapter numbers (1-2 digits) as headings
  cleaned = cleaned.replace(
    /\n\n(\d{1,2})\n\n/g,
    (match, num) => {
      console.log(`[epub-cleaner] Formatted chapter number as heading: ${num}`)
      return `\n\n## ${num}\n\n`
    }
  )

  // 14. Remove "Unknown" headings (garbled/missing chapter titles)
  // Pattern: # Unknown, ## Unknown, or standalone "Unknown"
  cleaned = cleaned.replace(
    /^#{0,6}\s*Unknown\s*$/gim,
    (match) => {
      removedBytes += match.length
      console.log(`[epub-cleaner] Removed Unknown heading: ${match}`)
      return ''
    }
  )

  // Also remove standalone "Unknown" lines between chapters
  cleaned = cleaned.replace(
    /^\s*Unknown\s*$/gm,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 15. Remove localhost/file:// URLs (keep text, strip link)
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((https?:\/\/localhost|file:\/\/)[^\)]+\)/g,
    '$1'
  )

  // 16. Remove "Publisher's Note" sections
  cleaned = cleaned.replace(
    /^#{1,3}\s*Publisher'?s? Note\s*\n[\s\S]*?(?=\n#{1,3}|\n\n[A-Z]|$)/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 17. Clean excessive whitespace
  cleaned = cleaned
    .replace(/\n{4,}/g, '\n\n\n')  // Max 2 blank lines
    // Only remove orphaned horizontal rules NOT followed by blank line (preserve chapter separators like \n\n---\n\n)
    .replace(/^---\s*\n(?!\n)/gm, '')
    .trim()

  // Log what was removed
  if (removedBytes > 0) {
    const kb = (removedBytes / 1024).toFixed(1)
    console.log(`[epub-cleaner] Removed ${kb}KB of EPUB artifacts`)
  }

  return cleaned
}
