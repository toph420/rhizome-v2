'use client'

import React, { useEffect, useState } from 'react'
import { type DocumentScanResult, type SyncState } from '@/app/actions/documents'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/rhizome/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/rhizome/tooltip'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Info, Trash2 } from 'lucide-react'
import { useStorageScanStore } from '@/stores/admin/storage-scan'
import { useAdminPanelStore } from '@/stores/admin/admin-panel'
import { deleteDocument } from '@/app/actions/delete-document'
import { exportToObsidian } from '@/app/actions/integrations'

type FilterType = 'all' | 'missing_db' | 'out_sync' | 'healthy'

export function ScannerTab() {
  // Use Zustand store for scan state
  const { scanResults, scanning, error, scan, invalidate, removeDocument, setPendingImportDocuments } = useStorageScanStore()
  const { setActiveTab } = useAdminPanelStore()

  // Local UI state only
  const [filter, setFilter] = useState<FilterType>('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [deletingDocs, setDeletingDocs] = useState<Set<string>>(new Set())
  const [exportingDocs, setExportingDocs] = useState<Set<string>>(new Set())

  // Auto-scan on mount
  useEffect(() => {
    scan()
  }, [scan])

  const toggleRow = (documentId: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(documentId)) {
      newExpanded.delete(documentId)
    } else {
      newExpanded.add(documentId)
    }
    setExpandedRows(newExpanded)
  }

  const handleImport = (documentId: string) => {
    // Set this document as pending import and navigate to Import tab
    setPendingImportDocuments([documentId])
    setActiveTab('import')
  }

  const handleSync = (documentId: string, title: string) => {
    // TODO: Implement smart bi-directional sync
    alert(`Smart sync not yet implemented for "${title}".\n\nThis will sync changes in both directions (Storage ↔ Database).`)
  }

  const handleExport = async (documentId: string, title: string) => {
    // Export to Obsidian vault
    setExportingDocs(prev => new Set([...prev, documentId]))

    try {
      const result = await exportToObsidian(documentId)

      if (result.success) {
        alert(`Export started for "${title}".\n\nCheck the Jobs tab to monitor progress.`)
      } else {
        alert(`Failed to export document: ${result.error}`)
      }
    } catch (error) {
      console.error('Error exporting document:', error)
      alert('An unexpected error occurred while exporting the document')
    } finally {
      setExportingDocs(prev => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
    }
  }

  const handleDelete = async (documentId: string, title: string) => {
    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete "${title}"?\n\n` +
      'This will permanently remove:\n' +
      '• Document record\n' +
      '• All chunks and embeddings\n' +
      '• All connections\n' +
      '• All annotations and flashcards\n' +
      '• All storage files\n\n' +
      'This action cannot be undone.'
    )

    if (!confirmed) return

    // Track deletion state
    setDeletingDocs(prev => new Set([...prev, documentId]))

    try {
      const result = await deleteDocument(documentId)

      if (result.success) {
        // Remove from scan results without rescanning
        removeDocument(documentId)
      } else {
        alert(`Failed to delete document: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      alert('An unexpected error occurred while deleting the document')
    } finally {
      setDeletingDocs(prev => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
    }
  }

  const handleImportAll = () => {
    // Set all filtered documents as pending imports and navigate to Import tab
    const documentIds = filteredDocuments.map(d => d.documentId)
    setPendingImportDocuments(documentIds)
    setActiveTab('import')
  }

  const handleSyncAll = () => {
    // TODO: Implement bulk smart sync
    alert(`Bulk smart sync not yet implemented.\n\nThis will sync ${filteredDocuments.length} documents in both directions.`)
  }

  // Filter documents based on selected filter
  const filteredDocuments = scanResults?.filter((doc) => {
    if (filter === 'all') return true
    if (filter === 'missing_db') return doc.syncState === 'missing_from_db'
    if (filter === 'out_sync') return doc.syncState === 'out_of_sync'
    if (filter === 'healthy') return doc.syncState === 'healthy'
    return true
  }) || []

  // Calculate summary statistics
  const stats = {
    totalStorage: scanResults?.length || 0,
    totalDb: scanResults?.filter(d => d.inDatabase).length || 0,
    missingDb: scanResults?.filter(d => d.syncState === 'missing_from_db').length || 0,
    outOfSync: scanResults?.filter(d => d.syncState === 'out_of_sync').length || 0,
    healthy: scanResults?.filter(d => d.syncState === 'healthy').length || 0,
    missingStorage: scanResults?.filter(d => d.syncState === 'missing_from_storage').length || 0,
  }

  const getSyncStateBadge = (syncState: SyncState) => {
    const getBadgeContent = () => {
      switch (syncState) {
        case 'healthy':
          return { badge: <Badge variant="default" className="bg-green-600">Healthy</Badge>, tooltip: 'Storage and Database are in sync' }
        case 'missing_from_db':
          return { badge: <Badge variant="destructive">Missing from DB</Badge>, tooltip: 'Document exists in Storage but not in Database. Click Import to restore.' }
        case 'missing_from_storage':
          return { badge: <Badge variant="secondary" className="bg-yellow-600">Missing from Storage</Badge>, tooltip: 'Document exists in Database but Storage files are missing' }
        case 'out_of_sync':
          return { badge: <Badge variant="secondary" className="bg-orange-600">Out of Sync</Badge>, tooltip: 'Storage and Database have different chunk counts. Click Sync to update.' }
        default:
          return { badge: <Badge variant="outline">Unknown</Badge>, tooltip: 'Unknown sync status' }
      }
    }

    const { badge, tooltip } = getBadgeContent()

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Storage Scanner</h3>
          <p className="text-sm text-muted-foreground">
            Compare Storage vs Database and sync documents
          </p>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={scan}
              disabled={scanning}
            >
              {scanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Scan
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Scan Storage to compare with Database</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Summary Statistics */}
      {scanResults && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.totalStorage}</div>
            <div className="text-sm text-muted-foreground">Total in Storage</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.totalDb}</div>
            <div className="text-sm text-muted-foreground">Total in DB</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{stats.missingDb}</div>
            <div className="text-sm text-muted-foreground">Missing from DB</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.missingStorage}</div>
            <div className="text-sm text-muted-foreground">Missing from Storage</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-600">{stats.outOfSync}</div>
            <div className="text-sm text-muted-foreground">Out of Sync</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{stats.healthy}</div>
            <div className="text-sm text-muted-foreground">Healthy</div>
          </div>
        </div>
      )}

      {/* Filters */}
      {scanResults && (
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({stats.totalStorage})
          </Button>
          <Button
            variant={filter === 'missing_db' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('missing_db')}
          >
            Missing from DB ({stats.missingDb})
          </Button>
          <Button
            variant={filter === 'out_sync' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('out_sync')}
          >
            Out of Sync ({stats.outOfSync})
          </Button>
          <Button
            variant={filter === 'healthy' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('healthy')}
          >
            Healthy ({stats.healthy})
          </Button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="border border-red-200 rounded-lg p-4 bg-red-50">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {scanning && !scanResults && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!scanning && scanResults && filteredDocuments.length === 0 && (
        <div className="border rounded-lg p-8 text-center space-y-2">
          <p className="text-muted-foreground font-medium">
            {filter === 'all'
              ? 'No documents found in Storage'
              : `No documents with "${filter}" status`}
          </p>
          {filter === 'all' && (
            <p className="text-sm text-muted-foreground">
              Process a document to get started. Your processed documents will be automatically backed up to Storage.
            </p>
          )}
        </div>
      )}

      {/* Results Table */}
      {!scanning && filteredDocuments.length > 0 && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Storage Files</TableHead>
                <TableHead>DB Status</TableHead>
                <TableHead>Sync State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <React.Fragment key={doc.documentId}>
                  <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleRow(doc.documentId)}
                        >
                          {expandedRows.has(doc.documentId) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{doc.title}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {doc.storageFiles.length} files
                        </span>
                      </TableCell>
                      <TableCell>
                        {doc.inDatabase ? (
                          <span className="text-sm">
                            {doc.chunkCount !== null ? `${doc.chunkCount} chunks` : 'In DB'}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not in DB</span>
                        )}
                      </TableCell>
                      <TableCell>{getSyncStateBadge(doc.syncState)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleImport(doc.documentId)
                                }}
                              >
                                Import
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Navigate to Import tab with this document pre-selected</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSync(doc.documentId, doc.title)
                                }}
                              >
                                Sync
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Smart bi-directional sync (Storage ↔ Database)</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleExport(doc.documentId, doc.title)
                                }}
                                disabled={exportingDocs.has(doc.documentId)}
                              >
                                {exportingDocs.has(doc.documentId) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Export'
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Export to Obsidian vault</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(doc.documentId, doc.title)
                                }}
                                disabled={deletingDocs.has(doc.documentId)}
                              >
                                {deletingDocs.has(doc.documentId) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Delete document and all related data</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expandable File Details */}
                    {expandedRows.has(doc.documentId) && (
                      <TableRow key={`${doc.documentId}-expanded`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Storage Files:</h4>
                            {doc.storageFiles.length > 0 ? (
                              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                                {doc.storageFiles.map((file) => (
                                  <li key={file} className="list-disc">
                                    {file}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground ml-4">No files in Storage</p>
                            )}
                            <div className="mt-3 text-sm">
                              <p className="text-muted-foreground">
                                Document ID: <span className="font-mono text-xs">{doc.documentId}</span>
                              </p>
                              {doc.createdAt && (
                                <p className="text-muted-foreground">
                                  Created: {new Date(doc.createdAt).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bulk Actions */}
      {filteredDocuments.length > 0 && (
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={handleImportAll}
              >
                Import All ({filteredDocuments.length})
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Navigate to Import tab with all filtered documents pre-selected</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                onClick={handleSyncAll}
              >
                Sync All ({filteredDocuments.length})
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Smart bi-directional sync for all filtered documents</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      </div>
    </TooltipProvider>
  )
}
