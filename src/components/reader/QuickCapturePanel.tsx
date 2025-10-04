'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, X, Tag, Palette, Layers } from 'lucide-react'
import { createAnnotation, updateAnnotation } from '@/app/actions/annotations'
import { extractContext } from '@/lib/annotations/text-range'
import type { TextSelection, Chunk, OptimisticAnnotation, StoredAnnotation } from '@/types/annotations'
import { cn } from '@/lib/utils'

interface QuickCapturePanelProps {
  selection: TextSelection
  documentId: string
  onClose: () => void
  chunks: Chunk[]
  onAnnotationCreated?: (annotation: OptimisticAnnotation) => void
  onAnnotationUpdated?: (annotation: StoredAnnotation) => void
  existingAnnotation?: StoredAnnotation | null
  mode?: 'create' | 'edit'
}

type HighlightColor = 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange' | 'pink'

const COLOR_OPTIONS: Array<{
  key: string
  color: HighlightColor
  label: string
  bgClass: string
}> = [
  { key: 'y', color: 'yellow', label: 'Yellow', bgClass: 'bg-yellow-200 hover:bg-yellow-300 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/40' },
  { key: 'g', color: 'green', label: 'Green', bgClass: 'bg-green-200 hover:bg-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/40' },
  { key: 'b', color: 'blue', label: 'Blue', bgClass: 'bg-blue-200 hover:bg-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/40' },
  { key: 'r', color: 'red', label: 'Red', bgClass: 'bg-red-200 hover:bg-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/40' },
  { key: 'p', color: 'purple', label: 'Purple', bgClass: 'bg-purple-200 hover:bg-purple-300 dark:bg-purple-900/30 dark:hover:bg-purple-900/40' },
  { key: 'o', color: 'orange', label: 'Orange', bgClass: 'bg-orange-200 hover:bg-orange-300 dark:bg-orange-900/30 dark:hover:bg-orange-900/40' },
  { key: 'k', color: 'pink', label: 'Pink', bgClass: 'bg-pink-200 hover:bg-pink-300 dark:bg-pink-900/30 dark:hover:bg-pink-900/40' },
]

/**
 * Portal-based quick capture panel for creating annotations.
 * Uses React Portal directly (not Popover) to avoid click-capture issues.
 * Implements optimistic updates for instant feedback.
 * @param root0
 * @param root0.selection
 * @param root0.documentId
 * @param root0.onClose
 * @param root0.chunks
 * @param root0.onAnnotationCreated
 */
