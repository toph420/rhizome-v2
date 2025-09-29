/**
 * Abstract base class for all collision detection engines.
 * Provides common functionality and enforces interface requirements.
 */

import { z } from 'zod';
import {
  CollisionEngine,
  CollisionDetectionInput,
  CollisionResult,
  EngineType,
  EngineConfig,
  ChunkWithMetadata,
} from './types';

/**
 * Abstract base implementation for collision engines.
 * Handles common operations like validation, caching, and error handling.
 */
export abstract class BaseEngine implements CollisionEngine {
  /** Engine type identifier */
  abstract readonly type: EngineType;
  
  /** Cache for memoization */
  private cache: Map<string, CollisionResult[]> = new Map();
  
  /** Performance metrics */
  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    totalDetections: 0,
    totalTime: 0,
  };
  
  /**
   * Detects collisions between source chunk and target chunks.
   * Wraps the engine-specific implementation with common functionality.
   */
  async detect(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    const startTime = performance.now();
    
    try {
      // Validate input
      if (!this.canProcess(input)) {
        return [];
      }
      
      // Check cache if enabled
      const cacheKey = this.getCacheKey(input);
      if (input.config?.enableCache && this.cache.has(cacheKey)) {
        this.metrics.cacheHits++;
        return this.cache.get(cacheKey)!;
      }
      
      this.metrics.cacheMisses++;
      
      // Validate configuration
      if (input.config) {
        this.validateConfig(input.config);
      }
      
      // Call engine-specific implementation
      const results = await this.detectImpl(input);
      
      // Apply post-processing
      const processedResults = this.postProcess(results, input.config);
      
      // Cache results if enabled
      if (input.config?.enableCache) {
        this.cache.set(cacheKey, processedResults);
      }
      
      // Update metrics
      this.metrics.totalDetections++;
      this.metrics.totalTime += performance.now() - startTime;
      
      return processedResults;
      
    } catch (error) {
      console.error(`[${this.type}] Detection error:`, error);
      throw error;
    }
  }
  
  /**
   * Engine-specific detection implementation.
   * Must be implemented by concrete engines.
   */
  protected abstract detectImpl(
    input: CollisionDetectionInput
  ): Promise<CollisionResult[]>;
  
  /**
   * Validates if the engine can process the given input.
   * Can be overridden by specific engines for custom validation.
   */
  canProcess(input: CollisionDetectionInput): boolean {
    // Basic validation
    if (!input.sourceChunk || !input.targetChunks || input.targetChunks.length === 0) {
      return false;
    }
    
    // Check for required metadata based on engine type
    return this.hasRequiredMetadata(input.sourceChunk);
  }
  
  /**
   * Checks if chunk has required metadata for this engine.
   * Should be overridden by specific engines.
   */
  protected abstract hasRequiredMetadata(chunk: ChunkWithMetadata): boolean;
  
  /**
   * Gets engine-specific configuration schema.
   * Can be overridden for custom schemas.
   */
  getConfigSchema(): z.ZodSchema {
    return z.object({
      maxResults: z.number().min(1).max(100).optional(),
      minScore: z.number().min(0).max(1).optional(),
      timeout: z.number().min(100).max(60000).optional(),
      enableCache: z.boolean().optional(),
      customParams: z.record(z.unknown()).optional(),
    });
  }
  
  /**
   * Validates configuration against schema.
   */
  protected validateConfig(config: EngineConfig): void {
    const schema = this.getConfigSchema();
    schema.parse(config);
  }
  
  /**
   * Post-processes results (filtering, sorting, limiting).
   */
  protected postProcess(
    results: CollisionResult[],
    config?: EngineConfig
  ): CollisionResult[] {
    let processed = [...results];
    
    // Filter by minimum score
    if (config?.minScore) {
      processed = processed.filter(r => r.score >= config.minScore);
    }
    
    // Sort by score descending
    processed.sort((a, b) => b.score - a.score);
    
    // Limit results
    if (config?.maxResults) {
      processed = processed.slice(0, config.maxResults);
    }
    
    return processed;
  }
  
  /**
   * Generates cache key for input.
   */
  protected getCacheKey(input: CollisionDetectionInput): string {
    const targetIds = input.targetChunks.map(c => c.id).sort().join(',');
    return `${this.type}:${input.sourceChunk.id}:${targetIds}`;
  }
  
  /**
   * Helper to calculate similarity between two arrays of concepts.
   */
  protected calculateConceptOverlap(
    concepts1: Array<{ term: string; importance: number }>,
    concepts2: Array<{ term: string; importance: number }>
  ): number {
    if (!concepts1?.length || !concepts2?.length) return 0;
    
    const set1 = new Set(concepts1.map(c => c.term.toLowerCase()));
    const set2 = new Set(concepts2.map(c => c.term.toLowerCase()));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }
  
  /**
   * Helper to calculate temporal distance.
   */
  protected calculateTemporalDistance(
    time1?: string,
    time2?: string
  ): number | null {
    if (!time1 || !time2) return null;
    
    try {
      const date1 = new Date(time1);
      const date2 = new Date(time2);
      
      if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
        return null;
      }
      
      // Return distance in hours
      return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60);
    } catch {
      return null;
    }
  }
  
  /**
   * Helper to calculate emotional similarity.
   */
  protected calculateEmotionalSimilarity(
    tone1?: { primary_emotion?: string; polarity?: number },
    tone2?: { primary_emotion?: string; polarity?: number }
  ): number {
    if (!tone1 || !tone2) return 0;
    
    let similarity = 0;
    
    // Check primary emotion match
    if (tone1.primary_emotion === tone2.primary_emotion) {
      similarity += 0.5;
    }
    
    // Check polarity similarity (convert difference to similarity)
    if (tone1.polarity !== undefined && tone2.polarity !== undefined) {
      const polarityDiff = Math.abs(tone1.polarity - tone2.polarity);
      similarity += 0.5 * (1 - polarityDiff / 2); // Max diff is 2 (-1 to 1)
    }
    
    return similarity;
  }
  
  /**
   * Cleans up resources used by the engine.
   */
  async cleanup(): Promise<void> {
    this.cache.clear();
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      totalDetections: 0,
      totalTime: 0,
    };
  }
  
  /**
   * Gets performance metrics for this engine.
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.cacheHits / 
        (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      avgDetectionTime: this.metrics.totalTime / this.metrics.totalDetections || 0,
    };
  }
}