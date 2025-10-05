/**
 * Remove EPUB-specific artifacts from markdown.
 * Aggressively cleans publisher boilerplate, TOC links, and structural junk.
 *
 * Personal tool: Defaults to aggressive cleanup with logging.
 */
export function cleanEpubArtifacts(markdown: string): string {
  let cleaned = markdown
  let removedBytes = 0

  // 1. Remove publisher boilerplate at start
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

  // 2. Remove table of contents sections (multiple consecutive TOC links)
  cleaned = cleaned.replace(
    /(?:\[(?:chapter|prologue|epilogue|part)[^\]]*\]\([^\)]+\)\s*\n){3,}/gi,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 3. Remove EPUB filename headings
  cleaned = cleaned.replace(
    /^#{1,6}\s+[\w\d]+[-_][\w\d]+[-_.]+[\w\d.]+\.x?html?\s*$/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 4. Remove standalone filename lines
  cleaned = cleaned.replace(
    /^[\w\d]+[-_][\w\d]+[-_.]+[\w\d.]+\.x?html?\s*$/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 5. Remove localhost/file:// URLs (keep text, strip link)
  cleaned = cleaned.replace(
    /\[([^\]]+)\]\((https?:\/\/localhost|file:\/\/)[^\)]+\)/g,
    '$1'
  )

  // 6. Remove "Publisher's Note" sections
  cleaned = cleaned.replace(
    /^#{1,3}\s*Publisher'?s? Note\s*\n[\s\S]*?(?=\n#{1,3}|\n\n[A-Z]|$)/gim,
    (match) => {
      removedBytes += match.length
      return ''
    }
  )

  // 7. Clean excessive whitespace
  cleaned = cleaned
    .replace(/\n{4,}/g, '\n\n\n')  // Max 2 blank lines
    .replace(/^---\s*\n/gm, '')    // Remove orphaned horizontal rules
    .trim()

  // Log what was removed
  if (removedBytes > 0) {
    const kb = (removedBytes / 1024).toFixed(1)
    console.log(`[cleanEpubArtifacts] Removed ${kb}KB of EPUB artifacts`)
  }

  return cleaned
}
