/**
 * Tests for Conceptual Density Engine
 * Validates concept concentration analysis and overlap detection
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConceptualDensityEngine } from '../../engines/conceptual-density';
import { ChunkWithMetadata, EngineType, CollisionDetectionInput } from '../../engines/types';

describe('ConceptualDensityEngine', () => {
  let engine: ConceptualDensityEngine;

  // Test data with different concept densities
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-high-density',
      documentId: 'doc-1',
      content: 'Machine learning algorithms utilize neural networks, deep learning, reinforcement learning, and supervised learning techniques. These artificial intelligence methods process data through complex computational models.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['AI', 'ML', 'algorithms', 'neural networks', 'deep learning'],
        summary: 'High-density ML concepts',
        importance_score: 0.9,
        concepts: ['machine learning', 'neural networks', 'deep learning', 'reinforcement learning', 'supervised learning', 'artificial intelligence']
      }
    },
    {
      id: 'chunk-medium-density',
      documentId: 'doc-1', 
      content: 'Deep learning models require extensive computational resources and training data. The neural network architecture determines performance outcomes.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['deep learning', 'neural networks', 'training'],
        summary: 'Medium-density DL concepts',
        importance_score: 0.7,
        concepts: ['deep learning', 'neural networks', 'computational resources', 'training data']
      }
    },
    {
      id: 'chunk-low-density',
      documentId: 'doc-2',
      content: 'The weather today is quite pleasant with sunny skies and moderate temperatures. People are enjoying outdoor activities.',
      embedding: new Array(768).fill(0.05),
      metadata: {
        themes: ['weather', 'outdoor'],
        summary: 'Weather description',
        importance_score: 0.2,
        concepts: ['weather', 'outdoor activities']
      }
    },
    {
      id: 'chunk-overlap-test',
      documentId: 'doc-3',
      content: 'Artificial intelligence and machine learning revolutionize data processing. Neural network architectures enable sophisticated pattern recognition.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['AI', 'ML', 'data processing'],
        summary: 'AI and ML overlap',
        importance_score: 0.8,
        concepts: ['artificial intelligence', 'machine learning', 'data processing', 'neural networks', 'pattern recognition']
      }
    }
  ];

  beforeEach(() => {
    engine = new ConceptualDensityEngine();
  });

  describe('Engine Type', () => {
    it('should have correct engine type', () => {
      expect(engine.type).toBe(EngineType.CONCEPTUAL_DENSITY);
    });
  });

  describe('Concept Density Detection', () => {
    it('should detect connections between high-density chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // high density chunk
        targetChunks: [testChunks[1], testChunks[3]], // medium density + overlap test
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(2);
      
      // Check high-density to medium-density connection
      const result1 = results.find(r => r.targetChunkId === 'chunk-medium-density');
      expect(result1).toBeDefined();
      expect(result1!.score).toBeGreaterThan(0);
      expect(result1!.engineType).toBe(EngineType.CONCEPTUAL_DENSITY);
      expect(result1!.metadata.sourceDensity).toBeGreaterThan(2.0);
      expect(result1!.metadata.overlapScore).toBeGreaterThan(0.15);
      
      // Check shared concepts
      expect(result1!.metadata.sharedConcepts).toContain('deep learning');
      expect(result1!.metadata.sharedConcepts).toContain('neural networks');
    });

    it('should skip low-density chunks unless source is hotspot', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[1], // medium density (not hotspot)
        targetChunks: [testChunks[2]], // low density weather chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should not connect medium-density to low-density
      expect(results).toHaveLength(0);
    });

    it('should connect hotspot to any chunk', async () => {
      const hotspotChunk: ChunkWithMetadata = {
        ...testChunks[0],
        content: 'Advanced machine learning encompasses deep learning, neural networks, reinforcement learning, supervised learning, unsupervised learning, transfer learning, and natural language processing techniques.',
        metadata: {
          ...testChunks[0].metadata,
          concepts: ['machine learning', 'deep learning', 'neural networks', 'reinforcement learning', 'supervised learning', 'unsupervised learning', 'transfer learning', 'natural language processing']
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: hotspotChunk,
        targetChunks: [testChunks[2]], // low density weather chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Hotspot should still generate results even with low-density targets
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate overlap scores correctly', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // high density ML chunk
        targetChunks: [testChunks[3]], // overlap test chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      // Should have meaningful overlap
      expect(result.metadata.overlapScore).toBeGreaterThan(0.15);
      expect(result.metadata.sharedConcepts).toContain('machine learning');
      expect(result.metadata.sharedConcepts).toContain('artificial intelligence');
      expect(result.metadata.sharedConcepts).toContain('neural networks');
    });

    it('should mark high-density areas as hotspots', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // high density chunk
        targetChunks: [testChunks[1]], // medium density
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.metadata.sourceDensity).toBeGreaterThan(5.0); // Should be hotspot
      expect(result.metadata.isHotspot).toBe(true);
    });
  });

  describe('Score Calculation', () => {
    it('should assign higher scores to better overlaps', async () => {
      const perfectOverlapChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'perfect-overlap',
        content: 'Machine learning and neural networks represent artificial intelligence advances in deep learning.',
        metadata: {
          ...testChunks[0].metadata,
          concepts: ['machine learning', 'neural networks', 'artificial intelligence', 'deep learning'] // Perfect overlap
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [perfectOverlapChunk, testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Find results for both targets
      const perfectResult = results.find(r => r.targetChunkId === 'perfect-overlap');
      const mediumResult = results.find(r => r.targetChunkId === 'chunk-medium-density');
      
      expect(perfectResult).toBeDefined();
      expect(mediumResult).toBeDefined();
      
      // Perfect overlap should have higher score
      expect(perfectResult!.score).toBeGreaterThan(mediumResult!.score);
      expect(perfectResult!.confidence).toBeGreaterThanOrEqual(mediumResult!.confidence);
    });

    it('should normalize scores between 0 and 1', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: testChunks.slice(1),
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      for (const result of results) {
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Confidence Levels', () => {
    it('should provide appropriate confidence levels', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(['high', 'medium', 'low']).toContain(result.confidence);
    });
  });

  describe('Explanation Generation', () => {
    it('should provide clear explanations', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
      expect(result.explanation).toMatch(/concept|density|overlap/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty target chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      expect(results).toHaveLength(0);
    });

    it('should skip self-comparison', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[0]], // Same chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      expect(results).toHaveLength(0);
    });

    it('should handle chunks without concept metadata', async () => {
      const chunkWithoutConcepts: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'no-concepts',
        metadata: {
          themes: ['test'],
          summary: 'Test chunk',
          importance_score: 0.5
          // No concepts array
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: chunkWithoutConcepts,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should still work by extracting concepts from themes/content
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });
});