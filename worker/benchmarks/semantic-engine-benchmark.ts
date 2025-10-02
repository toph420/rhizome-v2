#!/usr/bin/env tsx
/**
 * Performance Benchmark for Semantic Similarity Engine
 * Validates the <500ms processing requirement for 50 chunks
 */

import { performance } from 'perf_hooks';
import { SemanticSimilarityEngine } from '../engines/semantic-similarity';
import { ChunkData } from '../engines/types';
import { createClient } from '@supabase/supabase-js';

// Benchmark configuration
const CHUNK_COUNTS = [10, 25, 50, 100];
const ITERATIONS = 3;
const TARGET_TIME_50_CHUNKS = 500; // ms

// Initialize Supabase client for real database testing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️  Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Generate synthetic test chunks with realistic embeddings
 */
function generateTestChunks(count: number): ChunkData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `benchmark-chunk-${i}`,
    documentId: `benchmark-doc-${Math.floor(i / 10)}`,
    content: `Benchmark content ${i}: ${generateRealisticContent()}`,
    embedding: generateRealisticEmbedding(),
    metadata: {
      themes: generateThemes(),
      summary: `Summary for chunk ${i}`,
      importance_score: Math.random(),
      chunk_index: i
    }
  }));
}

/**
 * Generate realistic content snippets
 */
function generateRealisticContent(): string {
  const topics = [
    'Machine learning algorithms optimize prediction accuracy through iterative training.',
    'Neural networks simulate human brain connections for pattern recognition.',
    'Data preprocessing transforms raw information into structured formats.',
    'Distributed computing enables parallel processing of large datasets.',
    'Statistical analysis reveals patterns in complex data relationships.'
  ];
  return topics[Math.floor(Math.random() * topics.length)];
}

/**
 * Generate realistic 768-dimensional embedding
 */
function generateRealisticEmbedding(): number[] {
  // Create embeddings with realistic distribution
  const embedding = new Array(768);
  for (let i = 0; i < 768; i++) {
    // Use normal distribution for more realistic embeddings
    embedding[i] = gaussianRandom() * 0.1;
  }
  return embedding;
}

/**
 * Generate random value from normal distribution
 */
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Generate realistic themes
 */
function generateThemes(): string[] {
  const allThemes = [
    'artificial intelligence', 'machine learning', 'deep learning',
    'data science', 'algorithms', 'optimization', 'statistics',
    'neural networks', 'computer vision', 'NLP'
  ];
  const count = Math.floor(Math.random() * 3) + 1;
  return allThemes.sort(() => Math.random() - 0.5).slice(0, count);
}

/**
 * Run benchmark for a specific chunk count
 */
async function runBenchmark(
  engine: SemanticSimilarityEngine, 
  chunkCount: number
): Promise<{
  chunkCount: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  meetsTarget: boolean;
}> {
  console.log(`\n📊 Benchmarking with ${chunkCount} chunks...`);
  
  const times: number[] = [];
  const chunks = generateTestChunks(chunkCount);
  
  // Warm up cache
  console.log('  Warming up...');
  await engine.processChunks(chunks.slice(0, 2));
  
  // Run iterations
  for (let i = 0; i < ITERATIONS; i++) {
    // Clear cache between iterations for consistent results
    engine.clearCache();
    
    const startTime = performance.now();
    const results = await engine.processChunks(chunks);
    const endTime = performance.now();
    
    const elapsed = endTime - startTime;
    times.push(elapsed);
    
    console.log(`  Iteration ${i + 1}: ${elapsed.toFixed(2)}ms (${results.length} collisions found)`);
  }
  
  const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const targetTime = chunkCount === 50 ? TARGET_TIME_50_CHUNKS : TARGET_TIME_50_CHUNKS * (chunkCount / 50);
  
  return {
    chunkCount,
    averageTime,
    minTime,
    maxTime,
    meetsTarget: averageTime < targetTime
  };
}

/**
 * Test with real database chunks
 */
