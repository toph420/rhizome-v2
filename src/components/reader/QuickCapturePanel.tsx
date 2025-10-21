'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, X, Tag, Palette, Layers, GripVertical, Zap, Trash2 } from 'lucide-react'
import { createAnnotation, updateAnnotation, deleteAnnotation } from '@/app/actions/annotations'
import { extractContext } from '@/lib/annotations/text-range'
import type { TextSelection, Chunk, OptimisticAnnotation, AnnotationEntity } from '@/types/annotations'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import { useAnnotationStore } from '@/stores/annotation-store'

interface QuickCapturePanelProps {
  selection: TextSelection
  documentId: string
  onClose: () => void
  chunks: Chunk[]
  markdown: string
  onAnnotationCreated?: (annotation: OptimisticAnnotation) => void
  onAnnotationUpdated?: (annotation: AnnotationEntity) => void
  existingAnnotation?: AnnotationEntity | null
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
 * Portal-based panel for creating and editing annotations.
 * Supports both create mode (new annotations) and edit mode (existing annotations).
 * Uses optimistic updates for instant feedback.
 * **Draggable** - can be moved around the screen by dragging the header.
 */
export function QuickCapturePanel({
  selection,
  documentId,
  onClose,
  chunks,
  markdown,
  onAnnotationCreated,
  onAnnotationUpdated,
  existingAnnotation,
  mode = 'create',
}: QuickCapturePanelProps) {
  // NEW - Phase 6b: Check if spark panel is open and get link action
  const sparkCaptureOpen = useUIStore(state => state.sparkCaptureOpen)
  const addLinkedAnnotation = useUIStore(state => state.addLinkedAnnotation)
  const linkedAnnotationIds = useUIStore(state => state.linkedAnnotationIds)

  // Initialize state from existingAnnotation in edit mode
  const [note, setNote] = useState(existingAnnotation?.components.Content?.note || '')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(existingAnnotation?.components.Content?.tags || [])
  const [savingColor, setSavingColor] = useState<HighlightColor | null>(null)
  const [selectedColor, setSelectedColor] = useState<HighlightColor>(
    existingAnnotation?.components.Visual?.color || 'yellow'
  )
  const [isDragging, setIsDragging] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Track if we've created an annotation during this session (for create mode)
  // Once created, subsequent saves should UPDATE instead of creating duplicates
  const [createdAnnotation, setCreatedAnnotation] = useState<AnnotationEntity | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Get store actions for immediate UI updates
  const removeAnnotation = useAnnotationStore(state => state.removeAnnotation)

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!existingAnnotation?.id) return
    if (!confirm('Delete this annotation?')) return

