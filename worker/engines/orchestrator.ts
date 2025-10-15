/**
 * Engine Orchestrator V2
 * Coordinates all 3 collision detection engines
 *
 * Execution: Sequential (can be parallelized later if needed)
 * Output: Aggregated connection results from all engines
 */

import { runSemanticSimilarity, saveChunkConnections } from './semantic-similarity';
import { runContradictionDetection } from './contradiction-detection';
import { runThematicBridge } from './thematic-bridge';
import { runThematicBridgeQwen } from './thematic-bridge-qwen';
import { ChunkConnection } from './semantic-similarity';

export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
  onProgress?: (percent: number, stage: string, details: string) => Promise<void>;
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
    onProgress
  } = config;

  console.log(`[Orchestrator] Processing document ${documentId}`);
  console.log(`[Orchestrator] Enabled engines: ${enabledEngines.join(', ')}`);

  const startTime = Date.now();
  const allConnections: ChunkConnection[] = [];
  const byEngine: Record<string, number> = {};

  // Run engines in sequence (can parallelize later if needed)
  if (enabledEngines.includes('semantic_similarity')) {
    console.log('\n[Orchestrator] Running SemanticSimilarity...');
    await onProgress?.(25, 'semantic-similarity', 'Finding semantic similarities');
    const connections = await runSemanticSimilarity(documentId, config.semanticSimilarity);
    allConnections.push(...connections);
    byEngine.semantic_similarity = connections.length;
  }

  if (enabledEngines.includes('contradiction_detection')) {
    console.log('\n[Orchestrator] Running ContradictionDetection...');
    await onProgress?.(50, 'contradiction-detection', 'Detecting contradictions');
    const connections = await runContradictionDetection(documentId, config.contradictionDetection);
    allConnections.push(...connections);
    byEngine.contradiction_detection = connections.length;
  }

  if (enabledEngines.includes('thematic_bridge')) {
    console.log('\n[Orchestrator] Running ThematicBridge...');
    await onProgress?.(75, 'thematic-bridge', 'Finding thematic bridges');

    // Use Qwen for local mode, Gemini otherwise
    const useLocalMode = process.env.PROCESSING_MODE === 'local';
    console.log(`[Orchestrator] ThematicBridge mode: ${useLocalMode ? 'LOCAL (Qwen)' : 'CLOUD (Gemini)'}`);

    const connections = useLocalMode
      ? await runThematicBridgeQwen(documentId, config.thematicBridge, onProgress)
      : await runThematicBridge(documentId, config.thematicBridge, onProgress);

    allConnections.push(...connections);
    byEngine.thematic_bridge = connections.length;
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
