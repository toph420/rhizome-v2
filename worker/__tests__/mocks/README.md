# Typed Test Mocks

This directory contains properly typed mock implementations for testing.

## Available Mocks

### Supabase Client (`supabase.ts`)

```typescript
import { createMockSupabaseClient, createSuccessResponse, createErrorResponse } from './mocks/supabase'

const mockSupabase = createMockSupabaseClient()

// Mock storage operations
mockSupabase.storage.from('bucket').upload.mockResolvedValue(
  createSuccessResponse(null)
)

mockSupabase.storage.from('bucket').createSignedUrl.mockResolvedValue(
  createSuccessResponse({ signedUrl: 'https://example.com/file.pdf' })
)

// Mock database operations
mockSupabase.from('table').select().single.mockResolvedValue(
  createSuccessResponse({ id: '123', name: 'Test' })
)
```

### Axios (`axios.ts`)

```typescript
import { createMockAxiosResponse, createMockAxiosError } from './mocks/axios'

// Success response
const response = createMockAxiosResponse({ title: 'Test' }, 200)
mockAxios.get.mockResolvedValue(response)

// Error response
const error = createMockAxiosError(404, 'Not Found')
mockAxios.get.mockRejectedValue(error)
```

## Benefits

- **Type Safety**: Eliminates `type 'never'` errors in tests
- **Autocomplete**: Full IntelliSense support for mock methods
- **Consistency**: Standardized mock patterns across test files
- **Maintainability**: Centralized mock definitions

## Usage Pattern

1. Import the mock factory
2. Create mock instance in `beforeEach`
3. Configure mocks for specific test cases
4. Use typed helper functions for responses

## Future Refactoring

Test files can be gradually updated to use these typed mocks to eliminate
the remaining `type 'never'` assignment errors (~129 errors across 6 files).
