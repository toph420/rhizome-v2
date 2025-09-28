'use client'

import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAnnotationStore } from '@/stores/annotation-store'
import type { EngineWeights } from '@/types/annotations'

const ENGINE_LABELS: Record<keyof EngineWeights, string> = {
  semantic: 'Semantic',
  thematic: 'Thematic',
  structural: 'Structural',
  contradiction: 'Contradiction',
  emotional: 'Emotional',
  methodological: 'Methodological',
  temporal: 'Temporal',
}

/**
 * Weight tuning interface for connection synthesis engines.
 * Provides 7 weight sliders (0.0-1.0) and 4 preset configurations.
 * Triggers real-time connection re-ranking via Zustand store.
 * @returns React element with weight sliders and preset buttons.
 */
export function WeightTuning() {
  const { weights, setWeight, applyPreset } = useAnnotationStore()

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
            variant="outline"
            size="sm"
            onClick={() => applyPreset('max-friction')}
          >
            Max Friction
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('thematic-focus')}
          >
            Thematic Focus
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('balanced')}
          >
            Balanced
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => applyPreset('chaos')}
          >
            Chaos
          </Button>
        </div>
      </div>
    </div>
  )
}