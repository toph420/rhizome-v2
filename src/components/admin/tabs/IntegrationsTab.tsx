'use client'

import React, { useEffect, useState } from 'react'
import {
  exportToObsidian,
  syncFromObsidian,
  importReadwiseHighlights,
  type ObsidianExportResult,
  type ObsidianSyncResult,
  type ReadwiseImportResult,
} from '@/app/actions/integrations'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileText, RefreshCw, Upload, CheckCircle2, AlertCircle, XCircle, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Document {
  id: string
  title: string
  processing_status: string
}

interface IntegrationJob {
  id: string
  job_type: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  details: string
  created_at: string
  output_data?: {
    path?: string
    uri?: string
    changed?: boolean
    imported?: number
    needsReview?: number
    failed?: number
    error?: string
  }
}

export function IntegrationsTab() {
  // Document list state
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Operation state
  const [isOperating, setIsOperating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Readwise file upload
  const [readwiseFile, setReadwiseFile] = useState<File | null>(null)

  // Operation history
  const [operationHistory, setOperationHistory] = useState<IntegrationJob[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Load documents and history on mount
  useEffect(() => {
    loadDocuments()
    loadOperationHistory()
  }, [])

  // Auto-refresh history when operations complete
  useEffect(() => {
    if (!isOperating) {
      loadOperationHistory()
    }
  }, [isOperating])

  const loadDocuments = async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from('documents')
        .select('id, title, processing_status')
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })

      if (queryError) {
        setError(`Failed to load documents: ${queryError.message}`)
      } else {
        setDocuments(data || [])
        // Auto-select first document if none selected
        if (!selectedDoc && data && data.length > 0) {
          setSelectedDoc(data[0].id)
        }
      }
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const loadOperationHistory = async () => {
    setLoadingHistory(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('background_jobs')
        .select('id, job_type, status, details, created_at, output_data')
        .in('job_type', ['obsidian_export', 'obsidian_sync', 'readwise_import'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && data) {
        setOperationHistory(data as IntegrationJob[])
      }
    } catch (err) {
      console.error('Failed to load operation history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  // ============================================================================
  // OBSIDIAN OPERATIONS
  // ============================================================================

  const handleObsidianExport = async () => {
    if (!selectedDoc) {
      setMessage({ type: 'error', text: 'Please select a document first' })
      return
    }

    setIsOperating(true)
    setMessage(null)

    try {
      const result: ObsidianExportResult = await exportToObsidian(selectedDoc)

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Obsidian export started. Check operation history for status.`,
        })
        // Reload history to show new job
        setTimeout(() => loadOperationHistory(), 1000)
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to start Obsidian export',
        })
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    } finally {
      setIsOperating(false)
    }
  }

  const handleObsidianSync = async () => {
    if (!selectedDoc) {
      setMessage({ type: 'error', text: 'Please select a document first' })
      return
    }

    setIsOperating(true)
    setMessage(null)

    try {
      const result: ObsidianSyncResult = await syncFromObsidian(selectedDoc)

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Obsidian sync started. Check operation history for status.`,
        })
        // Reload history to show new job
        setTimeout(() => loadOperationHistory(), 1000)
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to start Obsidian sync',
        })
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: `Sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    } finally {
      setIsOperating(false)
    }
  }

  // ============================================================================
  // READWISE OPERATIONS
  // ============================================================================

  const handleReadwiseFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setReadwiseFile(file)
    }
  }

  const handleReadwiseImport = async () => {
    if (!selectedDoc) {
      setMessage({ type: 'error', text: 'Please select a document first' })
      return
    }

    if (!readwiseFile) {
      setMessage({ type: 'error', text: 'Please select a Readwise export JSON file' })
      return
    }

    setIsOperating(true)
    setMessage(null)

    try {
      // Read and parse JSON file
      const fileText = await readwiseFile.text()
      let readwiseData: unknown[]

      try {
        readwiseData = JSON.parse(fileText)
      } catch (parseError) {
        setMessage({
          type: 'error',
          text: 'Invalid JSON file. Please export highlights from Readwise.io/export',
        })
        setIsOperating(false)
        return
      }

      if (!Array.isArray(readwiseData)) {
        setMessage({
          type: 'error',
          text: 'Readwise export must be a JSON array of highlights',
        })
        setIsOperating(false)
        return
      }

      const result: ReadwiseImportResult = await importReadwiseHighlights(selectedDoc, readwiseData)

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Readwise import started (${readwiseData.length} highlights). Check operation history for status.`,
        })
        // Clear file input
        setReadwiseFile(null)
        // Reset file input
        const fileInput = document.getElementById('readwise-file-input') as HTMLInputElement
        if (fileInput) fileInput.value = ''
        // Reload history to show new job
        setTimeout(() => loadOperationHistory(), 1000)
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to start Readwise import',
        })
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    } finally {
      setIsOperating(false)
    }
  }

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const getJobTypeLabel = (jobType: string): string => {
    switch (jobType) {
      case 'obsidian_export':
        return 'Export to Obsidian'
      case 'obsidian_sync':
        return 'Sync from Obsidian'
      case 'readwise_import':
        return 'Import Readwise'
      default:
        return jobType
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            Completed
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <XCircle className="size-3" />
            Failed
          </Badge>
        )
      case 'processing':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            Processing
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="outline" className="flex items-center gap-1">
            <AlertCircle className="size-3" />
            Pending
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const selectedDocTitle = documents.find((d) => d.id === selectedDoc)?.title || 'Select document'

  return (
    <TooltipProvider>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Integrations</h3>
          <p className="text-sm text-muted-foreground">Manage Obsidian and Readwise operations</p>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={loadDocuments} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 size-4" />
                  Refresh
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reload the list of completed documents and operation history</p>
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
          <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="border border-red-200 rounded-lg p-4 bg-red-50">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && !documents.length && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Main Content */}
      {!loading && documents.length > 0 && (
        <>
          {/* Document Selector */}
          <div className="border rounded-lg p-4 space-y-3">
            <Label htmlFor="document-select" className="text-sm font-medium">
              Select Document
            </Label>
            <select
              id="document-select"
              className="w-full p-2 border rounded-md"
              value={selectedDoc || ''}
              onChange={(e) => setSelectedDoc(e.target.value)}
              disabled={isOperating}
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Selected: {selectedDocTitle}
            </p>
          </div>

          {/* Obsidian Section */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="size-5" />
              <h4 className="text-md font-semibold">Obsidian</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Export documents to your Obsidian vault or sync edited markdown back to Rhizome
            </p>

            <div className="flex gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleObsidianExport}
                    disabled={!selectedDoc || isOperating}
                    variant="default"
                  >
                    {isOperating ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Working...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 size-4" />
                        Export to Obsidian
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Save markdown content to your Obsidian vault for external editing</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleObsidianSync}
                    disabled={!selectedDoc || isOperating}
                    variant="outline"
                  >
                    {isOperating ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Working...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 size-4" />
                        Sync from Obsidian
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Import edited markdown from Obsidian with fuzzy annotation recovery</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>Export</strong>: Saves markdown to your Obsidian vault</p>
              <p>• <strong>Sync</strong>: Imports edited markdown from Obsidian with annotation recovery</p>
            </div>
          </div>

          <Separator />

          {/* Readwise Section */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="size-5" />
              <h4 className="text-md font-semibold">Readwise</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Import highlights from Readwise export JSON (from readwise.io/export)
            </p>

            <div className="space-y-3">
              <div>
                <Label htmlFor="readwise-file-input" className="text-sm">
                  Readwise Export File
                </Label>
                <input
                  id="readwise-file-input"
                  type="file"
                  accept=".json"
                  onChange={handleReadwiseFileChange}
                  disabled={isOperating}
                  className="mt-1 w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {readwiseFile && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selected: {readwiseFile.name} ({(readwiseFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleReadwiseImport}
                    disabled={!selectedDoc || !readwiseFile || isOperating}
                    variant="default"
                  >
                    {isOperating ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 size-4" />
                        Import Highlights
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Import highlights from Readwise export JSON with intelligent matching</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Export highlights from <strong>readwise.io/export</strong></p>
              <p>• Exact matches → immediate annotations</p>
              <p>• Fuzzy matches → review queue (import_pending table)</p>
            </div>
          </div>

          <Separator />

          {/* Operation History */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-md font-semibold">Operation History</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadOperationHistory}
                disabled={loadingHistory}
              >
                {loadingHistory ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </div>

            {operationHistory.length > 0 ? (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operation</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {operationHistory.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-medium">{getJobTypeLabel(job.job_type)}</TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {job.status === 'completed' && job.output_data ? (
                            <span>
                              {job.output_data.path && `Path: ${job.output_data.path}`}
                              {job.output_data.changed !== undefined &&
                                `Changed: ${job.output_data.changed ? 'Yes' : 'No'}`}
                              {job.output_data.imported !== undefined &&
                                `Imported: ${job.output_data.imported}, Needs Review: ${job.output_data.needsReview || 0}, Failed: ${job.output_data.failed || 0}`}
                            </span>
                          ) : job.status === 'failed' && job.output_data?.error ? (
                            <span className="text-red-600">{job.output_data.error}</span>
                          ) : (
                            job.details || 'Processing...'
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatTimestamp(job.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">No integration operations yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Start an operation to see history here
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No completed documents available</p>
          <p className="text-sm text-muted-foreground mt-2">
            Process documents first to use integrations
          </p>
        </div>
      )}
      </div>
    </TooltipProvider>
  )
}
