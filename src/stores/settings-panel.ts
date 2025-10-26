import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Settings Panel Store State
 *
 * Tracks whether the Settings Panel is open/closed
 */
interface SettingsPanelStore {
  // State
  isOpen: boolean

  // Actions
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Zustand store for Settings Panel open/close state.
 *
 * Purpose: Manage Settings Panel visibility state
 *
 * @example
 * ```tsx
 * const { isOpen, open, close, toggle } = useSettingsPanelStore()
 *
 * // Open Settings Panel
 * open()
 *
 * // Close Settings Panel
 * close()
 *
 * // Toggle Settings Panel
 * toggle()
 * ```
 */
export const useSettingsPanelStore = create<SettingsPanelStore>()(
  devtools(
    (set) => ({
      isOpen: false,

      open: () => {
        set({ isOpen: true })
      },

      close: () => {
        set({ isOpen: false })
      },

      toggle: () => {
        set((state) => ({ isOpen: !state.isOpen }))
      },
    }),
    {
      name: 'SettingsPanel',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
)
