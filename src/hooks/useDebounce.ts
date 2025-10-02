import { useState, useEffect } from 'react'

/**
 * Debounces a value update to reduce rapid state changes.
 * Essential for scroll-based queries that would otherwise fire 60 times/second.
 *
 * **Use Case**: Viewport tracking in VirtualizedReader
 * - Without debounce: 60fps scrolling = 60 database queries/second
 * - With 300ms debounce: Query fires only when scrolling pauses
 * - Performance win: ~99% reduction in database load
 *
 * @param value - Value to debounce (e.g., visibleChunkIds array)
 * @param delay - Delay in milliseconds (default: 300ms, tuned for comfortable scroll pause)
 * @returns Debounced value that updates only after delay has elapsed
 *
 * @example
 * ```tsx
 * // In ConnectionsList component:
 * const debouncedChunkIds = useDebounce(visibleChunkIds, 300)
 *
 * useEffect(() => {
 *   // This only fires when user pauses scrolling for 300ms
 *   fetchConnections(debouncedChunkIds)
 * }, [debouncedChunkIds])
 * ```
 *
 * @see https://reactjs.org/docs/hooks-effect.html#tip-optimizing-performance-by-skipping-effects
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Cleanup function: cancel the timer if value changes before delay elapses
    // This is the "debouncing" - rapid changes get cancelled, only final value persists
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
