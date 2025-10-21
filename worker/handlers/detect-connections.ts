/**
 * Handler for detecting connections between chunks using the 3-engine collision detection system.
 * This is the main entry point for collision detection requests.
 */

import { createClient } from '@supabase/supabase-js';
import { processDocument } from '../engines/orchestrator';
import { HandlerJobManager } from '../lib/handler-job-manager';

/**
 * Simplified handler - uses function-based orchestrator from orchestrator.ts
 * REFACTORED: Now uses HandlerJobManager for standardized job state management
 */

/**
 * Main handler for detect-connections background jobs.
 * Processes document through all 3 engines using the function-based orchestrator.
 */
export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_count, trigger } = job.input_data;
  const jobManager = new HandlerJobManager(supabase, job.id);

  console.log(`[DetectConnections] Starting handler for document ${document_id} with ${chunk_count} chunks (${trigger})`);

  try {
    await jobManager.updateProgress(0, 'detect-connections', 'Starting connection detection');

    // Use the function-based orchestrator to process the document
    const result = await processDocument(document_id, {
      enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
      onProgress: (percent, stage, details) => jobManager.updateProgress(percent, stage, details),
      semanticSimilarity: {
        threshold: 0.7,
        maxResultsPerChunk: 50,
        crossDocumentOnly: true
      },
      contradictionDetection: {
        minConceptOverlap: 0.5,
        polarityThreshold: 0.3,
        maxResultsPerChunk: 20,
        crossDocumentOnly: true
      },
      thematicBridge: {
        minImportance: 0.6,
        minStrength: 0.6,
        maxSourceChunks: 50,
        maxCandidatesPerSource: 10,
        batchSize: 5
      }
    });

    console.log(`[DetectConnections] Successfully created ${result.totalConnections} connections`);
    console.log(`[DetectConnections] Breakdown:`, result.byEngine);

    // Mark job as complete with output data
    await jobManager.markComplete(
      {
        success: true,
        totalConnections: result.totalConnections,
        byEngine: result.byEngine
      },
      `Found ${result.totalConnections} connections`
    );

  } catch (error: any) {
    console.error('[DetectConnections] Handler error:', error);
    await jobManager.markFailed(error);
    throw error;
  }
}