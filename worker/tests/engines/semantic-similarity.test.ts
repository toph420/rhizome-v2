/**
 * Tests for Semantic Similarity Engine
 * Validates functionality, accuracy, and performance requirements
 * Updated for 3-engine system with BaseEngine interface
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SemanticSimilarityEngine, createSemanticSimilarityEngine } from '../../engines/semantic-similarity';
import { ChunkWithMetadata, EngineType, CollisionDetectionInput } from '../../engines/types';
import { VectorSearchClient } from '../../lib/vector-search';

// Mock the vector search client
jest.mock('../../lib/vector-search');

describe('SemanticSimilarityEngine', () => {
  let engine: SemanticSimilarityEngine;
  let mockVectorClient: jest.Mocked<VectorSearchClient>;

  // Test data - using ChunkWithMetadata format
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-1',
      document_id: 'doc-1',
      content: 'Machine learning is a subset of artificial intelligence.',
      chunk_index: 0,
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['AI', 'ML'],
        summary: 'Introduction to ML',
        importance: 0.8
      }
    },
    {
      id: 'chunk-2',
      document_id: 'doc-1',
      content: 'Deep learning uses neural networks with multiple layers.',
      chunk_index: 1,
      embedding: new Array(768).fill(0.2),
      metadata: {
        themes: ['AI', 'Deep Learning'],
        summary: 'Deep learning basics',
        importance: 0.7
      }
    },
    {
      id: 'chunk-3',
      document_id: 'doc-2',
      content: 'Artificial intelligence encompasses machine learning and more.',
      chunk_index: 0,
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['AI'],
        summary: 'AI overview',
        importance: 0.9
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

    it('should return correct engine type', () => {
      expect(engine.type).toBe(EngineType.SEMANTIC_SIMILARITY);
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

      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockResolvedValue(mockMatches);

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };
      const results = await engine.detect(input);

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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);
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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[0]] // Include self in target chunks
      };
      const results = await engine.detect(input);
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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[0]]
      };
      const results = await engine.detect(input);
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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);
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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);
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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);
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
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);

      // Score should be boosted: 0.80 + (0.9 * 0.3) = 1.07, capped at 1.0
      expect(results[0].score).toBeCloseTo(1.0, 2);
      expect(results[0].metadata?.rawSimilarity).toBe(0.80);
      expect(results[0].metadata?.importanceScore).toBe(0.9);
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

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);
      expect(results[0].score).toBe(0.80);
      expect(results[0].metadata?.importanceScore).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing embeddings gracefully', async () => {
      const chunkWithoutEmbedding: ChunkWithMetadata = {
        id: 'chunk-no-embed',
        document_id: 'doc-1',
        content: 'Content without embedding',
        chunk_index: 0,
        metadata: {}
      };

      jest.spyOn(VectorSearchClient.prototype, 'getChunkEmbedding')
        .mockResolvedValue(null);

      const input: CollisionDetectionInput = {
        sourceChunk: chunkWithoutEmbedding,
        targetChunks: [testChunks[1]]
      };
      const results = await engine.detect(input);
      expect(results).toHaveLength(0);
    });

    it('should handle vector search errors', async () => {
      jest.spyOn(VectorSearchClient.prototype, 'searchSimilarChunks')
        .mockRejectedValue(new Error('Database connection failed'));

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      await expect(engine.detect(input))
        .rejects.toThrow('Database connection failed');
    });

    it('should return empty array for empty target chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: []
      };
      const results = await engine.detect(input);
      expect(results).toHaveLength(0);
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

    it('should validate input before processing', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };
      expect(engine.canProcess(input)).toBe(true);
    });
  });
});
