/**
 * Cloze deletion parser
 *
 * Supports Anki-style cloze format: {{c1::text::hint}}
 * Generates multiple flashcards from a single cloze note (one per deletion)
 *
 * Examples:
 * - {{c1::rhizome}} → Creates card 1 with "rhizome" as answer
 * - {{c1::rhizome::plant structure}} → Creates card 1 with "rhizome" as answer and "plant structure" as hint
 * - The {{c1::rhizome}} opposes {{c2::hierarchy}} → Creates 2 cards
 *
 * Pattern: Pure functions for parsing and rendering
 */

/**
 * Cloze deletion structure
 */
export interface ClozeDeletion {
  index: number        // c1, c2, c3, etc.
  text: string         // The hidden text
  hint: string | null  // Optional hint
}

/**
 * Extract all cloze deletions from content
 *
 * @param content - Text with {{cN::text::hint}} markers
 * @returns Array of cloze deletions sorted by index
 *
 * @example
 * ```typescript
 * const deletions = extractClozeDeletions("The {{c1::rhizome}} opposes {{c2::hierarchy}}")
 * // Returns: [
 * //   { index: 1, text: 'rhizome', hint: null },
 * //   { index: 2, text: 'hierarchy', hint: null }
 * // ]
 * ```
 */
export function extractClozeDeletions(content: string): ClozeDeletion[] {
  const pattern = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g
  const deletions: Map<number, { text: string; hint: string | null }> = new Map()

  let match
  while ((match = pattern.exec(content)) !== null) {
    const index = parseInt(match[1], 10)
    const text = match[2]
    const hint = match[3] || null

    // Only store first occurrence of each index (Anki behavior)
    if (!deletions.has(index)) {
      deletions.set(index, { text, hint })
    }
  }

  return Array.from(deletions.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, data]) => ({ index, ...data }))
}

/**
 * Render cloze question for specific deletion index
 *
 * Replaces target deletion with [...] or [...hint]
 * Shows all other deletions as plain text
 *
 * @param content - Original cloze content
 * @param targetIndex - Which deletion to hide (c1, c2, etc.)
 * @returns Rendered question with target hidden
 *
 * @example
 * ```typescript
 * const question = renderClozeQuestion("The {{c1::rhizome}} opposes {{c2::hierarchy}}", 1)
 * // Returns: "The [...] opposes hierarchy"
 * ```
 */
export function renderClozeQuestion(content: string, targetIndex: number): string {
  let rendered = content

  const pattern = /\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g
  rendered = rendered.replace(pattern, (match, indexStr, text, hint) => {
    const index = parseInt(indexStr, 10)
    if (index === targetIndex) {
      // This is the target deletion - hide it
      return hint ? `[...${hint}]` : '[...]'
    } else {
      // Other deletions - show as plain text
      return text
    }
  })

  return rendered
}

/**
 * Check if content contains cloze deletions
 *
 * @param content - Text to check
 * @returns True if content has {{cN::...}} markers
 */
export function isClozeContent(content: string): boolean {
  return /\{\{c\d+::[^}]+\}\}/.test(content)
}

/**
 * Get total count of unique cloze deletions
 *
 * @param content - Cloze content
 * @returns Number of unique cN indices
 */
export function getClozeCount(content: string): number {
  const deletions = extractClozeDeletions(content)
  return deletions.length
}

/**
 * Validate cloze content
 *
 * @param content - Content to validate
 * @returns Validation result with errors
 */
export function validateClozeContent(content: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!isClozeContent(content)) {
    errors.push('No cloze deletions found')
    return { valid: false, errors }
  }

  const deletions = extractClozeDeletions(content)

  if (deletions.length === 0) {
    errors.push('No valid cloze deletions found')
  }

  // Check for sequential indices (1, 2, 3 not 1, 3, 5)
  const indices = deletions.map(d => d.index).sort((a, b) => a - b)
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== i + 1) {
      errors.push(`Cloze indices should be sequential (found c${indices[i]} but expected c${i + 1})`)
      break
    }
  }

  return { valid: errors.length === 0, errors }
}
