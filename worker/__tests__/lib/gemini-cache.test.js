/**
 * Tests for Gemini file caching system
 */

import { jest } from '@jest/globals'

// Mock crypto module with proper chaining support
const mockHash = {
  update: jest.fn().mockReturnThis(), // Enable chaining
  digest: jest.fn(() => 'test-hash-123')
}

jest.unstable_mockModule('crypto', () => ({
  default: {
    createHash: jest.fn(() => mockHash)
  },
  // Also support named import
  createHash: jest.fn(() => mockHash)
}))

// Import after mocking (from TypeScript source, not compiled dist)
const { GeminiFileCache } = await import('../../lib/gemini-cache.ts')

describe('GeminiFileCache', () => {
  let cache
  let mockUploadFn

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    
    // Reset singleton
    GeminiFileCache['instance'] = undefined
    cache = GeminiFileCache.getInstance()
    
    // Mock upload function
    mockUploadFn = jest.fn().mockResolvedValue({
      uri: 'files/test-file-uri-123',
      name: 'test-file.pdf'
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = GeminiFileCache.getInstance()
      const instance2 = GeminiFileCache.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('getOrUpload', () => {
    const testBuffer = new ArrayBuffer(1024 * 100) // 100KB

    it('should upload file on cache miss', async () => {
      const fileUri = await cache.getOrUpload(testBuffer, mockUploadFn)

      expect(mockUploadFn).toHaveBeenCalledTimes(1)
      expect(mockUploadFn).toHaveBeenCalledWith(testBuffer)
      expect(fileUri).toBe('files/test-file-uri-123')
    })

    it('should return cached URI on cache hit', async () => {
      // First call - cache miss
      const uri1 = await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(1)

      // Second call - cache hit
      const uri2 = await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(1) // Not called again
      expect(uri2).toBe(uri1)
    })

    it('should respect forceUpload option', async () => {
      // First upload
      await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(1)

      // Force re-upload
      await cache.getOrUpload(testBuffer, mockUploadFn, { forceUpload: true })
      expect(mockUploadFn).toHaveBeenCalledTimes(2)
    })

    it('should expire entries after TTL', async () => {
      // Upload with 1 hour TTL for testing
      const oneHour = 60 * 60 * 1000
      await cache.getOrUpload(testBuffer, mockUploadFn, { ttl: oneHour })
      expect(mockUploadFn).toHaveBeenCalledTimes(1)

      // Advance time by 30 minutes - should still be cached
      jest.advanceTimersByTime(30 * 60 * 1000)
      await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(1)

      // Advance time by another 31 minutes (total 61 minutes) - should be expired
      jest.advanceTimersByTime(31 * 60 * 1000)
      await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(2)
    })

    it('should handle upload errors gracefully', async () => {
      const errorUpload = jest.fn().mockRejectedValue(new Error('Upload failed'))
      
      await expect(cache.getOrUpload(testBuffer, errorUpload))
        .rejects.toThrow('Upload failed')
    })
  })

  describe('invalidate', () => {
    const testBuffer = new ArrayBuffer(1024 * 100)

    it('should invalidate cached entry', async () => {
      // Upload and cache
      await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(1)

      // Invalidate
      cache.invalidate(testBuffer)

      // Should re-upload after invalidation
      await cache.getOrUpload(testBuffer, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(2)
    })
  })

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      const buffer1 = new ArrayBuffer(100)
      const buffer2 = new ArrayBuffer(200)

      // Upload two different files
      await cache.getOrUpload(buffer1, mockUploadFn)
      await cache.getOrUpload(buffer2, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(2)

      // Clear cache
      cache.clear()

      // Both should need re-upload
      await cache.getOrUpload(buffer1, mockUploadFn)
      await cache.getOrUpload(buffer2, mockUploadFn)
      expect(mockUploadFn).toHaveBeenCalledTimes(4)
    })
  })

  describe('getMetrics', () => {
    it('should track cache metrics', async () => {
      const testBuffer = new ArrayBuffer(1024)

      // Initial state
      let metrics = cache.getMetrics()
      expect(metrics.hits).toBe(0)
      expect(metrics.misses).toBe(0)
      expect(metrics.hitRate).toBe('0.0%')

      // First upload - miss
      await cache.getOrUpload(testBuffer, mockUploadFn)
      metrics = cache.getMetrics()
      expect(metrics.hits).toBe(0)
      expect(metrics.misses).toBe(1)
      expect(metrics.uploads).toBe(1)
      expect(metrics.hitRate).toBe('0.0%')

      // Second call - hit
      await cache.getOrUpload(testBuffer, mockUploadFn)
      metrics = cache.getMetrics()
      expect(metrics.hits).toBe(1)
      expect(metrics.misses).toBe(1)
      expect(metrics.hitRate).toBe('50.0%')
      expect(metrics.cacheSize).toBe(1)
    })
  })

  describe('eviction', () => {
    it('should evict oldest entry when cache is full', async () => {
      // Set MAX_ENTRIES to a small value for testing
      const originalMaxEntries = GeminiFileCache['MAX_ENTRIES']
      GeminiFileCache['MAX_ENTRIES'] = 3

      try {
        const buffers = []
        for (let i = 0; i < 4; i++) {
          buffers[i] = new ArrayBuffer(100 + i)
          // Mock different hashes for each file
          mockHash.digest.mockReturnValueOnce(`hash-${i}`)
          await cache.getOrUpload(buffers[i], mockUploadFn)
          jest.advanceTimersByTime(1000) // Add time between uploads
        }

        // Should have evicted the oldest
        const metrics = cache.getMetrics()
        expect(metrics.cacheSize).toBe(3)
        expect(metrics.evictions).toBe(1)

        // First buffer should need re-upload (was evicted)
        mockHash.digest.mockReturnValueOnce('hash-0')
        await cache.getOrUpload(buffers[0], mockUploadFn)
        expect(mockUploadFn).toHaveBeenCalledTimes(5) // 4 initial + 1 re-upload
      } finally {
        GeminiFileCache['MAX_ENTRIES'] = originalMaxEntries
      }
    })
  })

  describe('cleanup', () => {
    it('should cleanup expired entries periodically', async () => {
      const testBuffer = new ArrayBuffer(1024)
      
      // Upload with short TTL
      await cache.getOrUpload(testBuffer, mockUploadFn, { ttl: 1000 })
      
      let metrics = cache.getMetrics()
      expect(metrics.cacheSize).toBe(1)

      // Advance time past TTL and trigger cleanup
      jest.advanceTimersByTime(61 * 60 * 1000) // 61 minutes (cleanup runs hourly)
      
      metrics = cache.getMetrics()
      expect(metrics.cacheSize).toBe(0)
    })
  })
})