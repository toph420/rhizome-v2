/**
 * Base Benchmark Harness
 * Provides core utilities for measuring performance across the document processing pipeline
 */

const { performance } = require('perf_hooks');

class BenchmarkHarness {
  constructor(name) {
    this.name = name;
    this.metrics = {
      runs: [],
      databaseCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memorySnapshots: []
    };
    this.startTime = null;
    this.startMemory = null;
  }

  /**
   * Start a benchmark run
   */
  start() {
    this.startTime = performance.now();
    this.startMemory = process.memoryUsage();
    
    // Reset per-run counters
    this.currentRun = {
      databaseCalls: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Take initial memory snapshot
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * End a benchmark run and record metrics
   */
  end() {
    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    
    const duration = endTime - this.startTime;
    const memoryDelta = {
      rss: endMemory.rss - this.startMemory.rss,
      heapTotal: endMemory.heapTotal - this.startMemory.heapTotal,
      heapUsed: endMemory.heapUsed - this.startMemory.heapUsed,
      external: endMemory.external - this.startMemory.external
    };
    
    const runMetrics = {
      duration,
      databaseCalls: this.currentRun.databaseCalls,
      cacheHits: this.currentRun.cacheHits,
      cacheMisses: this.currentRun.cacheMisses,
      memory: memoryDelta,
      timestamp: new Date().toISOString()
    };
    
    this.metrics.runs.push(runMetrics);
    
    // Update totals
    this.metrics.databaseCalls += this.currentRun.databaseCalls;
    this.metrics.cacheHits += this.currentRun.cacheHits;
    this.metrics.cacheMisses += this.currentRun.cacheMisses;
    
    return runMetrics;
  }

  /**
   * Track a database call
   */
  recordDatabaseCall() {
    this.currentRun.databaseCalls++;
  }

  /**
   * Track cache hit/miss
   */
  recordCacheHit() {
    this.currentRun.cacheHits++;
  }

  recordCacheMiss() {
    this.currentRun.cacheMisses++;
  }

  /**
   * Calculate statistics from all runs
   */
  getStatistics() {
    const runs = this.metrics.runs;
    if (runs.length === 0) {
      return null;
    }

    const durations = runs.map(r => r.duration);
    const dbCalls = runs.map(r => r.databaseCalls);
    
    return {
      name: this.name,
      totalRuns: runs.length,
      timing: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        mean: durations.reduce((a, b) => a + b, 0) / durations.length,
        median: this.getMedian(durations),
        p95: this.getPercentile(durations, 95),
        p99: this.getPercentile(durations, 99)
      },
      database: {
        totalCalls: this.metrics.databaseCalls,
        avgCallsPerRun: this.metrics.databaseCalls / runs.length,
        minCalls: Math.min(...dbCalls),
        maxCalls: Math.max(...dbCalls)
      },
      cache: {
        totalHits: this.metrics.cacheHits,
        totalMisses: this.metrics.cacheMisses,
        hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
      },
      memory: this.getMemoryStatistics()
    };
  }

  /**
   * Get median value from array
   */
  getMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    
    return sorted[mid];
  }

  /**
   * Get percentile value from array
   */
  getPercentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Calculate memory statistics
   */
  getMemoryStatistics() {
    const runs = this.metrics.runs;
    if (runs.length === 0) return null;

    const heapUsed = runs.map(r => r.memory.heapUsed);
    
    return {
      avgHeapDelta: heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length,
      maxHeapDelta: Math.max(...heapUsed),
      minHeapDelta: Math.min(...heapUsed)
    };
  }

  /**
   * Generate a comparison report between two benchmarks
   */
  static compare(baseline, current) {
    const baseStats = baseline.getStatistics();
    const currStats = current.getStatistics();
    
    if (!baseStats || !currStats) {
      return null;
    }

    const improvement = {
      timing: {
        mean: ((baseStats.timing.mean - currStats.timing.mean) / baseStats.timing.mean) * 100,
        p95: ((baseStats.timing.p95 - currStats.timing.p95) / baseStats.timing.p95) * 100
      },
      database: {
        callReduction: baseStats.database.avgCallsPerRun / currStats.database.avgCallsPerRun
      },
      cache: {
        hitRateImprovement: currStats.cache.hitRate - baseStats.cache.hitRate
      }
    };

    return {
      baseline: baseStats,
      current: currStats,
      improvement,
      summary: {
        speedup: baseStats.timing.mean / currStats.timing.mean,
        dbCallReduction: improvement.database.callReduction,
        verdict: improvement.database.callReduction >= 50 ? 'PASS ✅' : 'FAIL ❌'
      }
    };
  }

  /**
   * Format statistics for console output
   */
  formatReport() {
    const stats = this.getStatistics();
    if (!stats) return 'No benchmark data available';

    return `
╔════════════════════════════════════════════════════════════════╗
║ Benchmark: ${stats.name.padEnd(51)} ║
╠════════════════════════════════════════════════════════════════╣
║ Performance Metrics                                            ║
╟────────────────────────────────────────────────────────────────╢
║ Runs:        ${stats.totalRuns.toString().padEnd(50)} ║
║ Mean Time:   ${stats.timing.mean.toFixed(2).padEnd(47)} ms ║
║ Median Time: ${stats.timing.median.toFixed(2).padEnd(47)} ms ║
║ P95 Time:    ${stats.timing.p95.toFixed(2).padEnd(47)} ms ║
║ P99 Time:    ${stats.timing.p99.toFixed(2).padEnd(47)} ms ║
╟────────────────────────────────────────────────────────────────╢
║ Database Operations                                            ║
╟────────────────────────────────────────────────────────────────╢
║ Total Calls:     ${stats.database.totalCalls.toString().padEnd(46)} ║
║ Avg Calls/Run:   ${stats.database.avgCallsPerRun.toFixed(1).padEnd(46)} ║
║ Min Calls:       ${stats.database.minCalls.toString().padEnd(46)} ║
║ Max Calls:       ${stats.database.maxCalls.toString().padEnd(46)} ║
╟────────────────────────────────────────────────────────────────╢
║ Cache Performance                                              ║
╟────────────────────────────────────────────────────────────────╢
║ Cache Hits:      ${stats.cache.totalHits.toString().padEnd(46)} ║
║ Cache Misses:    ${stats.cache.totalMisses.toString().padEnd(46)} ║
║ Hit Rate:        ${(stats.cache.hitRate * 100).toFixed(1).padEnd(45)} % ║
╟────────────────────────────────────────────────────────────────╢
║ Memory Usage                                                   ║
╟────────────────────────────────────────────────────────────────╢
║ Avg Heap Delta:  ${(stats.memory.avgHeapDelta / 1024 / 1024).toFixed(2).padEnd(44)} MB ║
║ Max Heap Delta:  ${(stats.memory.maxHeapDelta / 1024 / 1024).toFixed(2).padEnd(44)} MB ║
╚════════════════════════════════════════════════════════════════╝
    `.trim();
  }
}

module.exports = { BenchmarkHarness };