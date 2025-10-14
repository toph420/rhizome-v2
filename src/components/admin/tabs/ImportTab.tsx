'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  scanStorage,
  importFromStorage,
  type DocumentScanResult,
} from '@/app/actions/documents'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Download, CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react'
import { ConflictResolutionDialog } from '@/components/admin/ConflictResolutionDialog'
import type { ImportConflict } from '@/types/storage'
import { createClient } from '@/lib/supabase/client'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ImportJob {
  id: string
  documentId: string
  title: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  details: string
  error?: string
}

export function ImportTab() {
  // Scanner state
  const [scanResults, setScanResults] = useState<DocumentScanResult[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

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
  } | null>(null)

  // Job tracking
  const [importJobs, setImportJobs] = useState<ImportJob[]>([])
  const [isImporting, setIsImporting] = useState(false)

  // Success/error messages
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Auto-scan on mount
  useEffect(() => {
    handleScan()
  }, [])

  // Job polling effect
  useEffect(() => {
    if (importJobs.length === 0) return

    const activeJobs = importJobs.filter(
      (j) => j.status === 'pending' || j.status === 'processing'
    )
    if (activeJobs.length === 0) return

    const pollInterval = setInterval(() => {
      pollJobProgress(activeJobs)
    }, 2000)

    return () => clearInterval(pollInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJobs])

  const handleScan = async () => {
    setScanning(true)
    setScanError(null)

    const result = await scanStorage()

    if (result.success) {
      setScanResults(result.documents)
    } else {
      setScanError(result.error || 'Failed to scan storage')
    }

    setScanning(false)
  }

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

    // Initialize import jobs
    const jobs: ImportJob[] = docsToImport.map((doc) => ({
      id: `import-${doc.documentId}`,
      documentId: doc.documentId,
      title: doc.title,
      status: 'pending' as const,
      progress: 0,
      details: 'Starting import...',
    }))

    setImportJobs(jobs)

    // Process each document sequentially
    for (const doc of docsToImport) {
      await processImport(doc)
    }

    setIsImporting(false)

    // Show summary message
    const completed = importJobs.filter((j) => j.status === 'completed').length
    const failed = importJobs.filter((j) => j.status === 'failed').length

    if (failed === 0) {
      setMessage({
        type: 'success',
        text: `Successfully imported ${completed} document(s)`,
      })
    } else {
      setMessage({
        type: 'error',
        text: `Imported ${completed} document(s), ${failed} failed`,
      })
    }

    // Refresh scan after import
    setTimeout(() => {
      handleScan()
      setSelectedDocs(new Set())
    }, 1000)
  }

  const processImport = async (doc: DocumentScanResult) => {
    // Update job status
    updateJobStatus(doc.documentId, 'processing', 10, 'Checking for conflicts...')

    try {
      const result = await importFromStorage(doc.documentId, {
        regenerateEmbeddings,
        reprocessConnections,
      })

      if (result.success && result.jobId) {
        // Job created successfully
        updateJobStatus(doc.documentId, 'processing', 30, 'Import job created', result.jobId)
      } else if (result.needsResolution && result.conflict) {
        // Conflict detected - show dialog
        updateJobStatus(doc.documentId, 'pending', 10, 'Awaiting conflict resolution...')

        return new Promise<void>((resolve) => {
          setCurrentConflict({
            conflict: result.conflict!,
            documentId: doc.documentId,
            title: doc.title,
          })

          // Store the resolve callback to be called after conflict resolution
          const originalOnResolved = (jobId: string) => {
            updateJobStatus(doc.documentId, 'processing', 30, 'Import job created', jobId)
            setCurrentConflict(null)
            resolve()
          }

          // Monkey-patch the onResolved callback
          setCurrentConflict((prev) => ({
            ...prev!,
            onResolved: originalOnResolved,
          } as any))
        })
      } else {
        // Error occurred
        updateJobStatus(
          doc.documentId,
          'failed',
          0,
          result.error || 'Import failed',
          undefined,
          result.error
        )
      }
    } catch (error) {
      console.error('Import error:', error)
      updateJobStatus(
        doc.documentId,
        'failed',
        0,
        'Unexpected error',
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  const updateJobStatus = (
    documentId: string,
    status: ImportJob['status'],
    progress: number,
    details: string,
    jobId?: string,
    error?: string
  ) => {
    setImportJobs((prev) =>
      prev.map((job) =>
        job.documentId === documentId
          ? { ...job, status, progress, details, error, id: jobId || job.id }
          : job
      )
    )
  }

  const pollJobProgress = async (activeJobs: ImportJob[]) => {
    const supabase = createClient()

    for (const job of activeJobs) {
      // Skip if job ID is not a real job ID (still pending)
      if (job.id.startsWith('import-')) continue

      try {
        const { data: jobData, error } = await supabase
          .from('background_jobs')
          .select('status, progress, details, output_data')
          .eq('id', job.id)
          .single()

        if (error) {
          console.error('Error polling job:', error)
          continue
        }

        if (jobData) {
          if (jobData.status === 'completed') {
            updateJobStatus(
              job.documentId,
              'completed',
              100,
              jobData.details || 'Import completed successfully'
            )
          } else if (jobData.status === 'failed') {
            updateJobStatus(
              job.documentId,
              'failed',
              0,
              jobData.details || 'Import failed',
              undefined,
              jobData.output_data?.error || 'Unknown error'
            )
          } else if (jobData.status === 'processing') {
            updateJobStatus(
              job.documentId,
              'processing',
              jobData.progress || 50,
              jobData.details || 'Processing...'
            )
          }
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }
  }

  const handleConflictResolved = useCallback((jobId: string) => {
    if (currentConflict) {
      updateJobStatus(
        currentConflict.documentId,
        'processing',
        30,
        'Import job created',
        jobId
      )
    }
    setCurrentConflict(null)
  }, [currentConflict])

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

  const getStatusIcon = (status: ImportJob['status']) => {
    switch (status) {
      case 'pending':
        return <AlertCircle className="size-4 text-yellow-600" />
      case 'processing':
        return <Loader2 className="size-4 animate-spin text-blue-600" />
      case 'completed':
        return <CheckCircle2 className="size-4 text-green-600" />
      case 'failed':
        return <XCircle className="size-4 text-red-600" />
    }
  }

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
            <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
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
      {importJobs.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Import Progress</h4>
          <div className="space-y-3">
            {importJobs.map((job) => (
              <div key={job.documentId} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <span className="font-medium text-sm">{job.title}</span>
                  </div>
                  <Badge
                    variant={
                      job.status === 'completed'
                        ? 'default'
                        : job.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
                {job.status === 'processing' && (
                  <Progress value={job.progress} className="h-2" />
                )}
                <p className="text-xs text-muted-foreground">{job.details}</p>
                {job.error && <p className="text-xs text-red-600">{job.error}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflict Resolution Dialog */}
      {currentConflict && (
        <ConflictResolutionDialog
          isOpen={true}
          onClose={() => setCurrentConflict(null)}
          conflict={currentConflict.conflict}
          documentId={currentConflict.documentId}
          onResolved={handleConflictResolved}
        />
      )}
    </div>
  )
}
