import { marked } from 'marked'
import type { Chunk } from '@/types/annotations'
import {
  injectHighlights,
  type AnnotationForInjection,
} from './highlight-injector'

/**
 * Renderable block with chunk mapping and optional highlights.
 */
export interface Block {
  id: string
  type: 'heading' | 'paragraph' | 'code' | 'blockquote' | 'list' | 'table'
  level?: number // For headings (1-6)
  html: string
  startOffset: number
  endOffset: number
  chunkId: string
  chunkPosition: number
}

/**
 * Parse markdown into renderable blocks with chunk mappings.
 *
 * Uses marked.lexer() to get tokens with precise positions.
 * @param markdown - Markdown content to parse.
 * @param chunks - Chunks with offset ranges.
 * @param annotations - Optional annotations to inject as highlights.
 * @returns Array of blocks with injected highlights if annotations provided.
 */
export function parseMarkdownToBlocks(
  markdown: string,
  chunks: Chunk[],
  annotations: AnnotationForInjection[] = []
): Block[] {
  const tokens = marked.lexer(markdown)
  const blocks: Block[] = []
  let offset = 0
  let blockIndex = 0

  // Sort chunks by start_offset for binary search
  const sortedChunks = [...chunks].sort((a, b) => {
    const aStart = a.start_offset ?? 0
    const bStart = b.start_offset ?? 0
    return aStart - bStart
  })

  // Track position within each chunk
  const chunkBlockCounts = new Map<string, number>()

  for (const token of tokens) {
    const raw = token.raw
    const endOffset = offset + raw.length

    // Find chunk for this offset using binary search
    const chunk = findChunkForOffset(sortedChunks, offset)

    // Always render content, even without chunk coverage (chunks are metadata overlays)
    const chunkId = chunk?.id || 'no-chunk'

    // Parse token to HTML with smart typography
    let html = ''
    try {
      html = marked.parse(raw, {
        async: false,
        smartypants: true  // Convert straight quotes to curly quotes
      }) as string
    } catch (err) {
      console.error('Failed to parse token:', err)
      html = `<p>${raw}</p>`
    }

    // Inject highlights if annotations provided
    if (annotations.length > 0) {
      html = injectHighlights({
        html,
        blockStartOffset: offset,
        blockEndOffset: endOffset,
        annotations,
      })
    }

    // Extract depth for heading tokens
    const depth =
      'depth' in token && typeof token.depth === 'number'
        ? token.depth
        : undefined

    // Skip empty blocks (blank lines that become <p></p> or <p>\n</p>)
    const isEmptyBlock = html.trim() === '' ||
                         html.trim() === '<p></p>' ||
                         /^<p>\s*<\/p>$/.test(html.trim())

    if (!isEmptyBlock) {
      // Calculate position within this chunk (0-indexed)
      // IMPORTANT: Only count non-empty blocks for chunk positioning
      let chunkPosition = -1
      if (chunk) {
        const currentCount = chunkBlockCounts.get(chunkId) || 0
        chunkPosition = currentCount
        chunkBlockCounts.set(chunkId, currentCount + 1)
      }

      blocks.push({
        id: `block_${blockIndex}`,
        type: mapTokenType(token.type),
        level: depth,
        html,
        startOffset: offset,
        endOffset,
        chunkId,
        chunkPosition,
      })
      blockIndex++
    }

    offset = endOffset
  }

  console.log(`📖 Parsed ${blocks.length} blocks from ${markdown.length} chars`)

  // Log first few blocks for debugging
  if (blocks.length > 0) {
    console.log('First block sample:', {
      id: blocks[0].id,
      type: blocks[0].type,
      htmlLength: blocks[0].html.length,
      chunkId: blocks[0].chunkId,
    })
  }

  return blocks
}

/**
 * Binary search to find chunk containing offset.
 * @param chunks - Sorted array of chunks.
 * @param offset - Character offset to find.
 * @returns Chunk containing the offset, or null if not found.
 */
function findChunkForOffset(chunks: Chunk[], offset: number): Chunk | null {
  let left = 0
  let right = chunks.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const chunk = chunks[mid]
    const startOffset = chunk.start_offset ?? 0
    const endOffset = chunk.end_offset ?? Number.MAX_SAFE_INTEGER

    if (offset >= startOffset && offset < endOffset) {
      return chunk
    } else if (offset < startOffset) {
      right = mid - 1
    } else {
      left = mid + 1
    }
  }

  return null
}

/**
 * Map marked token type to simplified block type.
 * @param tokenType - Marked.js token type.
 * @returns Simplified block type for rendering.
 */
function mapTokenType(tokenType: string): Block['type'] {
  switch (tokenType) {
    case 'heading':
      return 'heading'
    case 'code':
      return 'code'
    case 'blockquote':
      return 'blockquote'
    case 'list':
      return 'list'
    case 'table':
      return 'table'
    case 'paragraph':
    default:
      return 'paragraph'
  }
}
