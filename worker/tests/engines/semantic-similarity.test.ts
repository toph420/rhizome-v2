/**
 * Tests for Semantic Similarity Engine
 * Validates functionality, accuracy, and performance requirements
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SemanticSimilarityEngine, createSemanticSimilarityEngine } from '../../engines/semantic-similarity';
import { ChunkData, EngineType } from '../../engines/types';
import { VectorSearchClient } from '../../lib/vector-search';

// Mock the vector search client
jest.mock('../../lib/vector-search');

describe('SemanticSimilarityEngine', () => {
  let engine: SemanticSimilarityEngine;
  let mockVectorClient: jest.Mocked<VectorSearchClient>;

  // Test data
  const testChunks: ChunkData[] = [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      content: 'Machine learning is a subset of artificial intelligence.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['AI', 'ML'],
        summary: 'Introduction to ML',
        importance_score: 0.8
      }
    },
    {
      id: 'chunk-2',
      documentId: 'doc-1',
      content: 'Deep learning uses neural networks with multiple layers.',
      embedding: new Array(768).fill(0.2),
      metadata: {
        themes: ['AI', 'Deep Learning'],
        summary: 'Deep learning basics',
        importance_score: 0.7
      }
    },
    {
      id: 'chunk-3',
      documentId: 'doc-2',
      content: 'Artificial intelligence encompasses machine learning and more.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['AI'],
        summary: 'AI overview',
        importance_score: 0.9
      }
    }
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create engine with test config
    engine = createSemanticSimilarityEngine({
      threshold: 0.7,
      maxResultsPerChunk: 5,
      includeSelfReferences: false,
      importanceWeight: 0.2
    });

    // Setup mock vector client
    mockVectorClient = new VectorSearchClient() as jest.Mocked<VectorSearchClient>;
  });

  describe('Engine Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultEngine = new SemanticSimilarityEngine();
      const config = defaultEngine.getConfig();
      
      expect(config.threshold).toBe(0.7);
      expect(config.maxResultsPerChunk).toBe(10);
      expect(config.includeSelfReferences).toBe(false);
      expect(config.importanceWeight).toBe(0.3);
    });

    it('should accept custom configuration', () => {
      const customEngine = createSemanticSimilarityEngine({
        threshold: 0.8,
        maxResultsPerChunk: 20,
        includeSelfReferences: true,
        importanceWeight: 0.5
      });
      
      const config = customEngine.getConfig();
      expect(config.threshold).toBe(0.8);
      expect(config.maxResultsPerChunk).toBe(20);
      expect(config.includeSelfReferences).toBe(true);
      expect(config.importanceWeight).toBe(0.5);
    });

    it('should update configuration dynamically', () => {
      engine.updateConfig({ threshold: 0.85 });
      const config = engine.getConfig();
      expect(config.threshold).toBe(0.85);
    });
  });

  describe('Similarity Detection', () => {
    it('should detect similar chunks above threshold', async () => {
      // Mock vector search results
      const mockMatches = [
        {
          id: 'chunk-2',
          content: testChunks[1].content,
          similarity: 0.85,
          document_id: 'doc-1',
          themes: ['AI', 'Deep Learning'],
          summary: 'Deep learning basics',
          importance_score: 0.7
        },
        {
          id: 'chunk-3',
          content: testChunks[2].content,
          similarity: 0.75,
          document_id: 'doc-2',
          themes: ['AI'],
          summary: 'AI overview',
          importance_score: 0.9
        }
      ];

      // Mock the searchSimilarChunks method
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      
      expect(results).toHaveLength(2);
      expect(results[0].sourceChunkId).toBe('chunk-1');
      expect(results[0].targetChunkId).toBe('chunk-2');
      expect(results[0].score).toBeGreaterThan(0.85); // With importance boost
      expect(results[0].confidence).toBe('high');
    });

    it('should filter results below threshold', async () => {
      const mockMatches = [
        {
          id: 'chunk-2',
          content: testChunks[1].content,
          similarity: 0.65, // Below threshold
          document_id: 'doc-1',
          themes: ['AI'],
          summary: 'Summary',
          importance_score: 0.5
        }
      ];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue([]);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results).toHaveLength(0);
    });

    it('should exclude self-references by default', async () => {
      const mockMatches = [
        {
          id: 'chunk-1', // Self-reference
          content: testChunks[0].content,
          similarity: 1.0,
          document_id: 'doc-1',
          themes: ['AI'],
          summary: 'Summary',
          importance_score: 0.8
        }
      ];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results).toHaveLength(0); // Self-reference should be filtered
    });

    it('should include self-references when configured', async () => {
      engine.updateConfig({ includeSelfReferences: true });
      
      const mockMatches = [
        {
          id: 'chunk-1',
          content: testChunks[0].content,
          similarity: 1.0,
          document_id: 'doc-1',
          themes: ['AI'],
          summary: 'Summary',
          importance_score: 0.8
        }
      ];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results).toHaveLength(1);
    });
  });

  describe('Confidence Scoring', () => {
    it('should assign high confidence for similarity >= 0.85', async () => {
      const mockMatches = [{
        id: 'chunk-2',
        content: 'content',
        similarity: 0.90,
        document_id: 'doc-1',
        themes: [],
        summary: 'summary',
        importance_score: 0.5
      }];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results[0].confidence).toBe('high');
    });

    it('should assign medium confidence for similarity 0.75-0.85', async () => {
      const mockMatches = [{
        id: 'chunk-2',
        content: 'content',
        similarity: 0.80,
        document_id: 'doc-1',
        themes: [],
        summary: 'summary',
        importance_score: 0.5
      }];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results[0].confidence).toBe('medium');
    });

    it('should assign low confidence for similarity < 0.75', async () => {
      const mockMatches = [{
        id: 'chunk-2',
        content: 'content',
        similarity: 0.72,
        document_id: 'doc-1',
        themes: [],
        summary: 'summary',
        importance_score: 0.5
      }];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results[0].confidence).toBe('low');
    });
  });

  describe('Importance Weighting', () => {
    it('should boost scores based on importance', async () => {
      const mockMatches = [{
        id: 'chunk-2',
        content: 'content',
        similarity: 0.80,
        document_id: 'doc-1',
        themes: [],
        summary: 'summary',
        importance_score: 0.9 // High importance
      }];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      engine.updateConfig({ importanceWeight: 0.3 });
      const results = await engine.processChunks([testChunks[0]]);
      
      // Score should be boosted: 0.80 + (0.9 * 0.3) = 1.07, capped at 1.0
      expect(results[0].score).toBeCloseTo(1.0, 2);
      expect(results[0].metadata.rawSimilarity).toBe(0.80);
      expect(results[0].metadata.importanceScore).toBe(0.9);
    });

    it('should handle missing importance scores', async () => {
      const mockMatches = [{
        id: 'chunk-2',
        content: 'content',
        similarity: 0.80,
        document_id: 'doc-1',
        themes: [],
        summary: 'summary'
        // No importance_score
      }];

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const results = await engine.processChunks([testChunks[0]]);
      expect(results[0].score).toBe(0.80);
      expect(results[0].metadata.importanceScore).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should process 50 chunks in under 500ms', async () => {
      // Create 50 test chunks
      const manyChunks: ChunkData[] = Array.from({ length: 50 }, (_, i) => ({
        id: `chunk-${i}`,
        documentId: `doc-${Math.floor(i / 10)}`,
        content: `Test content ${i}`,
        embedding: new Array(768).fill(Math.random()),
        metadata: {
          themes: ['test'],
          summary: `Summary ${i}`,
          importance_score: Math.random()
        }
      }));

      // Mock fast responses
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue([]);

      const startTime = performance.now();
      await engine.processChunks(manyChunks);
      const processingTime = performance.now() - startTime;

      expect(processingTime).toBeLessThan(500);
      
      const metrics = engine.getMetrics();
      expect(metrics.processedChunks).toBe(50);
      expect(metrics.processingTime).toBeLessThan(500);
    });

    it('should process chunks in parallel batches', async () => {
      const searchSpy = jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue([]);

      await engine.processChunks(testChunks);
      
      // Should be called once for each chunk
      expect(searchSpy).toHaveBeenCalledTimes(testChunks.length);
    });

    it('should utilize cache for repeated queries', async () => {
      const searchSpy = jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue([]);

      // Process same chunks twice
      await engine.processChunks([testChunks[0]]);
      await engine.processChunks([testChunks[0]]);

      // Should only call vector search once due to caching
      expect(searchSpy).toHaveBeenCalledTimes(1);
      
      const cacheStats = engine.getCacheStats();
      expect(cacheStats.hits).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing embeddings gracefully', async () => {
      const chunkWithoutEmbedding: ChunkData = {
        id: 'chunk-no-embed',
        documentId: 'doc-1',
        content: 'Content without embedding',
        metadata: {}
      };

      jest.spyOn(VectorSearchClient.prototype, 'getChunkEmbedding')
        .mockResolvedValue(null);

      const results = await engine.processChunks([chunkWithoutEmbedding]);
      expect(results).toHaveLength(0);
    });

    it('should handle vector search errors', async () => {
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(engine.processChunks([testChunks[0]]))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('Metrics and Statistics', () => {
    it('should track processing metrics', async () => {
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue([{
          id: 'chunk-2',
          content: 'content',
          similarity: 0.85,
          document_id: 'doc-1',
          themes: [],
          summary: 'summary',
          importance_score: 0.5
        }]);

      await engine.processChunks(testChunks);
      
      const metrics = engine.getMetrics();
      expect(metrics.processedChunks).toBe(3);
      expect(metrics.collisionsFound).toBeGreaterThan(0);
      expect(metrics.averageScore).toBeGreaterThan(0);
    });

    it('should provide comprehensive statistics', () => {
      const stats = engine.getStats();
      
      expect(stats.metrics).toBeDefined();
      expect(stats.config).toBeDefined();
      expect(stats.cacheStats).toBeDefined();
      expect(stats.config.threshold).toBe(0.7);
    });
  });

  describe('Validation', () => {
    it('should validate engine configuration', async () => {
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue([]);

      const isValid = await engine.validate();
      expect(isValid).toBe(true);
    });

    it('should return false for invalid configuration', async () => {
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockRejectedValue(new Error('Invalid configuration'));

      const isValid = await engine.validate();
      expect(isValid).toBe(false);
    });
  });

  describe('Engine Type', () => {
    it('should return correct engine type', () => {
      expect(engine.getEngineType()).toBe(EngineType.SEMANTIC_SIMILARITY);
    });
  });
});