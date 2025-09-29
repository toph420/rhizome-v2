/**
 * Semantic Similarity Engine
 * Detects conceptually related chunks using vector embeddings and cosine similarity
 * 
 * Performance target: <500ms for 50-chunk comparison
 * Accuracy: Cosine similarity threshold 0.7+
 * Scalability: Efficient for 10K+ chunks using pgvector indexes
 */

import { BaseEngine } from './base-engine';
import {
  CollisionDetectionInput,
  CollisionResult,
  ChunkWithMetadata,
  EngineType,
} from './types';
import { VectorSearchClient, VectorSearchOptions } from '../lib/vector-search';

export interface SemanticSimilarityConfig {
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Maximum results per chunk */
  maxResultsPerChunk?: number;
  /** Include self-references */
  includeSelfReferences?: boolean;
  /** Weight for importance scores */
  importanceWeight?: number;
}

/**
 * Semantic Similarity Engine implementation
 * Uses pgvector for efficient cosine similarity searches across chunk embeddings
 */
export class SemanticSimilarityEngine extends BaseEngine {
  readonly type: EngineType = EngineType.SEMANTIC_SIMILARITY;
  private vectorClient: VectorSearchClient;
  private config: SemanticSimilarityConfig;

  constructor(config: SemanticSimilarityConfig = {}) {
    super();
    this.config = {
      threshold: 0.7,
      maxResultsPerChunk: 10,
      includeSelfReferences: false,
      importanceWeight: 0.3,
      ...config
    };
    this.vectorClient = new VectorSearchClient();
  }

  /**
   * Implements the abstract detectImpl method from BaseEngine
   */
  protected async detectImpl(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    const { sourceChunk, targetChunks } = input;
    const results: CollisionResult[] = [];

    // Get or extract embedding for source chunk
    const embedding = sourceChunk.metadata?.embedding || 
      await this.vectorClient.getChunkEmbedding(sourceChunk.id);
    
    if (!embedding) {
      console.warn(`No embedding found for chunk ${sourceChunk.id}`);
      return results;
    }

    // Search for similar chunks using pgvector
    const searchOptions: VectorSearchOptions = {
      threshold: this.config.threshold,
      limit: this.config.maxResultsPerChunk,
      excludeDocumentId: this.config.includeSelfReferences 
        ? undefined 
        : sourceChunk.metadata?.documentId
    };

    const matches = await this.vectorClient.searchSimilarChunks(
      Array.isArray(embedding) ? embedding : JSON.parse(embedding as any),
      searchOptions
    );

    // Convert matches to collision results
    for (const match of matches) {
      // Skip self-reference unless configured to include
      if (!this.config.includeSelfReferences && match.id === sourceChunk.id) {
        continue;
      }

      // Only include if match is in target chunks
      const isTargetChunk = targetChunks.some(tc => tc.id === match.id);
      if (!isTargetChunk) {
        continue;
      }

      // Calculate final score with importance weighting
      const importanceBoost = match.importance_score 
        ? match.importance_score * (this.config.importanceWeight || 0.3)
        : 0;
      const finalScore = Math.min(1.0, match.similarity + importanceBoost);

      results.push({
        sourceChunkId: sourceChunk.id,
        targetChunkId: match.id,
        engineType: 'semantic_similarity',
        score: finalScore,
        confidence: this.calculateConfidence(match.similarity),
        explanation: `Semantic similarity: ${(match.similarity * 100).toFixed(1)}%`,
        metadata: {
          rawSimilarity: match.similarity,
          importanceScore: match.importance_score || 0,
          themes: match.themes,
          summary: match.summary,
          thresholdUsed: this.config.threshold
        }
      });
    }

    return results;
  }

  /**
   * Checks if chunk has required metadata for semantic similarity
   */
  protected hasRequiredMetadata(chunk: ChunkWithMetadata): boolean {
    // We need either an embedding or a valid chunk ID to fetch the embedding
    return !!(chunk.metadata?.embedding || chunk.id);
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
}

// Export a factory function for easier instantiation
export function createSemanticSimilarityEngine(
  config?: SemanticSimilarityConfig
): SemanticSimilarityEngine {
  return new SemanticSimilarityEngine(config);
}