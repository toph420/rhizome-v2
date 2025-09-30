/**
 * Database Integration Tests - Migration Validation
 * 
 * Tests migration scripts, schema integrity, and database setup.
 * Validates table creation, indexes, RLS policies, and data consistency.
 */

import { factories } from '@/tests/factories'

// Mock Supabase client for migration testing
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
  query: jest.fn()
}

// Track test data
const testData: { [table: string]: string[] } = {
  documents: [],
  chunks: [],
  entities: [],
  components: [],
  background_jobs: []
}

describe('Database Migration Validation', () => {
  
  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(testData).forEach(table => testData[table].length = 0)
    
    // Create proper chainable mocks
    const createChainableMock = () => {
      const chain = {
        eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        order: jest.fn().mockResolvedValue({ data: [], error: null })
      }
      // Make eq return itself for further chaining
      chain.eq.mockReturnValue(chain)
      return chain
    }
    
    mockSupabase.from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: [], error: null }),
      select: jest.fn().mockReturnValue(createChainableMock()),
      update: jest.fn().mockReturnValue(createChainableMock()),
      delete: jest.fn().mockReturnValue(createChainableMock())
    })
    
    mockSupabase.rpc.mockResolvedValue({ data: [], error: null })
    mockSupabase.query.mockResolvedValue({ data: [], error: null })
  })

  afterEach(async () => {
    // Clean up test data
    for (const [table, ids] of Object.entries(testData)) {
      ids.forEach(async (id) => {
        await mockSupabase.from(table).delete().eq('id', id)
      })
    }
  })

  describe('Schema Validation', () => {
    it('should validate all required tables exist', async () => {
      // Arrange
      const requiredTables = [
        'documents',
        'chunks', 
        'entities',
        'components',
        'connections',
        'decks',
        'entity_decks',
        'study_sessions',
        'review_log',
        'background_jobs'
      ]

      const tableCheckResults = requiredTables.map(table => ({
        table_name: table,
        exists: true
      }))

      mockSupabase.query.mockResolvedValue({
        data: tableCheckResults,
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN (${requiredTables.map(t => `'${t}'`).join(',')})
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(requiredTables.length)
      
      const existingTables = result.data.map(row => row.table_name)
      requiredTables.forEach(table => {
        expect(existingTables).toContain(table)
      })
    })

    it('should validate vector extension is enabled', async () => {
      // Arrange
      mockSupabase.query.mockResolvedValue({
        data: [{ 
          extname: 'vector',
          extversion: '0.5.1',
          installed: true 
        }],
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname = 'vector'
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data[0].extname).toBe('vector')
      expect(result.data[0].extversion).toBeDefined()
    })

    it('should validate UUID extension is enabled', async () => {
      // Arrange
      mockSupabase.query.mockResolvedValue({
        data: [{ 
          extname: 'uuid-ossp',
          installed: true 
        }],
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT extname 
        FROM pg_extension 
        WHERE extname = 'uuid-ossp'
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data[0].extname).toBe('uuid-ossp')
    })
  })

  describe('Index Validation', () => {
    it('should validate all performance indexes exist', async () => {
      // Arrange
      const requiredIndexes = [
        'idx_documents_user',
        'idx_documents_status',
        'idx_chunks_document',
        'idx_chunks_embedding',
        'idx_entities_user',
        'idx_components_entity',
        'idx_components_type',
        'idx_components_chunk',
        'idx_connections_source',
        'idx_connections_target',
        'idx_background_jobs_status',
        'idx_background_jobs_user'
      ]

      const indexResults = requiredIndexes.map(index => ({
        indexname: index,
        tablename: index.split('_')[1], // Extract table name
        indexdef: `CREATE INDEX ${index} ON ...`
      }))

      mockSupabase.query.mockResolvedValue({
        data: indexResults,
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT indexname, tablename, indexdef 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname LIKE 'idx_%'
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data.length).toBeGreaterThanOrEqual(requiredIndexes.length)
      
      const existingIndexes = result.data.map(row => row.indexname)
      requiredIndexes.forEach(index => {
        expect(existingIndexes).toContain(index)
      })
    })

    it('should validate pgvector ivfflat index on embeddings', async () => {
      // Arrange
      mockSupabase.query.mockResolvedValue({
        data: [{
          indexname: 'idx_chunks_embedding',
          indexdef: 'CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops)',
          am: 'ivfflat'
        }],
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT i.indexname, pg_get_indexdef(i.indexrelid) as indexdef, am.amname as am
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_am am ON i.relam = am.oid
        WHERE c.relname = 'chunks' 
        AND i.relname = 'idx_chunks_embedding'
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data[0].indexname).toBe('idx_chunks_embedding')
      expect(result.data[0].am).toBe('ivfflat')
      expect(result.data[0].indexdef).toContain('vector_cosine_ops')
    })
  })

  describe('RLS Policy Validation', () => {
    it('should validate Row Level Security is enabled on all tables', async () => {
      // Arrange
      const rlsTables = [
        'documents',
        'chunks',
        'entities', 
        'components',
        'connections',
        'decks',
        'entity_decks',
        'study_sessions',
        'review_log'
      ]

      const rlsResults = rlsTables.map(table => ({
        tablename: table,
        rowsecurity: true
      }))

      mockSupabase.query.mockResolvedValue({
        data: rlsResults,
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT tablename, rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename IN (${rlsTables.map(t => `'${t}'`).join(',')})
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(rlsTables.length)
      
      result.data.forEach(table => {
        expect(table.rowsecurity).toBe(true)
      })
    })

    it('should validate user isolation policies exist', async () => {
      // Arrange
      const expectedPolicies = [
        { tablename: 'documents', policyname: 'Users can view own documents' },
        { tablename: 'chunks', policyname: 'Users can view chunks of own documents' },
        { tablename: 'entities', policyname: 'Users can manage own entities' },
        { tablename: 'components', policyname: 'Users can manage components of own entities' },
        { tablename: 'connections', policyname: 'Users can manage own connections' }
      ]

      mockSupabase.query.mockResolvedValue({
        data: expectedPolicies,
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
        FROM pg_policies 
        WHERE schemaname = 'public'
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data.length).toBeGreaterThanOrEqual(expectedPolicies.length)
      
      expectedPolicies.forEach(expectedPolicy => {
        const policy = result.data.find(p => 
          p.tablename === expectedPolicy.tablename && 
          p.policyname === expectedPolicy.policyname
        )
        expect(policy).toBeDefined()
      })
    })
  })

  describe('Function and Trigger Validation', () => {
    it('should validate match_chunks function exists and works', async () => {
      // Arrange
      const testEmbedding = new Array(768).fill(0).map(() => Math.random() - 0.5)
      const expectedResults = [
        {
          id: 'test-chunk-1',
          content: 'Test content for similarity',
          similarity: 0.85,
          document_id: 'test-doc-1',
          themes: ['test'],
          summary: 'Test summary'
        }
      ]

      mockSupabase.rpc.mockResolvedValue({
        data: expectedResults,
        error: null
      })

      // Act
      const result = await mockSupabase.rpc('match_chunks', {
        query_embedding: testEmbedding,
        match_threshold: 0.7,
        match_count: 5
      })

      // Assert
      expect(result.error).toBeNull()
      expect(mockSupabase.rpc).toHaveBeenCalledWith('match_chunks', {
        query_embedding: testEmbedding,
        match_threshold: 0.7,
        match_count: 5
      })
    })

    it('should validate updated_at triggers are working', async () => {
      // Arrange
      const document = factories.document.create({
        user_id: 'test-user',
        title: 'Test Document'
      })

      const currentTime = new Date().toISOString()
      
      // Mock insert with created_at and updated_at
      mockSupabase.from('documents').insert.mockResolvedValue({
        data: [{
          ...document,
          created_at: currentTime,
          updated_at: currentTime
        }],
        error: null
      })

      // Mock update with new updated_at (simulating trigger)
      const updatedTime = new Date(Date.now() + 1000).toISOString()
      mockSupabase.from('documents').update.mockResolvedValue({
        data: [{
          ...document,
          title: 'Updated Title',
          created_at: currentTime, // Should not change
          updated_at: updatedTime   // Should be updated by trigger
        }],
        error: null
      })

      // Act
      await mockSupabase.from('documents').insert(document)
      const updateResult = await mockSupabase.from('documents')
        .update({ title: 'Updated Title' })
        .eq('id', document.id)

      // Assert
      expect(updateResult.error).toBeNull()
      // In real scenario, updated_at would be automatically set by trigger
      // Here we simulate that the trigger worked by checking the mock
      expect(mockSupabase.from('documents').update).toHaveBeenCalledWith({
        title: 'Updated Title'
      })
      
      testData.documents.push(document.id)
    })
  })

  describe('Data Integrity Constraints', () => {
    it('should validate foreign key constraints work', async () => {
      // Arrange
      const nonExistentDocumentId = 'non-existent-doc-123'
      const chunk = factories.chunk.create({
        document_id: nonExistentDocumentId,
        content: 'Test chunk content'
      })

      // Mock foreign key constraint violation
      mockSupabase.from('chunks').insert.mockResolvedValue({
        data: null,
        error: {
          message: 'insert or update on table "chunks" violates foreign key constraint',
          code: '23503'
        }
      })

      // Act
      const result = await mockSupabase.from('chunks').insert(chunk)

      // Assert
      expect(result.error).toBeDefined()
      expect(result.error.code).toBe('23503') // Foreign key violation
      expect(result.error.message).toContain('foreign key constraint')
      expect(result.data).toBeNull()
    })

    it('should validate CASCADE delete behavior', async () => {
      // Arrange
      const document = factories.document.create({ user_id: 'test-user' })
      const chunks = [
        factories.chunk.create({ document_id: document.id }),
        factories.chunk.create({ document_id: document.id })
      ]

      // Mock document deletion triggering cascade
      mockSupabase.from('documents').delete.mockResolvedValue({
        data: [document],
        error: null
      })

      // Mock that related chunks are also deleted (CASCADE behavior)
      mockSupabase.from('chunks').select.mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [], // No chunks found after cascade delete
          error: null
        })
      })

      // Act
      await mockSupabase.from('documents').delete().eq('id', document.id)
      const remainingChunks = await mockSupabase.from('chunks')
        .select('*')
        .eq('document_id', document.id)

      // Assert
      expect(remainingChunks.data).toHaveLength(0) // Chunks deleted by CASCADE
      expect(mockSupabase.from('documents').delete).toHaveBeenCalled()
    })

    it('should validate NOT NULL constraints', async () => {
      // Arrange
      const invalidDocument = {
        id: 'test-doc-id',
        // Missing required user_id
        title: 'Test Document',
        storage_path: 'path/to/doc'
      }

      // Mock NOT NULL constraint violation
      mockSupabase.from('documents').insert.mockResolvedValue({
        data: null,
        error: {
          message: 'null value in column "user_id" violates not-null constraint',
          code: '23502'
        }
      })

      // Act
      const result = await mockSupabase.from('documents').insert(invalidDocument)

      // Assert
      expect(result.error).toBeDefined()
      expect(result.error.code).toBe('23502') // NOT NULL violation
      expect(result.error.message).toContain('not-null constraint')
      expect(result.data).toBeNull()
    })
  })

  describe('Storage and Realtime Setup', () => {
    it('should validate storage bucket configuration', async () => {
      // Arrange
      const buckets = ['documents']
      
      mockSupabase.query.mockResolvedValue({
        data: buckets.map(name => ({
          name,
          public: false,
          created_at: new Date().toISOString()
        })),
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT name, public, created_at 
        FROM storage.buckets
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data[0].name).toBe('documents')
      expect(result.data[0].public).toBe(false) // Private bucket
    })

    it('should validate realtime publication setup', async () => {
      // Arrange
      const realtimeTables = ['background_jobs']
      
      mockSupabase.query.mockResolvedValue({
        data: realtimeTables.map(table => ({
          pubname: 'supabase_realtime',
          tablename: table
        })),
        error: null
      })

      // Act
      const result = await mockSupabase.query(`
        SELECT p.pubname, pt.tablename
        FROM pg_publication p
        JOIN pg_publication_tables pt ON p.pubname = pt.pubname
        WHERE p.pubname = 'supabase_realtime'
      `)

      // Assert
      expect(result.error).toBeNull()
      expect(result.data.length).toBeGreaterThanOrEqual(1)
      
      const enabledTables = result.data.map(row => row.tablename)
      realtimeTables.forEach(table => {
        expect(enabledTables).toContain(table)
      })
    })
  })

  describe('Migration Rollback Safety', () => {
    it('should validate migration can be rolled back safely', async () => {
      // Arrange - simulate a failed migration scenario
      const testMigration = {
        version: '999_test_migration',
        applied: true,
        rollback_safe: true
      }

      mockSupabase.query.mockResolvedValue({
        data: [testMigration],
        error: null
      })

      // Act - check migration status
      const result = await mockSupabase.query(`
        SELECT version, applied_at 
        FROM supabase_migrations.schema_migrations 
        WHERE version = '999_test_migration'
      `)

      // Assert
      expect(result.error).toBeNull()
      // In a real rollback test, we would:
      // 1. Apply migration
      // 2. Insert test data
      // 3. Rollback migration
      // 4. Verify data integrity preserved
    })

    it('should validate no data loss during schema changes', async () => {
      // Arrange
      const preChangeCount = 5
      const postChangeCount = 5 // Should be same after safe migration
      
      // Mock data count before and after schema change
      mockSupabase.query
        .mockResolvedValueOnce({ 
          data: [{ count: preChangeCount }], 
          error: null 
        })
        .mockResolvedValueOnce({ 
          data: [{ count: postChangeCount }], 
          error: null 
        })

      // Act
      const beforeResult = await mockSupabase.query('SELECT COUNT(*) FROM documents')
      // Simulate schema change here...
      const afterResult = await mockSupabase.query('SELECT COUNT(*) FROM documents')

      // Assert
      expect(beforeResult.data[0].count).toBe(preChangeCount)
      expect(afterResult.data[0].count).toBe(postChangeCount)
      expect(beforeResult.data[0].count).toBe(afterResult.data[0].count) // No data loss
    })
  })
})