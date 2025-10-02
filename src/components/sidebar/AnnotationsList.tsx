'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AnnotationsListProps {
  documentId: string
}

/**
 * Displays all annotations for the current document.
 * Shows annotation text, note, color, and creation timestamp.
 * 
 * @param props - Component props.
 * @param props.documentId - Document identifier for annotation filtering.
 * @returns React element with annotations list.
 */
export function AnnotationsList({ documentId }: AnnotationsListProps) {
  // TODO: Implement real annotations query using getAnnotations Server Action
  // For Phase 1, showing stub message
  
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
      
      {/* Example annotation structure for reference:
      <Card className="p-3 hover:bg-accent cursor-pointer transition-colors">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <p className="text-sm leading-tight">
                Selected text excerpt...
              </p>
            </div>
            <Badge className="bg-yellow-200 text-yellow-900 shrink-0">
              Yellow
            </Badge>
          </div>
          
          {note && (
            <p className="text-xs text-muted-foreground">
              Note: {note}
            </p>
          )}
          
          <div className="text-xs text-muted-foreground">
            Created 2 hours ago
          </div>
        </div>
      </Card>
      */}
    </div>
  )
}