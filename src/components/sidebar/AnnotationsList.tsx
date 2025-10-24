'use client'

import { useMemo, useState } from 'react'
import { AnnotationCard } from '@/components/rhizome/annotation-card'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useReaderStore } from '@/stores/reader-store'
import { Loader2 } from 'lucide-react'

// Constant empty array to prevent infinite loops from new references
const EMPTY_ANNOTATIONS: any[] = []

interface AnnotationsListProps {
  documentId: string
  onAnnotationClick?: (annotationId: string, startOffset: number) => void
}

/**
 * Displays all annotations for the current document, sorted by document order.
 * Uses feature-rich AnnotationCard components with self-contained editing logic.
 *
 * FEATURES:
 * 1. Auto-updates when annotations created/updated/deleted (via Zustand store)
 * 2. Sorts by document order (startOffset)
 * 3. Highlights annotations in viewport
 * 4. Scroll-to-annotation via parent callback
 * 5. All editing handled by AnnotationCard (no prop drilling)
 */
export function AnnotationsList({
  documentId,
  onAnnotationClick
}: AnnotationsListProps) {
  // Get annotations from Zustand store - document-keyed
  const annotations = useAnnotationStore(
    state => state.annotations[documentId ?? ''] ?? EMPTY_ANNOTATIONS
  )
  const removeAnnotation = useAnnotationStore(state => state.removeAnnotation)

  // Track which annotation is selected (for keyboard shortcuts)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)

  // Get viewport offsets from ReaderStore for visibility detection
  const viewportOffsets = useReaderStore(state => state.viewportOffsets)

  // Sort annotations by document order (startOffset)
  const sortedAnnotations = useMemo(() => {
    return [...annotations].sort((a, b) => {
      const aOffset = a.components.Position?.startOffset || 0
      const bOffset = b.components.Position?.startOffset || 0
      return aOffset - bOffset
    })
  }, [annotations])

  // Find which annotations are in current viewport
  const visibleAnnotationIds = useMemo(() => {
    if (!viewportOffsets || (viewportOffsets.start === 0 && viewportOffsets.end === 0)) {
      return new Set<string>()
    }

    const visible = new Set<string>()

    sortedAnnotations.forEach(annotation => {
      const startOffset = annotation.components.Position?.startOffset ?? 0
      const endOffset = annotation.components.Position?.endOffset ?? 0

      // Check if annotation overlaps with viewport
      const isVisible =
        startOffset <= viewportOffsets.end &&
        endOffset >= viewportOffsets.start

      if (isVisible) {
        visible.add(annotation.id)
      }
    })

    return visible
  }, [sortedAnnotations, viewportOffsets])

  // Handle annotation click - scroll to annotation and select it
  const handleAnnotationClick = (annotation: typeof sortedAnnotations[0]) => {
    setSelectedAnnotationId(annotation.id) // Select this annotation for keyboard shortcuts
    const startOffset = annotation.components.Position?.startOffset ?? 0
    onAnnotationClick?.(annotation.id, startOffset)
  }

  // Handle annotation deleted - remove from store
  const handleAnnotationDeleted = (annotationId: string) => {
    removeAnnotation(documentId, annotationId)
  }

  // Loading state
  if (annotations.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">No annotations yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Highlight text in the document to create annotations
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      {sortedAnnotations.map(annotation => {
        // Map annotation data to AnnotationCard format
        const cardData = {
          entity_id: annotation.id,
          text: annotation.components.Position?.originalText || '',
          note: annotation.components.Content?.note,
          color: annotation.components.Visual?.color || 'yellow',
          tags: annotation.components.Content?.tags || [],
          created_at: annotation.components.Temporal?.createdAt || new Date().toISOString(),
          chunk_ids: annotation.components.ChunkRef?.chunkIds || [],
        }

        // Only the selected annotation should be "active" for keyboard shortcuts
        const isActive = selectedAnnotationId === annotation.id

        return (
          <AnnotationCard
            key={annotation.id}
            annotation={cardData}
            documentId={documentId}
            isActive={isActive}
            onJump={() => handleAnnotationClick(annotation)}
            onDeleted={() => {
              handleAnnotationDeleted(annotation.id)
              // Clear selection if deleted annotation was selected
              if (selectedAnnotationId === annotation.id) {
                setSelectedAnnotationId(null)
              }
            }}
          />
        )
      })}
    </div>
  )
}
