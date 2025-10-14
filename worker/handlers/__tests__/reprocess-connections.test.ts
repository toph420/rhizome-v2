/**
 * Tests for reprocess-connections background job handler
 *
 * Tests all three modes: 'all', 'add_new', 'smart'
 * Validates user-validation preservation and backup functionality
 */

import { reprocessConnectionsHandler } from '../reprocess-connections'

// We'll mock these inside beforeEach to avoid module resolution issues
const mockProcessDocument = jest.fn()
const mockSaveToStorage = jest.fn()

// Mock modules inline
jest.mock('../../engines/orchestrator', () => ({
  processDocument: (...args: any[]) => mockProcessDocument(...args)
}))

jest.mock('../../lib/storage-helpers', () => ({
  saveToStorage: (...args: any[]) => mockSaveToStorage(...args)
}))

describe('reprocessConnectionsHandler', () => {
  let mockSupabase: any;
  let mockJob: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client with chainable methods
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      count: jest.fn().mockResolvedValue({ count: 0, error: null }),
      data: [],
      error: null
    };

    mockSupabase = {
      from: jest.fn(() => mockQuery),
      storage: {
        from: jest.fn(() => ({
          upload: jest.fn().mockResolvedValue({ error: null })
        }))
      }
    };

    mockJob = {
      id: 'job-123',
      user_id: 'user-456',
      entity_id: 'doc-789',
      input_data: {
        mode: 'all',
        engines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
      }
    };

    // Mock orchestrator
    mockProcessDocument.mockResolvedValue({
      totalConnections: 85,
      byEngine: {
        semantic_similarity: 47,
        contradiction_detection: 23,
        thematic_bridge: 15
      },
      executionTime: 5000
    })

    // Mock saveToStorage
    mockSaveToStorage.mockResolvedValue()
  });

  describe('Scenario 1: Reprocess All mode', () => {
    it('should delete all connections and regenerate from scratch', async () => {
      // Setup: 85 existing connections
      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockImplementation((fields: string, options?: any) => {
        if (options?.count === 'exact') {
          // First call: count before = 85
          // Second call: count after = 85
          return Promise.resolve({ count: 85, error: null });
        }
        return mockFromResult;
      });

      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify delete was called for all connections
      expect(mockFromResult.delete).toHaveBeenCalled();
      expect(mockFromResult.or).toHaveBeenCalledWith(
        expect.stringContaining("source_chunk_id.in.(select id from chunks where document_id='doc-789')")
      );

      // Verify orchestrator was called with all engines
      expect(mockProcessDocument).toHaveBeenCalledWith('doc-789', expect.objectContaining({
        enabledEngines: ['semantic_similarity', 'contradiction_detection', 'thematic_bridge']
      }));

      // Verify job marked as completed
      expect(mockFromResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_data: expect.objectContaining({
            connectionsBefore: 85,
            connectionsAfter: 85,
            byEngine: {
              semantic_similarity: 47,
              contradiction_detection: 23,
              thematic_bridge: 15
            }
          })
        })
      );
    });

    it('should NOT restore validated connections in all mode', async () => {
      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({ count: 85, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify no backup or validated query happened
      expect(mockSaveToStorage).not.toHaveBeenCalled();
      const selectCalls = mockFromResult.select.mock.calls;
      const hasValidatedQuery = selectCalls.some(call =>
        call[0] === '*' // Full select for validated connections
      );
      expect(hasValidatedQuery).toBe(false);
    });
  });

  describe('Scenario 2: Smart Mode with preservation', () => {
    beforeEach(() => {
      mockJob.input_data = {
        mode: 'smart',
        engines: ['semantic_similarity', 'contradiction_detection'],
        preserveValidated: true,
        backupFirst: true
      };
    });

    it('should preserve validated connections and backup before deletion', async () => {
      const mockFromResult = mockSupabase.from('connections');

      // Mock validated connections query
      const validatedConnections = [
        { id: 'conn-1', source_chunk_id: 'chunk-1', target_chunk_id: 'chunk-2', user_validated: true },
        { id: 'conn-2', source_chunk_id: 'chunk-3', target_chunk_id: 'chunk-4', user_validated: true }
      ];

      let callCount = 0;
      mockFromResult.select.mockImplementation((fields: string, options?: any) => {
        if (options?.count === 'exact') {
          callCount++;
          // First call: before = 85, second call: after = 87 (2 validated + 85 new)
          return Promise.resolve({ count: callCount === 1 ? 85 : 87, error: null });
        }
        if (fields === '*') {
          // Validated connections query
          return Promise.resolve({ data: validatedConnections, error: null });
        }
        return mockFromResult;
      });

      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });
      mockFromResult.eq.mockReturnThis();

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify validated connections were queried
      expect(mockFromResult.eq).toHaveBeenCalledWith('user_validated', true);

      // Verify backup was created
      expect(mockSaveToStorage).toHaveBeenCalledWith(
        mockSupabase,
        expect.stringMatching(/user-456\/doc-789\/validated-connections-.*\.json/),
        expect.objectContaining({
          version: '1.0',
          document_id: 'doc-789',
          connections: validatedConnections,
          count: 2
        })
      );

      // Verify only non-validated connections were deleted
      expect(mockFromResult.is).toHaveBeenCalledWith('user_validated', null);
      expect(mockFromResult.delete).toHaveBeenCalled();

      // Verify output includes validatedPreserved count
      expect(mockFromResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          output_data: expect.objectContaining({
            validatedPreserved: 2,
            backupPath: expect.stringMatching(/validated-connections-.*\.json/)
          })
        })
      );
    });

    it('should handle no validated connections gracefully', async () => {
      const mockFromResult = mockSupabase.from('connections');

      mockFromResult.select.mockImplementation((fields: string, options?: any) => {
        if (options?.count === 'exact') {
          return Promise.resolve({ count: 85, error: null });
        }
        if (fields === '*') {
          // No validated connections
          return Promise.resolve({ data: [], error: null });
        }
        return mockFromResult;
      });

      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });
      mockFromResult.eq.mockReturnThis();

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify no backup was attempted (0 validated connections)
      expect(mockSaveToStorage).not.toHaveBeenCalled();

      // Verify all connections were deleted (since none are validated)
      expect(mockFromResult.delete).toHaveBeenCalled();
      expect(mockFromResult.is).toHaveBeenCalledWith('user_validated', null);
    });

    it('should skip backup if backupFirst is false', async () => {
      mockJob.input_data.backupFirst = false;

      const mockFromResult = mockSupabase.from('connections');

      mockFromResult.select.mockImplementation((fields: string, options?: any) => {
        if (options?.count === 'exact') {
          return Promise.resolve({ count: 85, error: null });
        }
        if (fields === '*') {
          return Promise.resolve({
            data: [{ id: 'conn-1', user_validated: true }],
            error: null
          });
        }
        return mockFromResult;
      });

      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });
      mockFromResult.eq.mockReturnThis();

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify no backup was created
      expect(mockSaveToStorage).not.toHaveBeenCalled();

      // But validated connections should still be preserved (not deleted)
      expect(mockFromResult.is).toHaveBeenCalledWith('user_validated', null);
    });
  });

  describe('Scenario 3: Add New mode', () => {
    beforeEach(() => {
      mockJob.input_data = {
        mode: 'add_new',
        engines: ['thematic_bridge']
      };
    });

    it('should query newer documents and process connections', async () => {
      const mockFromResult = mockSupabase.from('connections');
      const mockDocuments = mockSupabase.from('documents');

      // Mock document query
      mockDocuments.select.mockReturnThis();
      mockDocuments.eq.mockReturnThis();
      mockDocuments.single.mockResolvedValue({
        data: { created_at: '2025-10-10T00:00:00Z' },
        error: null
      });
      mockDocuments.gt.mockResolvedValue({
        data: [
          { id: 'doc-new-1' },
          { id: 'doc-new-2' }
        ],
        error: null
      });

      mockFromResult.select.mockResolvedValue({ count: 50, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'documents') return mockDocuments;
        if (table === 'connections') return mockFromResult;
        return mockFromResult;
      });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify newer documents were queried
      expect(mockDocuments.gt).toHaveBeenCalledWith('created_at', '2025-10-10T00:00:00Z');

      // Verify orchestrator was still called (limitation noted in code)
      expect(mockProcessDocument).toHaveBeenCalledWith('doc-789', expect.any(Object));
    });

    it('should skip processing if no newer documents exist', async () => {
      const mockFromResult = mockSupabase.from('connections');
      const mockDocuments = mockSupabase.from('documents');

      mockDocuments.select.mockReturnThis();
      mockDocuments.eq.mockReturnThis();
      mockDocuments.single.mockResolvedValue({
        data: { created_at: '2025-10-10T00:00:00Z' },
        error: null
      });
      mockDocuments.gt.mockResolvedValue({
        data: [],  // No newer documents
        error: null
      });

      mockFromResult.select.mockResolvedValue({ count: 50, error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'documents') return mockDocuments;
        if (table === 'connections') return mockFromResult;
        return mockFromResult;
      });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify orchestrator was NOT called (no new documents)
      expect(mockProcessDocument).not.toHaveBeenCalled();

      // Verify job marked as completed with no changes
      expect(mockFromResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          output_data: expect.objectContaining({
            connectionsBefore: 50,
            connectionsAfter: 50
          })
        })
      );
    });
  });

  describe('Scenario 4: Progress tracking', () => {
    it('should update job progress at each major stage', async () => {
      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({ count: 85, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify progress updates
      const progressUpdates = mockFromResult.update.mock.calls.filter(
        call => call[0].progress?.percent !== 100
      );

      // Should have updates at: 10%, 20%, 40%, 90%
      expect(progressUpdates.length).toBeGreaterThanOrEqual(4);

      // Check for key stages
      const stages = progressUpdates.map(call => call[0].progress?.stage);
      expect(stages).toContain('preparing');
      expect(stages).toContain('deleting');
      expect(stages).toContain('processing');
      expect(stages).toContain('finalizing');
    });

    it('should include descriptive details for each stage', async () => {
      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({ count: 85, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify details are present
      const progressUpdates = mockFromResult.update.mock.calls.filter(
        call => call[0].progress
      );

      progressUpdates.forEach(call => {
        expect(call[0].progress.details).toBeTruthy();
        expect(typeof call[0].progress.details).toBe('string');
      });
    });
  });

  describe('Error handling', () => {
    it('should handle connection count failure', async () => {
      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({
        count: null,
        error: { message: 'Database error' }
      });
      mockFromResult.update.mockResolvedValue({ error: null });

      await expect(reprocessConnectionsHandler(mockSupabase, mockJob)).rejects.toThrow(
        'Failed to count connections'
      );

      // Verify job marked as failed
      expect(mockFromResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: expect.stringContaining('Failed to count connections')
        })
      );
    });

    it('should handle orchestrator failure', async () => {
      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({ count: 85, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      ;(mockProcessDocument as jest.Mock).mockRejectedValue(new Error('Orchestrator failed'));

      await expect(reprocessConnectionsHandler(mockSupabase, mockJob)).rejects.toThrow(
        'Orchestrator failed'
      );

      // Verify job marked as failed
      expect(mockFromResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          last_error: 'Orchestrator failed'
        })
      );
    });

    it('should handle validated connections query failure', async () => {
      mockJob.input_data.mode = 'smart';
      mockJob.input_data.preserveValidated = true;

      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockImplementation((fields: string, options?: any) => {
        if (options?.count === 'exact') {
          return Promise.resolve({ count: 85, error: null });
        }
        if (fields === '*') {
          return Promise.resolve({
            data: null,
            error: { message: 'Query failed' }
          });
        }
        return mockFromResult;
      });
      mockFromResult.update.mockResolvedValue({ error: null });
      mockFromResult.eq.mockReturnThis();

      await expect(reprocessConnectionsHandler(mockSupabase, mockJob)).rejects.toThrow(
        'Failed to query validated connections'
      );
    });
  });

  describe('Engine selection', () => {
    it('should respect selected engines', async () => {
      mockJob.input_data.engines = ['semantic_similarity'];

      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({ count: 85, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify orchestrator called with only selected engine
      expect(mockProcessDocument).toHaveBeenCalledWith('doc-789', expect.objectContaining({
        enabledEngines: ['semantic_similarity']
      }));
    });

    it('should pass engine results to output', async () => {
      ;(mockProcessDocument as jest.Mock).mockResolvedValue({
        totalConnections: 50,
        byEngine: {
          semantic_similarity: 30,
          contradiction_detection: 20
        },
        executionTime: 3000
      });

      const mockFromResult = mockSupabase.from('connections');
      mockFromResult.select.mockResolvedValue({ count: 85, error: null });
      mockFromResult.delete.mockResolvedValue({ error: null });
      mockFromResult.update.mockResolvedValue({ error: null });

      await reprocessConnectionsHandler(mockSupabase, mockJob);

      // Verify byEngine in output
      expect(mockFromResult.update).toHaveBeenCalledWith(
        expect.objectContaining({
          output_data: expect.objectContaining({
            byEngine: {
              semantic_similarity: 30,
              contradiction_detection: 20
            }
          })
        })
      );
    });
  });
});
