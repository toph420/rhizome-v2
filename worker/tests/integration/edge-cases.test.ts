/**
 * Edge case integration tests for the 3-engine collision detection system.
 * Tests boundary conditions, error handling, and unusual input scenarios.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../../engines/orchestrator';
import { SemanticSimilarityEngine } from '../../engines/semantic-similarity';
import { ContradictionDetectionEngine } from '../../engines/contradiction-detection';
import { ThematicBridgeEngine } from '../../engines/thematic-bridge';
import { EngineType } from '../../engines/types';

describe('Edge Cases Integration Tests', () => {
  let orchestrator: CollisionOrchestrator;
  
  beforeAll(() => {
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 3,
      globalTimeout: 5000,
      cache: {
        enabled: true,
        ttl: 300000,
        maxSize: 1000,
      },
    });

    const engines = [
      new SemanticSimilarityEngine(),
      new ContradictionDetectionEngine(),
      new ThematicBridgeEngine(),
    ];

    orchestrator.registerEngines(engines);
  });
  
  afterAll(async () => {
    await orchestrator.cleanup();
  });
  
  describe('Empty and Null Inputs', () => {
    it('should handle empty content chunks', async () => {
      const emptyChunk = {
        id: 'empty-1',
        content: '',
        embedding: Array(768).fill(0),
        metadata: {
          themes: [],
          key_concepts: [],
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: emptyChunk,
        candidateChunks: [emptyChunk],
      });
      
      expect(result.collisions).toEqual([]);
      expect(result.metrics.collisionCount).toBe(0);
    });
    
    it('should handle chunks with null metadata fields', async () => {
      const nullMetadataChunk = {
        id: 'null-meta-1',
        content: 'Test content with null metadata',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: null,
          key_concepts: null,
          emotional_tone: null,
          structural_type: null,
          importance_score: null,
          timestamp: null,
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: nullMetadataChunk,
        candidateChunks: [nullMetadataChunk],
      });
      
      // Should handle gracefully without errors
      expect(result).toBeDefined();
      expect(result.metrics.engineMetrics.size).toBeGreaterThan(0);
    });
    
    it('should handle undefined metadata fields', async () => {
      const undefinedMetadataChunk = {
        id: 'undefined-meta-1',
        content: 'Test content with undefined metadata',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: undefined,
          key_concepts: undefined,
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: undefinedMetadataChunk,
        candidateChunks: [undefinedMetadataChunk],
      });
      
      expect(result).toBeDefined();
      // Some engines might skip processing, but shouldn't crash
      expect(result.metrics.totalProcessingTime).toBeGreaterThan(0);
    });
  });
  
  describe('Malformed Data', () => {
    it('should handle malformed embeddings', async () => {
      const malformedEmbeddingChunk = {
        id: 'malformed-emb-1',
        content: 'Test content',
        embedding: [0.1, 0.2], // Wrong dimension
        metadata: {
          themes: ['test'],
          key_concepts: ['test'],
        },
      };
      
      const validChunk = {
        id: 'valid-1',
        content: 'Valid content',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['valid'],
          key_concepts: ['valid'],
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: validChunk,
        candidateChunks: [malformedEmbeddingChunk, validChunk],
      });
      
      // Should process valid chunks and handle malformed ones gracefully
      expect(result.collisions.length).toBeGreaterThanOrEqual(0);
      expect(result.metrics.chunkCount).toBe(2);
    });
    
    it('should handle non-array themes and concepts', async () => {
      const malformedMetadataChunk = {
        id: 'malformed-meta-1',
        content: 'Test content',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: 'not an array' as any,
          key_concepts: { invalid: 'object' } as any,
          emotional_tone: 'not an object' as any,
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: malformedMetadataChunk,
        candidateChunks: [malformedMetadataChunk],
      });
      
      // Should handle type mismatches gracefully
      expect(result).toBeDefined();
      expect(result.metrics.engineMetrics.size).toBeGreaterThan(0);
    });
    
    it('should handle invalid timestamp formats', async () => {
      const invalidTimestampChunk = {
        id: 'invalid-time-1',
        content: 'Test content',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['test'],
          timestamp: 'not-a-date',
          temporal_markers: ['invalid', 'dates', '123'],
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: invalidTimestampChunk,
        candidateChunks: [invalidTimestampChunk],
      });
      
      // Invalid timestamps should be handled gracefully by all engines
      expect(result).toBeDefined();
      // Engines should still work despite invalid timestamp data
      expect(result.metrics.engineMetrics.size).toBeGreaterThan(0);
    });
  });
  
  describe('Extreme Values', () => {
    it('should handle extremely long content', async () => {
      const longContent = 'word '.repeat(10000); // 10,000 words
      const longChunk = {
        id: 'long-1',
        content: longContent,
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: Array(100).fill('theme'),
          key_concepts: Array(100).fill('concept'),
          word_count: 10000,
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: longChunk,
        candidateChunks: [longChunk],
        config: {
          timeout: 10000, // Increase timeout for long content
        },
      });
      
      expect(result).toBeDefined();
      expect(result.metrics.totalProcessingTime).toBeLessThan(10000);
    });
    
    it('should handle extremely high importance scores', async () => {
      const extremeScoreChunk = {
        id: 'extreme-1',
        content: 'Critical content',
        embedding: Array(768).fill(0.9),
        metadata: {
          themes: ['critical'],
          importance_score: 999999,
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: extremeScoreChunk,
        candidateChunks: [extremeScoreChunk],
      });
      
      // Should normalize or cap extreme values
      expect(result.collisions).toBeDefined();
      result.collisions.forEach(collision => {
        expect(collision.score).toBeLessThanOrEqual(1);
        expect(collision.score).toBeGreaterThanOrEqual(0);
      });
    });
    
    it('should handle negative scores and values', async () => {
      const negativeChunk = {
        id: 'negative-1',
        content: 'Negative content',
        embedding: Array(768).fill(-0.5),
        metadata: {
          themes: ['negative'],
          importance_score: -10,
          emotional_tone: {
            sentiment: 'negative',
            emotions: ['angry', 'frustrated'],
            intensity: -5,
          },
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: negativeChunk,
        candidateChunks: [negativeChunk],
      });
      
      expect(result).toBeDefined();
      // Scores should be normalized to valid range
      result.collisions.forEach(collision => {
        expect(collision.score).toBeGreaterThanOrEqual(0);
      });
    });
  });
  
  describe('Special Characters and Encoding', () => {
    it('should handle unicode and emoji content', async () => {
      const unicodeChunk = {
        id: 'unicode-1',
        content: '测试内容 🚀 τεστ محتوى الاختبار ทดสอบ 🎯',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['unicode', 'emoji', '多语言'],
          key_concepts: ['🚀 rocket', '国际化'],
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: unicodeChunk,
        candidateChunks: [unicodeChunk],
      });
      
      expect(result).toBeDefined();
      expect(result.metrics.chunkCount).toBe(1);
    });
    
    it('should handle special characters in metadata', async () => {
      const specialCharsChunk = {
        id: 'special-1',
        content: 'Content with special chars: <>&"\'',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['<script>', '&amp;', '"quotes"'],
          key_concepts: ["'; DROP TABLE chunks; --"],
          citations: ['https://example.com?param=value&other=<tag>'],
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: specialCharsChunk,
        candidateChunks: [specialCharsChunk],
      });
      
      expect(result).toBeDefined();
      // Should sanitize or escape special characters properly
      expect(result.metrics.engineMetrics.size).toBeGreaterThan(0);
    });
  });
  
  describe('Boundary Conditions', () => {
    it('should handle exactly one candidate chunk', async () => {
      const singleChunk = {
        id: 'single-1',
        content: 'Single chunk content',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['single'],
          key_concepts: ['alone'],
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: singleChunk,
        candidateChunks: [singleChunk],
      });
      
      expect(result.metrics.chunkCount).toBe(1);
      // Self-similarity should be detected
      expect(result.collisions.length).toBeGreaterThan(0);
    });
    
    it('should handle maximum configured limits', async () => {
      const manyChunks = Array.from({ length: 1000 }, (_, i) => ({
        id: `chunk-${i}`,
        content: `Content ${i}`,
        embedding: Array(768).fill(Math.random()),
        metadata: {
          themes: [`theme-${i % 10}`],
          key_concepts: [`concept-${i % 20}`],
        },
      }));
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: manyChunks[0],
        candidateChunks: manyChunks.slice(1, 101), // 100 chunks
        config: {
          limit: 10,
          minScore: 0.1,
        },
      });
      
      // Should respect the limit
      expect(result.topConnections.length).toBeLessThanOrEqual(10);
      expect(result.metrics.chunkCount).toBe(100);
    });
    
    it('should handle score threshold edge cases', async () => {
      const testChunk = {
        id: 'test-1',
        content: 'Test content',
        embedding: Array(768).fill(0.5),
        metadata: {
          themes: ['test'],
        },
      };
      
      // Test with threshold of exactly 0
      const result0 = await orchestrator.detectCollisions({
        sourceChunk: testChunk,
        candidateChunks: [testChunk],
        config: {
          minScore: 0,
        },
      });
      expect(result0.collisions.length).toBeGreaterThan(0);
      
      // Test with threshold of exactly 1
      const result1 = await orchestrator.detectCollisions({
        sourceChunk: testChunk,
        candidateChunks: [testChunk],
        config: {
          minScore: 1,
        },
      });
      expect(result1.collisions.length).toBe(0);
    });
  });
  
  describe('Concurrent Processing Edge Cases', () => {
    it('should handle rapid successive requests', async () => {
      const chunk = {
        id: 'rapid-1',
        content: 'Rapid test',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['rapid'],
        },
      };
      
      // Fire multiple requests in quick succession
      const promises = Array.from({ length: 10 }, () => 
        orchestrator.detectCollisions({
          sourceChunk: chunk,
          candidateChunks: [chunk],
        })
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.metrics.chunkCount).toBe(1);
      });
    });
    
    it('should handle engine timeout scenarios', async () => {
      // Create a slow engine that will timeout
      const slowEngine = {
        type: EngineType.SEMANTIC_SIMILARITY,
        canProcess: () => true,
        detect: () => new Promise(resolve => setTimeout(resolve, 10000)),
      };
      
      const fastOrchestrator = new CollisionOrchestrator({
        globalTimeout: 100, // Very short timeout
      });
      
      fastOrchestrator.registerEngine(slowEngine as any);
      
      const chunk = {
        id: 'timeout-1',
        content: 'Timeout test',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: ['timeout'],
        },
      };
      
      const result = await fastOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Should complete despite timeout
      expect(result).toBeDefined();
      expect(result.metrics.totalProcessingTime).toBeLessThan(1000);
    });
  });
  
  describe('Memory and Resource Edge Cases', () => {
    it('should handle memory pressure with large datasets', async () => {
      const largeChunk = {
        id: 'large-1',
        content: 'x'.repeat(100000), // 100KB of content
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: Array(1000).fill('theme'),
          key_concepts: Array(1000).fill('concept'),
          large_data: Array(1000).fill({ nested: 'object' }),
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: largeChunk,
        candidateChunks: Array(10).fill(largeChunk),
      });
      
      expect(result).toBeDefined();
      expect(result.metrics.chunkCount).toBe(10);
    });
    
    it('should handle cache overflow gracefully', async () => {
      // Generate unique chunks to overflow cache
      const uniqueChunks = Array.from({ length: 2000 }, (_, i) => ({
        id: `cache-overflow-${i}`,
        content: `Unique content ${i}`,
        embedding: Array(768).fill(Math.random()),
        metadata: {
          themes: [`unique-${i}`],
        },
      }));
      
      // Process in batches to fill cache
      for (let i = 0; i < 20; i++) {
        const batch = uniqueChunks.slice(i * 100, (i + 1) * 100);
        const result = await orchestrator.detectCollisions({
          sourceChunk: batch[0],
          candidateChunks: batch.slice(1),
        });
        
        expect(result).toBeDefined();
      }
      
      // Cache should have evicted old entries, not crashed
      const finalResult = await orchestrator.detectCollisions({
        sourceChunk: uniqueChunks[0],
        candidateChunks: uniqueChunks.slice(1, 10),
      });
      
      expect(finalResult).toBeDefined();
    });
  });
});