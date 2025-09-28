'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { captureSelection } from '@/lib/annotations/text-range'
import { ChunkWrapper } from './ChunkWrapper'
import { QuickCapturePanel } from './QuickCapturePanel'
import type { Chunk, StoredAnnotation, TextSelection } from '@/types/annotations'

interface DocumentViewerProps {
  documentId: string
  markdownUrl: string
  chunks: Chunk[]
  annotations: StoredAnnotation[]
}

/**
 * Document viewer component with markdown rendering and text selection.
 * Handles document display, text selection capture, and annotation overlays.
 */
export function DocumentViewer({
  documentId,
  markdownUrl,
  chunks,
  annotations,
}: DocumentViewerProps) {
  const [markdown, setMarkdown] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null)
  
  // Track paragraph index for chunk mapping (MVP heuristic)
  let paragraphIndex = 0

  // Load markdown from signed URL
  useEffect(() => {
    async function loadMarkdown() {
      try {
        const response = await fetch(markdownUrl)
        if (!response.ok) {
          throw new Error('Failed to fetch markdown')
        }
        const text = await response.text()
        setMarkdown(text)
      } catch (error) {
        console.error('Failed to load markdown:', error)
      } finally {
        setLoading(false)
      }
    }

    loadMarkdown()
  }, [markdownUrl])

  // Handle text selection
  function handleMouseUp() {
    const selection = captureSelection()
    if (selection) {
      setSelectedText(selection)
    } else {
      setSelectedText(null)
    }
  }

  // Handle Escape key to close selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedText(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl" onMouseUp={handleMouseUp}>
      <div className="prose prose-sm lg:prose-base max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            // Wrap paragraphs with ChunkWrapper for annotation support
            p(props) {
              const { children, ...rest } = props
              // Map paragraph to chunk (MVP: use modulo for cycling through chunks)
              const currentParagraphIndex = paragraphIndex++
              const chunkIndex = currentParagraphIndex % chunks.length
              const chunkId = chunks[chunkIndex]?.id || 'unknown'
              
              return (
                <ChunkWrapper chunkId={chunkId} annotations={annotations}>
                  <p {...rest}>{children}</p>
                </ChunkWrapper>
              )
            },
            // Code blocks with syntax highlighting
            code(props) {
              const { children, className, ...rest } = props
              const inline = !className
              if (inline) {
                return (
                  <code className="bg-muted px-1 py-0.5 rounded text-sm" {...rest}>
                    {children}
                  </code>
                )
              }
              return (
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code className={className} {...rest}>
                    {children}
                  </code>
                </pre>
              )
            },
            // Tables
            table({ children, ...props }) {
              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border" {...props}>
                    {children}
                  </table>
                </div>
              )
            },
            // Blockquotes
            blockquote({ children, ...props }) {
              return (
                <blockquote
                  className="border-l-4 border-primary pl-4 italic text-muted-foreground"
                  {...props}
                >
                  {children}
                </blockquote>
              )
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </div>

      {selectedText && (
        <QuickCapturePanel
          selection={selectedText}
          documentId={documentId}
          onClose={() => setSelectedText(null)}
          chunkContent={
            chunks.find((c) => c.id === selectedText.range.chunkId)?.content ||
            ''
          }
        />
      )}
    </div>
  )
}