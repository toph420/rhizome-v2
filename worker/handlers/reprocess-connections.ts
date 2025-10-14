/**
 * Handler for reprocessing connections with user-validation preservation.
 *
 * Supports three modes:
 * - all: Delete all connections and regenerate from scratch
 * - add_new: Keep existing, add connections to newer documents (incremental)
 * - smart: Preserve user-validated connections, regenerate the rest
 *
 * See: docs/tasks/storage-first-portability.md (Task T-016)
 * Pattern reference: worker/handlers/detect-connections.ts
 */

import { createClient } from '@supabase/supabase-js';
import { processDocument } from '../engines/orchestrator';
import { saveToStorage } from '../lib/storage-helpers';

/**
 * Type definitions matching reprocessConnections Server Action
 */
type ReprocessMode = 'all' | 'add_new' | 'smart';
type EngineType = 'semantic_similarity' | 'contradiction_detection' | 'thematic_bridge';

interface ReprocessOptions {
  mode: ReprocessMode;
  engines: EngineType[];
  preserveValidated?: boolean;
  backupFirst?: boolean;
}

interface ReprocessResult {
  connectionsBefore: number;
  connectionsAfter: number;
  validatedPreserved?: number;
  backupPath?: string;
  byEngine: Record<string, number>;
}

/**
 * Main handler for reprocess-connections background jobs.
 * Regenerates connections with optional user-validation preservation.
 */
