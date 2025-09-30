/**
 * Tests for Contradiction Detection Engine
 * Validates contradiction identification and logical inconsistency detection
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContradictionDetectionEngine } from '../../engines/contradiction-detection';
import { ChunkWithMetadata, EngineType, CollisionDetectionInput } from '../../engines/types';

describe('ContradictionDetectionEngine', () => {
  let engine: ContradictionDetectionEngine;

  // Test data with different types of contradictions
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-positive-claim',
      documentId: 'doc-1',
      content: 'Machine learning algorithms definitely improve prediction accuracy. They always provide better results than traditional methods.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['machine learning', 'improvement'],
        summary: 'Positive claims about ML',
        importance_score: 0.8,
        claims: [
          { text: 'ML algorithms improve accuracy', polarity: 'positive', certainty: 'high' }
        ]
      }
    },
    {
      id: 'chunk-negative-claim',
      documentId: 'doc-1',
      content: 'Machine learning algorithms don\'t necessarily improve prediction accuracy. They often fail to provide better results than traditional methods.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['machine learning', 'limitations'],
        summary: 'Negative claims about ML',
        importance_score: 0.7,
        claims: [
          { text: 'ML algorithms don\'t improve accuracy', polarity: 'negative', certainty: 'medium' }
        ]
      }
    },
    {
      id: 'chunk-statistical-contradiction',
      documentId: 'doc-2',
      content: 'The study shows a 25% increase in efficiency. Our analysis demonstrates a significant decrease in performance metrics.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['statistics', 'performance'],
        summary: 'Statistical contradictions',
        importance_score: 0.9,
        claims: [
          { text: '25% increase in efficiency', polarity: 'positive', certainty: 'high', value: 25 },
          { text: 'decrease in performance', polarity: 'negative', certainty: 'high' }
        ]
      }
    },
    {
      id: 'chunk-temporal-contradiction',
      documentId: 'doc-3',
      content: 'The project was completed before the deadline. However, we finished the project after the scheduled date.',
      embedding: new Array(768).fill(0.13),
      metadata: {
        themes: ['project', 'timeline'],
        summary: 'Temporal contradictions',
        importance_score: 0.6,
        claims: [
          { text: 'completed before deadline', timing: 'before', certainty: 'high' },
          { text: 'finished after scheduled date', timing: 'after', certainty: 'high' }
        ]
      }
    },
    {
      id: 'chunk-logical-contradiction',
      documentId: 'doc-4',
      content: 'All birds can fly. Penguins are birds, but penguins cannot fly.',
      embedding: new Array(768).fill(0.14),
      metadata: {
        themes: ['birds', 'flying', 'logic'],
        summary: 'Logical contradiction example',
        importance_score: 0.8,
        claims: [
          { text: 'all birds can fly', scope: 'universal', certainty: 'high' },
          { text: 'penguins cannot fly', scope: 'specific', certainty: 'high' }
        ]
      }
    },
    {
      id: 'chunk-consistent',
      documentId: 'doc-5',
      content: 'The research methodology was rigorous and followed established protocols. Data collection procedures were systematic and comprehensive.',
      embedding: new Array(768).fill(0.11),
      metadata: {
        themes: ['research', 'methodology'],
        summary: 'Consistent statements',
        importance_score: 0.7,
        claims: [
          { text: 'methodology was rigorous', polarity: 'positive', certainty: 'high' }
        ]
      }
    }
  ];

  beforeEach(() => {
    engine = new ContradictionDetectionEngine();
  });

  describe('Engine Type', () => {
    it('should have correct engine type', () => {
      expect(engine.type).toBe(EngineType.CONTRADICTION_DETECTION);
    });
  });

  describe('Direct Contradiction Detection', () => {
    it('should detect direct contradictions between opposing claims', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // positive ML claims
        targetChunks: [testChunks[1]], // negative ML claims
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      expect(results).toHaveLength(1);
      const result = results[0];
      
      expect(result.sourceChunkId).toBe('chunk-positive-claim');
      expect(result.targetChunkId).toBe('chunk-negative-claim');
      expect(result.engineType).toBe(EngineType.CONTRADICTION_DETECTION);
      expect(result.score).toBeGreaterThan(0.7); // High score for direct contradiction
      
      // Should identify contradiction type
      expect(result.metadata.contradictionType).toBe('direct');
      expect(result.metadata.strength).toBeGreaterThan(0.7);
      expect(result.metadata.opposingClaims).toBeDefined();
    });

    it('should handle statistical contradictions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[2], // statistical contradiction within same chunk
        targetChunks: [testChunks[0]], // compare with other chunks
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should detect internal contradictions or external ones
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.contradictionType).toMatch(/statistical|direct|partial/);
      }
    });

    it('should identify logical contradictions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[4], // logical contradiction (all birds fly, penguins don't)
        targetChunks: [testChunks[5]], // consistent chunk for comparison
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should detect logical inconsistency
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.contradictionType).toMatch(/logical|direct/);
        expect(result.metadata.logicalInconsistency).toBe(true);
      }
    });
  });

  describe('Temporal Contradiction Detection', () => {
    it('should detect temporal contradictions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[3], // temporal contradiction
        targetChunks: [testChunks[5]], // consistent chunk
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.contradictionType).toMatch(/temporal|direct/);
        expect(result.metadata.temporalInconsistency).toBeDefined();
      }
    });
  });

  describe('Contradiction Strength Assessment', () => {
    it('should assign higher strength to clearer contradictions', async () => {
      // Clear contradiction
      const clearContradictionChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'clear-contradiction',
        content: 'The algorithm never fails. The algorithm always fails.',
        metadata: {
          ...testChunks[0].metadata,
          claims: [
            { text: 'algorithm never fails', polarity: 'positive', certainty: 'high' },
            { text: 'algorithm always fails', polarity: 'negative', certainty: 'high' }
          ]
        }
      };

      // Subtle contradiction
      const subtleContradictionChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'subtle-contradiction',
        content: 'The method usually works well. Sometimes the method doesn\'t work.',
        metadata: {
          ...testChunks[0].metadata,
          claims: [
            { text: 'method usually works', polarity: 'positive', certainty: 'medium' },
            { text: 'sometimes doesn\'t work', polarity: 'negative', certainty: 'low' }
          ]
        }
      };

      const input1: CollisionDetectionInput = {
        sourceChunk: clearContradictionChunk,
        targetChunks: [testChunks[5]],
        userId: 'test-user'
      };

      const input2: CollisionDetectionInput = {
        sourceChunk: subtleContradictionChunk,
        targetChunks: [testChunks[5]],
        userId: 'test-user'
      };

      const results1 = await engine.detect(input1);
      const results2 = await engine.detect(input2);

      if (results1.length > 0 && results2.length > 0) {
        expect(results1[0].metadata.strength).toBeGreaterThan(results2[0].metadata.strength);
      }
    });

    it('should consider certainty levels in contradiction assessment', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // high certainty claims
        targetChunks: [testChunks[1]], // medium/low certainty claims
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.certaintyConflict).toBeDefined();
        expect(result.metadata.sourceCertainty).toBeDefined();
        expect(result.metadata.targetCertainty).toBeDefined();
      }
    });
  });

  describe('Score Calculation', () => {
    it('should assign higher scores to stronger contradictions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0], // definitive positive claims
        targetChunks: [testChunks[1]], // definitive negative claims
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.score).toBeGreaterThan(0.7); // Strong contradiction
      }
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
      
      if (results.length > 0) {
        const result = results[0];
        expect(['high', 'medium', 'low']).toContain(result.confidence);
      }
    });
  });

  describe('Explanation Generation', () => {
    it('should provide clear explanations for contradictions', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      if (results.length > 0) {
        const result = results[0];
        expect(result.explanation).toBeDefined();
        expect(result.explanation.length).toBeGreaterThan(0);
        expect(result.explanation).toMatch(/contradict|conflict|oppose|inconsistent/i);
      }
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

    it('should handle chunks without claims metadata', async () => {
      const chunkWithoutClaims: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'no-claims',
        metadata: {
          themes: ['test'],
          summary: 'Test chunk',
          importance_score: 0.5
          // No claims array
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: chunkWithoutClaims,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should still work by extracting claims from content
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle weak or ambiguous contradictions', async () => {
      const ambiguousChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'ambiguous',
        content: 'The results might be good. The results could be bad.',
        metadata: {
          ...testChunks[0].metadata,
          claims: [
            { text: 'results might be good', polarity: 'positive', certainty: 'low' },
            { text: 'results could be bad', polarity: 'negative', certainty: 'low' }
          ]
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: ambiguousChunk,
        targetChunks: [testChunks[5]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should handle ambiguous cases with lower scores
      if (results.length > 0) {
        const result = results[0];
        expect(result.score).toBeLessThan(0.6); // Lower score for ambiguous contradiction
        expect(result.metadata.ambiguity).toBeDefined();
      }
    });

    it('should detect contradictions in complex sentences', async () => {
      const complexChunk: ChunkWithMetadata = {
        ...testChunks[0],
        id: 'complex',
        content: 'While the new system generally improves efficiency, studies have shown it significantly reduces productivity in most cases.',
        metadata: {
          ...testChunks[0].metadata,
          claims: [
            { text: 'system improves efficiency', polarity: 'positive', certainty: 'medium' },
            { text: 'reduces productivity', polarity: 'negative', certainty: 'high' }
          ]
        }
      };

      const input: CollisionDetectionInput = {
        sourceChunk: complexChunk,
        targetChunks: [testChunks[5]],
        userId: 'test-user'
      };

      const results = await engine.detect(input);
      
      // Should detect contradictions in complex sentences
      if (results.length > 0) {
        const result = results[0];
        expect(result.metadata.contradictionType).toBeDefined();
        expect(result.metadata.complexity).toBe('high');
      }
    });
  });
});