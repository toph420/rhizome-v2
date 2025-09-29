/**
 * Gemini Cache Effectiveness Benchmark
 * Measures the impact of caching Gemini file uploads
 */

const { BenchmarkHarness } = require('./base-harness.cjs');

class GeminiFileCache {
  constructor(ttlHours = 47) {
    this.cache = new Map();
    this.ttl = ttlHours * 60 * 60 * 1000; // Convert to milliseconds
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const age = Date.now() - entry.timestamp;
    if (age > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.uri;
  }

  set(key, uri) {
    this.cache.set(key, {
      uri,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

class NoCacheProcessing {
  constructor() {
    this.name = 'No Cache (Always Upload)';
  }

  async processDocuments(benchmark, documents) {
    const results = [];
    
    for (const doc of documents) {
      // Every document requires a Gemini upload
      benchmark.recordCacheMiss();
      
      // Simulate Gemini file upload (expensive operation)
      await this.simulateGeminiUpload();
      
      // Simulate processing
      await this.simulateProcessing();
      
      results.push({ document: doc.id, uploaded: true });
    }
    
    return results;
  }

  async simulateGeminiUpload() {
    // Gemini uploads take significant time
    return new Promise(resolve => setTimeout(resolve, 2000));
  }

  async simulateProcessing() {
    // Processing after upload
    return new Promise(resolve => setTimeout(resolve, 500));
  }
}

class WithCacheProcessing {
  constructor() {
    this.name = 'With 47-Hour Cache';
    this.cache = new GeminiFileCache(47);
  }

  async processDocuments(benchmark, documents) {
    const results = [];
    
    for (const doc of documents) {
      const cacheKey = `doc_${doc.id}_${doc.hash}`;
      const cachedUri = this.cache.get(cacheKey);
      
      if (cachedUri) {
        // Cache hit - no upload needed
        benchmark.recordCacheHit();
        await this.simulateCacheLookup();
      } else {
        // Cache miss - need to upload
        benchmark.recordCacheMiss();
        await this.simulateGeminiUpload();
        
        // Store in cache for future use
        this.cache.set(cacheKey, `gemini://file-${doc.id}`);
      }
      
      // Processing is the same regardless of cache
      await this.simulateProcessing();
      
      results.push({
        document: doc.id,
        cached: !!cachedUri,
        uploaded: !cachedUri
      });
    }
    
    return results;
  }

  async simulateCacheLookup() {
    // Cache lookup is very fast
    return new Promise(resolve => setTimeout(resolve, 10));
  }

  async simulateGeminiUpload() {
    // Gemini uploads take significant time
    return new Promise(resolve => setTimeout(resolve, 2000));
  }

  async simulateProcessing() {
    // Processing after getting the file
    return new Promise(resolve => setTimeout(resolve, 500));
  }
}

class IntelligentCacheProcessing {
  constructor() {
    this.name = 'Intelligent Cache with Preemptive Refresh';
    this.cache = new GeminiFileCache(47);
    this.refreshThreshold = 40 * 60 * 60 * 1000; // Refresh if older than 40 hours
  }

  async processDocuments(benchmark, documents) {
    const results = [];
    
    for (const doc of documents) {
      const cacheKey = `doc_${doc.id}_${doc.hash}`;
      const cacheEntry = this.getCacheEntry(cacheKey);
      
      if (cacheEntry && !this.needsRefresh(cacheEntry)) {
        // Cache hit and fresh enough
        benchmark.recordCacheHit();
        await this.simulateCacheLookup();
      } else if (cacheEntry && this.needsRefresh(cacheEntry)) {
        // Cache hit but needs refresh soon
        benchmark.recordCacheHit();
        await this.simulateCacheLookup();
        
        // Schedule background refresh (doesn't block processing)
        this.scheduleBackgroundRefresh(cacheKey, doc);
      } else {
        // Cache miss - need to upload
        benchmark.recordCacheMiss();
        await this.simulateGeminiUpload();
        
        // Store in cache
        this.cache.set(cacheKey, `gemini://file-${doc.id}`);
      }
      
      // Processing continues
      await this.simulateProcessing();
      
      results.push({
        document: doc.id,
        cached: !!cacheEntry,
        refreshScheduled: cacheEntry && this.needsRefresh(cacheEntry)
      });
    }
    
    return results;
  }

  getCacheEntry(key) {
    const entry = this.cache.cache.get(key);
    return entry;
  }

  needsRefresh(entry) {
    const age = Date.now() - entry.timestamp;
    return age > this.refreshThreshold;
  }

  scheduleBackgroundRefresh(key, doc) {
    // In real implementation, this would be async
    // For benchmark, we just note it's scheduled
    setTimeout(() => {
      // Refresh happens in background
      this.cache.set(key, `gemini://file-${doc.id}-refreshed`);
    }, 100);
  }

  async simulateCacheLookup() {
    return new Promise(resolve => setTimeout(resolve, 10));
  }

  async simulateGeminiUpload() {
    return new Promise(resolve => setTimeout(resolve, 2000));
  }

  async simulateProcessing() {
    return new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Run cache effectiveness benchmarks
 */
async function runCacheBenchmarks(options = {}) {
  const { runs = 3, documentsPerRun = 10, repeatDocuments = true, verbose = false } = options;
  
  console.log('\n💾 Gemini Cache Effectiveness Benchmark\n');
  console.log(`Testing with ${documentsPerRun} documents, ${runs} iterations...\n`);
  
  // Create test documents
  const createDocuments = (runIndex) => {
    if (repeatDocuments) {
      // Same documents each run (to test cache effectiveness)
      return Array.from({ length: documentsPerRun }, (_, i) => ({
        id: `doc_${i}`,
        hash: `hash_${i}`,
        content: `Document ${i} content`
      }));
    } else {
      // Different documents each run
      return Array.from({ length: documentsPerRun }, (_, i) => ({
        id: `doc_${runIndex}_${i}`,
        hash: `hash_${runIndex}_${i}`,
        content: `Document ${runIndex}-${i} content`
      }));
    }
  };
  
  // Benchmark no cache
  const noCacheBenchmark = new BenchmarkHarness('No Cache');
  const noCacheProcessor = new NoCacheProcessing();
  
  console.log('Testing without cache...');
  for (let i = 0; i < runs; i++) {
    if (verbose) console.log(`  Run ${i + 1}/${runs}`);
    const documents = createDocuments(i);
    noCacheBenchmark.start();
    await noCacheProcessor.processDocuments(noCacheBenchmark, documents);
    noCacheBenchmark.end();
  }
  
  // Benchmark with cache
  const withCacheBenchmark = new BenchmarkHarness('With Cache');
  const withCacheProcessor = new WithCacheProcessing();
  
  console.log('Testing with 47-hour cache...');
  for (let i = 0; i < runs; i++) {
    if (verbose) console.log(`  Run ${i + 1}/${runs}`);
    const documents = createDocuments(i);
    withCacheBenchmark.start();
    await withCacheProcessor.processDocuments(withCacheBenchmark, documents);
    withCacheBenchmark.end();
  }
  
  // Benchmark intelligent cache
  const intelligentBenchmark = new BenchmarkHarness('Intelligent Cache');
  const intelligentProcessor = new IntelligentCacheProcessing();
  
  console.log('Testing intelligent cache with preemptive refresh...');
  for (let i = 0; i < runs; i++) {
    if (verbose) console.log(`  Run ${i + 1}/${runs}`);
    const documents = createDocuments(i);
    intelligentBenchmark.start();
    await intelligentProcessor.processDocuments(intelligentBenchmark, documents);
    intelligentBenchmark.end();
  }
  
  // Display results
  console.log('\n' + '='.repeat(70));
  console.log(noCacheBenchmark.formatReport());
  console.log('\n' + '='.repeat(70));
  console.log(withCacheBenchmark.formatReport());
  console.log('\n' + '='.repeat(70));
  console.log(intelligentBenchmark.formatReport());
  
  // Show comparisons
  console.log('\n' + '='.repeat(70));
  console.log('\n📈 Cache Effectiveness Analysis\n');
  
  const basicCacheComparison = BenchmarkHarness.compare(noCacheBenchmark, withCacheBenchmark);
  if (basicCacheComparison) {
    console.log('Basic Cache (47-hour TTL):');
    console.log(`  Speed Improvement:       ${basicCacheComparison.summary.speedup.toFixed(2)}x faster`);
    console.log(`  Cache Hit Rate:          ${(basicCacheComparison.current.cache.hitRate * 100).toFixed(1)}%`);
    console.log(`  Time Saved per Document: ${((basicCacheComparison.baseline.timing.mean - basicCacheComparison.current.timing.mean) / documentsPerRun).toFixed(0)}ms`);
    
    const uploadsAvoided = basicCacheComparison.current.cache.totalHits;
    const uploadsSaved = uploadsAvoided * 2000; // 2 seconds per upload
    console.log(`  Uploads Avoided:         ${uploadsAvoided}`);
    console.log(`  Total Time Saved:        ${(uploadsSaved / 1000).toFixed(1)}s`);
  }
  
  const intelligentComparison = BenchmarkHarness.compare(noCacheBenchmark, intelligentBenchmark);
  if (intelligentComparison) {
    console.log('\nIntelligent Cache (with preemptive refresh):');
    console.log(`  Speed Improvement:       ${intelligentComparison.summary.speedup.toFixed(2)}x faster`);
    console.log(`  Cache Hit Rate:          ${(intelligentComparison.current.cache.hitRate * 100).toFixed(1)}%`);
    console.log(`  Time Saved per Document: ${((intelligentComparison.baseline.timing.mean - intelligentComparison.current.timing.mean) / documentsPerRun).toFixed(0)}ms`);
  }
  
  // Calculate Gemini API savings
  console.log('\n💰 Gemini API Usage Reduction:');
  if (basicCacheComparison) {
    const totalDocuments = documentsPerRun * runs;
    const uploadsWithoutCache = totalDocuments;
    const uploadsWithCache = basicCacheComparison.current.cache.totalMisses;
    const reduction = ((uploadsWithoutCache - uploadsWithCache) / uploadsWithoutCache * 100);
    
    console.log(`  Documents Processed:     ${totalDocuments}`);
    console.log(`  Uploads without Cache:   ${uploadsWithoutCache}`);
    console.log(`  Uploads with Cache:      ${uploadsWithCache}`);
    console.log(`  API Call Reduction:      ${reduction.toFixed(1)}%`);
    
    if (reduction >= 80) {
      console.log('  ✅ Target of 80%+ API reduction achieved!');
    }
  }
  
  return { noCacheBenchmark, withCacheBenchmark, intelligentBenchmark };
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const runs = parseInt(args[0]) || 3;
  const documentsPerRun = parseInt(args[1]) || 10;
  const verbose = args.includes('--verbose');
  const uniqueDocs = args.includes('--unique');
  
  runCacheBenchmarks({
    runs,
    documentsPerRun,
    repeatDocuments: !uniqueDocs,
    verbose
  })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

module.exports = { runCacheBenchmarks };