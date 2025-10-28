'use client'

import { useMemo } from 'react'
import type { AnnotationEntity } from '@/types/annotations'

interface PDFAnnotationOverlayProps {
  annotations: AnnotationEntity[]
  pageNumber: number
  scale: number
  onAnnotationClick?: (annotationId: string) => void
}

export function PDFAnnotationOverlay({
  annotations,
  pageNumber,
  scale,
  onAnnotationClick,
}: PDFAnnotationOverlayProps) {
  // Filter annotations for this page
  const pageAnnotations = useMemo(() => {
    return annotations.filter(ann => {
      const position = ann.components.Position
      return position?.pdfPageNumber === pageNumber
    })
  }, [annotations, pageNumber])

  if (pageAnnotations.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageAnnotations.map(annotation => {
        const position = annotation.components.Position
        const visual = annotation.components.Visual

        // Check for multi-rect annotation (new format)
        if (position?.pdfRects && position.pdfRects.length > 0) {
          // Render multiple rectangles for multi-line selections
          return position.pdfRects.map((rect, index) => {
            const x = rect.x * scale
            const y = rect.y * scale
            const width = rect.width * scale
            const height = rect.height * scale

            return (
              <div
                key={`${annotation.id}-${index}`}
                data-annotation-id={annotation.id}
                className="absolute pointer-events-auto cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  backgroundColor: getColorValue(visual?.color || 'yellow', 0.3),
                  border: `2px solid ${getColorValue(visual?.color || 'yellow', 0.6)}`,
                }}
                onClick={() => onAnnotationClick?.(annotation.id)}
                title={annotation.components.Content?.note || 'Click to edit'}
              />
            )
          })
        }

        // Fallback to single rect (legacy format)
        if (!position?.pdfX || !position?.pdfY) {
          return null // Skip annotations without PDF coordinates
        }

        // Apply scale to coordinates
        const x = position.pdfX * scale
        const y = position.pdfY * scale
        const width = (position.pdfWidth ?? 0) * scale
        const height = (position.pdfHeight ?? 0) * scale

        return (
          <div
            key={annotation.id}
            data-annotation-id={annotation.id}
            className="absolute pointer-events-auto cursor-pointer transition-opacity hover:opacity-80"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: getColorValue(visual?.color || 'yellow', 0.3),
              border: `2px solid ${getColorValue(visual?.color || 'yellow', 0.6)}`,
            }}
            onClick={() => onAnnotationClick?.(annotation.id)}
            title={annotation.components.Content?.note || 'Click to edit'}
          />
        )
      })}
    </div>
  )
}

function getColorValue(color: string, opacity: number): string {
  const colors: Record<string, string> = {
    yellow: `rgba(254, 240, 138, ${opacity})`,
    green: `rgba(187, 247, 208, ${opacity})`,
    blue: `rgba(191, 219, 254, ${opacity})`,
    red: `rgba(254, 202, 202, ${opacity})`,
    purple: `rgba(233, 213, 255, ${opacity})`,
    orange: `rgba(254, 215, 170, ${opacity})`,
    pink: `rgba(251, 207, 232, ${opacity})`,
  }
  return colors[color] || colors.yellow
}
