import { create } from 'zustand'
import type {
  StoredAnnotation,
  TextSelection,
  EngineWeights,
  WeightPreset,
  SynthesisEngine,
} from '@/types/annotations'

/**
 * Weight presets for connection synthesis (from APP_VISION.md).
 */
const WEIGHT_PRESETS: Record<WeightPreset, EngineWeights> = {
  'max-friction': {
    semantic: 0.3,
    thematic: 0.9,
    structural: 0.7,
    contradiction: 1.0,
    emotional: 0.4,
    methodological: 0.8,
    temporal: 0.2,
  },
  'thematic-focus': {
    semantic: 0.4,
    thematic: 1.0,
    structural: 0.5,
    contradiction: 0.6,
    emotional: 0.3,
    methodological: 0.7,
    temporal: 0.2,
  },
  'balanced': {
    semantic: 0.5,
    thematic: 0.5,
    structural: 0.5,
    contradiction: 0.5,
    emotional: 0.5,
    methodological: 0.5,
    temporal: 0.5,
  },
  'chaos': {
    semantic: 0.8,
    thematic: 0.8,
    structural: 0.8,
    contradiction: 0.8,
    emotional: 0.8,
    methodological: 0.8,
    temporal: 0.8,
  },
}

/**
 * Annotation store state.
 */
interface AnnotationState {
  // Active annotation
  activeAnnotation: StoredAnnotation | null
  setActiveAnnotation: (annotation: StoredAnnotation | null) => void

  // Text selection
  selectedText: TextSelection | null
  setSelectedText: (selection: TextSelection | null) => void

  // Quick Capture panel
  quickCaptureOpen: boolean
  openQuickCapture: () => void
  closeQuickCapture: () => void

  // Engine weights (for tuning)
  weights: EngineWeights
  setWeight: (engine: keyof EngineWeights, value: number) => void
  setWeights: (weights: EngineWeights) => void
  applyPreset: (preset: WeightPreset) => void

  // Connection filtering
  strengthThreshold: number
  setStrengthThreshold: (threshold: number) => void
  enabledEngines: Set<SynthesisEngine>
  toggleEngine: (engine: SynthesisEngine) => void
}

/**
 * Zustand store for annotation state and connection weight tuning.
 * Manages active annotations, text selection, and synthesis engine configuration.
 */
export const useAnnotationStore = create<AnnotationState>((set) => ({
  // Active annotation state
  activeAnnotation: null,
  /**
   * Sets the active annotation for editing/viewing.
   * @param annotation - Annotation to set as active, or null to clear.
   * @returns {void}
   */
  setActiveAnnotation: (annotation) =>
    set({ activeAnnotation: annotation }),

  // Text selection state
  selectedText: null,
  /**
   * Sets the current text selection.
   * @param selection - TextSelection object or null if no selection.
   * @returns {void}
   */
  setSelectedText: (selection) =>
    set({ selectedText: selection }),

  // Quick Capture panel state
  quickCaptureOpen: false,
  /**
   * Opens the Quick Capture panel.
   * @returns {void}
   */
  openQuickCapture: () =>
    set({ quickCaptureOpen: true }),
  /**
   * Closes the Quick Capture panel and clears selection.
   * @returns {void}
   */
  closeQuickCapture: () =>
    set({ quickCaptureOpen: false, selectedText: null }),

  // Engine weights (default to max-friction preset)
  weights: WEIGHT_PRESETS['max-friction'],
  /**
   * Updates a single engine weight.
   * @param engine - Engine name to update.
   * @param value - Weight value (0.0-1.0).
   * @returns {void}
   */
  setWeight: (engine, value) =>
    set((state) => ({
      weights: {
        ...state.weights,
        [engine]: Math.max(0, Math.min(1, value)),
      },
    })),
  /**
   * Sets all engine weights at once.
   * @param weights - Complete EngineWeights object.
   * @returns {void}
   */
  setWeights: (weights) =>
    set({ weights }),
  /**
   * Applies a weight preset configuration.
   * @param preset - Preset name to apply.
   * @returns {void}
   */
  applyPreset: (preset) =>
    set({ weights: WEIGHT_PRESETS[preset] }),

  // Connection filtering state
  strengthThreshold: 0.5,
  /**
   * Sets the minimum connection strength threshold.
   * @param threshold - Strength threshold (0.0-1.0).
   * @returns {void}
   */
  setStrengthThreshold: (threshold) =>
    set({ strengthThreshold: Math.max(0, Math.min(1, threshold)) }),

  enabledEngines: new Set([
    'semantic',
    'thematic',
    'structural',
    'contradiction',
    'emotional',
    'methodological',
    'temporal',
  ]),
  /**
   * Toggles an engine on/off in the enabled set.
   * @param engine - Engine to toggle.
   * @returns {void}
   */
  toggleEngine: (engine) =>
    set((state) => {
      const newSet = new Set(state.enabledEngines)
      if (newSet.has(engine)) {
        newSet.delete(engine)
      } else {
        newSet.add(engine)
      }
      return { enabledEngines: newSet }
    }),
}))