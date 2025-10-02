'use client'

import { memo } from 'react'
import DOMPurify from 'dompurify'
import type { Block } from '@/lib/reader/block-parser'

interface BlockRendererProps {
  block: Block
}

export const BlockRenderer = memo(function BlockRenderer({
  block,
}: BlockRendererProps) {
  // Sanitize HTML
  const cleanHtml = DOMPurify.sanitize(block.html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'a',
      'img',
      'span',
      'div',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style'],
  })

  // Prose classes for everything except code blocks
  const proseClass =
    block.type === 'code'
      ? 'not-prose'
      : 'prose prose-sm lg:prose-base dark:prose-invert max-w-none'

  return (
    <div
      data-block-id={block.id}
      data-chunk-id={block.chunkId}
      data-start-offset={block.startOffset}
      data-end-offset={block.endOffset}
      className={`${proseClass} py-2 min-h-[1rem]`}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  )
})
