import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to detect scroll direction and determine if top nav should be visible.
 * Can work with window scroll or a specific container element.
 * @param threshold - Minimum scroll amount before hiding (default: 10px).
 * @param scrollContainerId - Optional ID of scroll container (defaults to window).
 * @returns Object with scroll direction and nav visibility.
 */
export function useScrollDirection(threshold = 10, scrollContainerId?: string) {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('up')
  const [showTopNav, setShowTopNav] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  const handleScroll = useCallback((event?: Event) => {
    let currentScrollY: number

    if (scrollContainerId) {
      const container = document.getElementById(scrollContainerId)
      if (!container) return
      currentScrollY = container.scrollTop
    } else {
      currentScrollY = window.scrollY
    }

    // At top of page, always show nav
    if (currentScrollY < threshold) {
      setShowTopNav(true)
      setScrollDirection('up')
      setLastScrollY(currentScrollY)
      return
    }

    // Determine direction
    if (currentScrollY > lastScrollY) {
      // Scrolling down
      setScrollDirection('down')
      setShowTopNav(false)
    } else if (currentScrollY < lastScrollY) {
      // Scrolling up
      setScrollDirection('up')
      setShowTopNav(true)
    }

    setLastScrollY(currentScrollY)
  }, [lastScrollY, threshold, scrollContainerId])

  useEffect(() => {
    if (scrollContainerId) {
      const container = document.getElementById(scrollContainerId)
      if (!container) return

      container.addEventListener('scroll', handleScroll, { passive: true })
      return () => container.removeEventListener('scroll', handleScroll)
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true })
      return () => window.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll, scrollContainerId])

  return { scrollDirection, showTopNav }
}
