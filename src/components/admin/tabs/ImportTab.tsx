'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  importFromStorage,
  type DocumentScanResult,
} from '@/app/actions/documents'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/rhizome/checkbox'
import { Label } from '@/components/rhizome/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/rhizome/table'
import { Loader2, Download, Info, Trash2 } from 'lucide-react'
import { ConflictResolutionDialog } from '@/components/admin/ConflictResolutionDialog'
import type { ImportConflict } from '@/types/storage'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/rhizome/tooltip'
import { useStorageScanStore } from '@/stores/admin/storage-scan'
import { useBackgroundJobsStore } from '@/stores/admin/background-jobs'
import { JobList } from '@/components/admin/JobList'
import { clearCompletedJobs, clearFailedJobs } from '@/app/actions/admin'

export function ImportTab() {
  // Use Zustand stores
  const { scanResults, scanning, error: scanError, scan, pendingImportDocuments, clearPendingImportDocuments } = useStorageScanStore()
  const { jobs, registerJob, updateJob, replaceJob, removeJob } = useBackgroundJobsStore()

  // Selection state
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  // Import options
  const [regenerateEmbeddings, setRegenerateEmbeddings] = useState(false)
  const [reprocessConnections, setReprocessConnections] = useState(false)

  // Conflict resolution
  const [currentConflict, setCurrentConflict] = useState<{
    conflict: ImportConflict
    documentId: string
    title: string
    onResolved?: (jobId: string) => void
    onRejected?: () => void
  } | null>(null)

  // Import tracking
  const [isImporting, setIsImporting] = useState(false)

  // Success/error messages
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Job cleanup state
  const [cleaningJobs, setCleaningJobs] = useState<'completed' | 'failed' | null>(null)

  // Auto-scan on mount only (not on every render)
  useEffect(() => {
    scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle pending imports from Scanner Tab
  useEffect(() => {
    if (pendingImportDocuments.length > 0) {
      console.log('[ImportTab] Pre-selecting pending imports:', pendingImportDocuments)
      setSelectedDocs(new Set(pendingImportDocuments))
      clearPendingImportDocuments()
    }
  }, [pendingImportDocuments, clearPendingImportDocuments])

  const toggleDocSelection = (documentId: string) => {
    const newSelected = new Set(selectedDocs)
    if (newSelected.has(documentId)) {
      newSelected.delete(documentId)
    } else {
      newSelected.add(documentId)
    }
    setSelectedDocs(newSelected)
  }

  const toggleSelectAll = () => {
    if (!scanResults) return

    const importableDocuments = scanResults.filter(
      (doc) =>
        doc.syncState === 'missing_from_db' ||
        doc.syncState === 'out_of_sync' ||
        (doc.storageFiles.length > 0 && doc.storageFiles.includes('chunks.json'))
    )

    if (selectedDocs.size === importableDocuments.length) {
      // Deselect all
      setSelectedDocs(new Set())
    } else {
      // Select all importable
      setSelectedDocs(new Set(importableDocuments.map((d) => d.documentId)))
    }
  }

  const handleImport = async () => {
    if (selectedDocs.size === 0) return

    setIsImporting(true)
    setMessage(null)

    const docsToImport = scanResults?.filter((d) => selectedDocs.has(d.documentId)) || []
    let successfulImports = 0

    // Process each document sequentially
    for (const doc of docsToImport) {
      try {
        await processImport(doc)
        successfulImports++
      } catch (error) {
        // Import was cancelled or failed - continue to next document
        console.log(`Import cancelled/failed for ${doc.title}:`, error)
      }
    }

    setIsImporting(false)

    // Only show summary if at least one import was attempted
    if (successfulImports > 0) {
      const importJobsList = Array.from(jobs.values()).filter(j => j.type === 'import_document')
      const completed = importJobsList.filter((j) => j.status === 'completed').length
      const failed = importJobsList.filter((j) => j.status === 'failed').length

      if (failed === 0) {
        setMessage({
          type: 'success',
          text: `Successfully imported ${completed} document(s). Click "Refresh List" to update sync states.`,
        })
      } else {
        setMessage({
          type: 'error',
          text: `Imported ${completed} document(s), ${failed} failed. Click "Refresh List" to update.`,
        })
      }

      // Clear selections without refreshing
      setSelectedDocs(new Set())
    }
  }

  const processImport = async (doc: DocumentScanResult) => {
    // Register job in store
    const tempJobId = `import-${doc.documentId}`
    registerJob(tempJobId, 'import_document', {
      documentId: doc.documentId,
      title: doc.title
    })

    try {
      const result = await importFromStorage(doc.documentId, {
        regenerateEmbeddings,
        reprocessConnections,
      })

      if (result.success && result.jobId) {
        // Replace temp job with real job ID
        replaceJob(tempJobId, result.jobId)
      } else if (result.needsResolution && result.conflict) {
        // Conflict detected - show dialog
        updateJob(tempJobId, {
          status: 'pending',
          progress: 10,
          details: 'Awaiting conflict resolution...'
        })

        return new Promise<void>((resolve, reject) => {
          setCurrentConflict({
            conflict: result.conflict!,
            documentId: doc.documentId,
            title: doc.title,
            onResolved: (jobId: string) => {
              // Handle 'skip' specially - just remove the temp job
              if (jobId === 'skip') {
                removeJob(tempJobId)
              } else {
                // Normal flow: replace temp job with real job ID
                replaceJob(tempJobId, jobId)
              }
              setCurrentConflict(null)
              resolve()
            },
            onRejected: () => {
              setCurrentConflict(null)
              reject(new Error('Import cancelled by user'))
            },
          })
        })
      } else {
        // Error occurred
        updateJob(tempJobId, {
          status: 'failed',
          progress: 0,
          details: result.error || 'Import failed',
          error: result.error
        })
      }
    } catch (error) {
      console.error('Import error:', error)
      updateJob(tempJobId, {
        status: 'failed',
        progress: 0,
        details: 'Unexpected error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  const handleConflictResolved = useCallback((jobId: string) => {
    if (currentConflict) {
      // Call the Promise callback which handles job management and closes dialog
      currentConflict.onResolved?.(jobId)
    }
  }, [currentConflict])

  const handleClearJobs = async (type: 'completed' | 'failed') => {
    setCleaningJobs(type)
    try {
      const result = type === 'completed'
        ? await clearCompletedJobs()
        : await clearFailedJobs()

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Cleared ${type} jobs successfully`
        })
      } else {
        setMessage({
          type: 'error',
          text: result.error || `Failed to clear ${type} jobs`
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error clearing ${type} jobs`
      })
    } finally {
      setCleaningJobs(null)
    }
  }

  // Filter to only show importable documents
  const importableDocuments =
    scanResults?.filter(
      (doc) =>
        doc.syncState === 'missing_from_db' ||
        doc.syncState === 'out_of_sync' ||
        (doc.storageFiles.length > 0 && doc.storageFiles.includes('chunks.json'))
    ) || []

  const allSelected =
    importableDocuments.length > 0 && selectedDocs.size === importableDocuments.length

  // Get import jobs from store
  const importJobsList = Array.from(jobs.values()).filter(j => j.type === 'import_document')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Import from Storage</h3>
          <p className="text-sm text-muted-foreground">
            Restore documents from Storage with conflict resolution
          </p>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={scan} disabled={scanning}>
              {scanning ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Download className="mr-2 size-4" />
                  Refresh List
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Scan Storage for importable documents</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-4 border rounded-lg ${
            message.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}
        >
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}
          >
            {message.text}
          </p>
        </div>
      )}

      {/* Scan Error */}
      {scanError && (
        <div className="border border-red-200 rounded-lg p-4 bg-red-50">
          <p className="text-sm text-red-800">{scanError}</p>
        </div>
      )}

      {/* Loading State */}
      {scanning && !scanResults && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Document List */}
      {!scanning && importableDocuments.length > 0 && (
        <>
          {/* Import Options */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium">Import Options</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="regenerate-embeddings"
                  checked={regenerateEmbeddings}
                  onCheckedChange={(checked) => setRegenerateEmbeddings(!!checked)}
                  disabled={isImporting}
                />
                <Label htmlFor="regenerate-embeddings" className="text-sm cursor-pointer flex items-center gap-1">
                  Regenerate Embeddings
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Generate fresh 768-dimensional embeddings for all chunks. Takes ~2 seconds per chunk. Required if embeddings were not included in export.</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-xs text-muted-foreground ml-2">
                    (768d vectors, ~2s per chunk)
                  </span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="reprocess-connections"
                  checked={reprocessConnections}
                  onCheckedChange={(checked) => setReprocessConnections(!!checked)}
                  disabled={isImporting}
                />
                <Label htmlFor="reprocess-connections" className="text-sm cursor-pointer flex items-center gap-1">
                  Reprocess Connections
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Run the 3-engine collision detection system to find connections between chunks. Includes semantic similarity, contradiction detection, and thematic bridges.</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-xs text-muted-foreground ml-2">
                    (Run 3-engine collision detection)
                  </span>
                </Label>
              </div>
            </div>
          </div>

          {/* Document Selection Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      disabled={isImporting}
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Files</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importableDocuments.map((doc) => (
                  <TableRow key={doc.documentId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDocs.has(doc.documentId)}
                        onCheckedChange={() => toggleDocSelection(doc.documentId)}
                        disabled={isImporting}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      {doc.syncState === 'missing_from_db' && (
                        <Badge variant="destructive">Missing from DB</Badge>
                      )}
                      {doc.syncState === 'out_of_sync' && (
                        <Badge variant="secondary" className="bg-orange-600">
                          Out of Sync
                        </Badge>
                      )}
                      {doc.syncState === 'healthy' && (
                        <Badge variant="default" className="bg-green-600">
                          Healthy
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {doc.chunkCount !== null ? `${doc.chunkCount} chunks` : 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {doc.storageFiles.length} files
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Import Button */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedDocs.size} document(s) selected
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleImport} disabled={selectedDocs.size === 0 || isImporting}>
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 size-4" />
                      Import Selected ({selectedDocs.size})
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Start import process with conflict resolution</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      {/* Empty State */}
      {!scanning && scanResults && importableDocuments.length === 0 && (
        <div className="border rounded-lg p-8 text-center space-y-2">
          <p className="text-muted-foreground font-medium">
            No importable documents found in Storage
          </p>
          <p className="text-sm text-muted-foreground">
            Documents must have <code className="bg-muted px-1 py-0.5 rounded text-xs">chunks.json</code> in Storage to be imported.
          </p>
          <p className="text-sm text-muted-foreground">
            Process a document or export existing documents to create Storage backups.
          </p>
        </div>
      )}

      {/* Import Progress */}
      {importJobsList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Import Progress</h4>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearJobs('completed')}
                    disabled={cleaningJobs !== null}
                  >
                    {cleaningJobs === 'completed' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Clear Completed
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove all completed import jobs</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleClearJobs('failed')}
                    disabled={cleaningJobs !== null}
                  >
                    {cleaningJobs === 'failed' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-2" />
                    )}
                    Clear Failed
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove all failed import jobs</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <JobList
            jobs={importJobsList}
            showFilters={false}
            emptyMessage="No import jobs in progress"
          />
        </div>
      )}

      {/* Conflict Resolution Dialog */}
      {currentConflict && (
        <ConflictResolutionDialog
          isOpen={true}
          onClose={() => {
            if (currentConflict) {
              // Dialog closed (X button or click outside) - remove temp job
              const tempJobId = `import-${currentConflict.documentId}`
              removeJob(tempJobId)

              // Reject the Promise to unblock the import flow
              currentConflict.onRejected?.()
            }
          }}
          onCancel={() => {
            if (currentConflict) {
              // Cancel button clicked - remove temp job
              const tempJobId = `import-${currentConflict.documentId}`
              removeJob(tempJobId)

              // Reject the Promise to unblock the import flow
              currentConflict.onRejected?.()
            }
          }}
          conflict={currentConflict.conflict}
          documentId={currentConflict.documentId}
          onResolved={handleConflictResolved}
          regenerateEmbeddings={regenerateEmbeddings}
          reprocessConnections={reprocessConnections}
        />
      )}
    </div>
  )
}
