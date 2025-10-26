'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/rhizome/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/rhizome/radio-group'
import { Alert, AlertDescription, AlertTitle } from '@/components/rhizome/alert'
import { Label } from '@/components/rhizome/label'
import { Badge } from '@/components/rhizome/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/rhizome/card'
import {
  AlertTriangleIcon,
  InfoIcon,
  CheckCircle2Icon,
} from 'lucide-react'
import type { ImportConflict } from '@/types/storage'
import type { ConflictStrategy } from '@/types/storage'
import { importFromStorage } from '@/app/actions/documents'

interface ConflictResolutionDialogProps {
  isOpen: boolean
  onClose: () => void
  onCancel?: () => void
  conflict: ImportConflict
  documentId: string
  onResolved: (jobId: string) => void
  regenerateEmbeddings?: boolean
  reprocessConnections?: boolean
}

/**
 * Dialog component for resolving import conflicts when importing documents from Storage.
 * Provides side-by-side comparison and strategy selection (skip, replace, merge_smart).
 */
export function ConflictResolutionDialog({
  isOpen,
  onClose,
  onCancel,
  conflict,
  documentId,
  onResolved,
  regenerateEmbeddings = false,
  reprocessConnections = false,
}: ConflictResolutionDialogProps) {
  const [selectedStrategy, setSelectedStrategy] =
    useState<ConflictStrategy>('merge_smart')
  const [isApplying, setIsApplying] = useState(false)

  const handleApply = async () => {
    setIsApplying(true)
    try {
      const result = await importFromStorage(documentId, {
        strategy: selectedStrategy,
        regenerateEmbeddings,
        reprocessConnections,
      })

      // Handle "skip" strategy (no-op, success but no jobId)
      if (result.success && selectedStrategy === 'skip') {
        console.log('[ConflictResolution] Skip strategy applied - no changes made')
        // Call onResolved with special 'skip' marker
        // DON'T call onClose() - let handleConflictResolved close the dialog
        onResolved('skip')
      } else if (result.success && result.jobId) {
        // Normal flow: job created, call onResolved to track it
        // DON'T call onClose() - let handleConflictResolved close the dialog
        onResolved(result.jobId)
      } else {
        // Error occurred
        console.error('Import failed:', result.error || 'Unknown error')
        // TODO: Show error toast
      }
    } catch (error) {
      console.error('Import error:', error)
      // TODO: Show error toast
    } finally {
      setIsApplying(false)
    }
  }

  const getStrategyWarning = () => {
    switch (selectedStrategy) {
      case 'skip':
        return {
          icon: <InfoIcon className="size-4" />,
          variant: 'default' as const,
          title: 'Skip Import',
          description: [
            'Import data will be ignored',
            'Existing data remains unchanged',
          ],
        }
      case 'replace':
        return {
          icon: <AlertTriangleIcon className="size-4" />,
          variant: 'destructive' as const,
          title: 'Replace All (Destructive)',
          description: [
            '⚠️ Will reset all annotation positions',
            'Annotations may need repositioning after import',
            `${conflict.existingChunkCount} chunks will be deleted`,
            `${conflict.importChunkCount} chunks will be inserted`,
          ],
        }
      case 'merge_smart':
        return {
          icon: <CheckCircle2Icon className="size-4" />,
          variant: 'default' as const,
          title: 'Merge Smart (Recommended)',
          description: [
            'ℹ️ Preserves chunk IDs and annotations',
            'Only metadata fields will be updated',
            'Safest option for maintaining existing work',
          ],
        }
    }
  }

  const warning = getStrategyWarning()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      // When dialog is closed by user action (X, Esc, backdrop), call onCancel
      if (!open) {
        onCancel ? onCancel() : onClose()
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Conflict Detected</DialogTitle>
          <DialogDescription>
            Document &quot;{conflict.documentId}&quot; already has data in the database.
            Choose how to resolve this conflict.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Data Comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Existing Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Existing in Database
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Chunks:</span>
                  <Badge variant="outline">{conflict.existingChunkCount}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Processed:
                  </span>
                  <span className="text-sm">
                    {new Date(conflict.existingProcessedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Import Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Import from Storage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Chunks:</span>
                  <Badge variant="outline">{conflict.importChunkCount}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Processed:
                  </span>
                  <span className="text-sm">
                    {new Date(conflict.importProcessedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sample Chunks Comparison */}
          {conflict.sampleChunks.existing.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3">
                Sample Chunks (first 3):
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {/* Existing Samples */}
                <div className="space-y-3">
                  {conflict.sampleChunks.existing.map((chunk, index) => (
                    <Card key={index} className="border-muted">
                      <CardContent className="pt-3 space-y-1">
                        <div className="text-xs font-mono text-muted-foreground">
                          Chunk {chunk.chunk_index}
                        </div>
                        <div className="text-sm line-clamp-2">
                          {chunk.content.substring(0, 100)}...
                        </div>
                        {chunk.themes && chunk.themes.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {chunk.themes.slice(0, 3).map((theme, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {theme}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {chunk.importance_score !== undefined && (
                          <div className="text-xs text-muted-foreground">
                            Importance: {chunk.importance_score.toFixed(2)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Import Samples */}
                <div className="space-y-3">
                  {conflict.sampleChunks.import.map((chunk, index) => (
                    <Card key={index} className="border-primary/50 bg-primary/5">
                      <CardContent className="pt-3 space-y-1">
                        <div className="text-xs font-mono text-muted-foreground">
                          Chunk {chunk.chunk_index}
                        </div>
                        <div className="text-sm line-clamp-2">
                          {chunk.content.substring(0, 100)}...
                        </div>
                        {chunk.themes && chunk.themes.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {chunk.themes.slice(0, 3).map((theme, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {theme}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {chunk.importance_score !== undefined && (
                          <div className="text-xs text-muted-foreground">
                            Importance: {chunk.importance_score.toFixed(2)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Resolution Options */}
          <div>
            <h4 className="text-sm font-medium mb-3">Resolution Strategy:</h4>
            <RadioGroup
              value={selectedStrategy}
              onValueChange={(value) => setSelectedStrategy(value as ConflictStrategy)}
            >
              <div className="space-y-3">
                {/* Skip Option */}
                <div className="flex items-start space-x-3 border rounded-lg p-4">
                  <RadioGroupItem value="skip" id="skip" />
                  <Label htmlFor="skip" className="flex-1 cursor-pointer">
                    <div className="font-medium">Skip Import</div>
                    <div className="text-sm text-muted-foreground">
                      Keep existing data, ignore import
                    </div>
                  </Label>
                </div>

                {/* Replace Option */}
                <div className="flex items-start space-x-3 border rounded-lg p-4">
                  <RadioGroupItem value="replace" id="replace" />
                  <Label htmlFor="replace" className="flex-1 cursor-pointer">
                    <div className="font-medium flex items-center gap-2">
                      Replace All
                      <Badge variant="destructive" className="text-xs">
                        Destructive
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Delete existing, use import data
                    </div>
                  </Label>
                </div>

                {/* Merge Smart Option */}
                <div className="flex items-start space-x-3 border rounded-lg p-4 border-primary bg-primary/5">
                  <RadioGroupItem value="merge_smart" id="merge_smart" />
                  <Label htmlFor="merge_smart" className="flex-1 cursor-pointer">
                    <div className="font-medium flex items-center gap-2">
                      Merge Smart
                      <Badge variant="outline" className="text-xs">
                        Recommended
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Update metadata, preserve IDs and annotations
                    </div>
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Warning Alert */}
          <Alert variant={warning.variant}>
            {warning.icon}
            <AlertTitle>{warning.title}</AlertTitle>
            <AlertDescription>
              <ul className="space-y-1">
                {warning.description.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onCancel ? onCancel() : onClose()}
            disabled={isApplying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            disabled={isApplying}
          >
            {isApplying ? 'Applying...' : 'Apply Resolution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
