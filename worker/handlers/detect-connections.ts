/**
 * Handler for detecting connections between chunks using the 3-engine collision detection system.
 * This is the main entry point for collision detection requests.
 */

import { createClient } from '@supabase/supabase-js';
import { CollisionOrchestrator } from '../engines/orchestrator';
import { SemanticSimilarityEngine } from '../engines/semantic-similarity';
import { ContradictionDetectionEngine } from '../engines/contradiction-detection';
import { ThematicBridgeEngine } from '../engines/thematic-bridge';
import {
  CollisionDetectionInput,
  AggregatedResults,
  EngineType,
  WeightConfig,
} from '../engines/types';

// Supabase client will be initialized when needed

// Global orchestrator instance (reused across requests)
let orchestrator: CollisionOrchestrator | null = null;

/**
 * Initializes the orchestrator with the 3-engine system.
 */
function initializeOrchestrator(weights?: WeightConfig): CollisionOrchestrator {
  if (!orchestrator) {
    console.log('[DetectConnections] Initializing orchestrator with 3-engine system');
    
    // Create orchestrator with configuration optimized for 3 engines
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 3, // Reduced from 7 to 3
      globalTimeout: 10000, // Increased to 10 seconds for AI processing
      weights: weights,
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
      },
    });
    
    // Get API key for ThematicBridge engine
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY environment variable is required for ThematicBridge engine');
    }
    
    // Initialize and register the 3 engines
    const engines = [
      new SemanticSimilarityEngine(),
      new ContradictionDetectionEngine(),
      new ThematicBridgeEngine({ apiKey }),
    ];
    
    orchestrator.registerEngines(engines);
    
    console.log('[DetectConnections] Orchestrator initialized with 3 engines (Semantic, Contradiction, ThematicBridge)');
  } else if (weights) {
    // Update weights if provided
    orchestrator.updateWeights(weights);
  }
  
  return orchestrator;
}

/**
 * Main handler for connection detection requests.
 */
export async function detectConnections(
  sourceChunkId: string,
  documentId?: string,
  userId?: string,
  config?: {
    weights?: WeightConfig;
    limit?: number;
    minScore?: number;
    enabledEngines?: EngineType[];
  }
): Promise<AggregatedResults> {
  const startTime = performance.now();
  
  // Create Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  try {
    console.log(`[DetectConnections] Starting detection for chunk ${sourceChunkId}`);
    
    // Fetch source chunk with metadata
    const { data: sourceChunk, error: sourceError } = await supabase
      .from('chunks')
      .select('*')
      .eq('id', sourceChunkId)
      .single();
    
    if (sourceError || !sourceChunk) {
      throw new Error(`Failed to fetch source chunk: ${sourceError?.message || 'Not found'}`);
    }
    
    // Build query for candidate chunks
    let query = supabase
      .from('chunks')
      .select('*')
      .neq('id', sourceChunkId); // Exclude self
    
    // Filter by document if specified
    if (documentId) {
      query = query.eq('document_id', documentId);
    }
    
    // Filter by user if specified
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    // Fetch candidate chunks
    const { data: candidateChunks, error: candidatesError } = await query;
    
    if (candidatesError) {
      throw new Error(`Failed to fetch candidate chunks: ${candidatesError.message}`);
    }
    
    if (!candidateChunks || candidateChunks.length === 0) {
      console.log('[DetectConnections] No candidate chunks found');
      return {
        collisions: [],
        groupedByTarget: new Map(),
        weightedScores: new Map(),
        topConnections: [],
        metrics: {
          totalExecutionTime: performance.now() - startTime,
          engineMetrics: new Map(),
        },
      };
    }
    
    console.log(`[DetectConnections] Found ${candidateChunks.length} candidate chunks`);
    
    // Initialize orchestrator
    const orch = initializeOrchestrator(config?.weights);
    
    // Update enabled engines if specified
    if (config?.enabledEngines) {
      const currentConfig = orch.getConfig();
      orch = new CollisionOrchestrator({
        ...currentConfig,
        enabledEngines: config.enabledEngines,
        weights: config.weights || currentConfig.weights,
      });
      
      // Get API key for ThematicBridge engine
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_AI_API_KEY environment variable is required for ThematicBridge engine');
      }
      
      // Re-register the 3 engines with new config
      const engines = [
        new SemanticSimilarityEngine(),
        new ContradictionDetectionEngine(),
        new ThematicBridgeEngine({ apiKey }),
      ];
      
      orch.registerEngines(engines);
    }
    
    // Prepare input for orchestrator
    const input: CollisionDetectionInput = {
      sourceChunk,
      targetChunks: candidateChunks,
      config: {
        maxResults: config?.limit || 50,
        minScore: config?.minScore || 0.3,
      },
    };
    
    // Run collision detection
    const results = await orch.detectCollisions(input);
    
    // Log performance metrics
    const totalTime = performance.now() - startTime;
    console.log(`[DetectConnections] Detection completed in ${totalTime.toFixed(2)}ms`);
    console.log(`[DetectConnections] Found ${results.collisions.length} total collisions`);
    console.log(`[DetectConnections] Top connections: ${results.topConnections.length}`);
    
    // Apply limit to top connections if specified
    if (config?.limit && results.topConnections.length > config.limit) {
      results.topConnections = results.topConnections.slice(0, config.limit);
    }
    
    // Filter by minimum score if specified
    if (config?.minScore !== undefined) {
      results.topConnections = results.topConnections.filter(
        conn => conn.totalScore >= config.minScore!
      );
    }
    
    return results;
    
  } catch (error) {
    console.error('[DetectConnections] Error:', error);
    throw error;
  }
}

