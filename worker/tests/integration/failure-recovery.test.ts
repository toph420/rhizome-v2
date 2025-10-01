/**
 * Failure recovery integration tests for the 3-engine collision detection system.
 * Tests system resilience, error handling, and recovery mechanisms.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../../engines/orchestrator';
import { SemanticSimilarityEngine } from '../../engines/semantic-similarity';
import { ContradictionDetectionEngine } from '../../engines/contradiction-detection';
import { ThematicBridgeEngine } from '../../engines/thematic-bridge';
import { EngineType } from '../../engines/types';

describe('Failure Recovery Integration Tests', () => {
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
      errorHandling: {
        retryAttempts: 2,
        retryDelay: 100,
        fallbackMode: true,
        circuitBreaker: {
          enabled: true,
          threshold: 5,
          timeout: 60000,
        },
      },
    });
  });
  
  afterAll(async () => {
    await orchestrator.cleanup();
  });
  
  describe('Engine Failure Recovery', () => {
    it('should recover from single engine failure', async () => {
      // Create an engine that fails on first call
      let callCount = 0;
      const failOnceEngine = {
        type: EngineType.SEMANTIC_SIMILARITY,
        canProcess: () => true,
        detect: jest.fn(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error('Temporary failure'));
          }
          return Promise.resolve([{
            sourceChunkId: 'source',
            targetChunkId: 'target',
            score: 0.8,
            engineType: EngineType.SEMANTIC_SIMILARITY,
            explanation: 'Recovered after failure',
            metadata: {},
          }]);
        }),
      };
      
      const testOrchestrator = new CollisionOrchestrator({
        errorHandling: {
          retryAttempts: 2,
          retryDelay: 10,
        },
      });
      
      testOrchestrator.registerEngine(failOnceEngine as any);
      testOrchestrator.registerEngine(new ContradictionDetectionEngine());
      
      const chunk = createTestChunk('test-1');
      
      const result = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Should retry and succeed
      expect(failOnceEngine.detect).toHaveBeenCalledTimes(2);
      expect(result.collisions.length).toBeGreaterThan(0);
      
      await testOrchestrator.cleanup();
    });
    
    it('should handle multiple engine failures gracefully', async () => {
      const failingEngines = [
        createFailingEngine(EngineType.SEMANTIC_SIMILARITY),
        createFailingEngine(EngineType.CONTRADICTION_DETECTION),
      ];

      const workingEngines = [
        new ThematicBridgeEngine(),
      ];

      const testOrchestrator = new CollisionOrchestrator();
      [...failingEngines, ...workingEngines].forEach(e => testOrchestrator.registerEngine(e));

      const chunk = createTestChunk('multi-fail');

      const result = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });

      // Should get results from working engines
      expect(result.collisions).toBeDefined();
      const workingEngineTypes = new Set(result.collisions.map(c => c.engineType));
      expect(workingEngineTypes.size).toBeGreaterThanOrEqual(1);

      // Metrics should track failures
      const failedEngines = Array.from(result.metrics.engineMetrics.entries())
        .filter(([_, metrics]) => metrics.errors > 0);
      expect(failedEngines.length).toBe(2);

      await testOrchestrator.cleanup();
    });
    
    it('should implement circuit breaker pattern', async () => {
      const alwaysFailingEngine = {
        type: EngineType.SEMANTIC_SIMILARITY,
        canProcess: () => true,
        detect: jest.fn(() => Promise.reject(new Error('Persistent failure'))),
      };
      
      const testOrchestrator = new CollisionOrchestrator({
        errorHandling: {
          circuitBreaker: {
            enabled: true,
            threshold: 3,
            timeout: 1000,
          },
        },
      });
      
      testOrchestrator.registerEngine(alwaysFailingEngine as any);
      testOrchestrator.registerEngine(new ContradictionDetectionEngine());
      
      const chunk = createTestChunk('circuit-breaker');
      
      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await testOrchestrator.detectCollisions({
          sourceChunk: chunk,
          candidateChunks: [chunk],
        });
      }
      
      // After threshold, engine should be skipped (circuit open)
      expect(alwaysFailingEngine.detect).toHaveBeenCalledTimes(3);
      
      // Wait for circuit timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Circuit should be half-open, allowing one more attempt
      await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      expect(alwaysFailingEngine.detect).toHaveBeenCalledTimes(4);
      
      await testOrchestrator.cleanup();
    });
  });
  
  describe('Data Corruption Recovery', () => {
    it('should handle corrupted chunk data', async () => {
      const corruptedChunks = [
        {
          id: 'corrupt-1',
          content: null as any, // Null content
          embedding: Array(768).fill(0.1),
          metadata: { themes: ['test'] },
        },
        {
          id: 'corrupt-2',
          content: 'Valid content',
          embedding: null as any, // Null embedding
          metadata: { themes: ['test'] },
        },
        {
          id: 'corrupt-3',
          content: 'Valid content',
          embedding: Array(768).fill(0.1),
          metadata: null as any, // Null metadata
        },
        {
          id: 'valid',
          content: 'Valid content',
          embedding: Array(768).fill(0.1),
          metadata: { themes: ['test'] },
        },
      ];
      
      orchestrator.registerEngines([
        new SemanticSimilarityEngine(),
        new ContradictionDetectionEngine(),
      ]);
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: corruptedChunks[3], // Valid source
        candidateChunks: corruptedChunks,
      });
      
      // Should process valid chunks and skip corrupted ones
      expect(result).toBeDefined();
      expect(result.metrics.chunkCount).toBe(4);
      // Should find collision with the valid chunk
      const validCollisions = result.collisions.filter(c => c.targetChunkId === 'valid');
      expect(validCollisions.length).toBeGreaterThan(0);
    });
    
    it('should handle partially corrupted metadata', async () => {
      const partiallyCorruptedChunk = {
        id: 'partial-corrupt',
        content: 'Test content',
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: 'not-an-array' as any, // Wrong type
          key_concepts: undefined,
          emotional_tone: { corrupt: 'data' } as any,
          timestamp: 'invalid-date',
          importance_score: 'not-a-number' as any,
        },
      };
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: partiallyCorruptedChunk,
        candidateChunks: [partiallyCorruptedChunk],
      });
      
      // Should handle gracefully with fallbacks
      expect(result).toBeDefined();
      // Some engines might skip, but shouldn't crash
      expect(result.metrics.totalProcessingTime).toBeGreaterThan(0);
    });
  });
  
  describe('Resource Exhaustion Recovery', () => {
    it('should handle memory pressure gracefully', async () => {
      // Create very large chunks to simulate memory pressure
      const largeChunks = Array.from({ length: 100 }, (_, i) => ({
        id: `large-${i}`,
        content: 'x'.repeat(10000), // 10KB per chunk
        embedding: Array(768).fill(0.1),
        metadata: {
          themes: Array(100).fill('theme'),
          key_concepts: Array(100).fill('concept'),
          large_data: Array(1000).fill({ nested: 'data' }),
        },
      }));
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: largeChunks[0],
        candidateChunks: largeChunks,
        config: {
          memoryLimit: 100 * 1024 * 1024, // 100MB limit
          lowMemoryMode: true,
        },
      });
      
      // Should complete without crashing
      expect(result).toBeDefined();
      expect(result.metrics.chunkCount).toBe(100);
    });
    
    it('should handle timeout scenarios', async () => {
      // Create slow engines
      const slowEngines = [
        createSlowEngine(EngineType.SEMANTIC_SIMILARITY, 3000),
        createSlowEngine(EngineType.CONTRADICTION_DETECTION, 3000),
      ];

      const fastOrchestrator = new CollisionOrchestrator({
        globalTimeout: 1000, // 1 second timeout
        errorHandling: {
          timeoutFallback: true,
        },
      });

      slowEngines.forEach(e => fastOrchestrator.registerEngine(e));
      fastOrchestrator.registerEngine(new ThematicBridgeEngine()); // Fast engine
      
      const chunk = createTestChunk('timeout-test');
      
      const startTime = performance.now();
      const result = await fastOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      const executionTime = performance.now() - startTime;
      
      // Should timeout and use fast engine results
      expect(executionTime).toBeLessThan(2000);
      expect(result.collisions).toBeDefined();
      
      // Should have timeout errors in metrics
      const timedOutEngines = Array.from(result.metrics.engineMetrics.entries())
        .filter(([_, metrics]) => metrics.errors > 0);
      expect(timedOutEngines.length).toBeGreaterThanOrEqual(1);
      
      await fastOrchestrator.cleanup();
    });
  });
  
  describe('Network and External Dependency Failures', () => {
    it('should handle network timeouts in thematic bridge engine', async () => {
      // Mock thematic bridge engine with network dependency
      const networkDependentEngine = {
        type: EngineType.THEMATIC_BRIDGE,
        canProcess: () => true,
        detect: jest.fn(async () => {
          // Simulate network timeout
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error('ETIMEDOUT')), 100);
          });
        }),
      };

      const testOrchestrator = new CollisionOrchestrator({
        errorHandling: {
          networkRetries: 2,
          networkTimeout: 50,
        },
      });

      testOrchestrator.registerEngine(networkDependentEngine as any);
      testOrchestrator.registerEngine(new ContradictionDetectionEngine());
      
      const chunk = createTestChunk('network-test');
      
      const result = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Should retry network failures
      expect(networkDependentEngine.detect).toHaveBeenCalledTimes(3); // Initial + 2 retries
      
      // Should still get results from other engines
      expect(result.collisions).toBeDefined();
      
      await testOrchestrator.cleanup();
    });
    
    it('should handle external service unavailability', async () => {
      // Simulate external service being down
      const externalServiceEngine = {
        type: EngineType.THEMATIC_BRIDGE,
        canProcess: () => true,
        detect: jest.fn(() =>
          Promise.reject(new Error('Service Unavailable'))
        ),
      };

      const testOrchestrator = new CollisionOrchestrator({
        errorHandling: {
          fallbackMode: true,
          degradedModeThreshold: 0.5, // Allow 50% engine failures
        },
      });

      testOrchestrator.registerEngine(externalServiceEngine as any);
      testOrchestrator.registerEngine(new SemanticSimilarityEngine());
      testOrchestrator.registerEngine(new ContradictionDetectionEngine());
      
      const chunk = createTestChunk('service-test');
      
      const result = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
        config: {
          allowDegradedMode: true,
        },
      });
      
      // Should run in degraded mode with available engines
      expect(result.collisions).toBeDefined();
      expect(result.metrics.degradedMode).toBe(true);
      
      await testOrchestrator.cleanup();
    });
  });
  
  describe('Cascading Failure Prevention', () => {
    it('should prevent cascading failures across engines', async () => {
      // Create an engine that causes other engines to fail
      const toxicEngine = {
        type: EngineType.SEMANTIC_SIMILARITY,
        canProcess: () => true,
        detect: async () => {
          // Corrupt global state (simulate bad behavior)
          (global as any).sharedResource = null;
          throw new Error('Toxic failure');
        },
      };

      // Other engines that depend on shared resource
      const dependentEngine = {
        type: EngineType.CONTRADICTION_DETECTION,
        canProcess: () => true,
        detect: async () => {
          // Try to use corrupted resource
          if (!(global as any).sharedResource) {
            // But handle gracefully
            return [];
          }
          return [];
        },
      };

      const testOrchestrator = new CollisionOrchestrator({
        errorHandling: {
          isolationMode: true, // Isolate engine failures
        },
      });

      testOrchestrator.registerEngine(toxicEngine as any);
      testOrchestrator.registerEngine(dependentEngine as any);
      testOrchestrator.registerEngine(new ThematicBridgeEngine());
      
      const chunk = createTestChunk('cascade-test');
      
      const result = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Should isolate toxic engine failure
      expect(result).toBeDefined();
      // Other engines should still work
      expect(result.metrics.engineMetrics.size).toBeGreaterThanOrEqual(1);
      
      // Clean up global state
      delete (global as any).sharedResource;
      
      await testOrchestrator.cleanup();
    });
    
    it('should implement backpressure under load', async () => {
      const slowEngine = createSlowEngine(EngineType.SEMANTIC_SIMILARITY, 100);
      
      const testOrchestrator = new CollisionOrchestrator({
        maxConcurrency: 2,
        errorHandling: {
          queueLimit: 5,
          backpressure: true,
        },
      });
      
      testOrchestrator.registerEngine(slowEngine);
      
      const chunks = Array.from({ length: 10 }, (_, i) => 
        createTestChunk(`backpressure-${i}`)
      );
      
      // Fire many requests rapidly
      const promises = chunks.map(chunk =>
        testOrchestrator.detectCollisions({
          sourceChunk: chunk,
          candidateChunks: [chunk],
        }).catch(err => ({ error: err.message }))
      );
      
      const results = await Promise.all(promises);
      
      // Some requests should be rejected due to backpressure
      const rejected = results.filter((r: any) => r.error);
      const successful = results.filter((r: any) => !r.error);
      
      expect(successful.length).toBeGreaterThan(0);
      expect(successful.length).toBeLessThanOrEqual(7); // Queue limit + concurrent
      
      await testOrchestrator.cleanup();
    });
  });
  
  describe('Recovery Verification', () => {
    it('should verify recovery state after failures', async () => {
      // Create engines with controlled failures
      let failureCount = 0;
      const recoverableEngine = {
        type: EngineType.SEMANTIC_SIMILARITY,
        canProcess: () => true,
        detect: jest.fn(() => {
          failureCount++;
          if (failureCount <= 2) {
            return Promise.reject(new Error('Recoverable failure'));
          }
          return Promise.resolve([]);
        }),
      };
      
      const testOrchestrator = new CollisionOrchestrator({
        errorHandling: {
          retryAttempts: 3,
          healthCheck: true,
        },
      });
      
      testOrchestrator.registerEngine(recoverableEngine as any);
      
      const chunk = createTestChunk('recovery-verify');
      
      // First request should fail then recover
      await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Reset failure count
      failureCount = 0;
      
      // Second request should work immediately
      const result = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Should be healthy after recovery
      expect(result.metrics.systemHealth).toBe('healthy');
      expect(recoverableEngine.detect).toHaveBeenCalled();
      
      await testOrchestrator.cleanup();
    });
    
    it('should maintain data consistency after recovery', async () => {
      const testOrchestrator = new CollisionOrchestrator({
        cache: {
          enabled: true,
          consistencyCheck: true,
        },
        errorHandling: {
          transactional: true,
        },
      });
      
      // Register engines
      orchestrator.registerEngines([
        new SemanticSimilarityEngine(),
        new ContradictionDetectionEngine(),
      ]);
      
      const chunk = createTestChunk('consistency-test');
      
      // Process normally
      const result1 = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Simulate failure and recovery
      await testOrchestrator.cleanup();
      await testOrchestrator.initialize();
      
      // Process again after recovery
      const result2 = await testOrchestrator.detectCollisions({
        sourceChunk: chunk,
        candidateChunks: [chunk],
      });
      
      // Results should be consistent
      expect(result2.collisions.length).toBeGreaterThanOrEqual(
        result1.collisions.length - 1 // Allow minor variation
      );
      
      await testOrchestrator.cleanup();
    });
  });
});

// Helper functions

function createTestChunk(id: string) {
  return {
    id,
    content: `Test content for ${id}`,
    embedding: Array(768).fill(0.1),
    metadata: {
      themes: ['test', id],
      key_concepts: ['testing', 'collision'],
      importance_score: 0.5,
    },
  };
}

function createFailingEngine(type: EngineType) {
  return {
    type,
    canProcess: () => true,
    detect: () => Promise.reject(new Error(`${type} engine failure`)),
  };
}

function createSlowEngine(type: EngineType, delay: number) {
  return {
    type,
    canProcess: () => true,
    detect: async () => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return [];
    },
  };
}