/**
 * Typed Supabase client mocks for testing
 *
 * Provides properly typed mock implementations to replace
 * the default jest.fn() which returns 'never' types.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MockStorageResponse<T = any> {
  data: T | null
  error: Error | null
}

export interface MockSupabaseStorage {
  from: (bucket: string) => {
    upload: jest.Mock<Promise<MockStorageResponse>>
    download: jest.Mock<Promise<MockStorageResponse<Blob>>>
    createSignedUrl: jest.Mock<Promise<MockStorageResponse<{ signedUrl: string }>>>
    list: jest.Mock<Promise<MockStorageResponse<any[]>>>
    remove: jest.Mock<Promise<MockStorageResponse>>
  }
}

export interface MockSupabaseQuery {
  select: jest.Mock<MockSupabaseQuery>
  insert: jest.Mock<MockSupabaseQuery>
  update: jest.Mock<MockSupabaseQuery>
  delete: jest.Mock<MockSupabaseQuery>
  eq: jest.Mock<MockSupabaseQuery>
  neq: jest.Mock<MockSupabaseQuery>
  gt: jest.Mock<MockSupabaseQuery>
  lt: jest.Mock<MockSupabaseQuery>
  gte: jest.Mock<MockSupabaseQuery>
  lte: jest.Mock<MockSupabaseQuery>
  in: jest.Mock<MockSupabaseQuery>
  contains: jest.Mock<MockSupabaseQuery>
  order: jest.Mock<MockSupabaseQuery>
  limit: jest.Mock<MockSupabaseQuery>
  single: jest.Mock<Promise<MockStorageResponse>>
  maybeSingle: jest.Mock<Promise<MockStorageResponse>>
}

/**
 * Creates a properly typed mock Supabase client
 *
 * @example
 * const mockSupabase = createMockSupabaseClient()
 * mockSupabase.storage.from().upload.mockResolvedValue({ data: null, error: null })
 */
export function createMockSupabaseClient(): {
  storage: MockSupabaseStorage
  from: (table: string) => MockSupabaseQuery
  rpc: jest.Mock
} {
  const createMockQuery = (): MockSupabaseQuery => {
    const query: any = {
      select: jest.fn().mockReturnValue(query),
      insert: jest.fn().mockReturnValue(query),
      update: jest.fn().mockReturnValue(query),
      delete: jest.fn().mockReturnValue(query),
      eq: jest.fn().mockReturnValue(query),
      neq: jest.fn().mockReturnValue(query),
      gt: jest.fn().mockReturnValue(query),
      lt: jest.fn().mockReturnValue(query),
      gte: jest.fn().mockReturnValue(query),
      lte: jest.fn().mockReturnValue(query),
      in: jest.fn().mockReturnValue(query),
      contains: jest.fn().mockReturnValue(query),
      order: jest.fn().mockReturnValue(query),
      limit: jest.fn().mockReturnValue(query),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    }
    return query
  }

  return {
    storage: {
      from: (bucket: string) => ({
        upload: jest.fn<Promise<MockStorageResponse>, any>(),
        download: jest.fn<Promise<MockStorageResponse<Blob>>, any>(),
        createSignedUrl: jest.fn<Promise<MockStorageResponse<{ signedUrl: string }>>, any>(),
        list: jest.fn<Promise<MockStorageResponse<any[]>>, any>(),
        remove: jest.fn<Promise<MockStorageResponse>, any>(),
      }),
    },
    from: (table: string) => createMockQuery(),
    rpc: jest.fn(),
  }
}

/**
 * Helper to create successful storage responses
 */
export function createSuccessResponse<T>(data: T): MockStorageResponse<T> {
  return { data, error: null }
}

/**
 * Helper to create error storage responses
 */
export function createErrorResponse(message: string): MockStorageResponse {
  return { data: null, error: new Error(message) }
}
