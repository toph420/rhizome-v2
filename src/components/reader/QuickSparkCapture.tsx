'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Zap, Loader2, X, Tag, Link, Hash } from 'lucide-react'
import { createSpark } from '@/app/actions/sparks'
import { extractTags, extractChunkIds } from '@/lib/sparks/extractors'
import type { SparkContext } from '@/lib/sparks/types'
import { motion, AnimatePresence } from 'framer-motion'

interface QuickSparkCaptureProps {
  documentId: string
  documentTitle: string
  currentChunkId: string
  visibleChunks: string[]
  connections: any[]
  engineWeights: { semantic: number; contradiction: number; bridge: number }
}

/**
 * Quick Spark Capture Component
 *
 * Bottom slide-in panel for capturing sparks while reading.
 * Non-blocking alternative to modal dialog.
 *
 * **UX Philosophy**:
 * - Slides up from bottom on Cmd+K
 * - Takes ~30% of screen height
 * - Document content remains visible and scrollable above
 * - Dismissible with Esc or close button
 * - Auto-quotes selected text
 * - Cmd+Enter to submit
 */
export function QuickSparkCapture({
  documentId,
  documentTitle,
  currentChunkId,
  visibleChunks,
  connections,
  engineWeights
}: QuickSparkCaptureProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  // Extract tags and chunk IDs as user types
  const extractedTags = useMemo(() => extractTags(content), [content])
  const extractedChunkIds = useMemo(() => extractChunkIds(content), [content])

  // Cmd+K hotkey to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)

        // Auto-quote selection if exists
        const selection = window.getSelection()
        const selectedText = selection?.toString().trim()
        if (selectedText) {
          setContent(`> "${selectedText}"\n\n`)
        }
      }

      // Esc to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setContent('')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  const handleSubmit = async () => {
    if (!content.trim() || loading) return

    setLoading(true)
    try {
      // Build context from current reader state
      const sparkContext: SparkContext = {
        documentId,
        documentTitle,
        originChunkId: currentChunkId,
        visibleChunks,
        scrollPosition: window.scrollY,
        activeConnections: connections,
        engineWeights,
        selection: window.getSelection()?.toString() ? {
          text: window.getSelection()!.toString(),
          chunkId: currentChunkId,
          startOffset: 0,
          endOffset: window.getSelection()!.toString().length
        } : undefined
      }

      // Create spark
      await createSpark({
        content: content.trim(),
        context: sparkContext
      })

      // Reset and close
      setContent('')
      setIsOpen(false)

      console.log('[Sparks] ✓ Created successfully')
    } catch (error) {
      console.error('[Sparks] Failed to create:', error)
      alert('Failed to create spark. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Cmd+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-0 left-0 right-0 z-50"
        >
          <Card className="border-t shadow-2xl rounded-t-lg rounded-b-none bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                <h3 className="font-semibold">Capture Spark</h3>
                <kbd className="ml-2 text-xs text-muted-foreground px-2 py-1 bg-muted rounded">
                  ⌘K
                </kbd>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false)
                  setContent('')
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Capture your thought... Use /chunk_id to link chunks, #tags for organization"
                className="min-h-[120px] resize-none font-mono text-sm"
                autoFocus
                disabled={loading}
              />

              {/* Context Info & Extracted Metadata */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Link className="w-3 h-3" />
                      <span>{documentTitle}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      <span>{connections.length} connections</span>
                    </div>
                  </div>
                  <div>
                    {content.trim().length} chars • Cmd+Enter to save
                  </div>
                </div>

                {/* Live metadata preview */}
                {(extractedTags.length > 0 || extractedChunkIds.length > 0) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {extractedTags.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Tags:</span>
                        {extractedTags.map(tag => (
                          <Badge key={tag} variant="secondary" className="h-5 text-xs">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {extractedChunkIds.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Link className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Links:</span>
                        {extractedChunkIds.map(chunkId => (
                          <Badge key={chunkId} variant="outline" className="h-5 text-xs font-mono">
                            /{chunkId}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsOpen(false)
                    setContent('')
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !content.trim()}
                  className="bg-yellow-500 hover:bg-yellow-600"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Save Spark
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
