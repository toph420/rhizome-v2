/**
 * Performance benchmark for the 7-engine collision detection system.
 * Tests with 50-chunk documents to verify <5 second performance target.
 */

import { CollisionOrchestrator } from '../engines/orchestrator';
import { SemanticSimilarityEngine } from '../engines/semantic-similarity';
import { StructuralPatternEngine } from '../engines/structural-pattern';
import { TemporalProximityEngine } from '../engines/temporal-proximity';
import { ConceptualDensityEngine } from '../engines/conceptual-density';
import { EmotionalResonanceEngine } from '../engines/emotional-resonance';
import { CitationNetworkEngine } from '../engines/citation-network';
import { ContradictionDetectionEngine } from '../engines/contradiction-detection';
import { CollisionDetectionInput, EngineType } from '../engines/types';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Generates realistic test chunks with varied content.
 */
function generateTestChunks(count: number) {
  const topics = [
    'artificial intelligence', 'machine learning', 'quantum computing',
    'blockchain technology', 'renewable energy', 'space exploration',
    'genetic engineering', 'climate change', 'virtual reality',
    'autonomous vehicles', 'cybersecurity', 'biotechnology',
  ];
  
  const sentiments = ['positive', 'negative', 'neutral', 'mixed'];
  const structuralTypes = ['statement', 'question', 'list', 'comparison', 'explanation'];
  
  const chunks = [];
  
  for (let i = 0; i < count; i++) {
    const topicIndex = i % topics.length;
    const topic = topics[topicIndex];
    const relatedTopic = topics[(topicIndex + 1) % topics.length];
    
    chunks.push({
      id: `chunk-${i}`,
      content: `This is test content about ${topic}. It discusses various aspects including 
                ${relatedTopic} integration and future implications. The analysis shows that
                ${topic} has significant potential for transformation in multiple sectors.`,
      embedding: Array(768).fill(0).map(() => Math.random() * 0.4 - 0.2),
      metadata: {
        themes: [topic, relatedTopic, 'technology', 'innovation'],
        key_concepts: [topic, `${topic} applications`, `${topic} impact`],
        emotional_tone: {
          sentiment: sentiments[i % sentiments.length],
          emotions: ['analytical', 'informative'],
          polarity: Math.random() * 2 - 1,
        },
        structural_type: structuralTypes[i % structuralTypes.length],
        importance_score: 0.5 + Math.random() * 0.5,
        timestamp: new Date(2024, 0, 1 + (i % 30)).toISOString(),
        temporal_markers: [`2024-01-${String(1 + (i % 30)).padStart(2, '0')}`],
        references: i % 3 === 0 ? [`Reference ${i}`, `Citation ${i}`] : [],
      },
    });
  }
  
  return chunks;
}

/**
 * Runs a single benchmark iteration.
 */
async function runBenchmark(
  orchestrator: CollisionOrchestrator,
  chunkCount: number
): Promise<{
  executionTime: number;
  resultCount: number;
  engineMetrics: Map<EngineType, { time: number; resultCount: number }>;
}> {
  const chunks = generateTestChunks(chunkCount);
  const sourceChunk = chunks[0];
  const candidateChunks = chunks.slice(1);
  
  const input: CollisionDetectionInput = {
    sourceChunk,
    candidateChunks,
    config: {
      limit: 50,
      minScore: 0.3,
    },
  };
  
  const startTime = performance.now();
  const results = await orchestrator.detectCollisions(input);
  const executionTime = performance.now() - startTime;
  
  return {
    executionTime,
    resultCount: results.collisions.length,
    engineMetrics: results.metrics.engineMetrics,
  };
}

/**
 * Runs multiple benchmark iterations and calculates statistics.
 */
