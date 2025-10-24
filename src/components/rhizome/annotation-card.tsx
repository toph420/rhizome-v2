'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from '@/components/rhizome/card'
import { Badge } from '@/components/rhizome/badge'
import { Button } from '@/components/rhizome/button'
import { Textarea } from '@/components/rhizome/textarea'
import { Pencil, Save, X, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { updateAnnotation, deleteAnnotation } from '@/app/actions/annotations'
import { useAnnotationStore } from '@/stores/annotation-store'
import { toast } from 'sonner'

// Available highlight colors
const COLORS = ['yellow', 'green', 'blue', 'purple', 'pink'] as const
type AnnotationColor = typeof COLORS[number]

interface AnnotationCardProps {
  annotation: {
    entity_id: string
    text: string
    note?: string
    color: string
    tags: string[]
    created_at: string
    chunk_ids: string[]
  }
  documentId: string
  isActive?: boolean
  onJump?: () => void
  onDeleted?: () => void
}

/**
 * Feature-rich AnnotationCard with:
 * - Inline editing (double-click or 'e' key)
 * - Color picker with visual preview
 * - Server action integration for update/delete
 * - Optimistic updates with Zustand store
 * - Expand/collapse for long text
 * - Keyboard shortcuts (e/enter/escape/d)
 * - Simplified styling matching SparkCard
 */
export function AnnotationCard({
  annotation,
  documentId,
  isActive = false,
  onJump,
  onDeleted,
}: AnnotationCardProps) {
  const removeAnnotationStore = useAnnotationStore(state => state.removeAnnotation)
  const updateAnnotationStore = useAnnotationStore(state => state.updateAnnotation)
  const getAnnotation = useAnnotationStore(state =>
    state.annotations[documentId]?.find(a => a.id === annotation.entity_id)
  )

  const [isEditing, setIsEditing] = useState(false)
  const [editNote, setEditNote] = useState(annotation.note || '')
  const [editColor, setEditColor] = useState<AnnotationColor>(annotation.color as AnnotationColor)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isLongText = annotation.text.length > 150

  // Reset edit state when annotation changes
  useEffect(() => {
    setEditNote(annotation.note || '')
    setEditColor(annotation.color as AnnotationColor)
  }, [annotation.note, annotation.color])

  // Save changes with optimistic update
  const handleSave = useCallback(async () => {
    const hasChanges =
      editNote.trim() !== (annotation.note || '').trim() ||
      editColor !== annotation.color

    if (!hasChanges) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    const originalNote = annotation.note
    const originalColor = annotation.color

    try {
      const result = await updateAnnotation(annotation.entity_id, {
        note: editNote.trim(),
        color: editColor,
      })

      if (!result.success) {
        throw new Error('Failed to save')
      }

      // Update Zustand store optimistically (server action doesn't update store)
      if (getAnnotation) {
        const updated = {
          ...getAnnotation,
          components: {
            ...getAnnotation.components,
            Content: {
              ...getAnnotation.components.Content!,
              note: editNote.trim(),
            },
            Visual: {
              ...getAnnotation.components.Visual!,
              color: editColor,
            }
          }
        }
        updateAnnotationStore(documentId, annotation.entity_id, updated)
      }

      setIsEditing(false)
      toast.success('Annotation updated')
    } catch (error) {
      console.error('[AnnotationCard] Failed to save:', error)
      setEditNote(originalNote || '')
      setEditColor(originalColor as AnnotationColor)
      toast.error('Failed to save annotation')
    } finally {
      setIsSaving(false)
    }
  }, [editNote, editColor, annotation.entity_id])

  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditNote(annotation.note || '')
    setEditColor(annotation.color as AnnotationColor)
    setIsEditing(false)
  }, [annotation.note, annotation.color])

  // Delete annotation
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this annotation? This cannot be undone.')) {
      return
    }

    setIsDeleting(true)

    // Optimistic removal from Zustand store
    removeAnnotationStore(documentId, annotation.entity_id)

    try {
      const result = await deleteAnnotation(annotation.entity_id)

      if (!result.success) {
        throw new Error('Failed to delete')
      }

      toast.success('Annotation deleted')
      onDeleted?.()
    } catch (error) {
      console.error('[AnnotationCard] Failed to delete:', error)
      toast.error('Failed to delete annotation')
      // Note: Can't easily revert delete, so onDeleted callback will refetch
      onDeleted?.()
      setIsDeleting(false)
    }
  }, [annotation.entity_id, documentId, removeAnnotationStore, onDeleted])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isEditing && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        return
      }

      switch(e.key.toLowerCase()) {
        case 'e':
          if (!isEditing) {
            e.preventDefault()
            setIsEditing(true)
          }
          break
        case 'enter':
          if (isEditing && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSave()
          }
          break
        case 'escape':
          if (isEditing) {
            e.preventDefault()
            handleCancel()
          }
          break
        case 'd':
          if (!isEditing && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleDelete()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isActive, isEditing, handleSave, handleCancel, handleDelete])

  // Color mapping for left border
  const borderColorClasses: Record<AnnotationColor, string> = {
    yellow: 'border-l-yellow-400',
    green: 'border-l-green-400',
    blue: 'border-l-blue-400',
    purple: 'border-l-purple-400',
    pink: 'border-l-pink-400',
  }

  // Color mapping for color picker buttons
  const bgColorClasses: Record<AnnotationColor, string> = {
    yellow: 'bg-yellow-400',
    green: 'bg-green-400',
    blue: 'bg-blue-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400',
  }

  const currentColor = isEditing ? editColor : (annotation.color as AnnotationColor)

  return (
    <Card
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-all',
        isActive && "",
      )}
      onClick={!isEditing ? onJump : undefined}
      onDoubleClick={() => !isEditing && setIsEditing(true)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <p className={cn(
              "text-sm font-medium",
              !isExpanded && isLongText && "line-clamp-2"
            )}>
              {annotation.text}
            </p>
            {isLongText && (
              <Button
                variant="noShadow"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(!isExpanded)
                }}
                className="mt-1 h-6 text-xs"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Show more
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {/* Note display or editing */}
      {(annotation.note || isEditing) && (
        <CardContent className="pb-2">
          {isEditing ? (
            <div className="space-y-2">
              {/* Color picker */}
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      "w-8 h-8 rounded-base border-2 transition-all",
                      editColor === color
                        ? "border-border shadow-base scale-110"
                        : "border-transparent hover:border-border/50",
                      bgColorClasses[color]
                    )}
                    onClick={() => setEditColor(color)}
                    title={color}
                  />
                ))}
              </div>

              {/* Note editor */}
              <Textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="min-h-[60px] text-sm"
                placeholder="Add a note..."
                disabled={isSaving}
              />

              {/* Save/Cancel buttons */}
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  <span className="ml-1">Save</span>
                </Button>
                <Button
                  variant="neutral"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="h-3 w-3" />
                  <span className="ml-1">Cancel</span>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {annotation.note}
            </p>
          )}
        </CardContent>
      )}

      <CardFooter className="pt-2 relative">
        <div className="flex items-center gap-2 text-xs text-muted-foreground w-full">
          <span>
            {formatDistanceToNow(new Date(annotation.created_at), {
              addSuffix: true,
            })}
          </span>
          {annotation.tags.map((tag) => (
            <Badge key={tag} variant="neutral" className="h-4 text-xs">
              #{tag}
            </Badge>
          ))}
        </div>
        {!isEditing && (
          <div className="flex gap-1 absolute bottom-0 right-3">
            <Button
              variant=""
              size="icon"
              className="mr-1"
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              title="Edit annotation (e)"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant=""
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
              disabled={isDeleting}
              title="Delete annotation (⌘D)"
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}
      </CardFooter>

      {/* Keyboard shortcuts hint (only when active) */}
      {isActive && !isEditing && (
        <div className="px-4 pt-2 border-t text-xs text-muted-foreground">
          <kbd className="px-1 bg-muted rounded">e</kbd> edit ·{' '}
          <kbd className="px-1 bg-muted rounded">⌘D</kbd> delete ·{' '}
          double-click to edit
        </div>
      )}

      {isActive && isEditing && (
        <div className="px-4 pt-2 border-t text-xs text-muted-foreground">
          <kbd className="px-1 bg-muted rounded">⌘Enter</kbd> save ·{' '}
          <kbd className="px-1 bg-muted rounded">Esc</kbd> cancel
        </div>
      )}
    </Card>
  )
}
