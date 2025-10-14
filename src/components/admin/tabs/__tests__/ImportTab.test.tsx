/**
 * Component Tests - ImportTab
 *
 * Tests import workflow from Storage with conflict resolution.
 * Validates document selection, import options, job tracking, and progress display.
 *
 * See: docs/tasks/storage-first-portability.md (T-014)
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportTab } from '../ImportTab'
import type { DocumentScanResult } from '@/app/actions/documents'
import * as documentsActions from '@/app/actions/documents'

// Mock the actions
jest.mock('@/app/actions/documents', () => ({
  scanStorage: jest.fn(),
  importFromStorage: jest.fn(),
}))

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({
            data: { status: 'processing', progress: 50, details: 'Processing...' },
            error: null,
          })),
        })),
      })),
    })),
  })),
}))

const mockScanStorage = documentsActions.scanStorage as jest.MockedFunction<
  typeof documentsActions.scanStorage
>

const mockImportFromStorage = documentsActions.importFromStorage as jest.MockedFunction<
  typeof documentsActions.importFromStorage
>

describe('ImportTab', () => {
  const mockDocuments: DocumentScanResult[] = [
    {
      documentId: 'doc-1',
      title: 'Document 1',
      storageFiles: ['chunks.json', 'metadata.json', 'manifest.json'],
      inDatabase: false,
      chunkCount: null,
      syncState: 'missing_from_db',
      createdAt: null,
    },
    {
      documentId: 'doc-2',
      title: 'Document 2',
      storageFiles: ['chunks.json', 'metadata.json'],
      inDatabase: true,
      chunkCount: 150,
      syncState: 'out_of_sync',
      createdAt: '2025-10-10T12:00:00Z',
    },
    {
      documentId: 'doc-3',
      title: 'Document 3',
      storageFiles: ['chunks.json'],
      inDatabase: true,
      chunkCount: 200,
      syncState: 'healthy',
      createdAt: '2025-10-12T15:30:00Z',
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockScanStorage.mockResolvedValue({
      success: true,
      documents: mockDocuments,
    })
  })

  describe('Initialization', () => {
    it('should auto-scan on mount', async () => {
      render(<ImportTab />)

      await waitFor(() => {
        expect(mockScanStorage).toHaveBeenCalled()
      })
    })

    it('should show loading state during initial scan', () => {
      mockScanStorage.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ success: true, documents: mockDocuments }),
              100
            )
          )
      )

      render(<ImportTab />)

      // Should show loading spinner (Loader2 component)
      expect(screen.getByText(/Refresh List/i).closest('button')).toBeInTheDocument()
    })

    it('should display scan error if scan fails', async () => {
      mockScanStorage.mockResolvedValue({
        success: false,
        documents: [],
        error: 'Failed to connect to Storage',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText(/Failed to connect to Storage/i)).toBeInTheDocument()
      })
    })
  })

  describe('Scenario 1: Import single document without conflict', () => {
    it('should list importable documents', async () => {
      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
        expect(screen.getByText('Document 2')).toBeInTheDocument()
        // Document 3 is healthy, still importable
        expect(screen.getByText('Document 3')).toBeInTheDocument()
      })
    })

    it('should allow selecting a single document', async () => {
      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Click checkbox for Document 1
      const checkboxes = screen.getAllByRole('checkbox')
      const doc1Checkbox = checkboxes[1] // First checkbox is "select all"
      fireEvent.click(doc1Checkbox)

      // Should update selection count
      expect(screen.getByText('1 document(s) selected')).toBeInTheDocument()
    })

    it('should trigger import and show progress', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: true,
        jobId: 'job-123',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select Document 1
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      // Click Import button
      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Should call importFromStorage
      await waitFor(() => {
        expect(mockImportFromStorage).toHaveBeenCalledWith('doc-1', {
          regenerateEmbeddings: false,
          reprocessConnections: false,
        })
      })

      // Should show progress section
      await waitFor(() => {
        expect(screen.getByText('Import Progress')).toBeInTheDocument()
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })
    })

    it('should display success message after import completes', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: true,
        jobId: 'job-123',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Wait for import to complete
      await waitFor(() => {
        expect(screen.getByText(/Successfully imported/i)).toBeInTheDocument()
      })
    })
  })

  describe('Scenario 2: Import with conflict', () => {
    it('should detect conflict and show ConflictResolutionDialog', async () => {
      const mockConflict = {
        documentId: 'doc-2',
        existingChunkCount: 150,
        importChunkCount: 200,
        existingProcessedAt: '2025-10-10T12:00:00Z',
        importProcessedAt: '2025-10-12T15:30:00Z',
        sampleChunks: {
          existing: [],
          import: [],
        },
      }

      mockImportFromStorage.mockResolvedValue({
        success: false,
        needsResolution: true,
        conflict: mockConflict,
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 2')).toBeInTheDocument()
      })

      // Select Document 2 (out of sync)
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[2]) // Second document

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Should show conflict dialog
      await waitFor(() => {
        expect(screen.getByText('Import Conflict Detected')).toBeInTheDocument()
      })
    })

    it('should continue import after conflict resolution', async () => {
      const mockConflict = {
        documentId: 'doc-2',
        existingChunkCount: 150,
        importChunkCount: 200,
        existingProcessedAt: '2025-10-10T12:00:00Z',
        importProcessedAt: '2025-10-12T15:30:00Z',
        sampleChunks: {
          existing: [],
          import: [],
        },
      }

      // First call returns conflict, second call after resolution succeeds
      mockImportFromStorage
        .mockResolvedValueOnce({
          success: false,
          needsResolution: true,
          conflict: mockConflict,
        })
        .mockResolvedValueOnce({
          success: true,
          jobId: 'job-456',
        })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 2')).toBeInTheDocument()
      })

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[2])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Wait for conflict dialog
      await waitFor(() => {
        expect(screen.getByText('Import Conflict Detected')).toBeInTheDocument()
      })

      // Apply resolution (default merge_smart)
      const applyButton = screen.getByText('Apply Resolution')
      fireEvent.click(applyButton)

      // Should continue import after resolution
      await waitFor(() => {
        expect(mockImportFromStorage).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Scenario 3: Batch import', () => {
    it('should allow selecting multiple documents', async () => {
      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select all checkbox
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0]) // Select all

      // Should show all documents selected
      expect(screen.getByText('3 document(s) selected')).toBeInTheDocument()
    })

    it('should process multiple documents sequentially', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: true,
        jobId: 'job-123',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select all
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[0])

      // Click import
      const importButton = screen.getByText(/Import Selected \(3\)/i)
      fireEvent.click(importButton)

      // Should call importFromStorage for each document
      await waitFor(() => {
        expect(mockImportFromStorage).toHaveBeenCalledTimes(3)
        expect(mockImportFromStorage).toHaveBeenCalledWith('doc-1', expect.any(Object))
        expect(mockImportFromStorage).toHaveBeenCalledWith('doc-2', expect.any(Object))
        expect(mockImportFromStorage).toHaveBeenCalledWith('doc-3', expect.any(Object))
      })
    })
  })

  describe('Scenario 4: Import with options', () => {
    it('should show import options checkboxes', async () => {
      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Import Options')).toBeInTheDocument()
      })

      expect(screen.getByLabelText(/Regenerate Embeddings/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Reprocess Connections/i)).toBeInTheDocument()
    })

    it('should pass regenerateEmbeddings option to import', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: true,
        jobId: 'job-123',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Enable regenerate embeddings
      const embeddingsCheckbox = screen.getByLabelText(/Regenerate Embeddings/i)
      fireEvent.click(embeddingsCheckbox)

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Should pass option
      await waitFor(() => {
        expect(mockImportFromStorage).toHaveBeenCalledWith('doc-1', {
          regenerateEmbeddings: true,
          reprocessConnections: false,
        })
      })
    })

    it('should pass reprocessConnections option to import', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: true,
        jobId: 'job-123',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Enable reprocess connections
      const connectionsCheckbox = screen.getByLabelText(/Reprocess Connections/i)
      fireEvent.click(connectionsCheckbox)

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Should pass option
      await waitFor(() => {
        expect(mockImportFromStorage).toHaveBeenCalledWith('doc-1', {
          regenerateEmbeddings: false,
          reprocessConnections: true,
        })
      })
    })
  })

  describe('UI States', () => {
    it('should disable controls during import', async () => {
      mockImportFromStorage.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true, jobId: 'job-123' }), 100)
          )
      )

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // During import, checkboxes and options should be disabled
      await waitFor(() => {
        expect(checkboxes[0]).toBeDisabled() // Select all
        expect(checkboxes[1]).toBeDisabled() // Doc checkbox
        expect(screen.getByLabelText(/Regenerate Embeddings/i)).toBeDisabled()
        expect(screen.getByLabelText(/Reprocess Connections/i)).toBeDisabled()
      })
    })

    it('should show empty state when no importable documents', async () => {
      mockScanStorage.mockResolvedValue({
        success: true,
        documents: [],
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(
          screen.getByText(/No importable documents found in Storage/i)
        ).toBeInTheDocument()
        expect(
          screen.getByText(/Documents must have chunks.json/i)
        ).toBeInTheDocument()
      })
    })

    it('should show refresh button that re-scans storage', async () => {
      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Clear mock calls
      mockScanStorage.mockClear()

      // Click refresh
      const refreshButton = screen.getByText(/Refresh List/i)
      fireEvent.click(refreshButton)

      await waitFor(() => {
        expect(mockScanStorage).toHaveBeenCalled()
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle import failure and show error message', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: false,
        error: 'chunks.json not found',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Should show error in progress section
      await waitFor(() => {
        expect(screen.getByText(/chunks.json not found/i)).toBeInTheDocument()
      })
    })

    it('should show partial success message when some imports fail', async () => {
      // First import succeeds, second fails
      mockImportFromStorage
        .mockResolvedValueOnce({ success: true, jobId: 'job-1' })
        .mockResolvedValueOnce({ success: false, error: 'Import failed' })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select first two documents
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])
      fireEvent.click(checkboxes[2])

      const importButton = screen.getByText(/Import Selected \(2\)/i)
      fireEvent.click(importButton)

      // Should show mixed result message
      await waitFor(() => {
        expect(screen.getByText(/Imported 1 document\(s\), 1 failed/i)).toBeInTheDocument()
      })
    })
  })

  describe('Job Progress Tracking', () => {
    it('should display import progress for each job', async () => {
      mockImportFromStorage.mockResolvedValue({
        success: true,
        jobId: 'job-123',
      })

      render(<ImportTab />)

      await waitFor(() => {
        expect(screen.getByText('Document 1')).toBeInTheDocument()
      })

      // Select and import
      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const importButton = screen.getByText(/Import Selected \(1\)/i)
      fireEvent.click(importButton)

      // Should show progress section with job details
      await waitFor(() => {
        expect(screen.getByText('Import Progress')).toBeInTheDocument()
        // Should show status badge
        const badges = screen.getAllByText(/processing|pending/i)
        expect(badges.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Filter and Selection', () => {
    it('should only show documents with chunks.json', async () => {
      const docsWithoutChunks: DocumentScanResult[] = [
        {
          documentId: 'doc-no-chunks',
          title: 'No Chunks Doc',
          storageFiles: ['metadata.json'],
          inDatabase: false,
          chunkCount: null,
          syncState: 'missing_from_db',
          createdAt: null,
        },
      ]

      mockScanStorage.mockResolvedValue({
        success: true,
        documents: docsWithoutChunks,
      })

      render(<ImportTab />)

      await waitFor(() => {
        // Should show empty state because no chunks.json
        expect(
          screen.getByText(/No importable documents found/i)
        ).toBeInTheDocument()
      })
    })
  })
})
