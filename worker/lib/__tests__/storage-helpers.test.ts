/**
 * Unit tests for Storage Helper Functions (T-001)
 *
 * Tests the 4 core functions: saveToStorage, readFromStorage, hashContent, listStorageFiles
 * Follows acceptance criteria from docs/tasks/storage-first-portability.md
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { saveToStorage, readFromStorage, hashContent, listStorageFiles } from '../storage-helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('Storage Helpers', () => {
  let mockSupabase: jest.Mocked<SupabaseClient>

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn(),
          createSignedUrl: jest.fn(),
          list: jest.fn()
        }))
      }
    } as unknown as jest.Mocked<SupabaseClient>
  })

  describe('saveToStorage', () => {
    it('should save JSON data as Blob with correct content type', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const testData = { version: '1.0', test: true }
      await saveToStorage(mockSupabase, 'test/path.json', testData)

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('documents')
      expect(mockUpload).toHaveBeenCalled()

      const uploadCall = mockUpload.mock.calls[0]
      expect(uploadCall[0]).toBe('test/path.json')
      expect(uploadCall[1]).toBeInstanceOf(Blob)
      expect(uploadCall[2]).toMatchObject({
        contentType: 'application/json',
        upsert: true
      })
    })

    it('should enable upsert to overwrite existing files', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      await saveToStorage(mockSupabase, 'test/path.json', {}, { upsert: true })

      const uploadOptions = mockUpload.mock.calls[0][2]
      expect(uploadOptions.upsert).toBe(true)
    })

    it('should handle Storage API failures gracefully (non-fatal)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      const mockUpload = jest.fn().mockResolvedValue({
        error: { message: 'Storage full' }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      // Should NOT throw
      await expect(
        saveToStorage(mockSupabase, 'test/path.json', {})
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StorageHelpers] Failed to save to Storage'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })

    it('should handle exceptions gracefully (non-fatal)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      mockSupabase.storage.from = jest.fn(() => {
        throw new Error('Network error')
      }) as any

      // Should NOT throw
      await expect(
        saveToStorage(mockSupabase, 'test/path.json', {})
      ).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StorageHelpers] Exception saving to Storage'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })
  })

  describe('readFromStorage', () => {
    it('should create signed URL with 1-hour expiry', async () => {
      const mockCreateSignedUrl = jest.fn().mockResolvedValue({
        data: { signedUrl: 'https://example.com/signed-url' },
        error: null
      })
      mockSupabase.storage.from = jest.fn(() => ({
        createSignedUrl: mockCreateSignedUrl
      })) as any

      // Mock fetch
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ test: true })
      }) as any

      await readFromStorage(mockSupabase, 'test/path.json')

      expect(mockCreateSignedUrl).toHaveBeenCalledWith('test/path.json', 3600)
    })

    it('should fetch and parse JSON from signed URL', async () => {
      const testData = { version: '1.0', chunks: [] }
      mockSupabase.storage.from = jest.fn(() => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null
        })
      })) as any

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => testData
      }) as any

      const result = await readFromStorage(mockSupabase, 'test/path.json')

      expect(result).toEqual(testData)
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/signed-url')
    })

    it('should throw error if signed URL creation fails', async () => {
      mockSupabase.storage.from = jest.fn(() => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'File not found' }
        })
      })) as any

      await expect(
        readFromStorage(mockSupabase, 'test/missing.json')
      ).rejects.toThrow('Failed to create signed URL')
    })

    it('should throw error if fetch fails', async () => {
      mockSupabase.storage.from = jest.fn(() => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null
        })
      })) as any

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      }) as any

      await expect(
        readFromStorage(mockSupabase, 'test/missing.json')
      ).rejects.toThrow('Storage read failed')
    })

    it('should return typed data when using generics', async () => {
      interface TestType {
        version: string
        count: number
      }

      const testData: TestType = { version: '1.0', count: 42 }
      mockSupabase.storage.from = jest.fn(() => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null
        })
      })) as any

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => testData
      }) as any

      const result = await readFromStorage<TestType>(mockSupabase, 'test/path.json')

      expect(result.version).toBe('1.0')
      expect(result.count).toBe(42)
    })
  })

  describe('hashContent', () => {
    it('should generate consistent SHA256 hash', () => {
      const content = 'test content for hashing'
      const hash1 = hashContent(content)
      const hash2 = hashContent(content)

      expect(hash1).toBe(hash2)
    })

    it('should return 64-character hex string', () => {
      const content = 'test content'
      const hash = hashContent(content)

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash.length).toBe(64)
    })

    it('should produce different hashes for different content', () => {
      const hash1 = hashContent('content A')
      const hash2 = hashContent('content B')

      expect(hash1).not.toBe(hash2)
    })

    it('should handle empty strings', () => {
      const hash = hashContent('')

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash.length).toBe(64)
    })

    it('should handle large content', () => {
      const largeContent = 'x'.repeat(1000000)  // 1MB
      const hash = hashContent(largeContent)

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('listStorageFiles', () => {
    it('should return array of FileInfo objects', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: [
          {
            name: 'chunks.json',
            metadata: { size: 800000 },
            updated_at: '2025-10-12T10:00:00Z'
          },
          {
            name: 'metadata.json',
            metadata: { size: 2000 },
            updated_at: '2025-10-12T10:01:00Z'
          }
        ],
        error: null
      })
      mockSupabase.storage.from = jest.fn(() => ({
        list: mockList
      })) as any

      const files = await listStorageFiles(mockSupabase, 'user-id/doc-id')

      expect(files).toHaveLength(2)
      expect(files[0]).toMatchObject({
        name: 'chunks.json',
        size: 800000,
        updated_at: '2025-10-12T10:00:00Z'
      })
      expect(files[1]).toMatchObject({
        name: 'metadata.json',
        size: 2000,
        updated_at: '2025-10-12T10:01:00Z'
      })
    })

    it('should handle missing size metadata gracefully', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: [
          {
            name: 'test.json',
            metadata: {},  // No size
            updated_at: '2025-10-12T10:00:00Z'
          }
        ],
        error: null
      })
      mockSupabase.storage.from = jest.fn(() => ({
        list: mockList
      })) as any

      const files = await listStorageFiles(mockSupabase, 'test-path')

      expect(files[0].size).toBe(0)
    })

    it('should handle missing updated_at gracefully', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: [
          {
            name: 'test.json',
            metadata: { size: 1000 },
            updated_at: null  // Missing timestamp
          }
        ],
        error: null
      })
      mockSupabase.storage.from = jest.fn(() => ({
        list: mockList
      })) as any

      const files = await listStorageFiles(mockSupabase, 'test-path')

      expect(files[0].updated_at).toBeTruthy()
      expect(new Date(files[0].updated_at)).toBeInstanceOf(Date)
    })

    it('should return empty array when no files found', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: [],
        error: null
      })
      mockSupabase.storage.from = jest.fn(() => ({
        list: mockList
      })) as any

      const files = await listStorageFiles(mockSupabase, 'empty-dir')

      expect(files).toEqual([])
    })

    it('should throw error if Storage API fails', async () => {
      const mockList = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Permission denied' }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        list: mockList
      })) as any

      await expect(
        listStorageFiles(mockSupabase, 'restricted-path')
      ).rejects.toThrow('Storage list failed')
    })
  })

  describe('Integration scenarios', () => {
    it('should support save-read round-trip', async () => {
      const testData = { version: '1.0', test: true, nested: { value: 42 } }
      let savedData: string | undefined

      // Mock upload to capture data
      const mockUpload = jest.fn().mockImplementation(async (path, blob) => {
        savedData = await blob.text()
        return { error: null }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      await saveToStorage(mockSupabase, 'test/round-trip.json', testData)

      // Verify data was saved
      expect(savedData).toBeTruthy()
      const parsedSaved = JSON.parse(savedData!)
      expect(parsedSaved).toEqual(testData)

      // Mock read to return saved data
      mockSupabase.storage.from = jest.fn(() => ({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed-url' },
          error: null
        })
      })) as any

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => JSON.parse(savedData!)
      }) as any

      const result = await readFromStorage(mockSupabase, 'test/round-trip.json')

      expect(result).toEqual(testData)
    })

    it('should preserve JSON formatting with 2-space indentation', async () => {
      let savedBlob: Blob | undefined

      const mockUpload = jest.fn().mockImplementation(async (path, blob) => {
        savedBlob = blob
        return { error: null }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const testData = { a: 1, b: { c: 2 } }
      await saveToStorage(mockSupabase, 'test/formatted.json', testData)

      expect(savedBlob).toBeDefined()
      const text = await savedBlob!.text()
      expect(text).toContain('  ')  // Has 2-space indentation
      expect(text).toContain('{\n')  // Has newlines
    })
  })
})
