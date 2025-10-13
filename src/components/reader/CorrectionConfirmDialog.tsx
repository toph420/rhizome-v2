'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertCircle, ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateChunkOffsets } from '@/app/actions/chunks'
import { cn } from '@/lib/utils'

interface CorrectionConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chunkId: string
  chunkIndex: number
  documentId: string
  oldStartOffset: number
  oldEndOffset: number
  newStartOffset: number
  newEndOffset: number
  selectedText: string
  onSuccess: () => void
  onCancel: () => void
}

/**
 * CorrectionConfirmDialog shows a before/after preview and handles offset correction submission.
 *
 * **Features**:
 * - Displays selected text preview
 * - Shows before/after offset comparison
 * - Calls updateChunkOffsets server action
 * - Handles overlap errors with detailed messages
 * - Success/error toast notifications
 *
 * **Error Handling**:
 * - Validation errors (invalid offsets)
 * - Overlap errors (with adjacent chunk details)
 * - Permission errors
 * - Unknown errors
 *
 * @param props - Component props
 * @param props.open - Dialog open state
 * @param props.onOpenChange - Dialog state change handler
 * @param props.chunkId - Chunk identifier being corrected
 * @param props.chunkIndex - Chunk index for display
 * @param props.documentId - Document identifier for revalidation
 * @param props.oldStartOffset - Original start offset
 * @param props.oldEndOffset - Original end offset
 * @param props.newStartOffset - New start offset from selection
 * @param props.newEndOffset - New end offset from selection
 * @param props.selectedText - User-selected text
 * @param props.onSuccess - Callback for successful correction
 * @param props.onCancel - Callback for cancellation
 */
export function CorrectionConfirmDialog({
  open,
  onOpenChange,
  chunkId,
  chunkIndex,
  documentId,
  oldStartOffset,
  oldEndOffset,
  newStartOffset,
  newEndOffset,
  selectedText,
  onSuccess,
  onCancel,
}: CorrectionConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  /**
   * Handles correction submission with comprehensive error handling.
   */
  const handleSubmit = async () => {
    setIsSubmitting(true)

    try {
      const result = await updateChunkOffsets({
        chunkId,
        documentId,
        startOffset: newStartOffset,
        endOffset: newEndOffset,
        reason: 'User-corrected position via text selection'
      })

      if (result.success) {
        toast.success('Chunk position corrected', {
          description: `Chunk ${chunkIndex} offsets updated successfully`
        })
        onSuccess()
        onOpenChange(false)
      } else {
        // Handle specific error types
        if (result.errorType === 'overlap' && result.adjacentChunks) {
          // Overlap error with adjacent chunk details
          const adjacentInfo = result.adjacentChunks
            .map(chunk => `Chunk ${chunk.chunk_index} (${chunk.start_offset}-${chunk.end_offset})`)
            .join(', ')

          toast.error('Overlap detected', {
            description: `The selected range overlaps with: ${adjacentInfo}. Please select a different range.`,
            duration: 5000
          })
        } else if (result.errorType === 'validation') {
          toast.error('Invalid selection', {
            description: result.error || 'The selected offsets are invalid. Please try again.'
          })
        } else if (result.errorType === 'permission') {
          toast.error('Permission denied', {
            description: 'You do not have permission to correct this chunk.'
          })
        } else {
          toast.error('Correction failed', {
            description: result.error || 'An unexpected error occurred. Please try again.'
          })
        }
      }
    } catch (error) {
      console.error('[CorrectionConfirmDialog] Error submitting correction:', error)
      toast.error('Correction failed', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Handles dialog cancellation.
   */
  const handleCancel = () => {
    onOpenChange(false)
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm Chunk Position Correction</DialogTitle>
          <DialogDescription>
            Review the selected text and offset changes before applying the correction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selected text preview */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              Selected Text
            </h4>
            <div className="text-sm p-3 bg-muted rounded-md border max-h-40 overflow-y-auto">
              {selectedText}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedText.length} characters selected
            </p>
          </div>

          {/* Before/After offset comparison */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Offset Changes</h4>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
              {/* Before */}
              <div className="space-y-1 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md">
                <p className="text-xs font-semibold text-red-900 dark:text-red-100">Before</p>
                <div className="text-sm space-y-0.5">
                  <p className="font-mono">Start: {oldStartOffset}</p>
                  <p className="font-mono">End: {oldEndOffset}</p>
                  <p className="text-xs text-muted-foreground">Length: {oldEndOffset - oldStartOffset}</p>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-5 w-5 text-muted-foreground" />

              {/* After */}
              <div className="space-y-1 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-md">
                <p className="text-xs font-semibold text-green-900 dark:text-green-100">After</p>
                <div className="text-sm space-y-0.5">
                  <p className="font-mono">Start: {newStartOffset}</p>
                  <p className="font-mono">End: {newEndOffset}</p>
                  <p className="text-xs text-muted-foreground">Length: {newEndOffset - newStartOffset}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Chunk info */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                Correcting Chunk {chunkIndex}
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                ID: {chunkId}
              </p>
              <p className="text-blue-600 dark:text-blue-400 mt-1">
                This correction will be saved to the database and tracked in the correction history.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              'bg-green-600 hover:bg-green-700',
              'text-white',
              'disabled:opacity-50'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply Correction
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
