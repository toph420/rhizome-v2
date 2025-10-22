'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Zap, Loader2, X, Tag, Link, Hash, Quote, Highlighter } from 'lucide-react'
import { createSpark, updateSpark, linkAnnotationToSpark } from '@/app/actions/sparks'
import { getAnnotationsByIds } from '@/app/actions/annotations'
import { extractTags, extractChunkIds } from '@/lib/sparks/extractors'
import type { SparkContext, SparkSelection } from '@/lib/sparks/types'
import type { StoredAnnotation } from '@/types/annotations'
import { motion, AnimatePresence } from 'framer-motion'
import { useUIStore } from '@/stores/ui-store'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useTextSelection } from '@/hooks/useTextSelection'

interface QuickSparkCaptureProps {
  // All props optional - sparks can be created anywhere without document context
  documentId?: string
  documentTitle?: string
  currentChunkId?: string
  visibleChunks?: string[]
  connections?: any[]
  engineWeights?: { semantic: number; contradiction: number; bridge: number }
  chunks?: any[] // For text selection hook
}

/**
 * Quick Spark Capture Component
 *
 * Bottom slide-in panel for capturing sparks while reading.
 * Non-blocking alternative to modal dialog.
 *
 * **UX Philosophy**:
 * - Slides up from bottom on Cmd+K (managed by ReaderLayout)
 * - Takes ~30% of screen height
 * - Document content remains visible and scrollable above
 * - Dismissible with Esc or close button
 * - Auto-quotes selected text when opened
 * - Cmd+Enter to submit
 * - When open: shows "Quote This" and "Create Annotation" buttons for text selection
 */