async function testWithRealData(engine: SemanticSimilarityEngine): Promise<void> {
  console.log('\n🗄️  Testing with real database chunks...');
  
  try {
    // Fetch real chunks from database
    const { data: chunks, error } = await supabase
      .from('chunks')
      .select('id, document_id, content, embedding, themes, summary, importance_score, chunk_index')
      .limit(50);
    
    if (error) {
      console.log('  ⚠️  Could not fetch real chunks:', error.message);
      return;
    }
    
    if (!chunks || chunks.length === 0) {
      console.log('  ⚠️  No chunks found in database');
      return;
    }
    
    console.log(`  Found ${chunks.length} real chunks`);
    
    // Convert to ChunkData format
    const chunkData: ChunkData[] = chunks.map(chunk => ({
      id: chunk.id,
      documentId: chunk.document_id,
      content: chunk.content || '',
      embedding: typeof chunk.embedding === 'string' 
        ? JSON.parse(chunk.embedding) 
        : chunk.embedding,
      metadata: {
        themes: chunk.themes || [],
        summary: chunk.summary || '',
        importance_score: chunk.importance_score || 0,
        chunk_index: chunk.chunk_index
      }
    }));
    
    // Run benchmark with real data
    const startTime = performance.now();
    const results = await engine.processChunks(chunkData);
    const elapsed = performance.now() - startTime;
    
    console.log(`  ✅ Processed ${chunkData.length} real chunks in ${elapsed.toFixed(2)}ms`);
    console.log(`  Found ${results.length} collisions`);
    
    if (results.length > 0) {
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      console.log(`  Average similarity score: ${avgScore.toFixed(3)}`);
    }
    
  } catch (error) {
    console.log('  ❌ Error testing with real data:', error);
  }
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('🚀 Semantic Similarity Engine Performance Benchmark');
  console.log('=' . repeat(60));
  
  // Create engine with production configuration
  const engine = new SemanticSimilarityEngine({
    threshold: 0.7,
    maxResultsPerChunk: 10,
    includeSelfReferences: false,
    importanceWeight: 0.3
  });
  
  // Validate engine
  console.log('\n🔧 Validating engine configuration...');
  const isValid = await engine.validate();
  if (!isValid) {
    console.error('❌ Engine validation failed');
    process.exit(1);
  }
  console.log('✅ Engine validated successfully');
  
  // Run benchmarks with synthetic data
  console.log('\n📈 Running benchmarks with synthetic data...');
  const results = [];
  
  for (const chunkCount of CHUNK_COUNTS) {
    const result = await runBenchmark(engine, chunkCount);
    results.push(result);
  }
  
  // Test with real data if available
  await testWithRealData(engine);
  
  // Display results summary
  console.log('\n' + '=' . repeat(60));
  console.log('📊 BENCHMARK RESULTS SUMMARY');
  console.log('=' . repeat(60));
  
  console.table(results.map(r => ({
    'Chunks': r.chunkCount,
    'Avg Time (ms)': r.averageTime.toFixed(2),
    'Min Time (ms)': r.minTime.toFixed(2),
    'Max Time (ms)': r.maxTime.toFixed(2),
    'Target Met': r.meetsTarget ? '✅' : '❌'
  })));
  
  // Check specific 50-chunk requirement
  const result50 = results.find(r => r.chunkCount === 50);
  if (result50) {
    console.log('\n🎯 50-Chunk Performance Target:');
    console.log(`  Target: <${TARGET_TIME_50_CHUNKS}ms`);
    console.log(`  Actual: ${result50.averageTime.toFixed(2)}ms`);
    console.log(`  Status: ${result50.meetsTarget ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (!result50.meetsTarget) {
      console.log('\n⚠️  Performance optimization needed!');
      console.log('  Suggestions:');
      console.log('  - Increase batch size for parallel processing');
      console.log('  - Optimize pgvector queries');
      console.log('  - Implement connection pooling');
      console.log('  - Add query result caching');
    }
  }
  
  // Display engine statistics
  console.log('\n📈 Engine Statistics:');
  const stats = engine.getStats();
  console.log(`  Total chunks processed: ${stats.metrics.processedChunks}`);
  console.log(`  Cache hit rate: ${(stats.cacheStats.hitRate * 100).toFixed(1)}%`);
  console.log(`  Cache size: ${stats.cacheStats.size}/${stats.cacheStats.maxSize}`);
  
  // Overall pass/fail
  const allPassed = results.every(r => r.meetsTarget);
  console.log('\n' + '=' . repeat(60));
  console.log(allPassed ? '✅ ALL PERFORMANCE TARGETS MET!' : '⚠️  Some performance targets not met');
  
  process.exit(allPassed ? 0 : 1);
}

// Run benchmark
main().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});