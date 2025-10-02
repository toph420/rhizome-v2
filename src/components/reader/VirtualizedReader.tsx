'use client'

import { useMemo, useCallback } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { parseMarkdownToBlocks } from '@/lib/reader/block-parser'
import { BlockRenderer } from './BlockRenderer'
import type { Chunk } from '@/types/annotations'

interface VirtualizedReaderProps {
  markdown: string
  chunks: Chunk[]
  onVisibleChunksChange?: (chunkIds: string[]) => void
}

export function VirtualizedReader({
  markdown,
  chunks,
  onVisibleChunksChange,
}: VirtualizedReaderProps) {
  // Parse markdown into blocks (memoized)
  const blocks = useMemo(() => {
    console.time('parse-blocks')
    const parsed = parseMarkdownToBlocks(markdown, chunks)
    console.timeEnd('parse-blocks')
    return parsed
  }, [markdown, chunks])

  // Track visible chunk IDs
  const handleVisibleRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      if (!onVisibleChunksChange) return

      const visibleChunkIds = new Set<string>()
      for (let i = range.startIndex; i <= range.endIndex; i++) {
        const block = blocks[i]
        if (block) visibleChunkIds.add(block.chunkId)
      }

      onVisibleChunksChange(Array.from(visibleChunkIds))
    },
    [blocks, onVisibleChunksChange]
  )

  if (blocks.length === 0) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">No content to display</p>
      </div>
    )
  }

  return (
    <Virtuoso
      data={blocks}
      itemContent={(index, block) => (
        <div className="max-w-4xl mx-auto px-8">
          <BlockRenderer block={block} />
        </div>
      )}
      rangeChanged={handleVisibleRangeChange}
      overscan={2000}
      style={{ height: '100%', width: '100%' }}
    />
  )
}
