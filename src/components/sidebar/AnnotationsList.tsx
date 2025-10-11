'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useReaderStore } from '@/stores/reader-store'
import { updateAnnotation } from '@/app/actions/annotations'
import { formatDistanceToNow } from 'date-fns'
import { Loader2, Pencil, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Constant empty array to prevent infinite loops from new references
const EMPTY_ANNOTATIONS: any[] = []

interface AnnotationsListProps {
  documentId: string
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
}

/**
 * Displays all annotations for the current document, sorted by document order.
 * Uses Zustand store for state management - no prop drilling!
 *
 * FEATURES:
 * 1. Auto-updates when new annotations are created (via Zustand store)
 * 2. Sorts by document order (startOffset)
 * 3. Highlights annotations in viewport
 * 4. Calls parent callback for scroll-into-view (handles virtual scroll)
 * 5. Inline edit form expansion
 * 6. Matches ConnectionCard styling with animations
 */
export function AnnotationsList({
  documentId,
  onAnnotationClick
}: AnnotationsListProps) {
  // Get annotations from Zustand store - document-keyed
  // Use constant empty array reference to prevent infinite loop
  const annotations = useAnnotationStore(
    state => state.annotations[documentId ?? ''] ?? EMPTY_ANNOTATIONS
  )
  const updateStoreAnnotation = useAnnotationStore(state => state.updateAnnotation)

  // Get viewport offsets from ReaderStore for precise visibility detection
  const viewportOffsets = useReaderStore(state => state.viewportOffsets)

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const annotationRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [editColor, setEditColor] = useState<string>('yellow')
  const [saving, setSaving] = useState(false)

  // Sort annotations by document order (startOffset)
  const sortedAnnotations = useMemo(() => {
    return [...annotations].sort((a, b) => {
      const aOffset = a.components.position?.startOffset || a.components.annotation?.range.startOffset || 0
      const bOffset = b.components.position?.startOffset || b.components.annotation?.range.startOffset || 0
      return aOffset - bOffset
    })
  }, [annotations])

  // Find which annotations are in current viewport using precise offset-based detection
  const visibleAnnotationIds = useMemo(() => {
    if (!viewportOffsets || (viewportOffsets.start === 0 && viewportOffsets.end === 0)) {
      return new Set<string>()
    }

    const visible = new Set<string>()

    sortedAnnotations.forEach(annotation => {
      // Get annotation's precise offsets (prefer recovered position, fallback to original range)
      const startOffset = annotation.components.position?.startOffset
        ?? annotation.components.annotation?.range.startOffset
        ?? 0
      const endOffset = annotation.components.position?.endOffset
        ?? annotation.components.annotation?.range.endOffset
        ?? 0

      // Check if annotation overlaps with viewport (same logic as ReaderStore for chunks)
      const isVisible =
        startOffset <= viewportOffsets.end &&
        endOffset >= viewportOffsets.start

      if (isVisible) {
        visible.add(annotation.id)
      }
    })

    console.log('[AnnotationsList] Offset-based visibility:', {
      viewport: `${viewportOffsets.start}-${viewportOffsets.end}`,
      totalAnnotations: sortedAnnotations.length,
      visibleAnnotations: visible.size,
      sampleAnnotations: sortedAnnotations.slice(0, 3).map(a => {
        const start = a.components.position?.startOffset ?? a.components.annotation?.range.startOffset ?? 0
        const end = a.components.position?.endOffset ?? a.components.annotation?.range.endOffset ?? 0
        const isVis = start <= viewportOffsets.end && end >= viewportOffsets.start
        return {
          id: a.id.slice(0, 8),
          offsets: `${start}-${end}`,
          visible: isVis
        }
      })
    })

    return visible
  }, [sortedAnnotations, viewportOffsets])

  // Scroll annotation card into view when annotation becomes visible in document
  useEffect(() => {
    const firstVisibleId = sortedAnnotations.find(a => visibleAnnotationIds.has(a.id))?.id

    if (firstVisibleId) {
      const element = annotationRefs.current.get(firstVisibleId)
      if (element && scrollAreaRef.current) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [visibleAnnotationIds, sortedAnnotations])

  // Handle annotation card click - call parent callback for scroll coordination
  function handleAnnotationCardClick(annotation: typeof sortedAnnotations[0]) {
    const startOffset = annotation.components.position?.startOffset
      || annotation.components.annotation?.range.startOffset

    if (startOffset === undefined) return

    // Call parent callback to handle scroll (works with virtual scroll)
    if (onAnnotationClick) {
      onAnnotationClick(annotation.id, startOffset)
    }
  }

  // Enter edit mode for annotation
  function handleEditClick(annotation: typeof sortedAnnotations[0], e: React.MouseEvent) {
    e.stopPropagation()
    setEditingId(annotation.id)
    setEditNote(annotation.components.annotation?.note || '')
    setEditColor(annotation.components.annotation?.color || 'yellow')
  }

  // Save annotation edits
  async function handleSave(annotationId: string) {
    setSaving(true)
    try {
      const result = await updateAnnotation(annotationId, {
        note: editNote,
        color: editColor,
      })

      if (result.success) {
        // Update Zustand store
        const existingAnnotation = annotations.find(a => a.id === annotationId)
        if (existingAnnotation) {
          const updated = {
            ...existingAnnotation,
            components: {
              ...existingAnnotation.components,
              annotation: {
                ...existingAnnotation.components.annotation!,
                note: editNote,
                color: editColor as any,
              }
            }
          }
          updateStoreAnnotation(documentId, annotationId, updated)
        }

        setEditingId(null)
        toast.success('Annotation updated')
      } else {
        toast.error('Failed to update annotation')
      }
    } catch (err) {
      toast.error('Failed to update annotation')
    } finally {
      setSaving(false)
    }
  }

  // Cancel edit mode
  function handleCancel() {
    setEditingId(null)
    setEditNote('')
    setEditColor('yellow')
  }

  // Get color for left border
  function getColorClass(color: string): string {
    const colorMap: Record<string, string> = {
      yellow: 'border-l-yellow-400',
      green: 'border-l-green-400',
      blue: 'border-l-blue-400',
      red: 'border-l-red-400',
      purple: 'border-l-purple-400',
      orange: 'border-l-orange-400',
      pink: 'border-l-pink-400'
    }
    return colorMap[color] || colorMap.yellow
  }

  // Empty state
  if (sortedAnnotations.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-sm text-muted-foreground mb-4">
          Annotations for this document
        </div>

        <Card className="p-4 border-dashed">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No annotations yet
            </p>
            <p className="text-xs text-muted-foreground">
              Select text in the document to create your first annotation
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // Annotations list
  return (
    <div ref={scrollAreaRef} className="p-4 space-y-3">
      <div className="text-sm text-muted-foreground mb-4">
        {sortedAnnotations.length} {sortedAnnotations.length === 1 ? 'annotation' : 'annotations'}
      </div>

      {sortedAnnotations.map((annotation) => {
        const annotationData = annotation.components.annotation
        const positionData = annotation.components.position
        const isVisible = visibleAnnotationIds.has(annotation.id)
        const isEditing = editingId === annotation.id

        if (!annotationData) return null

        const colorBorderClass = getColorClass(annotationData.color)

        return (
          <Card
            key={annotation.id}
            ref={(el) => {
              if (el) {
                annotationRefs.current.set(annotation.id, el)
              } else {
                annotationRefs.current.delete(annotation.id)
              }
            }}
            className={cn(
              "cursor-pointer hover:bg-muted/50 transition-all border-2 border-l-4",
              colorBorderClass,
              isVisible ? "bg-primary/5 border-primary/30" : "border-border",
              "group"
            )}
            onClick={() => !isEditing && handleAnnotationCardClick(annotation)}
          >
            <div className="p-3 space-y-2">
              {/* Header: Tags and edit button */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                  {isEditing ? (
                    /* Color selector - constrained width */
                    <div className="flex flex-wrap gap-1 max-w-full">
                      {(['yellow', 'green', 'blue', 'red', 'purple', 'orange', 'pink'] as const).map(c => (
                        <button
                          key={c}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditColor(c)
                          }}
                          className={cn(
                            "w-6 h-6 rounded border-2 transition-all flex-shrink-0",
                            `border-${c}-400`,
                            editColor === c ? 'ring-2 ring-primary ring-offset-1 scale-110' : 'hover:scale-105'
                          )}
                          style={{
                            backgroundColor: c === 'yellow' ? '#fef08a' :
                                           c === 'green' ? '#86efac' :
                                           c === 'blue' ? '#93c5fd' :
                                           c === 'red' ? '#fca5a5' :
                                           c === 'purple' ? '#d8b4fe' :
                                           c === 'orange' ? '#fdba74' :
                                           '#f9a8d4'
                          }}
                          title={c.charAt(0).toUpperCase() + c.slice(1)}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      {annotationData.tags?.filter(tag => tag !== 'readwise-import').map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs flex-shrink-0">
                          {tag}
                        </Badge>
                      ))}
                      {annotationData.tags?.includes('readwise-import') && (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          Readwise
                        </Badge>
                      )}
                      {isVisible && (
                        <Badge variant="default" className="text-xs ml-1 flex-shrink-0">
                          In view
                        </Badge>
                      )}
                    </>
                  )}
                </div>

                {/* Edit/Save buttons */}
                {!isEditing ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all flex-shrink-0"
                    onClick={(e) => handleEditClick(annotation, e)}
                    title="Edit annotation"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                ) : (
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-green-100 hover:text-green-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSave(annotation.id)
                      }}
                      disabled={saving}
                      title="Save changes"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 hover:bg-red-100 hover:text-red-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCancel()
                      }}
                      disabled={saving}
                      title="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Annotation text */}
              <div>
                <p className="text-sm leading-tight line-clamp-3">
                  {annotationData.text}
                </p>
              </div>

              {/* Note - editable in edit mode */}
              {isEditing ? (
                <div className="max-w-full">
                  <Textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add a note..."
                    className="min-h-[60px] text-xs w-full"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : annotationData.note ? (
                <div className="bg-muted/50 p-2 rounded-sm">
                  <p className="text-xs text-muted-foreground break-words">
                    <span className="font-medium">Note: </span>
                    {annotationData.note}
                  </p>
                </div>
              ) : null}

              {/* Metadata footer */}
              <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-1">
                <span className="flex-shrink-0">
                  {formatDistanceToNow(new Date(annotation.created_at), { addSuffix: true })}
                </span>
                {positionData?.method && positionData.method !== 'exact' && !isEditing && (
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {positionData.method} ({(positionData.confidence * 100).toFixed(0)}%)
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
