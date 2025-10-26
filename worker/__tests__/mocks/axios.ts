/**
 * Typed Axios mocks for testing
 *
 * Provides properly typed mock implementations for HTTP responses.
 */

export interface MockAxiosResponse<T = any> {
  data: T
  status: number
  statusText?: string
  headers?: Record<string, string>
  config?: any
}

export interface MockAxiosError {
  response?: {
    status: number
    data?: any
  }
  message: string
}

/**
 * Creates a successful axios response
 *
 * @example
 * const response = createMockAxiosResponse({ title: 'Test' }, 200)
 * mockAxios.get.mockResolvedValue(response)
 */
export function createMockAxiosResponse<T>(
  data: T,
  status: number = 200,
  statusText: string = 'OK'
): MockAxiosResponse<T> {
  return {
    data,
    status,
    statusText,
    headers: {},
    config: {},
  }
}

/**
 * Creates an axios error response
 *
 * @example
 * const error = createMockAxiosError(404, 'Not Found')
 * mockAxios.get.mockRejectedValue(error)
 */
export function createMockAxiosError(
  status: number,
  message: string,
  data?: any
): MockAxiosError {
  return {
    response: {
      status,
      data,
    },
    message,
  }
}
