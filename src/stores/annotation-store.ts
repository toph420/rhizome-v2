import { create } from 'zustand'
import type { StoredAnnotation, TextSelection } from '@/types/annotations'
import { getAnnotations } from '@/app/actions/annotations'

/**
 * Annotation store state.
 * Handles ONLY annotation data - text selection and annotation CRUD.
 * UI state (quickCaptureOpen, activeAnnotation) moved to UIStore.
 * Weights/filtering in ConnectionStore.
 */
interface AnnotationState {
  // Text selection (temporary state during annotation creation)
  selectedText: TextSelection | null
  setSelectedText: (selection: TextSelection | null) => void

  // Annotations per document (keyed by documentId)
  annotations: Record<string, StoredAnnotation[]>
  loadingStates: Record<string, boolean>  // NEW: Per-document loading state
  setAnnotations: (documentId: string, annotations: StoredAnnotation[]) => void
  loadAnnotations: (documentId: string) => Promise<void>  // NEW: Async loader
  isLoading: (documentId: string) => boolean  // NEW: Helper to check loading state
  addAnnotation: (documentId: string, annotation: StoredAnnotation) => void
  updateAnnotation: (documentId: string, annotationId: string, updates: Partial<StoredAnnotation>) => void
  removeAnnotation: (documentId: string, annotationId: string) => void
}

/**
 * Zustand store for annotation data.
 * Manages text selection and annotation CRUD operations.
 * UI state moved to UIStore, connection weights in ConnectionStore.
 */
export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  // Text selection state (temporary during annotation creation)
  selectedText: null,
  /**
   * Sets the current text selection.
   * @param selection - TextSelection object or null if no selection.
   * @returns {void}
   */
  setSelectedText: (selection) =>
    set({ selectedText: selection }),

  // Annotations state (keyed by documentId for isolation)
  annotations: {},
  loadingStates: {},  // NEW: Track loading per document
  /**
   * Sets all annotations for a document.
   * @param documentId - Document identifier.
   * @param annotations - Complete array of annotations.
   * @returns {void}
   */
  setAnnotations: (documentId, annotations) =>
    set((state) => ({
      annotations: { ...state.annotations, [documentId]: annotations }
    })),

  /**
   * Loads annotations for a document from the server.
   * Prevents duplicate loads and manages loading state.
   * @param documentId - Document identifier.
   * @returns {Promise<void>}
   */
  loadAnnotations: async (documentId) => {
    // Prevent duplicate loads
    if (get().loadingStates[documentId]) {
      console.log(`[AnnotationStore] Already loading annotations for ${documentId}`)
      return
    }

    // Set loading state
    set(state => ({
      loadingStates: { ...state.loadingStates, [documentId]: true }
    }))

    try {
      console.log(`[AnnotationStore] Loading annotations for ${documentId}`)
      const result = await getAnnotations(documentId)

      set(state => ({
        annotations: { ...state.annotations, [documentId]: result },
        loadingStates: { ...state.loadingStates, [documentId]: false }
      }))

      console.log(`[AnnotationStore] Loaded ${result.length} annotations for ${documentId}`)
    } catch (error) {
      console.error('[AnnotationStore] Load failed:', error)
      set(state => ({
        loadingStates: { ...state.loadingStates, [documentId]: false }
      }))
    }
  },

  /**
   * Checks if annotations are currently loading for a document.
   * @param documentId - Document identifier.
   * @returns {boolean} True if loading, false otherwise.
   */
  isLoading: (documentId) => get().loadingStates[documentId] || false,
  /**
   * Adds a new annotation to a document.
   * Prevents duplicates by checking if annotation ID already exists.
   * @param documentId - Document identifier.
   * @param annotation - Annotation to add.
   * @returns {void}
   */
  addAnnotation: (documentId, annotation) =>
    set((state) => {
      const existingAnnotations = state.annotations[documentId] || []

      // Check if annotation already exists (prevent duplicates)
      const exists = existingAnnotations.some(ann => ann.id === annotation.id)

      if (exists) {
        console.warn(`[AnnotationStore] Duplicate annotation prevented: ${annotation.id}`)
        return state // Return unchanged state
      }

      return {
        annotations: {
          ...state.annotations,
          [documentId]: [...existingAnnotations, annotation]
        }
      }
    }),
  /**
   * Updates an existing annotation.
   * @param documentId - Document identifier.
   * @param annotationId - Annotation ID to update.
   * @param updates - Partial annotation updates.
   * @returns {void}
   */
  updateAnnotation: (documentId, annotationId, updates) =>
    set((state) => {
      console.log('[AnnotationStore] updateAnnotation called:', {
        annotationId: annotationId.substring(0, 8),
        newColor: updates.components?.Visual?.color,
        existingAnnotation: state.annotations[documentId]?.find(a => a.id === annotationId)?.components.Visual?.color
      })

      return {
        annotations: {
          ...state.annotations,
          [documentId]: state.annotations[documentId]?.map(ann =>
            ann.id === annotationId ? { ...ann, ...updates } : ann
          ) || []
        }
      }
    }),
  /**
   * Removes an annotation from a document.
   * @param documentId - Document identifier.
   * @param annotationId - Annotation ID to remove.
   * @returns {void}
   */
  removeAnnotation: (documentId, annotationId) =>
    set((state) => ({
      annotations: {
        ...state.annotations,
        [documentId]: state.annotations[documentId]?.filter(ann =>
          ann.id !== annotationId
        ) || []
      }
    })),
}))