/**
 * Simple wrapper classes for existing function-based engines.
 *
 * These wrappers provide a consistent interface for the EngineRegistry
 * while calling the existing engine functions unchanged.
 *
 * This allows us to use the registry pattern without refactoring
 * the actual engine implementations.
 */

import {
  runSemanticSimilarity,
  ChunkConnection,
  SemanticSimilarityConfig,
} from './semantic-similarity'
import {
  runContradictionDetection,
  ContradictionDetectionConfig,
} from './contradiction-detection'
import {
  runThematicBridge,
  ThematicBridgeConfig,
} from './thematic-bridge'
import {
  runThematicBridgeQwen,
} from './thematic-bridge-qwen'

/**
 * Simplified engine interface for document-level processing.
 * Each engine processes an entire document and returns connections.
 */
export interface DocumentEngine {
  name: string
  run(
    documentId: string,
    config: any,
    onProgress?: (percent: number, stage: string, details?: string) => Promise<void>
  ): Promise<ChunkConnection[]>
  cleanup?(): Promise<void>
}

/**
 * Wrapper for Semantic Similarity engine.
 */
export class SemanticSimilarityEngine implements DocumentEngine {
  readonly name = 'semantic_similarity'

  async run(
    documentId: string,
    config: SemanticSimilarityConfig = {},
    onProgress?: (percent: number, stage: string, details: string) => Promise<void>
  ): Promise<ChunkConnection[]> {
    return await runSemanticSimilarity(documentId, config)
  }
}

/**
 * Wrapper for Contradiction Detection engine.
 */
export class ContradictionDetectionEngine implements DocumentEngine {
  readonly name = 'contradiction_detection'

  async run(
    documentId: string,
    config: ContradictionDetectionConfig = {},
    onProgress?: (percent: number, stage: string, details: string) => Promise<void>
  ): Promise<ChunkConnection[]> {
    return await runContradictionDetection(documentId, config)
  }
}

/**
 * Wrapper for Thematic Bridge engine.
 * Automatically selects Qwen (local) or Gemini (cloud) based on PROCESSING_MODE.
 */
export class ThematicBridgeEngine implements DocumentEngine {
  readonly name = 'thematic_bridge'
  private useLocalMode: boolean

  constructor() {
    this.useLocalMode = process.env.PROCESSING_MODE === 'local'
  }

  async run(
    documentId: string,
    config: ThematicBridgeConfig = {},
    onProgress?: (percent: number, stage: string, details?: string) => Promise<void>
  ): Promise<ChunkConnection[]> {
    if (this.useLocalMode) {
      console.log(`[ThematicBridge] Using LOCAL mode (Qwen)`)
      return await runThematicBridgeQwen(documentId, config, onProgress)
    } else {
      console.log(`[ThematicBridge] Using CLOUD mode (Gemini)`)
      return await runThematicBridge(documentId, config, onProgress)
    }
  }
}

/**
 * Initialize and register all engines in the global registry.
 * Call this once at worker startup.
 */
export function registerAllEngines(registry: any): void {
  registry.register('semantic_similarity', new SemanticSimilarityEngine())
  registry.register('contradiction_detection', new ContradictionDetectionEngine())
  registry.register('thematic_bridge', new ThematicBridgeEngine())

  console.log(`[EngineAdapters] Registered ${registry.count()} engines`)
}
