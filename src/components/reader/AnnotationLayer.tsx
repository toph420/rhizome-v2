'use client'

import { useState } from 'react'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { StoredAnnotation } from '@/types/annotations'

interface AnnotationLayerProps {
  annotations: StoredAnnotation[]
  chunkId: string
}

/**
 * Renders annotation highlights as CSS overlays using position absolute.
 * Handles overlapping annotations with z-index stacking.
 * 
 * @param props - Component props.
 * @param props.annotations - Filtered annotations for this chunk.
 * @param props.chunkId - Chunk identifier for validation.
 * @returns React element with highlight overlays.
 */
export function AnnotationLayer({
  annotations,
  chunkId,
}: AnnotationLayerProps) {
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null)

  return (
    <>
      {annotations.map((annotation) => {
        const { color, text, note } = annotation.components.annotation || {}
        const { startOffset, endOffset, confidence, method } =
          annotation.components.position || {}
        const timestamp = new Date(annotation.created_at).getTime()

        // Skip if missing required data
        if (!color || !startOffset || !endOffset) return null

        const showConfidence = confidence && confidence < 0.7

        return (
          <HoverCard key={annotation.id}>
            <HoverCardTrigger asChild>
              <div
                data-annotation-id={annotation.id}
                className={`absolute pointer-events-auto cursor-pointer transition-opacity hover:opacity-100 ${getColorClass(color)}`}
                style={{
                  left: 0,
                  right: 0,
                  // Simplified positioning for MVP (character-based heuristic)
                  top: `${calculateTopPosition(startOffset)}px`,
                  height: `${calculateHeight(startOffset, endOffset)}px`,
                  zIndex: timestamp, // Stack by creation time (earlier = lower)
                  opacity: activeAnnotation === annotation.id ? 1 : 0.3,
                  mixBlendMode: 'multiply', // Better overlapping visual
                }}
                onClick={() => setActiveAnnotation(annotation.id)}
                role="button"
                tabIndex={0}
                aria-label={`Annotation: ${text?.substring(0, 50)}`}
              />
            </HoverCardTrigger>

            <HoverCardContent side="right" className="w-80">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium flex-1">
                    {text || 'No text available'}
                  </p>
                  {showConfidence && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {confidence && confidence >= 0.5
                        ? `~${Math.round(confidence * 100)}%`
                        : 'Approx'}
                    </Badge>
                  )}
                </div>

                {note && (
                  <p className="text-sm text-muted-foreground">{note}</p>
                )}

                {method && confidence && (
                  <p className="text-xs text-muted-foreground">
                    Position: {method} ({Math.round(confidence * 100)}%
                    confidence)
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" disabled>
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" disabled>
                    Delete
                  </Button>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </>
  )
}

/**
 * Maps annotation color to Tailwind class.
 * 
 * @param color - Annotation color name.
 * @returns Tailwind background color class.
 */
function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    yellow: 'bg-yellow-200',
    green: 'bg-green-200',
    blue: 'bg-blue-200',
    red: 'bg-red-200',
    purple: 'bg-purple-200',
  }
  return colorMap[color] || 'bg-yellow-200'
}

/**
 * Calculates top position based on character offset.
 * Simplified heuristic for MVP (replace with Range.getBoundingClientRect in production).
 * 
 * @param startOffset - Character start position.
 * @returns Top position in pixels.
 */
function calculateTopPosition(startOffset: number): number {
  // Rough approximation: 20px per line, 80 chars per line
  const lineNumber = Math.floor(startOffset / 80)
  return lineNumber * 20
}

/**
 * Calculates highlight height based on text length.
 * Simplified heuristic for MVP.
 * 
 * @param startOffset - Character start position.
 * @param endOffset - Character end position.
 * @returns Height in pixels.
 */
function calculateHeight(startOffset: number, endOffset: number): number {
  const chars = endOffset - startOffset
  const lines = Math.ceil(chars / 80)
  return lines * 20
}