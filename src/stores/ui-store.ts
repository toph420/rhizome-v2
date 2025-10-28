import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StoredAnnotation, TextSelection } from '@/types/annotations'

type ViewMode = 'explore' | 'focus' | 'study'
type SidebarTab = 'connections' | 'annotations' | 'sparks' | 'cards' | 'review' | 'tune' | 'study' | 'chunks'
type LeftPanelTab = 'metadata' | 'outline' | 'thumbnails' | 'heatmap'

interface UIState {
  // View mode
  viewMode: ViewMode

  // Sidebar (RightPanel)
  sidebarCollapsed: boolean
  activeTab: SidebarTab
  expandedConnections: Set<string>
  expandedAnnotations: Set<string>

  // LeftPanel (new)
  leftPanelOpen: boolean
  leftPanelCollapsed: boolean
  leftPanelTab: LeftPanelTab

  // DocumentHeader height (for dynamic RightPanel positioning)
  documentHeaderHeight: number

  // Reader display settings
  showChunkBoundaries: boolean
  showHeatmap: boolean

  // Quick Capture panels
  quickCaptureOpen: boolean // Annotation quick capture
  activeAnnotation: StoredAnnotation | null
  sparkCaptureOpen: boolean // Spark quick capture
  pendingAnnotationSelection: TextSelection | null // Selection to annotate from spark panel
  editingSparkId: string | null // ID of spark being edited (null = creating new)
  editingSparkContent: string | null // Content to pre-fill when editing spark
  editingSparkSelections: TextSelection[] // Selections to restore when editing
  linkedAnnotationIds: string[] // NEW - Phase 6b: Annotations linked to current spark

  // Actions
  setViewMode: (mode: ViewMode) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveTab: (tab: SidebarTab) => void
  toggleConnectionExpanded: (id: string) => void
  toggleAnnotationExpanded: (id: string) => void
  toggleSetting: (setting: 'showChunkBoundaries' | 'showHeatmap') => void
  toggleLeftPanel: () => void
  setLeftPanelCollapsed: (collapsed: boolean) => void
  setLeftPanelTab: (tab: LeftPanelTab) => void
  setDocumentHeaderHeight: (height: number) => void
  openQuickCapture: () => void
  closeQuickCapture: () => void
  setActiveAnnotation: (annotation: StoredAnnotation | null) => void
  openSparkCapture: () => void
  closeSparkCapture: () => void
  setPendingAnnotationSelection: (selection: TextSelection | null) => void
  setEditingSparkContent: (content: string | null) => void
  setEditingSpark: (sparkId: string | null, content: string | null, selections?: TextSelection[], annotations?: string[]) => void
  addLinkedAnnotation: (annotationId: string) => void  // NEW - Phase 6b
  removeLinkedAnnotation: (annotationId: string) => void  // NEW - Phase 6b
  clearLinkedAnnotations: () => void  // NEW - Phase 6b
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
      leftPanelOpen: true, // Open by default on desktop
      leftPanelCollapsed: false,
      leftPanelTab: 'metadata',
      documentHeaderHeight: 78, // Default height, updated by ResizeObserver
      showChunkBoundaries: true,
      showHeatmap: true,
      quickCaptureOpen: false,
      activeAnnotation: null,
      sparkCaptureOpen: false,
      pendingAnnotationSelection: null,
      editingSparkId: null,
      editingSparkContent: null,
      editingSparkSelections: [],
      linkedAnnotationIds: [],  // NEW - Phase 6b

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

      toggleLeftPanel: () => set(state => ({ leftPanelOpen: !state.leftPanelOpen })),
      setLeftPanelCollapsed: (collapsed) => set({ leftPanelCollapsed: collapsed }),
      setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
      setDocumentHeaderHeight: (height) => set({ documentHeaderHeight: height }),

      openQuickCapture: () =>
        set({ quickCaptureOpen: true }),

      closeQuickCapture: () =>
        set({ quickCaptureOpen: false, activeAnnotation: null }),

      setActiveAnnotation: (annotation) =>
        set({ activeAnnotation: annotation }),

      openSparkCapture: () =>
        set({ sparkCaptureOpen: true }),

      closeSparkCapture: () =>
        set({
          sparkCaptureOpen: false,
          editingSparkId: null,
          editingSparkContent: null,
          editingSparkSelections: [],
          linkedAnnotationIds: []
        }),

      setPendingAnnotationSelection: (selection) =>
        set({ pendingAnnotationSelection: selection }),

      setEditingSparkContent: (content) =>
        set({ editingSparkContent: content }),

      setEditingSpark: (sparkId, content, selections = [], annotations = []) =>
        set({
          editingSparkId: sparkId,
          editingSparkContent: content,
          editingSparkSelections: selections,
          linkedAnnotationIds: annotations
        }),

      // NEW - Phase 6b: Manage linked annotations for spark
      addLinkedAnnotation: (annotationId) => {
        const current = get().linkedAnnotationIds
        if (!current.includes(annotationId)) {
          set({ linkedAnnotationIds: [...current, annotationId] })
        }
      },

      removeLinkedAnnotation: (annotationId) => {
        set({
          linkedAnnotationIds: get().linkedAnnotationIds.filter(id => id !== annotationId)
        })
      },

      clearLinkedAnnotations: () =>
        set({ linkedAnnotationIds: [] }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarCollapsed: state.sidebarCollapsed,
        activeTab: state.activeTab,
        leftPanelOpen: state.leftPanelOpen,
        leftPanelCollapsed: state.leftPanelCollapsed,
        leftPanelTab: state.leftPanelTab,
        showChunkBoundaries: state.showChunkBoundaries,
        showHeatmap: state.showHeatmap,
        // Don't persist expanded states, quickCaptureOpen, activeAnnotation, or documentHeaderHeight
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset transient UI states on hydration
          state.expandedConnections = new Set()
          state.expandedAnnotations = new Set()
          state.quickCaptureOpen = false
          state.activeAnnotation = null
          state.sparkCaptureOpen = false
          state.pendingAnnotationSelection = null
          state.editingSparkId = null
          state.editingSparkContent = null
          state.editingSparkSelections = []
          state.linkedAnnotationIds = []  // NEW - Phase 6b
          state.documentHeaderHeight = 78 // Reset to default, will be updated by ResizeObserver
        }
      },
    }
  )
)