export function QuickSparkCapture({
  documentId,
  documentTitle,
  currentChunkId,
  visibleChunks,
  connections,
  engineWeights,
  chunks,
}: QuickSparkCaptureProps) {
  // UIStore state
  const isOpen = useUIStore(state => state.sparkCaptureOpen)
  const closeSparkCapture = useUIStore(state => state.closeSparkCapture)
  const openQuickCapture = useUIStore(state => state.openQuickCapture)
  const setPendingAnnotationSelection = useUIStore(state => state.setPendingAnnotationSelection)
  const editingSparkId = useUIStore(state => state.editingSparkId)
  const editingSparkContent = useUIStore(state => state.editingSparkContent)
  const editingSparkSelections = useUIStore(state => state.editingSparkSelections)
  const setEditingSparkContent = useUIStore(state => state.setEditingSparkContent)

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [frozenSelection, setFrozenSelection] = useState<any>(null)
  const [debouncedContent, setDebouncedContent] = useState('')
  const [selections, setSelections] = useState<SparkSelection[]>([])  // NEW - multiple selections
  const [loadedAnnotations, setLoadedAnnotations] = useState<StoredAnnotation[]>([])  // Lazy-loaded annotation content
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // NEW - Phase 6b (revised): Use UIStore for linked annotations
  const linkedAnnotationIds = useUIStore(state => state.linkedAnnotationIds)
  const removeLinkedAnnotation = useUIStore(state => state.removeLinkedAnnotation)

  // Annotation store for hybrid loading
  const annotations = useAnnotationStore(state => state.annotations)

  // Text selection when panel is open (only enabled when panel is open AND chunks available)
  const { selection, clearSelection } = useTextSelection({
    chunks: chunks || [],
    enabled: isOpen && !!chunks && chunks.length > 0,
    debounceMs: 50, // Faster response, less chance of expansion
  })

  // Freeze selection when it appears, replace if new selection comes in
  useEffect(() => {
    if (selection) {
      // Always update to latest selection (allow user to change their mind)
      setFrozenSelection(selection)
    }
  }, [selection])

  // Debounce content for tag/chunk extraction (prevent typing lag)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(content)
    }, 300)
    return () => clearTimeout(timer)
  }, [content])

  // Extract tags and chunk IDs from debounced content
  const extractedTags = useMemo(() => extractTags(debouncedContent), [debouncedContent])
  const extractedChunkIds = useMemo(() => extractChunkIds(debouncedContent), [debouncedContent])

  // Pre-fill editing data when panel opens or when switching to different spark
  useEffect(() => {
    if (isOpen && editingSparkId) {
      // Pre-fill content, selections, and linked annotations when editing
      if (editingSparkContent) {
        setContent(editingSparkContent)
      }
      if (editingSparkSelections && editingSparkSelections.length > 0) {
        setSelections(editingSparkSelections)
      }
      // linkedAnnotationIds already tracked in UIStore, no need to set here
    } else if (isOpen && !editingSparkId) {
      // Creating new spark - clear everything
      setContent('')
      setSelections([])
    }
  }, [isOpen, editingSparkId, editingSparkContent, editingSparkSelections]) // Run when editingSparkId changes

  // Focus textarea when panel opens (run only once when panel opens)
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to ensure animation completes
      setTimeout(() => {
        textareaRef.current?.focus()
        // Move cursor to end (capture content length at this moment)
        const length = textareaRef.current.value.length
        textareaRef.current?.setSelectionRange(length, length)
      }, 100)
    }
  }, [isOpen]) // Only run when panel opens, NOT on every content change

  // Reset content, selections, and frozen selection when panel closes
  useEffect(() => {
    if (!isOpen) {
      setContent('')
      setSelections([])
      setFrozenSelection(null)
      setLoadedAnnotations([])
      // Note: linkedAnnotationIds cleared by UIStore closeSparkCapture
      clearSelection()
    }
  }, [isOpen, clearSelection])

  // Hybrid annotation loading: check store first, fetch missing from server
  useEffect(() => {
    if (linkedAnnotationIds.length === 0) {
      setLoadedAnnotations([])
      return
    }

    // Try to find in store first (fast path)
    const foundInStore: StoredAnnotation[] = []
    const missingIds: string[] = []

    for (const id of linkedAnnotationIds) {
      let found = false
      // Search across all documents in store
      for (const docId in annotations) {
        const annotation = annotations[docId]?.find(a => a.id === id)
        if (annotation) {
          foundInStore.push(annotation)
          found = true
          break
        }
      }
      if (!found) {
        missingIds.push(id)
      }
    }

    if (missingIds.length === 0) {
      // All found in store - fast path
      setLoadedAnnotations(foundInStore)
    } else {
      // Some missing - fetch from server
      getAnnotationsByIds(missingIds).then(fetched => {
        setLoadedAnnotations([...foundInStore, ...fetched])
      })
    }
  }, [linkedAnnotationIds, annotations])

  // Add visual indicator class to body when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('spark-capture-active')
    } else {
      document.body.classList.remove('spark-capture-active')
    }

    return () => {
      document.body.classList.remove('spark-capture-active')
    }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!content.trim() || loading) return

    setLoading(true)
    try {
      if (editingSparkId) {
        // Update existing spark
        const tags = extractTags(content)
        const result = await updateSpark({
          sparkId: editingSparkId,
          content: content.trim(),
          selections,
          tags,
        })

        // Link annotations if any were added during edit
        if (linkedAnnotationIds.length > 0) {
          await Promise.all(
            linkedAnnotationIds.map(annotationId =>
              linkAnnotationToSpark(editingSparkId, annotationId)
            )
          )
        }

        console.log('[Sparks] ✓ Updated successfully')
      } else {
        // Create new spark
        // Only provide context if we have document information
        const sparkContext: SparkContext | undefined = documentId ? {
          documentId,
          documentTitle: documentTitle || '',
          originChunkId: currentChunkId || visibleChunks?.[0] || '',
          visibleChunks: visibleChunks || [],
          scrollPosition: window.scrollY,
          activeConnections: connections || [],
          engineWeights: engineWeights || { semantic: 0.25, contradiction: 0.40, bridge: 0.35 },
          selection: selection ? {
            text: selection.text,
            chunkId: selection.range.chunkIds[0] || currentChunkId || '',
            startOffset: selection.range.startOffset,
            endOffset: selection.range.endOffset
          } : undefined
        } : undefined

        const result = await createSpark({
          content: content.trim(),
          selections,
          context: sparkContext
        })

        // Link annotations to the created spark
        if (linkedAnnotationIds.length > 0 && result.sparkId) {
          await Promise.all(
            linkedAnnotationIds.map(annotationId =>
              linkAnnotationToSpark(result.sparkId, annotationId)
            )
          )
        }

        console.log('[Sparks] ✓ Created successfully' + (linkedAnnotationIds.length > 0 ? ` with ${linkedAnnotationIds.length} linked annotations` : ''))
      }

      // Close panel
      closeSparkCapture()
    } catch (error) {
      console.error('[Sparks] Failed to save:', error)
      alert('Failed to save spark. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Cmd+Enter to submit and Escape to close
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSparkCapture()
    }
  }

  // Helper: Get context before selected text
  const getContextBefore = (text: string, fullMarkdown: string): string => {
    const index = fullMarkdown.indexOf(text)
    if (index === -1) return ''
    const start = Math.max(0, index - 100)
    return fullMarkdown.slice(start, index)
  }

  // Helper: Get context after selected text
  const getContextAfter = (text: string, fullMarkdown: string): string => {
    const index = fullMarkdown.indexOf(text)
    if (index === -1) return ''
    const end = Math.min(fullMarkdown.length, index + text.length + 100)
    return fullMarkdown.slice(index + text.length, end)
  }

  // Quote selected text into selections array (not textarea)
  const handleQuoteThis = useCallback(() => {
    const activeSelection = frozenSelection || selection
    if (!activeSelection) return

    // Get full markdown for context
    const markdown = chunks.map((c: any) => c.markdown || '').join('\n')

    const newSelection: SparkSelection = {
      text: activeSelection.text,
      chunkId: activeSelection.range.chunkIds[0] || currentChunkId,
      startOffset: activeSelection.range.startOffset,
      endOffset: activeSelection.range.endOffset,
      textContext: {
        before: getContextBefore(activeSelection.text, markdown),
        after: getContextAfter(activeSelection.text, markdown)
      }
    }

    setSelections(prev => [...prev, newSelection])
    setFrozenSelection(null) // Clear frozen selection after quoting
    clearSelection()

    // Focus back on textarea
    textareaRef.current?.focus()
  }, [frozenSelection, selection, clearSelection, chunks, currentChunkId])

  // Remove selection from array
  const handleRemoveSelection = (index: number) => {
    setSelections(prev => prev.filter((_, i) => i !== index))
  }

  // Create annotation from selection (keeps spark panel open)
  const handleCreateAnnotation = useCallback(() => {
    const activeSelection = frozenSelection || selection
    if (!activeSelection) return

    // Scroll to selection in reader (make it visible in upper half of viewport)
    const firstChunkId = activeSelection.range.chunkIds[0]
    if (firstChunkId) {
      const chunkElement = document.querySelector(`[data-chunk-id="${firstChunkId}"]`)
      if (chunkElement) {
        chunkElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    // Pass selection to VirtualizedReader via UIStore
    setPendingAnnotationSelection(activeSelection)

    // Open annotation quick capture panel (draggable, stays on screen)
    openQuickCapture()

    setFrozenSelection(null) // Clear frozen selection after passing to annotation panel
  }, [frozenSelection, selection, openQuickCapture, setPendingAnnotationSelection])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed left-0 top-20 bottom-20 z-50 w-[400px]"
        >
          <Card className="border shadow-2xl rounded-lg bg-background">
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
                onClick={closeSparkCapture}
                disabled={loading}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Selections Display (NEW) */}
              {selections.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Quote className="w-3 h-3" />
                    <span>{selections.length} selection{selections.length !== 1 ? 's' : ''}</span>
                  </div>
                  {selections.map((sel, i) => (
                    <div
                      key={i}
                      className="p-2 bg-muted/30 rounded border border-muted-foreground/20 text-sm relative group"
                    >
                      <p className="pr-6 italic">
                        &ldquo;{sel.text.length > 150
                          ? sel.text.slice(0, 150) + '...'
                          : sel.text}&rdquo;
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {sel.chunkId}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={() => handleRemoveSelection(i)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* NEW - Phase 6b (revised): Linked Annotations Display with lazy-loaded content */}
              {loadedAnnotations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Highlighter className="w-3 h-3" />
                    <span>{loadedAnnotations.length} linked annotation{loadedAnnotations.length !== 1 ? 's' : ''}</span>
                  </div>
                  {loadedAnnotations.map((annotation) => {
                    // Annotations use PascalCase component names
                    const positionData = annotation.components.Position
                    const contentData = annotation.components.Content
                    const visualData = annotation.components.Visual

                    // Color mapping for border
                    const colorMap: Record<string, string> = {
                      yellow: '#fbbf24',
                      blue: '#3b82f6',
                      green: '#10b981',
                      red: '#ef4444',
                      purple: '#a855f7',
                      orange: '#f97316',
                      pink: '#ec4899',
                    }

                    // Get color from Visual component
                    const borderColor = visualData?.color ? (colorMap[visualData.color] || '#6b7280') : '#6b7280'

                    return (
                      <div
                        key={annotation.id}
                        className="p-2 bg-muted/30 rounded border border-muted-foreground/20 text-sm relative group"
                        style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}
                      >
                        <p className="pr-6 text-xs italic mb-1">
                          &ldquo;{positionData?.originalText?.slice(0, 100) || contentData?.note?.slice(0, 100) || 'No text'}{(positionData?.originalText?.length || contentData?.note?.length || 0) > 100 ? '...' : ''}&rdquo;
                        </p>
                        {contentData?.tags && contentData.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {contentData.tags.slice(0, 3).map((tag, i) => (
                              <Badge key={i} variant="secondary" className="h-4 text-xs px-1.5">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                          onClick={() => removeLinkedAnnotation(annotation.id)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* User's Thought (Clean Textarea) */}
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's your thought? Use /chunk_id to link chunks, #tags for organization"
                className="min-h-[120px] resize-none font-mono text-sm"
                disabled={loading}
              />

              {/* Text Selection Actions (when text is selected) */}
              {(frozenSelection || selection) && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-muted/50 rounded-lg border border-primary/20"
                >
                  <p className="text-xs text-muted-foreground mb-2">
                    Selected: &ldquo;{(frozenSelection || selection)!.text.substring(0, 60)}{(frozenSelection || selection)!.text.length > 60 ? '...' : ''}&rdquo;
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleQuoteThis}
                      className="text-xs h-7"
                    >
                      <Quote className="w-3 h-3 mr-1" />
                      Quote This
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCreateAnnotation}
                      className="text-xs h-7"
                    >
                      <Highlighter className="w-3 h-3 mr-1" />
                      Create Annotation
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Context Info & Extracted Metadata */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {documentTitle && (
                      <div className="flex items-center gap-1">
                        <Link className="w-3 h-3" />
                        <span className="truncate max-w-[200px]" title={documentTitle}>
                          {documentTitle}
                        </span>
                      </div>
                    )}
                    {!documentTitle && (
                      <div className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        <span>Global Spark</span>
                      </div>
                    )}
                    {connections && connections.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        <span title={`${connections.length} connections available for inheritance`}>
                          {connections.length} chunk{connections.length !== 1 ? 's' : ''} connected
                        </span>
                      </div>
                    )}
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
                  onClick={closeSparkCapture}
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
                      {editingSparkId ? 'Updating...' : 'Saving...'}
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      {editingSparkId ? 'Update Spark' : 'Save Spark'}
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
