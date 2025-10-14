import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { scanStorage, type DocumentScanResult } from '@/app/actions/documents'

/**
 * Storage Scan Store State
 */
interface StorageScanStore {
  // State
  scanResults: DocumentScanResult[] | null
  lastScanTime: number | null
  scanning: boolean
  error: string | null

  // Actions
  scan: () => Promise<void>
  invalidate: () => void
  getCachedResults: () => DocumentScanResult[] | null
}

/**
 * Cache duration: 5 minutes
 */
const CACHE_DURATION = 5 * 60 * 1000

/**
 * Zustand store for Storage scanning with 5-minute cache.
 *
 * Purpose: Eliminate duplicate scanStorage() API calls between
 * ScannerTab and ImportTab by caching results.
 *
 * @example
 * ```tsx
 * const { scanResults, scanning, scan } = useStorageScanStore()
 *
 * useEffect(() => {
 *   scan() // Uses cache if available
 * }, [scan])
 * ```
 */
export const useStorageScanStore = create<StorageScanStore>()(
  devtools(
    (set, get) => ({
      scanResults: null,
      lastScanTime: null,
      scanning: false,
      error: null,

      scan: async () => {
        // Check cache first
        const { lastScanTime, scanResults } = get()
        const now = Date.now()

        if (
          lastScanTime &&
          scanResults &&
          now - lastScanTime < CACHE_DURATION
        ) {
          const age = Math.round((now - lastScanTime) / 1000)
          console.log(`[StorageScan] Cache hit (age: ${age}s, expires in: ${Math.round((CACHE_DURATION - (now - lastScanTime)) / 1000)}s)`)
          return // Use cached results
        }

        const reason = !lastScanTime ? 'no cache' : 'cache expired'
        console.log(`[StorageScan] Cache miss (${reason}), fetching...`)
        set({ scanning: true, error: null })

        try {
          const result = await scanStorage()

          if (result.success) {
            console.log(`[StorageScan] Scan complete: ${result.documents.length} documents`)
            set({
              scanResults: result.documents,
              lastScanTime: now,
              scanning: false,
              error: null,
            })
          } else {
            console.error('[StorageScan] Scan failed:', result.error)
            set({
              scanning: false,
              error: result.error || 'Failed to scan storage',
            })
          }
        } catch (err) {
          console.error('[StorageScan] Scan error:', err)
          set({
            scanning: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      },

      invalidate: () => {
        console.log('[StorageScan] Cache invalidated')
        set({ lastScanTime: null })
      },

      getCachedResults: () => {
        const { scanResults, lastScanTime } = get()
        const now = Date.now()

        if (
          lastScanTime &&
          scanResults &&
          now - lastScanTime < CACHE_DURATION
        ) {
          return scanResults
        }

        return null
      },
    }),
    {
      name: 'StorageScan',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
