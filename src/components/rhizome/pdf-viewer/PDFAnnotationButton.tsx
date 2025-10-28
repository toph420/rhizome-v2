'use client'

import { useState } from 'react'
import { Highlighter, Loader2 } from 'lucide-react'
import { Button } from '@/components/rhizome/button'

interface PDFAnnotationButtonProps {
  rect: DOMRect
  onCreateAnnotation: () => Promise<void>
}

export function PDFAnnotationButton({ rect, onCreateAnnotation }: PDFAnnotationButtonProps) {
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      await onCreateAnnotation()
    } finally {
      setCreating(false)
    }
  }

  // Position button near the selection (above it)
  const buttonStyle = {
    position: 'fixed' as const,
    left: `${rect.left}px`,
    top: `${rect.top - 50}px`, // 50px above selection
    zIndex: 50,
  }

  return (
    <div style={buttonStyle}>
      <Button
        onClick={handleCreate}
        disabled={creating}
        size="sm"
        className="shadow-lg bg-yellow-500 hover:bg-yellow-600 text-black"
      >
        {creating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Highlighter className="h-4 w-4 mr-2" />
            Highlight
          </>
        )}
      </Button>
    </div>
  )
}
