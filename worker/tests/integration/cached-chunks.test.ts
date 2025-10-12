/**
 * Integration tests for cached chunks table
 *
 * Tests save, load, delete operations and hash validation.
 * Uses real Supabase client to validate database operations.
 */

import { createClient } from '@supabase/supabase-js'
import {
  hashMarkdown,
  saveCachedChunks,
  loadCachedChunks,
  deleteCachedChunks
} from '../../lib/cached-chunks'
import type { DoclingChunk, DoclingStructure } from '../../lib/docling-extractor'

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

describe('Cached Chunks Integration', () => {
  let supabase: ReturnType<typeof createClient>
  const testDocumentId = 'test-cached-chunks-doc-123'

  beforeAll(() => {
    supabase = createClient(supabaseUrl, supabaseKey)
  })

  beforeEach(async () => {
    // Cleanup test data before each test
    await supabase
      .from('cached_chunks')
      .delete()
      .eq('document_id', testDocumentId)
  })

  afterAll(async () => {
    // Final cleanup
    await supabase
      .from('cached_chunks')
      .delete()
      .eq('document_id', testDocumentId)
  })

  describe('Hash Generation', () => {
    it('generates consistent SHA256 hash', () => {
      const markdown = '# Test Document\n\nContent here.'

      const hash1 = hashMarkdown(markdown)
      const hash2 = hashMarkdown(markdown)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA256 hex is 64 characters
      expect(hash1).toMatch(/^[a-f0-9]{64}$/) // Hex format
    })

    it('generates different hashes for different markdown', () => {
      const markdown1 = '# Test Document v1'
      const markdown2 = '# Test Document v2'

      const hash1 = hashMarkdown(markdown1)
      const hash2 = hashMarkdown(markdown2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('Save and Load Operations', () => {
    it('saves and loads cached chunks successfully', async () => {
      const markdown = '# Test Document\n\nContent here.'
      const hash = hashMarkdown(markdown)

      const chunks: DoclingChunk[] = [
        {
          text: 'Chunk 1 content',
          page_start: 1,
          page_end: 1,
          heading_level: null,
          heading_path: [],
          section_marker: null,
          bbox: null
        },
        {
          text: 'Chunk 2 content',
          page_start: 1,
          page_end: 1,
          heading_level: 1,
          heading_path: ['# Test Document'],
          section_marker: null,
          bbox: null
        }
      ]

      const structure: DoclingStructure = {
        headings: [{ text: '# Test Document', level: 1, page: 1 }],
        total_pages: 1,
        sections: []
      }

      // Save cache
      await saveCachedChunks(supabase, {
        document_id: testDocumentId,
        extraction_mode: 'pdf',
        markdown_hash: hash,
        docling_version: '2.55.1',
        chunks,
        structure
      })

      // Load cache
      const loaded = await loadCachedChunks(supabase, testDocumentId, hash)

      expect(loaded).not.toBeNull()
      expect(loaded?.chunks).toHaveLength(2)
      expect(loaded?.chunks[0].text).toBe('Chunk 1 content')
      expect(loaded?.chunks[1].text).toBe('Chunk 2 content')
      expect(loaded?.structure.total_pages).toBe(1)
      expect(loaded?.extraction_mode).toBe('pdf')
    })

    it('returns null when cache does not exist', async () => {
      const hash = hashMarkdown('Nonexistent document')

      const loaded = await loadCachedChunks(supabase, 'nonexistent-doc-id', hash)

      expect(loaded).toBeNull()
    })

    it('returns null when hash does not match (stale cache)', async () => {
      const markdown1 = '# Original Document'
      const markdown2 = '# Edited Document'

      const hash1 = hashMarkdown(markdown1)
      const hash2 = hashMarkdown(markdown2)

      const chunks: DoclingChunk[] = [
        {
          text: 'Chunk content',
          page_start: 1,
          page_end: 1,
          heading_level: null,
          heading_path: [],
          section_marker: null,
          bbox: null
        }
      ]

      const structure: DoclingStructure = {
        headings: [],
        total_pages: 1,
        sections: []
      }

      // Save with original hash
      await saveCachedChunks(supabase, {
        document_id: testDocumentId,
        extraction_mode: 'pdf',
        markdown_hash: hash1,
        chunks,
        structure
      })

      // Try to load with different hash (markdown changed)
      const loaded = await loadCachedChunks(supabase, testDocumentId, hash2)

      expect(loaded).toBeNull() // Should return null due to hash mismatch
    })

    it('upserts when saving duplicate document_id', async () => {
      const markdown = '# Test Document'
      const hash = hashMarkdown(markdown)

      const chunks1: DoclingChunk[] = [
        {
          text: 'First version',
          page_start: 1,
          page_end: 1,
          heading_level: null,
          heading_path: [],
          section_marker: null,
          bbox: null
        }
      ]

      const chunks2: DoclingChunk[] = [
        {
          text: 'Second version',
          page_start: 1,
          page_end: 1,
          heading_level: null,
          heading_path: [],
          section_marker: null,
          bbox: null
        }
      ]

      const structure: DoclingStructure = {
        headings: [],
        total_pages: 1,
        sections: []
      }

      // First save
      await saveCachedChunks(supabase, {
        document_id: testDocumentId,
        extraction_mode: 'pdf',
        markdown_hash: hash,
        chunks: chunks1,
        structure
      })

      // Second save (should replace)
      await saveCachedChunks(supabase, {
        document_id: testDocumentId,
        extraction_mode: 'epub',
        markdown_hash: hash,
        chunks: chunks2,
        structure
      })

      // Load - should get second version
      const loaded = await loadCachedChunks(supabase, testDocumentId, hash)

      expect(loaded).not.toBeNull()
      expect(loaded?.chunks).toHaveLength(1)
      expect(loaded?.chunks[0].text).toBe('Second version')
      expect(loaded?.extraction_mode).toBe('epub') // Updated mode
    })
  })

  describe('Delete Operation', () => {
    it('deletes cached chunks successfully', async () => {
      const markdown = '# Test Document'
      const hash = hashMarkdown(markdown)

      const chunks: DoclingChunk[] = [
        {
          text: 'Chunk content',
          page_start: 1,
          page_end: 1,
          heading_level: null,
          heading_path: [],
          section_marker: null,
          bbox: null
        }
      ]

      const structure: DoclingStructure = {
        headings: [],
        total_pages: 1,
        sections: []
      }

      // Save cache
      await saveCachedChunks(supabase, {
        document_id: testDocumentId,
        extraction_mode: 'pdf',
        markdown_hash: hash,
        chunks,
        structure
      })

      // Verify exists
      const loadedBefore = await loadCachedChunks(supabase, testDocumentId, hash)
      expect(loadedBefore).not.toBeNull()

      // Delete
      await deleteCachedChunks(supabase, testDocumentId)

      // Verify deleted
      const loadedAfter = await loadCachedChunks(supabase, testDocumentId, hash)
      expect(loadedAfter).toBeNull()
    })

    it('handles delete of non-existent cache gracefully', async () => {
      // Should not throw error
      await expect(
        deleteCachedChunks(supabase, 'nonexistent-doc-id')
      ).resolves.not.toThrow()
    })
  })

  describe('Extraction Mode Differentiation', () => {
    it('distinguishes between PDF and EPUB modes', async () => {
      const pdfDocId = 'test-pdf-doc'
      const epubDocId = 'test-epub-doc'
      const markdown = '# Test Document'
      const hash = hashMarkdown(markdown)

      const chunks: DoclingChunk[] = [
        {
          text: 'Chunk content',
          page_start: 1,
          page_end: 1,
          heading_level: null,
          heading_path: [],
          section_marker: null,
          bbox: null
        }
      ]

      const structure: DoclingStructure = {
        headings: [],
        total_pages: 1,
        sections: []
      }

      try {
        // Save PDF cache
        await saveCachedChunks(supabase, {
          document_id: pdfDocId,
          extraction_mode: 'pdf',
          markdown_hash: hash,
          chunks,
          structure
        })

        // Save EPUB cache
        await saveCachedChunks(supabase, {
          document_id: epubDocId,
          extraction_mode: 'epub',
          markdown_hash: hash,
          chunks,
          structure
        })

        // Load both and verify different modes
        const pdfCache = await loadCachedChunks(supabase, pdfDocId, hash)
        const epubCache = await loadCachedChunks(supabase, epubDocId, hash)

        expect(pdfCache?.extraction_mode).toBe('pdf')
        expect(epubCache?.extraction_mode).toBe('epub')
      } finally {
        // Cleanup
        await supabase.from('cached_chunks').delete().eq('document_id', pdfDocId)
        await supabase.from('cached_chunks').delete().eq('document_id', epubDocId)
      }
    })
  })
})
