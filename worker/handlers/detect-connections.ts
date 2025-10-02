/**
 * Handler for detecting connections between chunks using the 3-engine collision detection system.
 * This is the main entry point for collision detection requests.
 */

import { createClient } from '@supabase/supabase-js';
import { processDocument } from '../engines/orchestrator';

/**
 * Simplified handler - uses function-based orchestrator from orchestrator.ts
 */

/**
 * Main handler for detect-connections background jobs.
 * Processes document through all 3 engines using the function-based orchestrator.
 */
export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_count, trigger } = job.input_data;

  console.log(`[DetectConnections] Starting handler for document ${document_id} with ${chunk_count} chunks (${trigger})`);

  try {
    // Use the function-based orchestrator to process the document
    const result = await processDocument(document_id, {
      enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge'],
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

    // Update job with success result
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          success: true,
          document_id,
          totalConnections: result.totalConnections,
          byEngine: result.byEngine,
          executionTime: result.executionTime
        },
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

  } catch (error: any) {
    console.error('[DetectConnections] Handler error:', error);

    // Mark job as failed
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        output_data: {
          success: false,
          document_id,
          error: error.message
        },
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    throw error;
  }
}