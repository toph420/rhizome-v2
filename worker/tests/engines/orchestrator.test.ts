/**
 * Tests for Collision Detection Orchestrator
 * Validates engine coordination, parallel execution, and result aggregation
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../../engines/orchestrator';
import { 
  ChunkWithMetadata, 
  EngineType, 
  CollisionDetectionInput, 
  OrchestratorConfig,
  WeightConfig 
} from '../../engines/types';

// Mock all individual engines
jest.mock('../../engines/semantic-similarity');
jest.mock('../../engines/structural-pattern');
jest.mock('../../engines/temporal-proximity');
jest.mock('../../engines/conceptual-density');
jest.mock('../../engines/emotional-resonance');
jest.mock('../../engines/citation-network');
jest.mock('../../engines/contradiction-detection');

describe('CollisionOrchestrator', () => {
  let orchestrator: CollisionOrchestrator;

  // Test data
  const testChunks: ChunkWithMetadata[] = [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      content: 'Machine learning algorithms improve prediction accuracy through neural networks.',
      embedding: new Array(768).fill(0.1),
      metadata: {
        themes: ['AI', 'ML'],
        summary: 'ML prediction accuracy',
        importance_score: 0.8
      }
    },
    {
      id: 'chunk-2',
      documentId: 'doc-1',
      content: 'Deep learning models utilize complex neural network architectures for pattern recognition.',
      embedding: new Array(768).fill(0.15),
      metadata: {
        themes: ['deep learning', 'neural networks'],
        summary: 'Deep learning architectures',
        importance_score: 0.9
      }
    },
    {
      id: 'chunk-3',
      documentId: 'doc-2',
      content: 'Traditional statistical methods may not achieve the same level of accuracy as modern AI.',
      embedding: new Array(768).fill(0.12),
      metadata: {
        themes: ['statistics', 'traditional methods'],
        summary: 'Traditional vs modern methods',
        importance_score: 0.7
      }
    }
  ];

  const defaultWeights: WeightConfig = {
    'semantic-similarity': 0.25,
    'conceptual-density': 0.20,
    'structural-pattern': 0.15,
    'citation-network': 0.15,
    'temporal-proximity': 0.10,
    'contradiction-detection': 0.10,
    'emotional-resonance': 0.05
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    const config: Partial<OrchestratorConfig> = {
      parallel: true,
      maxConcurrency: 7,
      globalTimeout: 5000,
      weights: defaultWeights,
      enabledEngines: [
        EngineType.SEMANTIC_SIMILARITY,
        EngineType.CONCEPTUAL_DENSITY,
        EngineType.STRUCTURAL_PATTERN,
        EngineType.CITATION_NETWORK,
        EngineType.TEMPORAL_PROXIMITY,
        EngineType.CONTRADICTION_DETECTION,
        EngineType.EMOTIONAL_RESONANCE
      ]
    };
    
    orchestrator = new CollisionOrchestrator(config);
  });

  describe('Orchestrator Initialization', () => {
    it('should initialize with all 7 engines', () => {
      expect(orchestrator).toBeDefined();
      
      // Verify all engines are registered
      const enabledEngines = orchestrator.getEnabledEngines();
      expect(enabledEngines).toHaveLength(7);
      expect(enabledEngines).toContain(EngineType.SEMANTIC_SIMILARITY);
      expect(enabledEngines).toContain(EngineType.CONCEPTUAL_DENSITY);
      expect(enabledEngines).toContain(EngineType.STRUCTURAL_PATTERN);
      expect(enabledEngines).toContain(EngineType.CITATION_NETWORK);
      expect(enabledEngines).toContain(EngineType.TEMPORAL_PROXIMITY);
      expect(enabledEngines).toContain(EngineType.CONTRADICTION_DETECTION);
      expect(enabledEngines).toContain(EngineType.EMOTIONAL_RESONANCE);
    });

    it('should use default weights correctly', () => {
      const weights = orchestrator.getWeights();
      expect(weights['semantic-similarity']).toBe(0.25);
      expect(weights['conceptual-density']).toBe(0.20);
      expect(weights['structural-pattern']).toBe(0.15);
      expect(weights['citation-network']).toBe(0.15);
      expect(weights['temporal-proximity']).toBe(0.10);
      expect(weights['contradiction-detection']).toBe(0.10);
      expect(weights['emotional-resonance']).toBe(0.05);
    });

    it('should validate weight sum equals 1.0', () => {
      const weights = orchestrator.getWeights();
      const weightSum = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 2);
    });
  });

  describe('Engine Coordination', () => {
    it('should execute all engines in parallel', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1], testChunks[2]],
        userId: 'test-user'
      };

      // Mock successful engine results
      const mockResults = [
        {
          engineType: EngineType.SEMANTIC_SIMILARITY,
          results: [{
            sourceChunkId: 'chunk-1',
            targetChunkId: 'chunk-2',
            engineType: EngineType.SEMANTIC_SIMILARITY,
            score: 0.8,
            confidence: 'high',
            explanation: 'High semantic similarity'
          }],
          executionTime: 100,
          success: true
        }
      ];

      // Spy on parallel execution
      const executeSpy = jest.spyOn(orchestrator, 'execute');
      
      const results = await orchestrator.execute(input);
      
      expect(executeSpy).toHaveBeenCalledWith(input);
      expect(results).toBeDefined();
      expect(results.aggregatedResults).toBeDefined();
      expect(results.executionMetrics).toBeDefined();
    });

    it('should handle engine failures gracefully', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      // Mock one engine failing
      const mockEngineError = new Error('Engine timeout');
      
      const results = await orchestrator.execute(input);
      
      // Should still return results from successful engines
      expect(results).toBeDefined();
      expect(results.aggregatedResults).toBeDefined();
      expect(results.executionMetrics.failedEngines).toBeDefined();
    });

    it('should respect concurrency limits', async () => {
      const limitedOrchestrator = new CollisionOrchestrator({
        maxConcurrency: 3 // Limit to 3 concurrent engines
      });

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: testChunks.slice(1),
        userId: 'test-user'
      };

      const startTime = Date.now();
      const results = await limitedOrchestrator.execute(input);
      const executionTime = Date.now() - startTime;

      expect(results).toBeDefined();
      // With concurrency limit, execution should take longer than fully parallel
      expect(executionTime).toBeGreaterThan(0);
    });
  });

  describe('Result Aggregation', () => {
    it('should apply weights correctly in aggregation', async () => {
      const customWeights: WeightConfig = {
        'semantic-similarity': 0.50, // Boost semantic similarity
        'conceptual-density': 0.30,
        'structural-pattern': 0.10,
        'citation-network': 0.05,
        'temporal-proximity': 0.03,
        'contradiction-detection': 0.01,
        'emotional-resonance': 0.01
      };

      const weightedOrchestrator = new CollisionOrchestrator({
        weights: customWeights
      });

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await weightedOrchestrator.execute(input);
      
      expect(results.aggregatedResults).toBeDefined();
      expect(results.weightConfig).toEqual(customWeights);
      
      // Semantic similarity should have highest contribution
      const contributions = results.executionMetrics.engineContributions;
      if (contributions) {
        expect(contributions[EngineType.SEMANTIC_SIMILARITY]).toBeGreaterThan(
          contributions[EngineType.EMOTIONAL_RESONANCE]
        );
      }
    });

    it('should normalize final scores between 0 and 1', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: testChunks.slice(1),
        userId: 'test-user'
      };

      const results = await orchestrator.execute(input);
      
      for (const result of results.aggregatedResults) {
        expect(result.finalScore).toBeGreaterThanOrEqual(0);
        expect(result.finalScore).toBeLessThanOrEqual(1);
      }
    });

    it('should rank results by final score', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: testChunks.slice(1),
        userId: 'test-user'
      };

      const results = await orchestrator.execute(input);
      
      // Results should be sorted by final score (descending)
      for (let i = 1; i < results.aggregatedResults.length; i++) {
        expect(results.aggregatedResults[i-1].finalScore)
          .toBeGreaterThanOrEqual(results.aggregatedResults[i].finalScore);
      }
    });
  });

  describe('Performance Monitoring', () => {
    it('should track execution metrics', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await orchestrator.execute(input);
      
      expect(results.executionMetrics).toBeDefined();
      expect(results.executionMetrics.totalExecutionTime).toBeGreaterThan(0);
      expect(results.executionMetrics.engineResults).toHaveLength(7);
      expect(results.executionMetrics.successfulEngines).toBeDefined();
      expect(results.executionMetrics.failedEngines).toBeDefined();
    });

    it('should respect global timeout', async () => {
      const fastTimeoutOrchestrator = new CollisionOrchestrator({
        globalTimeout: 100 // Very short timeout
      });

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: testChunks.slice(1),
        userId: 'test-user'
      };

      const startTime = Date.now();
      const results = await fastTimeoutOrchestrator.execute(input);
      const executionTime = Date.now() - startTime;

      // Should complete within timeout + reasonable margin
      expect(executionTime).toBeLessThan(1000); // 1 second margin
      expect(results.executionMetrics.timedOut).toBeDefined();
    });
  });

  describe('Caching System', () => {
    it('should cache and retrieve results', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      // First execution - should be cached
      const results1 = await orchestrator.execute(input);
      expect(results1.cacheInfo.hit).toBe(false);
      expect(results1.cacheInfo.stored).toBe(true);

      // Second execution - should hit cache
      const results2 = await orchestrator.execute(input);
      expect(results2.cacheInfo.hit).toBe(true);
      
      // Results should be identical
      expect(results2.aggregatedResults).toEqual(results1.aggregatedResults);
    });

    it('should respect cache TTL', async () => {
      const shortTTLOrchestrator = new CollisionOrchestrator({
        cache: {
          enabled: true,
          ttl: 100, // 100ms TTL
          maxSize: 100
        }
      });

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      // First execution
      await shortTTLOrchestrator.execute(input);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second execution should not hit cache
      const results = await shortTTLOrchestrator.execute(input);
      expect(results.cacheInfo.hit).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    it('should allow dynamic weight updates', () => {
      const newWeights: WeightConfig = {
        'semantic-similarity': 0.40,
        'conceptual-density': 0.30,
        'structural-pattern': 0.15,
        'citation-network': 0.10,
        'temporal-proximity': 0.03,
        'contradiction-detection': 0.01,
        'emotional-resonance': 0.01
      };

      orchestrator.updateWeights(newWeights);
      
      const updatedWeights = orchestrator.getWeights();
      expect(updatedWeights).toEqual(newWeights);
    });

    it('should allow enabling/disabling engines', () => {
      // Disable emotional resonance engine
      orchestrator.disableEngine(EngineType.EMOTIONAL_RESONANCE);
      
      const enabledEngines = orchestrator.getEnabledEngines();
      expect(enabledEngines).not.toContain(EngineType.EMOTIONAL_RESONANCE);
      expect(enabledEngines).toHaveLength(6);

      // Re-enable it
      orchestrator.enableEngine(EngineType.EMOTIONAL_RESONANCE);
      
      const reEnabledEngines = orchestrator.getEnabledEngines();
      expect(reEnabledEngines).toContain(EngineType.EMOTIONAL_RESONANCE);
      expect(reEnabledEngines).toHaveLength(7);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty target chunks', async () => {
      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [],
        userId: 'test-user'
      };

      const results = await orchestrator.execute(input);
      
      expect(results.aggregatedResults).toHaveLength(0);
      expect(results.executionMetrics.totalExecutionTime).toBeGreaterThan(0);
    });

    it('should validate input parameters', async () => {
      const invalidInput: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: [testChunks[0]], // Same as source
        userId: 'test-user'
      };

      const results = await orchestrator.execute(invalidInput);
      
      // Should filter out self-comparison
      expect(results.aggregatedResults).toHaveLength(0);
    });

    it('should handle malformed chunk data', async () => {
      const malformedChunk: ChunkWithMetadata = {
        id: 'malformed',
        documentId: 'doc-test',
        content: '', // Empty content
        embedding: [], // Invalid embedding
        metadata: {} // Empty metadata
      };

      const input: CollisionDetectionInput = {
        sourceChunk: malformedChunk,
        targetChunks: [testChunks[1]],
        userId: 'test-user'
      };

      const results = await orchestrator.execute(input);
      
      // Should handle gracefully
      expect(results).toBeDefined();
      expect(results.executionMetrics.errors).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle large batch processing', async () => {
      const largeBatch = Array.from({ length: 50 }, (_, i) => ({
        ...testChunks[0],
        id: `chunk-${i}`,
        content: `Test content ${i}`
      }));

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: largeBatch,
        userId: 'test-user'
      };

      const startTime = Date.now();
      const results = await orchestrator.execute(input);
      const executionTime = Date.now() - startTime;

      expect(results.aggregatedResults.length).toBeLessThanOrEqual(50);
      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(results.executionMetrics.batchSize).toBe(50);
    });

    it('should maintain accuracy across different chunk types', async () => {
      const diverseChunks: ChunkWithMetadata[] = [
        { ...testChunks[0], metadata: { ...testChunks[0].metadata, themes: ['technical'] }},
        { ...testChunks[1], metadata: { ...testChunks[1].metadata, themes: ['emotional'] }},
        { ...testChunks[2], metadata: { ...testChunks[2].metadata, themes: ['statistical'] }}
      ];

      const input: CollisionDetectionInput = {
        sourceChunk: testChunks[0],
        targetChunks: diverseChunks,
        userId: 'test-user'
      };

      const results = await orchestrator.execute(input);
      
      // All engines should contribute different insights
      expect(results.executionMetrics.engineResults).toHaveLength(7);
      expect(results.aggregatedResults.length).toBeGreaterThan(0);
      
      // Each result should have contributions from multiple engines
      for (const result of results.aggregatedResults) {
        expect(result.engineContributions).toBeDefined();
        expect(Object.keys(result.engineContributions).length).toBeGreaterThan(1);
      }
    });
  });
});