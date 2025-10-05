import TurndownService from 'turndown'

/**
 * Configured Turndown service for converting EPUB HTML to clean markdown.
 * Uses deterministic conversion rules for stable offsets.
 */
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  bulletListMarker: '-',
  hr: '---'
})

// Custom rule: Convert page breaks to horizontal rules
turndown.addRule('pageBreak', {
  filter: (node) => {
    if (node.nodeName !== 'DIV') return false
    const className = node.getAttribute('class') || ''
    return className.includes('page-break') ||
           className.includes('pagebreak') ||
           className.includes('pb')
  },
  replacement: () => '\n\n---\n\n'
})

// Custom rule: Preserve image alt text and remove broken image references
turndown.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    const alt = (node as HTMLElement).getAttribute('alt') || ''
    const src = (node as HTMLElement).getAttribute('src') || ''

    // Only include images with meaningful alt text
    if (alt && alt.length > 0) {
      return `![${alt}](${src})`
    }

    // Skip decorative images
    return ''
  }
})

/**
 * Convert EPUB HTML content to clean markdown.
 * Removes XML declarations, namespaces, EPUB-specific tags, and CSS/script elements.
 *
 * @param html - Raw HTML content from EPUB chapter
 * @returns Clean markdown string
 */
export function htmlToMarkdown(html: string): string {
  // Remove XML declarations and EPUB namespaces
  let cleaned = html
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/xmlns(?::[^=]+)?="[^"]*"/g, '')
    .replace(/<epub:[^>]*>/g, '')
    .replace(/<\/epub:[^>]*>/g, '')
    .replace(/<\?[^>]*\?>/g, '') // Remove processing instructions

    // Remove <style> tags completely (prevents CSS from leaking into markdown)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

    // Remove <script> tags (shouldn't be in EPUBs, but be safe)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

  // Convert to markdown
  const markdown = turndown.turndown(cleaned)

  // Clean up excessive whitespace while preserving paragraph breaks
  return markdown
    .replace(/\n{4,}/g, '\n\n\n') // Max 3 newlines
    .replace(/[ \t]+$/gm, '')     // Remove trailing whitespace
    .trim()
}
