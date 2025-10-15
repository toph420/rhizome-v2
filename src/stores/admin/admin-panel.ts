import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Admin Panel Store State
 *
 * Tracks whether the Admin Panel is open/closed to coordinate
 * with other UI elements (e.g., ProcessingDock should hide when panel is open)
 */
interface AdminPanelStore {
  // State
  isOpen: boolean
  activeTab: string

  // Actions
  open: (tab?: string) => void
  close: () => void
  toggle: () => void
  setActiveTab: (tab: string) => void
}

/**
 * Zustand store for Admin Panel open/close state.
 *
 * Purpose: Coordinate Admin Panel with other UI elements like ProcessingDock
 * to prevent redundant job displays.
 *
 * @example
 * ```tsx
 * const { isOpen, open, close } = useAdminPanelStore()
 *
 * // Open Admin Panel to specific tab
 * open('jobs')
 *
 * // Close Admin Panel
 * close()
 *
 * // Toggle Admin Panel
 * toggle()
 *
 * // Check if panel is open (hide ProcessingDock)
 * if (isOpen) return null
 * ```
 */
export const useAdminPanelStore = create<AdminPanelStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      activeTab: 'scanner',

      open: (tab = 'scanner') => {
        set({ isOpen: true, activeTab: tab })
      },

      close: () => {
        set({ isOpen: false })
      },

      toggle: () => {
        set((state) => ({ isOpen: !state.isOpen }))
      },

      setActiveTab: (tab: string) => {
        set({ activeTab: tab })
      },
    }),
    {
      name: 'AdminPanel',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
