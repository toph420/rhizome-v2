import { marked } from 'marked'
import type { Chunk } from '@/types/annotations'

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
 * Uses marked.lexer() to get tokens with precise positions.
 */
export function parseMarkdownToBlocks(
  markdown: string,
  chunks: Chunk[]
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

  for (const token of tokens) {
    const raw = token.raw
    const endOffset = offset + raw.length

    // Find chunk for this offset using binary search
    const chunk = findChunkForOffset(sortedChunks, offset)

    if (!chunk) {
      offset = endOffset
      continue
    }

    // Parse token to HTML
    let html = ''
    try {
      html = marked.parse(raw, { async: false }) as string
    } catch (err) {
      console.error('Failed to parse token:', err)
      html = `<p>${raw}</p>`
    }

    blocks.push({
      id: `block_${blockIndex}`,
      type: mapTokenType(token.type),
      level: (token as any).depth || undefined,
      html,
      startOffset: offset,
      endOffset,
      chunkId: chunk.id,
      chunkPosition: chunk.chunk_index,
    })

    offset = endOffset
    blockIndex++
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
