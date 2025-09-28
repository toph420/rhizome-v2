'use client'

import { useEffect, useState, Component, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { captureSelection } from '@/lib/annotations/text-range'
import { ChunkWrapper } from './ChunkWrapper'
import { QuickCapturePanel } from './QuickCapturePanel'
import { KeyboardHelp } from './KeyboardHelp'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AlertCircle, RefreshCw } from 'lucide-react'
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
 * @param props - Component props.
 * @param props.documentId - Document identifier.
 * @param props.markdownUrl - Signed URL to fetch markdown content.
 * @param props.chunks - Document chunks for annotation mapping.
 * @param props.annotations - Stored annotations to render.
 * @returns React element with document viewer.
 */
export function DocumentViewer({
  documentId,
  markdownUrl,
  chunks,
  annotations,
}: DocumentViewerProps) {
  const [markdown, setMarkdown] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedText, setSelectedText] = useState<TextSelection | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  
  // Track paragraph index for chunk mapping (MVP heuristic)
  let paragraphIndex = 0

  // Load markdown from signed URL
  useEffect(() => {
    async function loadMarkdown() {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(markdownUrl)
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Document not found. It may have been deleted.')
          }
          if (response.status >= 500) {
            throw new Error('Server error. Please try again in a moment.')
          }
          throw new Error(`Failed to fetch markdown (${response.status})`)
        }
        const text = await response.text()
        setMarkdown(text)
        setRetryCount(0) // Reset retry count on success
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load document'
        console.error('Failed to load markdown:', err)
        setError(errorMessage)
        
        // Show user-friendly toast notification
        toast.error('Failed to load document', {
          description: errorMessage,
          duration: 5000,
        })
      } finally {
        setLoading(false)
      }
    }

    loadMarkdown()
  }, [markdownUrl, retryCount])

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

  // Handle retry
  function handleRetry() {
    if (retryCount < 3) {
      setRetryCount(retryCount + 1)
    } else {
      toast.error('Maximum retry attempts reached', {
        description: 'Please refresh the page or contact support.',
        duration: 5000,
      })
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-4xl">
        <div className="space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
          <div className="pt-4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
          <div className="pt-4" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-4/5" />
        </div>
      </div>
    )
  }

  // Error state with retry
  if (error) {
    return (
      <div className="container mx-auto p-8 max-w-4xl">
        <div className="border border-destructive rounded-lg p-6 bg-destructive/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-destructive mb-2">
                Failed to load document
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {error}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleRetry}
                  disabled={retryCount >= 3}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry {retryCount > 0 && `(${retryCount}/3)`}
                </Button>
                <Button
                  onClick={() => window.location.href = '/'}
                  variant="ghost"
                  size="sm"
                >
                  Back to Library
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Annotation error handler
  function handleAnnotationError(error: Error) {
    console.error('Annotation rendering error:', error)
    toast.error('Annotation Error', {
      description: 'Some annotations may not appear correctly. Document is still readable.',
      duration: 4000,
    })
  }

  return (
    <div className="container mx-auto p-8 max-w-4xl" onMouseUp={handleMouseUp}>
      <ErrorBoundary
        fallback={(
          <ErrorFallback
            message="Failed to render annotations for this section"
            onRetry={() => window.location.reload()}
          />
        )}
        onError={handleAnnotationError}
      >
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
      </ErrorBoundary>

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
      
      <KeyboardHelp />
    </div>
  )
}

/**
 * Error fallback component for annotation rendering errors.
 * Displays user-friendly error message with retry option.
 * @param props - Component props.
 * @param props.message - Error message to display.
 * @param props.onRetry - Callback function to retry operation.
 * @returns React element with error UI.
 */
function ErrorFallback({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="border border-destructive rounded-md p-4 my-4 bg-destructive/10">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium text-destructive">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Retry
      </Button>
    </div>
  )
}

/**
 * Error Boundary component for catching annotation rendering errors.
 * Prevents entire page crash if annotation layer fails.
 */
class ErrorBoundary extends Component<
  {
    children: ReactNode
    fallback: ReactNode
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  },
  { hasError: boolean }
> {
  constructor(props: {
    children: ReactNode
    fallback: ReactNode
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}