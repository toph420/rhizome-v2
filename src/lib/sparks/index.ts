// Re-export all types
export type {
  SparkComponent,
  SparkConnection,
  SparkContext,
  SparkStorageJson,
  SparkCacheRow
} from './types'

// Re-export all storage functions
export {
  uploadSparkToStorage,
  downloadSparkFromStorage,
  listUserSparks,
  verifySparksIntegrity,
  verifyCacheFreshness
} from './storage'

// Re-export all connection functions
export {
  extractChunkIds,
  extractTags,
  getInheritedConnections,
  buildSparkConnections
} from './connections'