export async function reprocessConnectionsHandler(supabase: any, job: any): Promise<void> {
  const documentId = job.entity_id;
  const userId = job.user_id;
  const options: ReprocessOptions = job.input_data;

  console.log(`[ReprocessConnections] Starting for document ${documentId}`);
  console.log(`[ReprocessConnections] Mode: ${options.mode}`);
  console.log(`[ReprocessConnections] Engines: ${options.engines.join(', ')}`);

  // Helper to update progress
  async function updateProgress(percent: number, stage: string, details?: string) {
    await supabase
      .from('background_jobs')
      .update({
        progress: {
          percent,
          stage,
          details: details || `${stage}: ${percent}%`
        },
        status: 'processing'
      })
      .eq('id', job.id);
  }

  try {
    await updateProgress(10, 'preparing', 'Counting existing connections');

    // Step 1: Get current connection count (before)
    const { count: connectionsBefore, error: countError } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk_id.in.(select id from chunks where document_id='${documentId}'),target_chunk_id.in.(select id from chunks where document_id='${documentId}')`);

    if (countError) {
      throw new Error(`Failed to count connections: ${countError.message}`);
    }

    console.log(`[ReprocessConnections] Connections before: ${connectionsBefore || 0}`);

    const result: ReprocessResult = {
      connectionsBefore: connectionsBefore || 0,
      connectionsAfter: 0,
      byEngine: {}
    };

    // Step 2: Handle mode-specific logic
    if (options.mode === 'all') {
      // Reprocess All: Delete all connections and regenerate
      await updateProgress(20, 'deleting', 'Deleting all connections');

      const { error: deleteError } = await supabase
        .from('connections')
        .delete()
        .or(`source_chunk_id.in.(select id from chunks where document_id='${documentId}'),target_chunk_id.in.(select id from chunks where document_id='${documentId}')`);

      if (deleteError) {
        throw new Error(`Failed to delete connections: ${deleteError.message}`);
      }

      console.log(`[ReprocessConnections] Deleted all ${connectionsBefore || 0} connections`);

    } else if (options.mode === 'smart' && options.preserveValidated) {
      // Smart Mode: Preserve user-validated connections
      await updateProgress(15, 'querying', 'Finding validated connections');

      // Query validated connections
      const { data: validated, error: validatedError } = await supabase
        .from('connections')
        .select('*')
        .eq('user_validated', true)
        .or(`source_chunk_id.in.(select id from chunks where document_id='${documentId}'),target_chunk_id.in.(select id from chunks where document_id='${documentId}')`);

      if (validatedError) {
        throw new Error(`Failed to query validated connections: ${validatedError.message}`);
      }

      const validatedCount = validated?.length || 0;
      console.log(`[ReprocessConnections] Found ${validatedCount} validated connections`);
      result.validatedPreserved = validatedCount;

      // Backup validated connections to Storage if requested
      if (options.backupFirst && validatedCount > 0) {
        await updateProgress(20, 'backup', 'Backing up validated connections');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${userId}/${documentId}/validated-connections-${timestamp}.json`;

        await saveToStorage(supabase, backupPath, {
          version: '1.0',
          document_id: documentId,
          timestamp,
          connections: validated,
          count: validatedCount
        });

        result.backupPath = backupPath;
        console.log(`[ReprocessConnections] Backed up to: ${backupPath}`);
      }

      // Delete non-validated connections only
      await updateProgress(25, 'deleting', 'Deleting non-validated connections');

      const { error: deleteError } = await supabase
        .from('connections')
        .delete()
        .is('user_validated', null)
        .or(`source_chunk_id.in.(select id from chunks where document_id='${documentId}'),target_chunk_id.in.(select id from chunks where document_id='${documentId}')`);

      if (deleteError) {
        throw new Error(`Failed to delete non-validated connections: ${deleteError.message}`);
      }

      const deletedCount = (connectionsBefore || 0) - validatedCount;
      console.log(`[ReprocessConnections] Deleted ${deletedCount} non-validated connections`);

    } else if (options.mode === 'add_new') {
      // Add New Mode: Only process connections to newer documents
      await updateProgress(20, 'analyzing', 'Finding newer documents');

      // Get current document creation date
      const { data: currentDoc, error: docError } = await supabase
        .from('documents')
        .select('created_at')
        .eq('id', documentId)
        .single();

      if (docError || !currentDoc) {
        throw new Error(`Failed to query document: ${docError?.message || 'Not found'}`);
      }

      // Get newer documents
      const { data: newerDocs, error: newerError } = await supabase
        .from('documents')
        .select('id')
        .gt('created_at', currentDoc.created_at);

      if (newerError) {
        throw new Error(`Failed to query newer documents: ${newerError?.message}`);
      }

      console.log(`[ReprocessConnections] Found ${newerDocs?.length || 0} newer documents`);

      // Note: Current orchestrator doesn't support targetDocumentIds filter
      // This is a limitation documented in the task (line 1724)
      // For now, we'll run full reprocessing but log a warning
      if ((newerDocs?.length || 0) === 0) {
        console.log(`[ReprocessConnections] No newer documents found, skipping reprocessing`);
        await updateProgress(100, 'complete', 'No new connections to add');

        await supabase
          .from('background_jobs')
          .update({
            status: 'completed',
            output_data: {
              ...result,
              connectionsAfter: connectionsBefore || 0
            },
            completed_at: new Date().toISOString()
          })
          .eq('id', job.id);

        return;
      }

      console.log(`[ReprocessConnections] Warning: Add New mode will process all documents`);
      console.log(`[ReprocessConnections] Orchestrator enhancement needed for targetDocumentIds`);
    }

    // Step 3: Call orchestrator with selected engines
    await updateProgress(40, 'processing', 'Running connection detection engines');

    console.log(`[ReprocessConnections] Calling orchestrator with engines: ${options.engines.join(', ')}`);

    const orchestratorResult = await processDocument(documentId, {
      enabledEngines: options.engines,
      onProgress: async (percent, stage, details) => {
        // Map orchestrator progress to 40-90% range
        const mappedPercent = 40 + Math.floor((percent / 100) * 50);
        await updateProgress(mappedPercent, stage, details);
      },
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

    result.byEngine = orchestratorResult.byEngine;
    console.log(`[ReprocessConnections] Generated ${orchestratorResult.totalConnections} new connections`);
    console.log(`[ReprocessConnections] By engine:`, orchestratorResult.byEngine);

    // Step 4: Get final connection count (after)
    await updateProgress(90, 'finalizing', 'Counting final connections');

    const { count: connectionsAfter, error: countAfterError } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk_id.in.(select id from chunks where document_id='${documentId}'),target_chunk_id.in.(select id from chunks where document_id='${documentId}')`);

    if (countAfterError) {
      throw new Error(`Failed to count final connections: ${countAfterError.message}`);
    }

    result.connectionsAfter = connectionsAfter || 0;

    console.log(`[ReprocessConnections] Connections after: ${result.connectionsAfter}`);
    console.log(`[ReprocessConnections] Change: ${result.connectionsAfter - result.connectionsBefore}`);

    // Step 5: Mark job complete with statistics
    await updateProgress(100, 'complete', 'Connection reprocessing complete');

    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        progress: {
          percent: 100,
          stage: 'complete',
          details: `Reprocessed connections: ${result.connectionsBefore} → ${result.connectionsAfter}`
        },
        output_data: result,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    console.log(`[ReprocessConnections] Complete!`);

  } catch (error: any) {
    console.error('[ReprocessConnections] Handler error:', error);

    // Mark job as failed
    await supabase
      .from('background_jobs')
      .update({
        status: 'failed',
        last_error: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    throw error;
  }
}
