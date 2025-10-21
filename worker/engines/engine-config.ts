/**
 * Default engine configuration for collision detection orchestrator.
 *
 * Consolidates duplicate engine config from detect-connections and reprocess-connections handlers.
 * Single source of truth for engine thresholds and parameters.
 */

/**
 * Default configuration for Semantic Similarity engine.
 *
 * Finds connections based on embedding vector similarity.
 * Weight: 25% of all connections
 */
export const DEFAULT_SEMANTIC_CONFIG = {
  threshold: 0.7,              // Minimum cosine similarity (0-1)
  maxResultsPerChunk: 50,      // Max connections per chunk
  crossDocumentOnly: true      // Only connect across documents
} as const

/**
 * Default configuration for Contradiction Detection engine.
 *
 * Finds conceptual tensions and opposing viewpoints.
 * Weight: 40% of all connections (highest)
 */
export const DEFAULT_CONTRADICTION_CONFIG = {
  minConceptOverlap: 0.5,      // Minimum conceptual overlap (0-1)
  polarityThreshold: 0.3,      // Minimum polarity difference (0-1)
  maxResultsPerChunk: 20,      // Max connections per chunk
  crossDocumentOnly: true      // Only connect across documents
} as const

/**
 * Default configuration for Thematic Bridge engine.
 *
 * Finds cross-domain conceptual bridges using AI.
 * Weight: 35% of all connections
 */
export const DEFAULT_THEMATIC_CONFIG = {
  minImportance: 0.6,          // Minimum connection importance (0-1)
  minStrength: 0.6,            // Minimum connection strength (0-1)
  maxSourceChunks: 50,         // Max source chunks to process
  maxCandidatesPerSource: 10,  // Max candidates per source chunk
  batchSize: 5                 // Batch size for AI calls
} as const

/**
 * Complete default engine configuration.
 * Use this as base config when calling processDocument().
 *
 * @example
 * ```typescript
 * import { DEFAULT_ENGINE_CONFIG } from '../engines/engine-config'
 *
 * const result = await processDocument(documentId, {
 *   enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
 *   ...DEFAULT_ENGINE_CONFIG,
 *   onProgress: (percent, stage, details) => { ... }
 * })
 * ```
 */
export const DEFAULT_ENGINE_CONFIG = {
  semanticSimilarity: DEFAULT_SEMANTIC_CONFIG,
  contradictionDetection: DEFAULT_CONTRADICTION_CONFIG,
  thematicBridge: DEFAULT_THEMATIC_CONFIG
} as const

/**
 * Type definition for engine configuration.
 * Useful for type-safe config overrides.
 */
export type EngineConfig = typeof DEFAULT_ENGINE_CONFIG
