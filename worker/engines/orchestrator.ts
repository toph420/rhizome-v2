/**
 * Orchestrator for parallel execution of collision detection engines.
 * Coordinates all 7 engines and aggregates their results.
 */

import {
  CollisionEngine,
  CollisionDetectionInput,
  EngineResult,
  AggregatedResults,
  OrchestratorConfig,
  EngineType,
  CollisionResult,
  WeightConfig,
  ChunkWithMetadata,
} from './types';

import { ScoringSystem, createScoringSystem } from './scoring';
import { DEFAULT_WEIGHTS } from '../lib/weight-config';
import { PerformanceMonitor } from '../lib/performance-monitor';
import { CollisionCacheManager } from '../lib/cache-manager';

/**
 * Main orchestrator for collision detection system.
 * Manages parallel execution and result aggregation.
 */
export class CollisionOrchestrator {
  private engines = new Map<EngineType, CollisionEngine>();
  private config: OrchestratorConfig;
  private performanceMonitor: PerformanceMonitor;
  private cacheManager: CollisionCacheManager;
  private scoringSystem: ScoringSystem;
  
  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      parallel: true,
      maxConcurrency: 3,
      globalTimeout: 5000, // 5 seconds default
      weights: DEFAULT_WEIGHTS,
      enabledEngines: [
        EngineType.SEMANTIC_SIMILARITY,
        EngineType.CONTRADICTION_DETECTION,
        EngineType.THEMATIC_BRIDGE,
      ],
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
      },
      ...config,
    };
    
    // Initialize performance monitor
    this.performanceMonitor = new PerformanceMonitor(true);
    
    // Initialize cache manager with config
    this.cacheManager = new CollisionCacheManager(this.config.cache);
    
    // Initialize scoring system with configured weights
    this.scoringSystem = createScoringSystem(this.config.weights);
  }
  
  /**
   * Registers an engine with the orchestrator.
   */
  registerEngine(engine: CollisionEngine): void {
    if (!this.config.enabledEngines?.includes(engine.type)) {
      console.log(`[Orchestrator] Engine ${engine.type} is disabled, skipping registration`);
      return;
    }
    
    this.engines.set(engine.type, engine);
    console.log(`[Orchestrator] Registered engine: ${engine.type}`);
  }
  
  /**
   * Registers multiple engines at once.
   */
  registerEngines(engines: CollisionEngine[]): void {
    engines.forEach(engine => this.registerEngine(engine));
  }
  
  /**
   * Main detection method - orchestrates all engines.
   */
  async detectCollisions(input: CollisionDetectionInput): Promise<AggregatedResults> {
    this.performanceMonitor.reset();
    this.performanceMonitor.startTimer('total');
    
    try {
      // Create cache key for this input
      const cacheKey = this.cacheManager.createKey(
        input.sourceChunk.id,
        input.targetChunks?.map((c: ChunkWithMetadata) => c.id) || [],
        input.config
      );
      
      // Check cache first
      const cached = this.cacheManager.get<AggregatedResults>('orchestrator', cacheKey);
      if (cached) {
        console.log('[Orchestrator] Cache hit - returning cached results');
        return cached;
      }
      
      // Get enabled engines that can process this input
      const applicableEngines = this.getApplicableEngines(input);
      
      if (applicableEngines.length === 0) {
        console.warn('[Orchestrator] No applicable engines for input');
        return this.createEmptyResult();
      }
      
      console.log(`[Orchestrator] Running ${applicableEngines.length} engines`);
      
      // Execute engines
      const engineResults = this.config.parallel
        ? await this.executeParallel(applicableEngines, input)
        : await this.executeSequential(applicableEngines, input);
      
      // Aggregate results
      const aggregated = this.aggregateResults(engineResults);
      
      // Apply weighted scoring using the scoring system
      const scored = this.scoringSystem.applyWeightedScoring(aggregated);
      
      const totalTime = this.performanceMonitor.endTimer('total');
      console.log(`[Orchestrator] Total execution time: ${totalTime.toFixed(2)}ms`);
      
      // Cache the results
      this.cacheManager.set('orchestrator', cacheKey, scored);
      
      // Log performance summary if needed
      if (process.env.LOG_PERFORMANCE === 'true') {
        this.performanceMonitor.logSummary('[Orchestrator]');
        this.cacheManager.logStats('[Orchestrator]');
      }
      
      return scored;
      
    } catch (error) {
      console.error('[Orchestrator] Detection error:', error);
      throw error;
    }
  }
  
  /**
   * Gets engines that can process the given input.
   */
  private getApplicableEngines(input: CollisionDetectionInput): CollisionEngine[] {
    const engines: CollisionEngine[] = [];
    
    for (const [type, engine] of this.engines) {
      if (this.config.enabledEngines?.includes(type) && engine.canProcess(input)) {
        engines.push(engine);
      }
    }
    
    return engines;
  }
  
  /**
   * Executes engines in parallel using Promise.allSettled.
   */
  private async executeParallel(
    engines: CollisionEngine[],
    input: CollisionDetectionInput
  ): Promise<EngineResult[]> {
    console.log('[Orchestrator] Executing engines in parallel');
    
    // Create detection promises with timeout
    const detectionPromises = engines.map(engine => 
      this.executeEngineWithTimeout(engine, input)
    );
    
    // Execute all in parallel
    const results = await Promise.allSettled(detectionPromises);
    
    // Process results
    const engineResults: EngineResult[] = [];
    
    results.forEach((result, index) => {
      const engine = engines[index];
      
      if (result.status === 'fulfilled') {
        engineResults.push(result.value);
      } else {
        console.error(`[Orchestrator] Engine ${engine.type} failed:`, result.reason);
        engineResults.push({
          engineType: engine.type,
          collisions: [],
          executionTime: 0,
          error: result.reason,
        });
      }
    });
    
    return engineResults;
  }
  
  /**
   * Executes engines sequentially (fallback mode).
   */
  private async executeSequential(
    engines: CollisionEngine[],
    input: CollisionDetectionInput
  ): Promise<EngineResult[]> {
    console.log('[Orchestrator] Executing engines sequentially');
    
    const engineResults: EngineResult[] = [];
    
    for (const engine of engines) {
      try {
        const result = await this.executeEngineWithTimeout(engine, input);
        engineResults.push(result);
      } catch (error) {
        console.error(`[Orchestrator] Engine ${engine.type} failed:`, error);
        engineResults.push({
          engineType: engine.type,
          collisions: [],
          executionTime: 0,
          error: error as Error,
        });
      }
    }
    
    return engineResults;
  }
  
  /**
   * Executes a single engine with timeout.
   */
  private async executeEngineWithTimeout(
    engine: CollisionEngine,
    input: CollisionDetectionInput
  ): Promise<EngineResult> {
    const timeoutMs = input.config?.timeout || this.config.globalTimeout || 5000;
    
    // Create cache key for this engine and input
    const cacheKey = this.cacheManager.createKey(
      input.sourceChunk.id,
      input.targetChunks?.map((c: ChunkWithMetadata) => c.id).slice(0, 10) || [], // Limit key size
      input.config
    );
    
    // Check engine-specific cache
    const cached = this.cacheManager.get<EngineResult>(engine.type, cacheKey);
    if (cached) {
      console.log(`[Orchestrator] Cache hit for engine ${engine.type}`);
      return cached;
    }
    
    this.performanceMonitor.startTimer(engine.type);
    
    const result = await Promise.race([
      // Engine detection
      (async () => {
        try {
          const collisions = await engine.detect(input);
          const executionTime = this.performanceMonitor.endTimer(engine.type);
          
          const engineResult = {
            engineType: engine.type,
            collisions,
            executionTime,
          };
          
          // Cache the engine result
          this.cacheManager.set(engine.type, cacheKey, engineResult);
          
          return engineResult;
        } catch (error) {
          throw error;
        }
      })(),
      
      // Timeout
      new Promise<EngineResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Engine ${engine.type} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
    
    return result;
  }
  
  /**
   * Aggregates results from all engines.
   */
  private aggregateResults(engineResults: EngineResult[]): AggregatedResults {
    const allCollisions: CollisionResult[] = [];
    const groupedByTarget = new Map<string, CollisionResult[]>();
    const engineMetrics = new Map<EngineType, { time: number; resultCount: number }>();
    
    // Collect all collisions and metrics
    for (const result of engineResults) {
      if (!result.error) {
        allCollisions.push(...result.collisions);
        
        // Group by target chunk
        for (const collision of result.collisions) {
          const existing = groupedByTarget.get(collision.targetChunkId) || [];
          existing.push(collision);
          groupedByTarget.set(collision.targetChunkId, existing);
        }
      }
      
      // Record metrics
      engineMetrics.set(result.engineType, {
        time: result.executionTime,
        resultCount: result.collisions.length,
      });
    }
    
    return {
      collisions: allCollisions,
      groupedByTarget,
      weightedScores: new Map(),
      topConnections: [],
      metrics: {
        totalExecutionTime: this.performanceMonitor.getMetricsByLabel('total')[0] || 0,
        engineMetrics,
      },
    };
  }
  
  
  /**
   * Creates an empty result structure.
   */
  private createEmptyResult(): AggregatedResults {
    return {
      collisions: [],
      groupedByTarget: new Map(),
      weightedScores: new Map(),
      topConnections: [],
      metrics: {
        totalExecutionTime: 0,
        engineMetrics: new Map(),
      },
    };
  }
  
  /**
   * Updates weight configuration.
   */
  updateWeights(weights: WeightConfig): void {
    this.config.weights = weights;
    this.scoringSystem.updateWeights(weights);
  }
  
  /**
   * Gets current configuration.
   */
  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }
  
  /**
   * Cleans up all engines and resources.
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.engines.values()).map(engine => 
      engine.cleanup?.() || Promise.resolve()
    );
    
    await Promise.all(cleanupPromises);
    this.performanceMonitor.reset();
    this.cacheManager.clearAll();
  }
  
  /**
   * Gets performance metrics.
   */
  getPerformanceMetrics() {
    return this.performanceMonitor.generateReport();
  }
  
  /**
   * Gets cache statistics.
   */
  getCacheStats() {
    return this.cacheManager.getAllStats();
  }
}