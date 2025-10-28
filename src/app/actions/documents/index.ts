/**
 * Document Actions - Centralized exports
 *
 * Organized by domain:
 * - upload: Document upload and processing triggers
 * - storage: Storage scanning and import operations
 * - export: Document export to ZIP bundles
 * - connections: Connection reprocessing
 * - jobs: Job status queries
 */

// Upload actions
export {
  uploadDocument,
  triggerProcessing,
  retryProcessing,
  estimateProcessingCost
} from './upload'

// Storage actions
export {
  scanStorage,
  importFromStorage
} from './storage'

// Export actions
export {
  exportDocuments
} from './export'

// Connection actions
export {
  reprocessConnections
} from './connections'

// Job actions
export {
  getDocumentJob
} from './jobs'

// Processing actions
export {
  continueDocumentProcessing,
  getJobStatus
} from './continue-processing'

// Metadata actions
export {
  updateLastViewed,
  updateDocumentMetadata
} from './metadata'

// Types
export type {
  JobProgress,
  SyncState,
  DocumentScanResult,
  ScanResult,
  ChunkExportData,
  ImportConflict,
  ConflictStrategy,
  ImportOptions,
  ImportResult,
  ReprocessMode,
  EngineType,
  ReprocessOptions,
  ReprocessResult,
  ExportFormat,
  ExportOptions,
  ExportResult
} from './types'
