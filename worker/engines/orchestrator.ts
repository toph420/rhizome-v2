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
import { ChunkConnection } from './semantic-similarity';

export interface OrchestratorConfig {
  enabledEngines?: ('semantic_similarity' | 'contradiction_detection' | 'thematic_bridge')[];
  semanticSimilarity?: any;
  contradictionDetection?: any;
  thematicBridge?: any;
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
    enabledEngines = ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
  } = config;

  console.log(`[Orchestrator] Processing document ${documentId}`);
  console.log(`[Orchestrator] Enabled engines: ${enabledEngines.join(', ')}`);

  const startTime = Date.now();
  const allConnections: ChunkConnection[] = [];
  const byEngine: Record<string, number> = {};

  // Run engines in sequence (can parallelize later if needed)
  if (enabledEngines.includes('semantic_similarity')) {
    console.log('\n[Orchestrator] Running SemanticSimilarity...');
    const connections = await runSemanticSimilarity(documentId, config.semanticSimilarity);
    allConnections.push(...connections);
    byEngine.semantic_similarity = connections.length;
  }

  if (enabledEngines.includes('contradiction_detection')) {
    console.log('\n[Orchestrator] Running ContradictionDetection...');
    const connections = await runContradictionDetection(documentId, config.contradictionDetection);
    allConnections.push(...connections);
    byEngine.contradiction_detection = connections.length;
  }

  if (enabledEngines.includes('thematic_bridge')) {
    console.log('\n[Orchestrator] Running ThematicBridge...');
    const connections = await runThematicBridge(documentId, config.thematicBridge);
    allConnections.push(...connections);
    byEngine.thematic_bridge = connections.length;
  }

  // Save all connections
  console.log(`\n[Orchestrator] Saving ${allConnections.length} total connections...`);
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
