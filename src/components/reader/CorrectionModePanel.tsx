'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CorrectionModePanelProps {
  chunkId: string
  chunkIndex: number
  onCancel: () => void
}

/**
 * CorrectionModePanel displays a floating banner with instructions when in correction mode.
 *
 * Shows:
 * - Chunk information (index, ID)
 * - Instructions for text selection
 * - Cancel button to exit correction mode
 *
 * Positioned at the top of the reader viewport (fixed positioning).
 *
 * @param props - Component props
 * @param props.chunkId - Chunk identifier being corrected
 * @param props.chunkIndex - Chunk index for display
 * @param props.onCancel - Callback to exit correction mode
 */
export function CorrectionModePanel({
  chunkId,
  chunkIndex,
  onCancel
}: CorrectionModePanelProps) {
  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-2xl px-4">
      <Card className={cn(
        'border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/20',
        'shadow-lg animate-in fade-in slide-in-from-top-4 duration-300'
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                  Correction Mode Active
                </h3>
              </div>

              {/* Chunk info */}
              <div className="text-xs text-orange-700 dark:text-orange-300">
                <p>Correcting <span className="font-semibold">Chunk {chunkIndex}</span></p>
                <p className="text-orange-600 dark:text-orange-400 mt-0.5">ID: {chunkId}</p>
              </div>

              {/* Instructions */}
              <div className="text-sm text-orange-900 dark:text-orange-100 space-y-1 pt-2 border-t border-orange-200 dark:border-orange-800">
                <p className="font-medium">📍 Select the correct text span for this chunk:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-xs text-orange-700 dark:text-orange-300">
                  <li>Scroll to find the correct location in the document</li>
                  <li>Click and drag to select the text that should be this chunk</li>
                  <li>Review the selection in the confirmation dialog</li>
                  <li>Click "Apply Correction" to save the new position</li>
                </ol>
              </div>
            </div>

            {/* Cancel button */}
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              className="text-orange-700 hover:text-orange-900 hover:bg-orange-100 dark:text-orange-300 dark:hover:text-orange-100 dark:hover:bg-orange-900"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cancel correction mode</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
