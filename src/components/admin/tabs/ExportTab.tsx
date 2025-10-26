'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { exportDocuments, type ExportOptions } from '@/app/actions/documents'
import { Button } from '@/components/rhizome/button'
import { Checkbox } from '@/components/rhizome/checkbox'
import { Label } from '@/components/rhizome/label'
import { Progress } from '@/components/rhizome/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/rhizome/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, Download, Package, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/rhizome/tooltip'

interface Document {
  id: string
  title: string
  source_type: string
  processing_status: string
  created_at: string
}

interface ExportJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  details: string
  downloadUrl?: string
  error?: string
}

export function ExportTab() {
  // Document list state
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selection state
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())

  // Export options
  const [includeConnections, setIncludeConnections] = useState(true)
  const [includeAnnotations, setIncludeAnnotations] = useState(true)

  // Export job tracking
  const [exportJob, setExportJob] = useState<ExportJob | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Success/error messages
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load documents on mount
  useEffect(() => {
    loadDocuments()
  }, [])

  // Job polling effect
  useEffect(() => {
    if (!exportJob || exportJob.status === 'completed' || exportJob.status === 'failed') {
      return
    }

    const pollInterval = setInterval(() => {
      pollJobProgress()
    }, 2000)

    return () => clearInterval(pollInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportJob])

  const loadDocuments = async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: queryError } = await supabase
        .from('documents')
        .select('id, title, source_type, processing_status, created_at')
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })

      if (queryError) {
        setError(`Failed to load documents: ${queryError.message}`)
      } else {
        setDocuments(data || [])
      }
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
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
    if (selectedDocs.size === documents.length) {
      // Deselect all
      setSelectedDocs(new Set())
    } else {
      // Select all
      setSelectedDocs(new Set(documents.map((d) => d.id)))
    }
  }

  const handleExport = async () => {
    if (selectedDocs.size === 0) return

    setIsExporting(true)
    setMessage(null)
    setExportJob(null)

    const options: ExportOptions = {
      includeConnections,
      includeAnnotations,
      format: 'zip',
    }

    try {
      const result = await exportDocuments(Array.from(selectedDocs), options)

      if (result.success && result.jobId) {
        // Initialize job tracking
        setExportJob({
          id: result.jobId,
          status: 'pending',
          progress: 0,
          details: 'Export job created, starting...',
        })
      } else {
        setMessage({
          type: 'error',
          text: result.error || 'Failed to start export',
        })
        setIsExporting(false)
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: `Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
      setIsExporting(false)
    }
  }

  const pollJobProgress = async () => {
    if (!exportJob) return

    try {
      const supabase = createClient()
      const { data: jobData, error } = await supabase
        .from('background_jobs')
        .select('status, progress, output_data')
        .eq('id', exportJob.id)
        .single()

      if (error) {
        // Only log meaningful errors (not empty objects or PGRST116 not found)
        if (error.message && !error.message.includes('PGRST116')) {
          console.error('Error polling job:', error.message)
        }
        return
      }

      if (jobData) {
        if (jobData.status === 'completed') {
          const downloadUrl = jobData.output_data?.downloadUrl || jobData.output_data?.signedUrl
          setExportJob({
            id: exportJob.id,
            status: 'completed',
            progress: 100,
            details: jobData.progress?.details || 'Export completed successfully',
            downloadUrl,
          })
          setIsExporting(false)
          setMessage({
            type: 'success',
            text: `Successfully exported ${selectedDocs.size} document(s)`,
          })
        } else if (jobData.status === 'failed') {
          setExportJob({
            id: exportJob.id,
            status: 'failed',
            progress: 0,
            details: jobData.progress?.details || 'Export failed',
            error: jobData.output_data?.error || 'Unknown error',
          })
          setIsExporting(false)
          setMessage({
            type: 'error',
            text: `Export failed: ${jobData.output_data?.error || 'Unknown error'}`,
          })
        } else if (jobData.status === 'processing') {
          setExportJob({
            ...exportJob,
            status: 'processing',
            progress: jobData.progress?.percent || 50,
            details: jobData.progress?.details || 'Processing export...',
          })
        }
      }
    } catch (err) {
      console.error('Polling error:', err)
    }
  }

  const handleDownload = () => {
    if (exportJob?.downloadUrl) {
      window.open(exportJob.downloadUrl, '_blank')
    }
  }

  // Calculate estimated size (rough approximation)
  const getEstimatedSize = () => {
    // Assume ~5MB per document on average
    const sizeInMB = selectedDocs.size * 5
    if (sizeInMB < 1) {
      return `~${(sizeInMB * 1024).toFixed(0)}KB`
    }
    return `~${sizeInMB.toFixed(1)}MB`
  }

  const allSelected = documents.length > 0 && selectedDocs.size === documents.length

  const getStatusIcon = () => {
    if (!exportJob) return null

    switch (exportJob.status) {
      case 'pending':
        return <AlertCircle className="size-4 text-yellow-600" />
      case 'processing':
        return <Loader2 className="size-4 animate-spin text-blue-600" />
      case 'completed':
        return <CheckCircle2 className="size-4 text-green-600" />
      case 'failed':
        return <AlertCircle className="size-4 text-red-600" />
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Export Documents</h3>
          <p className="text-sm text-muted-foreground">
            Generate ZIP bundles for backup or migration
          </p>
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
                  <Download className="mr-2 size-4" />
                  Refresh List
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Reload the list of completed documents</p>
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

      {/* Document List */}
      {!loading && documents.length > 0 && (
        <>
          {/* Export Options */}
          <div className="border rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium">Export Options</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-connections"
                  checked={includeConnections}
                  onCheckedChange={(checked) => setIncludeConnections(!!checked)}
                  disabled={isExporting}
                />
                <Label htmlFor="include-connections" className="flex items-center gap-1 text-sm cursor-pointer">
                  Include Connections
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Include the 3-engine collision detection results (semantic similarity, contradiction detection, and thematic bridges) in the export bundle.</p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-annotations"
                  checked={includeAnnotations}
                  onCheckedChange={(checked) => setIncludeAnnotations(!!checked)}
                  disabled={isExporting}
                />
                <Label htmlFor="include-annotations" className="flex items-center gap-1 text-sm cursor-pointer">
                  Include Annotations
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Include all user highlights, notes, and annotations created during reading. Essential for preserving your work.</p>
                    </TooltipContent>
                  </Tooltip>
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
                      disabled={isExporting}
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Source Type</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDocs.has(doc.id)}
                        onCheckedChange={() => toggleDocSelection(doc.id)}
                        disabled={isExporting}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {doc.source_type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Export Summary and Button */}
          <div className="flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedDocs.size > 0 ? (
                <>
                  Selected: {selectedDocs.size} document(s) ({getEstimatedSize()} estimated)
                </>
              ) : (
                'No documents selected'
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleExport} disabled={selectedDocs.size === 0 || isExporting}>
                  {isExporting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Package className="mr-2 size-4" />
                      Export Selected ({selectedDocs.size})
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create a ZIP bundle with all document files for backup or migration</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      {/* Empty State */}
      {!loading && documents.length === 0 && (
        <div className="border rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No completed documents available for export</p>
          <p className="text-sm text-muted-foreground mt-2">
            Process documents first to make them available for export
          </p>
        </div>
      )}

      {/* Export Progress */}
      {exportJob && (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <h4 className="text-sm font-medium">Export Progress</h4>
            </div>
            <Badge
              variant={
                exportJob.status === 'completed'
                  ? 'default'
                  : exportJob.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
              }
            >
              {exportJob.status}
            </Badge>
          </div>

          {exportJob.status === 'processing' && (
            <div className="space-y-2">
              <Progress value={exportJob.progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {exportJob.details} ({exportJob.progress}%)
              </p>
            </div>
          )}

          {exportJob.status === 'completed' && exportJob.downloadUrl && (
            <div className="space-y-2">
              <p className="text-sm text-green-800">Export completed successfully!</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={handleDownload} variant="default" size="sm">
                    <Download className="mr-2 size-4" />
                    Download ZIP
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Download the ZIP bundle (link expires in 24 hours)</p>
                </TooltipContent>
              </Tooltip>
              <p className="text-xs text-muted-foreground">
                Download link expires in 24 hours
              </p>
            </div>
          )}

          {exportJob.status === 'failed' && (
            <div className="space-y-2">
              <p className="text-sm text-red-800">{exportJob.details}</p>
              {exportJob.error && (
                <p className="text-xs text-red-600">Error: {exportJob.error}</p>
              )}
            </div>
          )}

          {exportJob.status === 'pending' && (
            <p className="text-xs text-muted-foreground">{exportJob.details}</p>
          )}
        </div>
      )}
      </div>
    </TooltipProvider>
  )
}
