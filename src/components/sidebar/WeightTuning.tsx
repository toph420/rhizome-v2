'use client'

import { Slider } from '@/components/rhizome/slider'
import { Label } from '@/components/rhizome/label'
import { Button } from '@/components/rhizome/button'
import { Separator } from '@/components/ui/separator'
import { useConnectionStore } from '@/stores/connection-store'
import type { EngineWeights } from '@/types/annotations'

const ENGINE_LABELS: Record<keyof EngineWeights, string> = {
  semantic_similarity: 'Semantic Similarity',
  thematic_bridge: 'Thematic Bridges',
  contradiction_detection: 'Contradictions',
}

const ENGINE_DESCRIPTIONS: Record<keyof EngineWeights, string> = {
  semantic_similarity: 'Embedding-based matching (fast, baseline)',
  thematic_bridge: 'AI-powered cross-domain connections',
  contradiction_detection: 'Opposing viewpoints and tensions',
}

/**
 * Weight tuning interface for connection synthesis engines.
 * Provides 3 weight sliders (0.0-1.0) and 4 preset configurations.
 * Triggers real-time connection re-ranking via Zustand store.
 * @returns React element with weight sliders and preset buttons.
 */
export function WeightTuning() {
  const weights = useConnectionStore(state => state.weights)
  const setWeight = useConnectionStore(state => state.setWeight)
  const applyPreset = useConnectionStore(state => state.applyPreset)

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold">Engine Weights</h3>

      {/* Weight Sliders */}
      {(Object.entries(weights) as [keyof EngineWeights, number][]).map(
        ([engine, value]) => (
          <div key={engine} className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor={`weight-${engine}`}>
                {ENGINE_LABELS[engine]}
              </Label>
              <span className="text-sm text-muted-foreground font-mono">
                {value.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {ENGINE_DESCRIPTIONS[engine]}
            </p>
            <Slider
              id={`weight-${engine}`}
              value={[value]}
              onValueChange={([newValue]) => setWeight(engine, newValue)}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
          </div>
        )
      )}

      <Separator />

      {/* Preset Buttons */}
      <div className="space-y-2">
        <Label>Presets</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="neutral"
            size="sm"
            onClick={() => applyPreset('max-friction')}
          >
            Max Friction
          </Button>
          <Button
            variant="neutral"
            size="sm"
            onClick={() => applyPreset('thematic-focus')}
          >
            Thematic Focus
          </Button>
          <Button
            variant="neutral"
            size="sm"
            onClick={() => applyPreset('balanced')}
          >
            Balanced
          </Button>
          <Button
            variant="neutral"
            size="sm"
            onClick={() => applyPreset('semantic-only')}
          >
            Semantic Only
          </Button>
        </div>
      </div>
    </div>
  )
}