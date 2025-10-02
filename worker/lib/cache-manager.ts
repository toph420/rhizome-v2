/**
 * Cache management system for collision detection performance optimization.
 * Implements LRU cache with TTL support for engine results.
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  size?: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum number of entries
  maxMemory?: number; // Maximum memory in bytes (optional)
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  memoryUsage: number;
  hitRate: number;
}

/**
 * LRU Cache implementation with TTL support.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private config: CacheConfig;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    memoryUsage: 0,
    hitRate: 0,
  };

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Gets a value from the cache.
   */
  get(key: K): V | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access order (LRU)
    this.updateAccessOrder(key);
    entry.accessCount++;
    
    this.stats.hits++;
    this.updateHitRate();
    
    return entry.value;
  }

  /**
   * Sets a value in the cache.
   */
  set(key: K, value: V, size?: number): void {
    if (!this.config.enabled) {
      return;
    }

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<V> = {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      size,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.stats.size = this.cache.size;
    
    if (size) {
      this.stats.memoryUsage += size;
      this.checkMemoryLimit();
    }
  }

  /**
   * Deletes an entry from the cache.
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    if (entry.size) {
      this.stats.memoryUsage -= entry.size;
    }
    
    this.stats.size = this.cache.size;
    return true;
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      memoryUsage: 0,
      hitRate: 0,
    };
  }

  /**
   * Gets the current cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Checks if an entry has expired.
   */
  private isExpired(entry: CacheEntry<V>): boolean {
    return Date.now() - entry.timestamp > this.config.ttl;
  }

  /**
   * Updates the access order for LRU tracking.
   */
  private updateAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evicts the least recently used entry.
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const keyToEvict = this.accessOrder[0];
    const entry = this.cache.get(keyToEvict);
    
    if (entry?.size) {
      this.stats.memoryUsage -= entry.size;
    }
    
    this.cache.delete(keyToEvict);
    this.accessOrder.shift();
    this.stats.evictions++;
    this.stats.size = this.cache.size;
  }

  /**
   * Checks and enforces memory limit if configured.
   */
  private checkMemoryLimit(): void {
    if (!this.config.maxMemory) return;

    while (this.stats.memoryUsage > this.config.maxMemory && this.accessOrder.length > 0) {
      this.evictLRU();
    }
  }

  /**
   * Updates the hit rate statistic.
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Gets the current cache size.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Checks if a key exists in the cache (without accessing it).
   */
  has(key: K): boolean {
    if (!this.config.enabled) return false;
    
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Gets all keys in the cache.
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Prunes expired entries from the cache.
   */
  prune(): number {
    let pruned = 0;
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttl) {
        this.delete(key);
        pruned++;
      }
    }
    
    return pruned;
  }
}

/**
 * Cache manager for collision detection engines.
 * Manages multiple caches for different engine types.
 */
export class CollisionCacheManager {
  private caches = new Map<string, LRUCache<string, any>>();
  private globalConfig: CacheConfig;
  private enabled: boolean;

  constructor(config?: Partial<CacheConfig>) {
    this.globalConfig = {
      enabled: true,
      ttl: 300000, // 5 minutes default
      maxSize: 1000,
      maxMemory: 50 * 1024 * 1024, // 50MB default
      ...config,
    };
    this.enabled = this.globalConfig.enabled;
  }

  /**
   * Creates a cache key from input parameters.
   */
  createKey(...params: any[]): string {
    return JSON.stringify(params);
  }

  /**
   * Gets or creates a cache for a specific namespace.
   */
  getCache<T>(namespace: string, config?: Partial<CacheConfig>): LRUCache<string, T> {
    if (!this.caches.has(namespace)) {
      const cacheConfig = { ...this.globalConfig, ...config };
      this.caches.set(namespace, new LRUCache<string, T>(cacheConfig));
    }
    return this.caches.get(namespace) as LRUCache<string, T>;
  }

  /**
   * Gets a value from a namespaced cache.
   */
  get<T>(namespace: string, key: string): T | undefined {
    if (!this.enabled) return undefined;
    const cache = this.getCache<T>(namespace);
    return cache.get(key);
  }

