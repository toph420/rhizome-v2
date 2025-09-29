/**
 * Handler for detecting connections between chunks using the 7-engine collision detection system.
 * This is the main entry point for collision detection requests.
 */

import { createClient } from '@supabase/supabase-js';
import { CollisionOrchestrator } from '../engines/orchestrator';
import { SemanticSimilarityEngine } from '../engines/semantic-similarity';
import { StructuralPatternEngine } from '../engines/structural-pattern';
import { TemporalProximityEngine } from '../engines/temporal-proximity';
import { ConceptualDensityEngine } from '../engines/conceptual-density';
import { EmotionalResonanceEngine } from '../engines/emotional-resonance';
import { CitationNetworkEngine } from '../engines/citation-network';
import { ContradictionDetectionEngine } from '../engines/contradiction-detection';
import {
  CollisionDetectionInput,
  AggregatedResults,
  EngineType,
  WeightConfig,
} from '../engines/types';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Global orchestrator instance (reused across requests)
let orchestrator: CollisionOrchestrator | null = null;

/**
 * Initializes the orchestrator with all engines.
 */
function initializeOrchestrator(weights?: WeightConfig): CollisionOrchestrator {
  if (!orchestrator) {
    console.log('[DetectConnections] Initializing orchestrator with all engines');
    
    // Create orchestrator with configuration
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 7,
      globalTimeout: 5000, // 5 seconds
      weights: weights,
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
      },
    });
    
    // Initialize and register all engines
    const engines = [
      new SemanticSimilarityEngine(),
      new StructuralPatternEngine(),
      new TemporalProximityEngine(),
      new ConceptualDensityEngine(),
      new EmotionalResonanceEngine(),
      new CitationNetworkEngine(),
      new ContradictionDetectionEngine(),
    ];
    
    orchestrator.registerEngines(engines);
    
    console.log('[DetectConnections] Orchestrator initialized with 7 engines');
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
      
      // Re-register engines with new config
      const engines = [
        new SemanticSimilarityEngine(),
        new StructuralPatternEngine(),
        new TemporalProximityEngine(),
        new ConceptualDensityEngine(),
        new EmotionalResonanceEngine(),
        new CitationNetworkEngine(),
        new ContradictionDetectionEngine(),
      ];
      
      orch.registerEngines(engines);
    }
    
    // Prepare input for orchestrator
    const input: CollisionDetectionInput = {
      sourceChunk,
      candidateChunks,
      config: {
        limit: config?.limit || 50,
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
    if (config?.minScore) {
      results.topConnections = results.topConnections.filter(
        conn => conn.totalScore >= config.minScore
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
 * Cleanup function for graceful shutdown.
 */
export async function cleanup(): Promise<void> {
  if (orchestrator) {
    await orchestrator.cleanup();
    orchestrator = null;
    console.log('[DetectConnections] Orchestrator cleaned up');
  }
}