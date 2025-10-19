'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { AnnotationEntity } from '@/types/annotations'

interface AnnotationsDebugPanelProps {
  annotations: AnnotationEntity[]
}

/**
 * Debug panel to display annotations for testing.
 * Shows annotation data, offsets, and colors.
 * @param props - Component props.
 * @param props.annotations - Array of annotations to display.
 * @returns React element with debug panel.
 */
export function AnnotationsDebugPanel({ annotations }: AnnotationsDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (annotations.length === 0) {
    return (
      <div className="fixed bottom-4 right-4 bg-background border rounded-lg p-4 shadow-lg max-w-xs">
        <div className="text-sm text-muted-foreground">
          No annotations yet
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg max-w-md">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
          <span className="font-semibold text-sm">
            Annotations ({annotations.length})
          </span>
        </div>
      </div>

      {isExpanded && (
        <ScrollArea className="h-64">
          <div className="p-3 space-y-2">
            {annotations.map((ann) => (
              <div
                key={ann.id}
                className="border rounded p-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className={`bg-${ann.components.Visual?.color}-200`}
                  >
                    {ann.components.Visual?.color}
                  </Badge>
                  <span className="text-muted-foreground font-mono">
                    {ann.components.Position?.startOffset}-
                    {ann.components.Position?.endOffset}
                  </span>
                </div>
                <div className="line-clamp-2 text-muted-foreground">
                  &ldquo;{ann.components.Position?.originalText}&rdquo;
                </div>
                {ann.components.Content?.note && (
                  <div className="text-muted-foreground italic">
                    Note: {ann.components.Content.note}
                  </div>
                )}
                {ann.components.Content?.tags && ann.components.Content.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {ann.components.Content.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
