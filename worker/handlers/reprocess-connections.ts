/**
 * Handler for reprocessing connections with user-validation preservation.
 *
 * Supports three modes:
 * - all: Delete all connections and regenerate from scratch
 * - add_new: Keep existing, add connections to newer documents (incremental)
 * - smart: Preserve user-validated connections, regenerate the rest
 *
 * See: docs/tasks/storage-first-portability.md (Task T-016)
 * REFACTORED: Now uses HandlerJobManager and DEFAULT_ENGINE_CONFIG
 */

import { createClient } from '@supabase/supabase-js';
import { processDocument } from '../engines/orchestrator';
import { saveToStorage } from '../lib/storage-helpers';
import { HandlerJobManager } from '../lib/handler-job-manager';
import { DEFAULT_ENGINE_CONFIG } from '../engines/engine-config';

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
 *
 * REFACTORED: Now uses HandlerJobManager and DEFAULT_ENGINE_CONFIG
 */
export async function reprocessConnectionsHandler(supabase: any, job: any): Promise<void> {
  const documentId = job.entity_id;
  const userId = job.user_id;
  const options: ReprocessOptions = job.input_data;
  const jobManager = new HandlerJobManager(supabase, job.id);

  console.log(`[ReprocessConnections] Starting for document ${documentId}`);
  console.log(`[ReprocessConnections] Mode: ${options.mode}`);
  console.log(`[ReprocessConnections] Engines: ${options.engines.join(', ')}`);

  try {
    await jobManager.updateProgress(10, 'preparing', 'Counting existing connections');

    // Step 1: Get chunk IDs for this document
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', documentId);

    if (chunksError) {
      throw new Error(`Failed to query chunks: ${chunksError.message}`);
    }

    const chunkIds = chunks?.map((c: any) => c.id) || [];
    console.log(`[ReprocessConnections] Found ${chunkIds.length} chunks for document`);

    if (chunkIds.length === 0) {
      throw new Error('No chunks found for document');
    }

    // Step 2: Get current connection count (before)
    const { count: connectionsBefore, error: countError } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`);

    if (countError) {
      throw new Error(`Failed to count connections: ${countError.message}`);
    }

    console.log(`[ReprocessConnections] Connections before: ${connectionsBefore || 0}`);

    const result: ReprocessResult = {
      connectionsBefore: connectionsBefore || 0,
      connectionsAfter: 0,
      byEngine: {}
    };

    // Track target document IDs for Add New mode
    let targetDocumentIds: string[] | undefined;

    // Step 3: Handle mode-specific logic
    if (options.mode === 'all') {
      // Reprocess All: Delete all connections and regenerate
      await jobManager.updateProgress(20, 'deleting', 'Deleting all connections');

      const { error: deleteError } = await supabase
        .from('connections')
        .delete()
        .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`);

      if (deleteError) {
        throw new Error(`Failed to delete connections: ${deleteError.message}`);
      }

      console.log(`[ReprocessConnections] Deleted all ${connectionsBefore || 0} connections`);

    } else if (options.mode === 'smart' && options.preserveValidated) {
      // Smart Mode: Preserve user-validated connections
      await jobManager.updateProgress(15, 'querying', 'Finding validated connections');

      // Query validated connections
      const { data: validated, error: validatedError } = await supabase
        .from('connections')
        .select('*')
        .eq('user_validated', true)
        .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`);

      if (validatedError) {
        throw new Error(`Failed to query validated connections: ${validatedError.message}`);
      }

      const validatedCount = validated?.length || 0;
      console.log(`[ReprocessConnections] Found ${validatedCount} validated connections`);
      result.validatedPreserved = validatedCount;

      // Backup validated connections to Storage if requested
      if (options.backupFirst && validatedCount > 0) {
        await jobManager.updateProgress(20, 'backup', 'Backing up validated connections');

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
      await jobManager.updateProgress(25, 'deleting', 'Deleting non-validated connections');

      const { error: deleteError } = await supabase
        .from('connections')
        .delete()
        .is('user_validated', null)
        .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`);

      if (deleteError) {
        throw new Error(`Failed to delete non-validated connections: ${deleteError.message}`);
      }

      const deletedCount = (connectionsBefore || 0) - validatedCount;
      console.log(`[ReprocessConnections] Deleted ${deletedCount} non-validated connections`);

    } else if (options.mode === 'add_new') {
      // Add New Mode: Only process connections to newer documents
      await jobManager.updateProgress(20, 'analyzing', 'Finding newer documents');

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

      if ((newerDocs?.length || 0) === 0) {
        console.log(`[ReprocessConnections] No newer documents found, skipping reprocessing`);

        await jobManager.markComplete(
          {
            ...result,
            connectionsAfter: connectionsBefore || 0
          },
          'No new connections to add'
        );

        return;
      }

      // Set target document IDs for orchestrator filtering
      const newerDocIds = newerDocs!.map((d: any) => d.id);
      targetDocumentIds = newerDocIds;
      console.log(`[ReprocessConnections] Add New mode: filtering to ${newerDocIds.length} newer documents`);
    }

    // Step 3: Call orchestrator with selected engines
    await jobManager.updateProgress(40, 'processing', 'Running connection detection engines');

    console.log(`[ReprocessConnections] Calling orchestrator with engines: ${options.engines.join(', ')}`);
    if (targetDocumentIds) {
      console.log(`[ReprocessConnections] Filtering connections to ${targetDocumentIds.length} target documents`);
    }

    const orchestratorResult = await processDocument(documentId, {
      enabledEngines: options.engines,
      targetDocumentIds,  // Pass filter for Add New mode
      onProgress: async (percent, stage, details) => {
        // Map orchestrator progress to 40-90% range
        const mappedPercent = 40 + Math.floor((percent / 100) * 50);
        await jobManager.updateProgress(mappedPercent, stage, details);
      },
      ...DEFAULT_ENGINE_CONFIG
    });

    result.byEngine = orchestratorResult.byEngine;
    console.log(`[ReprocessConnections] Generated ${orchestratorResult.totalConnections} new connections`);
    console.log(`[ReprocessConnections] By engine:`, orchestratorResult.byEngine);

    // Step 4: Get final connection count (after)
    await jobManager.updateProgress(90, 'finalizing', 'Counting final connections');

    const { count: connectionsAfter, error: countAfterError } = await supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .or(`source_chunk_id.in.(${chunkIds.join(',')}),target_chunk_id.in.(${chunkIds.join(',')})`);

    if (countAfterError) {
      throw new Error(`Failed to count final connections: ${countAfterError.message}`);
    }

    result.connectionsAfter = connectionsAfter || 0;

    console.log(`[ReprocessConnections] Connections after: ${result.connectionsAfter}`);
    console.log(`[ReprocessConnections] Change: ${result.connectionsAfter - result.connectionsBefore}`);

    // Step 5: Mark job complete with statistics
    await jobManager.markComplete(
      result,
      `Reprocessed connections: ${result.connectionsBefore} → ${result.connectionsAfter}`
    );

    console.log(`[ReprocessConnections] Complete!`);

  } catch (error: any) {
    console.error('[ReprocessConnections] Handler error:', error);
    await jobManager.markFailed(error);
    throw error;
  }
}