export function QuickCapturePanel({
  selection,
  documentId,
  onClose,
  chunks,
  onAnnotationCreated,
  onAnnotationUpdated,
  existingAnnotation,
  mode = 'create',
}: QuickCapturePanelProps) {
  // Initialize state from existingAnnotation in edit mode
  const [note, setNote] = useState(existingAnnotation?.components.annotation?.note || '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(existingAnnotation?.components.annotation?.tags || [])
  const [savingColor, setSavingColor] = useState<HighlightColor | null>(null)
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(
    existingAnnotation?.components.annotation?.color || 'yellow'
  )

  // Derived state - no re-renders when toggling
  const saving = savingColor !== null

  const panelRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Click-outside detection only - no event stopping inside panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return

      const target = e.target as HTMLElement

      console.log('[QuickCapture] Click detected:', {
        target: target.tagName,
        isInsidePanel: panel.contains(target),
      })

      // Only close if click is outside panel
      if (!panel.contains(target)) {
        console.log('[QuickCapture] Click outside - closing panel')
        onClose()
      } else {
        console.log('[QuickCapture] Click inside - keeping panel open')
      }
    }

    // Delay to avoid capturing the click that opened the panel
    const timeoutId = setTimeout(() => {
      console.log('[QuickCapture] Click-outside listener attached')
      document.addEventListener('mousedown', handleClickOutside)
    }, 200)

    return () => {
      console.log('[QuickCapture] Cleanup - removing click-outside listener')
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const saveAnnotation = useCallback(
    async (color: HighlightColor, shouldClose: boolean = false) => {
      console.log('[QuickCapture] saveAnnotation called, color:', color, 'shouldClose:', shouldClose, 'mode:', mode)
      if (savingColor) {
        console.log('[QuickCapture] Already saving, skipping')
        return
      }

      setSavingColor(color)

      try {
        if (mode === 'edit' && existingAnnotation) {
          // ========================================
          // EDIT MODE: Update existing annotation
          // ========================================
          console.log('[QuickCapture] Updating annotation:', existingAnnotation.id)

          // Update annotation via server action
          const result = await updateAnnotation(existingAnnotation.id, {
            color,
            note: note.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
          })

          if (result.success) {
            // Update serverAnnotations via callback
            if (onAnnotationUpdated) {
              const updatedAnnotation: StoredAnnotation = {
                ...existingAnnotation,
                components: {
                  ...existingAnnotation.components,
                  annotation: {
                    ...existingAnnotation.components.annotation!,
                    color,
                    note: note.trim() || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                  },
                },
              }
              onAnnotationUpdated(updatedAnnotation)
            }

            toast.success('Highlight updated', {
              description: `${
                color.charAt(0).toUpperCase() + color.slice(1)
              } highlight updated`,
              duration: 2000,
            })

            // Only close if shouldClose is true
            if (shouldClose) {
              onClose()
            }
          } else {
            toast.error('Failed to update highlight', {
              description: result.error || 'Please try again',
              duration: 5000,
            })
          }
        } else {
          // ========================================
          // CREATE MODE: New annotation
          // ========================================
          // Extract context from primary chunk
          const primaryChunkId = selection.range.chunkIds[0]
          const primaryChunk = chunks.find((c) => c.id === primaryChunkId)

          if (!primaryChunk) {
            toast.error('Failed to find annotation chunk')
            setSaving(false)
            return
          }

          // Convert to chunk-relative offsets for context extraction
          const chunkStartOffset = primaryChunk.start_offset ?? 0
          const chunkRelativeStart = Math.max(
            0,
            selection.range.startOffset - chunkStartOffset
          )
          const chunkRelativeEnd = Math.min(
            primaryChunk.content.length,
            selection.range.endOffset - chunkStartOffset
          )

          const textContext = extractContext(
            primaryChunk.content,
            chunkRelativeStart,
            chunkRelativeEnd
          )

          // Create optimistic annotation for immediate UI update
          const optimisticAnnotation: OptimisticAnnotation = {
            id: `temp-${Date.now()}`,
            text: selection.text,
            chunk_ids: selection.range.chunkIds,
            document_id: documentId,
            start_offset: selection.range.startOffset,
            end_offset: selection.range.endOffset,
            color,
            note: note.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
            text_context: textContext,
            created_at: new Date().toISOString(),
          }

          // Update UI immediately (optimistic)
          if (onAnnotationCreated) {
            onAnnotationCreated(optimisticAnnotation)
          }

          // Save to server in background
          const result = await createAnnotation({
            text: selection.text,
            chunkIds: selection.range.chunkIds,
            documentId,
            startOffset: selection.range.startOffset,
            endOffset: selection.range.endOffset,
            color,
            note: note.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
            textContext,
          })

          if (result.success) {
            // Replace temp ID with real ID
            if (onAnnotationCreated && result.id) {
              onAnnotationCreated({
                ...optimisticAnnotation,
                id: result.id,
              })
            }

            toast.success('Highlight saved', {
              description: `${
                color.charAt(0).toUpperCase() + color.slice(1)
              } highlight created`,
              duration: 2000,
            })

            // Only close if shouldClose is true
            if (shouldClose) {
              onClose()
            }
          } else {
            // Revert optimistic update
            if (onAnnotationCreated) {
              onAnnotationCreated({ ...optimisticAnnotation, _deleted: true })
            }

            toast.error('Failed to save highlight', {
              description: result.error || 'Please try again',
              action: {
                label: 'Retry',
                onClick: () => void saveAnnotation(color, shouldClose),
              },
              duration: 5000,
            })
          }
        }
      } catch (error) {
        console.error('Failed to save annotation:', error)

        toast.error('Network error', {
          description: 'Could not reach server. Check your connection.',
          duration: 5000,
        })
      } finally {
        setSavingColor(null)
      }
    },
    [
      savingColor,
      chunks,
      selection,
      documentId,
      note,
      tags,
      onClose,
      onAnnotationCreated,
      onAnnotationUpdated,
      existingAnnotation,
      mode,
    ]
  )

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed])
      setTagInput('')
    }
  }, [tagInput, tags])

  const handleRemoveTag = useCallback(
    (tag: string) => {
      setTags(tags.filter((t) => t !== tag))
    },
    [tags]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement
      const isTyping =
        activeElement === noteRef.current ||
        activeElement === tagInputRef.current ||
        (activeElement instanceof HTMLInputElement) ||
        (activeElement instanceof HTMLTextAreaElement)

      // Escape always closes (even when typing)
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      // Don't capture color shortcuts if user is typing
      if (isTyping) {
        return
      }

      // Color shortcuts (only when NOT typing)
      const colorOption = COLOR_OPTIONS.find(
        (opt) => opt.key === e.key.toLowerCase()
      )
      if (colorOption) {
        e.preventDefault()
        void saveAnnotation(colorOption.color, false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveAnnotation, onClose])

  // Calculate position (memoized to prevent re-calculation)
  const style: React.CSSProperties = useMemo(() => ({
    position: 'fixed',
    top: Math.min(selection.rect.bottom + 10, window.innerHeight - 420),
    left: selection.rect.left + selection.rect.width / 2,
    transform: 'translateX(-50%)',
    zIndex: 50,
  }), [selection.rect])

  const panelContent = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      className="quick-capture-panel bg-background border rounded-lg shadow-2xl p-4 w-[420px]"
      style={style}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground line-clamp-2 break-words">
              &ldquo;{selection.text}&rdquo;
            </p>
            {selection.range.chunkIds.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3 w-3" />
                <span>Spans {selection.range.chunkIds.length} chunks</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={onClose}
            disabled={saving}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Color picker */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Highlight Color</span>
          </div>
          <div className="flex gap-1.5">
            {COLOR_OPTIONS.map((option) => (
              <button
                key={option.color}
                onClick={() => void saveAnnotation(option.color, false)}
                disabled={saving}
                title={`${option.label} (${option.key})`}
                className={cn(
                  'w-8 h-8 rounded-md transition-all flex items-center justify-center border border-border',
                  option.bgClass,
                  saving && 'opacity-50 cursor-not-allowed'
                )}
              >
                {saving && savingColor === option.color ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs font-semibold">
                    {option.key.toUpperCase()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Note (optional)</label>
          <Textarea
            ref={noteRef}
            placeholder="Add context, thoughts, questions..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
            className="min-h-[80px] resize-none"
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium">Tags</label>
          </div>
          <Input
            ref={tagInputRef}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddTag()
              }
            }}
            placeholder="Add tags (press Enter)..."
            disabled={saving}
          />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    disabled={saving}
                    className="hover:text-foreground disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-muted-foreground">
            Press a letter key to save with that color
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void saveAnnotation(selectedColor, true)}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save with Note'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // Render to document.body using Portal
  return typeof window !== 'undefined'
    ? createPortal(panelContent, document.body)
    : null
}
