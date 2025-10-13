import { validateChunkPosition, updateChunkOffsets } from '../chunks'

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

describe('validateChunkPosition', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should validate chunk position successfully', async () => {
    // Mock authenticated user
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    // Mock Supabase client
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }

    // Mock chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 'chunk-1', document_id: 'doc-1' },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock update query
    mockSupabase.eq.mockResolvedValueOnce({
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await validateChunkPosition('chunk-1', 'doc-1')

    expect(result.success).toBe(true)
    expect(mockSupabase.update).toHaveBeenCalledWith({ position_validated: true })
    expect(revalidatePath).toHaveBeenCalledWith('/read/doc-1')
  })

  it('should fail if user not authenticated', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue(null)

    const result = await validateChunkPosition('chunk-1', 'doc-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Not authenticated')
  })

  it('should fail if chunk not found', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      }),
    }

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await validateChunkPosition('chunk-1', 'doc-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Chunk not found')
  })
})

describe('updateChunkOffsets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should update offsets successfully with no overlap', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-1',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 500,
        end_offset: 700,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query (no overlap)
    mockSupabase.not.mockResolvedValueOnce({
      data: [
        { id: 'chunk-4', chunk_index: 4, start_offset: 300, end_offset: 490 },
        { id: 'chunk-6', chunk_index: 6, start_offset: 710, end_offset: 850 },
      ],
      error: null,
    })

    // Mock update query
    mockSupabase.eq.mockResolvedValueOnce({
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      startOffset: 495,
      endOffset: 705,
      reason: 'Fixed boundary',
    })

    expect(result.success).toBe(true)
    expect(mockSupabase.update).toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/read/doc-1')
  })

  it('should detect overlap with previous chunk (start overlaps)', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-5',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 500,
        end_offset: 700,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query (overlap with previous)
    mockSupabase.not.mockResolvedValueOnce({
      data: [
        { id: 'chunk-4', chunk_index: 4, start_offset: 300, end_offset: 550 },
        { id: 'chunk-6', chunk_index: 6, start_offset: 710, end_offset: 850 },
      ],
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-5',
      documentId: 'doc-1',
      startOffset: 520, // Overlaps with chunk-4 (300-550)
      endOffset: 720,
      reason: 'Attempted fix',
    })

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('overlap')
    expect(result.adjacentChunks).toHaveLength(1)
    expect(result.adjacentChunks?.[0].position).toBe('previous')
    expect(result.adjacentChunks?.[0].chunk_index).toBe(4)
  })

  it('should detect overlap with next chunk (end overlaps)', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-5',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 500,
        end_offset: 700,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query (overlap with next)
    mockSupabase.not.mockResolvedValueOnce({
      data: [
        { id: 'chunk-4', chunk_index: 4, start_offset: 300, end_offset: 490 },
        { id: 'chunk-6', chunk_index: 6, start_offset: 680, end_offset: 850 },
      ],
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-5',
      documentId: 'doc-1',
      startOffset: 500,
      endOffset: 750, // Overlaps with chunk-6 (680-850)
      reason: 'Attempted fix',
    })

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('overlap')
    expect(result.adjacentChunks).toHaveLength(1)
    expect(result.adjacentChunks?.[0].position).toBe('next')
    expect(result.adjacentChunks?.[0].chunk_index).toBe(6)
  })

  it('should detect when new range completely contains adjacent chunk', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-5',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 500,
        end_offset: 700,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query
    mockSupabase.not.mockResolvedValueOnce({
      data: [
        { id: 'chunk-4', chunk_index: 4, start_offset: 300, end_offset: 490 },
        { id: 'chunk-6', chunk_index: 6, start_offset: 710, end_offset: 850 },
      ],
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-5',
      documentId: 'doc-1',
      startOffset: 280, // Before chunk-4
      endOffset: 900, // After chunk-6 (completely contains both!)
      reason: 'Attempted fix',
    })

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('overlap')
    expect(result.adjacentChunks).toHaveLength(2) // Both chunks overlapped
  })

  it('should allow correction on first chunk (no previous)', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }

    // Mock current chunk query (first chunk)
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-0',
        document_id: 'doc-1',
        chunk_index: 0,
        start_offset: 0,
        end_offset: 200,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query (only next chunk exists)
    mockSupabase.not.mockResolvedValueOnce({
      data: [{ id: 'chunk-1', chunk_index: 1, start_offset: 210, end_offset: 400 }],
      error: null,
    })

    // Mock update query
    mockSupabase.eq.mockResolvedValueOnce({
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-0',
      documentId: 'doc-1',
      startOffset: 0,
      endOffset: 205, // Valid, doesn't overlap with next
      reason: 'Fixed boundary',
    })

    expect(result.success).toBe(true)
  })

  it('should allow correction on last chunk (no next)', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }

    // Mock current chunk query (last chunk)
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-99',
        document_id: 'doc-1',
        chunk_index: 99,
        start_offset: 9800,
        end_offset: 10000,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query (only previous chunk exists)
    mockSupabase.not.mockResolvedValueOnce({
      data: [{ id: 'chunk-98', chunk_index: 98, start_offset: 9600, end_offset: 9790 }],
      error: null,
    })

    // Mock update query
    mockSupabase.eq.mockResolvedValueOnce({
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-99',
      documentId: 'doc-1',
      startOffset: 9795, // Valid, doesn't overlap with previous
      endOffset: 10000,
      reason: 'Fixed boundary',
    })

    expect(result.success).toBe(true)
  })

  it('should track correction history with multiple corrections', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const existingHistory = [
      {
        timestamp: '2025-01-01T00:00:00.000Z',
        old_offsets: { start: 500, end: 700 },
        new_offsets: { start: 505, end: 705 },
        reason: 'First correction',
      },
    ]

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-1',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 505,
        end_offset: 705,
        correction_history: existingHistory,
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    // Mock adjacent chunks query (no overlap)
    mockSupabase.not.mockResolvedValueOnce({
      data: [
        { id: 'chunk-4', chunk_index: 4, start_offset: 300, end_offset: 490 },
        { id: 'chunk-6', chunk_index: 6, start_offset: 710, end_offset: 850 },
      ],
      error: null,
    })

    // Mock update query
    let capturedUpdate: any
    mockSupabase.update.mockImplementation((data: any) => {
      capturedUpdate = data
      return mockSupabase
    })

    mockSupabase.eq.mockResolvedValueOnce({
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      startOffset: 510,
      endOffset: 708,
      reason: 'Second correction',
    })

    expect(result.success).toBe(true)
    expect(capturedUpdate.correction_history).toHaveLength(2)
    expect(capturedUpdate.correction_history[1].reason).toBe('Second correction')
    expect(capturedUpdate.position_validated).toBe(true)
    expect(capturedUpdate.position_corrected).toBe(true)
  })

  it('should reject correction with identical offsets', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-1',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 500,
        end_offset: 700,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      startOffset: 500, // Same as current
      endOffset: 700, // Same as current
      reason: 'No-op correction',
    })

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('validation')
    expect(result.error).toContain('identical')
  })

  it('should reject correction where end <= start', async () => {
    jest.mocked(getCurrentUser).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    } as any)

    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    }

    // Mock current chunk query
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        id: 'chunk-1',
        document_id: 'doc-1',
        chunk_index: 5,
        start_offset: 500,
        end_offset: 700,
        correction_history: [],
      },
      error: null,
    })

    // Mock document query
    mockSupabase.single.mockResolvedValueOnce({
      data: { user_id: 'user-123' },
      error: null,
    })

    jest.mocked(createClient).mockResolvedValue(mockSupabase as any)

    const result = await updateChunkOffsets({
      chunkId: 'chunk-1',
      documentId: 'doc-1',
      startOffset: 700,
      endOffset: 500, // Invalid: end <= start
      reason: 'Invalid offsets',
    })

    expect(result.success).toBe(false)
    expect(result.errorType).toBe('validation')
    expect(result.error).toContain('greater than')
  })
})
