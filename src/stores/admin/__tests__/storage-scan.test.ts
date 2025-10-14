import { renderHook, act } from '@testing-library/react'
import { useStorageScanStore } from '../storage-scan'

// Mock the scanStorage server action
jest.mock('@/app/actions/documents', () => ({
  scanStorage: jest.fn(() =>
    Promise.resolve({
      success: true,
      documents: [
        { id: 'doc-1', title: 'Test Doc', syncState: 'healthy' as const },
      ],
    })
  ),
}))

describe('useStorageScanStore - Cache Logic', () => {
  beforeEach(() => {
    // Reset store state
    useStorageScanStore.setState({
      scanResults: null,
      lastScanTime: null,
      scanning: false,
      error: null,
    })
  })

  test('getCachedResults returns null when no cache', () => {
    const { result } = renderHook(() => useStorageScanStore())

    const cached = result.current.getCachedResults()

    expect(cached).toBeNull()
  })

  test('getCachedResults returns data within 5 minute window', () => {
    const { result } = renderHook(() => useStorageScanStore())

    const mockData = [{ id: 'doc-1', title: 'Test', syncState: 'healthy' as const }]

    // Manually set cache state
    act(() => {
      useStorageScanStore.setState({
        scanResults: mockData,
        lastScanTime: Date.now(), // Just now
      })
    })

    const cached = result.current.getCachedResults()

    expect(cached).toEqual(mockData)
  })

  test('getCachedResults returns null when cache expired (>5 minutes)', () => {
    const { result } = renderHook(() => useStorageScanStore())

    const mockData = [{ id: 'doc-1', title: 'Test', syncState: 'healthy' as const }]
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000

    // Set expired cache
    act(() => {
      useStorageScanStore.setState({
        scanResults: mockData,
        lastScanTime: sixMinutesAgo,
      })
    })

    const cached = result.current.getCachedResults()

    expect(cached).toBeNull()
  })

  test('invalidate clears cache timestamp', () => {
    const { result } = renderHook(() => useStorageScanStore())

    // Set cache
    act(() => {
      useStorageScanStore.setState({
        scanResults: [{ id: 'doc-1', title: 'Test', syncState: 'healthy' as const }],
        lastScanTime: Date.now(),
      })
    })

    // Invalidate
    act(() => {
      result.current.invalidate()
    })

    // lastScanTime should be null, but scanResults preserved
    expect(result.current.lastScanTime).toBeNull()
    expect(result.current.scanResults).not.toBeNull()
  })

  test('getCachedResults returns null after invalidation', () => {
    const { result } = renderHook(() => useStorageScanStore())

    // Set cache
    act(() => {
      useStorageScanStore.setState({
        scanResults: [{ id: 'doc-1', title: 'Test', syncState: 'healthy' as const }],
        lastScanTime: Date.now(),
      })
    })

    // Invalidate
    act(() => {
      result.current.invalidate()
    })

    // Should return null (cache invalidated)
    const cached = result.current.getCachedResults()
    expect(cached).toBeNull()
  })
})
