/**
 * Annotation injection system using span-based DOM traversal.
 *
 * This approach respects HTML structure and handles nested tags correctly.
 * Uses <span> elements with data attributes instead of <mark> tags.
 *
 * @module inject
 */

// ============================================
// TYPES
// ============================================

export interface AnnotationRange {
  id: string
  startOffset: number
  endOffset: number
  color: 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'
  text?: string  // NEW: Actual annotation text for search-based matching
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Aggressive text normalization for matching PDF text with markdown.
 * Matches the implementation in text-offset-calculator.ts (Phase 1.5).
 *
 * Handles:
 * - ALL Unicode quote variants → @
 * - ALL dash/hyphen variants → -
 * - Soft hyphens removal
 * - Whitespace collapse
 */
function normalizeTextAggressive(text: string): string {
  let normalized = text

  // Normalize ALL Unicode quote types → @ (consistent placeholder)
  // Covers: " ' ` ´ ' ' ‚ ‛ " " „ ‟
  normalized = normalized.replace(/[\u0022\u0027\u0060\u00B4\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/g, '@')

  // Normalize dashes/hyphens → -
  // Covers: ‐ ‑ ‒ – — ― −
  normalized = normalized.replace(/[\u2010-\u2015\u2212]/g, '-')

  // Remove soft hyphens (invisible hyphenation hints)
  normalized = normalized.replace(/\u00AD/g, '')

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ')

  return normalized.trim()
}

/**
 * Calculate similarity ratio between two strings using Levenshtein distance.
 * Returns 0.0-1.0 where 1.0 is identical.
 *
 * Simple implementation for browser use (no dependencies).
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1.0

  const distance = levenshteinDistance(str1, str2)
  return 1.0 - (distance / maxLen)
}

/**
 * Snap position to word boundaries in original text.
 * Expands to include full words if position is mid-word.
 *
 * @param text - Full text context
 * @param start - Start position
 * @param end - End position
 * @returns Snapped positions
 */
function snapToWordBoundariesInText(
  text: string,
  start: number,
  end: number
): { start: number; end: number } {
  // Expand start backward if mid-word
  let adjustedStart = start
  while (adjustedStart > 0 && /[a-zA-Z0-9]/.test(text[adjustedStart - 1])) {
    adjustedStart--
  }

  // Expand end forward if mid-word
  let adjustedEnd = end
  while (adjustedEnd < text.length && /[a-zA-Z0-9]/.test(text[adjustedEnd])) {
    adjustedEnd++
  }

  return { start: adjustedStart, end: adjustedEnd }
}

/**
 * Map a position from whitespace-normalized text back to original text.
 * Simpler than full normalization mapping - only handles whitespace collapse.
 *
 * @param originalText - The original text with potentially multiple spaces
 * @param normalizedStart - Start position in whitespace-collapsed text
 * @param normalizedLength - Length in whitespace-collapsed text
 * @returns Mapped start and end positions in original text
 */
function mapWhitespaceNormalizedPosition(
  originalText: string,
  normalizedStart: number,
  normalizedLength: number
): { start: number; end: number } {
  let originalPos = 0
  let normalizedPos = 0
  let startPos = 0
  let endPos = originalText.length
  let foundStart = false

  let i = 0
  while (i < originalText.length && normalizedPos <= normalizedStart + normalizedLength) {
    const char = originalText[i]

    // Check if this starts a whitespace sequence
    if (/\s/.test(char)) {
      // Count consecutive whitespace
      let wsCount = 1
      let j = i + 1
      while (j < originalText.length && /\s/.test(originalText[j])) {
        wsCount++
        j++
      }

      // Multiple whitespace → single space in normalized text
      // So we only advance normalizedPos by 1
      if (!foundStart && normalizedPos >= normalizedStart) {
        startPos = i
        foundStart = true
      }

      normalizedPos += 1 // Single space in normalized text

      if (foundStart && normalizedPos >= normalizedStart + normalizedLength) {
        endPos = i + 1 // Include at least one space
        break
      }

      // Skip past all whitespace
      if (wsCount > 1) {
        i = j - 1 // Will be incremented at end of loop
      }
    } else {
      // Non-whitespace character - 1:1 mapping
      if (!foundStart && normalizedPos >= normalizedStart) {
        startPos = i
        foundStart = true
      }

      normalizedPos += 1

      if (foundStart && normalizedPos >= normalizedStart + normalizedLength) {
        endPos = i + 1
        break
      }
    }

    i++
  }

  // If we exhausted the original text, end is at the end
  if (i >= originalText.length) {
    endPos = originalText.length
  }

  return { start: startPos, end: endPos }
}

/**
 * Map a position from normalized text space back to original text space.
 *
 * Handles character-level differences caused by normalization:
 * - Removed characters (soft hyphens)
 * - Collapsed whitespace (multiple spaces → single space)
 * - Replaced characters (smart quotes → @, em dashes → -)
 *
 * @param originalText - The original unnormalized text
 * @param normalizedText - The normalized version of originalText
 * @param normalizedStart - Start position in normalized text
 * @param normalizedLength - Length in normalized text
 * @returns Mapped start and end positions in original text
 */
function mapNormalizedPositionToOriginal(
  originalText: string,
  normalizedText: string,
  normalizedStart: number,
  normalizedLength: number
): { start: number; end: number } {
  // Build a character map by walking through original text and applying normalization
  // Track which original positions correspond to which normalized positions

  let originalPos = 0
  let normalizedPos = 0
  let startPos = 0
  let endPos = originalText.length
  let foundStart = false

  // We need to simulate the normalization process character-by-character
  // to build an accurate position mapping
  let i = 0
  while (i < originalText.length && normalizedPos <= normalizedStart + normalizedLength) {
    const char = originalText[i]

    // Determine how this character would be normalized
    let normalizedChar = char

    // Soft hyphen → removed (length 0)
    if (char === '\u00AD') {
      normalizedChar = ''
    }
    // Whitespace → single space (but check if previous was also whitespace)
    else if (/\s/.test(char)) {
      // In normalizeTextAggressive, multiple whitespace collapses to one space
      // So we need to check if this starts a whitespace sequence or continues one
      let wsCount = 1
      let j = i + 1
      while (j < originalText.length && /\s/.test(originalText[j])) {
        wsCount++
        j++
      }
      // Multiple whitespace → single space in normalized text
      normalizedChar = ' '

      // Skip ahead past all the whitespace
      if (wsCount > 1) {
        i = j - 1 // Will be incremented at end of loop
      }
    }
    // Quote normalization
    else if (/[\u0022\u0027\u0060\u00B4\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F]/.test(char)) {
      normalizedChar = '@'
    }
    // Dash/hyphen normalization
    else if (/[\u2010-\u2015\u2212]/.test(char)) {
      normalizedChar = '-'
    }

    // Check if we've reached the start position in normalized space
    if (!foundStart && normalizedPos >= normalizedStart) {
      startPos = i
      foundStart = true
    }

    // Check if we've reached the end position in normalized space
    if (foundStart && normalizedPos >= normalizedStart + normalizedLength) {
      endPos = i
      break
    }

    // Advance normalized position by the length of the normalized character
    normalizedPos += normalizedChar.length
    i++
  }

  // If we exhausted the original text, end is at the end
  if (i >= originalText.length) {
    endPos = originalText.length
  }

  return { start: startPos, end: endPos }
}

/**
 * Calculate Levenshtein distance between two strings.
 * Simple browser-compatible implementation.
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length

  // Create matrix
  const matrix: number[][] = []
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return matrix[len1][len2]
}

// ============================================
// CORE FUNCTION
// ============================================

/**
 * Inject annotations into HTML by wrapping text nodes with spans.
 *
 * NEW APPROACH: Search for annotation text instead of trusting offsets!
 * - If annotation.text is provided, SEARCH for it in the block
 * - Use FOUND position to highlight (guaranteed correct)
 * - Fall back to stored offsets only if text not provided
 *
 * @param html - Raw HTML string from block
 * @param blockStartOffset - Block's starting offset in markdown
 * @param blockEndOffset - Block's ending offset in markdown
 * @param annotations - Annotations that might overlap this block
 * @returns HTML with annotation spans injected
 */
export function injectAnnotations(
  html: string,
  blockStartOffset: number,
  blockEndOffset: number,
  annotations: AnnotationRange[]
): string {
  if (annotations.length === 0) return html

  // Filter annotations that overlap this block (or have text to search for)
  const overlapping = annotations.filter(
    (ann) => ann.text || (ann.endOffset > blockStartOffset && ann.startOffset < blockEndOffset)
  )

  if (overlapping.length === 0) return html

  // Parse HTML to DOM
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  // Get plain text from HTML for searching
  const plainText = body.textContent || ''

  // Sort annotations by start offset for consistent processing
  const sorted = [...overlapping].sort((a, b) => a.startOffset - b.startOffset)

  // Inject each annotation
  sorted.forEach((annotation) => {
    let relativeStart: number
    let relativeEnd: number
    let annotationStartsInThisBlock: boolean
    let annotationEndsInThisBlock: boolean

    // NEW: Check if annotation spans multiple blocks
    const annotationSpansMultipleBlocks =
      annotation.startOffset < blockStartOffset ||
      annotation.endOffset > blockEndOffset

    // NEW: If annotation has text AND is single-block, SEARCH for it!
    // For cross-block annotations, use offset-based matching (text not in any single block)
    if (annotation.text && !annotationSpansMultipleBlocks) {
      // CRITICAL FIX: Handle PDF text extraction quirks
      // 1. Convert literal \n strings to actual newlines (if any)
      // 2. Remove hyphenated line breaks: "human-\nity" → "humanity"
      //    PDF rendering adds hyphens at line breaks that disappear in HTML
      const searchText = annotation.text
        .replace(/\\n/g, '\n')     // Literal \n → real newline
        .replace(/\\t/g, '\t')     // Literal \t → real tab
        .replace(/-\n/g, '')       // Hyphenated line break → join word
        .replace(/-\r\n/g, '')     // Windows line endings

      // Try 1: Exact match
      let index = plainText.indexOf(searchText)
      let matchMethod = 'exact'
      let matchLength = searchText.length

      // Try 2: Case-insensitive
      if (index === -1) {
        const lowerText = plainText.toLowerCase()
        const lowerSearch = searchText.toLowerCase()
        index = lowerText.indexOf(lowerSearch)
        if (index !== -1) {
          matchMethod = 'case-insensitive'
        }
      }

      // Try 3: Whitespace-normalized matching (handles any whitespace differences)
      if (index === -1) {
        // Normalize whitespace in both texts (collapse any whitespace to single space)
        const normalizedBlock = plainText.replace(/\s+/g, ' ')
        const normalizedSearch = searchText.replace(/\s+/g, ' ')

        const normalizedIndex = normalizedBlock.indexOf(normalizedSearch)
        if (normalizedIndex !== -1) {
          // Map normalized position back to original text
          // For whitespace normalization, we use the simpler space-based mapping
          const mapped = mapWhitespaceNormalizedPosition(
            plainText,
            normalizedIndex,
            normalizedSearch.length
          )

          relativeStart = mapped.start
          relativeEnd = mapped.end

          // Snap to word boundaries
          const snapped = snapToWordBoundariesInText(plainText, relativeStart, relativeEnd)
          relativeStart = snapped.start
          relativeEnd = snapped.end

          annotationStartsInThisBlock = true
          annotationEndsInThisBlock = true
          matchMethod = 'whitespace-normalized'

          // Skip the normal relativeStart/relativeEnd calculation
          markTextRange(
            body,
            relativeStart,
            relativeEnd,
            annotation.id,
            annotation.color,
            annotationStartsInThisBlock,
            annotationEndsInThisBlock
          )
          return // Exit early - we've already marked this annotation
        }
      }

      // Try 3.5: AGGRESSIVE normalization (Phase 1.5 - quotes, dashes, hyphens)
      // This handles AI cleanup differences between PDF and markdown
      if (index === -1) {
        const aggressiveNormBlock = normalizeTextAggressive(plainText)
        const aggressiveNormSearch = normalizeTextAggressive(searchText)

        const aggressiveIndex = aggressiveNormBlock.indexOf(aggressiveNormSearch)
        if (aggressiveIndex !== -1) {
          // Map position from normalized space back to original text space
          // We need to account for removed/collapsed characters during normalization
          const mapped = mapNormalizedPositionToOriginal(
            plainText,
            aggressiveNormBlock,
            aggressiveIndex,
            aggressiveNormSearch.length
          )

          relativeStart = mapped.start
          relativeEnd = mapped.end

          // Snap to word boundaries
          const snapped = snapToWordBoundariesInText(plainText, relativeStart, relativeEnd)
          relativeStart = snapped.start
          relativeEnd = snapped.end

          annotationStartsInThisBlock = true
          annotationEndsInThisBlock = true
          matchMethod = 'aggressive-normalized'

          // Skip the normal relativeStart/relativeEnd calculation
          markTextRange(
            body,
            relativeStart,
            relativeEnd,
            annotation.id,
            annotation.color,
            annotationStartsInThisBlock,
            annotationEndsInThisBlock
          )
          return // Exit early - we've already marked this annotation
        }
      }

      // Try 3.75: FUZZY similarity matching (Phase 1.5 - handles content differences)
      // This is the same fuzzy matching we use in text-offset-calculator.ts
      if (index === -1) {
        const normalizedSearch = normalizeTextAggressive(searchText).toLowerCase()
        const normalizedBlock = normalizeTextAggressive(plainText).toLowerCase()

        // Sliding window with 85% similarity threshold
        const searchLen = normalizedSearch.length // Use NORMALIZED length for sliding window
        const threshold = searchLen < 100 ? 0.90 : 0.85
        const stepSize = searchLen < 100 ? 5 : 10

        let bestRatio = 0
        let bestPosition = -1

        for (let i = 0; i <= normalizedBlock.length - searchLen; i += stepSize) {
          const window = normalizedBlock.slice(i, i + searchLen)
          const ratio = calculateSimilarity(normalizedSearch, window)

          if (ratio > bestRatio) {
            bestRatio = ratio
            bestPosition = i
          }

          // Early exit if excellent match
          if (ratio > 0.95) break
        }

        if (bestRatio >= threshold) {
          // Map position from normalized space back to original text space
          const mapped = mapNormalizedPositionToOriginal(
            plainText,
            normalizedBlock,
            bestPosition,
            searchLen
          )

          relativeStart = mapped.start
          relativeEnd = mapped.end

          // Snap to word boundaries
          const snapped = snapToWordBoundariesInText(plainText, relativeStart, relativeEnd)
          relativeStart = snapped.start
          relativeEnd = snapped.end

          annotationStartsInThisBlock = true
          annotationEndsInThisBlock = true
          matchMethod = `fuzzy-${(bestRatio * 100).toFixed(1)}%`

          console.log(`[inject] Fuzzy match found: ${(bestRatio * 100).toFixed(1)}% similarity`)

          // Skip the normal relativeStart/relativeEnd calculation
          markTextRange(
            body,
            relativeStart,
            relativeEnd,
            annotation.id,
            annotation.color,
            annotationStartsInThisBlock,
            annotationEndsInThisBlock
          )
          return // Exit early - we've already marked this annotation
        }
      }

      // Try 4: Space-agnostic matching (handles spaced-out text like "M A R R Y" vs "MARRY"
      // and missing spaces like "forwhat" vs "for what")
      if (index === -1) {
        // Remove ALL spaces from both texts and compare
        const noSpaceBlock = plainText.replace(/\s/g, '')
        const noSpaceSearch = searchText.replace(/\s/g, '')

        const noSpaceIndex = noSpaceBlock.indexOf(noSpaceSearch)
        if (noSpaceIndex !== -1) {
          // Map back to original text position (both START and END)
          // Count characters up to match start (including spaces)
          let charCount = 0
          let startPos = 0
          for (let i = 0; i < plainText.length && charCount < noSpaceIndex; i++) {
            if (plainText[i] !== ' ' && plainText[i] !== '\n' && plainText[i] !== '\t') {
              charCount++
            }
            startPos = i + 1
          }

          // Continue counting to find match end
          const noSpaceEndIndex = noSpaceIndex + noSpaceSearch.length
          let endPos = startPos
          for (let i = startPos; i < plainText.length && charCount < noSpaceEndIndex; i++) {
            if (plainText[i] !== ' ' && plainText[i] !== '\n' && plainText[i] !== '\t') {
              charCount++
            }
            endPos = i + 1
          }

          index = startPos
          // Override the normal length calculation - use our calculated end
          relativeStart = index
          relativeEnd = endPos
          annotationStartsInThisBlock = true
          annotationEndsInThisBlock = true
          matchMethod = 'space-agnostic'

          // Skip the normal relativeStart/relativeEnd calculation
          markTextRange(
            body,
            relativeStart,
            relativeEnd,
            annotation.id,
            annotation.color,
            annotationStartsInThisBlock,
            annotationEndsInThisBlock
          )
          return // Exit early - we've already marked this annotation
        }
      }

      // Try 5: Word-based matching (last resort - handles missing/extra words)
      if (index === -1) {
        // Get first 10 words from search text
        const searchWords = searchText.trim().split(/\s+/).slice(0, 10)
        const searchPattern = searchWords.join('\\s+')
        const regex = new RegExp(searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')

        const match = plainText.match(regex)
        if (match && match.index !== undefined) {
          // Use the ACTUAL matched text length, not searchText.length
          relativeStart = match.index
          relativeEnd = match.index + match[0].length

          // Snap to word boundaries
          const snapped = snapToWordBoundariesInText(plainText, relativeStart, relativeEnd)
          relativeStart = snapped.start
          relativeEnd = snapped.end

          annotationStartsInThisBlock = true
          annotationEndsInThisBlock = true
          matchMethod = 'word-based'

          console.log(`[inject] ✅ Found annotation text using ${matchMethod}:`, {
            annotationId: annotation.id,
            matchedTextLength: match[0].length,
            foundAt: match.index,
          })

          // Skip the normal relativeStart/relativeEnd calculation
          markTextRange(
            body,
            relativeStart,
            relativeEnd,
            annotation.id,
            annotation.color,
            annotationStartsInThisBlock,
            annotationEndsInThisBlock
          )
          return // Exit early - we've already marked this annotation
        }
      }

      if (index !== -1) {
        // FOUND! Use discovered position (only reached by exact/case-insensitive matches)
        relativeStart = index
        relativeEnd = index + matchLength

        // Snap to word boundaries to prevent partial words
        // This handles cases where PDF extraction gives us "ld. The" instead of "world. The"
        const snapped = snapToWordBoundariesInText(plainText, relativeStart, relativeEnd)
        relativeStart = snapped.start
        relativeEnd = snapped.end

        console.log(`[inject] ✅ Found annotation text using ${matchMethod}:`, {
          annotationId: annotation.id,
          searchTextLength: searchText.length,
          foundAt: index,
          snapped: snapped.start !== index || snapped.end !== (index + matchLength),
        })

        annotationStartsInThisBlock = true
        annotationEndsInThisBlock = true
      } else {
        // CRITICAL: Text not found in this block!
        // This means the stored offsets are wrong for this block.
        // SKIP this block rather than highlighting the wrong text.
        console.warn('[inject] ⚠️ Text search failed for annotation:', {
          annotationId: annotation.id,
          searchTextPreview: searchText.substring(0, 100),
          blockTextPreview: plainText.substring(0, 200),
          blockOffsets: { start: blockStartOffset, end: blockEndOffset },
        })
        // Skip this annotation for this block (return early)
        return
      }
    } else {
      // Fall back to stored offsets (old behavior)
      relativeStart = Math.max(0, annotation.startOffset - blockStartOffset)
      relativeEnd = Math.min(
        blockEndOffset - blockStartOffset,
        annotation.endOffset - blockStartOffset
      )
      annotationStartsInThisBlock = annotation.startOffset >= blockStartOffset && annotation.startOffset < blockEndOffset
      annotationEndsInThisBlock = annotation.endOffset > blockStartOffset && annotation.endOffset <= blockEndOffset
    }

    markTextRange(
      body,
      relativeStart,
      relativeEnd,
      annotation.id,
      annotation.color,
      annotationStartsInThisBlock,
      annotationEndsInThisBlock
    )
  })

  return body.innerHTML
}

// ============================================
// INTERNAL HELPERS
// ============================================

/**
 * Mark a text range by wrapping text nodes in spans.
 * Traverses the DOM tree and splits text nodes as needed.
 *
 * @param root - Root element to traverse
 * @param startOffset - Start offset (block-relative)
 * @param endOffset - End offset (block-relative)
 * @param annotationId - Annotation ID for data attribute
 * @param color - Highlight color for data attribute
 * @param isFirstAnnotation - True if first annotation at this start offset
 * @param isLastAnnotation - True if last annotation at this end offset
 */
function markTextRange(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  annotationId: string,
  color: string,
  isFirstAnnotation: boolean,
  isLastAnnotation: boolean
): void {
  let currentOffset = 0
  let isFirstSpan = true
  let isLastSpan = false

  function traverse(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent || ''
      const nodeStart = currentOffset
      const nodeEnd = currentOffset + textContent.length

      // Check if this text node overlaps with annotation range
      if (nodeEnd > startOffset && nodeStart < endOffset) {
        // Calculate overlap within this text node
        const overlapStart = Math.max(0, startOffset - nodeStart)
        const overlapEnd = Math.min(textContent.length, endOffset - nodeStart)

        // Check if this is the last span we'll create
        isLastSpan = nodeEnd >= endOffset

        // Split text node into: [before] | highlighted | [after]
        const before = textContent.slice(0, overlapStart)
        const highlighted = textContent.slice(overlapStart, overlapEnd)
        const after = textContent.slice(overlapEnd)

        const parent = node.parentNode!
        const fragment = document.createDocumentFragment()

        // Create before text if exists
        if (before) {
          fragment.appendChild(document.createTextNode(before))
        }

        // Create span for highlighted portion
        const span = document.createElement('span')
        span.setAttribute('data-annotation-id', annotationId)
        span.setAttribute('data-annotation-color', color)

        // Mark first and last spans for resize handles
        const hasStartMarker = isFirstAnnotation && isFirstSpan
        const hasEndMarker = isLastAnnotation && isLastSpan

        if (hasStartMarker) {
          span.setAttribute('data-annotation-start', 'true')
        }
        if (hasEndMarker) {
          span.setAttribute('data-annotation-end', 'true')
        }

        // Add resize handle elements for hover-revealed handles
        // Only add handles to first span (start) and last span (end)
        if (hasStartMarker) {
          const startHandle = document.createElement('span')
          startHandle.className = 'resize-handle resize-handle-start'
          startHandle.setAttribute('data-edge', 'start')
          span.appendChild(startHandle)
        }

        // Add text content
        span.appendChild(document.createTextNode(highlighted))

        if (hasEndMarker) {
          const endHandle = document.createElement('span')
          endHandle.className = 'resize-handle resize-handle-end'
          endHandle.setAttribute('data-edge', 'end')
          span.appendChild(endHandle)
        }

        fragment.appendChild(span)

        // Create after text if exists
        if (after) {
          fragment.appendChild(document.createTextNode(after))
        }

        // Replace original text node with fragment
        parent.replaceChild(fragment, node)

        isFirstSpan = false
      }

      currentOffset += textContent.length

    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Traverse children (making a copy since we're modifying the tree)
      const children = Array.from(node.childNodes)
      children.forEach(traverse)
    }
  }

  traverse(root)
}

/**
 * Validate HTML after injection.
 *
 * @param html - HTML string to validate
 * @returns True if valid HTML
 */
export function isValidHTML(html: string): boolean {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    const errors = doc.querySelector('parsererror')
    return !errors
  } catch {
    return false
  }
}
