/**
 * Unit tests for BaseProcessor.saveStageResult() (T-003)
 *
 * Tests the saveStageResult method for Storage-First Portability System
 * Follows acceptance criteria from docs/tasks/storage-first-portability.md
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { GoogleGenAI } from '@google/genai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SourceProcessor, type BackgroundJob } from '../base.js'
import type { ProcessResult } from '../../types/processor.js'

/**
 * Concrete test processor to test abstract BaseProcessor
 */
class TestProcessor extends SourceProcessor {
  async process(): Promise<ProcessResult> {
    return {
      markdown: 'test markdown',
      chunks: [],
      metadata: {
        title: 'Test',
        word_count: 100,
        document_id: 'test-doc-id'
      }
    }
  }

  // Expose protected method for testing
  async testSaveStageResult(stage: string, data: any, options?: { final?: boolean }) {
    return this.saveStageResult(stage, data, options)
  }

  // Expose protected method for testing
  testGetStoragePath(): string {
    return this.getStoragePath()
  }
}

describe('BaseProcessor.saveStageResult', () => {
  let mockAI: GoogleGenAI
  let mockSupabase: jest.Mocked<SupabaseClient>
  let mockJob: BackgroundJob
  let processor: TestProcessor

  beforeEach(() => {
    // Mock Google AI client
    mockAI = {} as GoogleGenAI

    // Mock Supabase client
    mockSupabase = {
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn().mockResolvedValue({ error: null })
        }))
      }
    } as unknown as jest.Mocked<SupabaseClient>

    // Mock background job
    mockJob = {
      id: 'job-123',
      document_id: 'doc-456',
      status: 'processing',
      input_data: {
        document_id: 'doc-456',
        storage_path: 'test-user/doc-456'
      }
    }

    // Create test processor instance
    processor = new TestProcessor(mockAI, mockSupabase, mockJob)
  })

  describe('Scenario 1: Save intermediate stage', () => {
    it('should save to stage-{name}.json when final is false', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const stageData = {
        markdown: 'extracted markdown',
        doclingChunks: [],
        structure: { headings: [], total_pages: 10 }
      }

      await processor.testSaveStageResult('extraction', stageData, { final: false })

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('documents')
      expect(mockUpload).toHaveBeenCalled()

      const uploadCall = mockUpload.mock.calls[0]
      expect(uploadCall[0]).toBe('test-user/doc-456/stage-extraction.json')
      expect(uploadCall[1]).toBeInstanceOf(Blob)
    })

    it('should enrich data with version, document_id, stage, timestamp', async () => {
      let savedBlob: Blob | undefined

      const mockUpload = jest.fn().mockImplementation(async (path, blob) => {
        savedBlob = blob
        return { error: null }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const stageData = { markdown: 'test' }
      await processor.testSaveStageResult('extraction', stageData, { final: false })

      expect(savedBlob).toBeDefined()
      const text = await savedBlob!.text()
      const parsed = JSON.parse(text)

      expect(parsed).toMatchObject({
        markdown: 'test',
        version: '1.0',
        document_id: 'doc-456',
        stage: 'extraction',
        final: false
      })
      expect(parsed.timestamp).toBeTruthy()
      expect(new Date(parsed.timestamp)).toBeInstanceOf(Date)
    })
  })

  describe('Scenario 2: Save final result', () => {
    it('should save to {name}.json when final is true', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const chunksData = {
        version: '1.0',
        chunks: [
          { content: 'chunk 1', chunk_index: 0 },
          { content: 'chunk 2', chunk_index: 1 }
        ]
      }

      await processor.testSaveStageResult('chunks', chunksData, { final: true })

      expect(mockUpload).toHaveBeenCalled()
      const uploadCall = mockUpload.mock.calls[0]
      expect(uploadCall[0]).toBe('test-user/doc-456/chunks.json')
    })

    it('should preserve existing version field if present', async () => {
      let savedBlob: Blob | undefined

      const mockUpload = jest.fn().mockImplementation(async (path, blob) => {
        savedBlob = blob
        return { error: null }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const chunksData = {
        version: '2.0',  // Custom version
        chunks: []
      }

      await processor.testSaveStageResult('chunks', chunksData, { final: true })

      const text = await savedBlob!.text()
      const parsed = JSON.parse(text)
      expect(parsed.version).toBe('2.0')  // Preserved
    })

    it('should save manifest with final flag', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      const manifestData = {
        version: '1.0',
        processing_mode: 'cloud',
        files: {},
        processing_cost: { total: 0.42 },
        processing_time: { total: 1500 }
      }

      await processor.testSaveStageResult('manifest', manifestData, { final: true })

      const uploadCall = mockUpload.mock.calls[0]
      expect(uploadCall[0]).toBe('test-user/doc-456/manifest.json')
    })
  })

  describe('Scenario 3: Handle Storage failure gracefully', () => {
    it('should log warning when Storage upload fails', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const mockUpload = jest.fn().mockResolvedValue({
        error: { message: 'Storage quota exceeded' }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      // Should NOT throw
      await expect(
        processor.testSaveStageResult('extraction', { test: true })
      ).resolves.not.toThrow()

      // Warning should be logged by saveToStorage helper
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StorageHelpers] Failed to save to Storage'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })

    it('should log warning when exception occurs', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      mockSupabase.storage.from = jest.fn(() => {
        throw new Error('Network timeout')
      }) as any

      // Should NOT throw
      await expect(
        processor.testSaveStageResult('cleanup', { markdown: 'test' })
      ).resolves.not.toThrow()

      // Exception is caught by saveToStorage helper (non-fatal)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StorageHelpers] Exception saving to Storage'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })

    it('should continue processing when Storage save fails', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      mockSupabase.storage.from = jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({
          error: { message: 'Failed' }
        })
      })) as any

      // Should resolve successfully even though Storage failed
      await processor.testSaveStageResult('metadata', { test: true }, { final: true })

      // Processing continues (no throw)
      expect(true).toBe(true)

      consoleSpy.mockRestore()
    })
  })

  describe('Path construction', () => {
    it('should use storage_path from job input_data', () => {
      const path = processor.testGetStoragePath()
      expect(path).toBe('test-user/doc-456')
    })

    it('should default to dev-user-123/{docId} when storage_path missing', () => {
      const processorNoPath = new TestProcessor(mockAI, mockSupabase, {
        ...mockJob,
        input_data: {
          document_id: 'doc-456'
          // No storage_path
        }
      })

      const path = processorNoPath.testGetStoragePath()
      expect(path).toBe('dev-user-123/doc-456')
    })

    it('should construct correct full paths for different stages', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      // Stage files
      await processor.testSaveStageResult('extraction', {}, { final: false })
      expect(mockUpload.mock.calls[0][0]).toBe('test-user/doc-456/stage-extraction.json')

      await processor.testSaveStageResult('cleanup', {}, { final: false })
      expect(mockUpload.mock.calls[1][0]).toBe('test-user/doc-456/stage-cleanup.json')

      // Final files
      await processor.testSaveStageResult('chunks', {}, { final: true })
      expect(mockUpload.mock.calls[2][0]).toBe('test-user/doc-456/chunks.json')

      await processor.testSaveStageResult('metadata', {}, { final: true })
      expect(mockUpload.mock.calls[3][0]).toBe('test-user/doc-456/metadata.json')

      await processor.testSaveStageResult('manifest', {}, { final: true })
      expect(mockUpload.mock.calls[4][0]).toBe('test-user/doc-456/manifest.json')
    })
  })

  describe('Integration with saveToStorage helper', () => {
    it('should pass data to saveToStorage with upsert enabled', async () => {
      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      await processor.testSaveStageResult('test', { data: 'test' })

      // saveToStorage uses upsert: true by default
      const uploadOptions = mockUpload.mock.calls[0][2]
      expect(uploadOptions.upsert).toBe(true)
      expect(uploadOptions.contentType).toBe('application/json')
    })

    it('should save as Blob with proper formatting', async () => {
      let savedBlob: Blob | undefined

      const mockUpload = jest.fn().mockImplementation(async (path, blob) => {
        savedBlob = blob
        return { error: null }
      })
      mockSupabase.storage.from = jest.fn(() => ({
        upload: mockUpload
      })) as any

      await processor.testSaveStageResult('test', { a: 1, b: { c: 2 } })

      expect(savedBlob).toBeDefined()
      expect(savedBlob!.type).toBe('application/json')

      const text = await savedBlob!.text()
      expect(text).toContain('  ')  // Has 2-space indentation
      expect(text).toContain('{\n')  // Has newlines
    })
  })
})