async function runBenchmarkSuite(
  iterations: number = 5,
  chunkCounts: number[] = [10, 25, 50, 75, 100]
) {
  console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════`);
  console.log(`   7-Engine Collision Detection Performance Benchmark`);
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`);
  
  // Initialize orchestrator
  const orchestrator = new CollisionOrchestrator({
    parallel: true,
    maxConcurrency: 7,
    globalTimeout: 5000,
    cache: {
      enabled: true,
      ttl: 300000,
      maxSize: 1000,
    },
  });
  
  // Register all engines
  const engines = [
    new SemanticSimilarityEngine(),
    new StructuralPatternEngine(),
    new TemporalProximityEngine(),
    new ConceptualDensityEngine(),
    new EmotionalResonanceEngine(),
    new CitationNetworkEngine(),
    new ContradictionDetectionEngine(),
  ];
  
  orchestrator.registerEngines(engines);
  
  console.log(`${colors.cyan}Initialized with ${engines.length} engines${colors.reset}\n`);
  
  // Run benchmarks for different chunk counts
  for (const chunkCount of chunkCounts) {
    console.log(`${colors.bright}Testing with ${chunkCount} chunks:${colors.reset}`);
    
    const times: number[] = [];
    const results: number[] = [];
    const engineStats = new Map<EngineType, number[]>();
    
    // Run multiple iterations
    for (let i = 0; i < iterations; i++) {
      process.stdout.write(`  Iteration ${i + 1}/${iterations}... `);
      
      const result = await runBenchmark(orchestrator, chunkCount);
      
      times.push(result.executionTime);
      results.push(result.resultCount);
      
      // Track engine-specific metrics
      for (const [engine, metrics] of result.engineMetrics) {
        if (!engineStats.has(engine)) {
          engineStats.set(engine, []);
        }
        engineStats.get(engine)!.push(metrics.time);
      }
      
      const statusColor = result.executionTime < 5000 ? colors.green : colors.red;
      console.log(`${statusColor}${result.executionTime.toFixed(2)}ms${colors.reset} (${result.resultCount} results)`);
    }
    
    // Calculate statistics
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const avgResults = results.reduce((a, b) => a + b, 0) / results.length;
    
    // Display results
    console.log(`\n  ${colors.bright}Summary:${colors.reset}`);
    console.log(`    Average time: ${avgTime < 5000 ? colors.green : colors.red}${avgTime.toFixed(2)}ms${colors.reset}`);
    console.log(`    Min time: ${minTime.toFixed(2)}ms`);
    console.log(`    Max time: ${maxTime.toFixed(2)}ms`);
    console.log(`    Avg results: ${avgResults.toFixed(0)}`);
    
    // Display engine breakdown
    console.log(`\n  ${colors.bright}Engine Performance:${colors.reset}`);
    for (const [engine, timings] of engineStats) {
      const avgEngineTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      const percentage = (avgEngineTime / avgTime) * 100;
      console.log(`    ${engine}: ${avgEngineTime.toFixed(2)}ms (${percentage.toFixed(1)}%)`);
    }
    
    // Performance assessment
    if (chunkCount === 50) {
      console.log(`\n  ${colors.bright}50-Chunk Performance Target:${colors.reset}`);
      if (avgTime < 5000) {
        console.log(`    ${colors.green}✓ PASSED: ${avgTime.toFixed(2)}ms < 5000ms${colors.reset}`);
      } else {
        console.log(`    ${colors.red}✗ FAILED: ${avgTime.toFixed(2)}ms > 5000ms${colors.reset}`);
      }
    }
    
    console.log('\n' + '─'.repeat(50) + '\n');
  }
  
  // Cleanup
  await orchestrator.cleanup();
  
  console.log(`${colors.bright}${colors.green}Benchmark complete!${colors.reset}\n`);
}

/**
 * Stress test with concurrent requests.
 */
async function runStressTest(
  concurrentRequests: number = 5,
  chunksPerRequest: number = 50
) {
  console.log(`${colors.bright}${colors.yellow}═══════════════════════════════════════════════════`);
  console.log(`   Stress Test: ${concurrentRequests} Concurrent Requests`);
  console.log(`═══════════════════════════════════════════════════${colors.reset}\n`);
  
  // Create multiple orchestrators (simulating different workers)
  const orchestrators = Array.from({ length: concurrentRequests }, () => {
    const orch = new CollisionOrchestrator({
      parallel: true,
      maxConcurrency: 7,
      globalTimeout: 5000,
    });
    
    orch.registerEngines([
      new SemanticSimilarityEngine(),
      new StructuralPatternEngine(),
      new TemporalProximityEngine(),
      new ConceptualDensityEngine(),
      new EmotionalResonanceEngine(),
      new CitationNetworkEngine(),
      new ContradictionDetectionEngine(),
    ]);
    
    return orch;
  });
  
  const startTime = performance.now();
  
  // Run concurrent detections
  const promises = orchestrators.map(async (orch, index) => {
    console.log(`  Starting request ${index + 1}...`);
    const result = await runBenchmark(orch, chunksPerRequest);
    console.log(`  Request ${index + 1} completed in ${result.executionTime.toFixed(2)}ms`);
    return result;
  });
  
  const results = await Promise.all(promises);
  const totalTime = performance.now() - startTime;
  
  // Calculate statistics
  const times = results.map(r => r.executionTime);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  
  console.log(`\n${colors.bright}Stress Test Results:${colors.reset}`);
  console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`  Average per request: ${avgTime.toFixed(2)}ms`);
  console.log(`  Throughput: ${(concurrentRequests / (totalTime / 1000)).toFixed(2)} req/s`);
  
  // Cleanup
  await Promise.all(orchestrators.map(o => o.cleanup()));
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--stress')) {
    await runStressTest();
  } else {
    // Run standard benchmark
    await runBenchmarkSuite();
    
    // Run specific 50-chunk test
    if (args.includes('--50')) {
      console.log(`${colors.bright}${colors.cyan}Running focused 50-chunk test...${colors.reset}\n`);
      await runBenchmarkSuite(10, [50]);
    }
  }
}

// Run benchmark
if (require.main === module) {
  main().catch(console.error);
}