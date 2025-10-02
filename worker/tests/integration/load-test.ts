/**
 * Load and performance tests for the 7-engine collision detection system.
 * Tests system behavior under high load, stress conditions, and performance targets.
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CollisionOrchestrator } from '../../engines/orchestrator';
import { SemanticSimilarityEngine } from '../../engines/semantic-similarity';
import { StructuralPatternEngine } from '../../engines/structural-pattern';
import { TemporalProximityEngine } from '../../engines/temporal-proximity';
import { ConceptualDensityEngine } from '../../engines/conceptual-density';
import { EmotionalResonanceEngine } from '../../engines/emotional-resonance';
import { CitationNetworkEngine } from '../../engines/citation-network';
import { ContradictionDetectionEngine } from '../../engines/contradiction-detection';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Load and Performance Tests', () => {
  let orchestrator: CollisionOrchestrator;
  let largeDataset: any;
  
  beforeAll(async () => {
    // Load large dataset configuration
    const fixturesPath = path.join(__dirname, '../fixtures/collision-test-data');
    largeDataset = JSON.parse(
      await fs.readFile(path.join(fixturesPath, 'large-dataset.json'), 'utf-8')
    );
    
    // Generate the full dataset from template
    generateLargeDataset(largeDataset);
    
    // Initialize high-performance orchestrator
    orchestrator = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: os.cpus().length, // Use all available cores
      globalTimeout: 10000,
      cache: {
        enabled: true,
        ttl: 600000, // 10 minutes
        maxSize: 5000, // Larger cache for load testing
      },
      monitoring: {
        enabled: true,
        logLevel: 'warn', // Less logging for performance
        metricsCollection: true,
        performanceTracking: true,
      },
    });
    
    // Register all engines with optimized configurations
    const engines = [
      new SemanticSimilarityEngine({ 
        threshold: 0.3,
        batchSize: 50,
        parallelism: true,
      }),
      new StructuralPatternEngine({ 
        minPatternLength: 2,
        maxPatternLength: 10,
        cachePatterns: true,
      }),
      new TemporalProximityEngine({ 
        windowSize: 86400000,
        bucketSize: 3600000, // 1 hour buckets for efficiency
      }),
      new ConceptualDensityEngine({ 
        minOverlap: 2,
        useIndexing: true,
      }),
      new EmotionalResonanceEngine({ 
        minResonance: 0.4,
        emotionCategories: 8,
      }),
      new CitationNetworkEngine({ 
        maxDepth: 2, // Reduced for performance
        cacheNetwork: true,
      }),
      new ContradictionDetectionEngine({ 
        sensitivity: 0.6,
        fastMode: true,
      }),
    ];
    
    orchestrator.registerEngines(engines);
  });
  
  afterAll(async () => {
    await orchestrator.cleanup();
  });
  
  describe('Performance Benchmarks', () => {
    it('should process 50 chunks in under 5 seconds', async () => {
      const chunks50 = largeDataset.candidateChunks.slice(0, 50);
      
      const startTime = performance.now();
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks50,
        config: {
          limit: 50,
          minScore: 0.3,
        },
      });
      
      const executionTime = performance.now() - startTime;
      
      console.log(`[Benchmark] 50 chunks processed in ${executionTime.toFixed(2)}ms`);
      
      expect(executionTime).toBeLessThan(5000);
      expect(result.metrics.chunkCount).toBe(50);
      expect(result.collisions.length).toBeGreaterThan(0);
    });
    
    it('should process 100 chunks in under 10 seconds', async () => {
      const chunks100 = largeDataset.candidateChunks.slice(0, 100);
      
      const startTime = performance.now();
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks100,
        config: {
          limit: 100,
          minScore: 0.3,
        },
      });
      
      const executionTime = performance.now() - startTime;
      
      console.log(`[Benchmark] 100 chunks processed in ${executionTime.toFixed(2)}ms`);
      
      expect(executionTime).toBeLessThan(10000);
      expect(result.metrics.chunkCount).toBe(100);
      
      // Check performance metrics
      const avgTimePerChunk = executionTime / 100;
      expect(avgTimePerChunk).toBeLessThan(100); // Less than 100ms per chunk
    });
    
    it('should maintain linear scaling', async () => {
      const measurements = [];
      const chunkCounts = [10, 20, 40, 80];
      
      for (const count of chunkCounts) {
        const chunks = largeDataset.candidateChunks.slice(0, count);
        
        const startTime = performance.now();
        
        await orchestrator.detectCollisions({
          sourceChunk: largeDataset.sourceChunk,
          candidateChunks: chunks,
          config: {
            limit: count,
            minScore: 0.3,
          },
        });
        
        const executionTime = performance.now() - startTime;
        measurements.push({ count, time: executionTime });
        
        console.log(`[Scaling] ${count} chunks: ${executionTime.toFixed(2)}ms`);
      }
      
      // Calculate scaling factor
      for (let i = 1; i < measurements.length; i++) {
        const scalingFactor = measurements[i].time / measurements[i - 1].time;
        const expectedFactor = measurements[i].count / measurements[i - 1].count;
        
        // Allow 30% deviation from linear scaling
        expect(scalingFactor).toBeLessThan(expectedFactor * 1.3);
      }
    });
  });
  
  describe('Concurrent Load Testing', () => {
    it('should handle 5 concurrent detection requests', async () => {
      const chunks = largeDataset.candidateChunks.slice(0, 20);
      
      const startTime = performance.now();
      
      // Launch 5 concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) => 
        orchestrator.detectCollisions({
          sourceChunk: { ...largeDataset.sourceChunk, id: `source-${i}` },
          candidateChunks: chunks,
          config: {
            limit: 20,
            minScore: 0.3,
          },
        })
      );
      
      const results = await Promise.all(promises);
      
      const totalTime = performance.now() - startTime;
      
      console.log(`[Concurrent] 5 requests completed in ${totalTime.toFixed(2)}ms`);
      
      // All requests should complete
      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.metrics.chunkCount).toBe(20);
        expect(result.collisions).toBeDefined();
      });
      
      // Should be faster than sequential (5 * single request time)
      expect(totalTime).toBeLessThan(15000); // Generous limit for CI environments
    });
    
    it('should handle 10 concurrent detection requests without degradation', async () => {
      const chunks = largeDataset.candidateChunks.slice(0, 10);
      
      const singleRequestTime = await measureSingleRequest(chunks);
      
      const startTime = performance.now();
      
      // Launch 10 concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) => 
        orchestrator.detectCollisions({
          sourceChunk: { ...largeDataset.sourceChunk, id: `concurrent-${i}` },
          candidateChunks: chunks,
          config: {
            limit: 10,
            minScore: 0.3,
          },
        })
      );
      
      const results = await Promise.all(promises);
      const concurrentTime = performance.now() - startTime;
      
      console.log(`[Concurrent] Single: ${singleRequestTime.toFixed(2)}ms, 10x Concurrent: ${concurrentTime.toFixed(2)}ms`);
      
      // Concurrent should be less than 3x single request time (parallelism benefit)
      expect(concurrentTime).toBeLessThan(singleRequestTime * 3);
      
      // All requests should succeed
      expect(results.filter(r => r.metrics.chunkCount === 10).length).toBe(10);
    });
    
    async function measureSingleRequest(chunks: any[]): Promise<number> {
      const startTime = performance.now();
      await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks,
        config: {
          limit: chunks.length,
          minScore: 0.3,
        },
      });
      return performance.now() - startTime;
    }
  });
  
  describe('Memory and Resource Management', () => {
    it('should not leak memory during sustained load', async () => {
      const chunks = largeDataset.candidateChunks.slice(0, 10);
      const iterations = 50;
      
      // Get initial memory usage
      if (global.gc) global.gc();
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Run many iterations
      for (let i = 0; i < iterations; i++) {
        await orchestrator.detectCollisions({
          sourceChunk: { ...largeDataset.sourceChunk, id: `mem-test-${i}` },
          candidateChunks: chunks,
        });
        
        // Force GC every 10 iterations if available
        if (i % 10 === 0 && global.gc) global.gc();
      }
      
      // Get final memory usage
      if (global.gc) global.gc();
      const finalMemory = process.memoryUsage().heapUsed;
      
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      console.log(`[Memory] Increase after ${iterations} iterations: ${memoryIncreaseMB.toFixed(2)}MB`);
      
      // Memory increase should be reasonable (less than 100MB for 50 iterations)
      expect(memoryIncreaseMB).toBeLessThan(100);
    });
    
    it('should handle cache effectiveness under load', async () => {
      const chunks = largeDataset.candidateChunks.slice(0, 20);
      
      // Warm up cache
      await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks,
      });
      
      // Measure with cache
      const startCached = performance.now();
      const cachedResult = await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks,
      });
      const cachedTime = performance.now() - startCached;
      
      // Clear cache (create new orchestrator)
      const freshOrchestrator = new CollisionOrchestrator({
        parallel: true,
        cache: { enabled: false },
      });
      freshOrchestrator.registerEngines([
        new SemanticSimilarityEngine(),
        new StructuralPatternEngine(),
      ]);
      
      // Measure without cache
      const startUncached = performance.now();
      const uncachedResult = await freshOrchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks,
      });
      const uncachedTime = performance.now() - startUncached;
      
      console.log(`[Cache] Cached: ${cachedTime.toFixed(2)}ms, Uncached: ${uncachedTime.toFixed(2)}ms`);
      
      // Cached should be significantly faster
      expect(cachedTime).toBeLessThan(uncachedTime * 0.7);
      expect(cachedResult.metrics.cacheHits).toBeGreaterThan(0);
      
      await freshOrchestrator.cleanup();
    });
  });
  
  describe('Stress Testing', () => {
    it('should handle rapid burst of requests', async () => {
      const chunks = largeDataset.candidateChunks.slice(0, 5);
      const burstSize = 20;
      
      const startTime = performance.now();
      
      // Fire requests as fast as possible
      const promises = [];
      for (let i = 0; i < burstSize; i++) {
        promises.push(
          orchestrator.detectCollisions({
            sourceChunk: { ...largeDataset.sourceChunk, id: `burst-${i}` },
            candidateChunks: chunks,
          })
        );
      }
      
      const results = await Promise.all(promises);
      const burstTime = performance.now() - startTime;
      
      console.log(`[Burst] ${burstSize} requests in ${burstTime.toFixed(2)}ms`);
      
      // All should complete
      expect(results.length).toBe(burstSize);
      expect(results.every(r => r.metrics.chunkCount === 5)).toBe(true);
    });
    
    it('should recover from engine failures during high load', async () => {
      // Create orchestrator with a failing engine
      const stressOrchestrator = new CollisionOrchestrator({
        parallel: true,
        maxConcurrency: 4,
      });
      
      // Add a randomly failing engine
      const failingEngine = {
        type: 'FAILING_ENGINE' as any,
        canProcess: () => true,
        detect: () => {
          if (Math.random() > 0.5) {
            return Promise.reject(new Error('Random failure'));
          }
          return Promise.resolve([]);
        },
      };
      
      stressOrchestrator.registerEngine(failingEngine as any);
      stressOrchestrator.registerEngine(new SemanticSimilarityEngine());
      stressOrchestrator.registerEngine(new StructuralPatternEngine());
      
      const chunks = largeDataset.candidateChunks.slice(0, 10);
      
      // Run multiple requests with potential failures
      const promises = Array.from({ length: 10 }, (_, i) =>
        stressOrchestrator.detectCollisions({
          sourceChunk: { ...largeDataset.sourceChunk, id: `stress-${i}` },
          candidateChunks: chunks,
        })
      );
      
      const results = await Promise.all(promises);
      
      // All requests should complete despite engine failures
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.metrics.chunkCount).toBe(10);
        // At least one engine should succeed
        expect(result.metrics.engineMetrics.size).toBeGreaterThanOrEqual(1);
      });
      
      await stressOrchestrator.cleanup();
    });
    
    it('should handle maximum load scenario', async () => {
      // Test with maximum reasonable load
      const maxChunks = 200;
      const chunks = generateLargeChunkSet(maxChunks);
      
      const startTime = performance.now();
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks,
        config: {
          limit: 100,
          minScore: 0.2,
          timeout: 30000, // 30 second timeout
        },
      });
      
      const executionTime = performance.now() - startTime;
      
      console.log(`[Max Load] ${maxChunks} chunks processed in ${executionTime.toFixed(2)}ms`);
      
      expect(result.metrics.chunkCount).toBe(maxChunks);
      expect(executionTime).toBeLessThan(30000);
      
      // Calculate throughput
      const throughput = maxChunks / (executionTime / 1000);
      console.log(`[Throughput] ${throughput.toFixed(2)} chunks/second`);
      
      expect(throughput).toBeGreaterThan(5); // At least 5 chunks per second
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should collect detailed performance metrics', async () => {
      const chunks = largeDataset.candidateChunks.slice(0, 30);
      
      const result = await orchestrator.detectCollisions({
        sourceChunk: largeDataset.sourceChunk,
        candidateChunks: chunks,
        config: {
          monitoring: {
            detailed: true,
            includeBreakdown: true,
          },
        },
      });
      
      // Verify detailed metrics
      expect(result.metrics).toMatchObject({
        totalProcessingTime: expect.any(Number),
        chunkCount: 30,
        collisionCount: expect.any(Number),
        engineMetrics: expect.any(Map),
        cacheHits: expect.any(Number),
        cacheMisses: expect.any(Number),
      });
      
      // Engine breakdown
      result.metrics.engineMetrics.forEach((metrics, engineType) => {
        expect(metrics.processingTime).toBeGreaterThanOrEqual(0);
        console.log(`[Engine] ${engineType}: ${metrics.processingTime.toFixed(2)}ms, ${metrics.collisionsFound} collisions`);
      });
      
      // Calculate cache hit rate
      const cacheHitRate = result.metrics.cacheHits / 
        (result.metrics.cacheHits + result.metrics.cacheMisses);
      console.log(`[Cache] Hit rate: ${(cacheHitRate * 100).toFixed(2)}%`);
    });
  });
});

/**
 * Generate a large dataset from the template
 */
