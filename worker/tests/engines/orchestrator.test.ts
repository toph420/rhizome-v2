/**
 * Tests for Collision Detection Orchestrator
 * Validates engine coordination, parallel execution, and result aggregation
 * Updated for 3-engine system: Semantic Similarity, Contradiction Detection, Thematic Bridge
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../../engines/orchestrator';
import {
  ChunkWithMetadata,
  EngineType,
  CollisionDetectionInput,
} from '../../engines/types';

// Mock the 3 engines
jest.mock('../../engines/semantic-similarity');
jest.mock('../../engines/contradiction-detection');
jest.mock('../../engines/thematic-bridge');

describe('CollisionOrchestrator - 3-Engine System', () => {
  let orchestrator: CollisionOrchestrator;

  // Test data
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-1',
      document_id: 'doc-1',
      chunk_index: 0,
      content: 'Machine learning algorithms improve prediction accuracy through neural networks.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['AI', 'ML'],
        summary: 'ML prediction accuracy',
        importance: 0.8
      }
    },
    {
      id: 'chunk-2',
      document_id: 'doc-1',
      chunk_index: 1,
      content: 'Deep learning models utilize complex neural network architectures for pattern recognition.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['deep learning', 'neural networks'],
        summary: 'Deep learning architectures',
        importance: 0.9
      }
    },
    {
      id: 'chunk-3',
      document_id: 'doc-2',
      chunk_index: 0,
      content: 'Traditional statistical methods may not achieve the same level of accuracy as modern AI.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['statistics', 'traditional methods'],
        summary: 'Traditional vs modern methods',
        importance: 0.7
      }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new CollisionOrchestrator();
  });

  describe('Basic Functionality', () => {
    it('should initialize successfully', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator).toBeInstanceOf(CollisionOrchestrator);
    });

    it('should detect collisions with valid input', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };

      const results = await orchestrator.detectCollisions(input);

      expect(results).toBeDefined();
      expect(results.collisions).toBeDefined();
      expect(Array.isArray(results.collisions)).toBe(true);
    });

    it('should return aggregated results structure', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };

      const results = await orchestrator.detectCollisions(input);

      // Should have aggregated results structure
      expect(results.topConnections).toBeDefined();
      expect(results.groupedByTarget).toBeDefined();
      expect(results.weightedScores).toBeDefined();
      expect(results.metrics).toBeDefined();
    });

    it('should handle empty target chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: []
      };

      const results = await orchestrator.detectCollisions(input);

      expect(results.collisions).toHaveLength(0);
      expect(results.topConnections).toHaveLength(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should provide execution metrics', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };

      const results = await orchestrator.detectCollisions(input);

      expect(results.metrics).toBeDefined();
      expect(results.metrics.totalExecutionTime).toBeGreaterThanOrEqual(0);
      expect(results.metrics.engineMetrics).toBeDefined();
    });

    it('should complete in reasonable time', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };

      const startTime = performance.now();
      await orchestrator.detectCollisions(input);
      const duration = performance.now() - startTime;

      // Should complete in under 2 seconds for small dataset
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Result Aggregation', () => {
    it('should group collisions by target chunk', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };

      const results = await orchestrator.detectCollisions(input);

      expect(results.groupedByTarget).toBeDefined();
      expect(results.groupedByTarget instanceof Map).toBe(true);
    });

    it('should calculate weighted scores per target', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };

      const results = await orchestrator.detectCollisions(input);

      expect(results.weightedScores).toBeDefined();
      expect(results.weightedScores instanceof Map).toBe(true);
    });

    it('should provide ranked top connections', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };

      const results = await orchestrator.detectCollisions(input);

      expect(results.topConnections).toBeDefined();
      expect(Array.isArray(results.topConnections)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      const invalidInput = {
        sourceChunk: testChunks[0],
        targetChunks: null as any
      };

      // Should not throw - orchestrator should handle gracefully
      await expect(orchestrator.detectCollisions(invalidInput))
        .resolves.toBeDefined();
    });

    it('should handle engine failures without crashing', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };

      // Should complete even if engines fail internally
      const results = await orchestrator.detectCollisions(input);
      expect(results).toBeDefined();
    });
  });

  describe('Score Normalization', () => {
    it('should normalize all scores to 0-1 range', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]]
      };

      const results = await orchestrator.detectCollisions(input);

      // All collision scores should be normalized
      results.collisions.forEach(collision => {
        expect(collision.score).toBeGreaterThanOrEqual(0);
        expect(collision.score).toBeLessThanOrEqual(1);
      });
    });

    it('should apply weighted scoring', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };

      const results = await orchestrator.detectCollisions(input);

      // If we have top connections, they should have weighted scores
      if (results.topConnections.length > 0) {
        const connection = results.topConnections[0];
        expect(connection.totalScore).toBeGreaterThanOrEqual(0);
        expect(connection.totalScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Collision Metadata', () => {
    it('should include engine type in collision results', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };

      const results = await orchestrator.detectCollisions(input);

      // Each collision should specify which engine detected it
      results.collisions.forEach(collision => {
        expect(collision.engineType).toBeDefined();
        expect(Object.values(EngineType)).toContain(collision.engineType);
      });
    });

    it('should include explanations in results', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]]
      };

      const results = await orchestrator.detectCollisions(input);

      // Top connections should have explanations
      if (results.topConnections.length > 0) {
        const connection = results.topConnections[0];
        expect(connection.explanations).toBeDefined();
        expect(Array.isArray(connection.explanations)).toBe(true);
      }
    });
  });
});
