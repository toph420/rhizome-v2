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

    // NEW: If annotation has text, SEARCH for it!
    if (annotation.text) {
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

      // Try 2: Case-insensitive
      if (index === -1) {
        const lowerText = plainText.toLowerCase()
        const lowerSearch = searchText.toLowerCase()
        index = lowerText.indexOf(lowerSearch)
        matchMethod = 'case-insensitive'
      }

      // Try 3: Whitespace-normalized matching (handles any whitespace differences)
      if (index === -1) {
        // Normalize whitespace in both texts (collapse any whitespace to single space)
        const normalizedBlock = plainText.replace(/\s+/g, ' ')
        const normalizedSearch = searchText.replace(/\s+/g, ' ')

        const normalizedIndex = normalizedBlock.indexOf(normalizedSearch)
        if (normalizedIndex !== -1) {
          // Map normalized position back to original text
          index = normalizedIndex
          matchMethod = 'whitespace-normalized'
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
          index = match.index
          matchMethod = 'word-based'
        }
      }

      if (index !== -1) {
        // FOUND! Use discovered position
        relativeStart = index
        relativeEnd = index + searchText.length
        annotationStartsInThisBlock = true
        annotationEndsInThisBlock = true
      } else {
        // CRITICAL: Text not found in this block!
        // This means the stored offsets are wrong for this block.
        // SKIP this block rather than highlighting the wrong text.
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
        if (isFirstAnnotation && isFirstSpan) {
          span.setAttribute('data-annotation-start', 'true')
        }
        if (isLastAnnotation && isLastSpan) {
          span.setAttribute('data-annotation-end', 'true')
        }

        span.textContent = highlighted
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
