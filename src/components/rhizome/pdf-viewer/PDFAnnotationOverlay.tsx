'use client'

import { useMemo } from 'react'
import type { AnnotationEntity } from '@/types/annotations'

interface PDFAnnotationOverlayProps {
  annotations: AnnotationEntity[]
  pageNumber: number
  scale: number
  onAnnotationClick?: (annotationId: string) => void
}

interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Merge adjacent rectangles on the same line to create continuous highlights.
 * PDF.js returns one rect per word, causing gaps. This merges them.
 */
function mergeRectangles(rects: PdfRect[]): PdfRect[] {
  if (rects.length === 0) return []
  if (rects.length === 1) return rects

  // Sort by Y position (top to bottom), then X position (left to right)
  const sorted = [...rects].sort((a, b) => {
    const yDiff = a.y - b.y
    if (Math.abs(yDiff) > 2) return yDiff // Different lines (2px tolerance)
    return a.x - b.x // Same line, sort left to right
  })

  const merged: PdfRect[] = []
  let current = { ...sorted[0] }

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]

    // Check if rectangles are on the same line (similar Y and height)
    const sameLine = Math.abs(current.y - next.y) < 2 &&
                     Math.abs(current.height - next.height) < 2

    // Check if rectangles are horizontally adjacent (gap < 5px)
    const currentRight = current.x + current.width
    const gap = next.x - currentRight
    const adjacent = gap < 5 && gap > -5

    if (sameLine && adjacent) {
      // Merge: extend current rectangle to include next
      current.width = (next.x + next.width) - current.x
    } else {
      // Start new merged rectangle
      merged.push(current)
      current = { ...next }
    }
  }

  // Don't forget the last rectangle
  merged.push(current)

  return merged
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
          // Merge adjacent rectangles to create continuous highlights
          const mergedRects = mergeRectangles(position.pdfRects)

          // Render merged rectangles (reduces 38 rects to ~3-5 clean highlights)
          return mergedRects.map((rect, index) => {
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