    setDeleting(true)
    try {
      const result = await deleteAnnotation(existingAnnotation.id)
      if (result.success) {
        toast.success('Annotation deleted')

        // Immediately remove from store for instant UI update
        removeAnnotation(documentId, existingAnnotation.id)

        // Also trigger optimistic delete if callback exists
        if (onAnnotationCreated) {
          onAnnotationCreated({
            id: existingAnnotation.id,
            _deleted: true,
          } as OptimisticAnnotation)
        }

        onClose()
      } else {
        toast.error(result.error || 'Failed to delete annotation')
        setDeleting(false)
      }
    } catch (error) {
      console.error('[QuickCapturePanel] Delete failed:', error)
      toast.error('Failed to delete annotation')
      setDeleting(false)
    }
  }, [existingAnnotation?.id, documentId, removeAnnotation, onAnnotationCreated, onClose])
  const dragHandleRef = useRef<HTMLDivElement>(null)

  // Derived state
  const saving = savingColor !== null

  // Click-outside detection only - no event stopping inside panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return

      const target = e.target as HTMLElement

      // Only close if click is outside panel
      if (!panel.contains(target)) {
        onClose()
      }
    }

    // Delay to avoid capturing the click that opened the panel
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 200)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const saveAnnotation = useCallback(
    async (color: HighlightColor, shouldClose: boolean = false) => {
      if (savingColor) return

      setSavingColor(color)

      try {
        // Determine if we should update or create:
        // - Edit mode with existing annotation → UPDATE
        // - Create mode but already created this session → UPDATE (prevent duplicates)
        // - Create mode and nothing created yet → CREATE
        const shouldUpdate = (mode === 'edit' && existingAnnotation) || (mode === 'create' && createdAnnotation)
        const annotationToUpdate = mode === 'edit' ? existingAnnotation : createdAnnotation

        if (shouldUpdate && annotationToUpdate) {
          // UPDATE MODE: Update existing annotation (either from props or created this session)
          // Update annotation via server action
          const result = await updateAnnotation(annotationToUpdate.id, {
            color,
            note: note.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
          })

          if (result.success) {
            // Build updated annotation entity
            const updatedAnnotation: AnnotationEntity = {
              ...annotationToUpdate,
              components: {
                ...annotationToUpdate.components,
                Content: {
                  ...annotationToUpdate.components.Content!,
                  note: note.trim() || undefined,
                  tags: tags.length > 0 ? tags : [],
                },
                Visual: {
                  ...annotationToUpdate.components.Visual!,
                  color,
                },
              },
            }

            // Update serverAnnotations via callback
            if (onAnnotationUpdated) {
              onAnnotationUpdated(updatedAnnotation)
            }

            // Update local tracking if this was a create-mode annotation
            if (mode === 'create' && createdAnnotation) {
              setCreatedAnnotation(updatedAnnotation)
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
          // CREATE MODE: New annotation
          // Extract context from markdown (works for both chunked and gap regions)
          const textContext = extractContext(
            markdown,
            selection.range.startOffset,
            selection.range.endOffset
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
            // Store the created annotation for subsequent updates (prevent duplicates)
            if (result.id) {
              const createdEntity: AnnotationEntity = {
                id: result.id,
                user_id: '',
                created_at: optimisticAnnotation.created_at,
                updated_at: optimisticAnnotation.created_at,
                components: {
                  Position: {
                    documentId: documentId,
                    document_id: documentId,
                    startOffset: selection.range.startOffset,
                    endOffset: selection.range.endOffset,
                    originalText: selection.text,
                    textContext: optimisticAnnotation.text_context,
                    recoveryConfidence: 1.0,
                    recoveryMethod: 'exact',
                    needsReview: false,
                  },
                  Visual: {
                    type: 'highlight',
                    color,
                  },
                  Content: {
                    note: note.trim() || undefined,
                    tags: tags.length > 0 ? tags : [],
                  },
                  Temporal: {
                    createdAt: optimisticAnnotation.created_at,
                    updatedAt: optimisticAnnotation.created_at,
                  },
                  ChunkRef: {
                    chunkId: selection.range.chunkIds[0],
                    chunk_id: selection.range.chunkIds[0],
                    chunkIds: selection.range.chunkIds,
                    chunkPosition: 0,
                    documentId: documentId,
                    document_id: documentId,
                  },
                },
              }

              // Store full entity for subsequent updates
              setCreatedAnnotation(createdEntity)

              // Replace temp ID with real ID
              if (onAnnotationCreated) {
                onAnnotationCreated({
                  ...optimisticAnnotation,
                  id: result.id,
                })
              }
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
      markdown,
      onClose,
      onAnnotationCreated,
      onAnnotationUpdated,
      existingAnnotation,
      createdAnnotation,
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

  // NEW - Phase 6b: Handle linking to spark
  const handleLinkToSpark = useCallback(() => {
    // In create mode, we don't have an ID yet, so we need to save first
    if (mode === 'create') {
      toast.info('Save annotation first, then link to spark')
      return
    }

    // In edit mode, we have the annotation ID
    if (existingAnnotation?.id) {
      addLinkedAnnotation(existingAnnotation.id)
      toast.success('Linked to spark')
    }
  }, [mode, existingAnnotation, addLinkedAnnotation])

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

      // Cmd+Enter saves and closes (when typing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && isTyping) {
        e.preventDefault()
        void saveAnnotation(selectedColor, true)
        return
      }

      // Don't capture color shortcuts if user is typing
      if (isTyping) {
        return
      }

      // Color shortcuts (only when NOT typing) - save and close
      const colorOption = COLOR_OPTIONS.find(
        (opt) => opt.key === e.key.toLowerCase()
      )
      if (colorOption) {
        e.preventDefault()
        setSelectedColor(colorOption.color)
        void saveAnnotation(colorOption.color, true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveAnnotation, onClose, selectedColor])

  // Calculate position (memoized to prevent re-calculation)
  const style: React.CSSProperties = useMemo(() => ({
    position: 'fixed',
    top: Math.min(selection.rect.bottom + 10, window.innerHeight - 420),
    left: selection.rect.left + selection.rect.width / 2,
    transform: 'translateX(-50%)',
    zIndex: 50,
  }), [selection.rect])

  // Memoize color buttons to prevent re-render
  const colorButtons = useMemo(() => (
    COLOR_OPTIONS.map((option) => (
      <button
        key={option.color}
        onClick={() => {
          setSelectedColor(option.color)
          void saveAnnotation(option.color, false) // Save immediately but keep panel open
        }}
        disabled={saving}
        title={`${option.label} (click to save, ${option.key} to save & close)`}
        className={cn(
          'w-8 h-8 rounded-md transition-all flex items-center justify-center border-2',
          option.bgClass,
          selectedColor === option.color ? 'ring-2 ring-primary ring-offset-2 scale-110' : 'border-border',
          saving && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className="text-xs font-semibold">
          {option.key.toUpperCase()}
        </span>
      </button>
    ))
  ), [saving, selectedColor, saveAnnotation])

  // Enable drag from handle element
  useEffect(() => {
    const handleEl = dragHandleRef.current
    const panelEl = panelRef.current
    if (!handleEl || !panelEl) return

    let isDrag = false
    let startX = 0
    let startY = 0
    let initialX = 0
    let initialY = 0

    const handleMouseDown = (e: MouseEvent) => {
      isDrag = true
      setIsDragging(true)
      startX = e.clientX
      startY = e.clientY
      const rect = panelEl.getBoundingClientRect()
      initialX = rect.left
      initialY = rect.top
      e.preventDefault()
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrag) return
      const deltaX = e.clientX - startX
      const deltaY = e.clientY - startY
      const newX = Math.max(0, Math.min(initialX + deltaX, window.innerWidth - 420))
      const newY = Math.max(0, Math.min(initialY + deltaY, window.innerHeight - 200))
      panelEl.style.left = `${newX}px`
      panelEl.style.top = `${newY}px`
      panelEl.style.transform = 'none' // Remove centering transform when dragging
    }

    const handleMouseUp = () => {
      if (isDrag) {
        isDrag = false
        setIsDragging(false)
      }
    }

    handleEl.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      handleEl.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const panelContent = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      className={cn(
        "quick-capture-panel bg-background border rounded-lg shadow-2xl p-4 w-[420px] transition-opacity",
        isDragging && "opacity-90"
      )}
      style={style}
    >
      <div className="space-y-3">
        {/* Header with drag handle */}
        <div className="flex items-start justify-between gap-2 -m-4 p-4 mb-0">
          <div
            ref={dragHandleRef}
            data-drag-handle
            className={cn(
              "flex items-center gap-1 flex-1 min-w-0",
              !isDragging && "cursor-grab",
              isDragging && "cursor-grabbing"
            )}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
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
            {colorButtons}
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
            Click color to save • Letter key to save & close • ⌘↵ to finish
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving || deleting}>
              Cancel
            </Button>
            {/* Delete button - only in edit mode */}
            {mode === 'edit' && existingAnnotation && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="gap-1.5"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </>
                )}
              </Button>
            )}
            {/* NEW - Phase 6b: Link to Spark button (only show when spark panel is open) */}
            {sparkCaptureOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLinkToSpark}
                disabled={saving || mode === 'create' || (!!existingAnnotation?.id && linkedAnnotationIds.includes(existingAnnotation.id))}
                className="gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                {existingAnnotation?.id && linkedAnnotationIds.includes(existingAnnotation.id) ? 'Linked' : 'Link to Spark'}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => void saveAnnotation(selectedColor, true)}
              disabled={saving}
            >
              {saving && savingColor === selectedColor ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Note'
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