  /**
   * Sets a value in a namespaced cache.
   */
  set<T>(namespace: string, key: string, value: T, size?: number): void {
    if (!this.enabled) return;
    const cache = this.getCache<T>(namespace);
    cache.set(key, value, size);
  }

  /**
   * Wraps a function with caching.
   */
  async memoize<T>(
    namespace: string,
    key: string,
    fn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    if (!this.enabled) {
      return fn();
    }

    const cached = this.get<T>(namespace, key);
    if (cached !== undefined) {
      return cached;
    }

    const result = await fn();
    
    // Store with custom TTL if provided
    if (ttl) {
      const cache = this.getCache<T>(namespace, { ttl });
      cache.set(key, result);
    } else {
      this.set(namespace, key, result);
    }

    return result;
  }

  /**
   * Clears a specific namespace cache.
   */
  clearNamespace(namespace: string): void {
    const cache = this.caches.get(namespace);
    if (cache) {
      cache.clear();
    }
  }

  /**
   * Clears all caches.
   */
  clearAll(): void {
    for (const cache of this.caches.values()) {
      cache.clear();
    }
  }

  /**
   * Gets statistics for all caches.
   */
  getAllStats(): Map<string, CacheStats> {
    const allStats = new Map<string, CacheStats>();
    
    for (const [namespace, cache] of this.caches) {
      allStats.set(namespace, cache.getStats());
    }
    
    return allStats;
  }

  /**
   * Gets aggregated statistics across all caches.
   */
  getAggregatedStats(): CacheStats {
    const stats: CacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      memoryUsage: 0,
      hitRate: 0,
    };

    for (const cache of this.caches.values()) {
      const cacheStats = cache.getStats();
      stats.hits += cacheStats.hits;
      stats.misses += cacheStats.misses;
      stats.evictions += cacheStats.evictions;
      stats.size += cacheStats.size;
      stats.memoryUsage += cacheStats.memoryUsage;
    }

    const total = stats.hits + stats.misses;
    stats.hitRate = total > 0 ? stats.hits / total : 0;

    return stats;
  }

  /**
   * Prunes expired entries from all caches.
   */
  pruneAll(): number {
    let totalPruned = 0;
    
    for (const cache of this.caches.values()) {
      totalPruned += cache.prune();
    }
    
    return totalPruned;
  }

  /**
   * Enables or disables caching globally.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.globalConfig.enabled = enabled;
    
    for (const cache of this.caches.values()) {
      // Update each cache's config
      (cache as any).config.enabled = enabled;
    }
  }

  /**
   * Logs cache statistics.
   */
  logStats(prefix: string = '[CacheManager]'): void {
    const stats = this.getAllStats();
    
    console.log(`${prefix} Cache Statistics:`);
    for (const [namespace, stat] of stats) {
      if (stat.size > 0 || stat.hits > 0 || stat.misses > 0) {
        console.log(`  ${namespace}:`);
        console.log(`    Size: ${stat.size} entries`);
        console.log(`    Hit Rate: ${(stat.hitRate * 100).toFixed(1)}%`);
        console.log(`    Hits: ${stat.hits}, Misses: ${stat.misses}`);
        console.log(`    Memory: ${(stat.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
      }
    }

    const aggregated = this.getAggregatedStats();
    console.log(`${prefix} Total:`);
    console.log(`  Hit Rate: ${(aggregated.hitRate * 100).toFixed(1)}%`);
    console.log(`  Memory Usage: ${(aggregated.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
  }
}

/**
 * Global cache manager instance for shared use.
 */
export const globalCacheManager = new CollisionCacheManager();

/**
 * Decorator for automatic method caching.
 */
export function Cached(namespace: string, ttl?: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheManager = (this as any).cacheManager || globalCacheManager;
      const key = cacheManager.createKey(propertyKey, ...args);

      return cacheManager.memoize(
        namespace,
        key,
        () => originalMethod.apply(this, args),
        ttl
      );
    };

    return descriptor;
  };
}