function generateLargeDataset(dataset: any) {
  if (!dataset.candidateChunks || dataset.candidateChunks.length > 0) {
    return; // Already generated
  }
  
  const { generateCandidates } = dataset;
  const chunks = [];
  
  for (let i = 0; i < generateCandidates.count; i++) {
    const template = generateCandidates.templates[i % generateCandidates.templates.length];
    const chunk = {
      id: `generated-${i}`,
      content: `${template.contentPattern} - Variation ${i}`,
      embedding: generateEmbedding(i),
      metadata: {
        themes: template.themeVariations,
        key_concepts: template.themeVariations.slice(0, 3),
        emotional_tone: {
          sentiment: template.sentimentRange[0],
          emotions: [template.sentimentRange[1]],
        },
        structural_type: template.structuralType,
        importance_score: 0.5 + (Math.random() * 0.45),
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        word_count: 15 + Math.floor(Math.random() * 10),
      },
    };
    chunks.push(chunk);
  }
  
  dataset.candidateChunks = chunks;
}

/**
 * Generate a large set of chunks for stress testing
 */
function generateLargeChunkSet(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `large-set-${i}`,
    content: `Chunk ${i}: ${generateRandomContent()}`,
    embedding: generateEmbedding(i),
    metadata: {
      themes: [`theme-${i % 20}`, `category-${i % 10}`],
      key_concepts: [`concept-${i % 30}`],
      importance_score: Math.random(),
      timestamp: new Date(Date.now() - i * 1000000).toISOString(),
    },
  }));
}

/**
 * Generate random content for stress testing
 */
function generateRandomContent(): string {
  const words = [
    'quantum', 'computing', 'algorithm', 'neural', 'network',
    'machine', 'learning', 'artificial', 'intelligence', 'data',
    'science', 'analysis', 'pattern', 'recognition', 'optimization',
  ];
  
  const length = 10 + Math.floor(Math.random() * 20);
  return Array.from({ length }, () => 
    words[Math.floor(Math.random() * words.length)]
  ).join(' ');
}

/**
 * Generate pseudo-embeddings for testing
 */
function generateEmbedding(seed: number): number[] {
  return Array.from({ length: 768 }, (_, i) => 
    Math.sin(seed * 0.1 + i * 0.01) * 0.5 + Math.random() * 0.1
  );
}