/**
 * Batch detection for multiple source chunks.
 */
export async function detectConnectionsBatch(
  sourceChunkIds: string[],
  config?: {
    weights?: WeightConfig;
    limit?: number;
    minScore?: number;
    enabledEngines?: EngineType[];
  }
): Promise<Map<string, AggregatedResults>> {
  const results = new Map<string, AggregatedResults>();
  
  console.log(`[DetectConnections] Starting batch detection for ${sourceChunkIds.length} chunks`);
  
  // Process in parallel with concurrency limit
  const concurrencyLimit = 3;
  const chunks = [...sourceChunkIds];
  
  while (chunks.length > 0) {
    const batch = chunks.splice(0, concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(async chunkId => {
        try {
          const result = await detectConnections(chunkId, undefined, undefined, config);
          return { chunkId, result };
        } catch (error) {
          console.error(`[DetectConnections] Error processing chunk ${chunkId}:`, error);
          return { chunkId, result: null };
        }
      })
    );
    
    // Store results
    for (const { chunkId, result } of batchResults) {
      if (result) {
        results.set(chunkId, result);
      }
    }
  }
  
  console.log(`[DetectConnections] Batch detection completed for ${results.size} chunks`);
  
  return results;
}

/**
 * Main handler for detect-connections background jobs.
 * Processes all chunks in a document to find connections across all user documents.
 */
export async function detectConnectionsHandler(supabase: any, job: any): Promise<void> {
  const { document_id, chunk_count, trigger, user_id } = job.input_data;
  
  console.log(`[DetectConnections] Starting handler for document ${document_id} with ${chunk_count} chunks (${trigger})`);
  
  try {
    // Fetch chunks from the newly processed document
    const { data: newDocumentChunks, error: newChunksError } = await supabase
      .from('chunks')
      .select('id, content, metadata, embedding, themes, summary, importance_score')
      .eq('document_id', document_id)
      .order('chunk_index');
    
    if (newChunksError || !newDocumentChunks) {
      throw new Error(`Failed to fetch new document chunks: ${newChunksError?.message || 'No chunks found'}`);
    }
    
    // Fetch all existing chunks from other documents for cross-document detection
    const { data: allUserChunks, error: allChunksError } = await supabase
      .from('chunks')
      .select('id, content, metadata, embedding, themes, summary, importance_score, document_id')
      .eq('user_id', user_id)
      .order('created_at');
    
    if (allChunksError || !allUserChunks) {
      throw new Error(`Failed to fetch user chunks: ${allChunksError?.message || 'No chunks found'}`);
    }
    
    if (newDocumentChunks.length < 1) {
      console.log('[DetectConnections] Skipping - no chunks in new document');
      return;
    }
    
    // Filter out chunks from the current document for candidate set (avoid self-connections)
    const candidateChunks = allUserChunks.filter((chunk: any) => chunk.document_id !== document_id);
    
    if (candidateChunks.length < 1) {
      console.log('[DetectConnections] Skipping - no existing chunks to connect with');
      return;
    }
    
    console.log(`[DetectConnections] Processing ${newDocumentChunks.length} new chunks against ${candidateChunks.length} existing chunks for cross-document connections`);
    
    // Process each chunk from the new document against all existing chunks
    const allResults = new Map<string, any>();
    
    for (const newChunk of newDocumentChunks) {
      try {
        const result = await detectConnections(
          newChunk.id, 
          undefined, // Don't filter by document_id 
          user_id,   // Filter by user_id instead
          {
            minScore: 0.1, // Low threshold to capture all connections
            limit: 50 // Per chunk limit
          }
        );
        allResults.set(newChunk.id, result);
      } catch (error) {
        console.error(`[DetectConnections] Error processing chunk ${newChunk.id}:`, error);
        // Continue with other chunks
      }
    }
    
    // Convert results to database connections format
    const connections: any[] = [];
    
    for (const [sourceChunkId, results] of allResults.entries()) {
      for (const collision of results.collisions) {
        connections.push({
          source_chunk_id: sourceChunkId,
          target_chunk_id: collision.targetChunkId,
          type: collision.type,
          strength: collision.score,
          auto_detected: true,
          discovered_at: new Date().toISOString(),
          metadata: {
            engine: collision.engineType,
            reasoning: collision.reasoning || '',
            shared_elements: collision.metadata?.sharedElements || []
          }
        });
      }
    }
    
    // Batch insert all connections
    if (connections.length > 0) {
      console.log(`[DetectConnections] Saving ${connections.length} connections to database`);
      
      const { error: insertError } = await supabase
        .from('connections')
        .insert(connections);
      
      if (insertError) {
        throw new Error(`Failed to save connections: ${insertError.message}`);
      }
      
      console.log(`[DetectConnections] Successfully saved ${connections.length} connections`);
    } else {
      console.log('[DetectConnections] No connections found above threshold');
    }
    
    // Update job with success result
    await supabase
      .from('background_jobs')
      .update({
        status: 'completed',
        output_data: {
          success: true,
          document_id,
          connections_created: connections.length,
          chunks_processed: newDocumentChunks.length,
          cross_document_candidates: candidateChunks.length
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

/**
 * Cleanup function for graceful shutdown.
 */
export async function cleanup(): Promise<void> {
  if (orchestrator) {
    await orchestrator.cleanup();
    orchestrator = null;
    console.log('[DetectConnections] Orchestrator cleaned up');
  }
}