/**
 * Simple performance test for T-035 verification.
 * Tests the orchestrator with mock engines to verify <5 second performance target.
 */

import { CollisionOrchestrator } from '../engines/orchestrator';
import {
  CollisionEngine,
  CollisionDetectionInput,
  EngineType,
  CollisionResult,
  ChunkWithMetadata
} from '../engines/types';
import { PerformanceMonitor } from '../lib/performance-monitor';
import { z } from 'zod';

// Mock engine implementation for testing
class MockEngine implements CollisionEngine {
  constructor(
    public type: EngineType,
    private processingTime: number = 100
  ) {}

  async detect(input: CollisionDetectionInput): Promise<CollisionResult[]> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, this.processingTime));

    // Return mock results
    return input.targetChunks?.slice(0, 5).map(chunk => ({
      sourceChunkId: input.sourceChunk.id,
      targetChunkId: chunk.id,
      engineType: this.type,
      score: Math.random() * 0.5 + 0.5,
      confidence: 'medium' as const,
      explanation: `Mock connection for ${this.type}`,
    })) || [];
  }

  canProcess(input: CollisionDetectionInput): boolean {
    return true;
  }

  getConfigSchema(): z.ZodSchema {
    return z.object({});
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for mock
  }
}

// Generate test chunks
function generateTestChunks(count: number): ChunkWithMetadata[] {
  const chunks: ChunkWithMetadata[] = [];

  for (let i = 0; i < count; i++) {
    chunks.push({
      id: `chunk-${i}`,
      document_id: 'test-doc',
      chunk_index: i,
      content: `Test content for chunk ${i}. This is a sample text that discusses various topics.`,
      embedding: Array(768).fill(0).map(() => Math.random() * 0.4 - 0.2),
      metadata: {
        themes: ['test', 'sample', 'chunk'],
        importance: 0.5 + Math.random() * 0.5,
      },
    });
  }

  return chunks;
}

async function runPerformanceTest() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   T-035 Performance Optimization Verification');
  console.log('   Target: <5 seconds for 50-chunk detection');
  console.log('═══════════════════════════════════════════════════\n');

  // Initialize orchestrator for 3-engine system
  const orchestrator = new CollisionOrchestrator({
    parallel: true,
    maxConcurrency: 3,
    globalTimeout: 5000,
    cache: {
      enabled: true,
      ttl: 300000,
      maxSize: 1000,
    },
  });

  // Register 3 active engines with varying processing times
  const engines = [
    new MockEngine(EngineType.SEMANTIC_SIMILARITY, 150),
    new MockEngine(EngineType.CONTRADICTION_DETECTION, 140),
    new MockEngine(EngineType.THEMATIC_BRIDGE, 120),
  ];

  orchestrator.registerEngines(engines);

  console.log(`Registered ${engines.length} mock engines (3-engine optimized system)\n`);

  // Test with different chunk counts
  const chunkCounts = [10, 25, 50, 75, 100];
  const iterations = 3;

  for (const chunkCount of chunkCounts) {
    console.log(`Testing with ${chunkCount} chunks:`);
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const chunks = generateTestChunks(chunkCount);
      const sourceChunk = chunks[0];
      const targetChunks = chunks.slice(1);

      const input: CollisionDetectionInput = {
        sourceChunk,
        targetChunks,
        config: {
          minScore: 0.3,
        },
      };

      const startTime = performance.now();
      const results = await orchestrator.detectCollisions(input);
      const executionTime = performance.now() - startTime;

      times.push(executionTime);
      console.log(`  Iteration ${i + 1}: ${executionTime.toFixed(2)}ms (${results.collisions.length} results)`);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log(`\n  Summary:`);
    console.log(`    Average: ${avgTime.toFixed(2)}ms`);
    console.log(`    Min: ${minTime.toFixed(2)}ms`);
    console.log(`    Max: ${maxTime.toFixed(2)}ms`);

    // Check 50-chunk performance target
    if (chunkCount === 50) {
      console.log(`\n  50-Chunk Performance Target:`);
      if (avgTime < 5000) {
        console.log(`    ✅ PASSED: ${avgTime.toFixed(2)}ms < 5000ms`);
      } else {
        console.log(`    ❌ FAILED: ${avgTime.toFixed(2)}ms > 5000ms`);
      }
    }

    console.log('\n' + '─'.repeat(50) + '\n');
  }

  // Test cache effectiveness
  console.log('Testing Cache Effectiveness:\n');
  
  const testChunks = generateTestChunks(50);
  const testInput: CollisionDetectionInput = {
    sourceChunk: testChunks[0],
    targetChunks: testChunks.slice(1),
    config: { minScore: 0.3 },
  };

  // First run (cache miss)
  const firstStart = performance.now();
  await orchestrator.detectCollisions(testInput);
  const firstTime = performance.now() - firstStart;
  console.log(`  First run (cache miss): ${firstTime.toFixed(2)}ms`);

  // Second run (cache hit)
  const secondStart = performance.now();
  await orchestrator.detectCollisions(testInput);
  const secondTime = performance.now() - secondStart;
  console.log(`  Second run (cache hit): ${secondTime.toFixed(2)}ms`);

  const speedup = ((firstTime - secondTime) / firstTime) * 100;
  console.log(`  Cache speedup: ${speedup.toFixed(1)}%`);

  // Get performance metrics
  const perfMetrics = orchestrator.getPerformanceMetrics();
  console.log('\nPerformance Metrics:');
  console.log(`  Total metrics recorded: ${perfMetrics.metrics.length}`);
  
  if (perfMetrics.averages.size > 0) {
    console.log(`  Engine averages:`);
    for (const [label, avg] of perfMetrics.averages) {
      console.log(`    ${label}: ${avg.toFixed(2)}ms`);
    }
  }

  // Get cache statistics
  const cacheStats = orchestrator.getCacheStats();
  console.log('\nCache Statistics:');
  for (const [namespace, stats] of cacheStats) {
    if (stats.size > 0 || stats.hits > 0) {
      console.log(`  ${namespace}:`);
      console.log(`    Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
      console.log(`    Hits: ${stats.hits}, Misses: ${stats.misses}`);
    }
  }

  // Cleanup
  await orchestrator.cleanup();
  console.log('\n✅ Performance test complete!\n');
}

// Run the test
runPerformanceTest().catch(console.error);