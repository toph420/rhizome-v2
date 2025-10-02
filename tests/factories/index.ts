/**
 * Test Factory Module
 *
 * Centralized test data generation for consistent test fixtures across the codebase.
 * Each factory provides builder patterns for creating test data with sensible defaults
 * that can be overridden as needed.
 */

import { createDocumentFactory } from './document-factory'
import { createChunkFactory } from './chunk-factory'
import { createEntityFactory } from './entity-factory'
import { createProcessorFactory } from './processor-factory'
import { createUserFactory } from './user-factory'
import { createJobFactory } from './job-factory'

export const factories = {
  document: createDocumentFactory(),
  chunk: createChunkFactory(),
  entity: createEntityFactory(),
  processor: createProcessorFactory(),
  user: createUserFactory(),
  job: createJobFactory()
}

// Re-export individual factories for direct import
export { createDocumentFactory } from './document-factory'
export { createChunkFactory } from './chunk-factory'
export { createEntityFactory } from './entity-factory'
export { createProcessorFactory } from './processor-factory'
export { createUserFactory } from './user-factory'
export { createJobFactory } from './job-factory'

// Export test utilities
export * from './utils'