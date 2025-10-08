import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StoredAnnotation } from '@/types/annotations'

type ViewMode = 'explore' | 'focus' | 'study'
type SidebarTab = 'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune'

interface UIState {
  // View mode
  viewMode: ViewMode

  // Sidebar
  sidebarCollapsed: boolean
  activeTab: SidebarTab
  expandedConnections: Set<string>
  expandedAnnotations: Set<string>

  // Reader display settings
  showChunkBoundaries: boolean
  showHeatmap: boolean

  // Quick Capture panel (moved from AnnotationStore)
  quickCaptureOpen: boolean
  activeAnnotation: StoredAnnotation | null

  // Actions
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveTab: (tab: SidebarTab) => void
  toggleConnectionExpanded: (id: string) => void
  toggleAnnotationExpanded: (id: string) => void
  toggleSetting: (setting: 'showChunkBoundaries' | 'showHeatmap') => void
  openQuickCapture: () => void
  closeQuickCapture: () => void
  setActiveAnnotation: (annotation: StoredAnnotation | null) => void
}

/**
 * UI store - manages view modes, sidebar state, and display settings.
 * Separate from data (annotations, connections) and business logic.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Initial state
      viewMode: 'explore',
      sidebarCollapsed: false,
      activeTab: 'connections',
      expandedConnections: new Set(),
      expandedAnnotations: new Set(),
      showChunkBoundaries: true,
      showHeatmap: true,
      quickCaptureOpen: false,
      activeAnnotation: null,

      setViewMode: (mode) => {
        set({ viewMode: mode })
        // Auto-collapse sidebar in focus mode
        if (mode === 'focus') {
          set({ sidebarCollapsed: true })
        } else if (get().sidebarCollapsed) {
          // Re-open sidebar when leaving focus mode
          set({ sidebarCollapsed: false })
        }
      },

      toggleSidebar: () =>
        set({
          sidebarCollapsed: !get().sidebarCollapsed,
        }),

      setSidebarCollapsed: (collapsed) =>
        set({
          sidebarCollapsed: collapsed,
        }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      toggleConnectionExpanded: (id) => {
        const expanded = new Set(get().expandedConnections)
        if (expanded.has(id)) {
          expanded.delete(id)
        } else {
          expanded.add(id)
        }
        set({ expandedConnections: expanded })
      },

      toggleAnnotationExpanded: (id) => {
        const expanded = new Set(get().expandedAnnotations)
        if (expanded.has(id)) {
          expanded.delete(id)
        } else {
          expanded.add(id)
        }
        set({ expandedAnnotations: expanded })
      },

      toggleSetting: (setting) => {
        set({ [setting]: !get()[setting] })
      },

      openQuickCapture: () =>
        set({ quickCaptureOpen: true }),

      closeQuickCapture: () =>
        set({ quickCaptureOpen: false, activeAnnotation: null }),

      setActiveAnnotation: (annotation) =>
        set({ activeAnnotation: annotation }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarCollapsed: state.sidebarCollapsed,
        activeTab: state.activeTab,
        showChunkBoundaries: state.showChunkBoundaries,
        showHeatmap: state.showHeatmap,
        // Don't persist expanded states, quickCaptureOpen, or activeAnnotation
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset transient UI states on hydration
          state.expandedConnections = new Set()
          state.expandedAnnotations = new Set()
          state.quickCaptureOpen = false
          state.activeAnnotation = null
        }
      },
    }
  )
)
