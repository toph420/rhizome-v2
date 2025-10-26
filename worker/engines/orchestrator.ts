/**
 * Engine Orchestrator V3 (Registry-based)
 * Coordinates all 3 collision detection engines using EngineRegistry pattern
 *
 * Execution: Sequential (can be parallelized later if needed)
 * Output: Aggregated connection results from all engines
 *
 * Changes from V2:
 * - Uses EngineRegistry instead of hard-coded imports
 * - Engines are retrieved dynamically from registry
 * - Easy to add/remove/swap engines without changing orchestrator code
 */

import { engineRegistry } from './engine-registry'
import { saveChunkConnections } from './semantic-similarity'
import { ChunkConnection } from './semantic-similarity'
import { DEFAULT_ENGINE_CONFIG } from './engine-config'

export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  sourceChunkIds?: string[];  // NEW: Filter connections to these source chunks only
  targetDocumentIds?: string[];  // Filter connections to specific target documents (for Add New mode)
  reprocessingBatch?: string;  // Reprocessing batch ID to query correct chunks during reprocessing
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
  onProgress?: (percent: number, stage: string, details?: string) => Promise<void>;
}

export interface OrchestratorResult {
  totalConnections: number;
  byEngine: Record<string, number>;
  executionTime: number;
}

/**
 * Process a document through all enabled collision detection engines
 *
 * @param documentId - Document to process
 * @param config - Configuration for orchestrator and individual engines
 * @returns Aggregated results from all engines
 */
export async function processDocument(
  documentId: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const {
    enabledEngines = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
    sourceChunkIds,  // NEW
    targetDocumentIds,
    reprocessingBatch,
    onProgress
  } = config;

  console.log(`[Orchestrator] Processing document ${documentId}`);
  console.log(`[Orchestrator] Enabled engines: ${enabledEngines.join(', ')}`);

  // NEW: Log chunk filtering
  if (sourceChunkIds) {
    console.log(`[Orchestrator] Per-chunk mode: ${sourceChunkIds.length} source chunks`)
  }
  if (targetDocumentIds && targetDocumentIds.length > 0) {
    console.log(`[Orchestrator] Filtering to ${targetDocumentIds.length} target document(s)`);
  }

  const startTime = Date.now();
  const allConnections: ChunkConnection[] = [];
  const byEngine: Record<string, number> = {};

  // Progress stages for each engine (distribute 0-90% across engines)
  const progressStages = {
    'semantic_similarity': { start: 0, end: 30, label: 'Finding semantic similarities' },
    'contradiction_detection': { start: 30, end: 60, label: 'Detecting contradictions' },
    'thematic_bridge': { start: 60, end: 90, label: 'Finding thematic bridges' },
  }

  // Run engines in sequence using registry
  for (const engineName of enabledEngines) {
    console.log(`\n[Orchestrator] Running ${engineName}...`)

    // Get engine from registry
    const engine = engineRegistry.get(engineName)

    // Update progress
    const stage = progressStages[engineName]
    if (stage) {
      await onProgress?.(stage.start, engineName.replace('_', '-'), stage.label)
    }

    // Prepare engine-specific config (UPDATED)
    const engineConfig: any = {
      sourceChunkIds,  // NEW: Engines will filter source chunks
      targetDocumentIds,
      reprocessingBatch,
      ...DEFAULT_ENGINE_CONFIG[engineName as keyof typeof DEFAULT_ENGINE_CONFIG],
      ...config[engineName as keyof OrchestratorConfig],
    }

    // Run engine
    const connections = await engine.run(documentId, engineConfig, onProgress)

    // Aggregate results
    allConnections.push(...connections)
    byEngine[engineName] = connections.length

    console.log(`[Orchestrator] ${engineName}: Found ${connections.length} connections`)
  }

  // Debug: Check for duplicates before saving
  const connectionKeys = allConnections.map(c =>
    `${c.source_chunk_id}→${c.target_chunk_id}:${c.connection_type}`
  );

  const seen = new Set<string>();
  const duplicates = connectionKeys.filter(key => {
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });

  if (duplicates.length > 0) {
    console.log('[Orchestrator] ⚠️  Duplicate connections detected BEFORE database insert:');
    console.log(`[Orchestrator] Total: ${allConnections.length}, Unique: ${seen.size}, Duplicates: ${duplicates.length}`);

    // Show first 5 duplicates with full details
    const dupeExamples = duplicates.slice(0, 5).map(key => {
      const matches = allConnections.filter(c =>
        `${c.source_chunk_id}→${c.target_chunk_id}:${c.connection_type}` === key
      );
      return {
        key,
        count: matches.length,
        strengths: matches.map(m => m.strength),
        engines: matches.map(m => m.connection_type)
      };
    });

    console.log('[Orchestrator] Example duplicates:', JSON.stringify(dupeExamples, null, 2));
  } else {
    console.log('[Orchestrator] ✅ No duplicates detected in connections array');
  }

  // Save all connections
  console.log(`\n[Orchestrator] Saving ${allConnections.length} total connections...`);
  await onProgress?.(90, 'saving', 'Saving connections to database');
  await saveChunkConnections(allConnections);

  const executionTime = Date.now() - startTime;

  console.log('[Orchestrator] Complete!');
  console.log(`[Orchestrator] Total execution time: ${(executionTime / 1000).toFixed(1)}s`);

  return {
    totalConnections: allConnections.length,
    byEngine,
    executionTime
  };
}
