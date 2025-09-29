/**
 * Database Batch Operations Benchmark
 * Measures the performance improvement from batching database operations
 */

const { BenchmarkHarness } = require('./base-harness.cjs');

class IndividualDatabaseOperations {
  constructor() {
    this.name = 'Individual Database Calls';
  }

  async insertChunks(benchmark, chunks) {
    // Simulate individual insertion of each chunk
    for (let i = 0; i < chunks.length; i++) {
      benchmark.recordDatabaseCall();
      await this.simulateDBOperation(10); // Each insert takes 10ms
      
      // Progress update every 10 chunks
      if (i > 0 && i % 10 === 0) {
        benchmark.recordDatabaseCall();
        await this.simulateDBOperation(5); // Progress update
      }
    }
    
    return { inserted: chunks.length };
  }

  async simulateDBOperation(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class BatchDatabaseOperations {
  constructor() {
    this.name = 'Batch Database Operations';
    this.batchSize = 50;
  }

  async insertChunks(benchmark, chunks) {
    // Simulate batch insertion
    const batches = this.createBatches(chunks, this.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      benchmark.recordDatabaseCall();
      // Batch operations are slightly slower per call but process many items
      await this.simulateDBOperation(30);
      
      // Progress update per batch
      benchmark.recordDatabaseCall();
      await this.simulateDBOperation(5);
    }
    
    return { inserted: chunks.length, batches: batches.length };
  }

  createBatches(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  async simulateDBOperation(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class AdaptiveBatchOperations {
  constructor() {
    this.name = 'Adaptive Batch Operations';
    this.maxBatchSize = 50;
    this.parameterLimit = 65535;
  }

  async insertChunks(benchmark, chunks) {
    // Simulate adaptive batch sizing based on parameter limits
    const batches = this.createAdaptiveBatches(chunks);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      // Simulate retry logic with smaller batch on failure
      let success = false;
      let retryBatch = batch;
      let attempts = 0;
      
      while (!success && attempts < 3) {
        try {
          benchmark.recordDatabaseCall();
          
          // Simulate occasional failures for large batches
          if (retryBatch.length > 40 && Math.random() < 0.2 && attempts === 0) {
            throw new Error('Too many parameters');
          }
          
          await this.simulateDBOperation(25 + (retryBatch.length * 0.1));
          success = true;
        } catch (error) {
          attempts++;
          // Reduce batch size on failure
          const newSize = Math.floor(retryBatch.length / 2);
          const firstHalf = retryBatch.slice(0, newSize);
          const secondHalf = retryBatch.slice(newSize);
          
          // Process first half
          benchmark.recordDatabaseCall();
          await this.simulateDBOperation(25 + (firstHalf.length * 0.1));
          
          // Process second half
          retryBatch = secondHalf;
        }
      }
      
      // Progress update
      benchmark.recordDatabaseCall();
      await this.simulateDBOperation(5);
    }
    
    return { inserted: chunks.length, batches: batches.length };
  }

  createAdaptiveBatches(chunks) {
    // Calculate optimal batch size based on chunk complexity
    const batches = [];
    let currentBatch = [];
    let currentParams = 0;
    const paramsPerChunk = 15; // Estimate 15 parameters per chunk
    
    for (const chunk of chunks) {
      const chunkParams = paramsPerChunk;
      
      if (currentParams + chunkParams > this.parameterLimit / 100) {
        // Start new batch if we're approaching limits
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentParams = 0;
        }
      }
      
      currentBatch.push(chunk);
      currentParams += chunkParams;
      
      if (currentBatch.length >= this.maxBatchSize) {
        batches.push(currentBatch);
        currentBatch = [];
        currentParams = 0;
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    return batches;
  }

  async simulateDBOperation(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run batch operations benchmarks
 */
async function runBatchBenchmarks(options = {}) {
  const { runs = 5, chunkCount = 150, verbose = false } = options;
  
  console.log('\n🗄️  Database Batch Operations Benchmark\n');
  console.log(`Testing with ${chunkCount} chunks, ${runs} iterations each...\n`);
  
  // Create test data
  const chunks = Array.from({ length: chunkCount }, (_, i) => ({
    id: i,
    content: `Chunk ${i}`,
    embedding: new Array(768).fill(0.1),
    metadata: { themes: ['test'], importance: 0.5 }
  }));
  
  // Benchmark individual operations
  const individualBenchmark = new BenchmarkHarness('Individual Operations');
  const individualOps = new IndividualDatabaseOperations();
  
  console.log('Testing individual operations...');
  for (let i = 0; i < runs; i++) {
    if (verbose) console.log(`  Run ${i + 1}/${runs}`);
    individualBenchmark.start();
    await individualOps.insertChunks(individualBenchmark, chunks);
    individualBenchmark.end();
  }
  
  // Benchmark batch operations
  const batchBenchmark = new BenchmarkHarness('Batch Operations');
  const batchOps = new BatchDatabaseOperations();
  
  console.log('Testing batch operations...');
  for (let i = 0; i < runs; i++) {
    if (verbose) console.log(`  Run ${i + 1}/${runs}`);
    batchBenchmark.start();
    await batchOps.insertChunks(batchBenchmark, chunks);
    batchBenchmark.end();
  }
  
  // Benchmark adaptive batch operations
  const adaptiveBenchmark = new BenchmarkHarness('Adaptive Batch Operations');
  const adaptiveOps = new AdaptiveBatchOperations();
  
  console.log('Testing adaptive batch operations...');
  for (let i = 0; i < runs; i++) {
    if (verbose) console.log(`  Run ${i + 1}/${runs}`);
    adaptiveBenchmark.start();
    await adaptiveOps.insertChunks(adaptiveBenchmark, chunks);
    adaptiveBenchmark.end();
  }
  
  // Display results
  console.log('\n' + '='.repeat(70));
  console.log(individualBenchmark.formatReport());
  console.log('\n' + '='.repeat(70));
  console.log(batchBenchmark.formatReport());
  console.log('\n' + '='.repeat(70));
  console.log(adaptiveBenchmark.formatReport());
  
  // Show comparisons
  console.log('\n' + '='.repeat(70));
  console.log('\n📈 Performance Improvements\n');
  
  const batchComparison = BenchmarkHarness.compare(individualBenchmark, batchBenchmark);
  if (batchComparison) {
    console.log('Fixed Batch Size:');
    console.log(`  Speed Improvement:       ${batchComparison.summary.speedup.toFixed(2)}x faster`);
    console.log(`  Database Call Reduction: ${batchComparison.summary.dbCallReduction.toFixed(1)}x fewer calls`);
    console.log(`  Verdict:                 ${batchComparison.summary.verdict}`);
  }
  
  const adaptiveComparison = BenchmarkHarness.compare(individualBenchmark, adaptiveBenchmark);
  if (adaptiveComparison) {
    console.log('\nAdaptive Batch Size:');
    console.log(`  Speed Improvement:       ${adaptiveComparison.summary.speedup.toFixed(2)}x faster`);
    console.log(`  Database Call Reduction: ${adaptiveComparison.summary.dbCallReduction.toFixed(1)}x fewer calls`);
    console.log(`  Verdict:                 ${adaptiveComparison.summary.verdict}`);
  }
  
  return { individualBenchmark, batchBenchmark, adaptiveBenchmark };
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const runs = parseInt(args[0]) || 5;
  const chunkCount = parseInt(args[1]) || 150;
  const verbose = args.includes('--verbose');
  
  runBatchBenchmarks({ runs, chunkCount, verbose })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

module.exports = { runBatchBenchmarks };