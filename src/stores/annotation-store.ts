import { create } from 'zustand'
import type { StoredAnnotation, TextSelection } from '@/types/annotations'

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
  setAnnotations: (documentId: string, annotations: StoredAnnotation[]) => void
  addAnnotation: (documentId: string, annotation: StoredAnnotation) => void
  updateAnnotation: (documentId: string, annotationId: string, updates: Partial<StoredAnnotation>) => void
  removeAnnotation: (documentId: string, annotationId: string) => void
}

/**
 * Zustand store for annotation data.
 * Manages text selection and annotation CRUD operations.
 * UI state moved to UIStore, connection weights in ConnectionStore.
 */
export const useAnnotationStore = create<AnnotationState>((set) => ({
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
        newColor: updates.components?.annotation?.color,
        existingAnnotation: state.annotations[documentId]?.find(a => a.id === annotationId)?.components.annotation?.color
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