/**
 * Performance monitoring utilities for the collision detection system.
 * Tracks execution times, memory usage, and provides detailed metrics.
 */

export interface PerformanceMetric {
  label: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  totalDuration: number;
  metrics: PerformanceMetric[];
  memoryUsage?: MemoryUsage;
  averages: Map<string, number>;
  percentiles: Map<string, PercentileData>;
}

export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  timestamp: number;
}

export interface PercentileData {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * Performance monitor for tracking and analyzing execution metrics.
 */
export class PerformanceMonitor {
  private timers = new Map<string, number>();
  private metrics: PerformanceMetric[] = [];
  private metricsByLabel = new Map<string, number[]>();
  private memorySnapshots: MemoryUsage[] = [];
  private startTime: number = 0;
  private enabled: boolean = true;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Starts a timer for the given label.
   */
  startTimer(label: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;
    
    const now = performance.now();
    this.timers.set(label, now);
    
    if (!this.startTime) {
      this.startTime = now;
    }
  }

  /**
   * Ends a timer and records the metric.
   */
  endTimer(label: string, metadata?: Record<string, any>): number {
    if (!this.enabled) return 0;
    
    const start = this.timers.get(label);
    if (!start) {
      console.warn(`[PerformanceMonitor] Timer '${label}' was not started`);
      return 0;
    }

    const duration = performance.now() - start;
    const metric: PerformanceMetric = {
      label,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);
    this.timers.delete(label);

    // Track by label for aggregation
    if (!this.metricsByLabel.has(label)) {
      this.metricsByLabel.set(label, []);
    }
    this.metricsByLabel.get(label)!.push(duration);

    return duration;
  }

  /**
   * Records a memory snapshot.
   */
  recordMemoryUsage(): MemoryUsage | null {
    if (!this.enabled || typeof process === 'undefined') return null;

    const usage = process.memoryUsage();
    const snapshot: MemoryUsage = {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      timestamp: Date.now(),
    };

    this.memorySnapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Gets all recorded metrics.
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Gets metrics for a specific label.
   */
  getMetricsByLabel(label: string): number[] {
    return this.metricsByLabel.get(label) || [];
  }

  /**
   * Calculates percentiles for a given array of values.
   */
  private calculatePercentiles(values: number[]): PercentileData {
    if (values.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const getPercentile = (p: number) => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, index)];
    };

    return {
      p50: getPercentile(50),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }

  /**
   * Generates a comprehensive performance report.
   */
  generateReport(): PerformanceReport {
    const totalDuration = this.startTime ? performance.now() - this.startTime : 0;
    const averages = new Map<string, number>();
    const percentiles = new Map<string, PercentileData>();

    // Calculate averages and percentiles for each label
    for (const [label, values] of this.metricsByLabel) {
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        averages.set(label, avg);
        percentiles.set(label, this.calculatePercentiles(values));
      }
    }

    // Get latest memory usage
    const memoryUsage = this.memorySnapshots.length > 0
      ? this.memorySnapshots[this.memorySnapshots.length - 1]
      : undefined;

    return {
      totalDuration,
      metrics: this.metrics,
      memoryUsage,
      averages,
      percentiles,
    };
  }

  /**
   * Logs a formatted summary of performance metrics.
   */
  logSummary(prefix: string = '[Performance]'): void {
    if (!this.enabled) return;

    const report = this.generateReport();
    
    console.log(`${prefix} Total Duration: ${report.totalDuration.toFixed(2)}ms`);
    
    if (report.averages.size > 0) {
      console.log(`${prefix} Average Times:`);
      for (const [label, avg] of report.averages) {
        const count = this.metricsByLabel.get(label)?.length || 0;
        console.log(`  ${label}: ${avg.toFixed(2)}ms (${count} calls)`);
      }
    }

    if (report.percentiles.size > 0) {
      console.log(`${prefix} Percentiles:`);
      for (const [label, perc] of report.percentiles) {
        console.log(`  ${label}:`);
        console.log(`    p50: ${perc.p50.toFixed(2)}ms`);
        console.log(`    p90: ${perc.p90.toFixed(2)}ms`);
        console.log(`    p95: ${perc.p95.toFixed(2)}ms`);
        console.log(`    p99: ${perc.p99.toFixed(2)}ms`);
      }
    }

    if (report.memoryUsage) {
      console.log(`${prefix} Memory Usage:`);
      console.log(`  Heap Used: ${(report.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Heap Total: ${(report.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  /**
   * Marks a checkpoint with current metrics.
   */
  checkpoint(label: string): void {
    if (!this.enabled) return;

    const duration = this.startTime ? performance.now() - this.startTime : 0;
    console.log(`[Checkpoint] ${label}: ${duration.toFixed(2)}ms elapsed`);
    this.recordMemoryUsage();
  }

  /**
   * Resets all metrics and timers.
   */
  reset(): void {
    this.timers.clear();
    this.metrics = [];
    this.metricsByLabel.clear();
    this.memorySnapshots = [];
    this.startTime = 0;
  }

  /**
   * Enables or disables monitoring.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Checks if monitoring is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Creates a child timer that automatically tracks hierarchy.
   */
  createChildTimer(parentLabel: string, childLabel: string): () => number {
    const fullLabel = `${parentLabel}.${childLabel}`;
    this.startTimer(fullLabel);
    return () => this.endTimer(fullLabel);
  }

  /**
   * Wraps an async function with automatic timing.
   */
  async measureAsync<T>(
    label: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.startTimer(label, metadata);
    try {
      const result = await fn();
      this.endTimer(label, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.endTimer(label, { ...metadata, success: false, error: String(error) });
      throw error;
    }
  }

  /**
   * Wraps a sync function with automatic timing.
   */
  measureSync<T>(
    label: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    this.startTimer(label, metadata);
    try {
      const result = fn();
      this.endTimer(label, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.endTimer(label, { ...metadata, success: false, error: String(error) });
      throw error;
    }
  }
}

/**
 * Global performance monitor instance for shared use.
 */
export const globalPerformanceMonitor = new PerformanceMonitor();

/**
 * Decorator for automatic method timing.
 */
export function Timed(label?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const timerLabel = label || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const monitor = (this as any).performanceMonitor || globalPerformanceMonitor;
      
      if (originalMethod.constructor.name === 'AsyncFunction') {
        return monitor.measureAsync(
          timerLabel,
          () => originalMethod.apply(this, args),
          { args: args.length }
        );
      } else {
        return monitor.measureSync(
          timerLabel,
          () => originalMethod.apply(this, args),
          { args: args.length }
        );
      }
    };

    return descriptor;
  };
}