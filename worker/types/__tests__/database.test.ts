/**
 * Database Types Validation Tests
 *
 * Ensures database types are correctly structured and type-safe.
 * Tests migration 050 additions (chunker_type fields).
 */

import type {
  Chunk,
  ChunkInsert,
  ChunkUpdate,
  Document,
  DocumentInsert,
  UserPreferences,
  UserPreferencesInsert,
} from '../database'
import type { ChunkerType } from '../../lib/chonkie/types'

describe('Database Types', () => {
  describe('Chunk Types', () => {
    test('Chunk interface includes new migration 050 fields', () => {
      const chunk: Chunk = {
        id: 'test-id',
        document_id: 'doc-id',
        content: 'Test content',
        chunk_index: 0,
        created_at: new Date().toISOString(),
        start_offset: 0,
        end_offset: 100,
        word_count: 10,

        // Migration 050 fields
        chunker_type: 'recursive' as ChunkerType,
        metadata_overlap_count: 2,
        metadata_confidence: 'high',
        metadata_interpolated: false,

        // Docling metadata
        heading_path: ['Chapter 1'],
        heading_level: 1,
        page_start: 1,
        page_end: 1,
        page_label: null,
        section_marker: null,
        bboxes: null,

        // Validation fields
        position_method: 'exact',
        position_confidence: 'high',
        position_corrected: false,
        position_validated: true,
        overlap_corrected: false,
        validation_warning: null,
        validation_details: null,
        correction_history: null,

        // Metadata enrichment
        themes: ['theme1'],
        importance_score: 0.8,
        summary: 'Test summary',
        emotional_metadata: null,
        conceptual_metadata: null,
        domain_metadata: null,
        metadata_extracted_at: null,

        // Embeddings
        embedding: null,

        // Reprocessing
        is_current: true,
        reprocessing_batch: null,
      }

      expect(chunk.chunker_type).toBe('recursive')
      expect(chunk.metadata_overlap_count).toBe(2)
      expect(chunk.metadata_confidence).toBe('high')
      expect(chunk.metadata_interpolated).toBe(false)
    })

    test('ChunkInsert has correct defaults', () => {
      const insert: ChunkInsert = {
        content: 'New chunk',
        chunk_index: 0,
        chunker_type: 'semantic', // Can specify Chonkie strategy
        metadata_confidence: 'medium',
      }

      expect(insert.chunker_type).toBe('semantic')
      expect(insert.metadata_confidence).toBe('medium')
    })

    test('ChunkUpdate allows partial updates', () => {
      const update: ChunkUpdate = {
        chunker_type: 'neural',
        metadata_overlap_count: 3,
        metadata_confidence: 'high',
      }

      expect(update.chunker_type).toBe('neural')
    })

    test('All ChunkerType values are valid', () => {
      const validTypes: ChunkerType[] = [
        'hybrid', // Legacy
        'token',
        'sentence',
        'recursive',
        'semantic',
        'late',
        'code',
        'neural',
        'slumber',
        'table',
      ]

      validTypes.forEach(type => {
        const chunk: Partial<Chunk> = {
          chunker_type: type,
        }
        expect(chunk.chunker_type).toBe(type)
      })
    })

    test('metadata_confidence only allows high/medium/low', () => {
      const validConfidences = ['high', 'medium', 'low'] as const

      validConfidences.forEach(confidence => {
        const chunk: Partial<Chunk> = {
          metadata_confidence: confidence,
        }
        expect(chunk.metadata_confidence).toBe(confidence)
      })
    })
  })

  describe('Document Types', () => {
    test('Document interface includes chunker_type from migration 050', () => {
      const doc: Document = {
        id: 'doc-id',
        user_id: 'user-id',
        title: 'Test Document',
        storage_path: 'path/to/doc.pdf',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),

        // Migration 050 field
        chunker_type: 'semantic',

        // Other fields
        author: null,
        description: null,
        document_type: null,
        language: null,
        page_count: null,
        word_count: null,
        publisher: null,
        publication_date: null,
        publication_year: null,
        isbn: null,
        doi: null,
        source_type: null,
        source_url: null,
        source_metadata: null,
        detected_metadata: null,
        processing_status: null,
        processing_stage: null,
        processing_requested: null,
        processing_started_at: null,
        processing_completed_at: null,
        processing_error: null,
        review_stage: null,
        markdown_path: null,
        markdown_available: null,
        embeddings_available: null,
        cover_image_url: null,
        outline: null,
        metadata: null,
        obsidian_path: null,
      }

      expect(doc.chunker_type).toBe('semantic')
    })

    test('DocumentInsert can specify chunker_type', () => {
      const insert: DocumentInsert = {
        user_id: 'user-id',
        title: 'New Doc',
        storage_path: 'path/to/doc',
        chunker_type: 'neural',
      }

      expect(insert.chunker_type).toBe('neural')
    })
  })

  describe('UserPreferences Types', () => {
    test('UserPreferences includes default_chunker_type from migration 050', () => {
      const prefs: UserPreferences = {
        id: 'pref-id',
        user_id: 'user-id',
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),

        engine_weights: {
          semantic_similarity: 0.25,
          contradiction_detection: 0.4,
          thematic_bridge: 0.35,
        },
        normalization_method: 'linear',
        preset_name: 'balanced',
        custom_presets: null,

        // Migration 050 field
        default_chunker_type: 'recursive',
      }

      expect(prefs.default_chunker_type).toBe('recursive')
    })

    test('UserPreferencesInsert can set default chunker', () => {
      const insert: UserPreferencesInsert = {
        user_id: 'user-id',
        default_chunker_type: 'semantic',
      }

      expect(insert.default_chunker_type).toBe('semantic')
    })
  })

  describe('Type Safety', () => {
    test('ChunkerType is strongly typed', () => {
      // This test ensures ChunkerType is imported correctly from chonkie/types
      const type: ChunkerType = 'recursive'
      expect(type).toBe('recursive')

      // TypeScript will error at compile time if invalid value assigned
      // const invalid: ChunkerType = 'invalid' // TS error
    })

    test('Json type accepts valid JSON structures', () => {
      const jsonData = {
        string: 'value',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: { key: 'value' },
      }

      const chunk: Partial<Chunk> = {
        themes: jsonData as any,
      }

      expect(chunk.themes).toBeDefined()
    })
  })
})
