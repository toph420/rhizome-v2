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
  DEFAULT_WEIGHTS,
  PerformanceMonitor,
} from './types';

/**
 * Simple performance monitor implementation.
 */
class SimplePerformanceMonitor implements PerformanceMonitor {
  private timers = new Map<string, number>();
  private metrics = new Map<string, number>();
  
  startTimer(label: string): void {
    this.timers.set(label, performance.now());
  }
  
  endTimer(label: string): number {
    const start = this.timers.get(label);
    if (!start) return 0;
    
    const duration = performance.now() - start;
    this.metrics.set(label, duration);
    this.timers.delete(label);
    return duration;
  }
  
  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }
  
  reset(): void {
    this.timers.clear();
    this.metrics.clear();
  }
}

/**
 * Main orchestrator for collision detection system.
 * Manages parallel execution and result aggregation.
 */
export class CollisionOrchestrator {
  private engines = new Map<EngineType, CollisionEngine>();
  private config: OrchestratorConfig;
  private performanceMonitor = new SimplePerformanceMonitor();
  
  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      parallel: true,
      maxConcurrency: 7,
      globalTimeout: 5000, // 5 seconds default
      weights: DEFAULT_WEIGHTS,
      enabledEngines: Object.values(EngineType),
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
      },
      ...config,
    };
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
      
      // Apply weighted scoring
      const scored = this.applyWeightedScoring(aggregated);
      
      const totalTime = this.performanceMonitor.endTimer('total');
      console.log(`[Orchestrator] Total execution time: ${totalTime.toFixed(2)}ms`);
      
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
    
    this.performanceMonitor.startTimer(engine.type);
    
    return Promise.race([
      // Engine detection
      (async () => {
        try {
          const collisions = await engine.detect(input);
          const executionTime = this.performanceMonitor.endTimer(engine.type);
          
          return {
            engineType: engine.type,
            collisions,
            executionTime,
          };
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
        totalExecutionTime: this.performanceMonitor.getMetrics().get('total') || 0,
        engineMetrics,
      },
    };
  }
  
  /**
   * Applies weighted scoring to aggregated results.
   */
  private applyWeightedScoring(results: AggregatedResults): AggregatedResults {
    const weights = this.config.weights || DEFAULT_WEIGHTS;
    const weightedScores = new Map<string, number>();
    
    // Calculate weighted scores for each target chunk
    for (const [targetId, collisions] of results.groupedByTarget) {
      const score = this.calculateWeightedScore(collisions, weights);
      weightedScores.set(targetId, score);
    }
    
    // Create top connections list
    const topConnections = Array.from(weightedScores.entries())
      .map(([targetId, score]) => {
        const collisions = results.groupedByTarget.get(targetId) || [];
        return {
          targetChunkId: targetId,
          totalScore: score,
          engines: [...new Set(collisions.map(c => c.engineType))],
          explanations: collisions.map(c => c.explanation),
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
    
    return {
      ...results,
      weightedScores,
      topConnections,
    };
  }
  
  /**
   * Calculates weighted score for a set of collisions.
   */
  private calculateWeightedScore(
    collisions: CollisionResult[],
    weights: WeightConfig
  ): number {
    // Group collisions by engine type
    const byEngine = new Map<EngineType, CollisionResult[]>();
    
    for (const collision of collisions) {
      const existing = byEngine.get(collision.engineType) || [];
      existing.push(collision);
      byEngine.set(collision.engineType, existing);
    }
    
    // Calculate weighted sum
    let totalScore = 0;
    
    for (const [engineType, engineCollisions] of byEngine) {
      const weight = weights.weights[engineType] || 0;
      
      // Get best score from this engine
      const bestScore = Math.max(...engineCollisions.map(c => c.score));
      
      // Apply weight
      totalScore += bestScore * weight;
    }
    
    // Apply normalization if needed
    if (weights.normalizationMethod === 'sigmoid') {
      totalScore = 1 / (1 + Math.exp(-totalScore));
    }
    
    return totalScore;
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
  }
}