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
import { Link as LinkIcon, Zap, Pencil, Save, X, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { updateSpark, deleteSpark } from '@/app/actions/sparks'
import { useSparkStore } from '@/stores/spark-store'
import { toast } from 'sonner'

interface SparkCardProps {
  spark: {
    entity_id: string
    content: string
    tags: string[]
    created_at: string
    selections?: Array<{
      text: string
      chunkId: string
    }>
    connections?: string[]
    annotation_refs?: string[]
  }
  documentId: string
  isActive?: boolean
  onJump?: () => void
  onDeleted?: () => void
}

/**
 * Feature-rich SparkCard with:
 * - Inline editing (double-click or 'e' key)
 * - Server action integration for update/delete
 * - Optimistic updates with error rollback
 * - Expand/collapse for long content
 * - Keyboard shortcuts (e/enter/escape/d)
 * - Self-contained state management
 * - No prop drilling
 */
export function SparkCard({ spark, documentId, isActive = false, onJump, onDeleted }: SparkCardProps) {
  const updateSparkStore = useSparkStore(state => state.updateSpark)
  const removeSparkStore = useSparkStore(state => state.removeSpark)

  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(spark.content)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const selectionCount = spark.selections?.length || 0
  const connectionCount = spark.connections?.length || 0
  const annotationCount = spark.annotation_refs?.length || 0
  const isLongContent = spark.content.length > 150

  // Reset edit content when spark changes
  useEffect(() => {
    setEditContent(spark.content)
  }, [spark.content])

  // Save changes with optimistic update
  const handleSave = useCallback(async () => {
    if (editContent.trim() === spark.content.trim()) {
      setIsEditing(false)
      return
    }

    setIsSaving(true)
    const originalContent = spark.content

    // Optimistic update to Zustand store
    updateSparkStore(documentId, spark.entity_id, { content: editContent.trim() })

    try {
      const result = await updateSpark({
        sparkId: spark.entity_id,
        content: editContent.trim(),
      })

      if (!result.success) {
        throw new Error('Failed to save')
      }

      setIsEditing(false)
      toast.success('Spark updated')
    } catch (error) {
      console.error('[SparkCard] Failed to save:', error)
      // Revert Zustand store on error
      updateSparkStore(documentId, spark.entity_id, { content: originalContent })
      setEditContent(originalContent)
      toast.error('Failed to save spark')
    } finally {
      setIsSaving(false)
    }
  }, [editContent, spark.content, spark.entity_id, documentId, updateSparkStore])

  // Cancel editing
  const handleCancel = useCallback(() => {
    setEditContent(spark.content) // Reset to original
    setIsEditing(false)
  }, [spark.content])

  // Delete spark
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this spark? This cannot be undone.')) {
      return
    }

    setIsDeleting(true)

    // Optimistic removal from Zustand store
    removeSparkStore(documentId, spark.entity_id)

    try {
      const result = await deleteSpark(spark.entity_id)

      if (!result.success) {
        throw new Error('Failed to delete')
      }

      toast.success('Spark deleted')
      onDeleted?.()
    } catch (error) {
      console.error('[SparkCard] Failed to delete:', error)
      toast.error('Failed to delete spark')
      // Note: Can't easily revert delete, so onDeleted callback will refetch
      onDeleted?.()
      setIsDeleting(false)
    }
  }, [spark.entity_id, documentId, removeSparkStore, onDeleted])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger in input fields (except when editing this spark)
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

  return (
    <Card
      className={cn(
        "transition-all cursor-pointer",
        isActive && "",
        (isSaving || isDeleting) && "opacity-50"
      )}
      onClick={!isEditing ? onJump : undefined}
      onDoubleClick={() => !isEditing && setIsEditing(true)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Zap className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />

          {isEditing ? (
            <div className="flex-1 space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[80px] text-sm"
                autoFocus
                disabled={isSaving}
              />
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
            <div className="flex-1">
              <p className={cn(
                "text-sm",
                !isExpanded && isLongContent && "line-clamp-3"
              )}>
                {spark.content}
              </p>
              {isLongContent && (
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
          )}

          {!isEditing && (
            <div className="flex gap-1">
              <Button
                variant="default"
                size="icon"
                className="mr-1"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsEditing(true)
                }}
                title="Edit spark (e)"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="default"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete()
                }}
                disabled={isDeleting}
                title="Delete spark (⌘D)"
              >
                {isDeleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      {selectionCount > 0 && (
        <CardContent className="pb-2">
          <div className="flex flex-wrap gap-1">
            {spark.selections?.map((selection, idx) => (
              <Badge
                key={idx}
                variant="neutral"
                className="text-xs max-w-[150px] truncate"
              >
                <LinkIcon className="h-3 w-3 mr-1" />
                {selection.text.substring(0, 20)}...
              </Badge>
            ))}
          </div>
        </CardContent>
      )}

      <CardFooter className="pt-2">
        <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
          <span>
            {formatDistanceToNow(new Date(spark.created_at), {
              addSuffix: true,
            })}
          </span>
          <div className="flex items-center gap-2">
            {spark.tags.map((tag) => (
              <Badge key={tag} variant="neutral" className="h-4 text-xs">
                #{tag}
              </Badge>
            ))}
            {annotationCount > 0 && (
              <Badge variant="default" className="h-4 text-xs">
                {annotationCount} annotation{annotationCount > 1 ? 's' : ''}
              </Badge>
            )}
            {connectionCount > 0 && (
              <Badge variant="default" className="h-4 text-xs">
                {connectionCount} link{connectionCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
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
