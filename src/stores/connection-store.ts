import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SynthesisEngine } from '@/types/annotations'

interface EngineWeights {
  semantic_similarity: number
  thematic_bridge: number
  contradiction_detection: number
}

interface Connection {
  id: string
  source_chunk_id: string
  target_chunk_id: string
  connection_type: SynthesisEngine
  strength: number
  metadata: {
    explanation?: string
    target_document_title?: string
    target_snippet?: string
    [key: string]: unknown
  }
}

export type PresetName = 'balanced' | 'max-friction' | 'thematic-focus' | 'semantic-only'

interface ConnectionState {
  // Engine weights (personal tuning)
  weights: EngineWeights

  // Connection filtering
  enabledEngines: Set<SynthesisEngine>
  strengthThreshold: number

  // Active connections for visible chunks
  connections: Connection[]
  filteredConnections: Connection[]

  // Actions
  setWeight: (engine: keyof EngineWeights, value: number) => void
  setWeights: (weights: EngineWeights) => void
  normalizeWeights: () => void
  toggleEngine: (engine: SynthesisEngine) => void
  setStrengthThreshold: (threshold: number) => void
  setConnections: (connections: Connection[]) => void
  applyFilters: () => void
  scoreConnection: (conn: Connection) => number
  applyPreset: (preset: PresetName) => void
}

const DEFAULT_WEIGHTS: EngineWeights = {
  semantic_similarity: 0.25,
  thematic_bridge: 0.35,
  contradiction_detection: 0.40,
}

const PRESETS: Record<PresetName, EngineWeights> = {
  balanced: {
    semantic_similarity: 0.25,
    thematic_bridge: 0.35,
    contradiction_detection: 0.40,
  },
  'max-friction': {
    semantic_similarity: 0.10,
    thematic_bridge: 0.20,
    contradiction_detection: 0.70,
  },
  'thematic-focus': {
    semantic_similarity: 0.15,
    thematic_bridge: 0.70,
    contradiction_detection: 0.15,
  },
  'semantic-only': {
    semantic_similarity: 1.00,
    thematic_bridge: 0.00,
    contradiction_detection: 0.00,
  },
}

/**
 * Connection store - manages engine weights, filtering, and connection scoring.
 * Separate from UI state and annotation state.
 */
export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      // Initial state
      weights: DEFAULT_WEIGHTS,
      enabledEngines: new Set([
        'semantic_similarity',
        'thematic_bridge',
        'contradiction_detection',
      ]),
      strengthThreshold: 0.5,
      connections: [],
      filteredConnections: [],

      // Update a single weight
      setWeight: (engine, value) => {
        set((state) => ({
          weights: {
            ...state.weights,
            [engine]: Math.max(0, Math.min(1, value)),
          },
        }))
        get().normalizeWeights()
        get().applyFilters()
      },

      // Set all weights at once
      setWeights: (weights) => {
        set({ weights })
        get().normalizeWeights()
        get().applyFilters()
      },

      // Ensure weights sum to 1.0
      normalizeWeights: () => {
        const weights = get().weights
        const total = Object.values(weights).reduce((a, b) => a + b, 0)

        if (total === 0) {
          set({ weights: DEFAULT_WEIGHTS })
          return
        }

        const normalized = Object.fromEntries(
          Object.entries(weights).map(([k, v]) => [k, v / total])
        ) as unknown as EngineWeights

        set({ weights: normalized })
      },

      // Toggle engine visibility
      toggleEngine: (engine) => {
        set((state) => {
          const newSet = new Set(state.enabledEngines)
          if (newSet.has(engine)) {
            newSet.delete(engine)
          } else {
            newSet.add(engine)
          }
          return { enabledEngines: newSet }
        })
        get().applyFilters()
      },

      // Update strength threshold
      setStrengthThreshold: (threshold) => {
        set({ strengthThreshold: Math.max(0, Math.min(1, threshold)) })
        get().applyFilters()
      },

      // Load new connections (from visible chunks)
      setConnections: (connections) => {
        set({ connections })
        get().applyFilters()
      },

      // Re-filter and re-score connections
      applyFilters: () => {
        const { connections, enabledEngines, strengthThreshold, scoreConnection } = get()

        const filtered = connections
          .filter((c) => enabledEngines.has(c.connection_type))
          .map((c) => ({ ...c, finalScore: scoreConnection(c) }))
          .filter((c) => c.finalScore >= strengthThreshold)
          .sort((a, b) => b.finalScore - a.finalScore)

        // Deduplicate: Keep only highest-scoring connection per target chunk
        const targetMap = new Map()
        filtered.forEach(c => {
          const existing = targetMap.get(c.target_chunk_id)
          if (!existing || c.finalScore > existing.finalScore) {
            targetMap.set(c.target_chunk_id, c)
          }
        })

        set({ filteredConnections: Array.from(targetMap.values()) })
      },

      // Score a connection using personal weights
      scoreConnection: (conn) => {
        const weights = get().weights
        const typeWeight = weights[conn.connection_type]
        return conn.strength * typeWeight
      },

      // Apply a preset weight configuration
      applyPreset: (preset) => {
        const presetWeights = PRESETS[preset]
        if (!presetWeights) {
          console.error(`[ConnectionStore] Unknown preset: ${preset}`)
          return
        }

        set({ weights: presetWeights })
        get().applyFilters()
      },
    }),
    {
      name: 'connection-storage',
      partialize: (state) => ({
        weights: state.weights,
        enabledEngines: Array.from(state.enabledEngines),
        strengthThreshold: state.strengthThreshold,
      }),
      // Deserialize Set from array
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.enabledEngines)) {
          state.enabledEngines = new Set(state.enabledEngines)
        }
      },
    }
  )
)
