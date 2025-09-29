/**
 * Semantic Similarity Engine
 * Detects conceptually related chunks using vector embeddings and cosine similarity
 * 
 * Performance target: <500ms for 50-chunk comparison
 * Accuracy: Cosine similarity threshold 0.7+
 * Scalability: Efficient for 10K+ chunks using pgvector indexes
 */

import { BaseEngine } from './base-engine';
import { CollisionResult, ChunkData, EngineType, EngineMetrics } from './types';
import { VectorSearchClient, ChunkMatch, VectorSearchOptions } from '../lib/vector-search';

export interface SemanticSimilarityConfig {
  /** Minimum similarity threshold (0-1) */
  threshold: number;
  /** Maximum results per chunk */
  maxResultsPerChunk: number;
  /** Include self-references */
  includeSelfReferences: boolean;
  /** Weight for importance scores */
  importanceWeight: number;
}

const DEFAULT_CONFIG: SemanticSimilarityConfig = {
  threshold: 0.7,
  maxResultsPerChunk: 10,
  includeSelfReferences: false,
  importanceWeight: 0.3
};

/**
 * Semantic Similarity Engine
 * Uses pgvector for efficient cosine similarity searches across chunk embeddings
 */
export class SemanticSimilarityEngine extends BaseEngine {
  private vectorClient: VectorSearchClient;
  private config: SemanticSimilarityConfig;

  constructor(config: Partial<SemanticSimilarityConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.vectorClient = new VectorSearchClient();
  }

  getEngineType(): EngineType {
    return EngineType.SEMANTIC_SIMILARITY;
  }

  /**
   * Process chunks to find semantic similarities
   * Uses pgvector for efficient similarity search at scale
   */
  async processChunks(chunks: ChunkData[]): Promise<CollisionResult[]> {
    const startTime = performance.now();
    const results: CollisionResult[] = [];
    
    try {
      // Process chunks in parallel batches
      const batchSize = 5; // Process 5 chunks concurrently
      const batches = [];
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchPromises = batch.map(chunk => this.findSimilarChunks(chunk, chunks));
        batches.push(...await Promise.all(batchPromises));
      }
      
      // Flatten and deduplicate results
      const resultMap = new Map<string, CollisionResult>();
      
      for (const chunkResults of batches) {
        for (const result of chunkResults) {
          const key = `${result.sourceChunkId}-${result.targetChunkId}`;
          const reverseKey = `${result.targetChunkId}-${result.sourceChunkId}`;
          
          // Avoid duplicate pairs
          if (!resultMap.has(key) && !resultMap.has(reverseKey)) {
            resultMap.set(key, result);
          }
        }
      }
      
      results.push(...resultMap.values());
      
      // Update metrics
      const metrics: EngineMetrics = {
        processedChunks: chunks.length,
        collisionsFound: results.length,
        processingTime: performance.now() - startTime,
        cacheHitRate: this.getCacheStats().hitRate,
        averageScore: results.length > 0 
          ? results.reduce((sum, r) => sum + r.score, 0) / results.length 
          : 0
      };
      
      this.updateMetrics(metrics);
      
      // Log performance
      console.log(`SemanticSimilarityEngine: Found ${results.length} collisions in ${metrics.processingTime}ms`);
      
      return results;
    } catch (error) {
      console.error('SemanticSimilarityEngine processing error:', error);
      throw error;
    }
  }

  /**
   * Find similar chunks for a given chunk
   */
  private async findSimilarChunks(
    sourceChunk: ChunkData, 
    allChunks: ChunkData[]
  ): Promise<CollisionResult[]> {
    const results: CollisionResult[] = [];
    
    // Check cache first
    const cacheKey = `similarity-${sourceChunk.id}`;
    const cached = this.getFromCache<CollisionResult[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Get or use existing embedding
    const embedding = sourceChunk.embedding || 
      await this.vectorClient.getChunkEmbedding(sourceChunk.id);
    
    if (!embedding) {
      console.warn(`No embedding found for chunk ${sourceChunk.id}`);
      return results;
    }
    
    // Search for similar chunks using pgvector
    const searchOptions: VectorSearchOptions = {
      threshold: this.config.threshold,
      limit: this.config.maxResultsPerChunk,
      excludeDocumentId: this.config.includeSelfReferences ? undefined : sourceChunk.documentId
    };
    
    const matches = await this.vectorClient.searchSimilarChunks(embedding, searchOptions);
    
    // Convert matches to collision results
    for (const match of matches) {
      // Skip self-reference unless configured to include
      if (!this.config.includeSelfReferences && match.id === sourceChunk.id) {
        continue;
      }
      
      // Calculate final score with importance weighting
      const importanceBoost = match.importance_score 
        ? match.importance_score * this.config.importanceWeight 
        : 0;
      const finalScore = Math.min(1.0, match.similarity + importanceBoost);
      
      // Determine confidence based on similarity
      const confidence = this.calculateConfidence(match.similarity);
      
      results.push({
        sourceChunkId: sourceChunk.id,
        targetChunkId: match.id,
        engineType: EngineType.SEMANTIC_SIMILARITY,
        score: finalScore,
        confidence,
        metadata: {
          rawSimilarity: match.similarity,
          importanceScore: match.importance_score || 0,
          themes: match.themes,
          summary: match.summary,
          thresholdUsed: this.config.threshold
        }
      });
    }
    
    // Cache results
    this.addToCache(cacheKey, results);
    
    return results;
  }

  /**
   * Calculate confidence based on similarity score
   */
  private calculateConfidence(similarity: number): 'high' | 'medium' | 'low' {
    if (similarity >= 0.85) return 'high';
    if (similarity >= 0.75) return 'medium';
    return 'low';
  }

  /**
   * Validate that the engine is properly configured
   */
  async validate(): Promise<boolean> {
    try {
      // Test vector client connection
      const testEmbedding = new Array(768).fill(0.1);
      const results = await this.vectorClient.searchSimilarChunks(testEmbedding, {
        threshold: 0.5,
        limit: 1
      });
      
      console.log('SemanticSimilarityEngine validation successful');
      return true;
    } catch (error) {
      console.error('SemanticSimilarityEngine validation failed:', error);
      return false;
    }
  }

  /**
   * Get engine configuration
   */
  getConfig(): SemanticSimilarityConfig {
    return { ...this.config };
  }

  /**
   * Update engine configuration
   */
  updateConfig(config: Partial<SemanticSimilarityConfig>): void {
    this.config = { ...this.config, ...config };
    this.clearCache(); // Clear cache when config changes
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    metrics: EngineMetrics;
    config: SemanticSimilarityConfig;
    cacheStats: ReturnType<typeof this.getCacheStats>;
  } {
    return {
      metrics: this.getMetrics(),
      config: this.getConfig(),
      cacheStats: this.getCacheStats()
    };
  }
}

// Export a factory function for easier instantiation
export function createSemanticSimilarityEngine(
  config?: Partial<SemanticSimilarityConfig>
): SemanticSimilarityEngine {
  return new SemanticSimilarityEngine(config);
}